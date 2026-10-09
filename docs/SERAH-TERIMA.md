# Serah terima Presync

Dokumen ini memastikan pengurus berikutnya bisa mengoperasikan Presync tanpa bertanya ke pengurus lama. **Isi semua kolom bertanda `[ISI]`** dan perbarui setiap pergantian pengurus. Jangan menulis password, API key, atau secret di dokumen ini; simpan semuanya di password manager bersama.

**Repo ini publik.** Nama, email, nomor HP, dan alamat email akun layanan tidak ditulis di sini. Simpan di password manager bersama (entri "Presync: kontak dan akun"). Untuk sementara boleh disimpan di `docs/*.local.md`, yang di-ignore git.

Terakhir diperbarui: `[ISI tanggal]` oleh `[ISI nama]`

## 1. Kontak dan peran

| Peran | Nama | Kontak | Periode |
|---|---|---|---|
| Pemelihara teknis utama | lihat password manager | lihat password manager | 2026/2027 |
| Pemelihara teknis cadangan | belum ada | belum ada | belum ada |
| Admin organisasi | lihat password manager | lihat password manager | 2026/2027 |
| Bendahara | lihat password manager | lihat password manager | 2026/2027 |
| Penghubung unit TI fakultas (bila ada) | - | - | - |

## 2. Daftar layanan dan akun

Semua akun didaftarkan dengan **email organisasi bersama** (alamatnya di password manager, tidak ditulis di repo publik). Kredensial ada di `[belum ada]`. 2FA wajib aktif di semua akun; pemegang cadangan kode pemulihan: `[ISI]`.

| Layanan | Fungsi | Paket | Pemilik akun | Jatuh tempo/batas penting |
|---|---|---|---|---|
| Registrar domain `[Belum terbeli]` | Domain `informaticstudyclub.com` | Berbayar tahunan | [ISI] | Jatuh tempo: `[ISI tanggal]`, auto-renew: `[ya/tidak]` |
| Cloudflare | DNS, Turnstile, Email Routing | Gratis | email bersama isc | DNSSEC aktif |
| GitHub Organization | Repo `presync`, GitHub Actions | Gratis | email bersama isc | Workflow terjadwal bisa dinonaktifkan jika repo lama tidak aktif |
| Vercel | Hosting aplikasi | Hobby | email bersama isc | Hanya non-komersial; cek ulang saat payment gateway aktif |
| Supabase (production) | Database, Auth, Storage, Realtime | Gratis | email bersama isc | Proyek di-pause bila tidak aktif; ping harian dari cron |
| Supabase (staging) | Lingkungan uji | Gratis | email bersama isc | Sama seperti di atas |
| Resend | Email | Gratis | email bersama isc | 3.000 email/bulan, 100/hari, 1 domain |
| Upstash Redis | Rate limit | Gratis | email bersama isc | Cek kuota perintah harian |
| Telegram | Bot `@presync_isc_bot` (dibuat lewat BotFather) | Gratis | pemelihara teknis utama | Token bot disimpan di password manager |
| Penyedia payment gateway (nanti) | Pembayaran | [ISI] | [ISI] | [ISI] |

Batas free tier dan syarat layanan bisa berubah. Cek halaman harga masing-masing setiap pergantian pengurus dan sebelum peluncuran.

## 3. Alamat penting

| Keperluan | Alamat |
|---|---|
| Aplikasi production | `https://presync.informaticstudyclub.com` |
| Aplikasi staging | `https://staging-presync.informaticstudyclub.com` |
| Domain pengirim email | `mail.informaticstudyclub.com` (`auth@`, `notifikasi@`) |
| Repo | `https://github.com/Informatic-Study-Club/presync` |
| Dashboard Vercel | `[ISI URL proyek]` |
| Dashboard Supabase production | `[ISI URL proyek]` |
| Dashboard Supabase staging | `[ISI URL proyek]` |

## 4. Environment variable

Nilai disimpan di Vercel (terpisah untuk Production dan Preview) dan di password manager. Nama di bawah adalah target dan boleh disesuaikan saat scaffolding.

