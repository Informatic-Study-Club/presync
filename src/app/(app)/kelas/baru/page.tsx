import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Field, VenueFields } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createClassAction } from "@/lib/academic/actions";
import { listTerms, managedDivisions } from "@/lib/academic/queries";
import { todayInJakarta } from "@/lib/academic/time";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.academic.classes.createTitle };

const f = t.academic.fields;

export default async function NewClassPage() {
  const { user } = await requireSession();
  const [divisions, terms] = await Promise.all([managedDivisions(user), listTerms()]);
  if (divisions.length === 0) notFound();
  const today = todayInJakarta();
  const currentTerm = terms.find((term) => term.startsOn <= today && term.endsOn >= today) ?? terms[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.academic.classes.createTitle}</CardTitle>
        <CardDescription>{t.academic.classes.createDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.academic.manage.noTerms}{" "}
            {can(user, "calendar.manage") ? (
              <Link href="/kalender/kelola" className="text-primary underline-offset-4 hover:underline">
                {t.academic.calendar.manage}
              </Link>
            ) : null}
          </p>
        ) : (
          <ActionForm action={createClassAction} submitLabel={t.academic.classes.create} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="class-name" label={f.name}>
                <Input id="class-name" name="name" required minLength={3} maxLength={120} placeholder="Web Development Dasar" />
              </Field>
              <Field id="class-division" label={f.division}>
                <NativeSelect id="class-division" name="divisionId" className="w-full">
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="class-term" label={f.term}>
                <NativeSelect id="class-term" name="termId" defaultValue={currentTerm?.id} className="w-full">
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.yearName} {term.name} ({term.startsOn} - {term.endsOn})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="class-planned" label={f.plannedSessions}>
                <Input id="class-planned" name="plannedSessions" type="number" min={1} max={52} defaultValue={7} required />
              </Field>
              <Field id="class-first" label={f.firstDate}>
                <Input id="class-first" name="firstDate" type="date" defaultValue={today} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="class-time" label={f.startTime}>
                  <Input id="class-time" name="startTime" type="time" defaultValue="15:30" required />
                </Field>
                <Field id="class-duration" label={f.duration}>
                  <Input id="class-duration" name="durationMinutes" type="number" min={15} max={720} defaultValue={120} required />
                </Field>
              </div>
            </div>
            <VenueFields prefix="class" />
            <Field id="class-description" label={f.description}>
              <Textarea id="class-description" name="description" rows={2} maxLength={1000} />
            </Field>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
