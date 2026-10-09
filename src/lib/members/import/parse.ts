import ExcelJS from "exceljs";
import Papa from "papaparse";
import { id as t } from "@/messages/id";
import { IMPORT_COLUMNS, type ImportColumn, type RawImportRow, REQUIRED_COLUMNS } from "./plan";

// Membaca file impor CSV/XLSX menjadi baris mentah. Validasi isi ada di plan.ts.

export const MAX_IMPORT_BYTES = 512 * 1024;
export const MAX_IMPORT_ROWS = 500;
const PREFERRED_SHEET = "Anggota";
const BOM_PREFIX = new RegExp(`^${String.fromCodePoint(0xfeff)}`);

export type ParseResult =
  | { ok: true; rows: RawImportRow[] }
  | { ok: false; error: string };

const HEADER_ALIASES: Record<string, ImportColumn> = {
  nama_lengkap: "nama",
  no_hp: "no_hp",
  nohp: "no_hp",
  hp: "no_hp",
  nomor_hp: "no_hp",
  no_telepon: "no_hp",
  kode: "kode_id",
  kodeid: "kode_id",
  kode_anggota: "kode_id",
};

export function headerToColumn(header: string): ImportColumn | null {
  const normalized = header
    .trim()
    .toLowerCase()
    .replace(/[\s.\-/]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if ((IMPORT_COLUMNS as readonly string[]).includes(normalized)) {
    return normalized as ImportColumn;
  }
  return HEADER_ALIASES[normalized] ?? null;
}

/** Nilai sel ExcelJS menjadi teks (rich text, hyperlink, rumus, angka). */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return v.richText.map((part) => cellToString((part as { text?: unknown }).text)).join("");
    }
    if ("text" in v) return cellToString(v.text);
    if ("result" in v) return cellToString(v.result);
    if ("error" in v) return "";
  }
  return "";
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function toRows(table: { rowNumber: number; cells: string[] }[]): ParseResult {
  const [header, ...body] = table;
  if (!header) return { ok: false, error: t.import.fileErrors.empty };

  const mapping = new Map<number, ImportColumn>();
  header.cells.forEach((cell, index) => {
    const column = headerToColumn(cell);
    if (column && ![...mapping.values()].includes(column)) mapping.set(index, column);
  });
  const found = new Set(mapping.values());
  const missing = REQUIRED_COLUMNS.filter((c) => !found.has(c));
  if (missing.length > 0) {
    return { ok: false, error: t.import.fileErrors.missingColumns(missing.join(", ")) };
  }

  const rows: RawImportRow[] = [];
  for (const line of body) {
    const values: RawImportRow["values"] = {};
    for (const [index, column] of mapping) {
      const value = (line.cells[index] ?? "").trim();
      if (value) values[column] = value;
    }
    if (Object.keys(values).length === 0) continue; // baris kosong
    rows.push({ rowNumber: line.rowNumber, values });
  }

  if (rows.length === 0) return { ok: false, error: t.import.fileErrors.empty };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: t.import.fileErrors.tooManyRows(MAX_IMPORT_ROWS) };
  }
  return { ok: true, rows };
}

export type SheetRow = { rowNumber: number; cells: string[] };
export type ReadResult = { ok: true; table: SheetRow[] } | { ok: false; error: string };

function readCsv(data: Uint8Array): ReadResult {
  const text = new TextDecoder("utf-8").decode(data).replace(BOM_PREFIX, "");
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  if (result.errors.some((e) => e.type === "Quotes")) {
    return { ok: false, error: t.import.fileErrors.unreadable };
  }
  return { ok: true, table: result.data.map((cells, index) => ({ rowNumber: index + 1, cells })) };
}

async function readXlsx(data: Uint8Array, preferredSheet?: string): Promise<ReadResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  } catch {
    return { ok: false, error: t.import.fileErrors.unreadable };
  }
  const sheet = (preferredSheet && workbook.getWorksheet(preferredSheet)) || workbook.worksheets[0];
  if (!sheet) return { ok: false, error: t.import.fileErrors.empty };

  const table: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellToString(cell.value);
    });
    table.push({ rowNumber, cells: Array.from(cells, (c) => c ?? "") });
  });
  return { ok: true, table };
}

/**
 * Membaca CSV/XLSX menjadi tabel sel teks (baris pertama = header). Dipakai
 * impor anggota dan impor arsip kehadiran. XLSX memakai sheet `preferredSheet`
 * bila ada, selain itu sheet pertama.
 */
export async function readSpreadsheet(
  fileName: string,
  data: Uint8Array,
  preferredSheet?: string,
): Promise<ReadResult> {
  if (data.byteLength > MAX_IMPORT_BYTES) {
    return { ok: false, error: t.import.fileErrors.tooLarge(MAX_IMPORT_BYTES / 1024) };
  }
  switch (fileExtension(fileName)) {
    case "csv":
      return readCsv(data);
    case "xlsx":
      return readXlsx(data, preferredSheet);
    default:
      return { ok: false, error: t.import.fileErrors.unsupported };
  }
}

export async function parseImportFile(fileName: string, data: Uint8Array): Promise<ParseResult> {
  const read = await readSpreadsheet(fileName, data, PREFERRED_SHEET);
  return read.ok ? toRows(read.table) : read;
}
