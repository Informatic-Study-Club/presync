// Memeriksa aturan wajib 2 di database sungguhan:
// 1. Semua tabel di skema public mengaktifkan RLS.
// 2. Tidak ada policy di skema public.
// 3. API publik Supabase (anon key) tidak mengembalikan data dari tabel maupun view.
// Pemakaian: bun run db:check-rls  (keluar dengan kode 1 bila ada pelanggaran)

import { connectScriptDb, requireEnv } from "./lib/db";

const { sql, close } = connectScriptDb();
let failed = false;

try {
  const withoutRls = await sql<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and not rowsecurity
    order by tablename`;
  if (withoutRls.length > 0) {
    failed = true;
    console.error(`RLS belum aktif: ${withoutRls.map((r) => r.tablename).join(", ")}`);
  } else {
    console.log("OK  RLS aktif di semua tabel public.");
  }

  const policies = await sql<{ tablename: string; policyname: string }[]>`
    select tablename, policyname from pg_policies where schemaname = 'public'`;
  if (policies.length > 0) {
    failed = true;
    for (const p of policies) {
      console.error(`Ada policy (harus didiskusikan dulu): ${p.tablename}.${p.policyname}`);
    }
  } else {
    console.log("OK  Tidak ada policy di skema public.");
  }

  // View ikut diuji: view di skema public bisa menembus RLS bila tidak
  // memakai security_invoker (lihat migrasi 0006).
  const tables = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'
    union all
    select viewname as tablename from pg_views where schemaname = 'public'
    order by tablename`;
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  for (const { tablename } of tables) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${tablename}?select=*&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    const body: unknown = res.ok ? await res.json() : null;
    const leaked = Array.isArray(body) && body.length > 0;
    if (leaked) {
      failed = true;
      console.error(`BOCOR  API publik mengembalikan data dari ${tablename}`);
    } else {
      console.log(`OK  API publik tidak mengembalikan data dari ${tablename} (HTTP ${res.status})`);
    }
  }
} finally {
  await close();
}

if (failed) process.exitCode = 1;
