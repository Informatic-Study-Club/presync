// Normalisasi nomor HP Indonesia ke format +628xxxxxxxxx.
// 08xx -> +628xx, 628xx -> +628xx, 8xx -> +628xx. Spasi, tanda hubung,
// titik, dan kurung dibuang. Hanya nomor seluler (awalan 8) yang diterima.

const MOBILE_E164 = /^\+628\d{8,11}$/;

export function normalizePhone(input: string): string | null {
  const compact = input.normalize("NFKC").replace(/[\s\-.()]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;

  let local: string;
  if (compact.startsWith("+62")) local = compact.slice(3);
  else if (compact.startsWith("62")) local = compact.slice(2);
  else if (compact.startsWith("0")) local = compact.slice(1);
  else if (compact.startsWith("8")) local = compact;
  else return null;

  const result = `+62${local}`;
  return MOBILE_E164.test(result) ? result : null;
}

export function isNormalizedPhone(value: string): boolean {
  return MOBILE_E164.test(value);
}
