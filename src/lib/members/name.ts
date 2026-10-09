// Normalisasi nama anggota (docs/ARSITEKTUR.md bagian 7): trim, gabungkan
// spasi berulang, buang karakter tak terlihat. Huruf kapital tidak diubah.
// Karakter khusus dibangun dari kode Unicode supaya sumber tetap ASCII.

const cp = (code: number) => String.fromCodePoint(code);

// Karakter lebar nol, penanda arah teks, BOM, dan soft hyphen.
const INVISIBLE = new RegExp(
  `[${cp(0x200b)}-${cp(0x200f)}${cp(0x2060)}-${cp(0x2064)}${cp(0xfeff)}${cp(0xad)}]`,
  "g",
);

// Semua jenis spasi, termasuk NBSP (U+00A0) dan narrow NBSP (U+202F).
const ANY_SPACE = new RegExp(
  `[\\s${cp(0xa0)}${cp(0x1680)}${cp(0x2000)}-${cp(0x200a)}${cp(0x2028)}${cp(0x2029)}${cp(0x202f)}${cp(0x205f)}${cp(0x3000)}]+`,
  "g",
);

export function normalizeName(input: string): string {
  return input
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(ANY_SPACE, " ")
    .trim();
}

export type NameCaseHint = "all_upper" | "all_lower" | null;

/** Petunjuk untuk pratinjau impor; nama tidak diubah otomatis. */
export function nameCaseHint(name: string): NameCaseHint {
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return null;
  if (letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return "all_upper";
  }
  if (letters === letters.toLowerCase() && letters !== letters.toUpperCase()) {
    return "all_lower";
  }
  return null;
}
