import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import {
  reissueCardAction,
  resendInviteAction,
  saveRolesAction,
  setCardStatusAction,
} from "@/lib/members/actions";
import { getMemberProfile, listDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.members.title };

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

function NoteField({ id }: { id: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{t.profile.note}</Label>
      <Textarea id={id} name="note" required minLength={3} maxLength={500} rows={2} />
    </div>
  );
}

export default async function MemberProfilePage({ params }: PageProps<"/anggota/[id]">) {
  const { user } = await requireSession();
  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) notFound();
  const profile = await getMemberProfile(user, parsedId.data);
  if (!profile) notFound();

  const resource = { memberId: profile.id, divisionId: profile.divisionId };
  const canPrint = can(user, "card.print", resource) || profile.id === user.id;
  const canReissue = can(user, "card.reissue", resource);
  const canBlock = can(user, "card.block", resource);
  const canRoles = can(user, "role.manage");
  const canInvite = can(user, "member.invite", resource);
  const divisions = canRoles ? await listDivisions() : [];

  const details: [string, string][] = [
    [t.dashboard.memberCode, profile.memberCode],
    [t.dashboard.division, profile.divisionName],
    [t.dashboard.batch, profile.batch],
    [t.profile.status, t.memberStatus[profile.status]],
    [t.profile.email, profile.email],
    [t.profile.phone, profile.phone ?? t.profile.phoneHidden],
    [t.profile.joined, dateFormat.format(profile.createdAt)],
    [
      t.dashboard.roles,
      ["anggota" as const, ...profile.roles].map((r) => t.roles[r]).join(", "),
    ],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.fullName}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {details.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.profile.card}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted-foreground">{t.profile.cardFormat}</dt>
            <dd>{profile.legacyCardAllowed ? t.profile.cardLegacy : t.profile.cardSigned}</dd>
            <dt className="text-muted-foreground">{t.profile.cardVersion}</dt>
            <dd>{profile.cardVersion}</dd>
            <dt className="text-muted-foreground">{t.profile.cardStatus}</dt>
            <dd>
              <Badge variant={profile.cardStatus === "active" ? "secondary" : "destructive"}>
                {t.cardStatus[profile.cardStatus]}
              </Badge>
            </dd>
          </dl>
          {canPrint && profile.cardStatus === "active" ? (
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/anggota/kartu?anggota=${profile.id}`} />}
              nativeButton={false}
            >
              {t.profile.downloadCard}
            </Button>
          ) : null}

          {canReissue ? (
            <div className="space-y-2 border-t pt-4">
              <p className="font-medium">{t.profile.reissue}</p>
              <p className="text-muted-foreground">{t.profile.reissueHint}</p>
              <ActionForm action={reissueCardAction} submitLabel={t.profile.reissue} variant="destructive">
                <input type="hidden" name="memberId" value={profile.id} />
                <NoteField id="reissue-note" />
              </ActionForm>
            </div>
          ) : null}

          {canBlock ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-muted-foreground">{t.profile.blockHint}</p>
              <ActionForm
                action={setCardStatusAction}
                submitLabel={profile.cardStatus === "active" ? t.profile.block : t.profile.unblock}
                variant="outline"
              >
                <input type="hidden" name="memberId" value={profile.id} />
                <input
                  type="hidden"
                  name="status"
                  value={profile.cardStatus === "active" ? "blocked" : "active"}
                />
                <NoteField id="block-note" />
              </ActionForm>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canRoles ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.roles}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveRolesAction} submitLabel={t.profile.saveRoles} className="space-y-4 text-sm">
              <input type="hidden" name="memberId" value={profile.id} />
              <fieldset className="flex flex-wrap gap-4">
                {(["admin", "koordinator", "bendahara"] as const).map((role) => (
                  <label key={role} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="roles"
                      value={role}
                      defaultChecked={profile.roles.includes(role)}
                    />
                    {t.roles[role]}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-muted-foreground">{t.profile.coordinatorDivisions}</legend>
                <div className="flex flex-wrap gap-4">
                  {divisions.map((d) => (
                    <label key={d.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="divisionIds"
                        value={d.id}
                        defaultChecked={profile.coordinatorDivisionIds.includes(d.id)}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.invite}</CardTitle>
            <CardDescription>{t.profile.inviteHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={resendInviteAction} submitLabel={t.profile.resendInvite} variant="outline">
              <input type="hidden" name="memberId" value={profile.id} />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
