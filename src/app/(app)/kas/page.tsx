import type { Metadata } from "next";
import { Field } from "@/components/academic/venue-fields";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireSession } from "@/lib/auth/session";
import { submitProofAction } from "@/lib/finance/actions";
import { formatRupiah } from "@/lib/finance/money";
import { invoicesOfMember } from "@/lib/finance/service";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.finance.member.title };

const fm = t.finance.member;
const STATUS_VARIANT = { unpaid: "destructive", pending: "outline", paid: "secondary", waived: "outline" } as const;
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

export default async function MyInvoicesPage() {
  const { user } = await requireSession();
  const data = await invoicesOfMember(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{fm.title}</h1>
        <p className="text-sm text-muted-foreground">{fm.description}</p>
      </div>

      {data.invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{fm.empty}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.invoices.map((inv) => {
            const lastPayment = data.payments.find((p) => p.invoiceId === inv.id);
            return (
              <Card key={inv.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <span>{inv.title}</span>
                    <Badge variant={STATUS_VARIANT[inv.status]}>{t.finance.invoiceStatus[inv.status]}</Badge>
                  </CardTitle>
                  <CardDescription>
                    {formatRupiah(inv.amount)} · {fm.dueOn(dateFormat.format(new Date(`${inv.dueOn}T00:00:00+07:00`)))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {lastPayment?.status === "rejected" && inv.status === "unpaid" && lastPayment.rejectionReason ? (
                    <p className="text-destructive">{fm.rejected(lastPayment.rejectionReason)}</p>
                  ) : null}
                  {inv.status === "unpaid" ? (
                    <ActionForm action={submitProofAction} submitLabel={fm.pay}>
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <Field id={`proof-${inv.id}`} label={t.finance.fields.proof}>
                        <Input
                          id={`proof-${inv.id}`}
                          name="proof"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          required
                        />
                      </Field>
                    </ActionForm>
                  ) : null}
                  {lastPayment?.proofPath ? (
                    <a href={`/kas/bukti/${lastPayment.id}`} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                      {fm.viewProof}
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {data.payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{fm.history}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {dateFormat.format(p.submittedAt)} · {formatRupiah(p.amount)} · {t.finance.paymentMethod[p.method]}
                </span>
                <Badge variant="outline">{t.finance.paymentStatus[p.status]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
