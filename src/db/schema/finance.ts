import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { members } from "./members";
import { divisions } from "./organization";

// Kas (docs/ARSITEKTUR.md bagian 11). Nominal selalu bigint rupiah utuh
// (aturan wajib 6). Saldo dihitung dari view, tidak pernah disimpan.

export const transactionKind = pgEnum("transaction_kind", ["income", "expense"]);

export const financeCategories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    kind: transactionKind("kind").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
).enableRLS();

export const feePeriod = pgEnum("fee_period", ["monthly", "once"]);

// Jadwal iuran: dasar pembuatan tagihan per anggota per periode.
export const feeSchedules = pgTable(
  "fee_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => financeCategories.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    period: feePeriod("period").notNull(),
    /** Bulanan: tanggal jatuh tempo tiap bulan (1-28). */
    dueDay: integer("due_day"),
    /** Sekali bayar: tanggal jatuh tempo. */
    dueOn: date("due_on"),
    /** Kosong = semua divisi / semua batch. */
    divisionId: uuid("division_id").references(() => divisions.id),
    batch: varchar("batch", { length: 2 }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("fee_schedules_amount_positive", sql`${t.amount} > 0`),
    check(
      "fee_schedules_due",
      sql`(${t.period} = 'monthly' and ${t.dueDay} between 1 and 28) or (${t.period} = 'once' and ${t.dueOn} is not null)`,
    ),
  ],
).enableRLS();

export const invoiceStatus = pgEnum("invoice_status", ["unpaid", "pending", "paid", "waived"]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feeScheduleId: uuid("fee_schedule_id").references(() => feeSchedules.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    /** "YYYY-MM" untuk iuran bulanan, "sekali" untuk iuran sekali bayar. */
    period: varchar("period", { length: 7 }).notNull(),
    title: text("title").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    dueOn: date("due_on").notNull(),
    status: invoiceStatus("status").notNull().default("unpaid"),
    waivedReason: text("waived_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("invoices_schedule_member_period_unique").on(t.feeScheduleId, t.memberId, t.period),
    check("invoices_amount_positive", sql`${t.amount} > 0`),
    check("invoices_waived_reason", sql`${t.status} <> 'waived' or ${t.waivedReason} is not null`),
    index("invoices_member_idx").on(t.memberId, t.status),
    index("invoices_status_due_idx").on(t.status, t.dueOn),
  ],
).enableRLS();

export const paymentMethod = pgEnum("payment_method", ["transfer", "cash", "gateway"]);
export const paymentStatus = pgEnum("payment_status", ["submitted", "verified", "rejected", "reversed"]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    method: paymentMethod("method").notNull(),
    status: paymentStatus("status").notNull().default("submitted"),
    /** Path objek di bucket privat bukti pembayaran. */
    proofPath: text("proof_path"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedBy: uuid("verified_by").references(() => members.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    // Kolom siap payment gateway (belum dipakai).
    provider: text("provider"),
    providerOrderId: text("provider_order_id").unique(),
    providerStatus: text("provider_status"),
    feeAmount: bigint("fee_amount", { mode: "number" }),
    rawWebhook: jsonb("raw_webhook"),
  },
  (t) => [
    check("payments_amount_positive", sql`${t.amount} > 0`),
    check("payments_transfer_proof", sql`${t.method} <> 'transfer' or ${t.proofPath} is not null`),
    check("payments_rejection_reason", sql`${t.status} <> 'rejected' or ${t.rejectionReason} is not null`),
    index("payments_status_idx").on(t.status, t.submittedAt),
    index("payments_invoice_idx").on(t.invoiceId),
  ],
).enableRLS();

// Ledger hanya-tambah. UPDATE/DELETE/TRUNCATE ditolak trigger (migrasi
// kustom). Koreksi = transaksi baru berjenis kebalikan dengan reversal_of.
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredOn: date("occurred_on").notNull(),
    kind: transactionKind("kind").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => financeCategories.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    paymentId: uuid("payment_id")
      .references(() => payments.id)
      .unique(),
    reversalOf: uuid("reversal_of")
      .references((): AnyPgColumn => transactions.id)
      .unique(),
    createdBy: uuid("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    index("transactions_occurred_idx").on(t.occurredOn),
  ],
).enableRLS();

// Penutupan buku per bulan: transaksi baru tidak boleh bertanggal di bulan
// yang sudah ditutup. Saldo penutupan disimpan sebagai catatan, bukan sumber.
export const financePeriodClosures = pgTable(
  "finance_period_closures",
  {
    month: varchar("month", { length: 7 }).primaryKey(),
    closingBalance: bigint("closing_balance", { mode: "number" }).notNull(),
    note: text("note"),
    closedBy: uuid("closed_by").references(() => members.id),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("finance_period_closures_month", sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`)],
).enableRLS();

// View dibuat di migrasi kustom (security_invoker, tanpa akses anon).
export const financeBalance = pgView("finance_balance", {
  totalIncome: bigint("total_income", { mode: "number" }).notNull(),
  totalExpense: bigint("total_expense", { mode: "number" }).notNull(),
  balance: bigint("balance", { mode: "number" }).notNull(),
}).existing();

export const financeMonthly = pgView("finance_monthly", {
  month: varchar("month", { length: 7 }).notNull(),
  income: bigint("income", { mode: "number" }).notNull(),
  expense: bigint("expense", { mode: "number" }).notNull(),
}).existing();

export const memberArrears = pgView("member_arrears", {
  memberId: uuid("member_id").notNull(),
  invoiceCount: integer("invoice_count").notNull(),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
  oldestDueOn: date("oldest_due_on").notNull(),
}).existing();
