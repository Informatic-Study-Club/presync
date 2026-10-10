-- Persiapan database kosong (Postgres biasa) sebelum pg_restore cadangan Presync.
-- Meniru bagian lingkungan Supabase yang dirujuk skema public:
-- - auth.users (hanya kolom yang dicadangkan; password tidak ikut dicadangkan),
-- - skema "extensions" dengan btree_gist (exclusion constraint jadwal),
-- - peran anon/authenticated (dicabut haknya oleh migrasi 0006).
-- Dipakai .github/workflows/backup.yml dan uji pemulihan manual
-- (docs/SERAH-TERIMA.md bagian 9).

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
);

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
