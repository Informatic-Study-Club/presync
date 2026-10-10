# Serah terima Presync

Dokumen ini memastikan pengurus berikutnya bisa mengoperasikan Presync tanpa bertanya ke pengurus lama. **Isi semua kolom bertanda `[ISI]`** dan perbarui setiap pergantian pengurus. Jangan menulis password, API key, atau secret di dokumen ini; simpan semuanya di password manager bersama.

**Repo ini publik.** Nama, email, nomor HP, dan alamat email akun layanan tidak ditulis di sini. Simpan di password manager bersama (entri "Presync: kontak dan akun"). Untuk sementara boleh disimpan di `docs/*.local.md`, yang di-ignore git.

Terakhir diperbarui: `[ISI tanggal]` oleh `[ISI nama]`

Panduan per peran: [koordinator](PANDUAN-KOORDINATOR.md), [bendahara](PANDUAN-BENDAHARA.md).

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

Batas di bawah dicek dari halaman resmi pada **10 Oktober 2026**. Cek ulang setiap pergantian pengurus dan sebelum peluncuran.

| Layanan | Fungsi | Paket | Pemilik akun | Batas penting |
|---|---|---|---|---|
| Registrar domain `[Belum terbeli]` | Domain `informaticstudyclub.com` | Berbayar tahunan | [ISI] | Jatuh tempo: `[ISI tanggal]`, auto-renew: `[ya/tidak]` |
| Cloudflare | DNS, Turnstile, Email Routing | Gratis | email bersama isc | DNSSEC aktif |
| GitHub Organization | Repo `presync`, GitHub Actions | Gratis | email bersama isc | Workflow terjadwal di repo publik **nonaktif otomatis setelah 60 hari tanpa aktivitas**; artifact bisa diunduh siapa pun yang login |
| Vercel | Hosting aplikasi | Hobby | email bersama isc | **Hanya non-komersial/pribadi**; cron 1x sehari (presisi ±59 menit); fungsi maks. 300 detik; 1 juta invocation/bulan; log runtime 1 jam |
| Supabase (production) | Database, Auth, Storage, Realtime | Gratis | email bersama isc | Maks. 2 proyek aktif; DB 500 MB; storage 1 GB; egress 5 GB; 50.000 MAU; Realtime 200 koneksi serentak dan 2 juta pesan/bulan; **di-pause setelah 7 hari tidak aktif**; **tanpa backup otomatis** |
| Supabase (staging) | Lingkungan uji | Gratis | email bersama isc | Sama seperti di atas (memakai slot proyek kedua) |
| Resend | Email | Gratis | email bersama isc | 3.000 email/bulan, **100/hari**, 3 domain, log 30 hari, 1 webhook |
| Upstash Redis | Rate limit | Gratis | email bersama isc | 500.000 perintah/bulan, data 256 MB |
| Telegram | Bot `@presync_isc_bot` (dibuat lewat BotFather) | Gratis | pemelihara teknis utama | Token bot di password manager |
| Penyedia payment gateway (nanti) | Pembayaran | [ISI] | [ISI] | [ISI] |

Perkiraan pemakaian 170 anggota masih jauh di bawah batas, kecuali email: worker dibatasi 80/hari dan pengingat sesi bawaan tidak lewat email (lihat ARSITEKTUR bagian 12).

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

## 4. Environment variable dan secret

Nilai aplikasi disimpan di Vercel (terpisah untuk **Production** dan **Preview/staging**) dan di password manager. Contoh lengkap dengan penjelasan: `.env.example`.

