import postgres from "postgres";
import { ADMIN_EMAIL } from "./helpers";

// Menyiapkan data yang bergantung pada waktu sebelum tes berjalan:
// - kegiatan yang sedang berlangsung, supaya jendela pemindai terbuka;
// - faktor 2FA admin uji dihapus, supaya tes selalu mendaftarkan 2FA dari awal.
// Hanya untuk database lokal, sama seperti scripts/seed-dummy.ts.

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_DIRECT;
  if (!url || process.env.PRESYNC_LOKAL !== "1") {
    throw new Error("Tes e2e hanya untuk Supabase lokal. Jalankan lewat: bun run lokal test");
  }
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`Tes e2e menolak database non-lokal (${host}).`);
  }

  const sql = postgres(url, { max: 1 });
  try {
    const [admin] = await sql<{ id: string }[]>`select id from auth.users where email = ${ADMIN_EMAIL}`;
    if (!admin) throw new Error("Akun uji belum ada. Jalankan: bun run lokal seed");
    await sql`delete from auth.mfa_factors where user_id = ${admin.id}`;

    const [session] = await sql<{ id: string }[]>`
      insert into sessions (kind, mode, title, starts_at, ends_at, location, created_by)
      values ('activity', 'offline', ${`E2E Pemindai ${new Date().toISOString()}`},
              now() - interval '30 minutes', now() + interval '90 minutes', 'Aula', ${admin.id})
      returning id`;
    process.env.E2E_SESSION_ID = session!.id;
  } finally {
    await sql.end();
  }
}
