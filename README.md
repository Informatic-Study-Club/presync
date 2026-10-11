# Presync

Sistem manajemen **Informatics Study Club (ISC)**: presensi kartu anggota (Code 128/QR), kelas dan sesi, anggota, kas, kalender akademik, penilaian dan sertifikat, serta notifikasi.

Dokumen utama:

- [`CLAUDE.md`](CLAUDE.md): ringkasan proyek, aturan wajib, dan perintah.
- [`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md): keputusan teknis beserta alasannya.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): tahap pembangunan dan statusnya.
- [`docs/SERAH-TERIMA.md`](docs/SERAH-TERIMA.md): layanan, deploy dari nol, rotasi key, cadangan, jadwal perawatan.
- [`docs/PANDUAN-KOORDINATOR.md`](docs/PANDUAN-KOORDINATOR.md) dan [`docs/PANDUAN-BENDAHARA.md`](docs/PANDUAN-BENDAHARA.md): panduan singkat per peran.

## Menjalankan secara lokal

Butuh [Bun](https://bun.sh) dan Node.js 20.9 atau lebih baru.

```bash
bun install
cp .env.example .env.local   # isi nilainya, lihat docs/SERAH-TERIMA.md bagian 4
bun run dev
```

Pemeriksaan sebelum membuka pull request (juga dijalankan CI):

```bash
bun run lint
bun run typecheck
bun test
```

Migrasi database tidak berjalan otomatis saat deploy. Lihat `docs/SERAH-TERIMA.md` bagian 5.

## Uji lokal dengan Supabase lokal

Butuh Docker Desktop. Semua data tetap di laptop dan tidak menyentuh staging, karena `.env` tidak dipakai untuk koneksi.

```bash
bun run lokal:start     # Supabase lokal (pertama kali mengunduh image Docker)
bun run lokal migrate   # migrasi Drizzle + cek RLS
bun run lokal seed      # divisi + data dummy: akun uji, kelas, presensi, kas
bun run lokal dev       # aplikasi di http://localhost:3001
bun run lokal test      # tes end-to-end Playwright (sekali: bunx playwright install chromium)
bun run lokal:stop
```

- Akun uji ada di `scripts/seed-dummy.ts` (`admin@presync.test`, `bendahara@presync.test`, `koordinator.web@presync.test`, `anggota01@presync.test`, dan seterusnya).
- Email undangan dan reset password masuk ke Mailpit di http://127.0.0.1:54324.
- Tes e2e ada di `e2e/` (berkas `*.e2e.ts`, tidak ikut `bun test`) dan juga berjalan di GitHub Actions (`.github/workflows/e2e.yml`) untuk setiap pull request.
- Untuk mengulang dari awal: `bunx supabase@2.120.0 db reset`, lalu `migrate` dan `seed` lagi.

## Data anggota

Jangan commit file `.env`, API key, atau data anggota nyata (nama, email, nomor HP, file impor). Template impor berisi data asli disimpan di luar repo.
