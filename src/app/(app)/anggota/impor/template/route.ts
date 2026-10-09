import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { can } from "@/lib/authz";
import { routeSession } from "@/lib/auth/session";
import { MAX_IMPORT_ROWS } from "@/lib/members/import/parse";
import { IMPORT_COLUMNS } from "@/lib/members/import/plan";
import { listDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

// Template impor kosong (tanpa data anggota nyata).
export async function GET() {
  const session = await routeSession();
  if (!session || !can(session.user, "member.import")) {
    return NextResponse.json({ error: t.errors.forbidden }, { status: 401 });
  }
  const divisionNames = (await listDivisions()).map((d) => d.name);

  const wb = new ExcelJS.Workbook();
  wb.creator = t.app.name;
  const ws = wb.addWorksheet("Anggota");
  ws.columns = [
    { header: "nama", key: "nama", width: 32 },
    { header: "email", key: "email", width: 30 },
    { header: "no_hp", key: "no_hp", width: 18, style: { numFmt: "@" } },
    { header: "divisi", key: "divisi", width: 20 },
    { header: "batch", key: "batch", width: 8, style: { numFmt: "@" } },
    { header: "kode_id", key: "kode_id", width: 14, style: { numFmt: "@" } },
    { header: "catatan", key: "catatan", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const lastRow = MAX_IMPORT_ROWS + 1;
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${divisionNames.join(",")}"`],
    };
  }

  const guide = wb.addWorksheet("Petunjuk");
  guide.columns = [{ width: 14 }, { width: 90 }];
  guide.addRows([
    ["Kolom", "Keterangan"],
    ["nama", "Nama lengkap. Spasi berlebih dirapikan otomatis, huruf kapital tidak diubah."],
    ["email", "Email aktif untuk login dan undangan aktivasi. Harus unik."],
    ["no_hp", "Nomor seluler, format 08xx, 628xx, atau +628xx. Disimpan sebagai +62. Harus unik."],
    ["divisi", `Salah satu: ${divisionNames.join(", ")}.`],
    ["batch", "2 digit, misalnya 01."],
    ["kode_id", "Opsional. Isi persis seperti di kartu fisik (ISC + 7 digit). Kosongkan untuk dibuat otomatis."],
    ["catatan", "Tidak diimpor."],
    [],
    ["Batas", `Maksimal ${MAX_IMPORT_ROWS} baris per file. Kolom wajib: ${IMPORT_COLUMNS.filter((c) => c !== "kode_id").join(", ")}.`],
  ]);
  guide.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-impor-anggota-presync.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
