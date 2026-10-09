import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { serverEnv } from "@/lib/env";
import { id as t } from "@/messages/id";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t.auth.loginTitle };

const ERRORS: Record<string, string> = {
  akun: t.auth.noMemberRecord,
  nonaktif: t.auth.inactiveMember,
  tautan: t.auth.linkInvalid,
};

export default async function LoginPage({ searchParams }: PageProps<"/masuk">) {
  const { galat, next } = await searchParams;
  const initialError = typeof galat === "string" ? ERRORS[galat] : undefined;

  return (
    <AuthCard title={t.auth.loginTitle} description={t.auth.loginDescription}>
      <LoginForm
        siteKey={serverEnv().TURNSTILE_SITE_KEY}
        next={typeof next === "string" ? next : undefined}
        initialError={initialError}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        {t.auth.noPublicSignup}{" "}
        <Link href="/kebijakan-data" className="underline-offset-4 hover:underline">
          {t.nav.policy}
        </Link>
      </p>
    </AuthCard>
  );
}
