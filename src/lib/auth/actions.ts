"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { id as t } from "@/messages/id";
import { requiresTwoFactor } from "@/lib/authz";
import { getAuthClaims, loadSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/paths";
import { serverEnv } from "@/lib/env";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string } | undefined;

const MIN_PASSWORD = 10;

// Rapikan dulu, baru validasi format (urutan penting di Zod 4).
const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254));

function turnstileToken(formData: FormData): string | undefined {
  const value = formData.get("cf-turnstile-response");
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------- masuk

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: t.auth.invalidInput };
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  if (!(await checkRateLimit("login", [`ip:${ip}`, `email:${email}`]))) {
    return { error: t.auth.rateLimited };
  }
  if (!(await verifyTurnstile(turnstileToken(formData), ip))) {
    return { error: t.auth.captchaFailed };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: t.auth.invalidCredentials };

  const loaded = await loadSessionUser(data.user.id);
  if (!loaded) {
    await supabase.auth.signOut();
    return { error: t.auth.noMemberRecord };
  }
  if (loaded.member.status !== "aktif") {
    await supabase.auth.signOut();
    return { error: t.auth.inactiveMember };
  }

  if (requiresTwoFactor(loaded.user)) redirect("/2fa");
  redirect(safeNextPath(next));
}

// ---------------------------------------------------------------- lupa password

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailField.safeParse(formData.get("email"));
  if (!parsed.success) return { error: t.auth.invalidInput };
  const email = parsed.data;

  const ip = await clientIp();
  if (!(await checkRateLimit("forgot", [`ip:${ip}`, `email:${email}`]))) {
    return { error: t.auth.rateLimited };
  }
  if (!(await verifyTurnstile(turnstileToken(formData), ip))) {
    return { error: t.auth.captchaFailed };
  }

  const supabase = await createSupabaseServerClient();
  // Hasil sengaja tidak dibedakan agar tidak membocorkan email terdaftar.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${serverEnv().APP_URL}/auth/confirm?next=/atur-password`,
  });
  return { success: t.auth.forgotSent };
}

// ---------------------------------------------------------------- atur password

const setPasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD, t.auth.passwordTooShort).max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: t.auth.passwordMismatch });

export async function setPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await getAuthClaims())) redirect("/masuk");

  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: t.common.unknownError };
  redirect("/");
}

// ---------------------------------------------------------------- 2FA (TOTP)

export type EnrollState =
  | { error?: string; factorId?: string; qrCode?: string; secret?: string }
  | undefined;

export async function startTotpEnrollmentAction(): Promise<EnrollState> {
  const claims = await getAuthClaims();
  if (!claims) redirect("/masuk");

  const supabase = await createSupabaseServerClient();

  // Bersihkan pendaftaran yang belum selesai agar tidak menumpuk.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Presync ${new Date().toISOString().slice(0, 10)}`,
    issuer: "Presync ISC",
  });
  if (error || !data) return { error: t.common.unknownError };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const verifySchema = z.object({
  factorId: z.uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function verifyTotpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const claims = await getAuthClaims();
  if (!claims) redirect("/masuk");

  const parsed = verifySchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { error: t.mfa.invalidCode };

  if (!(await checkRateLimit("mfa", [`user:${claims.sub}`]))) {
    return { error: t.auth.rateLimited };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { error: t.mfa.invalidCode };
  redirect("/");
}

// ---------------------------------------------------------------- keluar

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/masuk");
}
