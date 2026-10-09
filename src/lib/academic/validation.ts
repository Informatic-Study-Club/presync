import { z } from "zod";
import { id as t } from "@/messages/id";
import { isDateString, isTimeString } from "./time";

// Skema Zod untuk input kalender, kelas, dan sesi (aturan wajib 5).

const dateField = z.string().refine(isDateString, t.academic.errors.dateInvalid);
const timeField = z.string().refine(isTimeString, t.academic.errors.timeInvalid);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);
const meetingUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https$/, error: t.academic.errors.urlInvalid }).max(500).nullable())
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const modeSchema = z.enum(["offline", "online", "hybrid"]);

/** Offline wajib lokasi, online wajib tautan, hybrid wajib keduanya. */
function refineMode<T extends { mode: "offline" | "online" | "hybrid"; location: string | null; meetingUrl: string | null }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  if (value.mode !== "online" && !value.location) {
    ctx.addIssue({ code: "custom", path: ["location"], message: t.academic.errors.locationRequired });
  }
  if (value.mode !== "offline" && !value.meetingUrl) {
    ctx.addIssue({ code: "custom", path: ["meetingUrl"], message: t.academic.errors.urlRequired });
  }
}

const venue = {
  mode: modeSchema,
  location: optionalText(200),
  meetingUrl,
};

export const academicYearSchema = z
  .object({ name: z.string().trim().min(4).max(30), startsOn: dateField, endsOn: dateField })
  .refine((v) => v.endsOn > v.startsOn, { message: t.academic.errors.rangeInvalid, path: ["endsOn"] });

export const termSchema = z
  .object({
    academicYearId: z.uuid(),
    name: z.string().trim().min(2).max(50),
    startsOn: dateField,
    endsOn: dateField,
  })
  .refine((v) => v.endsOn > v.startsOn, { message: t.academic.errors.rangeInvalid, path: ["endsOn"] });

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    kind: z.enum(["holiday", "exam", "activity", "deadline"]),
    startsOn: dateField,
    endsOn: dateField,
    divisionId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.uuid().nullable()),
    description: optionalText(1000),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: t.academic.errors.rangeInvalid, path: ["endsOn"] });

export const classSchema = z
  .object({
    divisionId: z.uuid(),
    termId: z.uuid(),
    name: z.string().trim().min(3).max(120),
    description: optionalText(1000),
    plannedSessions: z.coerce.number().int().min(1).max(52),
    firstDate: dateField,
    startTime: timeField,
    durationMinutes: z.coerce.number().int().min(15).max(720),
    ...venue,
  })
  .superRefine(refineMode);

export const sessionUpdateSchema = z
  .object({
    sessionId: z.uuid(),
    date: dateField,
    startTime: timeField,
    durationMinutes: z.coerce.number().int().min(15).max(720),
    ...venue,
  })
  .superRefine(refineMode);

export const sessionStatusSchema = z
  .object({
    sessionId: z.uuid(),
    status: z.enum(["scheduled", "done", "off"]),
    offReason: optionalText(300),
  })
  .refine((v) => v.status !== "off" || v.offReason, {
    message: t.academic.errors.offReasonRequired,
    path: ["offReason"],
  });

export const extraSessionSchema = z
  .object({
    classId: z.uuid(),
    title: z.string().trim().min(3).max(120),
    date: dateField,
    startTime: timeField,
    durationMinutes: z.coerce.number().int().min(15).max(720),
    ...venue,
  })
  .superRefine(refineMode);

export const activitySchema = z
  .object({
    divisionId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.uuid().nullable()),
    title: z.string().trim().min(3).max(120),
    date: dateField,
    startTime: timeField,
    durationMinutes: z.coerce.number().int().min(15).max(1440),
    ...venue,
  })
  .superRefine(refineMode);
