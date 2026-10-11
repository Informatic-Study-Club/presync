// Data dummy untuk Supabase lokal: akun uji per peran, anggota palsu tiga
// divisi, kelas dengan sesi (sebagian selesai beserta presensi), satu kegiatan
// yang sedang berlangsung untuk uji pemindai, kas, dan penilaian.
//
// Hanya berjalan terhadap database lokal (aturan wajib 11 dan 14: tidak ada
// data uji di staging/production, tidak ada data anggota nyata di sini).
// Pemakaian: bun run lokal seed
//
// Semua akun memakai password uji di bawah; akun admin, koordinator, dan
// bendahara wajib mendaftarkan 2FA saat login pertama (sama seperti aslinya).

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bwipjs from "bwip-js/node";
import { eq } from "drizzle-orm";
import {
  academicYears,
  assessmentComponents,
  assessmentScores,
  attendance,
  certificateRules,
  classes,
  divisionCoordinators,
  divisions,
  enrollments,
  feeSchedules,
  financeCategories,
  invoices,
  memberCodeCounters,
  memberRoles,
  members,
  payments,
  sessions,
  terms,
  transactions,
} from "@/db/schema";
import { generateRegularSessions } from "@/lib/academic/schedule";
import { addDays, addMinutes, todayInJakarta } from "@/lib/academic/time";
import { WEB_DEV_TEMPLATE } from "@/lib/assessment/rules";
import { MAX_PROOF_BYTES, proofObjectPath } from "@/lib/finance/proof";
import { formatMemberCode } from "@/lib/members/member-code";
import { connectScriptDb, requireEnv } from "./lib/db";

/** Password semua akun uji lokal. */
export const TEST_PASSWORD = "presync-lokal-2026";
const DOMAIN = "presync.test";
const BATCH = "01";
const YEAR = "26";

function assertLocal() {
  const url = new URL(requireEnv("DATABASE_URL_DIRECT"));
  const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!local || process.env.PRESYNC_LOKAL !== "1") {
    throw new Error("seed-dummy hanya untuk Supabase lokal. Jalankan lewat: bun run lokal seed");
  }
}

assertLocal();
const { db, close } = connectScriptDb();
const auth = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FIRST = ["Andi", "Budi", "Citra", "Dewi", "Eka", "Fajar", "Gita", "Hana", "Indra", "Joko", "Kirana", "Lukman"];
const LAST = ["Pratama", "Santoso", "Wijaya", "Lestari", "Saputra", "Rahmawati", "Nugroho", "Permata"];

type Person = {
  email: string;
  fullName: string;
  divisionSlug: string;
  role?: "admin" | "koordinator" | "bendahara";
};

async function createAuthUser(email: string, fullName: string): Promise<string> {
  const { data, error } = await auth.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`Gagal membuat akun ${email}: ${error?.message}`);
  return data.user.id;
}

