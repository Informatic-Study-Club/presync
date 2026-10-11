import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assessmentComponents,
  assessmentScores,
  certificateOverrides,
  certificateRules,
  classes,
  divisions,
  terms,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { classRecap } from "@/lib/attendance/service";
import { can, type SessionUser } from "@/lib/authz";
import { id as t } from "@/messages/id";
import { type Evaluation, evaluateCertificate, finalStatus, type ScoreEntry } from "./evaluate";
import {
  type CertificateRule,
  type ComponentDef,
  componentKey,
  parseRule,
  totalWeight,
  totalWeightWith,
  WEB_DEV_TEMPLATE,
} from "./rules";

export type Result = { ok: boolean; message: string };

async function loadClass(classId: string) {
  const [cls] = await getDb()
    .select({
      id: classes.id,
      name: classes.name,
      divisionId: classes.divisionId,
      divisionName: divisions.name,
      termName: terms.name,
      archivedAt: classes.archivedAt,
    })
    .from(classes)
    .innerJoin(divisions, eq(classes.divisionId, divisions.id))
    .innerJoin(terms, eq(classes.termId, terms.id))
    .where(eq(classes.id, classId))
    .limit(1);
  return cls ?? null;
}

export type MemberResult = {
  memberId: string;
  memberCode: string;
  fullName: string;
  scores: Map<string, ScoreEntry>;
  evaluation: Evaluation;
  override: { status: "eligible" | "not_eligible"; note: string } | null;
  status: "eligible" | "not_eligible";
};

type ClassRow = NonNullable<Awaited<ReturnType<typeof loadClass>>>;

/** Pemuat data penilaian tanpa otorisasi; hanya dipanggil fungsi di bawah. */
async function loadAssessment(cls: ClassRow) {
  const db = getDb();
  const [componentRows, [ruleRow], overrides, recap] = await Promise.all([
    db
      .select()
      .from(assessmentComponents)
      .where(eq(assessmentComponents.classId, cls.id))
      .orderBy(asc(assessmentComponents.position), asc(assessmentComponents.createdAt)),
    db.select().from(certificateRules).where(eq(certificateRules.classId, cls.id)).limit(1),
    db.select().from(certificateOverrides).where(eq(certificateOverrides.classId, cls.id)),
    classRecap(cls.id),
  ]);
  const scoreRows =
    componentRows.length > 0
      ? await db
          .select()
          .from(assessmentScores)
          .where(inArray(assessmentScores.componentId, componentRows.map((c) => c.id)))
      : [];

  const rule = parseRule(ruleRow?.rule);
  const components: (ComponentDef & { id: string })[] = componentRows.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    kind: c.kind,
    weight: c.weight,
  }));
  const keyOf = new Map(componentRows.map((c) => [c.id, c.key]));

  const results: MemberResult[] = recap.map((m) => {
    const scores = new Map<string, ScoreEntry>();
    for (const s of scoreRows) {
      if (s.memberId === m.id) scores.set(keyOf.get(s.componentId) ?? "", { value: s.value, done: s.done });
    }
    const evaluation = evaluateCertificate(rule, components, scores, m.summary);
    const ov = overrides.find((o) => o.memberId === m.id);
    const override = ov ? { status: ov.status, note: ov.note } : null;
    return {
      memberId: m.id,
      memberCode: m.memberCode,
      fullName: m.fullName,
      scores,
      evaluation,
      override,
      status: finalStatus(evaluation, override),
    };
  });

  return { components, rule, totalWeight: totalWeight(components), results };
}

/** Seluruh data penilaian satu kelas (koordinator divisi/admin), atau null. */
export async function classAssessment(user: SessionUser, classId: string) {
  const cls = await loadClass(classId);
  if (!cls) return null;
  const canManage = can(user, "assessment.manage", { divisionId: cls.divisionId });
  if (!canManage && !can(user, "assessment.read", { divisionId: cls.divisionId })) return null;
  return {
    cls,
    canManage,
    canOverride: can(user, "certificate.override", { divisionId: cls.divisionId }),
    ...(await loadAssessment(cls)),
  };
}

/** Hasil milik sendiri, hanya bila anggota terdaftar di kelas itu. */
export async function ownResult(user: SessionUser, classId: string) {
  const cls = await loadClass(classId);
  if (!cls || !can(user, "assessment.read", { memberId: user.id, divisionId: cls.divisionId })) return null;
  const data = await loadAssessment(cls);
  const mine = data.results.find((r) => r.memberId === user.id);
  return mine ? { result: mine, components: data.components } : null;
}

