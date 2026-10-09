import { id as t } from "@/messages/id";
import type { SheetRow } from "@/lib/members/import/parse";

// Perencana impor arsip ringkasan kehadiran dari Google Sheets (fungsi murni).
// Dua format diterima:
// 1. Ringkasan: kolom hadir, izin, sakit, tidak_hadir (angka).
// 2. Per pertemuan: kolom p1, p2, ... (atau pertemuan_1, ...) berisi H/I/S/A.
//    Pertemuan yang kosong untuk semua baris dianggap belum terisi dan tidak
//    dihitung; baris dengan sel kosong ditandai "perlu verifikasi".

const SUMMARY_COLUMNS = ["hadir", "izin", "sakit", "tidak_hadir"] as const;
type Counts = { hadir: number; izin: number; sakit: number; tidakHadir: number };

const MEETING_HEADER = /^(?:p|pertemuan_?)(\d{1,2})$/;
const CHECK_MARK = String.fromCodePoint(0x2713);

const VALUE_MAP: Record<string, keyof Counts> = {
  h: "hadir",
  hadir: "hadir",
  v: "hadir",
  "1": "hadir",
  [CHECK_MARK]: "hadir",
  i: "izin",
  izin: "izin",
  s: "sakit",
  sakit: "sakit",
  a: "tidakHadir",
  alpa: "tidakHadir",
  alpha: "tidakHadir",
  th: "tidakHadir",
  "tidak hadir": "tidakHadir",
  tidak_hadir: "tidakHadir",
  "0": "tidakHadir",
  "-": "tidakHadir",
};

export type ArchiveMember = { id: string; divisionId: string; fullName: string };

export type PlannedArchiveRow = {
  rowNumber: number;
  memberCode: string;
  memberName: string | null;
  memberId: string | null;
  divisionId: string | null;
  counts: Counts;
  needsVerification: boolean;
  note: string | null;
  errors: string[];
};

export type ArchivePlan =
  | { ok: true; rows: PlannedArchiveRow[]; validCount: number; mode: "summary" | "meetings" }
  | { ok: false; error: string };

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s.\-/]+/g, "_").replace(/^_+|_+$/g, "");
}

export function planArchiveImport(
  table: readonly SheetRow[],
  members: ReadonlyMap<string, ArchiveMember>,
): ArchivePlan {
  const [header, ...body] = table;
  if (!header) return { ok: false, error: t.import.fileErrors.empty };
  const headers = header.cells.map(normalizeHeader);

  const codeIndex = headers.findIndex((h) => h === "kode_id" || h === "kode" || h === "kodeid");
  if (codeIndex === -1) return { ok: false, error: t.attendance.archive.missingCode };

  const summaryIndex = new Map<string, number>();
  for (const col of SUMMARY_COLUMNS) {
    const index = headers.indexOf(col);
    if (index !== -1) summaryIndex.set(col, index);
  }
  const meetings = headers
    .map((h, index) => ({ match: MEETING_HEADER.exec(h), index, label: header.cells[index]?.trim() ?? h }))
    .filter((m) => m.match !== null);

  const mode: "summary" | "meetings" | null =
    summaryIndex.size > 0 ? "summary" : meetings.length > 0 ? "meetings" : null;
  if (!mode) return { ok: false, error: t.attendance.archive.noCountColumns };

  const dataRows = body.filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (dataRows.length === 0) return { ok: false, error: t.import.fileErrors.empty };

  // Pertemuan yang kosong untuk semua baris: belum terisi (misalnya ML-1).
  const emptyMeetings = meetings.filter((m) => dataRows.every((r) => !(r.cells[m.index] ?? "").trim()));
  const usedMeetings = meetings.filter((m) => !emptyMeetings.includes(m));

  const rows: PlannedArchiveRow[] = dataRows.map((r) => {
    const errors: string[] = [];
    const memberCode = (r.cells[codeIndex] ?? "").trim();
    const member = memberCode ? members.get(memberCode) : undefined;
    if (!memberCode) errors.push(t.attendance.archive.errors.codeMissing);
    else if (!member) errors.push(t.attendance.archive.errors.codeUnknown);

    const counts: Counts = { hadir: 0, izin: 0, sakit: 0, tidakHadir: 0 };
    const notes: string[] = [];
    let needsVerification = emptyMeetings.length > 0;

    if (mode === "summary") {
      for (const col of SUMMARY_COLUMNS) {
        const index = summaryIndex.get(col);
        const raw = index === undefined ? "" : (r.cells[index] ?? "").trim();
        if (raw === "") continue;
        if (!/^\d{1,3}$/.test(raw)) {
          errors.push(t.attendance.archive.errors.countInvalid(col));
          continue;
        }
        counts[col === "tidak_hadir" ? "tidakHadir" : col] = Number(raw);
      }
    } else {
      const blank: string[] = [];
      for (const m of usedMeetings) {
        const raw = (r.cells[m.index] ?? "").trim();
        if (!raw) {
          blank.push(m.label);
          continue;
        }
        const key = VALUE_MAP[raw.toLowerCase()];
        if (!key) errors.push(t.attendance.archive.errors.valueUnknown(m.label, raw));
        else counts[key]++;
      }
      if (blank.length > 0) {
        needsVerification = true;
        notes.push(t.attendance.archive.notes.emptyCells(blank.join(", ")));
      }
    }
    if (emptyMeetings.length > 0) {
      notes.unshift(t.attendance.archive.notes.emptyMeetings(emptyMeetings.map((m) => m.label).join(", ")));
    }

    return {
      rowNumber: r.rowNumber,
      memberCode,
      memberName: member?.fullName ?? null,
      memberId: member?.id ?? null,
      divisionId: member?.divisionId ?? null,
      counts,
      needsVerification,
      note: notes.length > 0 ? notes.join(" ") : null,
      errors,
    };
  });

  // kode_id ganda di file.
  const byCode = new Map<string, PlannedArchiveRow[]>();
  for (const row of rows) {
    if (!row.memberCode) continue;
    byCode.set(row.memberCode, [...(byCode.get(row.memberCode) ?? []), row]);
  }
  for (const group of byCode.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      const others = group.filter((o) => o !== row).map((o) => o.rowNumber);
      row.errors.push(t.attendance.archive.errors.codeDuplicate(others.join(", ")));
    }
  }

  return { ok: true, rows, mode, validCount: rows.filter((r) => r.errors.length === 0).length };
}