| Nama | Isi | Tempat |
|---|---|---|
| `APP_URL` | URL dasar aplikasi lingkungan itu | Vercel; GitHub (repo secret, production) |
| `DATABASE_URL` | Connection string **pooler** Supabase (mode transaction, port 6543) | Vercel |
| `DATABASE_URL_DIRECT` | Connection string langsung (port 5432) | GitHub Environment `staging`/`production`; lokal untuk migrasi |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | URL dan **publishable key** proyek (`sb_publishable_...`) | Vercel; GitHub Environment (untuk `db:check-rls`) |
| `SUPABASE_SECRET_KEY` | **Secret key** (`sb_secret_...`, **sangat rahasia**, melewati RLS) | Vercel |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Anti-bot Cloudflare | Vercel |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limit (wajib di production) | Vercel |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Email lewat Resend | Vercel |
| `RESEND_WEBHOOK_SECRET` | Tanda tangan webhook Resend (`whsec_...`) | Vercel |
| `CARD_SECRET` | HMAC kartu bertanda tangan (min. 32 karakter) | Vercel |
| `CRON_SECRET` | Pengaman endpoint cron (min. 16 karakter) | Vercel; GitHub (repo secret) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | Bot Telegram | Vercel |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push | Vercel |
| `BACKUP_PASSPHRASE` | Enkripsi cadangan (acak, min. 32 karakter) | GitHub Environment `production` |

Aturan: jangan commit `.env` atau secret apa pun. Production dan staging memakai nilai berbeda untuk semuanya. **Preview Vercel tidak boleh memakai database production.**

Membuat secret acak: `openssl rand -base64 48`.

## 5. Deploy pertama dari nol

Urutan lengkap untuk satu lingkungan. Kerjakan untuk **staging dulu**, uji, baru production.

1. **Supabase**: buat proyek (region Singapura). Catat URL, connection string pooler dan langsung.
   - **Settings > API Keys**: buat publishable key dan secret key (format `sb_publishable_...` dan `sb_secret_...`). Kunci lama `anon`/`service_role` (berbentuk JWT) sudah usang dan dihentikan Supabase; Presync menolaknya. Bila proyek masih menampilkan kunci lama, nonaktifkan setelah kunci baru terpasang.
   - **Settings > JWT Keys**: pastikan token login ditandatangani **kunci asimetris (ECC P-256)**, bukan JWT secret lama. Dengan begitu `getClaims()` memverifikasi sesi secara lokal lewat JWKS tanpa memanggil server Auth di setiap request. Bila masih memakai JWT secret lama: buat kunci standby ECC, **Rotate**, tunggu minimal 1 jam 15 menit, lalu cabut kunci lama.
2. **Supabase Auth** (Authentication > Settings):
   - Matikan **Allow new users to sign up**. Aktifkan **MFA TOTP**.
   - Site URL = `APP_URL`; Redirect URL berisi `<APP_URL>/auth/confirm`.
   - SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = API key Resend **khusus SMTP** (izin kirim saja, domain `mail.`), pengirim `auth@mail.informaticstudyclub.com`.
   - Template **Invite user**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/atur-password`
   - Template **Reset password**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/atur-password`
3. **Resend**: verifikasi domain `mail.` (SPF, DKIM, DMARC `p=none` dulu; record di Cloudflare mode DNS only). Buat dua API key: aplikasi dan SMTP.
4. **Vercel**: impor repo, isi semua env bagian 4, pasang domain (`presync.` / `staging-presync.`, CNAME DNS only di Cloudflare). Region fungsi sudah `sin1` lewat `vercel.json`.
5. **Migrasi**: GitHub > Actions > **Migrasi database** > pilih lingkungan. Workflow juga menjalankan `db:check-rls`; harus semua OK.
6. **Data awal** (lokal, dengan env lingkungan itu): `bun run seed:divisi`, lalu `bun run buat-admin --email ... --nama "..." --hp 08... --divisi web-development --batch 01 --kode ISC26010xx` (kode sama dengan kartu fisik). Admin membuka undangan, membuat password, mendaftarkan 2FA.
7. **Notifikasi**:
   - Telegram: buat bot di BotFather, isi tiga env Telegram, jalankan `bun run telegram:webhook`.
   - Web push: `bunx web-push generate-vapid-keys`, isi tiga env VAPID.
   - Resend: tambah webhook `<APP_URL>/api/webhooks/resend` (event `email.bounced`, `email.complained`), isi `RESEND_WEBHOOK_SECRET`.
