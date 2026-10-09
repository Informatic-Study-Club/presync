import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { getAuthClaims } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { id as t } from "@/messages/id";
import { EnrollTotp, VerifyTotpForm } from "./totp-forms";

export const metadata: Metadata = { title: t.mfa.verifyTitle };

export default async function TwoFactorPage() {
  const claims = await getAuthClaims();
  if (!claims) redirect("/masuk");
  if (claims.aal === "aal2") redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp[0];

  if (verified) {
    return (
      <AuthCard title={t.mfa.verifyTitle} description={t.mfa.verifyDescription}>
        <VerifyTotpForm factorId={verified.id} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t.mfa.setupTitle} description={t.mfa.setupDescription}>
      <EnrollTotp />
    </AuthCard>
  );
}