try {
  const [already] = await db.select({ id: members.id }).from(members).where(eq(members.email, `admin@${DOMAIN}`)).limit(1);
  if (already) {
    console.log("Data dummy sudah ada. Untuk mengulang: bunx supabase@2.120.0 db reset, lalu bun run lokal migrate dan seed.");
    process.exit(0);
  }

  const divisionRows = await db.select().from(divisions);
  const divisionBySlug = new Map(divisionRows.map((d) => [d.slug, d]));
  if (divisionBySlug.size < 3) throw new Error("Divisi belum ada. Jalankan seed:divisi dulu.");

  // ---------------------------------------------------------------- anggota
  const people: Person[] = [
    { email: `admin@${DOMAIN}`, fullName: "Admin Uji", divisionSlug: "web-development", role: "admin" },
    { email: `bendahara@${DOMAIN}`, fullName: "Bendahara Uji", divisionSlug: "ui-ux", role: "bendahara" },
    { email: `koordinator.web@${DOMAIN}`, fullName: "Koordinator Web", divisionSlug: "web-development", role: "koordinator" },
    { email: `koordinator.ml@${DOMAIN}`, fullName: "Koordinator ML", divisionSlug: "machine-learning", role: "koordinator" },
  ];
  const slugs = ["web-development", "machine-learning", "ui-ux"];
  for (let i = 0; i < 24; i++) {
    people.push({
      email: `anggota${String(i + 1).padStart(2, "0")}@${DOMAIN}`,
      fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
      divisionSlug: slugs[i % 3]!,
    });
  }

  const memberIds = new Map<string, string>();
  const byDivision = new Map<string, string[]>(slugs.map((s) => [s, []]));
  let seq = 0;
  for (const person of people) {
    seq += 1;
    const id = await createAuthUser(person.email, person.fullName);
    const division = divisionBySlug.get(person.divisionSlug)!;
    await db.insert(members).values({
      id,
      memberCode: formatMemberCode({ year: YEAR, batch: BATCH, seq }),
      fullName: person.fullName,
      email: person.email,
      phone: `+62812${String(10000000 + seq).slice(0, 8)}`,
      divisionId: division.id,
      batch: BATCH,
    });
    if (person.role) await db.insert(memberRoles).values({ memberId: id, role: person.role });
    if (person.role === "koordinator") {
      await db.insert(divisionCoordinators).values({ memberId: id, divisionId: division.id });
    }
    memberIds.set(person.email, id);
    byDivision.get(person.divisionSlug)!.push(id);
  }
  await db.insert(memberCodeCounters).values({ batch: BATCH, lastSeq: seq });
  const adminId = memberIds.get(`admin@${DOMAIN}`)!;
  const treasurerId = memberIds.get(`bendahara@${DOMAIN}`)!;

  // ---------------------------------------------------------------- akademik
  const today = todayInJakarta();
  const [year] = await db
    .insert(academicYears)
    .values({ name: "2026/2027", startsOn: addDays(today, -120), endsOn: addDays(today, 240) })
    .returning();
  const [term] = await db
    .insert(terms)
    .values({ academicYearId: year!.id, name: "Ganjil", startsOn: addDays(today, -60), endsOn: addDays(today, 90) })
    .returning();

  const now = new Date();
  const classIds = new Map<string, string>();
  for (const slug of slugs) {
    const division = divisionBySlug.get(slug)!;
    const [cls] = await db
      .insert(classes)
      .values({
        divisionId: division.id,
        termId: term!.id,
        name: `${division.name} Dasar`,
        plannedSessions: 7,
        defaultStartTime: "15:30",
        defaultDurationMinutes: 120,
        defaultMode: "offline",
        defaultLocation: "Lab Komputer 2",
        createdBy: adminId,
      })
      .returning();
    classIds.set(slug, cls!.id);

    // Tujuh Kamis mulai empat minggu lalu: yang sudah lewat ditandai selesai.
    const plan = generateRegularSessions({
      firstDate: addDays(today, -28),
      count: 7,
      startTime: "15:30",
      durationMinutes: 120,
      holidays: [],
    });
    const inserted = await db
      .insert(sessions)
      .values(
        plan.sessions.map((s) => ({
          classId: cls!.id,
          divisionId: division.id,
          kind: "regular" as const,
          mode: "offline" as const,
          status: s.endsAt < now ? ("done" as const) : ("scheduled" as const),
          title: `${division.name} Dasar #${s.sequence}`,
          sequence: s.sequence,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          location: "Lab Komputer 2",
          createdBy: adminId,
        })),
      )
      .returning();

    const enrolled = byDivision.get(slug)!;
    await db.insert(enrollments).values(enrolled.map((memberId) => ({ classId: cls!.id, memberId, enrolledBy: adminId })));

    // Presensi sesi selesai: kebanyakan hadir, sebagian izin/sakit/tidak hadir.
    const statuses = ["hadir", "hadir", "hadir", "hadir", "izin", "hadir", "sakit", "tidak_hadir"] as const;
    const rows = inserted
      .filter((s) => s.status === "done")
      .flatMap((s, si) =>
        enrolled.map((memberId, mi) => {
          const status = statuses[(mi + si * 3) % statuses.length]!;
          return {
            sessionId: s.id,
            memberId,
            status,
            method: status === "hadir" ? ("scan_barcode" as const) : ("manual" as const),
            note: status === "hadir" ? null : "Data dummy",
            recordedBy: adminId,
            recordedAt: addMinutes(s.startsAt, 5),
          };
        }),
      );
    if (rows.length > 0) await db.insert(attendance).values(rows);
  }

  // Kegiatan yang sedang berlangsung: jendela scan terbuka untuk uji pemindai.
  await db.insert(sessions).values({
    kind: "activity",
    mode: "offline",
    title: "Kegiatan Uji Pemindai",
    startsAt: addMinutes(now, -30),
    endsAt: addMinutes(now, 90),
    location: "Aula",
    createdBy: adminId,
  });

  // ---------------------------------------------------------------- penilaian (kelas Web Dev)
  const webClass = classIds.get("web-development")!;
  const components = await db
    .insert(assessmentComponents)
    .values(WEB_DEV_TEMPLATE.components.map((c, position) => ({ ...c, classId: webClass, position })))
    .returning();
  await db.insert(certificateRules).values({ classId: webClass, rule: WEB_DEV_TEMPLATE.rule, updatedBy: adminId });
  const scoreRows = components
    .filter((c) => c.kind === "score")
    .flatMap((c, ci) =>
      byDivision.get("web-development")!.map((memberId, mi) => ({
        componentId: c.id,
        memberId,
        value: 55 + ((mi * 7 + ci * 11) % 45),
        updatedBy: adminId,
      })),
    );
  await db.insert(assessmentScores).values(scoreRows);

  // ---------------------------------------------------------------- kas
  const [income] = await db.insert(financeCategories).values({ name: "Iuran", kind: "income" }).returning();
  const [expense] = await db.insert(financeCategories).values({ name: "Konsumsi", kind: "expense" }).returning();
  const [schedule] = await db
    .insert(feeSchedules)
    .values({ name: "Iuran bulanan", categoryId: income!.id, amount: 10000, period: "monthly", dueDay: 10, createdBy: treasurerId })
    .returning();

  const month = today.slice(0, 7);
  const allMembers = [...memberIds.values()];
  const invoiceRows = await db
    .insert(invoices)
    .values(
      allMembers.map((memberId) => ({
        feeScheduleId: schedule!.id,
        memberId,
        period: month,
        title: `Iuran bulanan ${month}`,
        amount: 10000,
        dueOn: `${month}-10`,
      })),
    )
    .returning();

  // Bukti transfer dummy di bucket privat yang sama dengan aplikasi
  // (src/lib/finance/storage.ts), supaya alur verifikasi bisa diuji.
  const BUCKET = "bukti-pembayaran";
  const { data: bucket } = await auth.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error } = await auth.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_PROOF_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
    if (error) throw error;
  }
  const proofImage = await bwipjs.toBuffer({
    bcid: "code128",
    text: "BUKTI TRANSFER DUMMY",
    scale: 2,
    includetext: true,
    backgroundcolor: "FFFFFF",
    paddingwidth: 10,
    paddingheight: 10,
  });

  // Separuh lunas (tercatat di buku kas), beberapa menunggu verifikasi.
  for (const [i, invoice] of invoiceRows.entries()) {
    if (i % 2 === 0) {
      const [payment] = await db
        .insert(payments)
        .values({
          invoiceId: invoice.id,
          memberId: invoice.memberId,
          amount: invoice.amount,
          method: "cash",
          status: "verified",
          verifiedBy: treasurerId,
          verifiedAt: now,
        })
        .returning();
      await db.insert(transactions).values({
        occurredOn: today,
        kind: "income",
        categoryId: income!.id,
        amount: invoice.amount,
        description: `${invoice.title} (tunai)`,
        paymentId: payment!.id,
        createdBy: treasurerId,
      });
      await db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoice.id));
    } else if (i % 5 === 1) {
      const proofPath = proofObjectPath(invoice.memberId, invoice.id, randomUUID(), "png");
      const { error } = await auth.storage
        .from(BUCKET)
        .upload(proofPath, proofImage, { contentType: "image/png", upsert: false });
      if (error) throw error;
      await db.insert(payments).values({
        invoiceId: invoice.id,
        memberId: invoice.memberId,
        amount: invoice.amount,
        method: "transfer",
        status: "submitted",
        proofPath,
      });
      await db.update(invoices).set({ status: "pending" }).where(eq(invoices.id, invoice.id));
    }
  }
  await db.insert(transactions).values({
    occurredOn: today,
    kind: "expense",
    categoryId: expense!.id,
    amount: 45000,
    description: "Konsumsi pertemuan (dummy)",
    createdBy: treasurerId,
  });

  console.log(`Data dummy dibuat: ${people.length} akun (@${DOMAIN}), 3 kelas, 1 kegiatan berlangsung, kas, penilaian.`);
  console.log("Akun uji: admin@, bendahara@, koordinator.web@, koordinator.ml@, anggota01-24@ (password di scripts/seed-dummy.ts).");
} finally {
  await close();
}