8. **GitHub** (khusus production):
   - Repo secret `APP_URL` dan `CRON_SECRET` untuk workflow **Pengingat**.
   - Environment `production`: `DATABASE_URL_DIRECT`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `BACKUP_PASSPHRASE`. Beri environment ini reviewer wajib.
   - Jalankan manual workflow **Cadangan database** sekali; harus hijau.
9. **Uji asap**: login + 2FA, impor beberapa anggota uji (staging), buat kelas, pindai kartu, kirim push uji, unduh satu laporan.

## 6. Deploy rutin

1. Kerjakan perubahan di branch, buka pull request. CI (lint, typecheck, tes) harus lulus.
2. Merge ke `main` menjalankan deploy production di Vercel. Preview otomatis dibuat per pull request (memakai database staging).
3. **Migrasi database tidak otomatis.** Jalankan workflow **Migrasi database** untuk `staging`, uji, lalu `production`. Atau lokal: `bun run db:migrate` lalu `bun run db:check-rls`.
4. Setelah deploy, periksa: login, halaman pemindai, dan satu kali kirim email uji.
5. Bila deploy bermasalah: rollback ke deployment sebelumnya dari dashboard Vercel. Migrasi yang sudah berjalan tidak ikut mundur, jadi tulis migrasi yang kompatibel mundur.

## 7. Rotasi key dan secret

Lakukan saat pengurus berganti, saat ada kecurigaan kebocoran, dan minimal sekali setahun.

| Secret | Cara rotasi | Dampak |
|---|---|---|
| `RESEND_API_KEY` | Buat key baru di Resend, ganti di Vercel, hapus key lama | Tidak ada bila diganti berurutan |
| API key SMTP Supabase | Buat key baru, ganti di Supabase, hapus key lama | Email auth berhenti sementara bila terlambat diganti |
| `RESEND_WEBHOOK_SECRET` | Rotasi signing secret webhook di Resend, ganti di Vercel | Bounce/spam tidak tercatat selama tidak sinkron |
| `SUPABASE_SECRET_KEY` | Buat secret key baru (Settings > API Keys), ganti di Vercel, pastikan aplikasi berjalan, lalu hapus key lama (penghapusan permanen) | Tidak ada bila diganti berurutan; sesi login tetap |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sama seperti secret key, ganti di Vercel dan GitHub Environment, lalu deploy ulang (nilai `NEXT_PUBLIC_` tertanam saat build) | Tidak ada bila diganti berurutan |
| Kunci tanda tangan JWT (Settings > JWT Keys) | Buat kunci standby, **Rotate**, tunggu minimal 1 jam 15 menit, lalu cabut kunci lama | Sesi tetap; token lama berlaku sampai kedaluwarsa. Cabut seketika hanya bila bocor (semua orang harus login ulang) |
| `CRON_SECRET` | Ganti di Vercel dan secret repository GitHub | Cron gagal bila tidak sinkron |
| `CARD_SECRET` | **Jangan diganti sembarangan**: semua kartu QR dan "Kartu Saya" tidak berlaku. Hanya bila bocor, lalu terbitkan ulang kartu | Kartu bertanda tangan harus dicetak ulang |
| Token Telegram, `TELEGRAM_WEBHOOK_SECRET` | Cabut token lewat BotFather, buat baru, ganti di Vercel, jalankan `bun run telegram:webhook` | Tautan akun tetap |
| Kunci VAPID | Buat pasangan baru, ganti di Vercel | Semua anggota harus mengaktifkan ulang notifikasi perangkat |
| `BACKUP_PASSPHRASE` | Ganti di GitHub Environment; simpan passphrase lama selama cadangan lama masih disimpan | Cadangan lama tetap memakai passphrase lama |
| Password dan 2FA akun layanan | Ganti password, daftarkan ulang 2FA, perbarui kode pemulihan | |

## 8. Jadwal perawatan

