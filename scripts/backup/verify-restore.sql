-- Pemeriksaan hasil pemulihan cadangan. Gagal (exit code bukan 0 dengan
-- psql -v ON_ERROR_STOP=1) bila ada yang tidak sesuai.

-- 1. Tabel inti ada dan RLS aktif di semua tabel public.
DO $$
DECLARE
  missing text;
  no_rls text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['members', 'divisions', 'sessions', 'attendance', 'transactions', 'invoices', 'audit_log']) AS t
  WHERE to_regclass('public.' || t) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Tabel hilang setelah pemulihan: %', missing; END IF;

  SELECT string_agg(tablename, ', ') INTO no_rls FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  IF no_rls IS NOT NULL THEN RAISE EXCEPTION 'RLS tidak aktif: %', no_rls; END IF;
END $$;

-- 2. Ledger tetap hanya-tambah setelah dipulihkan (trigger ikut terbawa).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transactions_append_only') THEN
    RAISE EXCEPTION 'Trigger transactions_append_only tidak ada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transactions_no_truncate') THEN
    RAISE EXCEPTION 'Trigger transactions_no_truncate tidak ada';
  END IF;
END $$;

-- 3. Constraint kustom ikut terbawa.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_regular_on_thursday') THEN
    RAISE EXCEPTION 'CHECK sessions_regular_on_thursday tidak ada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_no_overlap') THEN
    RAISE EXCEPTION 'Exclusion constraint sessions_no_overlap tidak ada';
  END IF;
END $$;

-- 4. View saldo bisa dibaca dan konsisten dengan ledger.
DO $$
DECLARE
  view_balance bigint;
  ledger_balance bigint;
BEGIN
  SELECT balance INTO view_balance FROM finance_balance;
  SELECT coalesce(sum(CASE WHEN kind = 'income' THEN amount ELSE -amount END), 0) INTO ledger_balance FROM transactions;
  IF view_balance IS DISTINCT FROM ledger_balance THEN
    RAISE EXCEPTION 'Saldo view (%) berbeda dari ledger (%)', view_balance, ledger_balance;
  END IF;
END $$;

-- 5. Setiap anggota punya baris auth.users (FK), dan ringkasan isi untuk log.
SELECT 'anggota' AS data, count(*) AS jumlah FROM members
UNION ALL SELECT 'akun auth', count(*) FROM auth.users
UNION ALL SELECT 'sesi', count(*) FROM sessions
UNION ALL SELECT 'presensi', count(*) FROM attendance
UNION ALL SELECT 'transaksi kas', count(*) FROM transactions
UNION ALL SELECT 'audit log', count(*) FROM audit_log;
