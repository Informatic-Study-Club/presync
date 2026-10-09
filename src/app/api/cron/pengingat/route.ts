import { NextResponse } from "next/server";
import { enqueueSessionReminders } from "@/lib/notifications/jobs";
import { processOutbox } from "@/lib/notifications/worker";
import { isAuthorizedCron } from "@/lib/security/cron";

// Dipanggil GitHub Actions tiap 15 menit (.github/workflows/pengingat.yml),
// karena cron Vercel Hobby hanya harian: pengingat "1 jam sebelum" lalu kirim
// antrean. Kuota email tetap dijaga worker.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const reminders = await enqueueSessionReminders("1h");
  const outbox = await processOutbox();
  return NextResponse.json({ ok: true, reminders, outbox });
}
