import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { FinanceNav } from "@/components/finance/finance-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { rejectPaymentAction, verifyPaymentAction } from "@/lib/finance/actions";
import { formatRupiah } from "@/lib/finance/money";
import { pendingPayments } from "@/lib/finance/service";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.finance.verify.title };

const v = t.finance.verify;
const timeFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function VerifyPaymentsPage() {
  const { user } = await requireSession();
  if (!can(user, "finance.verify")) notFound();
  const pending = await pendingPayments();

  return (
    <div className="space-y-6">
      <h1>{v.title}</h1>
      <FinanceNav active="/kas/verifikasi" />
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">{v.empty}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  <span className="font-mono text-muted-foreground">{p.memberCode}</span> {p.memberName}
                </CardTitle>
                <CardDescription>
                  {p.invoiceTitle} · {formatRupiah(p.amount)} · {v.submittedAt(timeFormat.format(p.submittedAt))}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {p.amount !== p.invoiceAmount ? (
                  <Alert variant="destructive">
                    <AlertDescription>{v.amountMismatch(formatRupiah(p.amount), formatRupiah(p.invoiceAmount))}</AlertDescription>
                  </Alert>
                ) : null}
                {p.proofPath ? (
                  <a href={`/kas/bukti/${p.id}`} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                    {v.viewProof}
                  </a>
                ) : null}
                <div className="flex flex-wrap items-start gap-4">
                  <ActionForm action={verifyPaymentAction} submitLabel={v.verify}>
                    <input type="hidden" name="paymentId" value={p.id} />
                  </ActionForm>
                  <ActionForm action={rejectPaymentAction} submitLabel={v.reject} variant="outline" className="flex-1 space-y-2">
                    <input type="hidden" name="paymentId" value={p.id} />
                    <Input name="reason" required minLength={3} placeholder={t.finance.fields.reason} aria-label={t.finance.fields.reason} />
                  </ActionForm>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
