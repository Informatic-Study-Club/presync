import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Field } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addComponentAction,
  applyTemplateAction,
  deleteComponentAction,
  overrideAction,
  saveRuleAction,
  saveScoresAction,
} from "@/lib/assessment/actions";
import { classAssessment } from "@/lib/assessment/service";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.assessment.title };

const a = t.assessment;
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export default async function AssessmentPage({ params }: PageProps<"/kelas/[id]/penilaian">) {
  const { user } = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const data = await classAssessment(user, id.data);
  if (!data) notFound();
  const { cls, components, rule, results } = data;
  const eligible = results.filter((r) => r.status === "eligible").length;
  const gradable = components.filter((c) => c.kind !== "attendance");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{a.title}</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/kelas/${cls.id}`} className="hover:underline">
              {cls.name}
            </Link>{" "}
            · {cls.divisionName} · {a.summary(eligible, results.length)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href={`/laporan/sertifikat?kelas=${cls.id}&format=pdf`} />} nativeButton={false}>
            {a.exportRecipients} (PDF)
          </Button>
          <Button variant="outline" size="sm" render={<a href={`/laporan/sertifikat?kelas=${cls.id}&format=xlsx`} />} nativeButton={false}>
            XLSX
          </Button>
        </div>
      </div>

      {components.length > 0 && data.totalWeight !== 100 ? (
        <Alert variant="destructive">
          <AlertDescription>{a.weightNot100(data.totalWeight)}</AlertDescription>
        </Alert>
      ) : null}

      {data.canManage ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{a.components}</CardTitle>
              <CardDescription>{a.componentsHint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {components.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground">{a.noComponents}</p>
                  <p className="text-muted-foreground">{a.templateHint}</p>
                  <ActionForm action={applyTemplateAction} submitLabel={a.useTemplate} variant="secondary">
                    <input type="hidden" name="classId" value={cls.id} />
                  </ActionForm>
                </div>
              ) : (
                <ul className="divide-y">
                  {components.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span>
                        {c.name} <Badge variant="outline">{a.kind[c.kind]}</Badge> · {c.weight}%
                      </span>
                      <ActionForm action={deleteComponentAction} submitLabel={a.deleteComponent} variant="outline" className="flex">
                        <input type="hidden" name="classId" value={cls.id} />
                        <input type="hidden" name="componentId" value={c.id} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              <p className="font-medium">{a.totalWeight(data.totalWeight)}</p>
              <ActionForm action={addComponentAction} submitLabel={a.addComponent} variant="outline">
                <input type="hidden" name="classId" value={cls.id} />
                <div className="grid grid-cols-3 gap-3">
                  <Field id="comp-name" label={a.componentName}>
                    <Input id="comp-name" name="name" required minLength={2} maxLength={60} />
                  </Field>
                  <Field id="comp-kind" label={a.componentKind}>
                    <NativeSelect id="comp-kind" name="kind" className="w-full">
                      {(["score", "done_flag", "attendance"] as const).map((k) => (
                        <option key={k} value={k}>
                          {a.kind[k]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field id="comp-weight" label={a.componentWeight}>
                    <Input id="comp-weight" name="weight" type="number" min={0} max={100} defaultValue={Math.max(0, 100 - data.totalWeight)} required />
                  </Field>
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{a.rule}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveRuleAction} submitLabel={a.saveRule} className="space-y-4 text-sm">
                <input type="hidden" name="classId" value={cls.id} />
                {gradable.length > 0 ? (
                  <fieldset className="space-y-1">
                    <legend className="text-muted-foreground">{a.requireAll}</legend>
                    {gradable.map((c) => (
                      <label key={c.key} className="flex items-center gap-2">
                        <input type="checkbox" name="requireAllComponents" value={c.key} defaultChecked={rule.requireAllComponents.includes(c.key)} />
                        {c.name}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <div className="grid grid-cols-3 gap-3">
                  <Field id="rule-izin" label={a.maxIzin}>
                    <Input id="rule-izin" name="maxIzin" type="number" min={0} max={100} defaultValue={rule.maxIzin ?? ""} />
                  </Field>
                  <Field id="rule-score" label={a.minScore}>
                    <Input id="rule-score" name="minScore" inputMode="decimal" defaultValue={rule.minScore ?? ""} />
                  </Field>
                  <Field id="rule-att" label={a.minAttendance}>
                    <Input id="rule-att" name="minAttendancePercent" inputMode="decimal" defaultValue={rule.minAttendancePercent ?? ""} />
                  </Field>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {data.canManage && gradable.length > 0 && results.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{a.scores}</CardTitle>
            <CardDescription>{a.scoresHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveScoresAction} submitLabel={a.saveScores} className="space-y-3">
              <input type="hidden" name="classId" value={cls.id} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.attendance.session.colMember}</TableHead>
                    {gradable.map((c) => (
                      <TableHead key={c.id}>
                        {c.name} ({c.weight}%)
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.memberId}>
                      <TableCell>
                        <span className="font-mono text-muted-foreground">{r.memberCode}</span> {r.fullName}
                      </TableCell>
                      {gradable.map((c) => {
                        const entry = r.scores.get(c.key);
                        return (
                          <TableCell key={c.id}>
                            {c.kind === "score" ? (
                              <Input
                                name={`score.${c.id}.${r.memberId}`}
                                defaultValue={entry?.value ?? ""}
                                inputMode="decimal"
                                className="h-7 w-20"
                                aria-label={`${c.name} ${r.fullName}`}
                              />
                            ) : (
                              <>
                                <input type="hidden" name={`donefield.${c.id}.${r.memberId}`} value="1" />
                                <input
                                  type="checkbox"
                                  name={`done.${c.id}.${r.memberId}`}
                                  defaultChecked={entry?.done === true}
                                  aria-label={`${c.name} ${r.fullName}`}
                                />
                              </>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{a.results}</CardTitle>
          <CardDescription>{a.summary(eligible, results.length)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.attendance.session.colMember}</TableHead>
                {components.map((c) => (
                  <TableHead key={c.id}>{c.name}</TableHead>
                ))}
                <TableHead>{a.finalScore}</TableHead>
                <TableHead>{t.academic.fields.status}</TableHead>
                <TableHead>{a.reasons}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.memberId} className="align-top">
                  <TableCell>
                    <span className="font-mono text-muted-foreground">{r.memberCode}</span> {r.fullName}
                  </TableCell>
                  {components.map((c) => (
                    <TableCell key={c.id}>{number.format(r.evaluation.componentValues[c.key] ?? 0)}</TableCell>
                  ))}
                  <TableCell className="font-medium">{number.format(r.evaluation.finalScore)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "eligible" ? "secondary" : "destructive"}>{a.status[r.status]}</Badge>
                    {r.override ? (
                      <Badge variant="outline" className="ml-1">
                        {a.overridden}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal text-xs">
                    {r.evaluation.reasons.join("; ") || "-"}
                    {r.override ? <p className="mt-1">{`${a.overridden}: ${r.override.note}`}</p> : null}
                    {data.canOverride ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground">{a.override}</summary>
                        <ActionForm action={overrideAction} submitLabel={a.override} variant="outline" className="mt-2 space-y-2">
                          <input type="hidden" name="classId" value={cls.id} />
                          <input type="hidden" name="memberId" value={r.memberId} />
                          <NativeSelect name="status" defaultValue={r.status === "eligible" ? "not_eligible" : "eligible"} aria-label={t.academic.fields.status}>
                            <option value="eligible">{a.status.eligible}</option>
                            <option value="not_eligible">{a.status.not_eligible}</option>
                            {r.override ? <option value="clear">{a.clearOverride}</option> : null}
                          </NativeSelect>
                          <Input name="note" required minLength={3} maxLength={500} placeholder={a.overrideNote} aria-label={a.overrideNote} />
                        </ActionForm>
                      </details>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
