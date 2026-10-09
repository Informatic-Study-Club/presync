import type { Metadata } from "next";
import { Field } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { checkinAction } from "@/lib/attendance/actions";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.attendance.checkin.title };

export default async function CheckinPage() {
  await requireSession();
  const c = t.attendance.checkin;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{c.title}</CardTitle>
        <CardDescription>{c.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={checkinAction} submitLabel={c.submit}>
          <Field id="checkin-code" label={c.code}>
            <Input
              id="checkin-code"
              name="code"
              required
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono text-2xl tracking-[0.3em] uppercase"
            />
          </Field>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
