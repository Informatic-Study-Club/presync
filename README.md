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

## Data anggota

Jangan commit file `.env`, API key, atau data anggota nyata (nama, email, nomor HP, file impor). Template impor berisi data asli disimpan di luar repo.
