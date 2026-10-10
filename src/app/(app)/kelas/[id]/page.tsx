import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Field, VenueFields } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addExtraSessionAction,
  enrollMembersAction,
  setSessionStatusAction,
  unenrollMemberAction,
  updateSessionAction,
} from "@/lib/academic/actions";
import { getClassDetail, loadViewer } from "@/lib/academic/queries";
import { ownResult } from "@/lib/assessment/service";
import { classRecap } from "@/lib/attendance/service";
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
  const recap = detail.canManage ? await classRecap(detail.id) : [];
  const mine = detail.canManage ? null : await ownResult(session.user, detail.id);

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
        {detail.canManage ? (
          <CardContent>
            <Link href={`/kelas/${detail.id}/penilaian`} className="text-sm text-primary underline-offset-4 hover:underline">
              {t.assessment.title}
            </Link>
          </CardContent>
        ) : null}
      </Card>

      {mine && mine.components.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.assessment.myResult}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              {mine.components.map((comp) => (
                <div key={comp.key} className="contents">
                  <dt className="text-muted-foreground">
                    {comp.name} ({comp.weight}%)
                  </dt>
                  <dd>{(mine.result.evaluation.componentValues[comp.key] ?? 0).toLocaleString("id-ID")}</dd>
                </div>
              ))}
              <dt className="font-medium">{t.assessment.finalScore}</dt>
              <dd className="font-medium">{mine.result.evaluation.finalScore.toLocaleString("id-ID")}</dd>
            </dl>
            <Badge variant={mine.result.status === "eligible" ? "secondary" : "destructive"}>
              {t.assessment.status[mine.result.status]}
            </Badge>
            {mine.result.evaluation.reasons.length > 0 && !mine.result.override ? (
              <p className="text-muted-foreground">{mine.result.evaluation.reasons.join("; ")}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[s.status]}>{t.academic.sessionStatus[s.status]}</Badge>
                    {detail.canManage && s.status !== "off" ? (
                      <Link href={`/presensi/${s.id}`} className="text-primary underline-offset-4 hover:underline">
                        {t.attendance.session.openAttendance}
                      </Link>
                    ) : null}
                  </div>
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
              <CardTitle>{t.attendance.recap.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {recap.every((r) => r.summary.counted === 0) ? (
                <p className="text-sm text-muted-foreground">{t.attendance.recap.noDone}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.attendance.session.colMember}</TableHead>
                      <TableHead>{t.attendanceStatus.hadir}</TableHead>
                      <TableHead>{t.attendanceStatus.izin}</TableHead>
                      <TableHead>{t.attendanceStatus.sakit}</TableHead>
                      <TableHead>{t.attendanceStatus.tidak_hadir}</TableHead>
                      <TableHead>{t.attendance.recap.colPercent}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recap.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <span className="font-mono text-muted-foreground">{r.memberCode}</span> {r.fullName}
                        </TableCell>
                        <TableCell>{r.summary.hadir}</TableCell>
                        <TableCell>{r.summary.izin}</TableCell>
                        <TableCell>{r.summary.sakit}</TableCell>
                        <TableCell>{r.summary.tidakHadir}</TableCell>
                        <TableCell>{r.summary.percent === null ? "-" : `${r.summary.percent.toLocaleString("id-ID")}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

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
