"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { MAX_IMPORT_BYTES } from "@/lib/members/import/parse";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { id as t } from "@/messages/id";
import { commitArchive, previewArchive } from "./archive-service";
import {
  recordScan,
  regenerateCheckinCode,
  type ScanResult,
  selfCheckin,
  setManualAttendance,
} from "./service";

export type ActionState = { error?: string; success?: string } | undefined;

// ---------------------------------------------------------------- scan

const scanSchema = z.object({
  sessionId: z.uuid(),
  raw: z.string().trim().min(1).max(200),
  source: z.enum(["camera", "scanner", "typed"]),
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).nullable(),
});

export async function scanAction(input: z.input<typeof scanSchema>): Promise<ScanResult> {
  const { user } = await requireSession();
  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) return { kind: "rejected", message: t.attendance.scanRejections.invalid_format };
  if (!(await checkRateLimit("scan", [`user:${user.id}`]))) {
    return { kind: "rejected", message: t.attendance.rateLimited };
  }
  return recordScan(user, parsed.data);
}

// ---------------------------------------------------------------- check-in online

export async function checkinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const code = z.string().max(20).safeParse(formData.get("code"));
  if (!code.success) return { error: t.attendance.checkinRejections.invalid_code };
  if (!(await checkRateLimit("checkin", [`user:${user.id}`]))) return { error: t.auth.rateLimited };
  const result = await selfCheckin(user, code.data);
  return result.ok ? { success: result.message } : { error: result.message };
}

// ---------------------------------------------------------------- absen manual

const manualSchema = z.object({
  sessionId: z.uuid(),
  memberId: z.uuid(),
  status: z.enum(["hadir", "izin", "sakit", "tidak_hadir"]),
  note: z.string().trim().min(3, t.errors.noteRequired).max(500),
});

export async function manualAttendanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };
  const result = await setManualAttendance(user, parsed.data);
  if (result.ok) revalidatePath(`/presensi/${parsed.data.sessionId}`);
  return result.ok ? { success: result.message } : { error: result.message };
}

export async function regenerateCheckinCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const sessionId = z.uuid().safeParse(formData.get("sessionId"));
  if (!sessionId.success) return { error: t.auth.invalidInput };
  const result = await regenerateCheckinCode(user, sessionId.data);
  if (result.ok) revalidatePath(`/presensi/${sessionId.data}`);
  return result.ok ? { success: result.message } : { error: result.message };
}

// ---------------------------------------------------------------- arsip

export type ArchiveState =
  | {
      error?: string;
      success?: string;
      fileHash?: string;
      rows?: {
        rowNumber: number;
        memberCode: string;
        memberName: string | null;
        counts: { hadir: number; izin: number; sakit: number; tidakHadir: number };
        needsVerification: boolean;
        notes: string[];
        ok: boolean;
      }[];
      validCount?: number;
    }
  | undefined;

export async function archiveAction(_prev: ArchiveState, formData: FormData): Promise<ArchiveState> {
  const { user } = await requireSession();
  if (!can(user, "member.import")) return { error: t.errors.forbidden };
  const program = z.string().trim().min(3).max(120).safeParse(formData.get("program"));
  if (!program.success) return { error: t.attendance.archive.programRequired };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t.import.fileErrors.noFile };
  if (file.size > MAX_IMPORT_BYTES) return { error: t.import.fileErrors.tooLarge(MAX_IMPORT_BYTES / 1024) };
  const input = { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };

  if (formData.get("intent") === "commit") {
    const result = await commitArchive(user, program.data, input, String(formData.get("fileHash") ?? ""));
    if (!result.ok) return { error: result.error };
    revalidatePath("/presensi/arsip");
    return { success: t.attendance.archive.saved(result.saved) };
  }

  const { plan, hash } = await previewArchive(user, input);
  if (!plan.ok) return { error: plan.error };
  return {
    fileHash: hash,
    validCount: plan.validCount,
    rows: plan.rows.map((r) => ({
      rowNumber: r.rowNumber,
      memberCode: r.memberCode,
      memberName: r.memberName,
      counts: r.counts,
      needsVerification: r.needsVerification,
      notes: [...r.errors, ...(r.note ? [r.note] : [])],
      ok: r.errors.length === 0,
    })),
  };
}
