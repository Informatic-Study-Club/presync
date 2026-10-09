import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Field, VenueFields } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { createActivityAction } from "@/lib/academic/actions";
import { managedDivisions } from "@/lib/academic/queries";
import { todayInJakarta } from "@/lib/academic/time";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.academic.classes.activityTitle };

const f = t.academic.fields;

export default async function NewActivityPage() {
  const { user } = await requireSession();
  const divisions = await managedDivisions(user);
  const canAllDivisions = can(user, "session.manage");
  if (divisions.length === 0 && !canAllDivisions) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.academic.classes.activityTitle}</CardTitle>
        <CardDescription>{t.academic.classes.activityDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={createActivityAction} submitLabel={t.academic.classes.createActivity} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="act-title" label={f.title}>
              <Input id="act-title" name="title" required minLength={3} maxLength={120} />
            </Field>
            <Field id="act-division" label={f.division}>
              <NativeSelect id="act-division" name="divisionId" className="w-full">
                {canAllDivisions ? <option value="">{t.academic.allDivisions}</option> : null}
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="act-date" label={f.date}>
              <Input id="act-date" name="date" type="date" defaultValue={todayInJakarta()} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="act-time" label={f.startTime}>
                <Input id="act-time" name="startTime" type="time" defaultValue="09:00" required />
              </Field>
              <Field id="act-duration" label={f.duration}>
                <Input id="act-duration" name="durationMinutes" type="number" min={15} max={1440} defaultValue={120} required />
              </Field>
            </div>
          </div>
          <VenueFields prefix="act" />
        </ActionForm>
      </CardContent>
    </Card>
  );
}