| Nama | Isi | Dipakai di |
|---|---|---|
| `DATABASE_URL` | Connection string **pooler** Supabase (mode transaction) | Aplikasi |
| `DATABASE_URL_DIRECT` | Connection string langsung | Hanya migrasi |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase | Klien dan server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key | Klien dan server |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (**sangat rahasia**, hanya server) | Server |
| `RESEND_API_KEY` | API key Resend untuk aplikasi | Server |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | Alamat pengirim dan balasan | Server |
| `CARD_SECRET` | Secret HMAC untuk kartu bertanda tangan | Server |
| `CRON_SECRET` | Secret untuk endpoint cron | Server dan jadwal cron |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limit | Server |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Anti-bot | Klien dan server |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Bot Telegram | Server |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push | Klien dan server |
| `APP_URL` | URL dasar aplikasi per lingkungan | Server |

Aturan: jangan commit `.env` atau secret apa pun. Production dan staging memakai nilai berbeda untuk semuanya. Preview Vercel tidak boleh memakai database production.

Konfigurasi SMTP Supabase Auth (di dashboard Supabase, bagian Authentication):
- Host `smtp.resend.com`, port `465`, username `resend`.
- Password: API key Resend **khusus SMTP** (izin kirim saja, dibatasi ke domain `mail.`).
- Pengirim `auth@mail.informaticstudyclub.com`.

Pengaturan Supabase Auth lain (per proyek, production dan staging):
- Matikan **Allow new users to sign up** (tanpa pendaftaran publik). Undangan admin tetap berfungsi.
- Aktifkan MFA TOTP.
- Site URL = `APP_URL` lingkungan tersebut; Redirect URL berisi `<APP_URL>/auth/confirm`.
- Template email **Invite user** dan **Reset password** mengarah ke rute konfirmasi server:
  - Invite: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/atur-password`
  - Reset: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/atur-password`

Admin pertama dibuat dengan skrip, karena tidak ada pendaftaran publik:
1. `bun run db:migrate`, lalu `bun run seed:divisi`.
2. `bun run buat-admin --email ... --nama "..." --hp 08... --divisi web-development --batch 01 --kode ISC26010xx` (kode harus sama dengan kartu fisik).
3. Admin membuka email undangan, membuat password, lalu mendaftarkan 2FA saat login pertama.

## 5. Cara deploy

1. Kerjakan perubahan di branch, buka pull request. CI (lint, typecheck, tes) harus lulus.
2. Merge ke `main` menjalankan deploy production di Vercel. Preview otomatis dibuat per pull request.
3. **Migrasi database tidak otomatis.** Jalankan terpisah:
   - Lewat GitHub Actions: workflow **Migrasi database** (`.github/workflows/migrate.yml`), pilih `staging` dulu. Workflow ini juga menjalankan `db:check-rls`.
   - Atau lokal: `bun run db:migrate` lalu `bun run db:check-rls` dengan `DATABASE_URL_DIRECT` staging.
   - Uji di staging, lalu jalankan di production.
4. Setelah deploy, periksa: login, halaman pemindai, dan satu kali kirim email uji.
5. Bila deploy bermasalah: rollback ke deployment sebelumnya dari dashboard Vercel. Migrasi yang sudah berjalan tidak ikut mundur, jadi tulis migrasi yang kompatibel mundur.

## 5a. Tutup buku bulanan (bendahara)

1. Pastikan semua bukti transfer bulan itu sudah diverifikasi atau ditolak (Kas > Verifikasi).
2. Buka Kas > Buku kas, pilih bulan, lalu cocokkan saldo akhir dengan buku manual/rekening.
3. Selisih dikoreksi dengan transaksi koreksi atau transaksi baru, bukan dengan mengubah data.
4. Tekan "Tutup bulan". Bulan harus ditutup berurutan; setelah ditutup, transaksi baru tidak bisa bertanggal di bulan itu.

## 6. Rotasi key dan secret

Lakukan saat pengurus berganti, saat ada kecurigaan kebocoran, dan minimal sekali setahun.

| Secret | Cara rotasi | Dampak |
|---|---|---|
| `RESEND_API_KEY` | Buat key baru di Resend, ganti di Vercel, hapus key lama | Tidak ada bila diganti berurutan |
| API key SMTP Supabase | Buat key baru, ganti di Supabase, hapus key lama | Email auth berhenti sementara bila terlambat diganti |
| `SUPABASE_SERVICE_ROLE_KEY`, anon key | Reset JWT secret di Supabase, ganti di Vercel | **Semua sesi login dicabut**, jadwalkan di luar jam pakai |
| `CRON_SECRET` | Ganti di Vercel dan di konfigurasi jadwal (GitHub Actions) | Cron gagal bila tidak sinkron |
| `CARD_SECRET` | **Jangan diganti sembarangan**: mengganti membuat semua kartu bertanda tangan tidak valid. Hanya bila bocor, lalu terbitkan ulang kartu | Kartu bertanda tangan harus dicetak ulang |
| Token Telegram | Cabut lewat BotFather lalu buat baru, ganti di Vercel | Tautan akun tetap, webhook perlu dipasang ulang |
| Password dan 2FA akun layanan | Ganti password, daftarkan ulang 2FA, perbarui kode pemulihan | |

