# Roadmap Presync

Perbarui kotak centang setiap pekerjaan selesai. Detail teknis tiap tahap ada di `ARSITEKTUR.md`.

Prinsip: selesaikan satu tahap sampai bisa dipakai sebelum pindah ke tahap berikutnya. Setiap tahap punya "Selesai bila" sebagai kriteria penutup.

## Prasyarat (sebelum menulis kode)

- [ ] Email organisasi bersama dibuat (untuk semua akun layanan) dan disimpan di password manager bersama
- [ ] GitHub Organization dibuat, repo `presync` dibuat di sana
- [ ] Akun Vercel, Supabase (production dan staging), Resend, Upstash, Cloudflare dibuat dengan email organisasi, 2FA aktif
- [ ] Domain `informaticstudyclub.com` terdaftar atas nama organisasi, auto-renew aktif, DNS dipindah ke Cloudflare
- [ ] **Kode `ISC25` dicocokkan dengan kartu fisik** (34 anggota), file impor dikoreksi bila perlu
- [ ] **Email dan nomor HP 85 anggota dikumpulkan** (formulir), lalu diisi ke template impor
- [ ] Keputusan: dua anggota tanpa kode mendapat `ISC2601085` dan `ISC2601086`
- [ ] Verifikasi pertemuan ML-1, UI/UX-7, ML-7 (benar-benar berlangsung atau belum)

## Tahap 1: Fondasi

- [x] Proyek Next.js + TypeScript strict, Tailwind, shadcn/ui, lint, tes (Bun sebagai package manager dan test runner)
- [ ] Drizzle terhubung ke Supabase lewat pooler, migrasi berjalan di staging — *kode siap (`src/db`, migrasi `0000_fondasi`); menunggu proyek Supabase staging*
- [ ] Auth email + password, pendaftaran publik dimatikan, reset password, Turnstile — *kode siap (`/masuk`, `/lupa-password`, `/atur-password`, `/auth/confirm`); menunggu pengaturan Supabase Auth dan kunci Turnstile asli (lihat SERAH-TERIMA bagian 4)*
- [ ] SMTP Supabase Auth lewat Resend, domain `mail.` terverifikasi (SPF, DKIM, DMARC)
- [x] Tabel `members`, `member_roles`, `divisions`, `division_coordinators`, `audit_log` (skema dan migrasi; belum dijalankan di database)
- [x] `can()` dengan tes unit untuk semua kombinasi role dan aksi
- [ ] RLS aktif tanpa policy di semua tabel — *aktif di skema dan migrasi, dijaga tes `rls.test.ts`; verifikasi di database dengan `bun run db:check-rls`*
- [ ] 2FA (TOTP) untuk admin, bendahara, koordinator — *kode siap (`/2fa`, `requireSession`); perlu uji dengan Supabase sungguhan*
- [ ] Domain `presync.` dan `staging-presync.` terhubung ke Vercel
- [ ] Pipeline GitHub Actions: lint, typecheck, tes — *workflow `ci.yml` dan `migrate.yml` siap; aktif setelah repo didorong ke GitHub Organization*
- [ ] Rate limit Upstash di login — *kode siap (login, lupa password, 2FA); menunggu akun Upstash*

**Selesai bila:** admin bisa login dengan 2FA di production dan staging, dan akses langsung ke API publik Supabase ditolak.

## Tahap 2: Anggota, impor, kartu

- [x] Daftar dan profil anggota (nomor HP hanya terlihat peran berwenang), termasuk pengaturan peran dan divisi koordinator
- [x] Tabel `member_code_counters`, pembuatan kode ID dalam transaksi, tes untuk fungsi kode
- [x] Impor CSV/XLSX: template, pratinjau error per baris, normalisasi nama dan HP, impor atomik
- [ ] Impor 85 anggota awal ke staging, lalu production — *menunggu email dan No. HP terkumpul serta proyek Supabase*
- [ ] Undangan aktivasi lewat outbox, dikirim bertahap (30-50 per hari) — *kode siap (40/hari, cron harian `/api/cron/harian`); menunggu Resend dan uji kirim sungguhan*
- [x] "Kartu Saya" dan cetak kartu PDF (satuan dan massal) dengan barcode `bwip-js`
- [x] Penerbitan ulang kartu (`card_version`, `legacy_card_allowed`) dan blokir kartu, dengan audit log
- [x] Halaman kebijakan data dan jalur permintaan penghapusan (`/kebijakan-data`, `/privasi`, `/admin/permintaan-data`) — *teks kebijakan perlu ditinjau pengurus*

**Selesai bila:** seluruh anggota punya akun aktif dan kartu, dan kode ID di sistem sama dengan kartu fisik.

## Tahap 3: Kalender, kelas, sesi

- [x] Tahun ajaran, semester, event kalender, feed `.ics` (tautan langganan pribadi per anggota)
- [x] Kelas per divisi dengan `planned_sessions`
- [x] Pendaftaran anggota ke kelas (`enrollments`)
- [x] Sesi rutin Kamis dengan `rrule`, melewati tanggal libur dan dibatasi akhir semester
- [x] Kelas tambahan dan kegiatan lain (offline, online, hybrid)
- [x] CHECK hari Kamis dan exclusion constraint jadwal (migrasi kustom `0003`, diuji di Postgres/PGlite)
- [x] Status sesi: dijadwalkan, selesai, libur

