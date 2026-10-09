import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarFeedTokens } from "@/db/schema";
import { loadSessionUser } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { buildIcsFeed } from "./ics";
import { agendaFor, loadViewer } from "./queries";

const DAY_MS = 24 * 60 * 60 * 1000;

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Feed .ics untuk token langganan, atau null bila token tidak berlaku. */
export async function icsForToken(token: string, now = new Date()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await getDb()
    .select({ memberId: calendarFeedTokens.memberId })
    .from(calendarFeedTokens)
    .where(eq(calendarFeedTokens.tokenHash, hashFeedToken(token)))
    .limit(1);
  if (!row) return null;

  const loaded = await loadSessionUser(row.memberId);
  if (!loaded || loaded.member.status !== "aktif") return null;

  const viewer = await loadViewer(loaded);
  const agenda = await agendaFor(
    viewer,
    new Date(now.getTime() - 60 * DAY_MS),
    new Date(now.getTime() + 365 * DAY_MS),
  );
  return buildIcsFeed({
    calendarName: t.academic.calendar.feedName(loaded.member.fullName),
    sessions: agenda.sessions,
    events: agenda.events,
  });
}
