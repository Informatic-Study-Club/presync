import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Field } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { FinanceNav } from "@/components/finance/finance-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayInJakarta } from "@/lib/academic/time";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import {
  createCategoryAction,
  createScheduleAction,
  generateInvoicesAction,
  recordCashAction,
  toggleCategoryAction,
  waiveInvoiceAction,
} from "@/lib/finance/actions";
import { formatRupiah } from "@/lib/finance/money";
import { financeSummary, listCategories, listInvoices, listSchedules } from "@/lib/finance/service";
import { listDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.finance.manage.title };

const m = t.finance.manage;
const ff = t.finance.fields;
const STATUS_VARIANT = { unpaid: "destructive", pending: "outline", paid: "secondary", waived: "outline" } as const;

const filterSchema = z.object({
  periode: z.string().regex(/^(\d{4}-(0[1-9]|1[0-2])|sekali)$/).optional().catch(undefined),
  status: z.enum(["unpaid", "pending", "paid", "waived"]).optional().catch(undefined),
});

export default async function ManageFinancePage({ searchParams }: PageProps<"/kas/kelola">) {
  const { user } = await requireSession();
  if (!can(user, "finance.read")) notFound();
  const currentMonth = todayInJakarta().slice(0, 7);
  const raw = await searchParams;
  const filters = filterSchema.parse(raw);
  // Tanpa parameter: bulan berjalan. Kolom bulan dikosongkan: semua periode.
  const period = "periode" in raw ? filters.periode : currentMonth;
  const [summary, categories, schedules, invoiceRows, divisions] = await Promise.all([
    financeSummary(),
    listCategories(),
    listSchedules(),
    listInvoices({ period, status: filters.status }),
    listDivisions(),
  ]);
  const canManage = can(user, "finance.manage");
  const incomeCategories = categories.filter((c) => c.kind === "income" && c.active);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{m.title}</h1>
      <FinanceNav active="/kas/kelola" />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          [m.balance, formatRupiah(summary.balance)],
          [m.income, formatRupiah(summary.totalIncome)],
          [m.expense, formatRupiah(summary.totalExpense)],
          [m.arrears, m.arrearsMembers(summary.arrearsMembers)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="py-3">
              <p className="text-xl font-semibold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{m.categories}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {categories.length === 0 ? <p className="text-muted-foreground">{m.noCategories}</p> : null}
            <ul className="divide-y">
              {categories.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    {c.name} <Badge variant="outline">{t.finance.kind[c.kind]}</Badge>{" "}
                    {!c.active ? <Badge variant="destructive">{m.inactive}</Badge> : null}
                  </span>
                  {canManage && c.active ? (
                    <ActionForm action={toggleCategoryAction} submitLabel={m.deactivate} variant="outline" className="flex">
                      <input type="hidden" name="categoryId" value={c.id} />
                      <input type="hidden" name="active" value="false" />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
            {canManage ? (
              <ActionForm action={createCategoryAction} submitLabel={m.addCategory} variant="outline">
                <div className="grid grid-cols-2 gap-3">
                  <Field id="cat-name" label={ff.name}>
                    <Input id="cat-name" name="name" required maxLength={60} />
                  </Field>
                  <Field id="cat-kind" label={ff.kind}>
                    <NativeSelect id="cat-kind" name="kind" className="w-full">
                      <option value="income">{t.finance.kind.income}</option>
                      <option value="expense">{t.finance.kind.expense}</option>
                    </NativeSelect>
                  </Field>
                </div>
                <input type="hidden" name="description" value="" />
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.schedules}</CardTitle>
            <CardDescription>{m.generateHint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {schedules.length === 0 ? <p className="text-muted-foreground">{m.noSchedules}</p> : null}
            {schedules.map((s) => (
              <div key={s.id} className="space-y-2 rounded-lg border p-3">
                <p className="font-medium">
                  {s.name} · {formatRupiah(s.amount)} · {t.finance.period[s.period]}
                </p>
                <p className="text-muted-foreground">
                  {s.categoryName} · {s.divisionName ?? t.academic.allDivisions}
                  {s.batch ? ` · ${t.dashboard.batch} ${s.batch}` : ""}
                </p>
                {canManage && s.active ? (
                  <ActionForm action={generateInvoicesAction} submitLabel={m.generate} variant="outline" className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="scheduleId" value={s.id} />
                    <Field id={`gen-${s.id}`} label={ff.month}>
                      <Input id={`gen-${s.id}`} name="month" type="month" defaultValue={currentMonth} required />
                    </Field>
                  </ActionForm>
                ) : null}
              </div>
            ))}
            {canManage && incomeCategories.length > 0 ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-muted-foreground">{m.addSchedule}</summary>
                <ActionForm action={createScheduleAction} submitLabel={m.addSchedule} className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="sch-name" label={ff.name}>
                      <Input id="sch-name" name="name" required maxLength={80} placeholder="Iuran bulanan" />
                    </Field>
                    <Field id="sch-cat" label={ff.category}>
                      <NativeSelect id="sch-cat" name="categoryId" className="w-full">
                        {incomeCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field id="sch-amount" label={ff.amount}>
                      <Input id="sch-amount" name="amount" inputMode="numeric" required placeholder="10.000" />
                    </Field>
                    <Field id="sch-period" label={ff.period}>
                      <NativeSelect id="sch-period" name="period" className="w-full">
                        <option value="monthly">{t.finance.period.monthly}</option>
                        <option value="once">{t.finance.period.once}</option>
                      </NativeSelect>
                    </Field>
                    <Field id="sch-dueday" label={ff.dueDay}>
                      <Input id="sch-dueday" name="dueDay" type="number" min={1} max={28} defaultValue={10} />
                    </Field>
                    <Field id="sch-dueon" label={ff.dueOn}>
                      <Input id="sch-dueon" name="dueOn" type="date" />
                    </Field>
                    <Field id="sch-div" label={ff.division}>
                      <NativeSelect id="sch-div" name="divisionId" defaultValue="" className="w-full">
                        <option value="">{t.academic.allDivisions}</option>
                        {divisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field id="sch-batch" label={ff.batch}>
                      <Input id="sch-batch" name="batch" maxLength={2} />
                    </Field>
                  </div>
                </ActionForm>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.invoices}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <Input name="periode" type="month" defaultValue={period ?? ""} className="w-44" aria-label={ff.period} />
            <NativeSelect name="status" defaultValue={filters.status ?? ""} aria-label={t.academic.fields.status}>
              <option value="">{m.allStatuses}</option>
              {(["unpaid", "pending", "paid", "waived"] as const).map((s) => (
                <option key={s} value={s}>
                  {t.finance.invoiceStatus[s]}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm" className="h-8">
              {m.filter}
            </Button>
          </form>
          {invoiceRows.length === 0 ? (
            <p className="text-muted-foreground">{m.noInvoices}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.members.colName}</TableHead>
                  <TableHead>{m.invoices}</TableHead>
                  <TableHead>{ff.amount}</TableHead>
                  <TableHead>{t.academic.fields.status}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceRows.map((inv) => (
                  <TableRow key={inv.id} className="align-top">
                    <TableCell>
                      <span className="font-mono text-muted-foreground">{inv.memberCode}</span> {inv.memberName}
                    </TableCell>
                    <TableCell>{inv.title}</TableCell>
                    <TableCell>{formatRupiah(inv.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[inv.status]}>{t.finance.invoiceStatus[inv.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {inv.status === "unpaid" ? (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">
                            {m.cash} / {m.waive}
                          </summary>
                          <div className="mt-2 space-y-3">
                            <ActionForm action={recordCashAction} submitLabel={m.cash} variant="outline">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <Input name="note" required minLength={3} placeholder={ff.note} aria-label={ff.note} />
                            </ActionForm>
                            {canManage ? (
                              <ActionForm action={waiveInvoiceAction} submitLabel={m.waive} variant="outline">
                                <input type="hidden" name="invoiceId" value={inv.id} />
                                <Input name="reason" required minLength={3} placeholder={ff.reason} aria-label={ff.reason} />
                              </ActionForm>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
