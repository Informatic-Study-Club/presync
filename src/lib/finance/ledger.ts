// Aturan kas sebagai fungsi murni: tagihan dari jadwal iuran, laporan bulanan,
// dan koreksi ledger (docs/ARSITEKTUR.md bagian 11).

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const ONCE_PERIOD = "sekali";

export function isMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- tagihan

export type FeeSchedule = {
  id: string;
  name: string;
  amount: number;
  period: "monthly" | "once";
  dueDay: number | null;
  dueOn: string | null;
  divisionId: string | null;
  batch: string | null;
};

export type BillableMember = { id: string; divisionId: string; batch: string; status: "aktif" | "nonaktif" | "alumni" };

export type PlannedInvoice = {
  memberId: string;
  period: string;
  title: string;
  amount: number;
  dueOn: string;
};

/**
 * Tagihan yang perlu dibuat untuk satu jadwal iuran dan satu bulan. Anggota
 * nonaktif/alumni dan anggota di luar cakupan dilewati, begitu juga anggota
 * yang sudah punya tagihan untuk periode itu.
 */
export function planInvoices(
  schedule: FeeSchedule,
  month: string,
  members: readonly BillableMember[],
  alreadyBilled: ReadonlySet<string>,
): PlannedInvoice[] {
  if (!isMonth(month)) throw new RangeError(`Bulan tidak valid: ${month}`);
  const period = schedule.period === "monthly" ? month : ONCE_PERIOD;
  const dueOn =
    schedule.period === "monthly"
      ? `${month}-${String(schedule.dueDay ?? 10).padStart(2, "0")}`
      : (schedule.dueOn as string);
  const title = schedule.period === "monthly" ? `${schedule.name} ${month}` : schedule.name;

  return members
    .filter(
      (m) =>
        m.status === "aktif" &&
        (schedule.divisionId === null || m.divisionId === schedule.divisionId) &&
        (schedule.batch === null || m.batch === schedule.batch) &&
        !alreadyBilled.has(m.id),
    )
    .map((m) => ({ memberId: m.id, period, title, amount: schedule.amount, dueOn }));
}

// ---------------------------------------------------------------- laporan bulanan

export type LedgerEntry = {
  id: string;
  occurredOn: string;
  kind: "income" | "expense";
  amount: number;
  reversalOf: string | null;
};

export type MonthlyStatement = {
  month: string;
  opening: number;
  income: number;
  expense: number;
  closing: number;
  entries: number;
};

function signed(e: LedgerEntry): number {
  return e.kind === "income" ? e.amount : -e.amount;
}

/** Saldo awal, pemasukan, pengeluaran, dan saldo akhir satu bulan. */
export function monthlyStatement(entries: readonly LedgerEntry[], month: string): MonthlyStatement {
  if (!isMonth(month)) throw new RangeError(`Bulan tidak valid: ${month}`);
  let opening = 0;
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const e of entries) {
    const m = monthOf(e.occurredOn);
    if (m < month) opening += signed(e);
    else if (m === month) {
      count++;
      if (e.kind === "income") income += e.amount;
      else expense += e.amount;
    }
  }
  return { month, opening, income, expense, closing: opening + income - expense, entries: count };
}

export function balanceOf(entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + signed(e), 0);
}

// ---------------------------------------------------------------- koreksi

export type ReversalCheck =
  | { ok: true; kind: "income" | "expense" }
  | { ok: false; reason: "is_reversal" | "already_reversed" | "closed_month" };

/**
 * Transaksi koreksi berjenis kebalikan dengan nominal sama. Koreksi tidak bisa
 * dikoreksi lagi, satu transaksi hanya sekali dikoreksi, dan koreksi
 * dibukukan pada tanggal yang bulannya belum ditutup.
 */
export function checkReversal(
  target: LedgerEntry,
  reversedIds: ReadonlySet<string>,
  reversalDate: string,
  closedMonths: ReadonlySet<string>,
): ReversalCheck {
  if (target.reversalOf !== null) return { ok: false, reason: "is_reversal" };
  if (reversedIds.has(target.id)) return { ok: false, reason: "already_reversed" };
  if (closedMonths.has(monthOf(reversalDate))) return { ok: false, reason: "closed_month" };
  return { ok: true, kind: target.kind === "income" ? "expense" : "income" };
}

/** Bulan boleh ditutup hanya bila bulan sebelumnya sudah ditutup atau kosong. */
export function canCloseMonth(
  month: string,
  closedMonths: ReadonlySet<string>,
  firstLedgerMonth: string | null,
  currentMonth: string,
): { ok: true } | { ok: false; reason: "already_closed" | "previous_open" | "future_month" } {
  if (closedMonths.has(month)) return { ok: false, reason: "already_closed" };
  if (month > currentMonth) return { ok: false, reason: "future_month" };
  const previous = previousMonth(month);
  if (firstLedgerMonth !== null && previous >= firstLedgerMonth && !closedMonths.has(previous)) {
    return { ok: false, reason: "previous_open" };
  }
  return { ok: true };
}
