import { z } from "zod";
import { id as t } from "@/messages/id";
import { isDateString } from "@/lib/academic/time";
import { parseRupiah } from "./money";

// Jadwal iuran: skema input (buat dan ubah) dan aturan perubahan sebagai
// fungsi murni, dites di schedule-edit.test.ts.

const f = t.finance.errors;

const amountField = z.string().transform((v, ctx) => {
  const amount = parseRupiah(v);
  if (amount === null) {
    ctx.addIssue({ code: "custom", message: f.amountInvalid });
    return z.NEVER;
  }
  return amount;
});

const scheduleFields = {
  name: z.string().trim().min(3).max(80),
  categoryId: z.uuid(),
  amount: amountField,
  period: z.enum(["monthly", "once"]),
  dueDay: z.string().transform((v) => (v === "" ? null : Number(v))),
  dueOn: z.string().transform((v) => (v === "" ? null : v)),
  divisionId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid().nullable()),
  batch: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.padStart(2, "0")))
    .pipe(z.string().regex(/^\d{2}$/).nullable()),
};

type ScheduleShape = {
  period: "monthly" | "once";
  dueDay: number | null;
  dueOn: string | null;
};

function refineDue(v: ScheduleShape, ctx: z.RefinementCtx) {
  if (v.period === "monthly" && !(Number.isInteger(v.dueDay) && v.dueDay! >= 1 && v.dueDay! <= 28)) {
    ctx.addIssue({ code: "custom", path: ["dueDay"], message: t.finance.fields.dueDay });
  }
  if (v.period === "once" && !(v.dueOn && isDateString(v.dueOn))) {
    ctx.addIssue({ code: "custom", path: ["dueOn"], message: f.dateInvalid });
  }
}

function normalizeDue<T extends ScheduleShape>(v: T): T {
  return { ...v, dueDay: v.period === "monthly" ? v.dueDay : null, dueOn: v.period === "once" ? v.dueOn : null };
}

export const scheduleInputSchema = z.object(scheduleFields).superRefine(refineDue).transform(normalizeDue);

export const scheduleUpdateSchema = z
  .object({ scheduleId: z.uuid(), ...scheduleFields })
  .superRefine(refineDue)
  .transform(normalizeDue);

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export type ScheduleValues = {
  name: string;
  categoryId: string;
  amount: number;
  period: "monthly" | "once";
  dueDay: number | null;
  dueOn: string | null;
  divisionId: string | null;
  batch: string | null;
};

const FIELDS: (keyof ScheduleValues)[] = [
  "name",
  "categoryId",
  "amount",
  "period",
  "dueDay",
  "dueOn",
  "divisionId",
  "batch",
];

export type ScheduleChange = { field: keyof ScheduleValues; from: unknown; to: unknown };

export function diffSchedule(before: ScheduleValues, after: ScheduleValues): ScheduleChange[] {
  return FIELDS.filter((k) => before[k] !== after[k]).map((k) => ({ field: k, from: before[k], to: after[k] }));
}

/**
 * Alasan perubahan ditolak, atau null bila boleh. Periode tidak bisa diganti
 * setelah ada tagihan, karena kunci periode tagihan lama ("2026-10" atau
 * "sekali") tidak akan cocok lagi dengan jadwal. Tagihan yang sudah terbit
 * tidak pernah ikut berubah.
 */
export function scheduleChangeError(changes: readonly ScheduleChange[], invoiceCount: number): string | null {
  if (changes.length === 0) return t.finance.manage.noChanges;
  if (invoiceCount > 0 && changes.some((c) => c.field === "period")) return t.finance.manage.periodLocked;
  return null;
}
