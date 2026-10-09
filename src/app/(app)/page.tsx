import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.dashboard.title };

export default async function HomePage() {
  const { member, user } = await requireSession();

  const details: [string, string][] = [
    [t.dashboard.memberCode, member.memberCode],
    [t.dashboard.division, member.divisionName],
    [t.dashboard.batch, member.batch],
    [t.dashboard.roles, user.roles.map((r) => t.roles[r]).join(", ")],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.dashboard.greeting(member.fullName)}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
