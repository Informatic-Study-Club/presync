import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// Akun dan password uji dari scripts/seed-dummy.ts (hanya Supabase lokal).
export const TEST_PASSWORD = "presync-lokal-2026";
export const ADMIN_EMAIL = "admin@presync.test";
export const MEMBER_EMAIL = "anggota01@presync.test";
export const ADMIN_STATE = "e2e/.auth/admin.json";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Kode TOTP RFC 6238 (SHA-1, 6 digit, 30 detik), pengganti aplikasi autentikator. */
export function totp(secret: string, now = Date.now()): string {
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) {
    bits += BASE32.indexOf(c).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Kode TOTP yang masih berlaku minimal beberapa detik saat dikirim. */
export async function freshTotp(secret: string): Promise<string> {
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remaining < 5) await new Promise((r) => setTimeout(r, remaining * 1000 + 500));
  return totp(secret);
}

/** Login lewat formulir, menunggu token Turnstile (kunci uji selalu lolos). */
export async function login(page: Page, email: string) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await expect(page.locator('input[name="cf-turnstile-response"]')).not.toHaveValue("", { timeout: 30_000 });
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL((url) => url.pathname !== "/masuk", { timeout: 30_000 });
}
