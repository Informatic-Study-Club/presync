import type { Db, Tx } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  /** null bila dilakukan oleh skrip atau sistem. */
  actorId: string | null;
  /** Misalnya "role.grant", "member.import", "finance.verify". */
  action: string;
  entityType: string;
  entityId?: string;
  note?: string;
  data?: Record<string, unknown>;
};

/**
 * Tulis audit log (aturan wajib 9). Panggil dengan `tx` di dalam
 * db.transaction() yang sama dengan aksinya, supaya keduanya atomik.
 */
export async function writeAudit(executor: Db | Tx, entry: AuditEntry) {
  await executor.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    note: entry.note ?? null,
    data: entry.data ?? null,
  });
}
