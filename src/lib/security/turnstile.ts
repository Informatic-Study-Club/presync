import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const responseSchema = z.object({ success: z.boolean() });

/** Verifikasi token Cloudflare Turnstile di server. */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({
    secret: serverEnv().TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip !== "unknown") body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const parsed = responseSchema.safeParse(await res.json());
    return parsed.success && parsed.data.success;
  } catch {
    return false;
  }
}
