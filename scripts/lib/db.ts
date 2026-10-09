import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

// Koneksi untuk skrip CLI (dijalankan lokal atau di GitHub Actions).
// Memakai koneksi langsung, sama seperti migrasi.
export function connectScriptDb() {
  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) {
    throw new Error("DATABASE_URL_DIRECT belum diisi (lihat .env.example)");
  }
  const sql = postgres(url, { max: 1 });
  return { db: drizzle(sql, { schema }), sql, close: () => sql.end() };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diisi (lihat .env.example)`);
  return value;
}
