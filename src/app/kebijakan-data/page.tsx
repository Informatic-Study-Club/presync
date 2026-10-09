import type { Metadata } from "next";
import Link from "next/link";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.privacy.policyTitle };

// Halaman publik, bisa dibuka tanpa login.
export default function DataPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 sm:p-8">
      <p className="text-lg font-semibold tracking-tight text-primary">{t.app.name}</p>
      <h1 className="text-2xl font-semibold">{t.privacy.policyTitle}</h1>
      <p className="text-muted-foreground">{t.privacy.policyIntro}</p>
      {t.privacy.policySections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-lg font-medium">{section.heading}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{section.body}</p>
        </section>
      ))}
      <p className="text-sm">
        <Link href="/privasi" className="text-primary underline-offset-4 hover:underline">
          {t.privacy.requestTitle}
        </Link>
      </p>
    </main>
  );
}
