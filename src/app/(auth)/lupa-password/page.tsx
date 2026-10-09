import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthCard } from "@/components/auth/auth-card";
import { serverEnv } from "@/lib/env";
import { id as t } from "@/messages/id";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: t.auth.forgotTitle };

export default async function ForgotPasswordPage() {
  // Dirender per request: site key dibaca dari env saat runtime, bukan saat build.
  await connection();
  return (
    <AuthCard title={t.auth.forgotTitle} description={t.auth.forgotDescription}>
      <ForgotPasswordForm siteKey={serverEnv().TURNSTILE_SITE_KEY} />
    </AuthCard>
  );
}
