import { createHmac, timingSafeEqual } from "node:crypto";

// Verifikasi webhook dan parsing perintah bot. Fungsi murni.

/** Toleransi waktu tanda tangan webhook (mencegah replay). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifikasi tanda tangan Svix (dipakai webhook Resend).
 * signed = "<svix-id>.<svix-timestamp>.<body>", HMAC-SHA256 dengan secret
 * base64 setelah awalan "whsec_". Header berisi satu atau lebih "v1,<sig>".
 */
export function verifySvixSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now: Date;
}): boolean {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(input.now.getTime() / 1000 - Number(timestamp));
  if (age > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const actual = Buffer.from(value, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "/start <token>" (juga "/start@NamaBot <token>") -> token. */
export function parseStartCommand(text: string | undefined): string | null {
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})\s*$/.exec(text?.trim() ?? "");
  return match?.[1] ?? null;
}

export function isStopCommand(text: string | undefined): boolean {
  return /^\/(?:stop|berhenti)(?:@\w+)?\s*$/.test(text?.trim() ?? "");
}
