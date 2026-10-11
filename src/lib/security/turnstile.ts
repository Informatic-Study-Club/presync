import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  allowedHostnames,
  isTestSecret,
  isTurnstileValid,
  MAX_TOKEN_LENGTH,
  type TurnstileAction,
} from "./turnstile-check";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const responseSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
});

/**
 * Verifikasi token Cloudflare Turnstile di server: sukses, action sesuai
 * formulir, dan hostname milik Presync (lihat turnstile-check.ts).
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
  action: TurnstileAction,
): Promise<boolean> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;
  const env = serverEnv();
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const parsed = responseSchema.safeParse(await res.json());
    if (!parsed.success) return false;
    return isTurnstileValid(parsed.data, {
      action,
      hostnames: allowedHostnames(env.APP_URL, process.env.NODE_ENV === "production"),
      testSecret: isTestSecret(env.TURNSTILE_SECRET_KEY),
    });
  } catch {
    return false;
  }
}
