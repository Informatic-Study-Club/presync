import { z } from "zod";

// Aturan sertifikat dan komponen nilai (docs/ARSITEKTUR.md bagian 10).

export const certificateRuleSchema = z.object({
  /** Kunci komponen yang wajib selesai (done_flag) atau terisi (score). */
  requireAllComponents: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(20).default([]),
  maxIzin: z.number().int().min(0).max(100).nullable().default(null),
  minScore: z.number().min(0).max(100).nullable().default(null),
  minAttendancePercent: z.number().min(0).max(100).nullable().default(null),
});

export type CertificateRule = z.infer<typeof certificateRuleSchema>;

export const EMPTY_RULE: CertificateRule = {
  requireAllComponents: [],
  maxIzin: null,
  minScore: null,
  minAttendancePercent: null,
};

/** Membaca JSON aturan dari database; aturan rusak dianggap kosong. */
export function parseRule(value: unknown): CertificateRule {
  const parsed = certificateRuleSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_RULE;
}

export type ComponentKind = "score" | "done_flag" | "attendance";

export type ComponentDef = { key: string; name: string; kind: ComponentKind; weight: number };

/** "Tugas Kelompok 1" -> "tugas_kelompok_1". */
export function componentKey(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 40) || "komponen"
  );
}

export function totalWeight(components: readonly Pick<ComponentDef, "weight">[]): number {
  return components.reduce((sum, c) => sum + c.weight, 0);
}

/** Total bobot bila satu komponen diganti bobotnya (untuk ubah komponen). */
export function totalWeightWith(
  components: readonly { id: string; weight: number }[],
  componentId: string,
  weight: number,
): number {
  return components.reduce((sum, c) => sum + (c.id === componentId ? weight : c.weight), 0);
}

/** Templat penilaian Web Development dari Google Sheets. */
export const WEB_DEV_TEMPLATE: { components: ComponentDef[]; rule: CertificateRule } = {
  components: [
    { key: "tugas_kelompok", name: "Tugas kelompok", kind: "score", weight: 20 },
    { key: "tugas_individu", name: "Tugas individu", kind: "score", weight: 20 },
    { key: "project_akhir", name: "Project akhir", kind: "score", weight: 40 },
    { key: "absensi", name: "Absensi", kind: "attendance", weight: 20 },
  ],
  rule: {
    requireAllComponents: ["tugas_kelompok", "tugas_individu", "project_akhir"],
    maxIzin: 3,
    minScore: 70,
    minAttendancePercent: null,
  },
};

/** "85", "85,5", "85.5" -> angka 0-100; "" -> null; selain itu undefined (tidak valid). */
export function parseScoreInput(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(trimmed)) return undefined;
  const value = Number(trimmed.replace(",", "."));
  return value >= 0 && value <= 100 ? value : undefined;
}