// ---------------------------------------------------------------- perubahan (koordinator)

async function requireManage(user: SessionUser, classId: string) {
  const cls = await loadClass(classId);
  if (!cls) return { cls: null, error: t.errors.notFound } as const;
  if (!can(user, "assessment.manage", { divisionId: cls.divisionId })) return { cls: null, error: t.errors.forbidden } as const;
  // Kelas arsip hanya bisa dilihat, termasuk nilai dan aturan sertifikatnya.
  if (cls.archivedAt) return { cls: null, error: t.academic.classes.archivedLocked } as const;
  return { cls, error: null } as const;
}

export async function addComponent(
  user: SessionUser,
  classId: string,
  input: { name: string; kind: "score" | "done_flag" | "attendance"; weight: number },
): Promise<Result> {
  const { cls, error } = await requireManage(user, classId);
  if (!cls) return { ok: false, message: error };
  const db = getDb();
  const existing = await db.select().from(assessmentComponents).where(eq(assessmentComponents.classId, cls.id));
  const key = componentKey(input.name);
  if (existing.some((c) => c.key === key)) return { ok: false, message: t.assessment.errors.keyTaken };
  if (input.kind === "attendance" && existing.some((c) => c.kind === "attendance")) {
    return { ok: false, message: t.assessment.errors.attendanceTwice };
  }
  const total = totalWeight(existing) + input.weight;
  if (total > 100) return { ok: false, message: t.assessment.errors.weightTooHigh(total) };
  await db.insert(assessmentComponents).values({ classId: cls.id, key, name: input.name, kind: input.kind, weight: input.weight, position: existing.length });
  return { ok: true, message: t.assessment.saved };
}

/** Ubah nama dan bobot. Kunci dan jenis tetap (dipakai aturan sertifikat dan nilai). */
export async function updateComponent(
  user: SessionUser,
  componentId: string,
  input: { name: string; weight: number },
): Promise<Result> {
  const db = getDb();
  const [component] = await db.select().from(assessmentComponents).where(eq(assessmentComponents.id, componentId)).limit(1);
  if (!component) return { ok: false, message: t.errors.notFound };
  const { cls, error } = await requireManage(user, component.classId);
  if (!cls) return { ok: false, message: error };
  if (component.name === input.name && component.weight === input.weight) {
    return { ok: false, message: t.profile.edit.noChanges };
  }
  return db.transaction(async (tx) => {
    const siblings = await tx
      .select({ id: assessmentComponents.id, weight: assessmentComponents.weight })
      .from(assessmentComponents)
      .where(eq(assessmentComponents.classId, cls.id))
      .for("update");
    const total = totalWeightWith(siblings, component.id, input.weight);
    if (total > 100) return { ok: false, message: t.assessment.errors.weightTooHigh(total) };
    await tx.update(assessmentComponents).set(input).where(eq(assessmentComponents.id, component.id));
    // Bobot memengaruhi kelulusan sertifikat, jadi perubahan dicatat.
    await writeAudit(tx, {
      actorId: user.id,
      action: "assessment.component_update",
      entityType: "assessment_component",
      entityId: component.id,
      data: { from: { name: component.name, weight: component.weight }, to: input },
    });
    return { ok: true, message: t.assessment.saved };
  });
}

export async function deleteComponent(user: SessionUser, componentId: string): Promise<Result> {
  const [component] = await getDb().select().from(assessmentComponents).where(eq(assessmentComponents.id, componentId)).limit(1);
  if (!component) return { ok: false, message: t.errors.notFound };
  const { cls, error } = await requireManage(user, component.classId);
  if (!cls) return { ok: false, message: error };
  await getDb().delete(assessmentComponents).where(eq(assessmentComponents.id, component.id));
  return { ok: true, message: t.assessment.saved };
}

export async function applyWebDevTemplate(user: SessionUser, classId: string): Promise<Result> {
  const { cls, error } = await requireManage(user, classId);
  if (!cls) return { ok: false, message: error };
  return getDb().transaction(async (tx) => {
    const existing = await tx.select({ id: assessmentComponents.id }).from(assessmentComponents).where(eq(assessmentComponents.classId, cls.id));
    if (existing.length > 0) return { ok: false, message: t.assessment.templateBlocked };
    await tx.insert(assessmentComponents).values(
      WEB_DEV_TEMPLATE.components.map((c, position) => ({ ...c, classId: cls.id, position })),
    );
    await tx
      .insert(certificateRules)
      .values({ classId: cls.id, rule: WEB_DEV_TEMPLATE.rule, updatedBy: user.id })
      .onConflictDoUpdate({ target: certificateRules.classId, set: { rule: WEB_DEV_TEMPLATE.rule, updatedBy: user.id, updatedAt: new Date() } });
    return { ok: true, message: t.assessment.templateApplied };
  });
}

