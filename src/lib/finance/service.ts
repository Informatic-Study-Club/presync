import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import {
  divisions,
  feeSchedules,
  financeBalance,
  financeCategories,
  financePeriodClosures,
  invoices,
  memberArrears,
  members,
  payments,
  transactions,
} from "@/db/schema";
import { todayInJakarta } from "@/lib/academic/time";
import { writeAudit } from "@/lib/audit";
import { assertCan, can, type SessionUser } from "@/lib/authz";
import { id as t } from "@/messages/id";
import { canCloseMonth, checkReversal, type LedgerEntry, monthOf, monthlyStatement, planInvoices } from "./ledger";
import { formatRupiah } from "./money";
import { diffSchedule, scheduleChangeError, type ScheduleValues } from "./schedule-edit";
import { detectProofType, MAX_PROOF_BYTES, proofObjectPath } from "./proof";
import { removeProof, uploadProof } from "./storage";

export type Result = { ok: true; message: string } | { ok: false; message: string };
const ok = (message: string): Result => ({ ok: true, message });
const fail = (message: string): Result => ({ ok: false, message });

class Abort extends Error {}

async function inTx(fn: (tx: Tx) => Promise<Result>): Promise<Result> {
  try {
    return await getDb().transaction(fn);
  } catch (err) {
    if (err instanceof Abort) return fail(err.message);
    throw err;
  }
}

async function closedMonths(executor: Tx | ReturnType<typeof getDb>): Promise<Set<string>> {
  const rows = await executor.select({ month: financePeriodClosures.month }).from(financePeriodClosures);
  return new Set(rows.map((r) => r.month));
}

async function assertOpenMonth(tx: Tx, date: string) {
  if ((await closedMonths(tx)).has(monthOf(date))) throw new Abort(t.finance.errors.closedMonth);
}

// ---------------------------------------------------------------- query

export async function financeSummary() {
  const db = getDb();
  const [balance] = await db.select().from(financeBalance);
  const arrears = await db.select({ memberId: memberArrears.memberId }).from(memberArrears);
  return {
    totalIncome: balance?.totalIncome ?? 0,
    totalExpense: balance?.totalExpense ?? 0,
    balance: balance?.balance ?? 0,
    arrearsMembers: arrears.length,
  };
}

export async function listCategories() {
  return getDb().select().from(financeCategories).orderBy(asc(financeCategories.kind), asc(financeCategories.name));
}

export async function listSchedules() {
  return getDb()
    .select({
      id: feeSchedules.id,
      name: feeSchedules.name,
      amount: feeSchedules.amount,
      period: feeSchedules.period,
      dueDay: feeSchedules.dueDay,
      dueOn: feeSchedules.dueOn,
      batch: feeSchedules.batch,
      active: feeSchedules.active,
      categoryId: feeSchedules.categoryId,
      divisionId: feeSchedules.divisionId,
      categoryName: financeCategories.name,
      divisionName: divisions.name,
      invoiceCount: getDb().$count(invoices, eq(invoices.feeScheduleId, feeSchedules.id)),
    })
    .from(feeSchedules)
    .innerJoin(financeCategories, eq(feeSchedules.categoryId, financeCategories.id))
    .leftJoin(divisions, eq(feeSchedules.divisionId, divisions.id))
    .orderBy(desc(feeSchedules.createdAt));
}

export async function listInvoices(filters: { period?: string; status?: "unpaid" | "pending" | "paid" | "waived" }) {
  const conditions: SQL[] = [];
  if (filters.period) conditions.push(eq(invoices.period, filters.period));
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  return getDb()
    .select({
      id: invoices.id,
      title: invoices.title,
      period: invoices.period,
      amount: invoices.amount,
      dueOn: invoices.dueOn,
      status: invoices.status,
      waivedReason: invoices.waivedReason,
      memberId: members.id,
      memberName: members.fullName,
      memberCode: members.memberCode,
    })
    .from(invoices)
    .innerJoin(members, eq(invoices.memberId, members.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoices.dueOn), asc(members.memberCode))
    .limit(500);
}

export async function invoicesOfMember(memberId: string) {
  const db = getDb();
  const [invoiceRows, paymentRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.memberId, memberId)).orderBy(desc(invoices.dueOn)),
    db.select().from(payments).where(eq(payments.memberId, memberId)).orderBy(desc(payments.submittedAt)),
  ]);
  return { invoices: invoiceRows, payments: paymentRows };
}