| Kapan | Tugas |
|---|---|
| Setiap hari (otomatis) | Cron Vercel 08:00 WIB: ping database, pengingat H-1, kirim antrean. GitHub Actions tiap 15 menit: pengingat 1 jam sebelum |
| Setiap Senin (otomatis) | Digest tunggakan; workflow **Cadangan database** + uji pemulihan |
| Setiap minggu | Dashboard Resend (bounce, spam, kuota), antrean notifikasi `failed`, hasil workflow cadangan |
| Setiap bulan | Tab Actions: pastikan workflow **Pengingat** dan **Cadangan database** masih aktif; unduh satu cadangan ke penyimpanan organisasi; log error Vercel; pemakaian Supabase dan Upstash |
| Setiap semester | Tahun ajaran, semester, kalender, kelas baru; impor anggota baru; uji pemulihan ke staging (bagian 10) |
| Setiap tahun | Rotasi key, jatuh tempo domain, cek ulang syarat layanan dan batas free tier (bagian 2), perbarui dokumen ini |
| Setiap pergantian pengurus | Bagian 9 |

## 9. Pergantian pengurus

**Menerima jabatan:**
- [ ] Pastikan punya akses ke password manager bersama dan email organisasi
- [ ] Daftarkan 2FA pribadi di akun layanan (jangan memakai satu perangkat 2FA bersama)
- [ ] Tambahkan diri sebagai anggota GitHub Organization
- [ ] Jalankan aplikasi secara lokal (`bun install`, salin `.env.example`, `bun run dev`) dan lakukan satu deploy ke staging
- [ ] Baca `CLAUDE.md`, `docs/ARSITEKTUR.md`, `docs/ROADMAP.md`, dan panduan per peran
- [ ] Ubah role di Presync (admin, koordinator, bendahara) sesuai jabatan baru

**Menyerahkan jabatan:**
- [ ] Cabut akses pribadi di GitHub, Vercel, Supabase, dan layanan lain
- [ ] Ubah role di Presync menjadi anggota/alumni
- [ ] Rotasi key yang pernah dipegang secara pribadi
- [ ] Perbarui bagian 1 dan 2 dokumen ini

**Pelatihan pemelihara teknis cadangan** (dianggap selesai bila semua dilakukan sendiri oleh calon pemelihara, hanya berbekal dokumen ini):
- [ ] Menjalankan aplikasi lokal dan seluruh pemeriksaan (`bun run lint`, `bun run typecheck`, `bun test`)
- [ ] Menjalankan workflow **Migrasi database** ke staging dan membaca hasil `db:check-rls`
- [ ] Deploy perubahan kecil lewat pull request ke staging, lalu rollback dari dashboard Vercel
- [ ] Merotasi satu secret (misalnya `CRON_SECRET`) di Vercel dan GitHub tanpa memutus cron
- [ ] Memulihkan satu cadangan ke Postgres lokal atau staging (bagian 10)
- [ ] Menangani satu gejala dari tabel bagian 11 (misalnya proyek Supabase di-pause)

## 10. Cadangan dan pemulihan

Paket gratis Supabase **tidak punya backup otomatis**, jadi Presync mencadangkan sendiri:

- Workflow **Cadangan database** (`.github/workflows/backup.yml`) tiap Senin 02:00 WIB dan bisa dijalankan manual.
- Isi cadangan: `pg_dump` skema `public` dan `drizzle` (semua data aplikasi dan riwayat migrasi), plus daftar akun `auth.users` **tanpa password**.
- Arsip dienkripsi GPG AES-256 dengan `BACKUP_PASSPHRASE`, lalu **langsung diuji**: didekripsi, dipulihkan ke Postgres 17 sementara, dan diperiksa (`scripts/backup/verify-restore.sql`: tabel inti, RLS, trigger ledger, constraint kustom, saldo view = ledger). Workflow merah berarti cadangan tidak sah.
- Artifact terenkripsi disimpan 35 hari. Karena repo publik, artifact bisa diunduh siapa pun yang login ke GitHub; keamanannya bergantung pada passphrase. **Tiap bulan unduh satu salinan ke penyimpanan milik organisasi.**
- Bukti transfer di bucket `bukti-pembayaran` **tidak ikut** cadangan ini. Unduh berkala dari dashboard Supabase (Storage) bila diperlukan untuk audit.

