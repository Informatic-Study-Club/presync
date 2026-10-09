// Kode ID anggota: "ISC" + 2 digit tahun + 2 digit batch + 3 digit urutan.
// Contoh: ISC2601009. Aturan lengkap: docs/ARSITEKTUR.md bagian 6.

export const MEMBER_CODE_PATTERN = /^ISC(\d{2})(\d{2})(\d{3})$/;
export const MAX_SEQ = 999;

export type MemberCodeParts = {
  /** Dua digit tahun, misalnya "26". */
  year: string;
  /** Dua digit batch, misalnya "01". */
  batch: string;
  /** Nomor urut 1-999. */
  seq: number;
};

export function parseMemberCode(code: string): MemberCodeParts | null {
  const match = MEMBER_CODE_PATTERN.exec(code);
  if (!match) return null;
  const [, year, batch, seqText] = match;
  const seq = Number(seqText);
  if (!year || !batch || seq < 1) return null;
  return { year, batch, seq };
}

export function isValidMemberCode(code: string): boolean {
  return parseMemberCode(code) !== null;
}

export function formatMemberCode({ year, batch, seq }: MemberCodeParts): string {
  if (!/^\d{2}$/.test(year)) throw new RangeError(`Tahun harus 2 digit: ${year}`);
  if (!/^\d{2}$/.test(batch)) throw new RangeError(`Batch harus 2 digit: ${batch}`);
  if (!Number.isInteger(seq) || seq < 1 || seq > MAX_SEQ) {
    throw new RangeError(`Nomor urut harus 1-${MAX_SEQ}: ${seq}`);
  }
  return `ISC${year}${batch}${String(seq).padStart(3, "0")}`;
}

/** Dua digit tahun dari tanggal, dalam zona Asia/Jakarta. */
export function yearDigits(date: Date): string {
  const year = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "2-digit",
  }).format(date);
  return year.padStart(2, "0");
}
