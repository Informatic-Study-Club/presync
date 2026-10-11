import { z } from "zod";
import { id as t } from "@/messages/id";
import { normalizeName } from "./name";
import { normalizePhone } from "./phone";

// Ubah profil anggota sebagai fungsi murni: validasi isian dan selisih
// perubahan untuk audit log. Kode ID dan batch tidak termasuk, karena batch
// tertanam di kode ID yang permanen (aturan wajib 7).

export const MEMBER_STATUSES = ["aktif", "nonaktif", "alumni"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export type EditableProfile = {
  fullName: string;
  email: string;
  phone: string;
  divisionId: string;
  status: MemberStatus;
};

const p = t.profile.edit;

export const profileUpdateSchema = z.object({
  memberId: z.uuid(),
  fullName: z
    .string()
    .max(200)
    .transform((v) => normalizeName(v))
    .refine((v) => v.length > 0, p.nameRequired),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email(t.import.rowErrors.emailInvalid).max(254)),
  phone: z
    .string()
    .max(30)
    .transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: t.import.rowErrors.phoneInvalid });
        return z.NEVER;
      }
      return phone;
    }),
  divisionId: z.uuid(p.divisionRequired),
  status: z.enum(MEMBER_STATUSES),
  note: z.string().trim().max(500).optional().default(""),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export type ProfileChange = { field: keyof EditableProfile; from: string; to: string };

/** Field yang berubah, urut sesuai formulir. Kosong berarti tidak ada perubahan. */
export function diffProfile(before: EditableProfile, after: EditableProfile): ProfileChange[] {
  const fields: (keyof EditableProfile)[] = ["fullName", "email", "phone", "divisionId", "status"];
  return fields
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, from: before[field], to: after[field] }));
}

/**
 * Alasan perubahan ditolak sebelum menyentuh database, atau null bila boleh.
 * Mengubah status akun sendiri dicegah karena anggota tidak aktif tidak bisa
 * login, sehingga admin bisa mengunci dirinya sendiri.
 */
export function profileChangeError(
  actorId: string,
  memberId: string,
  changes: readonly ProfileChange[],
  note: string,
): string | null {
  if (changes.length === 0) return p.noChanges;
  const statusChange = changes.some((c) => c.field === "status");
  if (statusChange && actorId === memberId) return p.cannotChangeOwnStatus;
  // Status dan email menyangkut hak login: wajib beralasan di audit log.
  const sensitive = statusChange || changes.some((c) => c.field === "email");
  if (sensitive && note.length < 3) return p.noteRequired;
  return null;
}
