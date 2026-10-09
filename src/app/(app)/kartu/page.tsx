import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { barcodeSvg } from "@/lib/cards/render";
import { signCardPayload } from "@/lib/cards/token";
import { optionalSecret } from "@/lib/env";
import { getMemberProfile } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.cards.title };

function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default async function MyCardPage() {
  const { user } = await requireSession();
  const profile = await getMemberProfile(user, user.id);
  if (!profile) return null;

  const secret = optionalSecret("CARD_SECRET");
  const blocked = profile.cardStatus === "blocked";
  const qr =
    secret && !blocked
      ? svgDataUri(
          barcodeSvg({
            symbology: "qrcode",
            text: signCardPayload(secret, profile.memberCode, profile.cardVersion),
          }),
        )
      : null;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{t.cards.title}</CardTitle>
        <CardDescription>{t.cards.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocked ? (
          <Alert variant="destructive">
            <AlertDescription>{t.cards.blocked}</AlertDescription>
          </Alert>
        ) : null}
        {!secret ? (
          <Alert>
            <AlertDescription>{t.cards.secretMissing}</AlertDescription>
          </Alert>
        ) : null}
        <div className="rounded-xl border bg-white p-4 text-neutral-900">
          <p className="text-xs font-bold tracking-widest text-sky-700">{t.cards.pdfOrg}</p>
          <p className="mt-1 text-lg font-semibold">{profile.fullName}</p>
          <p className="text-sm text-neutral-600">
            {profile.divisionName} · {t.dashboard.batch} {profile.batch}
          </p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI SVG buatan server
            <img src={qr} alt={t.cards.qrAlt} className="mx-auto mt-4 size-56" />
          ) : null}
          <p className="mt-2 text-center font-mono text-base font-bold tracking-[0.2em]">
            {profile.memberCode}
          </p>
        </div>
        {!blocked ? (
          <Button className="w-full" render={<a href="/kartu/pdf" />} nativeButton={false}>
            {t.cards.download}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
