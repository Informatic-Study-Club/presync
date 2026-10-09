import { z } from "zod";
import { id as t } from "@/messages/id";
import { formatMemberCode, MAX_SEQ, parseMemberCode } from "../member-code";
import { nameCaseHint, normalizeName } from "../name";
import { normalizePhone } from "../phone";

// Validasi dan perencanaan impor anggota sebagai fungsi murni
// (docs/ARSITEKTUR.md bagian 6 dan 7). Dipanggil dua kali: saat pratinjau dan
// sekali lagi di dalam transaksi impor dengan data counter yang dikunci.

export const IMPORT_COLUMNS = ["nama", "email", "no_hp", "divisi", "batch", "kode_id"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  "nama",
  "email",
  "no_hp",
  "divisi",
  "batch",
];

export type RawImportRow = {
  /** Nomor baris di file (baris header = 1). */
  rowNumber: number;
  values: Partial<Record<ImportColumn, string>>;
};

export type DivisionRef = { id: string; name: string; slug: string };

export type BatchState = {
  /** max(counter di database, nomor urut tertinggi anggota yang sudah ada). */
  lastSeq: number;
  /** Jumlah kode anggota yang sudah ada per prefiks tahun, misalnya { "26": 50 }. */
  yearCounts: Readonly<Record<string, number>>;
  /** Nomor urut -> kode anggota yang sudah ada. */
  seqToCode: ReadonlyMap<number, string>;
};

export type ImportContext = {
  divisions: readonly DivisionRef[];
  existingEmails: ReadonlySet<string>;
  existingPhones: ReadonlySet<string>;
  existingCodes: ReadonlySet<string>;
  batches: ReadonlyMap<string, BatchState>;
  /** Dua digit tahun berjalan (Asia/Jakarta), dipakai bila batch belum punya kode. */
  currentYear: string;
};

export type PlannedMember = {
  fullName: string;
  email: string;
  phone: string;
  divisionId: string;
  divisionName: string;
  batch: string;
  memberCode: string;
  codeSource: "file" | "auto";
};

export type PlannedRow = {
  rowNumber: number;
  /** Nilai untuk ditampilkan di pratinjau (sudah dinormalisasi bila valid). */
  display: Record<ImportColumn, string>;
  member: PlannedMember | null;
  errors: string[];
  warnings: string[];
  infos: string[];
};

export type ImportPlan = {
  rows: PlannedRow[];
  /** Nilai last_seq baru per batch yang punya anggota untuk diimpor. */
  counters: { batch: string; lastSeq: number }[];
  okCount: number;
  warningCount: number;
  errorCount: number;
};

const EMPTY_BATCH: BatchState = { lastSeq: 0, yearCounts: {}, seqToCode: new Map() };

const DIVISION_ALIASES: Record<string, string> = {
  webdev: "web-development",
  web: "web-development",
  ml: "machine-learning",
  uiux: "ui-ux",
  ui: "ui-ux",
};

const emailSchema = z.email().max(254);

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchDivision(
  value: string,
  divisions: readonly DivisionRef[],
): DivisionRef | null {
  const k = key(value);
  if (!k) return null;
  const aliasSlug = DIVISION_ALIASES[k];
  return (
    divisions.find(
      (d) => key(d.name) === k || key(d.slug) === k || d.slug === aliasSlug,
    ) ?? null
  );
}

/** Batch 2 digit; angka 1 digit dari Excel ("1") dilengkapi menjadi "01". */
export function normalizeBatch(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const batch = trimmed.padStart(2, "0");
  return batch === "00" ? null : batch;
}

function joinRows(rows: number[]): string {
  return rows.join(", ");
}

function majorityYear(counts: Record<string, number>, fallback: string): string {
  let best: string | null = null;
  let bestCount = 0;
  for (const [year, count] of Object.entries(counts)) {
    const better =
      count > bestCount ||
      (count === bestCount && best !== null && (year === fallback || (best !== fallback && year > best)));
    if (better) {
      best = year;
      bestCount = count;
    }
  }
  return best ?? fallback;
}

