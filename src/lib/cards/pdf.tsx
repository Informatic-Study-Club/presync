import "server-only";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { optionalSecret } from "@/lib/env";
import { id as t } from "@/messages/id";
import { barcodePng } from "./render";
import { printedCardBarcode } from "./token";

// Kartu ukuran CR80 (85,6 x 54 mm), 10 kartu per halaman A4 dengan garis potong.
const MM = 72 / 25.4;
const CARD_W = 85.6 * MM;
const CARD_H = 54 * MM;
const PER_PAGE = 10;
const ACCENT = "#0369a1";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 24,
    paddingHorizontal: (595.28 - CARD_W * 2 - 12) / 2,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 6,
    fontFamily: "Helvetica",
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderWidth: 0.5,
    borderColor: "#bbbbbb",
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 10,
    justifyContent: "space-between",
  },
  org: { fontSize: 7, fontFamily: "Helvetica-Bold", color: ACCENT, letterSpacing: 1 },
  name: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 4 },
  meta: { fontSize: 7.5, color: "#444444", marginTop: 2 },
  barcodeWrap: { alignItems: "center" },
  barcode: { width: CARD_W - 40, height: 34 },
  code: { fontSize: 9, fontFamily: "Courier-Bold", letterSpacing: 2, marginTop: 2 },
  qrRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  qr: { width: 70, height: 70 },
  footer: { fontSize: 5.5, color: "#777777" },
});

export type PrintableCard = {
  memberCode: string;
  fullName: string;
  divisionName: string;
  batch: string;
  cardVersion: number;
  legacyCardAllowed: boolean;
};

type Rendered = PrintableCard & { image: Buffer; symbology: "code128" | "qrcode" };

function Card({ card }: { card: Rendered }) {
  const header = (
    <View>
      <Text style={styles.org}>{t.cards.pdfOrg}</Text>
      <Text style={styles.name}>{card.fullName}</Text>
      <Text style={styles.meta}>
        {card.divisionName} · {t.dashboard.batch} {card.batch}
      </Text>
    </View>
  );

  if (card.symbology === "qrcode") {
    return (
      <View style={styles.card} wrap={false}>
        {header}
        <View style={styles.qrRow}>
          <View>
            <Text style={styles.code}>{card.memberCode}</Text>
            <Text style={styles.footer}>{t.cards.pdfFooter}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya alt */}
          <Image style={styles.qr} src={{ data: card.image, format: "png" }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card} wrap={false}>
      {header}
      <View style={styles.barcodeWrap}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya alt */}
        <Image style={styles.barcode} src={{ data: card.image, format: "png" }} />
        <Text style={styles.code}>{card.memberCode}</Text>
      </View>
    </View>
  );
}

export async function renderCardsPdf(cards: PrintableCard[]): Promise<Buffer> {
  const secret = optionalSecret("CARD_SECRET");
  const rendered: Rendered[] = await Promise.all(
    cards.map(async (card) => {
      const barcode = printedCardBarcode(card, secret);
      return { ...card, symbology: barcode.symbology, image: await barcodePng(barcode) };
    }),
  );

  const pages: Rendered[][] = [];
  for (let i = 0; i < rendered.length; i += PER_PAGE) pages.push(rendered.slice(i, i + PER_PAGE));

  return renderToBuffer(
    <Document title={`Kartu anggota ${t.app.org}`} author={t.app.org} creator={t.app.name}>
      {pages.map((page, index) => (
        <Page key={index} size="A4" style={styles.page}>
          {page.map((card) => (
            <Card key={card.memberCode} card={card} />
          ))}
        </Page>
      ))}
    </Document>,
  );
}

export function pdfResponse(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
