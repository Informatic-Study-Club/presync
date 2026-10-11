"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDateString } from "@/lib/academic/time";
import { can, type Action } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { isMonth } from "./ledger";
import { parseRupiah } from "./money";
import { scheduleInputSchema, scheduleUpdateSchema } from "./schedule-edit";
import * as service from "./service";

export type ActionState = { error?: string; success?: string } | undefined;

const f = t.finance.errors;
const amountField = z.string().transform((v, ctx) => {
  const amount = parseRupiah(v);
  if (amount === null) {
    ctx.addIssue({ code: "custom", message: f.amountInvalid });
    return z.NEVER;
  }
  return amount;
});
const dateField = z.string().refine(isDateString, f.dateInvalid);
const monthField = z.string().refine(isMonth, f.monthInvalid);
const reasonField = z.string().trim().min(3, t.errors.noteRequired).max(500);

async function guarded<S extends z.ZodType>(
  action: Action,
  schema: S,
  formData: FormData,
  run: (input: z.infer<S>, user: Awaited<ReturnType<typeof requireSession>>["user"]) => Promise<service.Result>,
  paths: string[],
): Promise<ActionState> {
  const { user } = await requireSession();
  if (!can(user, action)) return { error: t.errors.forbidden };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };
  const result = await run(parsed.data, user);
  if (result.ok) for (const p of paths) revalidatePath(p);
  return result.ok ? { success: result.message } : { error: result.message };
}

// ---------------------------------------------------------------- kategori dan jadwal

export async function createCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({
    name: z.string().trim().min(2).max(60),
    kind: z.enum(["income", "expense"]),
    description: z.string().trim().max(300).transform((v) => v || null),
  });
  return guarded("finance.manage", schema, fd, (input, user) => service.createCategory(user, input), ["/kas/kelola"]);
}

export async function toggleCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ categoryId: z.uuid(), active: z.enum(["true", "false"]) });
  return guarded(
    "finance.manage",
    schema,
    fd,
    (input, user) => service.setCategoryActive(user, input.categoryId, input.active === "true"),
    ["/kas/kelola"],
  );
}

export async function createScheduleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded("finance.manage", scheduleInputSchema, fd, (input, user) => service.createSchedule(user, input), [
    "/kas/kelola",
  ]);
}

export async function updateScheduleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(
    "finance.manage",
    scheduleUpdateSchema,
    fd,
    (input, user) => {
      const { scheduleId, ...values } = input;
      return service.updateSchedule(user, scheduleId, values);
    },
    ["/kas/kelola"],
  );
}

export async function toggleScheduleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ scheduleId: z.uuid(), active: z.enum(["true", "false"]) });
  return guarded(
    "finance.manage",
    schema,
    fd,
    (input, user) => service.setScheduleActive(user, input.scheduleId, input.active === "true"),
    ["/kas/kelola"],
  );
}

export async function updateCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({
    categoryId: z.uuid(),
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(300).transform((v) => v || null),
  });
  return guarded(
    "finance.manage",
    schema,
    fd,
    (input, user) => service.updateCategory(user, input.categoryId, { name: input.name, description: input.description }),
    ["/kas/kelola", "/kas/buku"],
  );
}

export async function generateInvoicesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ scheduleId: z.uuid(), month: monthField });
  return guarded(
    "finance.manage",
    schema,
    fd,
    (input, user) => service.generateInvoices(user, input.scheduleId, input.month),
    ["/kas/kelola", "/kas"],
  );
}

export async function waiveInvoiceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ invoiceId: z.uuid(), reason: reasonField });
  return guarded("finance.manage", schema, fd, (input, user) => service.waiveInvoice(user, input.invoiceId, input.reason), [
    "/kas/kelola",
  ]);
}

export async function recordCashAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ invoiceId: z.uuid(), note: reasonField });
  return guarded("finance.verify", schema, fd, (input, user) => service.recordCashPayment(user, input.invoiceId, input.note), [
    "/kas/kelola",
    "/kas/buku",
  ]);
}

// ---------------------------------------------------------------- pembayaran anggota

export async function submitProofAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const invoiceId = z.uuid().safeParse(fd.get("invoiceId"));
  if (!invoiceId.success) return { error: t.auth.invalidInput };
  const file = fd.get("proof");
  if (!(file instanceof File) || file.size === 0) return { error: f.proofMissing };
  const result = await service.submitProof(user, invoiceId.data, { data: new Uint8Array(await file.arrayBuffer()) });
  if (result.ok) revalidatePath("/kas");
  return result.ok ? { success: result.message } : { error: result.message };
}

// ---------------------------------------------------------------- verifikasi

export async function verifyPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ paymentId: z.uuid() });
  return guarded("finance.verify", schema, fd, (input, user) => service.verifyPayment(user, input.paymentId), [
    "/kas/verifikasi",
    "/kas/buku",
  ]);
}

export async function rejectPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ paymentId: z.uuid(), reason: reasonField });
  return guarded("finance.verify", schema, fd, (input, user) => service.rejectPayment(user, input.paymentId, input.reason), [
    "/kas/verifikasi",
  ]);
}

// ---------------------------------------------------------------- buku kas

export async function addTransactionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({
    occurredOn: dateField,
    kind: z.enum(["income", "expense"]),
    categoryId: z.uuid(),
    amount: amountField,
    description: z.string().trim().min(3).max(200),
  });
  return guarded("finance.manage", schema, fd, (input, user) => service.addTransaction(user, input), ["/kas/buku", "/kas/kelola"]);
}

export async function reverseTransactionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ transactionId: z.uuid(), reason: reasonField });
  return guarded(
    "finance.manage",
    schema,
    fd,
    (input, user) => service.reverseTransaction(user, input.transactionId, input.reason),
    ["/kas/buku", "/kas/kelola"],
  );
}

export async function closeMonthAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const schema = z.object({ month: monthField, note: z.string().trim().max(500).transform((v) => v || null) });
  return guarded("finance.manage", schema, fd, (input, user) => service.closeMonth(user, input.month, input.note), ["/kas/buku"]);
}
