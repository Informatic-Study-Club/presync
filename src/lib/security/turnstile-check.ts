// Keputusan hasil siteverify Turnstile sebagai fungsi murni (dites di
// turnstile-check.test.ts). Server Presync menerima token hanya bila
// Cloudflare menyatakan sukses, action cocok dengan formulirnya, dan hostname
// termasuk domain Presync. Dengan begitu token dari formulir lain atau situs
// lain tidak bisa dipakai ulang.

export const TURNSTILE_ACTIONS = ["login", "lupa-password"] as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number];

/** Batas panjang token sesuai dokumentasi Cloudflare. */
export const MAX_TOKEN_LENGTH = 2048;

/** Secret uji resmi Cloudflare: hasilnya selalu sukses dengan action/hostname palsu. */
export function isTestSecret(secret: string): boolean {
  return /^[123]x0{10,}/.test(secret);
}

export type SiteverifyResult = { success: boolean; action?: string; hostname?: string };

/** Hostname yang boleh menerbitkan token: domain APP_URL, plus localhost di luar production. */
export function allowedHostnames(appUrl: string, production: boolean): string[] {
  const hosts = [new URL(appUrl).hostname];
  if (!production) hosts.push("localhost", "127.0.0.1");
  return hosts;
}

export function isTurnstileValid(
  result: SiteverifyResult,
  expected: { action: TurnstileAction; hostnames: readonly string[]; testSecret: boolean },
): boolean {
  if (!result.success) return false;
  if (expected.testSecret) return true;
  return result.action === expected.action && !!result.hostname && expected.hostnames.includes(result.hostname);
}
