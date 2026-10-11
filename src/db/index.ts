import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

// Koneksi aplikasi lewat pooler Supabase mode transaction, jadi prepared
// statement harus dimatikan. Koneksi ini melewati RLS: otorisasi sepenuhnya
// tanggung jawab kode server lewat can().
function createDb() {
  const sql = postgres(serverEnv().DATABASE_URL, {
    prepare: false,
    max: 5,
    // Serverless: lepaskan koneksi menganggur supaya tidak menumpuk di pooler
    // Supabase, dan gagal cepat bila database tidak terjangkau.
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Dibuat saat pertama dipakai supaya `next build` tidak butuh DATABASE_URL.
// Disimpan di globalThis agar hot reload tidak membuka koneksi baru terus.
const globalForDb = globalThis as unknown as { presyncDb?: Db };

export function getDb(): Db {
  globalForDb.presyncDb ??= createDb();
  return globalForDb.presyncDb;
}
