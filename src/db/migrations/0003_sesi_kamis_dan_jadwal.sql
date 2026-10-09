-- Migrasi kustom (docs/ARSITEKTUR.md bagian 8). Ditulis manual karena
-- drizzle-kit tidak bisa membuat exclusion constraint, dan aturan hari Kamis
-- harus dihitung dalam zona Asia/Jakarta.

-- Kelas rutin hanya boleh pada hari Kamis (ISO dow = 4), zona Asia/Jakarta.
-- Kelas tambahan (extra) dan kegiatan (activity) bebas hari.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_regular_on_thursday"
  CHECK ("kind" <> 'regular'
         OR extract(isodow FROM ("starts_at" AT TIME ZONE 'Asia/Jakarta')) = 4);--> statement-breakpoint

-- Sesi pada kelas yang sama tidak boleh tumpang tindih. Sesi berstatus "off"
-- (libur/dibatalkan) dikecualikan; kegiatan tanpa kelas (class_id NULL) tidak
-- pernah bentrok karena NULL tidak sama dengan apa pun.
-- Supabase menaruh extension di skema "extensions" (bukan public, yang
-- terekspos API); skema itu sudah ada di search_path.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_no_overlap"
  EXCLUDE USING gist ("class_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)
  WHERE ("status" <> 'off');