type Parsed = {
  row: RawImportRow;
  display: Record<ImportColumn, string>;
  errors: string[];
  warnings: string[];
  infos: string[];
  fullName: string;
  email: string | null;
  phone: string | null;
  division: DivisionRef | null;
  batch: string | null;
  code: { value: string; year: string; seq: number } | null;
  /** true bila kode_id diisi (valid atau tidak). */
  hasCodeInput: boolean;
};

function parseRow(row: RawImportRow, ctx: ImportContext): Parsed {
  const raw = (col: ImportColumn) => row.values[col] ?? "";
  const errors: string[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];

  const nameInput = raw("nama");
  const fullName = normalizeName(nameInput);
  if (!fullName) errors.push(t.import.rowErrors.nameRequired);
  else {
    if (fullName !== nameInput.trim()) infos.push(t.import.rowWarnings.nameNormalized);
    const hint = nameCaseHint(fullName);
    if (hint === "all_upper") warnings.push(t.import.rowWarnings.nameAllUpper);
    if (hint === "all_lower") warnings.push(t.import.rowWarnings.nameAllLower);
  }

  const emailInput = raw("email").trim().toLowerCase();
  const email = emailSchema.safeParse(emailInput).success ? emailInput : null;
  if (!email) errors.push(t.import.rowErrors.emailInvalid);

  const phone = normalizePhone(raw("no_hp"));
  if (!phone) errors.push(t.import.rowErrors.phoneInvalid);

  const division = matchDivision(raw("divisi"), ctx.divisions);
  if (!division) errors.push(t.import.rowErrors.divisionUnknown(raw("divisi").trim()));

  const batch = normalizeBatch(raw("batch"));
  if (!batch) errors.push(t.import.rowErrors.batchInvalid);

  const codeInput = raw("kode_id").trim();
  let code: Parsed["code"] = null;
  if (codeInput) {
    const parts = parseMemberCode(codeInput);
    if (!parts) errors.push(t.import.rowErrors.codeInvalid);
    else {
      code = { value: codeInput, year: parts.year, seq: parts.seq };
      if (batch && parts.batch !== batch) {
        errors.push(t.import.rowErrors.codeBatchMismatch(batch));
      }
    }
  }

  return {
    row,
    display: {
      nama: fullName || nameInput,
      email: email ?? raw("email").trim(),
      no_hp: phone ?? raw("no_hp").trim(),
      divisi: division?.name ?? raw("divisi").trim(),
      batch: batch ?? raw("batch").trim(),
      kode_id: codeInput,
    },
    errors,
    warnings,
    infos,
    fullName,
    email,
    phone,
    division,
    batch,
    code,
    hasCodeInput: codeInput.length > 0,
  };
}

function flagDuplicates(
  parsed: Parsed[],
  pick: (p: Parsed) => string | null,
  message: (rows: string) => string,
) {
  const groups = new Map<string, Parsed[]>();
  for (const p of parsed) {
    const value = pick(p);
    if (!value) continue;
    const group = groups.get(value) ?? [];
    group.push(p);
    groups.set(value, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const p of group) {
      const others = group.filter((o) => o !== p).map((o) => o.row.rowNumber);
      p.errors.push(message(joinRows(others)));
    }
  }
}

