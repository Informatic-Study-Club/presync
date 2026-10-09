import { createEvents, type EventAttributes } from "ics";
import { addDays } from "./time";

// Feed iCalendar (.ics) untuk Google Calendar / Apple Calendar.

export type FeedSession = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  meetingUrl: string | null;
  status: "scheduled" | "done" | "off";
  offReason: string | null;
  updatedAt: Date;
};

export type FeedEvent = {
  id: string;
  title: string;
  /** Tanggal Jakarta, inklusif. */
  startsOn: string;
  endsOn: string;
  description: string | null;
};

const UID_DOMAIN = "presync.informaticstudyclub.com";

function dateArray(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return [y, m, d];
}

export function buildIcsFeed(input: {
  calendarName: string;
  sessions: readonly FeedSession[];
  events: readonly FeedEvent[];
}): string {
  const items: EventAttributes[] = [
    ...input.sessions.map(
      (s): EventAttributes => ({
        uid: `sesi-${s.id}@${UID_DOMAIN}`,
        title: s.title,
        start: s.startsAt.getTime(),
        startInputType: "utc",
        startOutputType: "utc",
        end: s.endsAt.getTime(),
        endInputType: "utc",
        endOutputType: "utc",
        location: s.location ?? undefined,
        url: s.meetingUrl ?? undefined,
        description: s.status === "off" ? (s.offReason ?? undefined) : undefined,
        status: s.status === "off" ? "CANCELLED" : "CONFIRMED",
        lastModified: s.updatedAt.getTime(),
      }),
    ),
    ...input.events.map(
      (e): EventAttributes => ({
        uid: `event-${e.id}@${UID_DOMAIN}`,
        title: e.title,
        start: dateArray(e.startsOn),
        // DTEND untuk event sepanjang hari bersifat eksklusif.
        end: dateArray(addDays(e.endsOn, 1)),
        description: e.description ?? undefined,
        transp: "TRANSPARENT",
      }),
    ),
  ];

  if (items.length === 0) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:presync",
      `X-WR-CALNAME:${input.calendarName}`,
      "END:VCALENDAR",
      "",
    ].join("\r\n");
  }

  const { error, value } = createEvents(items, {
    productId: "presync",
    calName: input.calendarName,
  });
  if (error || !value) throw error ?? new Error("Gagal membuat feed kalender");
  return value;
}
