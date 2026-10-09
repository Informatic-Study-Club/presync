import "server-only";
import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { type Db, getDb, type Tx } from "@/db";
import { divisions, importBatches, memberCodeCounters, members } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assertCan, type SessionUser } from "@/lib/authz";
import { parseMemberCode, yearDigits } from "@/lib/members/member-code";
import { enqueueNotifications } from "@/lib/notifications/outbox";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { id as t } from "@/messages/id";
import { parseImportFile } from "./parse";
import { type BatchState, type ImportContext, type ImportPlan, planImport, type RawImportRow } from "./plan";

export function fileHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Muat data pembanding untuk planImport. Di dalam transaksi impor, baris
 * counter batch terkait dikunci (FOR UPDATE) supaya penerbitan kode tidak
 * bentrok dengan impor lain.
 */
async function loadImportContext(
  executor: Db | Tx,
  lockBatches?: readonly string[],
): Promise<ImportContext> {
  if (lockBatches && lockBatches.length > 0) {
    await executor
      .insert(memberCodeCounters)
      .values(lockBatches.map((batch) => ({ batch, lastSeq: 0 })))
      .onConflictDoNothing();
  }
  const divisionRows = await executor
    .select({ id: divisions.id, name: divisions.name, slug: divisions.slug })
    .from(divisions);
  const memberRows = await executor
    .select({ email: members.email, phone: members.phone, code: members.memberCode, batch: members.batch })
    .from(members);
  const counterQuery = executor.select().from(memberCodeCounters);
  const counterRows =
    lockBatches && lockBatches.length > 0
      ? await counterQuery.where(inArray(memberCodeCounters.batch, [...lockBatches])).for("update")
      : await counterQuery;

  type MutableBatch = { lastSeq: number; yearCounts: Record<string, number>; seqToCode: Map<number, string> };
  const batches = new Map<string, MutableBatch>();
  const stateFor = (batch: string) => {
    let state = batches.get(batch);
    if (!state) {
      state = { lastSeq: 0, yearCounts: {}, seqToCode: new Map() };
      batches.set(batch, state);
    }
    return state;
  };
  for (const c of counterRows) stateFor(c.batch).lastSeq = c.lastSeq;
  for (const m of memberRows) {
    const parts = parseMemberCode(m.code);
    if (!parts) continue;
    const state = stateFor(m.batch);
    state.lastSeq = Math.max(state.lastSeq, parts.seq);
    state.yearCounts[parts.year] = (state.yearCounts[parts.year] ?? 0) + 1;
    state.seqToCode.set(parts.seq, m.code);
  }

  return {
    divisions: divisionRows,
    existingEmails: new Set(memberRows.map((m) => m.email)),
    existingPhones: new Set(memberRows.map((m) => m.phone)),
    existingCodes: new Set(memberRows.map((m) => m.code)),
    batches: batches as ReadonlyMap<string, BatchState>,
    currentYear: yearDigits(new Date()),
  };
}

export type ImportFileInput = { name: string; data: Uint8Array };

type Prepared =
  | { ok: true; rows: RawImportRow[]; hash: string }
  | { ok: false; error: string };

async function prepare(file: ImportFileInput): Promise<Prepared> {
  const parsed = await parseImportFile(file.name, file.data);
  if (!parsed.ok) return parsed;
  return { ok: true, rows: parsed.rows, hash: fileHash(file.data) };
}

export async function previewImport(
  user: SessionUser,
  file: ImportFileInput,
): Promise<{ ok: true; plan: ImportPlan; hash: string } | { ok: false; error: string }> {
  assertCan(user, "member.import");
  const prepared = await prepare(file);
  if (!prepared.ok) return prepared;
  const plan = planImport(prepared.rows, await loadImportContext(getDb()));
  return { ok: true, plan, hash: prepared.hash };
}

class ImportAbort extends Error {}

