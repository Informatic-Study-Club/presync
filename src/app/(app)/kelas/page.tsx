import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listActivities, listClasses, loadViewer, managedDivisions } from "@/lib/academic/queries";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.academic.classes.title };

const c = t.academic.classes;
const timeFormat = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export default async function ClassesPage() {
  const session = await requireSession();
  const viewer = await loadViewer(session);
  const [classList, activities, managed] = await Promise.all([
    listClasses(viewer),
    listActivities(viewer, new Date()),
    managedDivisions(session.user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{c.title}</h1>
        {managed.length > 0 ? (
          <div className="flex gap-2">
            <Button size="sm" render={<Link href="/kelas/baru" />} nativeButton={false}>
              {c.create}
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/kegiatan/baru" />} nativeButton={false}>
              {c.createActivity}
            </Button>
          </div>
        ) : null}
      </div>

      {classList.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {classList.map((cls) => (
            <Link key={cls.id} href={`/kelas/${cls.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle>{cls.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{cls.divisionName}</Badge>
                    <Badge variant="outline">
                      {cls.yearName} {cls.termName}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">{c.progress(cls.doneSessions, cls.plannedSessions)}</p>
                  <p className="text-muted-foreground">{c.enrolled(cls.enrolled)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{c.activities}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {activities.length === 0 ? (
            <p className="text-muted-foreground">{c.noActivities}</p>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-muted-foreground">
                    {timeFormat.format(a.startsAt)} · {a.location ?? t.academic.mode[a.mode]}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{a.divisionName ?? t.academic.allDivisions}</Badge>
                  <Badge variant={a.status === "off" ? "destructive" : "secondary"}>
                    {t.academic.sessionStatus[a.status]}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