export async function pendingPayments() {
  return getDb()
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      submittedAt: payments.submittedAt,
      proofPath: payments.proofPath,
      invoiceTitle: invoices.title,
      invoiceAmount: invoices.amount,
      memberName: members.fullName,
      memberCode: members.memberCode,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .innerJoin(members, eq(payments.memberId, members.id))
    .where(eq(payments.status, "submitted"))
    .orderBy(asc(payments.submittedAt));
}

export async function ledgerForMonth(month: string) {
  const db = getDb();
  const all = await db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      kind: transactions.kind,
      amount: transactions.amount,
      reversalOf: transactions.reversalOf,
      description: transactions.description,
      paymentId: transactions.paymentId,
      categoryName: financeCategories.name,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .innerJoin(financeCategories, eq(transactions.categoryId, financeCategories.id))
    .orderBy(asc(transactions.occurredOn), asc(transactions.createdAt));
  const reversedIds = new Set(all.flatMap((e) => (e.reversalOf ? [e.reversalOf] : [])));
  const closures = await db.select().from(financePeriodClosures).orderBy(asc(financePeriodClosures.month));
  return {
    entries: all.filter((e) => monthOf(e.occurredOn) === month).map((e) => ({ ...e, reversed: reversedIds.has(e.id) })),
    statement: monthlyStatement(all, month),
    closure: closures.find((c) => c.month === month) ?? null,
    closedMonths: closures.map((c) => c.month),
  };
}

export async function arrearsList(user: SessionUser) {
  const rows = await getDb()
    .select({
      memberId: memberArrears.memberId,
      invoiceCount: memberArrears.invoiceCount,
      totalAmount: memberArrears.totalAmount,
      oldestDueOn: memberArrears.oldestDueOn,
      fullName: members.fullName,
      memberCode: members.memberCode,
      phone: members.phone,
      divisionId: members.divisionId,
      divisionName: divisions.name,
    })
    .from(memberArrears)
    .innerJoin(members, eq(memberArrears.memberId, members.id))
    .innerJoin(divisions, eq(members.divisionId, divisions.id))
    .orderBy(asc(memberArrears.oldestDueOn));
  // Bendahara boleh melihat kontak anggota yang menunggak (can() dengan hasArrears).
  return rows.map((r) => ({
    ...r,
    phone: can(user, "member.read_contact", { memberId: r.memberId, divisionId: r.divisionId, hasArrears: true })
      ? r.phone
      : null,
  }));
}

// ---------------------------------------------------------------- master data

export async function createCategory(user: SessionUser, input: { name: string; kind: "income" | "expense"; description: string | null }) {
  assertCan(user, "finance.manage");
  await getDb().insert(financeCategories).values(input);
  return ok(t.finance.manage.saved);
}

export async function setCategoryActive(user: SessionUser, id: string, active: boolean) {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    const updated = await tx
      .update(financeCategories)
      .set({ active })
      .where(eq(financeCategories.id, id))
      .returning({ id: financeCategories.id });
    if (updated.length === 0) throw new Abort(t.errors.notFound);
    await writeAudit(tx, {
      actorId: user.id,
      action: active ? "finance.category_activate" : "finance.category_deactivate",
      entityType: "finance_category",
      entityId: id,
    });
    return ok(t.finance.manage.saved);
  });
}

/** Ganti nama dan keterangan kategori. Jenis (pemasukan/pengeluaran) tetap. */
export async function updateCategory(
  user: SessionUser,
  id: string,
  input: { name: string; description: string | null },
): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    const [before] = await tx.select().from(financeCategories).where(eq(financeCategories.id, id)).limit(1);
    if (!before) throw new Abort(t.errors.notFound);
    if (before.name === input.name && before.description === input.description) {
      throw new Abort(t.finance.manage.noChanges);
    }
    await tx.update(financeCategories).set(input).where(eq(financeCategories.id, id));
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.category_update",
      entityType: "finance_category",
      entityId: id,
      data: { from: { name: before.name, description: before.description }, to: input },
    });
    return ok(t.finance.manage.saved);
  });
}

export async function createSchedule(
  user: SessionUser,
  input: {
    name: string;
    categoryId: string;
    amount: number;
    period: "monthly" | "once";
    dueDay: number | null;
    dueOn: string | null;
    divisionId: string | null;
    batch: string | null;
  },
) {
  assertCan(user, "finance.manage");
  const [category] = await getDb().select().from(financeCategories).where(eq(financeCategories.id, input.categoryId)).limit(1);
  if (!category || category.kind !== "income") return fail(t.finance.errors.categoryKind);
  await getDb().insert(feeSchedules).values({ ...input, createdBy: user.id });
  return ok(t.finance.manage.saved);
}

