import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { sessionDashboard } from "@/lib/attendance/service";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { AttendanceScanner } from "./scanner";

export const metadata: Metadata = { title: t.attendance.scanner.title };

export default async function ScannerPage({ params }: PageProps<"/presensi/[sessionId]/pindai">) {
  const { user } = await requireSession();
  const id = z.uuid().safeParse((await params).sessionId);
  if (!id.success) notFound();
  // Hanya untuk memeriksa hak dan menampilkan judul; pencatatan tetap dicek ulang di server.
  const dashboard = await sessionDashboard(user, id.data);
  if (!dashboard) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t.attendance.scanner.title}</h1>
          <p className="text-sm text-muted-foreground">{dashboard.session.title}</p>
        </div>
        <Link href={`/presensi/${id.data}`} className="text-sm text-primary underline-offset-4 hover:underline">
          {t.attendance.scanner.backToSession}
        </Link>
      </div>
      <AttendanceScanner sessionId={id.data} />
    </div>
  );
}
