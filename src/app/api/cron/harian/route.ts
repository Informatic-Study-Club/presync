import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { enqueueArrearsDigest, enqueueSessionReminders } from "@/lib/notifications/jobs";
import { processOutbox } from "@/lib/notifications/worker";
import { isAuthorizedCron } from "@/lib/security/cron";

// Cron harian Vercel (vercel.json, 08:00 WIB): ping database, pengingat H-1,
// digest tunggakan tiap Senin, lalu kirim antrean semua kanal.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Ping database agar proyek Supabase gratis tidak di-pause.
  await getDb().execute(sql`select 1`);
  const reminders = await enqueueSessionReminders("h1");
  const digest = await enqueueArrearsDigest();
  const outbox = await processOutbox();
  return NextResponse.json({ ok: true, reminders, digest, outbox });
}
