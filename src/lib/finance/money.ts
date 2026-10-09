// Nominal rupiah sebagai bilangan bulat (aturan wajib 6).

export const MAX_AMOUNT = 1_000_000_000; // 1 miliar, batas wajar kas organisasi

const formatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: number): string {
  return formatter.format(amount);
}

/**
 * "50.000", "Rp 50.000", "50000" -> 50000. Desimal ("50.000,50"), angka
 * negatif, dan nilai di luar batas ditolak (null).
 */
export function parseRupiah(input: string): number | null {
  const cleaned = input.replace(/rp/gi, "").replace(/[\s.]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_AMOUNT) return null;
  return value;
}
