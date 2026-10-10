// Model laporan generik (docs/ARSITEKTUR.md bagian 13): satu struktur data,
// dirender ke PDF, XLSX, dan CSV.

export type ColumnType = "text" | "number" | "rupiah" | "percent";

export type ReportColumn = {
  key: string;
  label: string;
  type: ColumnType;
  /** Lebar relatif untuk PDF (bawaan 1). */
  width?: number;
};

export type CellValue = string | number | null;
export type ReportRow = Record<string, CellValue>;

export type Report = {
  /** Nama file tanpa ekstensi. */
  slug: string;
  title: string;
  /** Misalnya "Periode: 2026-10-01 s.d. 2026-10-31". */
  period: string;
  /** Pasangan label/nilai di bawah judul (kelas, divisi, saldo awal, ...). */
  meta: { label: string; value: string }[];
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Baris total (opsional), kunci sama dengan kolom. */
  totals?: ReportRow;
  generatedBy: string;
  generatedAt: Date;
};

export type ReportFormat = "pdf" | "xlsx" | "csv";
export const REPORT_FORMATS: readonly ReportFormat[] = ["pdf", "xlsx", "csv"];

/** Batas baris per laporan supaya tidak melewati batas waktu fungsi serverless. */
export const MAX_REPORT_ROWS = 3000;
/** Batas rentang periode laporan, dalam hari. */
export const MAX_REPORT_DAYS = 366;

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Nilai sel sebagai teks tampilan (PDF). CSV/XLSX memakai nilai mentah. */
export function formatCell(value: CellValue, type: ColumnType): string {
  if (value === null || value === "") return "-";
  if (typeof value === "string") return value;
  switch (type) {
    case "rupiah":
      return rupiah.format(value);
    case "percent":
      return `${number.format(value)}%`;
    default:
      return number.format(value);
  }
}

export const printedAtFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function reportFileName(report: Pick<Report, "slug">, format: ReportFormat): string {
  const safe = report.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${safe || "laporan"}.${format}`;
}

/** Selisih hari inklusif antara dua tanggal "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export type RangeCheck = { ok: true } | { ok: false; reason: "order" | "too_long" };

export function checkRange(from: string, to: string, maxDays = MAX_REPORT_DAYS): RangeCheck {
  const days = daysBetween(from, to);
  if (days < 1) return { ok: false, reason: "order" };
  if (days > maxDays) return { ok: false, reason: "too_long" };
  return { ok: true };
}
