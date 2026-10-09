// Membuat admin pertama (tidak ada pendaftaran publik, aturan wajib 15).
// Mengirim email undangan Supabase Auth, lalu menyimpan data anggota dan
// peran admin dalam satu transaksi beserta audit log.
//
// Pemakaian:
//   bun run buat-admin --email nama@contoh.com --nama "Nama Lengkap" \
//     --hp 0812xxxxxxxx --divisi web-development --batch 01 --kode ISC2601001
//
// Bila anggota sudah ada (misalnya setelah impor di tahap 2), pakai
// --anggota-ada --email ... untuk sekadar menambah peran admin.

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { divisions, memberCodeCounters, memberRoles, members } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { parseMemberCode } from "@/lib/members/member-code";
import { normalizePhone } from "@/lib/members/phone";
import { connectScriptDb, requireEnv } from "./lib/db";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    nama: { type: "string" },
    hp: { type: "string" },
    divisi: { type: "string" },
    batch: { type: "string" },
    kode: { type: "string" },
    "anggota-ada": { type: "boolean", default: false },
  },
});

const email = z.string().trim().toLowerCase().pipe(z.email()).parse(values.email);
const { db, close } = connectScriptDb();

async function grantAdminToExisting() {
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.email, email))
    .limit(1);
  if (!member) throw new Error(`Anggota dengan email ${email} tidak ditemukan.`);

  await db.transaction(async (tx) => {
    await tx
      .insert(memberRoles)
      .values({ memberId: member.id, role: "admin" })
      .onConflictDoNothing();
    await writeAudit(tx, {
      actorId: null,
      action: "role.grant",
      entityType: "member",
      entityId: member.id,
      note: "Peran admin diberikan lewat skrip buat-admin",
      data: { role: "admin" },
    });
  });
  console.log(`Peran admin ditambahkan untuk ${email}.`);
}

async function createNewAdmin() {
  const input = z
    .object({
      fullName: z.string().trim().min(1, "--nama wajib diisi"),
      phone: z
        .string()
        .transform((v) => normalizePhone(v))
        .pipe(z.string({ error: "--hp tidak valid (harus nomor seluler Indonesia)" })),
      divisionSlug: z.string().min(1, "--divisi wajib diisi"),
      batch: z.string().regex(/^\d{2}$/, "--batch harus 2 digit, misalnya 01"),
      memberCode: z.string().refine((v) => parseMemberCode(v) !== null, {
        message: "--kode harus berformat ISC + 7 digit, misalnya ISC2601001",
      }),
    })
    .refine((v) => parseMemberCode(v.memberCode)?.batch === v.batch, {
      message: "Digit batch pada --kode tidak sama dengan --batch",
    })
    .parse({
      fullName: values.nama?.normalize("NFKC").replace(/\s+/g, " "),
      phone: values.hp ?? "",
      divisionSlug: values.divisi ?? "",
      batch: values.batch ?? "",
      memberCode: values.kode ?? "",
    });

  const [division] = await db
    .select({ id: divisions.id })
    .from(divisions)
    .where(eq(divisions.slug, input.divisionSlug))
    .limit(1);
  if (!division) {
    throw new Error(
      `Divisi "${input.divisionSlug}" tidak ada. Jalankan "bun run seed:divisi" dulu.`,
    );
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${requireEnv("APP_URL")}/auth/confirm?next=/atur-password`,
  });
  if (error || !data.user) {
    throw new Error(`Gagal membuat akun Auth: ${error?.message ?? "tanpa detail"}`);
  }
  const userId = data.user.id;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(members).values({
        id: userId,
        memberCode: input.memberCode,
        fullName: input.fullName,
        email,
        phone: input.phone,
        divisionId: division.id,
        batch: input.batch,
      });
      await tx.insert(memberRoles).values({ memberId: userId, role: "admin" });
      // Nomor urut kode dianggap terpakai agar tidak diterbitkan lagi.
      const seq = parseMemberCode(input.memberCode)?.seq ?? 0;
      await tx
        .insert(memberCodeCounters)
        .values({ batch: input.batch, lastSeq: seq })
        .onConflictDoUpdate({
          target: memberCodeCounters.batch,
          set: { lastSeq: sql`greatest(${memberCodeCounters.lastSeq}, ${seq})`, updatedAt: new Date() },
        });
      await writeAudit(tx, {
        actorId: null,
        action: "role.grant",
        entityType: "member",
        entityId: userId,
        note: "Admin pertama dibuat lewat skrip buat-admin",
        data: { role: "admin", memberCode: input.memberCode },
      });
    });
  } catch (err) {
    // Batalkan akun Auth supaya tidak ada akun tanpa data anggota.
    await supabase.auth.admin.deleteUser(userId);
    throw err;
  }

  console.log(
    `Admin ${input.fullName} (${input.memberCode}) dibuat. Undangan dikirim ke ${email}.`,
  );
}

try {
  if (values["anggota-ada"]) await grantAdminToExisting();
  else await createNewAdmin();
} catch (err) {
  console.error(err instanceof z.ZodError ? z.prettifyError(err) : err);
  process.exitCode = 1;
} finally {
  await close();
}
