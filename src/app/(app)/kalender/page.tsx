import type { Metadata } from "next";
import Link from "next/link";
import { type CalendarItem, CalendarView } from "@/components/academic/calendar-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { agendaFor, hasFeedToken, loadViewer } from "@/lib/academic/queries";
import { addDays } from "@/lib/academic/time";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { FeedLink } from "./feed-link";

export const metadata: Metadata = { title: t.academic.calendar.title };

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_COLORS = { regular: "#0284c7", extra: "#7c3aed", activity: "#d97706" } as const;
const EVENT_COLORS = { holiday: "#dc2626", exam: "#ca8a04", activity: "#0d9488", deadline: "#db2777" } as const;

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export default async function CalendarPage() {
  const session = await requireSession();
  const viewer = await loadViewer(session);
  const now = new Date();
  const agenda = await agendaFor(viewer, new Date(now.getTime() - 90 * DAY_MS), new Date(now.getTime() + 300 * DAY_MS));
  const feed = await hasFeedToken(session.user.id);

  const items: CalendarItem[] = [
    ...agenda.sessions.map((s) => ({
      id: s.id,
      title: s.status === "off" ? `${s.title} (${t.academic.sessionStatus.off})` : s.title,
      start: s.startsAt.toISOString(),
      end: s.endsAt.toISOString(),
      allDay: false,
      color: s.status === "off" ? "#6b7280" : SESSION_COLORS[s.kind],
      url: s.classId ? `/kelas/${s.classId}` : undefined,
    })),
    ...agenda.events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.startsOn,
      end: addDays(e.endsOn, 1),
      allDay: true,
      color: EVENT_COLORS[e.kind],
    })),
  ];

  const upcoming = agenda.sessions.filter((s) => s.endsAt >= now && s.status !== "off").slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1>{t.academic.calendar.title}</h1>
          <p className="text-sm text-muted-foreground">{t.academic.calendar.description}</p>
        </div>
        {can(session.user, "calendar.manage") ? (
          <Button variant="outline" size="sm" render={<Link href="/kalender/kelola" />} nativeButton={false}>
            {t.academic.calendar.manage}
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-4">
          <CalendarView items={items} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.academic.calendar.upcoming}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground">{t.academic.calendar.empty}</p>
            ) : (
              upcoming.map((s) => (
                <div key={s.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-muted-foreground">
                      {timeFormat.format(s.startsAt)} · {s.location ?? t.academic.mode[s.mode]}
                    </p>
                  </div>
                  <Badge variant="outline">{t.academic.sessionKind[s.kind]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.academic.calendar.feedTitle}</CardTitle>
            <CardDescription>{t.academic.calendar.feedDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <FeedLink hasToken={feed} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
