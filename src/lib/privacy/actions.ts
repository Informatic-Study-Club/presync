"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { dataRequests } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";

export type ActionState = { error?: string; success?: string } | undefined;

const requestSchema = z.object({
  kind: z.enum(["deletion", "correction"]),
  reason: z.string().trim().min(10, t.privacy.reasonTooShort).max(2000),
});

export async function submitDataRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireSession();
  if (!can(user, "privacy.request", { memberId: user.id })) return { error: t.errors.forbidden };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };

  const db = getDb();
  const [pending] = await db
    .select({ id: dataRequests.id })
    .from(dataRequests)
    .where(
      and(
        eq(dataRequests.memberId, user.id),
        eq(dataRequests.kind, parsed.data.kind),
        eq(dataRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) return { error: t.privacy.pendingExists };

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dataRequests)
      .values({ memberId: user.id, kind: parsed.data.kind, reason: parsed.data.reason })
      .returning({ id: dataRequests.id });
    await writeAudit(tx, {
      actorId: user.id,
      action: "privacy.request",
      entityType: "data_request",
      entityId: row?.id,
      data: { kind: parsed.data.kind },
    });
  });
  revalidatePath("/privasi");
  return { success: t.privacy.submitted };
}

const resolveSchema = z.object({
  requestId: z.uuid(),
  status: z.enum(["done", "rejected"]),
  note: z.string().trim().min(3, t.errors.noteRequired).max(2000),
});

export async function resolveDataRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireSession();
  if (!can(user, "privacy.manage")) return { error: t.errors.forbidden };
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };

  const updated = await getDb().transaction(async (tx) => {
    const rows = await tx
      .update(dataRequests)
      .set({
        status: parsed.data.status,
        resolutionNote: parsed.data.note,
        handledBy: user.id,
        handledAt: new Date(),
      })
      .where(and(eq(dataRequests.id, parsed.data.requestId), eq(dataRequests.status, "pending")))
      .returning({ id: dataRequests.id });
    if (rows.length === 0) return false;
    await writeAudit(tx, {
      actorId: user.id,
      action: "privacy.resolve",
      entityType: "data_request",
      entityId: parsed.data.requestId,
      note: parsed.data.note,
      data: { status: parsed.data.status },
    });
    return true;
  });
  if (!updated) return { error: t.errors.notFound };
  revalidatePath("/admin/permintaan-data");
  return { success: t.privacy.updated };
}