**Selesai bila:** koordinator bisa membuat satu program tujuh pertemuan dan kalender anggota terisi dengan benar. *(Kode siap; perlu diuji ulang di staging setelah database tersedia.)*

## Tahap 4: Presensi

- [x] Halaman pemindai (kamera, pemindai USB/Bluetooth, input manual) untuk Code 128 dan QR
- [x] Endpoint scan dalam satu transaksi dengan semua pemeriksaan
- [x] Layar hasil scan (nama, divisi, batch, status) dan pesan untuk duplikat/ditolak
- [x] Check-in online dengan kode sesi
- [x] Absen manual dengan catatan dan audit log
- [x] Dashboard kehadiran realtime (Broadcast) — *perlu diuji dengan Supabase sungguhan*
- [x] Rate limit scan dan deteksi kejanggalan
- [x] Impor arsip ringkasan kehadiran dari Google Sheets (format ringkasan atau kolom p1..pN)
- [ ] Uji lapangan dengan kartu asli, di berbagai pencahayaan

**Selesai bila:** satu sesi offline dengan 30+ anggota berjalan lancar di lokasi sungguhan.

## Tahap 5: Kas

- [x] Kategori, jadwal iuran, tagihan
- [x] Unggah bukti transfer ke bucket privat (lewat server, signed URL 60 detik)
- [x] Verifikasi bendahara dalam transaksi, ledger hanya-tambah dengan trigger penolak UPDATE/DELETE (dan TRUNCATE)
- [x] Transaksi koreksi (`reversal_of`)
- [x] View saldo dan tunggakan (`security_invoker`, tanpa akses anon) dan tutup buku per bulan
- [x] Antarmuka `PaymentProvider` (belum ada implementasi provider)

**Selesai bila:** bendahara bisa menutup satu bulan kas dan angka saldo cocok dengan buku manual. *(Kode siap; perlu dicocokkan dengan buku manual di staging.)*

## Tahap 6: Notifikasi

- [ ] `notification_outbox`, worker batch, batas 80/hari untuk email
- [ ] Adapter email (Resend), idempotency key, webhook bounce/spam
- [ ] Adapter Telegram, penautan akun lewat tautan sekali pakai
- [ ] Web push (PWA, VAPID)
- [ ] Preferensi kanal per kategori
- [ ] Pengingat H-1 (Vercel Cron) dan "1 jam sebelum" (GitHub Actions)
- [ ] Digest tunggakan mingguan

**Selesai bila:** pengingat sesi sampai ke minimal dua kanal tanpa melampaui kuota harian.

## Tahap 7: Rekap dan laporan

- [ ] Rekap kehadiran (per anggota, kelas, divisi, periode, dengan persentase)
- [ ] Laporan kas dan tunggakan
- [ ] Daftar anggota per divisi atau batch
- [ ] Ekspor PDF (`@react-pdf/renderer`), xlsx, csv
- [ ] Batas rentang data per laporan

**Selesai bila:** laporan kehadiran satu program dan laporan kas satu bulan bisa diunduh dalam tiga format.

## Tahap 8: Penilaian dan sertifikat

- [ ] Komponen nilai dan bobot per kelas
- [ ] Input nilai oleh koordinator
- [ ] Aturan sertifikat per kelas (JSON tervalidasi Zod)
- [ ] `evaluateCertificate` dengan tes unit, termasuk kasus Web Dev (izin maksimal 3, skor minimal 70)
- [ ] Penimpaan status dengan catatan dan audit log
- [ ] Ekspor daftar penerima (PDF/xlsx)

**Selesai bila:** hasil evaluasi program Web Dev sekarang (17 dari 36 lolos) sama dengan hasil di Google Sheets.

## Tahap 9: Penutupan dan serah terima

- [ ] `SERAH-TERIMA.md` terisi lengkap (pemilik akun, jatuh tempo, kontak)
- [ ] Ekspor `pg_dump` berkala dan uji pemulihan
- [ ] Panduan singkat untuk koordinator dan bendahara
- [ ] Cek ulang batas free tier dan syarat layanan (Vercel Hobby, Resend, Supabase)
- [ ] Pelatihan satu pemelihara teknis cadangan

**Selesai bila:** pemelihara teknis lain bisa melakukan deploy dan rotasi key hanya dengan membaca dokumen.

## Setelah peluncuran

- [ ] Payment gateway: pilih provider (cek KYC/KYB), putuskan penanggung biaya, implementasi adapter, webhook, rekonsiliasi
- [ ] Cek ulang syarat Vercel Hobby saat gateway aktif (non-komersial)
- [ ] Kartu pengganti bertanda tangan (QR) secara bertahap
- [ ] Antrean scan offline (PWA) bila sinyal lokasi buruk
- [ ] PDF sertifikat otomatis
- [ ] WhatsApp resmi (Meta) bila anggaran tersedia
- [ ] Foto anggota di layar scan dan geofencing (opsional)