export async function updateSchedule(user: SessionUser, id: string, input: ScheduleValues): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    const [before] = await tx.select().from(feeSchedules).where(eq(feeSchedules.id, id)).limit(1).for("update");
    if (!before) throw new Abort(t.errors.notFound);
    const [category] = await tx.select().from(financeCategories).where(eq(financeCategories.id, input.categoryId)).limit(1);
    if (!category || category.kind !== "income") throw new Abort(t.finance.errors.categoryKind);
    const [billed] = await tx.select({ n: count() }).from(invoices).where(eq(invoices.feeScheduleId, id));

    const changes = diffSchedule(before, input);
    const rejection = scheduleChangeError(changes, billed?.n ?? 0);
    if (rejection) throw new Abort(rejection);

    await tx.update(feeSchedules).set(input).where(eq(feeSchedules.id, id));
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.schedule_update",
      entityType: "fee_schedule",
      entityId: id,
      data: { changes },
    });
    return ok(t.finance.manage.saved);
  });
}

/** Jadwal nonaktif tidak bisa membuat tagihan baru; tagihan lama tetap. */
export async function setScheduleActive(user: SessionUser, id: string, active: boolean): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    const updated = await tx
      .update(feeSchedules)
      .set({ active })
      .where(eq(feeSchedules.id, id))
      .returning({ id: feeSchedules.id });
    if (updated.length === 0) throw new Abort(t.errors.notFound);
    await writeAudit(tx, {
      actorId: user.id,
      action: active ? "finance.schedule_activate" : "finance.schedule_deactivate",
      entityType: "fee_schedule",
      entityId: id,
    });
    return ok(t.finance.manage.saved);
  });
}

export async function generateInvoices(user: SessionUser, scheduleId: string, month: string): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    const [schedule] = await tx.select().from(feeSchedules).where(eq(feeSchedules.id, scheduleId)).limit(1);
    if (!schedule || !schedule.active) throw new Abort(t.errors.notFound);
    const memberRows = await tx
      .select({ id: members.id, divisionId: members.divisionId, batch: members.batch, status: members.status })
      .from(members);
    const period = schedule.period === "monthly" ? month : "sekali";
    const billed = await tx
      .select({ memberId: invoices.memberId })
      .from(invoices)
      .where(and(eq(invoices.feeScheduleId, schedule.id), eq(invoices.period, period)));
    const planned = planInvoices(schedule, month, memberRows, new Set(billed.map((b) => b.memberId)));
    if (planned.length > 0) {
      await tx
        .insert(invoices)
        .values(planned.map((p) => ({ ...p, feeScheduleId: schedule.id })))
        .onConflictDoNothing();
    }
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.invoices_generate",
      entityType: "fee_schedule",
      entityId: schedule.id,
      data: { period, count: planned.length },
    });
    return ok(t.finance.manage.generated(planned.length));
  });
}

export async function waiveInvoice(user: SessionUser, invoiceId: string, reason: string): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    const updated = await tx
      .update(invoices)
      .set({ status: "waived", waivedReason: reason, updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "unpaid")))
      .returning({ id: invoices.id });
    if (updated.length === 0) throw new Abort(t.finance.errors.invoiceNotPayable);
    await writeAudit(tx, { actorId: user.id, action: "finance.waive", entityType: "invoice", entityId: invoiceId, note: reason });
    return ok(t.finance.manage.waived);
  });
}

// ---------------------------------------------------------------- pembayaran

export async function submitProof(user: SessionUser, invoiceId: string, file: { data: Uint8Array }): Promise<Result> {
  if (file.data.byteLength > MAX_PROOF_BYTES) return fail(t.finance.errors.proofTooLarge);
  const type = detectProofType(file.data);
  if (!type) return fail(t.finance.errors.proofType);

  const [invoice] = await getDb().select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || !can(user, "payment.submit", { memberId: invoice.memberId })) return fail(t.errors.forbidden);
  if (invoice.status !== "unpaid") return fail(t.finance.errors.invoiceNotPayable);

  const path = proofObjectPath(invoice.memberId, invoice.id, randomUUID(), type.ext);
  try {
    await uploadProof(path, file.data, type);
  } catch (err) {
    console.error("Unggah bukti gagal", err);
    return fail(t.finance.errors.uploadFailed);
  }

  const result = await inTx(async (tx) => {
    const updated = await tx
      .update(invoices)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.status, "unpaid")))
      .returning({ id: invoices.id });
    if (updated.length === 0) throw new Abort(t.finance.errors.invoiceNotPayable);
    await tx.insert(payments).values({
      invoiceId: invoice.id,
      memberId: invoice.memberId,
      amount: invoice.amount,
      method: "transfer",
      status: "submitted",
      proofPath: path,
    });
    return ok(t.finance.member.submitted);
  });
  if (!result.ok) await removeProof(path);
  return result;
}

