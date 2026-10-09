import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { optionalSecret } from "@/lib/env";
import { processEmailOutbox } from "@/lib/notifications/worker";

// Cron harian Vercel (vercel.json). Vercel mengirim header
// Authorization: Bearer <CRON_SECRET> secara otomatis.
export const maxDuration = 60;

function authorized(header: string | null): boolean {
  const secret = optionalSecret("CRON_SECRET");
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Ping database agar proyek Supabase gratis tidak di-pause.
  await getDb().execute(sql`select 1`);
  const outbox = await processEmailOutbox();
  return NextResponse.json({ ok: true, outbox });
}
