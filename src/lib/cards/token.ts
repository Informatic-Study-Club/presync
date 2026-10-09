import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidMemberCode } from "@/lib/members/member-code";

// Isi barcode/QR kartu anggota (docs/ARSITEKTUR.md bagian 9).
// - Kartu lama: Code 128 berisi kode polos, misalnya "ISC2601009".
// - Kartu pengganti dan "Kartu Saya": QR berisi payload bertanda tangan
//   "v1.<member_code>.<card_version>.<sig>", dengan
//   sig = base64url(HMAC-SHA256(CARD_SECRET, member_code + "." + card_version)).

export const MIN_CARD_SECRET_LENGTH = 32;
const SIGNED_PATTERN = /^v1\.(ISC\d{7})\.([1-9]\d{0,5})\.([A-Za-z0-9_-]{43})$/;

function signature(secret: string, memberCode: string, cardVersion: number): string {
  if (secret.length < MIN_CARD_SECRET_LENGTH) {
    throw new Error(`CARD_SECRET minimal ${MIN_CARD_SECRET_LENGTH} karakter`);
  }
  return createHmac("sha256", secret)
    .update(`${memberCode}.${cardVersion}`)
    .digest("base64url");
}

export function signCardPayload(
  secret: string,
  memberCode: string,
  cardVersion: number,
): string {
  if (!isValidMemberCode(memberCode)) {
    throw new RangeError(`Kode ID tidak valid: ${memberCode}`);
  }
  if (!Number.isInteger(cardVersion) || cardVersion < 1) {
    throw new RangeError(`Versi kartu tidak valid: ${cardVersion}`);
  }
  return `v1.${memberCode}.${cardVersion}.${signature(secret, memberCode, cardVersion)}`;
}

export type ScannedCard =
  | { kind: "legacy"; memberCode: string }
  | { kind: "signed"; memberCode: string; cardVersion: number }
  | { kind: "invalid"; reason: "format" | "signature" };

/**
 * Mengurai string hasil pemindaian. Payload bertanda tangan diverifikasi
 * HMAC-nya di sini; pemeriksaan card_version, legacy_card_allowed, dan status
 * anggota dilakukan pemanggil terhadap data di database.
 */
export function parseScannedCard(input: string, secret: string): ScannedCard {
  const value = input.trim();
  if (isValidMemberCode(value)) return { kind: "legacy", memberCode: value };

  const match = SIGNED_PATTERN.exec(value);
  if (!match) return { kind: "invalid", reason: "format" };
  const [, memberCode, versionText, sig] = match;
  if (!memberCode || !versionText || !sig || !isValidMemberCode(memberCode)) {
    return { kind: "invalid", reason: "format" };
  }

  const cardVersion = Number(versionText);
  const expected = Buffer.from(signature(secret, memberCode, cardVersion));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { kind: "invalid", reason: "signature" };
  }
  return { kind: "signed", memberCode, cardVersion };
}

export type CardBarcode =
  | { symbology: "code128"; text: string }
  | { symbology: "qrcode"; text: string };

/**
 * Format barcode untuk kartu cetak: kode polos Code 128 selama kartu lama
 * masih berlaku, QR bertanda tangan setelah kartu diterbitkan ulang.
 */
export function printedCardBarcode(
  member: { memberCode: string; cardVersion: number; legacyCardAllowed: boolean },
  secret: string | undefined,
): CardBarcode {
  if (member.legacyCardAllowed) {
    return { symbology: "code128", text: member.memberCode };
  }
  if (!secret) throw new Error("CARD_SECRET belum diisi");
  return {
    symbology: "qrcode",
    text: signCardPayload(secret, member.memberCode, member.cardVersion),
  };
}
