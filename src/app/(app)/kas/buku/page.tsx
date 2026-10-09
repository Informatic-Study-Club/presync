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
import { addTransactionAction, closeMonthAction, reverseTransactionAction } from "@/lib/finance/actions";
import { MONTH_RE } from "@/lib/finance/ledger";
import { formatRupiah } from "@/lib/finance/money";
import { ledgerForMonth, listCategories } from "@/lib/finance/service";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.finance.ledger.title };

const l = t.finance.ledger;
const ff = t.finance.fields;

export default async function LedgerPage({ searchParams }: PageProps<"/kas/buku">) {
  const { user } = await requireSession();
  if (!can(user, "finance.read")) notFound();
  const today = todayInJakarta();
  const month = z.string().regex(MONTH_RE).catch(today.slice(0, 7)).parse((await searchParams).bulan);
  const [ledger, categories] = await Promise.all([ledgerForMonth(month), listCategories()]);
  const canManage = can(user, "finance.manage");
  const isClosed = ledger.closure !== null;
  const { statement } = ledger;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{l.title}</h1>
        <p className="text-sm text-muted-foreground">{l.description}</p>
      </div>
      <FinanceNav active="/kas/buku" />

      <form method="get" className="flex items-end gap-2">
        <Input name="bulan" type="month" defaultValue={month} className="w-44" aria-label={ff.month} />
        <Button type="submit" size="sm" className="h-8">
          {l.showMonth}
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {l.statement} {month}
            {isClosed ? <Badge variant="secondary">{l.closedBadge}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              [l.opening, statement.opening],
              [t.finance.kind.income, statement.income],
              [t.finance.kind.expense, statement.expense],
              [l.closing, statement.closing],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold">{formatRupiah(value as number)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{l.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ff.date}</TableHead>
                  <TableHead>{ff.description}</TableHead>
                  <TableHead>{ff.category}</TableHead>
                  <TableHead>{t.finance.kind.income}</TableHead>
                  <TableHead>{t.finance.kind.expense}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.entries.map((e) => (
                  <TableRow key={e.id} className="align-top">
                    <TableCell className="whitespace-nowrap">{e.occurredOn}</TableCell>
                    <TableCell className="whitespace-normal">
                      {e.description}
                      {e.paymentId ? <p className="text-xs text-muted-foreground">{l.fromPayment}</p> : null}
                      {e.reversed ? (
                        <Badge variant="outline" className="mt-1">
                          {l.reversedBadge}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{e.categoryName}</TableCell>
                    <TableCell>{e.kind === "income" ? formatRupiah(e.amount) : ""}</TableCell>
                    <TableCell>{e.kind === "expense" ? formatRupiah(e.amount) : ""}</TableCell>
                    <TableCell>
                      {canManage && !e.reversed && !e.reversalOf ? (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">{l.reverse}</summary>
                          <ActionForm action={reverseTransactionAction} submitLabel={l.reverse} variant="destructive" className="mt-2 space-y-2">
                            <input type="hidden" name="transactionId" value={e.id} />
                            <Input name="reason" required minLength={3} placeholder={ff.reason} aria-label={ff.reason} />
                          </ActionForm>
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

      {canManage ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{l.add}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={addTransactionAction} submitLabel={l.add}>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="tx-date" label={ff.date}>
                    <Input id="tx-date" name="occurredOn" type="date" defaultValue={today} required />
                  </Field>
                  <Field id="tx-kind" label={ff.kind}>
                    <NativeSelect id="tx-kind" name="kind" defaultValue="expense" className="w-full">
                      <option value="income">{t.finance.kind.income}</option>
                      <option value="expense">{t.finance.kind.expense}</option>
                    </NativeSelect>
                  </Field>
                  <Field id="tx-cat" label={ff.category}>
                    <NativeSelect id="tx-cat" name="categoryId" className="w-full">
                      {categories
                        .filter((c) => c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({t.finance.kind[c.kind]})
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field id="tx-amount" label={ff.amount}>
                    <Input id="tx-amount" name="amount" inputMode="numeric" required placeholder="50.000" />
                  </Field>
                </div>
                <Field id="tx-desc" label={ff.description}>
                  <Input id="tx-desc" name="description" required minLength={3} maxLength={200} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{l.closeMonth}</CardTitle>
              <CardDescription>{l.closeHint}</CardDescription>
            </CardHeader>
            <CardContent>
              {isClosed ? (
                <p className="text-sm text-muted-foreground">{l.closed(formatRupiah(ledger.closure?.closingBalance ?? 0))}</p>
              ) : (
                <ActionForm action={closeMonthAction} submitLabel={`${l.closeMonth} ${month}`}>
                  <input type="hidden" name="month" value={month} />
                  <Field id="close-note" label={ff.note}>
                    <Input id="close-note" name="note" maxLength={500} />
                  </Field>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