**Memulihkan** (ke staging atau proyek baru):
1. Unduh artifact, lalu `gpg --decrypt presync-YYYY-MM-DD.tar.gz.gpg | tar -xzf -` (masukkan passphrase). Hasilnya `presync.dump` dan `auth_users.csv`.
2. Siapkan proyek Supabase **kosong** (jangan jalankan migrasi; dump sudah berisi skema lengkap). Pasang extension `btree_gist` di skema `extensions` (Database > Extensions).
3. **Akun login dulu**: buat ulang akun Auth untuk setiap baris `auth_users.csv` dengan **id yang sama** (Supabase Admin API `auth.admin.createUser` dengan `id` dan `email_confirm: true`). Foreign key `members.id -> auth.users.id` membutuhkan akun ini ada sebelum data dipulihkan.
4. Pulihkan data dengan koneksi langsung, menyaring entri skema `public` seperti di workflow:
   `pg_restore --list presync.dump | grep -Ev ' (SCHEMA|COMMENT) - (SCHEMA )?public ' > list.txt`
   `pg_restore --no-owner --no-privileges --exit-on-error --use-list=list.txt --dbname="$DATABASE_URL_DIRECT" presync.dump`
5. Jalankan `bun run db:check-rls` dan uji asap (bagian 5 langkah 9). Minta anggota memakai "Lupa password" untuk membuat password baru (password tidak ikut dicadangkan).

Uji pemulihan ke staging minimal sekali per semester. Lokasi salinan bulanan: `[ISI]`. Penanggung jawab: `[ISI]`.

## 11. Bila terjadi masalah

| Gejala | Periksa |
|---|---|
| Aplikasi tidak bisa dibuka | Status Vercel; Supabase mungkin di-pause (buka dashboard, aktifkan kembali); DNS di Cloudflare |
| Pengingat tidak terkirim | Tab Actions: workflow **Pengingat** masih aktif? Secret `APP_URL`/`CRON_SECRET` sinkron? Anggota sudah menautkan Telegram/push? |
| Email tidak terkirim | Kuota harian Resend, status domain `mail.` (SPF/DKIM), API key, antrean `failed`, daftar `email_suppressions` |
| Email tidak masuk | Folder spam, DMARC/SPF/DKIM, bounce di Resend |
| Scan tidak tercatat | Jendela waktu sesi, koordinator berhak, anggota terdaftar di kelas, kartu aktif, rate limit |
| Login gagal massal | Turnstile, rate limit, status Supabase Auth, kunci JWT yang baru dicabut, publishable key yang dinonaktifkan |
| Workflow cadangan merah | Baca langkah yang gagal; `BACKUP_PASSPHRASE` minimal 32 karakter; versi `pg_dump` harus sama/lebih baru dari server |
| Domain mati | Jatuh tempo domain di registrar |
| Dugaan kebocoran data | Rotasi semua key, cabut sesi, periksa `audit_log`, informasikan anggota terdampak |

## 12. Data dan privasi

- Data yang disimpan: nama, email, nomor HP, divisi, batch, kode ID, kehadiran, nilai, dan data kas.
- Nomor HP hanya terlihat oleh admin, koordinator divisi terkait, dan bendahara (bendahara: hanya anggota yang menunggak).
- Permintaan koreksi/penghapusan data masuk lewat menu **Privasi** dan diproses admin di **Permintaan Data** oleh `[ISI]` dalam `[ISI]` hari; tercatat di audit log.
- Anggota yang keluar diubah menjadi nonaktif atau alumni; data keuangan tetap disimpan untuk audit, data kontak dapat dianonimkan atas permintaan.
