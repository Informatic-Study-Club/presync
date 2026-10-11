"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { MAX_IMPORT_BYTES } from "./parse";
import type { ImportPlan, RawImportRow } from "./plan";
import { commitImport, commitMemberRows, previewImport, previewMemberRows } from "./service";

// ---------------------------------------------------------------- impor

export type PreviewRow = {
  rowNumber: number;
  display: Record<string, string>;
  status: "ok" | "warning" | "error";
  notes: string[];
};

export type ImportState =
  | {
      error?: string;
      success?: string;
      fileName?: string;
      fileHash?: string;
      rows?: PreviewRow[];
      counts?: { ok: number; warning: number; error: number };
    }
  | undefined;

export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { user } = await requireSession();
  if (!can(user, "member.import")) return { error: t.errors.forbidden };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t.import.fileErrors.noFile };
  if (file.size > MAX_IMPORT_BYTES) {
    return { error: t.import.fileErrors.tooLarge(MAX_IMPORT_BYTES / 1024) };
  }
  const input = { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };

  if (formData.get("intent") === "commit") {
    const hash = String(formData.get("fileHash") ?? "");
    const result = await commitImport(user, input, hash);
    if (!result.ok) return { error: result.error };
    revalidatePath("/anggota");
    return { success: t.import.success(result.imported) };
  }

  const result = await previewImport(user, input);
  if (!result.ok) return { error: result.error };
  return { fileName: file.name, fileHash: result.hash, ...previewState(result.plan) };
}

function previewState(plan: ImportPlan): Pick<NonNullable<ImportState>, "counts" | "rows"> {
  return {
    counts: { ok: plan.okCount, warning: plan.warningCount, error: plan.errorCount },
    rows: plan.rows.map((r) => ({
      rowNumber: r.rowNumber,
      display: r.display,
      status: r.errors.length > 0 ? "error" : r.warnings.length > 0 ? "warning" : "ok",
      notes: [...r.errors, ...r.warnings, ...r.infos],
    })),
  };
}

// ---------------------------------------------------------------- tambah lewat formulir

/** Batas baris sekali simpan dari formulir web (impor file untuk jumlah besar). */
const MAX_FORM_ROWS = 50;

const formRowSchema = z.object({
  nama: z.string().max(200),
  email: z.string().max(254),
  no_hp: z.string().max(30),
  divisi: z.string().max(100),
  batch: z.string().max(10),
  kode_id: z.string().max(20),
});
const formRowsSchema = z.array(formRowSchema).min(1).max(MAX_FORM_ROWS);

export async function addMembersAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { user } = await requireSession();
  if (!can(user, "member.import")) return { error: t.errors.forbidden };

  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: t.auth.invalidInput };
  }
  const parsed = formRowsSchema.safeParse(json);
  if (!parsed.success) return { error: t.members.add.tooManyRows(MAX_FORM_ROWS) };
  // Baris kosong seluruhnya dilewati; nomor baris mengikuti urutan di formulir.
  const rows: RawImportRow[] = parsed.data
    .map((values, i) => ({ rowNumber: i + 1, values }))
    .filter((r) => Object.values(r.values).some((v) => v.trim() !== ""));
  if (rows.length === 0) return { error: t.members.add.empty };

  if (formData.get("intent") === "commit") {
    const result = await commitMemberRows(user, rows, String(formData.get("hash") ?? ""));
    if (!result.ok) return { error: result.error };
    revalidatePath("/anggota");
    const codes = result.plan.rows.flatMap((r) => (r.member ? [r.member.memberCode] : []));
    return { success: t.members.add.success(result.imported, codes.join(", ")) };
  }

  const result = await previewMemberRows(user, rows);
  if (!result.ok) return { error: result.error };
  return { fileHash: result.hash, ...previewState(result.plan) };
}
