# Presync

Sistem manajemen **Informatics Study Club (ISC)**: presensi barcode/QR, kelas dan sesi, anggota, kas, kalender akademik, penilaian dan sertifikat, serta notifikasi. Organisasi non-komersial di lingkup fakultas, 3 divisi (Web Development, Machine Learning, UI/UX), 85 anggota saat ini, desain untuk kapasitas ±170.

- Production: `presync.informaticstudyclub.com`
- Staging: `staging-presync.informaticstudyclub.com`
- Domain email: `mail.informaticstudyclub.com`

Dokumen lain (baca sebelum mengubah bagian terkait):
- `docs/ARSITEKTUR.md`: keputusan teknis beserta alasannya. **Wajib dibaca** sebelum mengubah skema, auth, kas, presensi, atau notifikasi.
- `docs/ROADMAP.md`: tahap pembangunan dan statusnya.
- `docs/SERAH-TERIMA.md`: layanan, pemilik akun, jadwal perawatan.

## Stack

Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Zod, Drizzle ORM + drizzle-kit, Supabase (Postgres, Auth, Storage, Realtime), Resend (email), Telegram bot + web push, Upstash Redis (rate limit), Cloudflare Turnstile, Vercel Hobby, GitHub Actions. Laporan: `@react-pdf/renderer`, ExcelJS, PapaParse. Kalender: FullCalendar, `rrule`, `ics`. Barcode: `bwip-js` (membuat), `@yudiel/react-qr-scanner` (memindai Code 128 dan QR).

## Aturan wajib

Aturan ini tidak boleh dilanggar tanpa persetujuan eksplisit dari pemilik proyek.

1. **Semua akses data hanya lewat server** (Server Actions atau Route Handlers). Browser tidak pernah query database langsung, dan `supabase-js` di klien hanya untuk Auth dan Realtime.
2. **RLS aktif di semua tabel tanpa policy** (menutup API publik Supabase). Jangan membuat policy tanpa diskusi.
3. **Otorisasi hanya lewat `can(user, aksi, resource)`** di `src/lib/authz`. Jangan mengecek role secara langsung di halaman atau komponen.
4. **Skema database hanya berubah lewat migrasi Drizzle** di repository. Jangan ubah skema lewat dashboard Supabase.
5. **Semua input divalidasi dengan Zod** di server, termasuk hasil impor file.
6. **Kas adalah ledger hanya-tambah.** Tidak ada UPDATE atau DELETE pada `transactions`. Koreksi dibuat sebagai transaksi baru dengan `reversal_of`. Nominal disimpan sebagai integer rupiah. Saldo dihitung dari view, tidak pernah disimpan.
7. **`members.member_code` tidak boleh diubah atau dipakai ulang** setelah terbit.
8. **Operasi yang harus atomik memakai `db.transaction()`**: scan presensi, verifikasi pembayaran, koreksi kas, impor anggota, penerbitan kode ID.
9. **Aksi sensitif wajib masuk `audit_log`**: verifikasi dan koreksi kas, perubahan role, absen manual, impor, penerbitan ulang kartu, penimpaan status sertifikat.
10. **Waktu disimpan `timestamptz`** dan ditampilkan dalam `Asia/Jakarta`. Kelas rutin hanya hari Kamis.
11. **Secret hanya di environment variable.** Jangan commit `.env`, API key, atau data anggota nyata.
12. **Semua teks antarmuka berbahasa Indonesia** dan diambil dari `messages/id.ts`. Format tanggal dan mata uang memakai `id-ID`. Istilah status kehadiran: Hadir, Izin, Sakit, Tidak Hadir.
13. **Notifikasi tidak dikirim langsung dari kode fitur.** Masukkan ke `notification_outbox`, worker yang mengirim lewat adapter. Batas email: 80/hari untuk worker, 20/hari disisakan untuk email auth.
14. **Preview Vercel dan staging tidak boleh memakai database production.**
15. **Tanpa pendaftaran publik.** Akun hanya dibuat lewat impor atau undangan.

## Konvensi

- TypeScript strict. Hindari `any`. Satu sumber tipe: skema Drizzle (`InferSelectModel`) dan skema Zod.
- Struktur: `src/app` (rute), `src/lib` (logika bisnis: `authz`, `attendance`, `finance`, `notifications`, `reports`, `assessment`), `src/db` (skema dan migrasi), `src/components`, `messages/id.ts`.
- Logika bisnis ditulis sebagai fungsi murni yang bisa dites (kode ID, normalisasi HP, perhitungan kehadiran, evaluasi syarat sertifikat, validasi token kartu). Wajib ada tes untuk fungsi-fungsi ini.
- SQL kustom hanya untuk: exclusion constraint jadwal, CHECK hari Kamis, trigger ledger, view saldo, aktivasi RLS. Letakkan di migrasi kustom dengan komentar yang menjelaskan tujuannya.
- Pesan commit singkat dan jelas dalam bahasa Indonesia atau Inggris, konsisten dalam satu PR.
- Jangan menambah dependensi tanpa alasan. Pilih yang aktif dipelihara dan bisa jalan di runtime serverless Vercel.

## Perintah

Package manager dan test runner: **Bun** (bukan pnpm/npm). Tes memakai `bun:test`.

```bash
bun install
bun run dev                    # server pengembangan
bun run lint && bun run typecheck
bun test                       # tes unit logika bisnis
bun run db:generate            # buat migrasi dari perubahan skema Drizzle
bun run db:migrate             # jalankan migrasi (pakai DATABASE_URL_DIRECT)
bun run db:check-rls           # cek RLS, policy, dan API publik Supabase
bun run seed:divisi            # isi tiga divisi (idempoten)
bun run buat-admin --email ... # buat admin pertama; argumen lengkap di scripts/buat-admin.ts
```

Skrip di `scripts/` dijalankan Bun di luar Next.js, jadi tidak boleh mengimpor modul yang memakai `server-only`.

Environment variable dan penjelasannya ada di `docs/SERAH-TERIMA.md` bagian "Environment variable".

## Hal yang sering salah

- Koneksi aplikasi memakai **pooler** (mode transaction, `prepare: false`). Koneksi langsung hanya untuk migrasi.
- Koneksi Drizzle **melewati RLS**, jadi otorisasi sepenuhnya tanggung jawab kode server.
- Cron Vercel Hobby hanya harian. Pekerjaan yang butuh jadwal lebih rapat dipindah ke GitHub Actions.
- Kartu lama berisi **kode polos Code 128**. Kartu pengganti memakai payload bertanda tangan (lihat ARSITEKTUR bagian 9).
- Sesi `libur` tidak masuk penyebut persentase kehadiran, dan Tidak Hadir hanya dihitung untuk sesi berstatus `selesai`.

## Status proyek

Lihat `docs/ROADMAP.md`. Perbarui kotak centang di sana setiap tahap selesai.