## 7. Jadwal perawatan

| Kapan | Tugas |
|---|---|
| Setiap hari (otomatis) | Cron harian: pengingat, outbox, rekap tunggakan, ping database |
| Setiap minggu | Periksa dashboard Resend (bounce, spam), kuota email, dan antrean `failed` |
| Setiap bulan | Periksa log error di Vercel, penggunaan Supabase dan Upstash, uji unduh cadangan |
| Setiap semester | Buat tahun ajaran, semester, kalender, dan kelas baru; impor anggota baru; arsipkan kelas lama |
| Setiap tahun | Rotasi key, cek jatuh tempo domain (perpanjang multi-tahun), cek ulang syarat layanan dan batas free tier, perbarui dokumen ini |
| Setiap pergantian pengurus | Lihat bagian 8 |

## 8. Pergantian pengurus

**Menerima jabatan:**
- [ ] Pastikan punya akses ke password manager bersama dan email organisasi
- [ ] Daftarkan 2FA pribadi di akun layanan (jangan memakai satu perangkat 2FA bersama)
- [ ] Tambahkan diri sebagai anggota GitHub Organization
- [ ] Jalankan aplikasi secara lokal dan lakukan satu deploy ke staging
- [ ] Baca `CLAUDE.md`, `ARSITEKTUR.md`, dan `ROADMAP.md`
- [ ] Ubah role di Presync (admin, koordinator, bendahara) sesuai jabatan baru

**Menyerahkan jabatan:**
- [ ] Cabut akses pribadi di GitHub, Vercel, Supabase, dan layanan lain
- [ ] Ubah role di Presync menjadi anggota/alumni
- [ ] Rotasi key yang pernah dipegang secara pribadi
- [ ] Perbarui bagian 1 dan 2 dokumen ini

## 9. Cadangan dan pemulihan

- Jangan mengandalkan cadangan otomatis di paket gratis Supabase; periksa apa yang tersedia di dashboard.
- Jadwalkan ekspor `pg_dump` berkala (misalnya mingguan) lewat GitHub Actions ke penyimpanan terenkripsi milik organisasi.
- Simpan juga cadangan bucket bukti pembayaran.
- Uji pemulihan ke proyek staging minimal sekali per semester.
- Lokasi cadangan: `[ISI]`. Penanggung jawab: `[ISI]`.

## 10. Bila terjadi masalah

| Gejala | Periksa |
|---|---|
| Aplikasi tidak bisa dibuka | Status Vercel, status Supabase (mungkin proyek di-pause: buka dashboard dan aktifkan kembali), DNS di Cloudflare |
| Email tidak terkirim | Kuota harian Resend, status domain `mail.` (SPF/DKIM), API key, antrean `failed` |
| Email tidak masuk | Folder spam, DMARC/SPF/DKIM, bounce di Resend |
| Scan tidak tercatat | Sesi berstatus berjalan, koordinator berhak, anggota terdaftar di kelas, kartu aktif, rate limit |
| Login gagal massal | Turnstile, rate limit, status Supabase Auth, kunci JWT yang baru dirotasi |
| Domain mati | Jatuh tempo domain di registrar |
| Dugaan kebocoran data | Rotasi semua key, cabut sesi, periksa `audit_log`, informasikan anggota terdampak |

## 11. Data dan privasi

- Data yang disimpan: nama, email, nomor HP, divisi, batch, kode ID, kehadiran, nilai, dan data kas.
- Nomor HP hanya terlihat oleh admin, koordinator divisi terkait, dan bendahara.
- Permintaan penghapusan data diproses oleh `[ISI]` dalam `[ISI]` hari; catat di audit log.
- Anggota yang keluar diubah menjadi nonaktif atau alumni; data keuangan tetap disimpan untuk audit, data kontak dapat dianonimkan atas permintaan.
