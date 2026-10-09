import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routeSession } from "@/lib/auth/session";
import { pdfResponse, renderCardsPdf } from "@/lib/cards/pdf";
import { cardsForPrint } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

// Cetak kartu massal atau satuan: ?divisi=<uuid>&batch=01 atau ?anggota=<uuid>.
// Hanya kartu anggota yang boleh dicetak user (card.print) yang ikut.
const querySchema = z.object({
  divisi: z.uuid().optional(),
  batch: z.string().regex(/^\d{2}$/).optional(),
  anggota: z.uuid().optional(),
});

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await routeSession();
  if (!session) return NextResponse.json({ error: t.errors.forbidden }, { status: 401 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: t.auth.invalidInput }, { status: 400 });
  const { divisi, batch, anggota } = parsed.data;

  const cards = await cardsForPrint(session.user, {
    divisionId: divisi,
    batch,
    memberIds: anggota ? [anggota] : undefined,
  });
  if (cards.length === 0) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });

  const pdf = await renderCardsPdf(cards);
  const name = anggota && cards[0] ? cards[0].memberCode : `${batch ?? "semua"}-${cards.length}`;
  return pdfResponse(pdf, `kartu-${name}.pdf`);
}