export async function commitImport(
  user: SessionUser,
  file: ImportFileInput,
  expectedHash: string,
): Promise<{ ok: true; imported: number; plan: ImportPlan } | { ok: false; error: string }> {
  assertCan(user, "member.import");
  const db = getDb();
  const prepared = await prepare(file);
  if (!prepared.ok) return prepared;
  if (prepared.hash !== expectedHash) {
    return { ok: false, error: t.import.fileErrors.hashMismatch };
  }

  const firstPlan = planImport(prepared.rows, await loadImportContext(db));
  const planned = firstPlan.rows.flatMap((r) => (r.member ? [r.member] : []));
  if (planned.length === 0) return { ok: false, error: t.import.fileErrors.noValidRows };

  const recordFailure = async (error: string) => {
    await db.insert(importBatches).values({
      createdBy: user.id,
      fileName: file.name,
      fileHash: prepared.hash,
      totalRows: prepared.rows.length,
      status: "failed",
      error: error.slice(0, 1000),
    });
  };

  // 1. Akun Auth dibuat di luar transaksi database (API terpisah), lalu
  //    dihapus lagi bila langkah berikutnya gagal.
  const admin = createSupabaseAdminClient();
  const userIds = new Map<string, string>();
  const rollbackAuth = async () => {
    await Promise.allSettled([...userIds.values()].map((id) => admin.auth.admin.deleteUser(id)));
  };

  for (let i = 0; i < planned.length; i += 5) {
    const chunk = planned.slice(i, i + 5);
    const results = await Promise.all(
      chunk.map((m) =>
        admin.auth.admin.createUser({
          email: m.email,
          email_confirm: true,
          user_metadata: { full_name: m.fullName },
        }),
      ),
    );
    const failure = results.findIndex((r) => r.error || !r.data.user);
    results.forEach((r, idx) => {
      const member = chunk[idx];
      if (r.data.user && member) userIds.set(member.email, r.data.user.id);
    });
    if (failure !== -1) {
      const member = chunk[failure];
      const error = results[failure]?.error;
      await rollbackAuth();
      const message =
        error?.code === "email_exists"
          ? t.import.fileErrors.authExists(member?.email ?? "")
          : t.import.fileErrors.authFailed(member?.email ?? "", error?.message ?? "-");
      await recordFailure(message);
      return { ok: false, error: message };
    }
  }

  // 2. Semua data anggota dalam satu transaksi (aturan wajib 8).
  try {
    const result = await db.transaction(async (tx) => {
      const batchKeys = [...new Set(planned.map((m) => m.batch))];
      const plan = planImport(prepared.rows, await loadImportContext(tx, batchKeys));
      const toInsert = plan.rows.flatMap((r) => (r.member ? [r.member] : []));
      const sameSet =
        toInsert.length === userIds.size && toInsert.every((m) => userIds.has(m.email));
      if (!sameSet) throw new ImportAbort(t.import.fileErrors.concurrentChange);

      const inserted = await tx
        .insert(members)
        .values(
          toInsert.map((m) => ({
            id: userIds.get(m.email) as string,
            memberCode: m.memberCode,
            fullName: m.fullName,
            email: m.email,
            phone: m.phone,
            divisionId: m.divisionId,
            batch: m.batch,
          })),
        )
        .returning({ id: members.id });

      for (const counter of plan.counters) {
        await tx
          .insert(memberCodeCounters)
          .values({ batch: counter.batch, lastSeq: counter.lastSeq })
          .onConflictDoUpdate({
            target: memberCodeCounters.batch,
            set: {
              lastSeq: sql`greatest(${memberCodeCounters.lastSeq}, ${counter.lastSeq})`,
              updatedAt: new Date(),
            },
          });
      }

      const [batchRow] = await tx
        .insert(importBatches)
        .values({
          createdBy: user.id,
          fileName: file.name,
          fileHash: prepared.hash,
          totalRows: prepared.rows.length,
          importedRows: inserted.length,
          skippedRows: prepared.rows.length - inserted.length,
          status: "completed",
        })
        .returning({ id: importBatches.id });
      const importId = batchRow?.id ?? "";

      await enqueueNotifications(
        tx,
        inserted.map((m) => ({
          memberId: m.id,
          channel: "email" as const,
          template: "activation",
          idempotencyKey: `activation:${m.id}:${importId}`,
        })),
      );

      await writeAudit(tx, {
        actorId: user.id,
        action: "member.import",
        entityType: "import_batch",
        entityId: importId,
        note: file.name,
        data: {
          imported: inserted.length,
          skipped: prepared.rows.length - inserted.length,
          counters: plan.counters,
          autoCodes: toInsert.filter((m) => m.codeSource === "auto").map((m) => m.memberCode),
        },
      });
      return { imported: inserted.length, plan };
    });
    return { ok: true, ...result };
  } catch (err) {
    await rollbackAuth();
    const message = err instanceof ImportAbort ? err.message : t.common.unknownError;
    await recordFailure(err instanceof Error ? err.message : String(err));
    if (!(err instanceof ImportAbort)) console.error("Impor anggota gagal", err);
    return { ok: false, error: message };
  }
}
