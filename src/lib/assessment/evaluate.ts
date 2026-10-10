import type { AttendanceSummary } from "@/lib/attendance/summary";
import { id as t } from "@/messages/id";
import { type CertificateRule, type ComponentDef, totalWeight } from "./rules";

// Evaluasi kelayakan sertifikat sebagai fungsi murni (docs/ARSITEKTUR.md bagian 10).
// Skor akhir = jumlah (bobot x nilai komponen) / 100, dengan nilai komponen:
// - score: nilai 0-100 (kosong dihitung 0),
// - done_flag: 100 bila selesai, 0 bila belum,
// - attendance: rasio hadir/sesi selesai x 100, tanpa pembulatan (0 bila belum
//   ada sesi selesai), supaya skor akhir tidak bergeser karena pembulatan ganda.

export type ScoreEntry = { value: number | null; done: boolean | null };

export type Evaluation = {
  status: "eligible" | "not_eligible";
  finalScore: number;
  /** Nilai per komponen yang dipakai, untuk ditampilkan. */
  componentValues: Record<string, number>;
  reasons: string[];
};

const scoreFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function componentValue(
  component: Pick<ComponentDef, "kind">,
  entry: ScoreEntry | undefined,
  attendance: Pick<AttendanceSummary, "hadir" | "counted">,
): number {
  switch (component.kind) {
    case "score":
      return entry?.value ?? 0;
    case "done_flag":
      return entry?.done ? 100 : 0;
    case "attendance":
      return attendance.counted > 0 ? (attendance.hadir / attendance.counted) * 100 : 0;
  }
}

function isComplete(component: ComponentDef, entry: ScoreEntry | undefined, attendance: AttendanceSummary): boolean {
  switch (component.kind) {
    case "score":
      return entry?.value !== null && entry?.value !== undefined;
    case "done_flag":
      return entry?.done === true;
    case "attendance":
      return attendance.counted > 0;
  }
}

export function evaluateCertificate(
  rule: CertificateRule,
  components: readonly ComponentDef[],
  scores: ReadonlyMap<string, ScoreEntry>,
  attendance: AttendanceSummary,
): Evaluation {
  const reasons: string[] = [];
  const reasonText = t.assessment.reasonText;

  const componentValues: Record<string, number> = {};
  let weighted = 0;
  for (const component of components) {
    const value = componentValue(component, scores.get(component.key), attendance);
    componentValues[component.key] = Math.round(value * 100) / 100;
    weighted += component.weight * value;
  }
  const finalScore = Math.round(weighted) / 100;

  if (components.length > 0 && totalWeight(components) !== 100) reasons.push(reasonText.weight);

  for (const key of rule.requireAllComponents) {
    const component = components.find((c) => c.key === key);
    if (!component || !isComplete(component, scores.get(key), attendance)) {
      reasons.push(reasonText.missing(component?.name ?? key));
    }
  }

  if (rule.maxIzin !== null && attendance.izin > rule.maxIzin) {
    reasons.push(reasonText.izin(attendance.izin, rule.maxIzin));
  }

  if (rule.minAttendancePercent !== null) {
    if (attendance.percent === null) reasons.push(reasonText.noAttendance);
    else if (attendance.percent < rule.minAttendancePercent) {
      reasons.push(reasonText.attendance(scoreFormat.format(attendance.percent), rule.minAttendancePercent));
    }
  }

  if (rule.minScore !== null && finalScore < rule.minScore) {
    reasons.push(reasonText.score(scoreFormat.format(finalScore), rule.minScore));
  }

  return { status: reasons.length === 0 ? "eligible" : "not_eligible", finalScore, componentValues, reasons };
}

/** Status akhir setelah penimpaan oleh koordinator (bila ada). */
export function finalStatus(
  evaluation: Pick<Evaluation, "status">,
  override: { status: "eligible" | "not_eligible" } | null,
): "eligible" | "not_eligible" {
  return override?.status ?? evaluation.status;
}
