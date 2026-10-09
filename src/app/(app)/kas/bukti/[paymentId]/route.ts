import { NextResponse } from "next/server";
import { z } from "zod";
import { routeSession } from "@/lib/auth/session";
import { proofPathFor } from "@/lib/finance/service";
import { signedProofUrl } from "@/lib/finance/storage";
import { id as t } from "@/messages/id";

// Bukti pembayaran: dialihkan ke signed URL 60 detik setelah izin dicek.
export async function GET(_request: Request, { params }: RouteContext<"/kas/bukti/[paymentId]">) {
  const session = await routeSession();
  if (!session) return NextResponse.json({ error: t.errors.forbidden }, { status: 401 });
  const id = z.uuid().safeParse((await params).paymentId);
  if (!id.success) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });

  const path = await proofPathFor(session.user, id.data);
  const url = path ? await signedProofUrl(path) : null;
  if (!url) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
}
