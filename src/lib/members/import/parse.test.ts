import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { cellToString, headerToColumn, MAX_IMPORT_ROWS, parseImportFile } from "./parse";

const encoder = new TextEncoder();

async function xlsx(build: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("cellToString", () => {
  test.each([
    [null, ""],
    [undefined, ""],
    ["teks", "teks"],
    [81234567890, "81234567890"],
    [6281234567890, "6281234567890"],
    [1.5, "1.5"],
    [true, "TRUE"],
    [{ richText: [{ text: "Budi " }, { text: "Santoso" }] }, "Budi Santoso"],
    [{ text: "a@contoh.com", hyperlink: "mailto:a@contoh.com" }, "a@contoh.com"],
    [{ formula: "A1", result: 42 }, "42"],
    [{ error: "#N/A" }, ""],
  ])("%p -> %p", (input, expected) => {
    expect(cellToString(input)).toBe(expected);
  });
});

describe("headerToColumn", () => {
  test.each([
    ["nama", "nama"],
    [" Nama ", "nama"],
    ["No HP", "no_hp"],
    ["no-hp", "no_hp"],
    ["Kode ID", "kode_id"],
    ["catatan", null],
  ])("%p -> %p", (input, expected) => {
    expect(headerToColumn(input)).toBe(expected as never);
  });
});

describe("parseImportFile: CSV", () => {
  test("koma, BOM, baris kosong dilewati, kolom lain diabaikan", async () => {
    const csv =
      String.fromCodePoint(0xfeff) +
      "nama,email,no_hp,divisi,batch,kode_id,catatan\n" +
      "Budi,budi@contoh.com,081234567890,UI/UX,01,ISC2601001,cek\n" +
      ",,,,,,\n" +
      "Siti,siti@contoh.com,081234567891,ML,01,,\n";
    const result = await parseImportFile("anggota.csv", encoder.encode(csv));
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          rowNumber: 2,
          values: {
            nama: "Budi",
            email: "budi@contoh.com",
            no_hp: "081234567890",
            divisi: "UI/UX",
            batch: "01",
            kode_id: "ISC2601001",
          },
        },
        {
          rowNumber: 4,
          values: { nama: "Siti", email: "siti@contoh.com", no_hp: "081234567891", divisi: "ML", batch: "01" },
        },
      ],
    });
  });

  test("pemisah titik koma (Excel lokal Indonesia)", async () => {
    const csv = "nama;email;no_hp;divisi;batch\nBudi;budi@contoh.com;0812;Web;01\n";
    const result = await parseImportFile("a.csv", encoder.encode(csv));
    expect(result.ok && result.rows[0]?.values.email).toBe("budi@contoh.com");
  });

  test("kolom wajib hilang", async () => {
    const result = await parseImportFile("a.csv", encoder.encode("nama,email\nBudi,b@c.com\n"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("no_hp, divisi, batch");
  });

  test("tanpa baris data", async () => {
    const result = await parseImportFile("a.csv", encoder.encode("nama,email,no_hp,divisi,batch\n"));
    expect(result.ok).toBe(false);
  });

  test("terlalu banyak baris", async () => {
    const lines = ["nama,email,no_hp,divisi,batch"];
    for (let i = 0; i <= MAX_IMPORT_ROWS; i++) lines.push(`N${i},n${i}@c.com,0812,Web,01`);
    const result = await parseImportFile("a.csv", encoder.encode(lines.join("\n")));
    expect(!result.ok && result.error).toContain(String(MAX_IMPORT_ROWS));
  });
});

describe("parseImportFile: XLSX", () => {
  test("membaca sheet Anggota, hyperlink, dan angka HP", async () => {
    const data = await xlsx((wb) => {
      wb.addWorksheet("Petunjuk").addRow(["bukan data"]);
      const ws = wb.addWorksheet("Anggota");
      ws.addRow(["nama", "email", "no_hp", "divisi", "batch", "kode_id", "catatan"]);
      ws.addRow([
        "Budi",
        { text: "budi@contoh.com", hyperlink: "mailto:budi@contoh.com" },
        81234567890,
        "UI/UX",
        "01",
        "ISC2601001",
        "cek kartu",
      ]);
      ws.addRow(["Siti", "siti@contoh.com", "081234567891", "Machine Learning", 1, null, null]);
    });
    const result = await parseImportFile("template.xlsx", data);
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          rowNumber: 2,
          values: {
            nama: "Budi",
            email: "budi@contoh.com",
            no_hp: "81234567890",
            divisi: "UI/UX",
            batch: "01",
            kode_id: "ISC2601001",
          },
        },
        {
          rowNumber: 3,
          values: {
            nama: "Siti",
            email: "siti@contoh.com",
            no_hp: "081234567891",
            divisi: "Machine Learning",
            batch: "1",
          },
        },
      ],
    });
  });

  test("tanpa sheet Anggota memakai sheet pertama", async () => {
    const data = await xlsx((wb) => {
      const ws = wb.addWorksheet("Data");
      ws.addRow(["nama", "email", "no_hp", "divisi", "batch"]);
      ws.addRow(["Budi", "b@c.com", "0812", "Web", "01"]);
    });
    const result = await parseImportFile("a.xlsx", data);
    expect(result.ok && result.rows).toHaveLength(1);
  });

  test("file rusak dan format lain ditolak", async () => {
    expect((await parseImportFile("a.xlsx", encoder.encode("bukan zip"))).ok).toBe(false);
    expect((await parseImportFile("a.xls", encoder.encode("x"))).ok).toBe(false);
  });

  test("file terlalu besar ditolak", async () => {
    const result = await parseImportFile("a.csv", new Uint8Array(600 * 1024));
    expect(!result.ok && result.error).toContain("512 KB");
  });
});
