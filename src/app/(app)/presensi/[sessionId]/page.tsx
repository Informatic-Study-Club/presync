import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Field } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { LiveRefresh } from "@/components/attendance/live-refresh";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { manualAttendanceAction, regenerateCheckinCodeAction } from "@/lib/attendance/actions";
import { attendanceTopic } from "@/lib/attendance/realtime";
import { sessionDashboard } from "@/lib/attendance/service";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.attendance.session.title };

const a = t.attendance.session;
const STATUSES = ["hadir", "izin", "sakit", "tidak_hadir"] as const;
const STATUS_VARIANT = { hadir: "secondary", izin: "outline", sakit: "outline", tidak_hadir: "destructive" } as const;

const dateTime = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});
const timeOnly = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function SessionAttendancePage({ params }: PageProps<"/presensi/[sessionId]">) {
  const { user } = await requireSession();
  const id = z.uuid().safeParse((await params).sessionId);
  if (!id.success) notFound();
  const data = await sessionDashboard(user, id.data);
  if (!data) notFound();
  const { session, participants, counts } = data;

  return (
    <div className="space-y-6">
      <LiveRefresh topic={attendanceTopic(session.id)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{session.title}</h1>
          <p className="text-sm text-muted-foreground">
            {dateTime.format(session.startsAt)} · {session.className ?? session.divisionName ?? t.academic.allDivisions}
          </p>
          <div className="mt-1 flex gap-2">
            <Badge variant="outline">{t.academic.sessionStatus[session.status]}</Badge>
            <Badge variant="outline">{t.academic.mode[session.mode]}</Badge>
            <Badge variant="secondary">{a.live}</Badge>
          </div>
        </div>
        <Button render={<Link href={`/presensi/${session.id}/pindai`} />} nativeButton={false}>
          {a.openScanner}
        </Button>
      </div>

      {session.status === "scheduled" && session.classId ? (
        <Alert>
          <AlertDescription>
            {a.markDoneHint}{" "}
            <Link href={`/kelas/${session.classId}`} className="text-primary underline-offset-4 hover:underline">
              {t.academic.classes.setStatus}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([...STATUSES, "belum"] as const).map((key) => (
          <Card key={key}>
            <CardContent className="py-3">
              <p className="text-2xl font-semibold">{counts[key]}</p>
              <p className="text-xs text-muted-foreground">
                {key === "belum" ? a.notRecorded : t.attendanceStatus[key]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.flaggedCount > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">{a.anomalies}.</span> {a.anomalyHint}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{a.participants}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{a.colMember}</TableHead>
                <TableHead>{a.colStatus}</TableHead>
                <TableHead>{a.colMethod}</TableHead>
                <TableHead>{a.colTime}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((p) => (
                <TableRow key={p.memberId}>
                  <TableCell>
                    <span className="font-mono text-muted-foreground">{p.memberCode}</span> {p.fullName}
                    {p.note ? <p className="text-xs text-muted-foreground">{p.note}</p> : null}
                  </TableCell>
                  <TableCell>
                    {p.status ? (
                      <Badge variant={STATUS_VARIANT[p.status]}>{t.attendanceStatus[p.status]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{a.notRecorded}</span>
                    )}
                    {p.flagged ? (
                      <Badge variant="destructive" className="ml-1">
                        {a.anomalyBadge}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{p.method ? t.attendance.methods[p.method as keyof typeof t.attendance.methods] : "-"}</TableCell>
                  <TableCell>{p.recordedAt ? timeOnly.format(p.recordedAt) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a.manualTitle}</CardTitle>
            <CardDescription>{a.manualHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {participants.length > 0 ? (
              <ActionForm action={manualAttendanceAction} submitLabel={a.manualSave}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Field id="manual-member" label={a.manualMember}>
                  <NativeSelect id="manual-member" name="memberId" className="w-full">
                    {participants.map((p) => (
                      <option key={p.memberId} value={p.memberId}>
                        {p.memberCode} {p.fullName}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="manual-status" label={a.manualStatus}>
                  <NativeSelect id="manual-status" name="status" defaultValue="izin" className="w-full">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t.attendanceStatus[s]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="manual-note" label={a.manualNote}>
                  <Input id="manual-note" name="note" required minLength={3} maxLength={500} />
                </Field>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">{t.academic.classes.noMembers}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{a.checkinTitle}</CardTitle>
            <CardDescription>{session.mode === "offline" ? a.notOnline : a.checkinHint}</CardDescription>
          </CardHeader>
          {session.mode !== "offline" && data.canManage ? (
            <CardContent className="space-y-3">
              {session.checkinCode ? (
                <p className="font-mono text-4xl font-bold tracking-[0.3em]">{session.checkinCode}</p>
              ) : null}
              <ActionForm
                action={regenerateCheckinCodeAction}
                submitLabel={session.checkinCode ? a.regenerateCode : a.generateCode}
                variant="outline"
              >
                <input type="hidden" name="sessionId" value={session.id} />
              </ActionForm>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