export async function saveRule(user: SessionUser, classId: string, rule: CertificateRule): Promise<Result> {
  const { cls, error } = await requireManage(user, classId);
  if (!cls) return { ok: false, message: error };
  const keys = new Set(
    (await getDb().select({ key: assessmentComponents.key }).from(assessmentComponents).where(eq(assessmentComponents.classId, cls.id))).map(
      (c) => c.key,
    ),
  );
  const unknown = rule.requireAllComponents.find((k) => !keys.has(k));
  if (unknown) return { ok: false, message: t.assessment.errors.unknownComponent(unknown) };
  await getDb()
    .insert(certificateRules)
    .values({ classId: cls.id, rule, updatedBy: user.id })
    .onConflictDoUpdate({ target: certificateRules.classId, set: { rule, updatedBy: user.id, updatedAt: new Date() } });
  return { ok: true, message: t.assessment.saved };
}

export type ScoreInput = { componentId: string; memberId: string; value: number | null; done: boolean | null };

export async function saveScores(user: SessionUser, classId: string, entries: ScoreInput[]): Promise<Result> {
  const { cls, error } = await requireManage(user, classId);
  if (!cls) return { ok: false, message: error };
  const db = getDb();
  const componentIds = new Set(
    (await db.select({ id: assessmentComponents.id }).from(assessmentComponents).where(eq(assessmentComponents.classId, cls.id))).map((c) => c.id),
  );
  const roster = new Set((await classRecap(cls.id)).map((m) => m.id));
  const valid = entries.filter((e) => componentIds.has(e.componentId) && roster.has(e.memberId));
  if (valid.length === 0) return { ok: true, message: t.assessment.scoresSaved(0) };

  await db.transaction(async (tx) => {
    for (let i = 0; i < valid.length; i += 500) {
      await tx
        .insert(assessmentScores)
        .values(valid.slice(i, i + 500).map((e) => ({ ...e, updatedBy: user.id, updatedAt: new Date() })))
        .onConflictDoUpdate({
          target: [assessmentScores.componentId, assessmentScores.memberId],
          set: {
            value: sql`excluded.value`,
            done: sql`excluded.done`,
            updatedBy: sql`excluded.updated_by`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
  });
  return { ok: true, message: t.assessment.scoresSaved(valid.length) };
}

export async function setOverride(
  user: SessionUser,
  classId: string,
  memberId: string,
  status: "eligible" | "not_eligible" | "clear",
  note: string,
): Promise<Result> {
  const cls = await loadClass(classId);
  if (!cls) return { ok: false, message: t.errors.notFound };
  if (!can(user, "certificate.override", { divisionId: cls.divisionId })) return { ok: false, message: t.errors.forbidden };
  const roster = new Set((await classRecap(cls.id)).map((m) => m.id));
  if (!roster.has(memberId)) return { ok: false, message: t.errors.notFound };

  return getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(certificateOverrides)
      .where(and(eq(certificateOverrides.classId, cls.id), eq(certificateOverrides.memberId, memberId)))
      .limit(1);
    if (status === "clear") {
      await tx
        .delete(certificateOverrides)
        .where(and(eq(certificateOverrides.classId, cls.id), eq(certificateOverrides.memberId, memberId)));
    } else {
      await tx
        .insert(certificateOverrides)
        .values({ classId: cls.id, memberId, status, note, overriddenBy: user.id })
        .onConflictDoUpdate({
          target: [certificateOverrides.classId, certificateOverrides.memberId],
          set: { status, note, overriddenBy: user.id, overriddenAt: new Date() },
        });
    }
    await writeAudit(tx, {
      actorId: user.id,
      action: status === "clear" ? "certificate.override_clear" : "certificate.override",
      entityType: "certificate",
      entityId: `${cls.id}:${memberId}`,
      note,
      data: { before: before ? { status: before.status, note: before.note } : null, after: status },
    });
    return { ok: true, message: status === "clear" ? t.assessment.overrideCleared : t.assessment.overrideSaved };
  });
}