export function planImport(rows: readonly RawImportRow[], ctx: ImportContext): ImportPlan {
  const parsed = [...rows]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map((row) => parseRow(row, ctx));

  // Duplikat di dalam file: semua baris yang terlibat ditolak.
  flagDuplicates(parsed, (p) => p.email, t.import.rowErrors.emailDuplicate);
  flagDuplicates(parsed, (p) => p.phone, t.import.rowErrors.phoneDuplicate);
  flagDuplicates(parsed, (p) => p.code?.value ?? null, t.import.rowErrors.codeDuplicate);

  // Bentrok dengan data yang sudah ada.
  for (const p of parsed) {
    if (p.email && ctx.existingEmails.has(p.email)) p.errors.push(t.import.rowErrors.emailExists);
    if (p.phone && ctx.existingPhones.has(p.phone)) p.errors.push(t.import.rowErrors.phoneExists);
    if (p.code && ctx.existingCodes.has(p.code.value)) p.errors.push(t.import.rowErrors.codeExists);
  }

  // Statistik per batch: prefiks tahun mayoritas dan nomor urut terpakai.
  const batchKeys = new Set<string>();
  for (const p of parsed) if (p.batch) batchKeys.add(p.batch);

  const yearOf = new Map<string, string>();
  const baseSeq = new Map<string, number>();
  for (const batch of batchKeys) {
    const state = ctx.batches.get(batch) ?? EMPTY_BATCH;
    const counts: Record<string, number> = { ...state.yearCounts };
    let maxSeq = state.lastSeq;
    for (const p of parsed) {
      if (p.batch !== batch || !p.code) continue;
      counts[p.code.year] = (counts[p.code.year] ?? 0) + 1;
      // Nomor dari baris yang ditolak juga dicadangkan agar tidak terpakai
      // kode otomatis, karena baris itu bisa diimpor ulang setelah dikoreksi.
      maxSeq = Math.max(maxSeq, p.code.seq);
    }
    yearOf.set(batch, majorityYear(counts, ctx.currentYear));
    baseSeq.set(batch, maxSeq);
  }

  for (const p of parsed) {
    if (!p.batch || !p.code) continue;
    const expected = yearOf.get(p.batch);
    if (expected && p.code.year !== expected) {
      p.warnings.push(t.import.rowWarnings.yearPrefix(p.code.value, `ISC${expected}`));
    }
    const state = ctx.batches.get(p.batch) ?? EMPTY_BATCH;
    const existing = state.seqToCode.get(p.code.seq);
    const shared = [
      ...(existing && existing !== p.code.value ? [existing] : []),
      ...parsed
        .filter(
          (o) =>
            o !== p &&
            o.batch === p.batch &&
            o.code &&
            o.code.seq === p.code?.seq &&
            o.code.value !== p.code.value,
        )
        .map((o) => o.code?.value ?? ""),
    ];
    if (shared.length > 0) p.warnings.push(t.import.rowWarnings.seqShared(shared.join(", ")));
  }

  // Kode otomatis untuk baris valid tanpa kode_id, sesuai urutan baris.
  const lastAssigned = new Map(baseSeq);
  for (const p of parsed) {
    if (p.hasCodeInput || p.errors.length > 0 || !p.batch) continue;
    const next = (lastAssigned.get(p.batch) ?? 0) + 1;
    if (next > MAX_SEQ) {
      p.errors.push(t.import.rowErrors.seqExhausted(p.batch));
      continue;
    }
    lastAssigned.set(p.batch, next);
    const value = formatMemberCode({
      year: yearOf.get(p.batch) ?? ctx.currentYear,
      batch: p.batch,
      seq: next,
    });
    p.code = { value, year: value.slice(3, 5), seq: next };
    p.display.kode_id = value;
    p.infos.push(t.import.rowWarnings.autoCode(value));
  }

  const plannedRows: PlannedRow[] = parsed.map((p) => {
    const ok = p.errors.length === 0 && p.email && p.phone && p.division && p.batch && p.code;
    return {
      rowNumber: p.row.rowNumber,
      display: p.display,
      member: ok
        ? {
            fullName: p.fullName,
            email: p.email as string,
            phone: p.phone as string,
            divisionId: (p.division as DivisionRef).id,
            divisionName: (p.division as DivisionRef).name,
            batch: p.batch as string,
            memberCode: (p.code as NonNullable<Parsed["code"]>).value,
            codeSource: p.hasCodeInput ? "file" : "auto",
          }
        : null,
      errors: p.errors,
      warnings: p.errors.length > 0 ? [] : p.warnings,
      infos: p.errors.length > 0 ? [] : p.infos,
    };
  });

  const importedBatches = new Set(
    plannedRows.flatMap((r) => (r.member ? [r.member.batch] : [])),
  );
  const counters = [...importedBatches].sort().map((batch) => ({
    batch,
    lastSeq: lastAssigned.get(batch) ?? 0,
  }));

  return {
    rows: plannedRows,
    counters,
    okCount: plannedRows.filter((r) => r.member && r.warnings.length === 0).length,
    warningCount: plannedRows.filter((r) => r.member && r.warnings.length > 0).length,
    errorCount: plannedRows.filter((r) => !r.member).length,
  };
}
