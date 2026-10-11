import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { requireSession } from "@/lib/auth/session";
import { dataRequestsOf } from "@/lib/members/queries";
import { submitDataRequestAction } from "@/lib/privacy/actions";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.privacy.requestTitle };

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

export default async function PrivacyPage() {
  const { user } = await requireSession();
  const requests = await dataRequestsOf(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.privacy.requestTitle}
        description={
          <>
            {t.privacy.requestDescription}{" "}
            <Link href="/kebijakan-data" className="text-primary underline-offset-4 hover:underline">
              {t.privacy.readPolicy}
            </Link>
          </>
        }
      />
      <Card>
        <CardContent>
          <ActionForm action={submitDataRequestAction} submitLabel={t.privacy.submit}>
            <div className="space-y-1">
              <Label htmlFor="kind">{t.privacy.kind}</Label>
              <NativeSelect id="kind" name="kind" defaultValue="correction">
                <option value="correction">{t.privacy.kinds.correction}</option>
                <option value="deletion">{t.privacy.kinds.deletion}</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reason">{t.privacy.reason}</Label>
              <Textarea id="reason" name="reason" required minLength={10} maxLength={2000} rows={4} />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.privacy.myRequests}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {requests.length === 0 ? (
            <p className="text-muted-foreground">{t.privacy.noRequests}</p>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="space-y-1 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.privacy.kinds[r.kind]}</span>
                  <Badge variant={r.status === "pending" ? "outline" : "secondary"}>
                    {t.privacy.statuses[r.status]}
                  </Badge>
                  <span className="text-muted-foreground">{dateFormat.format(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap">{r.reason}</p>
                {r.resolutionNote ? (
                  <p className="text-muted-foreground">
                    {t.privacy.resolutionNote}: {r.resolutionNote}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