async function categoryForInvoice(tx: Tx, invoice: { feeScheduleId: string | null }) {
  if (!invoice.feeScheduleId) throw new Abort(t.finance.errors.categoryKind);
  const [schedule] = await tx
    .select({ categoryId: feeSchedules.categoryId })
    .from(feeSchedules)
    .where(eq(feeSchedules.id, invoice.feeScheduleId))
    .limit(1);
  if (!schedule) throw new Abort(t.finance.errors.categoryKind);
  return schedule.categoryId;
}

export async function verifyPayment(user: SessionUser, paymentId: string): Promise<Result> {
  assertCan(user, "finance.verify");
  return inTx(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for("update");
    if (!payment || payment.status !== "submitted") throw new Abort(t.finance.errors.paymentNotPending);
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1).for("update");
    if (!invoice || invoice.status !== "pending") throw new Abort(t.finance.errors.invoiceNotPayable);
    const today = todayInJakarta();
    await assertOpenMonth(tx, today);
    const categoryId = await categoryForInvoice(tx, invoice);

    await tx
      .update(payments)
      .set({ status: "verified", verifiedBy: user.id, verifiedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await tx.update(invoices).set({ status: "paid", updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
    await tx.insert(transactions).values({
      occurredOn: today,
      kind: "income",
      categoryId,
      amount: payment.amount,
      description: invoice.title,
      paymentId: payment.id,
      createdBy: user.id,
    });
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.verify",
      entityType: "payment",
      entityId: payment.id,
      data: { invoiceId: invoice.id, amount: payment.amount },
    });
    return ok(t.finance.verify.verified);
  });
}

export async function rejectPayment(user: SessionUser, paymentId: string, reason: string): Promise<Result> {
  assertCan(user, "finance.verify");
  return inTx(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for("update");
    if (!payment || payment.status !== "submitted") throw new Abort(t.finance.errors.paymentNotPending);
    await tx
      .update(payments)
      .set({ status: "rejected", rejectionReason: reason, verifiedBy: user.id, verifiedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await tx
      .update(invoices)
      .set({ status: "unpaid", updatedAt: new Date() })
      .where(and(eq(invoices.id, payment.invoiceId), eq(invoices.status, "pending")));
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.reject",
      entityType: "payment",
      entityId: payment.id,
      note: reason,
    });
    return ok(t.finance.verify.rejected);
  });
}

export async function recordCashPayment(user: SessionUser, invoiceId: string, note: string): Promise<Result> {
  assertCan(user, "finance.verify");
  return inTx(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1).for("update");
    if (!invoice || invoice.status !== "unpaid") throw new Abort(t.finance.errors.invoiceNotPayable);
    const today = todayInJakarta();
    await assertOpenMonth(tx, today);
    const categoryId = await categoryForInvoice(tx, invoice);

    const [payment] = await tx
      .insert(payments)
      .values({
        invoiceId: invoice.id,
        memberId: invoice.memberId,
        amount: invoice.amount,
        method: "cash",
        status: "verified",
        verifiedBy: user.id,
        verifiedAt: new Date(),
      })
      .returning({ id: payments.id });
    await tx.update(invoices).set({ status: "paid", updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
    await tx.insert(transactions).values({
      occurredOn: today,
      kind: "income",
      categoryId,
      amount: invoice.amount,
      description: `${invoice.title} (${t.finance.paymentMethod.cash})`,
      paymentId: payment?.id,
      createdBy: user.id,
    });
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.verify",
      entityType: "payment",
      entityId: payment?.id,
      note,
      data: { invoiceId: invoice.id, amount: invoice.amount, method: "cash" },
    });
    return ok(t.finance.manage.cashRecorded);
  });
}

// ---------------------------------------------------------------- ledger

