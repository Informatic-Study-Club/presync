import { NextResponse } from "next/server";
import { routeSession } from "@/lib/auth/session";
import { pdfResponse, renderCardsPdf } from "@/lib/cards/pdf";
import { cardsForPrint } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

// Unduh kartu milik sendiri.
export async function GET() {
  const session = await routeSession();
  if (!session) return NextResponse.json({ error: t.errors.forbidden }, { status: 401 });

  const cards = await cardsForPrint(session.user, { memberIds: [session.user.id] });
  if (cards.length === 0) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });

  const pdf = await renderCardsPdf(cards);
  return pdfResponse(pdf, `kartu-${session.member.memberCode}.pdf`);
}
