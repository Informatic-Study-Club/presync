import { defineConfig } from "drizzle-kit";

// Migrasi memakai koneksi langsung (bukan pooler). Lihat docs/ARSITEKTUR.md bagian 15.
// `db:generate` tidak butuh koneksi, jadi URL boleh kosong saat itu.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? "" },
  // Hanya skema public yang dikelola; skema auth, storage, dll. milik Supabase.
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
