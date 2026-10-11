"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { parseScoreInput } from "./rules";
import * as service from "./service";

export type ActionState = { error?: string; success?: string } | undefined;

const path = (classId: string) => `/kelas/${classId}/penilaian`;
const toState = (r: service.Result): ActionState => (r.ok ? { success: r.message } : { error: r.message });

const optionalNumber = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
    .pipe(z.number().min(0).max(max).nullable());

export async function addComponentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z
    .object({
      classId: z.uuid(),
      name: z.string().trim().min(2).max(60),
      kind: z.enum(["score", "done_flag", "attendance"]),
      weight: z.coerce.number().int().min(0).max(100),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: t.auth.invalidInput };
  const { classId, ...input } = parsed.data;
  const result = await service.addComponent(user, classId, input);
  if (result.ok) revalidatePath(path(classId));
  return toState(result);
}

export async function updateComponentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z
    .object({
      classId: z.uuid(),
      componentId: z.uuid(),
      name: z.string().trim().min(2).max(60),
      weight: z.coerce.number().int().min(0).max(100),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: t.auth.invalidInput };
  const { classId, componentId, ...input } = parsed.data;
  const result = await service.updateComponent(user, componentId, input);
  if (result.ok) revalidatePath(path(classId));
  return toState(result);
}

export async function deleteComponentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z.object({ classId: z.uuid(), componentId: z.uuid() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: t.auth.invalidInput };
  const result = await service.deleteComponent(user, parsed.data.componentId);
  if (result.ok) revalidatePath(path(parsed.data.classId));
  return toState(result);
}

export async function applyTemplateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const classId = z.uuid().safeParse(fd.get("classId"));
  if (!classId.success) return { error: t.auth.invalidInput };
  const result = await service.applyWebDevTemplate(user, classId.data);
  if (result.ok) revalidatePath(path(classId.data));
  return toState(result);
}

export async function saveRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z
    .object({
      classId: z.uuid(),
      requireAllComponents: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(20),
      maxIzin: optionalNumber(100).refine((v) => v === null || Number.isInteger(v)),
      minScore: optionalNumber(100),
      minAttendancePercent: optionalNumber(100),
    })
    .safeParse({
      classId: fd.get("classId"),
      requireAllComponents: fd.getAll("requireAllComponents"),
      maxIzin: fd.get("maxIzin") ?? "",
      minScore: fd.get("minScore") ?? "",
      minAttendancePercent: fd.get("minAttendancePercent") ?? "",
    });
  if (!parsed.success) return { error: t.auth.invalidInput };
  const { classId, ...rule } = parsed.data;
  const result = await service.saveRule(user, classId, rule);
  if (result.ok) revalidatePath(path(classId));
  return toState(result);
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SCORE_FIELD = new RegExp(`^score\\.(${UUID})\\.(${UUID})$`);
const DONE_PRESENT = new RegExp(`^donefield\\.(${UUID})\\.(${UUID})$`);

export async function saveScoresAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const classId = z.uuid().safeParse(fd.get("classId"));
  if (!classId.success) return { error: t.auth.invalidInput };

  const entries: service.ScoreInput[] = [];
  for (const [name, raw] of fd.entries()) {
    if (typeof raw !== "string") continue;
    const score = SCORE_FIELD.exec(name);
    if (score) {
      const value = parseScoreInput(raw);
      if (value === undefined) return { error: t.assessment.errors.scoreInvalid(raw) };
      entries.push({ componentId: score[1] as string, memberId: score[2] as string, value, done: null });
      continue;
    }
    // Kotak centang yang tidak dicentang tidak dikirim browser, jadi setiap
    // sel done_flag punya field penanda "donefield" agar nilai false tersimpan.
    const present = DONE_PRESENT.exec(name);
    if (present) {
      const [, componentId, memberId] = present as unknown as [string, string, string];
      entries.push({ componentId, memberId, value: null, done: fd.get(`done.${componentId}.${memberId}`) === "on" });
    }
  }
  const result = await service.saveScores(user, classId.data, entries);
  if (result.ok) revalidatePath(path(classId.data));
  return toState(result);
}

export async function overrideAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z
    .object({
      classId: z.uuid(),
      memberId: z.uuid(),
      status: z.enum(["eligible", "not_eligible", "clear"]),
      note: z.string().trim().min(3, t.errors.noteRequired).max(500),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };
  const { classId, memberId, status, note } = parsed.data;
  const result = await service.setOverride(user, classId, memberId, status, note);
  if (result.ok) revalidatePath(path(classId));
  return toState(result);
}
