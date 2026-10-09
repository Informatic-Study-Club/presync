"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { divisionCoordinators, divisions, memberRoles, members } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { enqueueNotifications } from "@/lib/notifications/outbox";
import { id as t } from "@/messages/id";

export type ActionState = { error?: string; success?: string } | undefined;

// ---------------------------------------------------------------- kartu

const noteSchema = z.string().trim().min(3, t.errors.noteRequired).max(500);

async function loadTarget(memberId: string) {
  const [m] = await getDb()
    .select({ id: members.id, divisionId: members.divisionId, cardVersion: members.cardVersion })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  return m ?? null;
}

const cardSchema = z.object({ memberId: z.uuid(), note: noteSchema });

export async function reissueCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };
  const target = await loadTarget(parsed.data.memberId);
  if (!target) return { error: t.errors.notFound };
  if (!can(user, "card.reissue", { memberId: target.id, divisionId: target.divisionId })) {
    return { error: t.errors.forbidden };
  }

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(members)
      .set({
        cardVersion: sql`${members.cardVersion} + 1`,
        legacyCardAllowed: false,
        updatedAt: new Date(),
      })
      .where(eq(members.id, target.id))
      .returning({ cardVersion: members.cardVersion });
    await writeAudit(tx, {
      actorId: user.id,
      action: "card.reissue",
      entityType: "member",
      entityId: target.id,
      note: parsed.data.note,
      data: { from: target.cardVersion, to: updated?.cardVersion },
    });
  });
  revalidatePath(`/anggota/${target.id}`);
  return { success: t.profile.reissued };
}

const cardStatusSchema = cardSchema.extend({ status: z.enum(["active", "blocked"]) });

export async function setCardStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = cardStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.invalidInput };
  const target = await loadTarget(parsed.data.memberId);
  if (!target) return { error: t.errors.notFound };
  if (!can(user, "card.block", { memberId: target.id, divisionId: target.divisionId })) {
    return { error: t.errors.forbidden };
  }

  await getDb().transaction(async (tx) => {
    await tx
      .update(members)
      .set({ cardStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(members.id, target.id));
    await writeAudit(tx, {
      actorId: user.id,
      action: parsed.data.status === "blocked" ? "card.block" : "card.unblock",
      entityType: "member",
      entityId: target.id,
      note: parsed.data.note,
    });
  });
  revalidatePath(`/anggota/${target.id}`);
  return { success: parsed.data.status === "blocked" ? t.profile.blocked : t.profile.unblocked };
}

// ---------------------------------------------------------------- peran

const rolesSchema = z.object({
  memberId: z.uuid(),
  roles: z.array(z.enum(["admin", "koordinator", "bendahara"])),
  divisionIds: z.array(z.uuid()),
});

export async function saveRolesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  if (!can(user, "role.manage")) return { error: t.errors.forbidden };
  const parsed = rolesSchema.safeParse({
    memberId: formData.get("memberId"),
    roles: formData.getAll("roles"),
    divisionIds: formData.getAll("divisionIds"),
  });
  if (!parsed.success) return { error: t.auth.invalidInput };
  const { memberId, roles } = parsed.data;
  const divisionIds = roles.includes("koordinator") ? [...new Set(parsed.data.divisionIds)] : [];

  if (memberId === user.id && !roles.includes("admin")) {
    return { error: t.profile.cannotRemoveOwnAdmin };
  }
  if (roles.includes("koordinator") && divisionIds.length === 0) {
    return { error: t.profile.coordinatorNeedsDivision };
  }
  if (!(await loadTarget(memberId))) return { error: t.errors.notFound };

  const db = getDb();
  if (divisionIds.length > 0) {
    const known = await db.select({ id: divisions.id }).from(divisions);
    if (!divisionIds.every((d) => known.some((k) => k.id === d))) return { error: t.auth.invalidInput };
  }

  await db.transaction(async (tx) => {
    const before = await tx
      .select({ role: memberRoles.role })
      .from(memberRoles)
      .where(eq(memberRoles.memberId, memberId));
    const beforeDivisions = await tx
      .select({ divisionId: divisionCoordinators.divisionId })
      .from(divisionCoordinators)
      .where(eq(divisionCoordinators.memberId, memberId));

    await tx.delete(memberRoles).where(eq(memberRoles.memberId, memberId));
    if (roles.length > 0) {
      await tx.insert(memberRoles).values(roles.map((role) => ({ memberId, role, grantedBy: user.id })));
    }
    await tx.delete(divisionCoordinators).where(eq(divisionCoordinators.memberId, memberId));
    if (divisionIds.length > 0) {
      await tx.insert(divisionCoordinators).values(divisionIds.map((divisionId) => ({ memberId, divisionId })));
    }

    await writeAudit(tx, {
      actorId: user.id,
      action: "role.change",
      entityType: "member",
      entityId: memberId,
      data: {
        before: { roles: before.map((r) => r.role), divisions: beforeDivisions.map((d) => d.divisionId) },
        after: { roles, divisions: divisionIds },
      },
    });
  });
  revalidatePath(`/anggota/${memberId}`);
  return { success: t.profile.rolesSaved };
}

// ---------------------------------------------------------------- undangan

export async function resendInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z.uuid().safeParse(formData.get("memberId"));
  if (!parsed.success) return { error: t.auth.invalidInput };
  const target = await loadTarget(parsed.data);
  if (!target) return { error: t.errors.notFound };
  if (!can(user, "member.invite", { memberId: target.id, divisionId: target.divisionId })) {
    return { error: t.errors.forbidden };
  }

  await getDb().transaction(async (tx) => {
    await enqueueNotifications(tx, [
      {
        memberId: target.id,
        channel: "email",
        template: "activation",
        idempotencyKey: `activation:${target.id}:manual:${Date.now()}`,
      },
    ]);
    await writeAudit(tx, {
      actorId: user.id,
      action: "member.invite",
      entityType: "member",
      entityId: target.id,
    });
  });
  return { success: t.profile.inviteQueued };
}

