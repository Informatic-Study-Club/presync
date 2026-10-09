import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { allDataRequests } from "@/lib/members/queries";
import { resolveDataRequestAction } from "@/lib/privacy/actions";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.privacy.manageTitle };

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

export default async function DataRequestsAdminPage() {
  const { user } = await requireSession();
  if (!can(user, "privacy.manage")) notFound();
  const requests = await allDataRequests();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.privacy.manageTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {requests.length === 0 ? (
          <p className="text-muted-foreground">{t.privacy.manageEmpty}</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/anggota/${r.memberId}`} className="font-medium hover:underline">
                  {r.memberName} ({r.memberCode})
                </Link>
                <span>{t.privacy.kinds[r.kind]}</span>
                <Badge variant={r.status === "pending" ? "outline" : "secondary"}>
                  {t.privacy.statuses[r.status]}
                </Badge>
                <span className="text-muted-foreground">{dateFormat.format(r.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{r.reason}</p>
              {r.status === "pending" ? (
                <div className="flex flex-wrap gap-4">
                  {(["done", "rejected"] as const).map((status) => (
                    <ActionForm
                      key={status}
                      action={resolveDataRequestAction}
                      submitLabel={status === "done" ? t.privacy.markDone : t.privacy.reject}
                      variant={status === "done" ? "default" : "outline"}
                      className="flex-1 space-y-2"
                    >
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="status" value={status} />
                      <Label htmlFor={`note-${r.id}-${status}`}>{t.privacy.resolutionNote}</Label>
                      <Textarea id={`note-${r.id}-${status}`} name="note" required minLength={3} rows={2} />
                    </ActionForm>
                  ))}
                </div>
              ) : r.resolutionNote ? (
                <p className="text-muted-foreground">
                  {t.privacy.resolutionNote}: {r.resolutionNote}
                </p>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
