import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Field } from "@/components/academic/venue-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addDays, todayInJakarta } from "@/lib/academic/time";
import { listClasses, loadViewer } from "@/lib/academic/queries";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { listBatches, visibleDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.reports.title };

const r = t.reports;

function FormatSelect({ id }: { id: string }) {
  return (
    <Field id={id} label={r.format}>
      <NativeSelect id={id} name="format" defaultValue="pdf" className="w-full">
        <option value="pdf">PDF</option>
        <option value="xlsx">XLSX (Excel)</option>
        <option value="csv">CSV</option>
      </NativeSelect>
    </Field>
  );
}

function ReportForm({ action, title, hint, children }: { action: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form method="get" action={action} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">{children}</div>
          <Button type="submit" size="sm">
            {r.download}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default async function ReportsPage() {
  const session = await requireSession();
  const { user } = session;
  const today = todayInJakarta();
  const monthAgo = addDays(today, -30);
  const [viewer, divisions, batches] = await Promise.all([loadViewer(session), visibleDivisions(user), listBatches()]);
  const classList = (await listClasses(viewer)).filter((cl) => can(user, "report.attendance", { divisionId: cl.divisionId }));
  const attendanceDivisions = divisions.filter((d) => can(user, "report.attendance", { divisionId: d.id }));
  const memberDivisions = divisions.filter((d) => can(user, "report.members", { divisionId: d.id }));
  const canFinance = can(user, "finance.report");

  return (
    <div className="space-y-6">
      <div>
        <h1>{r.title}</h1>
        <p className="text-sm text-muted-foreground">{r.description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportForm action="/laporan/kehadiran-anggota" title={r.attendanceMember.own}>
          <input type="hidden" name="anggota" value={user.id} />
          <Field id="own-from" label={r.from}>
            <Input id="own-from" name="dari" type="date" defaultValue={monthAgo} required />
          </Field>
          <Field id="own-to" label={r.to}>
            <Input id="own-to" name="sampai" type="date" defaultValue={today} required />
          </Field>
          <FormatSelect id="own-format" />
        </ReportForm>

        {classList.length > 0 ? (
          <ReportForm action="/laporan/kehadiran-kelas" title={r.attendanceClass.formTitle}>
            <Field id="cls" label={r.attendanceClass.cls}>
              <NativeSelect id="cls" name="kelas" className="w-full">
                {classList.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name} ({cl.divisionName}, {cl.termName})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <FormatSelect id="cls-format" />
          </ReportForm>
        ) : null}

        {attendanceDivisions.length > 0 ? (
          <ReportForm action="/laporan/kehadiran-divisi" title={r.attendanceDivision.formTitle} hint={r.attendanceDivision.hint}>
            <Field id="div" label={t.dashboard.division}>
              <NativeSelect id="div" name="divisi" className="w-full">
                {attendanceDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <FormatSelect id="div-format" />
            <Field id="div-from" label={r.from}>
              <Input id="div-from" name="dari" type="date" defaultValue={monthAgo} required />
            </Field>
            <Field id="div-to" label={r.to}>
              <Input id="div-to" name="sampai" type="date" defaultValue={today} required />
            </Field>
          </ReportForm>
        ) : null}

        {memberDivisions.length > 0 ? (
          <ReportForm action="/laporan/anggota" title={r.membersList.formTitle}>
            <Field id="mem-div" label={t.dashboard.division}>
              <NativeSelect id="mem-div" name="divisi" defaultValue="" className="w-full">
                {memberDivisions.length === divisions.length ? <option value="">{t.members.allDivisions}</option> : null}
                {memberDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="mem-batch" label={t.dashboard.batch}>
              <NativeSelect id="mem-batch" name="batch" defaultValue="" className="w-full">
                <option value="">{t.members.allBatches}</option>
                {batches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="mem-status" label={t.members.colStatus}>
              <NativeSelect id="mem-status" name="status" defaultValue="aktif" className="w-full">
                <option value="">{t.members.allStatuses}</option>
                {(["aktif", "nonaktif", "alumni"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t.memberStatus[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <FormatSelect id="mem-format" />
          </ReportForm>
        ) : null}

        {canFinance ? (
          <>
            <ReportForm action="/laporan/kas-bulanan" title={r.finance.formTitle}>
              <Field id="fin-month" label={t.finance.fields.month}>
                <Input id="fin-month" name="bulan" type="month" defaultValue={today.slice(0, 7)} required />
              </Field>
              <FormatSelect id="fin-format" />
            </ReportForm>
            <ReportForm action="/laporan/tunggakan" title={r.finance.arrearsFormTitle}>
              <FormatSelect id="arr-format" />
            </ReportForm>
          </>
        ) : null}
      </div>
    </div>
  );
}
