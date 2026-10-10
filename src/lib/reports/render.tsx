import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { id as t } from "@/messages/id";
import { formatCell, printedAtFormat, type Report, type ReportFormat } from "./model";

// Renderer laporan ke CSV, XLSX, dan PDF.

// ---------------------------------------------------------------- CSV

/** CSV UTF-8 dengan BOM agar Excel membaca huruf dengan benar. Nilai mentah. */
export function renderCsv(report: Report): string {
  const header = report.columns.map((c) => c.label);
  const rows = report.rows.map((row) => report.columns.map((c) => row[c.key] ?? ""));
  if (report.totals) rows.push(report.columns.map((c) => report.totals?.[c.key] ?? ""));
  return `${String.fromCodePoint(0xfeff)}${Papa.unparse([header, ...rows])}\r\n`;
}

// ---------------------------------------------------------------- XLSX

const XLSX_FORMATS = { text: "@", number: "#,##0", rupiah: '"Rp"#,##0', percent: '0.0"%"' } as const;

export async function renderXlsx(report: Report): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = t.app.name;
  wb.created = report.generatedAt;
  const ws = wb.addWorksheet(t.reports.sheetName);

  ws.addRow([t.cards.pdfOrg]).font = { bold: true };
  ws.addRow([report.title]).font = { bold: true, size: 14 };
  ws.addRow([report.period]);
  for (const m of report.meta) ws.addRow([m.label, m.value]);
  ws.addRow([t.reports.generatedBy, report.generatedBy]);
  ws.addRow([t.reports.printedAt, printedAtFormat.format(report.generatedAt)]);
  ws.addRow([]);

  const headerRow = ws.addRow(report.columns.map((c) => c.label));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
    cell.border = { bottom: { style: "thin" } };
  });
  ws.views = [{ state: "frozen", ySplit: headerRow.number }];

  const addData = (row: Record<string, unknown>, bold = false) => {
    const added = ws.addRow(report.columns.map((c) => row[c.key] ?? null));
    if (bold) added.font = { bold: true };
  };
  for (const row of report.rows) addData(row);
  if (report.totals) addData(report.totals, true);

  report.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.numFmt = XLSX_FORMATS[c.type];
    col.width = Math.min(48, Math.max(10, c.label.length + 2, ...report.rows.slice(0, 200).map((r) => String(r[c.key] ?? "").length + 2)));
  });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- PDF

// Font tertanam (Inter, lisensi OFL) dari paket @fontsource/inter. File font
// disertakan ke fungsi Vercel lewat outputFileTracingIncludes di next.config.ts.
const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "inter", "files");
let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "inter-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const ACCENT = "#0369a1";
const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontFamily: "Inter", fontSize: 8.5, color: "#111111" },
  org: { fontSize: 8, fontWeight: 700, color: ACCENT, letterSpacing: 1 },
  title: { fontSize: 14, fontWeight: 700, marginTop: 2 },
  period: { fontSize: 9, color: "#444444", marginTop: 2 },
  meta: { flexDirection: "row", flexWrap: "wrap", marginTop: 6, columnGap: 16, rowGap: 2 },
  metaItem: { fontSize: 8.5 },
  metaLabel: { color: "#666666" },
  table: { marginTop: 12, borderTopWidth: 0.5, borderColor: "#999999" },
  headerRow: { flexDirection: "row", backgroundColor: "#e0f2fe", borderBottomWidth: 0.5, borderColor: "#999999" },
  row: { flexDirection: "row", borderBottomWidth: 0.25, borderColor: "#cccccc" },
  totalRow: { flexDirection: "row", borderTopWidth: 0.75, borderColor: "#666666" },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  bold: { fontWeight: 700 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#666666",
  },
});

function ReportPdf({ report }: { report: Report }) {
  const totalWidth = report.columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  const cellStyle = (c: Report["columns"][number]) => [
    styles.cell,
    { width: `${((c.width ?? 1) / totalWidth) * 100}%`, textAlign: c.type === "text" ? ("left" as const) : ("right" as const) },
  ];
  const printed = printedAtFormat.format(report.generatedAt);

  return (
    <Document title={report.title} author={t.app.org} creator={t.app.name} producer={t.app.name}>
      <Page size="A4" orientation={report.columns.length > 7 ? "landscape" : "portrait"} style={styles.page}>
        <View fixed>
          <Text style={styles.org}>{t.cards.pdfOrg}</Text>
        </View>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.period}>{report.period}</Text>
        <View style={styles.meta}>
          {report.meta.map((m) => (
            <Text key={m.label} style={styles.metaItem}>
              <Text style={styles.metaLabel}>{m.label}: </Text>
              {m.value}
            </Text>
          ))}
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow} fixed>
            {report.columns.map((c) => (
              <Text key={c.key} style={[...cellStyle(c), styles.bold]}>
                {c.label}
              </Text>
            ))}
          </View>
          {report.rows.length === 0 ? (
            <Text style={styles.cell}>{t.reports.noRows}</Text>
          ) : (
            report.rows.map((row, i) => (
              <View key={i} style={styles.row} wrap={false}>
                {report.columns.map((c) => (
                  <Text key={c.key} style={cellStyle(c)}>
                    {formatCell(row[c.key] ?? null, c.type)}
                  </Text>
                ))}
              </View>
            ))
          )}
          {report.totals ? (
            <View style={styles.totalRow} wrap={false}>
              {report.columns.map((c) => (
                <Text key={c.key} style={[...cellStyle(c), styles.bold]}>
                  {report.totals?.[c.key] === undefined ? "" : formatCell(report.totals[c.key] ?? null, c.type)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.footer} fixed>
          <Text>{t.reports.footer(report.generatedBy, printed)}</Text>
          <Text render={({ pageNumber, totalPages }) => t.reports.pageOf(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPdf(report: Report): Promise<Uint8Array> {
  registerFonts();
  return new Uint8Array(await renderToBuffer(<ReportPdf report={report} />));
}

export const CONTENT_TYPES: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

export async function renderReport(report: Report, format: ReportFormat): Promise<Uint8Array> {
  switch (format) {
    case "pdf":
      return renderPdf(report);
    case "xlsx":
      return renderXlsx(report);
    case "csv":
      return new TextEncoder().encode(renderCsv(report));
  }
}
