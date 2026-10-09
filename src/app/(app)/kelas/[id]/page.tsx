import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Field, VenueFields } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  addExtraSessionAction,
  enrollMembersAction,
  setSessionStatusAction,
  unenrollMemberAction,
  updateSessionAction,
} from "@/lib/academic/actions";
import { getClassDetail, loadViewer } from "@/lib/academic/queries";
import { toJakarta } from "@/lib/academic/time";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.academic.classes.title };

const c = t.academic.classes;
const f = t.academic.fields;
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const hourFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const STATUS_VARIANT = { scheduled: "outline", done: "secondary", off: "destructive" } as const;

const createdSchema = z.object({
  pertemuan: z.coerce.number().int().min(0).optional().catch(undefined),
  libur: z.coerce.number().int().min(0).optional().catch(undefined),
  kurang: z.coerce.number().int().min(0).optional().catch(undefined),
});

export default async function ClassDetailPage({ params, searchParams }: PageProps<"/kelas/[id]">) {
  const session = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getClassDetail(await loadViewer(session), id.data);
  if (!detail) notFound();
  const created = createdSchema.parse(await searchParams);
  const done = detail.sessions.filter((s) => s.kind === "regular" && s.status === "done").length;

  return (
    <div className="space-y-6">
      {created.pertemuan !== undefined ? (
        <Alert>
          <AlertDescription>
            {c.created(created.pertemuan, created.libur ?? 0)}
            {created.kurang ? ` ${c.shortfall(created.kurang)}` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{detail.name}</CardTitle>
          <CardDescription>
            {detail.divisionName} · {detail.termName} · {c.progress(done, detail.plannedSessions)}
          </CardDescription>
        </CardHeader>
        {detail.description ? (
          <CardContent className="text-sm whitespace-pre-wrap">{detail.description}</CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{c.sessions}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm">
          {detail.sessions.map((s) => {
            const local = toJakarta(s.startsAt);
            const duration = Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000);
            return (
              <div key={s.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {s.sequence ? `${f.sequence} ${s.sequence}` : s.title}
                      {s.kind !== "regular" ? (
                        <Badge variant="outline" className="ml-2">
                          {t.academic.sessionKind[s.kind]}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">
                      {dateFormat.format(s.startsAt)}, {hourFormat.format(s.startsAt)}-{hourFormat.format(s.endsAt)} ·{" "}
                      {[s.location, s.meetingUrl].filter(Boolean).join(" · ") || t.academic.mode[s.mode]}
                    </p>
                    {s.status === "off" && s.offReason ? (
                      <p className="text-muted-foreground">
                        {f.offReason}: {s.offReason}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={STATUS_VARIANT[s.status]}>{t.academic.sessionStatus[s.status]}</Badge>
                </div>

                {detail.canManage ? (
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-muted-foreground">
                      {c.setStatus} / {c.editSession}
                    </summary>
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      <ActionForm action={setSessionStatusAction} submitLabel={c.setStatus} variant="outline">
                        <input type="hidden" name="sessionId" value={s.id} />
                        <Field id={`status-${s.id}`} label={f.status}>
                          <NativeSelect id={`status-${s.id}`} name="status" defaultValue={s.status} className="w-full">
                            {(["scheduled", "done", "off"] as const).map((st) => (
                              <option key={st} value={st}>
                                {t.academic.sessionStatus[st]}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field id={`reason-${s.id}`} label={f.offReason}>
                          <Input id={`reason-${s.id}`} name="offReason" defaultValue={s.offReason ?? ""} maxLength={300} />
                        </Field>
                      </ActionForm>
                      <ActionForm action={updateSessionAction} submitLabel={c.editSession} variant="outline">
                        <input type="hidden" name="sessionId" value={s.id} />
                        <div className="grid grid-cols-3 gap-3">
                          <Field id={`date-${s.id}`} label={f.date}>
                            <Input id={`date-${s.id}`} name="date" type="date" defaultValue={local.date} required />
                          </Field>
                          <Field id={`time-${s.id}`} label={f.startTime}>
                            <Input id={`time-${s.id}`} name="startTime" type="time" defaultValue={local.time} required />
                          </Field>
                          <Field id={`dur-${s.id}`} label={f.duration}>
                            <Input id={`dur-${s.id}`} name="durationMinutes" type="number" min={15} max={720} defaultValue={duration} required />
                          </Field>
                        </div>
                        <VenueFields prefix={`s-${s.id}`} mode={s.mode} location={s.location} meetingUrl={s.meetingUrl} />
                      </ActionForm>
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {detail.canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{c.addExtra}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={addExtraSessionAction} submitLabel={c.addExtra} variant="outline">
                <input type="hidden" name="classId" value={detail.id} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field id="extra-title" label={f.title}>
                    <Input id="extra-title" name="title" required minLength={3} maxLength={120} defaultValue={t.academic.extraTitle(detail.name)} />
                  </Field>
                  <Field id="extra-date" label={f.date}>
                    <Input id="extra-date" name="date" type="date" required />
                  </Field>
                  <Field id="extra-time" label={f.startTime}>
                    <Input id="extra-time" name="startTime" type="time" defaultValue={detail.defaultStartTime.slice(0, 5)} required />
                  </Field>
                  <Field id="extra-duration" label={f.duration}>
                    <Input id="extra-duration" name="durationMinutes" type="number" min={15} max={720} defaultValue={detail.defaultDurationMinutes} required />
                  </Field>
                </div>
                <VenueFields
                  prefix="extra"
                  mode={detail.defaultMode}
                  location={detail.defaultLocation}
                  meetingUrl={detail.defaultMeetingUrl}
                />
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{c.members}</CardTitle>
              <CardDescription>{c.enrolled(detail.enrolled.length)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              {detail.enrolled.length === 0 ? (
                <p className="text-muted-foreground">{c.noMembers}</p>
              ) : (
                <ul className="divide-y">
                  {detail.enrolled.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span>
                        <span className="font-mono text-muted-foreground">{m.memberCode}</span> {m.fullName}
                      </span>
                      <ActionForm action={unenrollMemberAction} submitLabel={c.unenroll} variant="outline" className="flex items-center gap-2">
                        <input type="hidden" name="classId" value={detail.id} />
                        <input type="hidden" name="memberId" value={m.id} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 border-t pt-4">
                <p className="font-medium">{c.enroll}</p>
                {detail.candidates.length === 0 ? (
                  <p className="text-muted-foreground">{c.noCandidates}</p>
                ) : (
                  <ActionForm action={enrollMembersAction} submitLabel={c.enroll}>
                    <input type="hidden" name="classId" value={detail.id} />
                    <p className="text-muted-foreground">{c.enrollHint}</p>
                    <div className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2">
                      {detail.candidates.map((m) => (
                        <label key={m.id} className="flex items-center gap-2">
                          <input type="checkbox" name="memberIds" value={m.id} />
                          <span className="font-mono text-muted-foreground">{m.memberCode}</span> {m.fullName}
                        </label>
                      ))}
                    </div>
                  </ActionForm>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
