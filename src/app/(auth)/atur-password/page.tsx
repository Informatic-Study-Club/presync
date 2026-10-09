import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { getAuthClaims } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: t.auth.setPasswordTitle };

// Dibuka dari tautan reset password atau undangan aktivasi (lewat /auth/confirm).
export default async function SetPasswordPage() {
  if (!(await getAuthClaims())) redirect("/masuk?galat=tautan");

  return (
    <AuthCard title={t.auth.setPasswordTitle} description={t.auth.setPasswordDescription}>
      <SetPasswordForm />
    </AuthCard>
  );
}
