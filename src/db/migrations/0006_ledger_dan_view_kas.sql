-- Migrasi kustom kas (docs/ARSITEKTUR.md bagian 11, aturan wajib 6).

-- 1. Ledger hanya-tambah: tolak UPDATE, DELETE, dan TRUNCATE pada transactions.
--    Koreksi dibuat sebagai transaksi baru dengan reversal_of.
CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transactions bersifat hanya-tambah; buat transaksi koreksi (reversal_of)';
END; $$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER transactions_append_only
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();--> statement-breakpoint

CREATE TRIGGER transactions_no_truncate
  BEFORE TRUNCATE ON transactions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_ledger_mutation();--> statement-breakpoint

-- 2. View saldo dan rekap. security_invoker = true supaya view mengikuti RLS
--    tabel asalnya (tanpa policy = API publik Supabase tidak bisa membaca),
--    dan hak SELECT untuk anon/authenticated dicabut sebagai lapisan kedua.
--    Aplikasi membaca view lewat koneksi server (Drizzle), bukan API publik.

-- Saldo keseluruhan. Transaksi koreksi berjenis kebalikan, jadi otomatis
-- menetralkan transaksi yang dikoreksi.
CREATE VIEW finance_balance WITH (security_invoker = true) AS
SELECT
  coalesce(sum(amount) FILTER (WHERE kind = 'income'), 0)::bigint AS total_income,
  coalesce(sum(amount) FILTER (WHERE kind = 'expense'), 0)::bigint AS total_expense,
  (coalesce(sum(amount) FILTER (WHERE kind = 'income'), 0)
   - coalesce(sum(amount) FILTER (WHERE kind = 'expense'), 0))::bigint AS balance
FROM transactions;--> statement-breakpoint

-- Pemasukan dan pengeluaran per bulan (occurred_on adalah tanggal Jakarta).
CREATE VIEW finance_monthly WITH (security_invoker = true) AS
SELECT
  to_char(occurred_on, 'YYYY-MM') AS month,
  coalesce(sum(amount) FILTER (WHERE kind = 'income'), 0)::bigint AS income,
  coalesce(sum(amount) FILTER (WHERE kind = 'expense'), 0)::bigint AS expense
FROM transactions
GROUP BY to_char(occurred_on, 'YYYY-MM');--> statement-breakpoint

-- Tunggakan: tagihan belum lunas (unpaid/pending) yang sudah lewat jatuh tempo
-- menurut tanggal Jakarta.
CREATE VIEW member_arrears WITH (security_invoker = true) AS
SELECT
  member_id,
  count(*)::integer AS invoice_count,
  sum(amount)::bigint AS total_amount,
  min(due_on) AS oldest_due_on
FROM invoices
WHERE status IN ('unpaid', 'pending')
  AND due_on < (now() AT TIME ZONE 'Asia/Jakarta')::date
GROUP BY member_id;--> statement-breakpoint

REVOKE ALL ON finance_balance, finance_monthly, member_arrears FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  -- Peran anon/authenticated hanya ada di Supabase.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON finance_balance, finance_monthly, member_arrears FROM anon, authenticated;
  END IF;
END $$;