export async function addTransaction(
  user: SessionUser,
  input: { occurredOn: string; kind: "income" | "expense"; categoryId: string; amount: number; description: string },
): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    await assertOpenMonth(tx, input.occurredOn);
    const [category] = await tx.select().from(financeCategories).where(eq(financeCategories.id, input.categoryId)).limit(1);
    if (!category || category.kind !== input.kind || !category.active) throw new Abort(t.finance.errors.categoryKind);
    const [row] = await tx.insert(transactions).values({ ...input, createdBy: user.id }).returning({ id: transactions.id });
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.transaction",
      entityType: "transaction",
      entityId: row?.id,
      data: input,
    });
    return ok(t.finance.ledger.added);
  });
}

export async function reverseTransaction(user: SessionUser, transactionId: string, reason: string): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    const [target] = await tx.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!target) throw new Abort(t.errors.notFound);
    const reversed = await tx
      .select({ reversalOf: transactions.reversalOf })
      .from(transactions)
      .where(and(eq(transactions.reversalOf, target.id), isNotNull(transactions.reversalOf)));
    const today = todayInJakarta();
    const check = checkReversal(
      target,
      new Set(reversed.flatMap((r) => (r.reversalOf ? [r.reversalOf] : []))),
      today,
      await closedMonths(tx),
    );
    if (!check.ok) {
      const messages = {
        is_reversal: t.finance.errors.isReversal,
        already_reversed: t.finance.errors.alreadyReversed,
        closed_month: t.finance.errors.closedMonth,
      } as const;
      throw new Abort(messages[check.reason]);
    }

    const [row] = await tx
      .insert(transactions)
      .values({
        occurredOn: today,
        kind: check.kind,
        categoryId: target.categoryId,
        amount: target.amount,
        description: `${t.finance.ledger.reversalTitle(target.description)} (${reason})`,
        reversalOf: target.id,
        createdBy: user.id,
      })
      .returning({ id: transactions.id });

    // Koreksi atas pembayaran tagihan: tagihan kembali belum dibayar.
    if (target.paymentId) {
      const [payment] = await tx
        .update(payments)
        .set({ status: "reversed" })
        .where(eq(payments.id, target.paymentId))
        .returning({ invoiceId: payments.invoiceId });
      if (payment) {
        await tx.update(invoices).set({ status: "unpaid", updatedAt: new Date() }).where(eq(invoices.id, payment.invoiceId));
      }
    }

    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.reversal",
      entityType: "transaction",
      entityId: row?.id,
      note: reason,
      data: { reversalOf: target.id, amount: target.amount, kind: check.kind },
    });
    return ok(t.finance.ledger.reversed);
  });
}

export async function closeMonth(user: SessionUser, month: string, note: string | null): Promise<Result> {
  assertCan(user, "finance.manage");
  return inTx(async (tx) => {
    // Kunci tabel penutupan agar dua bendahara tidak menutup bersamaan.
    const closures = await tx.select({ month: financePeriodClosures.month }).from(financePeriodClosures).for("update");
    const entries: LedgerEntry[] = await tx
      .select({
        id: transactions.id,
        occurredOn: transactions.occurredOn,
        kind: transactions.kind,
        amount: transactions.amount,
        reversalOf: transactions.reversalOf,
      })
      .from(transactions);
    const firstMonth = entries.length > 0 ? entries.map((e) => monthOf(e.occurredOn)).sort()[0] ?? null : null;
    const check = canCloseMonth(month, new Set(closures.map((c) => c.month)), firstMonth, monthOf(todayInJakarta()));
    if (!check.ok) {
      const messages = {
        already_closed: t.finance.errors.alreadyClosed,
        previous_open: t.finance.errors.previousOpen,
        future_month: t.finance.errors.futureMonth,
      } as const;
      throw new Abort(messages[check.reason]);
    }
    const statement = monthlyStatement(entries, month);
    await tx.insert(financePeriodClosures).values({ month, closingBalance: statement.closing, note, closedBy: user.id });
    await writeAudit(tx, {
      actorId: user.id,
      action: "finance.close_month",
      entityType: "finance_period",
      entityId: month,
      note: note ?? undefined,
      data: statement,
    });
    return ok(t.finance.ledger.closed(formatRupiah(statement.closing)));
  });
}

/** Path bukti, bila user boleh melihatnya (bendahara/admin atau pemilik). */
export async function proofPathFor(user: SessionUser, paymentId: string): Promise<string | null> {
  const [payment] = await getDb()
    .select({ memberId: payments.memberId, proofPath: payments.proofPath })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!payment?.proofPath) return null;
  const allowed = can(user, "finance.verify") || can(user, "invoice.read", { memberId: payment.memberId });
  return allowed ? payment.proofPath : null;
}
