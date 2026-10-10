import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { checkRange, daysBetween, formatCell, type Report, reportFileName } from "./model";
import { renderCsv, renderPdf, renderXlsx } from "./render";

const report: Report = {
  slug: "kas-2026-10",
  title: "Laporan Kas Bulanan",
  period: "Periode: 2026-10",
  meta: [
    { label: "Saldo awal", value: "Rp 100.000" },
    { label: "Saldo akhir", value: "Rp 125.000" },
  ],
  columns: [
    { key: "date", label: "Tanggal", type: "text" },
    { key: "description", label: "Keterangan", type: "text", width: 3 },
    { key: "income", label: "Pemasukan", type: "rupiah" },
    { key: "expense", label: "Pengeluaran", type: "rupiah" },
    { key: "percent", label: "Hadir (%)", type: "percent" },
  ],
  rows: [
    { date: "2026-10-05", description: 'Iuran "Oktober", kelas A', income: 50000, expense: null, percent: 85.7 },
    { date: "2026-10-06", description: "Konsumsi rapat", income: null, expense: 25000, percent: null },
  ],
  totals: { description: "Total", income: 50000, expense: 25000 },
  generatedBy: "Bendahara Uji",
  generatedAt: new Date("2026-10-31T10:00:00Z"),
};

describe("model laporan", () => {
  test("format sel", () => {
    expect(formatCell(50000, "rupiah").replace(/\s/g, " ")).toMatch(/^Rp\s?50\.000$/);
    expect(formatCell(85.7, "percent")).toBe("85,7%");
    expect(formatCell(1234, "number")).toBe("1.234");
    expect(formatCell(null, "rupiah")).toBe("-");
    expect(formatCell("teks", "text")).toBe("teks");
  });

  test("nama file aman", () => {
    expect(reportFileName({ slug: "Kehadiran Web Dev #1 / 2026" }, "pdf")).toBe("kehadiran-web-dev-1-2026.pdf");
    expect(reportFileName({ slug: "../../etc" }, "csv")).toBe("etc.csv");
  });

  test("rentang periode", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(31);
    expect(checkRange("2026-10-01", "2026-10-01")).toEqual({ ok: true });
    expect(checkRange("2026-10-02", "2026-10-01")).toEqual({ ok: false, reason: "order" });
    expect(checkRange("2026-01-01", "2026-12-31")).toEqual({ ok: true });
    expect(checkRange("2026-01-01", "2027-01-02")).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("renderer", () => {
  test("CSV: BOM, header, escape tanda kutip/koma, nilai mentah, baris total", () => {
    const csv = renderCsv(report);
    expect(csv.codePointAt(0)).toBe(0xfeff);
    const parsed = Papa.parse<string[]>(csv.slice(1).trim()).data;
    expect(parsed[0]).toEqual(["Tanggal", "Keterangan", "Pemasukan", "Pengeluaran", "Hadir (%)"]);
    expect(parsed[1]).toEqual(["2026-10-05", 'Iuran "Oktober", kelas A', "50000", "", "85.7"]);
    expect(parsed[3]).toEqual(["", "Total", "50000", "25000", ""]);
  });

  test("XLSX: bisa dibaca ulang, angka tetap angka", async () => {
    const bytes = await renderXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const values: unknown[][] = [];
    ws.eachRow((row) => values.push((row.values as unknown[]).slice(1)));
    expect(values[1]?.[0]).toBe("Laporan Kas Bulanan");
    const headerIndex = values.findIndex((r) => r[0] === "Tanggal");
    expect(headerIndex).toBeGreaterThan(0);
    // Sel kosong dibaca ExcelJS sebagai undefined (array jarang).
    expect(values[headerIndex + 1]).toEqual(["2026-10-05", 'Iuran "Oktober", kelas A', 50000, undefined, 85.7]);
    expect(ws.getColumn(3).numFmt).toBe('"Rp"#,##0');
  });

  test("PDF: valid dan font Inter tertanam", async () => {
    const bytes = await renderPdf(report);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toMatch(/\/FontFile2?|\/FontFile3/);
    expect(text).toContain("Inter");
    expect(text).not.toContain("/BaseFont /Helvetica");
  });

  test("PDF banyak baris tetap terbentuk (beberapa halaman)", async () => {
    const many = { ...report, rows: Array.from({ length: 300 }, (_, i) => ({ ...report.rows[0]!, description: `Baris ${i}` })) };
    const text = new TextDecoder("latin1").decode(await renderPdf(many));
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(3);
  });
});
