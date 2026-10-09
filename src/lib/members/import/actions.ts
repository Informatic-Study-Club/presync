"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { MAX_IMPORT_BYTES } from "./parse";
import { commitImport, previewImport } from "./service";

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
  const { plan } = result;
  return {
    fileName: file.name,
    fileHash: result.hash,
    counts: { ok: plan.okCount, warning: plan.warningCount, error: plan.errorCount },
    rows: plan.rows.map((r) => ({
      rowNumber: r.rowNumber,
      display: r.display,
      status: r.errors.length > 0 ? "error" : r.warnings.length > 0 ? "warning" : "ok",
      notes: [...r.errors, ...r.warnings, ...r.infos],
    })),
  };
}
