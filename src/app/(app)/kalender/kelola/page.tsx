import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Field } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createAcademicYearAction,
  createCalendarEventAction,
  createTermAction,
  deleteCalendarEventAction,
} from "@/lib/academic/actions";
import { listAcademicYears, listCalendarEvents, listTerms } from "@/lib/academic/queries";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { listDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.academic.manage.title };

const f = t.academic.fields;
const m = t.academic.manage;

function formatRange(startsOn: string, endsOn: string) {
  return startsOn === endsOn ? startsOn : `${startsOn} ${t.academic.rangeTo} ${endsOn}`;
}

export default async function ManageCalendarPage() {
  const { user } = await requireSession();
  if (!can(user, "calendar.manage")) notFound();
  const [years, terms, events, divisions] = await Promise.all([
    listAcademicYears(),
    listTerms(),
    listCalendarEvents(),
    listDivisions(),
  ]);

  return (
    <div className="space-y-6">
      <h1>{m.title}</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{m.years}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {years.length === 0 ? (
              <p className="text-muted-foreground">{m.noYears}</p>
            ) : (
              <ul className="space-y-1">
                {years.map((y) => (
                  <li key={y.id}>
                    <span className="font-medium">{y.name}</span>{" "}
                    <span className="text-muted-foreground">{formatRange(y.startsOn, y.endsOn)}</span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={createAcademicYearAction} submitLabel={m.addYear} variant="outline">
              <Field id="year-name" label={f.name}>
                <Input id="year-name" name="name" placeholder="2026/2027" required maxLength={30} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="year-start" label={f.startsOn}>
                  <Input id="year-start" name="startsOn" type="date" required />
                </Field>
                <Field id="year-end" label={f.endsOn}>
                  <Input id="year-end" name="endsOn" type="date" required />
                </Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.terms}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {terms.length === 0 ? (
              <p className="text-muted-foreground">{m.noTerms}</p>
            ) : (
              <ul className="space-y-1">
                {terms.map((term) => (
                  <li key={term.id}>
                    <span className="font-medium">
                      {term.yearName} {term.name}
                    </span>{" "}
                    <span className="text-muted-foreground">{formatRange(term.startsOn, term.endsOn)}</span>
                  </li>
                ))}
              </ul>
            )}
            {years.length > 0 ? (
              <ActionForm action={createTermAction} submitLabel={m.addTerm} variant="outline">
                <div className="grid grid-cols-2 gap-3">
                  <Field id="term-year" label={f.academicYear}>
                    <NativeSelect id="term-year" name="academicYearId" className="w-full">
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field id="term-name" label={f.name}>
                    <Input id="term-name" name="name" placeholder="Ganjil" required maxLength={50} />
                  </Field>
                  <Field id="term-start" label={f.startsOn}>
                    <Input id="term-start" name="startsOn" type="date" required />
                  </Field>
                  <Field id="term-end" label={f.endsOn}>
                    <Input id="term-end" name="endsOn" type="date" required />
                  </Field>
                </div>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.events}</CardTitle>
          <CardDescription>{m.holidayHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <ActionForm action={createCalendarEventAction} submitLabel={m.addEvent} variant="outline">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="event-title" label={f.title}>
                <Input id="event-title" name="title" required maxLength={120} />
              </Field>
              <Field id="event-kind" label={f.kind}>
                <NativeSelect id="event-kind" name="kind" className="w-full">
                  {(["holiday", "exam", "activity", "deadline"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t.academic.eventKind[k]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="event-start" label={f.startsOn}>
                <Input id="event-start" name="startsOn" type="date" required />
              </Field>
              <Field id="event-end" label={f.endsOn}>
                <Input id="event-end" name="endsOn" type="date" required />
              </Field>
              <Field id="event-division" label={f.division}>
                <NativeSelect id="event-division" name="divisionId" defaultValue="" className="w-full">
                  <option value="">{t.academic.allDivisions}</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field id="event-description" label={f.description}>
              <Textarea id="event-description" name="description" rows={2} maxLength={1000} />
            </Field>
          </ActionForm>

          {events.length === 0 ? (
            <p className="text-muted-foreground">{m.noEvents}</p>
          ) : (
            <ul className="divide-y">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.title}</span>
                      <Badge variant={e.kind === "holiday" ? "destructive" : "outline"}>
                        {t.academic.eventKind[e.kind]}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">
                      {formatRange(e.startsOn, e.endsOn)} · {e.divisionName ?? t.academic.allDivisions}
                    </p>
                  </div>
                  <ActionForm action={deleteCalendarEventAction} submitLabel={m.delete} variant="outline" className="flex items-center gap-2">
                    <input type="hidden" name="eventId" value={e.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
