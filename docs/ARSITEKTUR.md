# Arsitektur Presync

Dokumen ini menjelaskan keputusan teknis Presync beserta alasannya, supaya pengurus berikutnya bisa melanjutkan tanpa menebak. Perbarui dokumen ini setiap keputusan penting berubah.

## 1. Konteks dan tujuan

Informatics Study Club (ISC) adalah organisasi non-komersial di lingkup fakultas dengan tiga divisi: Web Development, Machine Learning, dan UI/UX. Saat ini ada 85 anggota (batch 01), dengan kapasitas desain ±170. Pengelolaan awal memakai Google Sheets per divisi: presensi tujuh pertemuan, nilai tugas, dan penanda kelayakan sertifikat.

Tujuan Presync:
- Presensi cepat lewat pemindaian kartu anggota (barcode Code 128) dan check-in online.
- Manajemen anggota, kelas, sesi, dan kalender akademik.
- Pencatatan kas yang bisa diaudit, dengan jalur ke payment gateway.
- Penilaian dan kelayakan sertifikat yang konsisten antar divisi.
- Rekap dan laporan dalam PDF, xlsx, dan csv.
- Notifikasi lewat email, Telegram, dan web push.
- Gratis dan mudah diwariskan antar generasi pengurus.

Prioritas desain: **sederhana, aman, murah, bisa diwariskan.** Tim kurang kuat di SQL, jadi logika bisnis ditulis di TypeScript dan SQL kustom dibatasi.

## 2. Ringkasan keputusan

| # | Keputusan | Alasan | Konsekuensi |
|---|---|---|---|
| 1 | Next.js + TypeScript satu codebase | UI dan API satu tempat, ekosistem besar | Semua logika di server Next.js |
| 2 | Supabase sebagai Postgres, Auth, Storage, Realtime | Free tier cukup, Postgres standar sehingga portabel | Risiko pause saat tidak aktif (lihat bagian 17) |
| 3 | Drizzle ORM, bukan supabase-js + RPC | Tim kurang kuat SQL, logika atomik lebih mudah di TypeScript | Koneksi melewati RLS, otorisasi di kode server |
| 4 | RLS aktif tanpa policy | Menutup API publik bila anon key bocor | Semua akses lewat server |
| 5 | Otorisasi terpusat `can()` | Cegah pengecekan role tersebar | Satu tempat untuk diaudit dan dites |
| 6 | Ledger kas hanya-tambah | Laporan bisa dipercaya dan diaudit | Koreksi lewat `reversal_of` |
| 7 | Outbox notifikasi + adapter | Kuota email 100/hari, kanal bisa diganti | Pengiriman tertunda sampai worker jalan |
| 8 | Vercel Hobby | Deploy mulus untuk Next.js, gratis untuk non-komersial | Akun personal, cron harian saja |
| 9 | Kode ID dipakai apa adanya dari kartu | Kartu fisik sudah beredar | Kode tidak bisa diubah setelah terbit |
| 10 | Counter kode ID per batch | Nomor urut berjalan lintas divisi di data awal | Format tahun tidak dipakai sebagai kunci counter |
| 11 | Barcode dibuat lokal (`bwip-js`) | Hindari mengirim kode ID ke situs pihak ketiga | Tidak bergantung pada tec-it |
| 12 | Penilaian dan sertifikat dengan aturan yang bisa dikonfigurasi | Aturan berbeda per divisi dan sebagian manual | Modul tambahan (tahap 8) |

## 3. Stack

| Lapisan | Pilihan | Catatan |
|---|---|---|
| Framework | Next.js (App Router), TypeScript strict | PWA untuk push dan pemasangan di layar utama |
| UI | Tailwind CSS, shadcn/ui | Dark mode default, satu warna aksen |
| Validasi | Zod | Semua input server |
| ORM | Drizzle ORM, drizzle-kit | Satu-satunya sumber skema dan migrasi |
| Database | Supabase Postgres, Singapura | Lewat pooler mode transaction, `prepare: false` |
| Auth | Supabase Auth (email + password), `@supabase/ssr` | Sesi cookie, pendaftaran publik dimatikan |
| File | Supabase Storage | Bucket privat, akses lewat signed URL |
| Realtime | Supabase Realtime Broadcast | Server mengirim event setelah presensi tersimpan |
| Email | Resend | API untuk notifikasi, SMTP untuk Supabase Auth |
| Kanal kedua | Telegram bot, web push (VAPID) | |
| Anti-bot | Cloudflare Turnstile | Login dan lupa password |
| Rate limit | Upstash Redis | Login, scan, endpoint sensitif |
| Hosting | Vercel Hobby | Cadangan: Cloudflare Pages |
| Laporan | `@react-pdf/renderer`, ExcelJS, PapaParse | Hindari browser headless di Vercel Hobby |
| Kalender | FullCalendar, `rrule`, `ics` | |
| Barcode | `bwip-js`, `@yudiel/react-qr-scanner` | Pemindai mendukung Code 128 dan QR |
| Template email | React Email | |
| CI | GitHub Actions | Tes, lint, migrasi terkontrol, cron rapat |
| Package manager, tes | Bun (`bun install`, `bun test`) | Next.js tetap berjalan di runtime Node.js Vercel |

Catatan Next.js 16: `cacheComponents` sengaja tidak diaktifkan. Hampir semua halaman membaca sesi login sehingga prerender tidak banyak membantu, sementara aturan `<Suspense>`-nya menambah kerumitan. Middleware di Next.js 16 bernama `proxy` (`src/proxy.ts`), dan hanya dipakai untuk menyegarkan sesi serta pengalihan awal ke `/masuk`; otorisasi tetap di server.

## 4. Divisi, peran, dan otorisasi

Divisi disimpan di tabel `divisions` (Web Development, Machine Learning, UI/UX), sehingga menambah divisi tidak mengubah kode. Satu anggota berada di satu divisi, satu kelas milik satu divisi.

| Role | Kewenangan |
|---|---|
| `admin` | Semua data, role, kalender, impor, kartu, audit log |
| `koordinator` | Untuk divisinya: kelas, sesi, kegiatan, penilaian; memindai kartu; mengubah status izin/sakit dengan catatan; melihat rekap dan kontak. Tanpa akses kas |
| `bendahara` | Modul kas, verifikasi pembayaran, laporan keuangan, kontak anggota yang menunggak |
| `anggota` | Profil, kartu, presensi, nilai dan status sertifikat sendiri, tagihan, kalender |

Role bisa digabung lewat `member_roles`. Cakupan koordinator diatur di `division_coordinators`. Peran `anggota` melekat otomatis pada setiap anggota sehingga tidak disimpan; `member_roles` hanya memuat `admin`, `koordinator`, dan `bendahara`.

Detail implementasi `can()` (`src/lib/authz`): bendahara hanya boleh melihat kontak anggota yang menunggak (`resource.hasArrears`), sesuai tabel di atas. Halaman dan Server Action mengambil sesi lewat `requireSession()` (`src/lib/auth/session.ts`), yang juga mengalihkan peran wajib 2FA ke `/2fa` bila sesi belum `aal2`.

Semua pengecekan lewat satu fungsi:

```ts
can(user: SessionUser, action: Action, resource?: Resource): boolean
```

Aturan umum: admin boleh semua; koordinator hanya pada resource dengan `division_id` dalam cakupannya; bendahara hanya pada modul kas; anggota hanya pada resource miliknya (`resource.memberId === user.id`). Fungsi ini harus punya tes unit untuk setiap kombinasi role dan aksi.

## 5. Model data

Kolom penting saja. Detail lengkap ada di skema Drizzle (`src/db/schema`).

| Kelompok | Tabel | Kolom/aturan penting |
|---|---|---|
| Organisasi | `divisions` | `id`, `name`, `slug` |
| | `division_coordinators` | `member_id`, `division_id` |
| | `member_roles` | `member_id`, `role` |
| Anggota | `members` | `id` (sama dengan `auth.users.id`), `member_code` (unik, permanen), `full_name`, `email`, `phone` (+62, wajib), `division_id`, `batch`, `status` (aktif/nonaktif/alumni), `card_version`, `legacy_card_allowed`, `card_status` (active/blocked) |
| | `member_code_counters` | `batch`, `last_seq` |
| | `import_batches` | riwayat impor, jumlah baris, pembuat, hasil |
| | `notification_preferences`, `telegram_links`, `push_subscriptions` | preferensi kanal per kategori |
| Akademik | `academic_years`, `terms`, `calendar_events` | cakupan: semua atau divisi tertentu |
| | `classes` | `division_id`, `planned_sessions` (7), jam default, hari tetap Kamis untuk kelas rutin |
| | `enrollments` | `class_id`, `member_id` |
| | `sessions` | `kind` (regular/extra/activity), `mode` (offline/online/hybrid), `status` (scheduled/done/off), `starts_at`, `ends_at`, `location`, `meeting_url`, `division_id`, `checkin_code` |
| Absensi | `attendance` | `session_id`, `member_id`, `status` (hadir/izin/sakit/tidak_hadir), `method`, `recorded_by`, `recorded_at`; unik `(session_id, member_id)` |
| Penilaian | `assessment_components` | `class_id`, `name`, `weight`, `kind` |
| | `assessment_scores` | `component_id`, `member_id`, `value`/`done` |
| | `certificate_rules` | `class_id`, aturan dalam JSON tervalidasi Zod |
| Kas | `categories`, `fee_schedules`, `invoices`, `payments`, `transactions` | lihat bagian 11 |
| Sistem | `notification_outbox`, `audit_log` | lihat bagian 12 dan 14 |

`attendance.method`: `scan_barcode`, `scan_qr`, `manual_entry`, `self_checkin`, `manual`.

## 6. Kode ID anggota

Format: `ISC` + 2 digit tahun + 2 digit batch + 3 digit urutan, lebar tetap 10 karakter. Contoh: `ISC2601009`. Validasi: `^ISC\d{2}\d{2}\d{3}$`.

Aturan:
- **Counter per batch**, bukan per tahun atau divisi. Di data awal, nomor urut berjalan 1-84 melintasi tiga divisi, dan sebagian kode berawalan `ISC25` berbagi urutan yang sama dengan `ISC26`.
- Kode unik secara keseluruhan, **tidak bisa diubah** setelah terbit, dan tidak dipakai ulang walaupun anggotanya keluar.
- Pembuatan kode terjadi di dalam transaksi: kunci baris counter (`SELECT ... FOR UPDATE`), naikkan, simpan.
- Bila impor menyertakan `kode_id`, kode dipakai apa adanya setelah validasi format dan keunikan, lalu `last_seq` diset ke `max(last_seq, seq tertinggi di file)`.
- Nomor yang kosong di data awal (21) dianggap terpakai dan tidak diterbitkan lagi.

Detail implementasi (`src/lib/members/import/plan.ts`, fungsi murni dan dites):
- Prefiks tahun untuk kode otomatis mengikuti **prefiks mayoritas di batch itu** (anggota yang ada ditambah isi file), atau tahun berjalan bila batch masih kosong. Dengan begitu anggota batch 01 yang menyusul tetap berawalan `ISC26`.
- Nomor urut dari baris yang ditolak tetap dicadangkan (counter melompatinya), agar baris itu bisa diimpor ulang setelah dikoreksi tanpa bentrok.
- Kode yang nomor urutnya sama dengan kode lain di batch yang sama (misalnya `ISC2501023` dan `ISC2601023`) diberi peringatan, bukan ditolak.

Temuan pada data awal yang harus diselesaikan sebelum impor produksi:
- 34 kode berawalan `ISC25` (Web Dev urutan 23-36, UI/UX 52-54, ML 67-83). Cocokkan dengan kartu fisik. Bila kartu tertulis `ISC26`, perbaiki di file impor, karena kode tidak bisa diubah setelah terbit.
- Dua anggota belum punya kode. Counter diset ke 84, sehingga yang tanpa kode mendapat 85 dan 86 sesuai urutan baris di file.

## 7. Impor anggota

Format: CSV atau XLSX. Kolom: `nama`, `email`, `no_hp`, `divisi`, `batch`, `kode_id` (opsional).

Alur:
1. Unggah, lalu server mem-parse (PapaParse untuk csv, ExcelJS untuk xlsx) dengan batas ukuran dan jumlah baris.
2. Validasi per baris dengan Zod: nama tidak kosong; email valid dan unik; HP dinormalisasi ke `+62` (`08xx` menjadi `+628xx`, `62xx` menjadi `+62xx`) dan unik; divisi dikenal; batch 2 digit; `kode_id` sesuai format dan unik.
3. Normalisasi nama: trim, gabungkan spasi berulang, buang karakter spasi tak terlihat (misalnya U+202F). Huruf kapital tidak diubah otomatis; tampilkan di pratinjau.
4. Pratinjau menampilkan error dan peringatan per baris (duplikat, prefiks tahun tidak sesuai, kode otomatis yang akan dibuat).
5. Setelah konfirmasi, semua baris valid disimpan dalam **satu transaksi**, termasuk pembuatan akun Auth, kode ID, dan penyesuaian counter.
6. Undangan aktivasi masuk `notification_outbox` dan dikirim bertahap.

Karena akun Auth dibuat lewat API Supabase (di luar transaksi Postgres), impor berjalan dua langkah: buat akun Auth untuk semua baris valid, lalu simpan data dalam satu transaksi dengan counter terkunci. Bila langkah kedua gagal, akun Auth yang baru dibuat dihapus lagi dan percobaan dicatat di `import_batches` berstatus `failed`. Akun dibuat tanpa password; anggota mengaktifkannya lewat tautan di email undangan.
7. Catat di `import_batches` dan `audit_log`.

Migrasi riwayat dari Google Sheets:
- Template impor awal sudah disiapkan dari file absen (85 anggota).
- Email dan HP belum ada di file, jadi dikumpulkan lewat formulir sebelum impor.
- Riwayat presensi tujuh pertemuan per divisi tidak memuat tanggal. Diimpor sebagai **arsip ringkasan** (jumlah hadir/izin/sakit/tidak hadir per anggota per kelas), bukan sebagai sesi bertanggal.
- Pertemuan yang tampak belum terisi (ML-1, UI/UX-7, ML-7) ditandai "perlu verifikasi" sebelum dipakai di laporan.

## 8. Kelas, sesi, dan kalender

| Jenis | Aturan |
|---|---|
| Kelas rutin | Hanya Kamis (Asia/Jakarta). Jam default per kelas, dapat diubah per sesi. Dibuat dengan `rrule` mingguan, melewati tanggal libur kalender akademik |
| Kelas tambahan | Hari dan jam bebas |
| Kegiatan lain | Hari dan jam bebas, untuk semua divisi atau satu divisi |

- Kelas punya `planned_sessions` (7 untuk program saat ini).
- Mode sesi: offline (lokasi), online (tautan), hybrid (keduanya).
- Status sesi: `scheduled`, `done`, `off` (libur atau dibatalkan). Sesi `off` tidak masuk penyebut persentase kehadiran.
- Kelas rutin dan tambahan mensyaratkan anggota terdaftar di kelas. Kegiatan terbuka sesuai cakupan.
- Kalender akademik: tahun ajaran, semester, dan event (libur, ujian, kegiatan, deadline). Feed `.ics` untuk Google Calendar atau Apple Calendar.

Contoh SQL kustom (ditulis sekali di migrasi, dengan komentar):

```sql
-- Kelas rutin hanya boleh pada hari Kamis (ISO dow = 4), zona Asia/Jakarta.
ALTER TABLE sessions ADD CONSTRAINT sessions_regular_on_thursday
  CHECK (kind <> 'regular'
         OR extract(isodow FROM (starts_at AT TIME ZONE 'Asia/Jakarta')) = 4);

-- Sesi pada kelas yang sama tidak boleh tumpang tindih.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE sessions ADD CONSTRAINT sessions_no_overlap
  EXCLUDE USING gist (class_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'off');
```

Detail implementasi (tahap 3):
- `sessions.division_id` juga diisi untuk sesi kelas (salinan dari kelasnya) agar cakupan dan otorisasi per divisi cukup membaca sesi. Kegiatan dengan `division_id` kosong berlaku untuk semua divisi dan hanya bisa dibuat admin.
- Jadwal rutin dibuat oleh fungsi murni `generateRegularSessions` (`src/lib/academic/schedule.ts`): Kamis pertama pada/setelah tanggal mulai, melewati event `holiday` (semua divisi atau divisi kelas), dan berhenti di akhir semester. Pertemuan yang tidak muat dilaporkan agar koordinator menambah kelas tambahan.
- Waktu WIB dihitung dengan offset tetap UTC+7 (Indonesia tidak memakai daylight saving).
- Extension `btree_gist` dipasang di skema `extensions` (konvensi Supabase), bukan `public`.
- Feed `.ics` memakai token acak per anggota di URL karena aplikasi kalender tidak mengirim cookie. Yang disimpan hanya hash SHA-256; token ditampilkan sekali dan bisa diganti kapan saja.
- UI kalender memakai FullCalendar v7 (`@fullcalendar/react`, plugin sudah dibundel; butuh `temporal-polyfill`). Data disaring di server, klien hanya menampilkan.

## 9. Presensi

### Kartu yang sudah beredar

Barcode **Code 128** berisi teks polos kode ID (misalnya `ISC2601009`), dibuat dengan situs tec-it dari lembar Google Sheets. Karena kode berurutan dan tanpa tanda tangan, barcode palsu mudah dibuat. Keamanannya bertumpu pada kontrol berikut.

### Alur pemindaian offline

1. Koordinator membuka sesi, lalu membuka halaman pemindai (kamera atau pemindai USB/Bluetooth).
2. Klien mengirim string hasil scan ke server beserta `session_id`.
3. Server, dalam satu transaksi:
   - memeriksa pemindai berhak (koordinator divisi terkait atau admin) dan sesi berstatus berjalan,
   - memeriksa format dan keberadaan kode, `card_status = active`, dan `status` anggota aktif,
   - untuk payload bertanda tangan, memverifikasi HMAC dan `card_version`; untuk kode polos, memastikan `legacy_card_allowed = true`,
   - memeriksa anggota terdaftar di kelas (atau sesuai cakupan kegiatan),
   - menyimpan `attendance` (unik per sesi dan anggota); duplikat dikembalikan sebagai "sudah tercatat",
   - mengirim event Broadcast untuk dashboard.
4. Layar hasil menampilkan **nama, divisi, batch, dan status** dengan jelas, supaya koordinator mencocokkan dengan orang di depannya. Ini kontrol terpenting.

### Pengaman tambahan
- Rate limit per pemindai dan per sesi (Upstash).
- Deteksi kejanggalan: scan beruntun dalam hitungan detik dari satu perangkat ditandai di laporan sesi.
- Setiap presensi mencatat `recorded_by` dan `method`.
- Absen manual oleh koordinator wajib disertai catatan dan masuk `audit_log`.

### Kartu pengganti (bertanda tangan)
Payload: `v1.<member_code>.<card_version>.<sig>`, dengan `sig = base64url(HMAC-SHA256(CARD_SECRET, member_code + "." + card_version))`. Payload ini panjang untuk Code 128, jadi kartu pengganti dan "Kartu Saya" memakai **QR**. Saat kartu pengganti diterima anggota, `legacy_card_allowed` menjadi `false` dan `card_version` naik, sehingga kartu lama ditolak.

### Presensi online
Anggota login, membuka sesi, lalu memasukkan `checkin_code` dalam jendela waktu sesi. Kode dibuat acak, berlaku selama sesi, dan dibatasi rate limit.

### Detail implementasi (tahap 4)
- "Sesi berjalan" diartikan sebagai jendela waktu: scan dibuka 60 menit sebelum mulai sampai 60 menit setelah selesai, check-in online 15 menit sebelum mulai sampai selesai. Sesi `off` selalu ditolak. Semua aturan di `src/lib/attendance/rules.ts` (fungsi murni, dites).
- Metode tercatat: `scan_barcode` (kode polos), `scan_qr` (payload bertanda tangan), `manual_entry` (kode diketik koordinator; dibedakan dari pemindai USB lewat kecepatan ketikan), `self_checkin`, `manual`.
- Kegiatan semua divisi boleh dicatat koordinator divisi mana pun; sesi berdivisi hanya koordinator divisi itu dan admin.
- Realtime: server mengirim Broadcast ke channel `presensi:<session_id>` setelah presensi tersimpan, **tanpa data pribadi**. Channel publik bisa didengar siapa pun yang tahu namanya, jadi klien hanya memuat ulang data lewat server (yang memeriksa izin). Dashboard juga memuat ulang tiap 30 detik sebagai cadangan. Tidak perlu policy di `realtime.messages`.
- Kode check-in: 6 karakter tanpa huruf/angka yang mudah tertukar, unik selama terisi.
- Arsip Google Sheets: `attendance_archives` per anggota per program. Pertemuan yang kosong di semua baris dianggap belum terisi dan tidak dihitung; baris yang menyentuhnya ditandai `needs_verification`.

### Perhitungan kehadiran
- Tidak Hadir dihitung otomatis hanya untuk sesi berstatus `done` tanpa catatan.
- Sesi `off` tidak masuk penyebut.
- Persentase = hadir / (jumlah sesi `done`, tidak termasuk `off`). Izin dan Sakit tampil terpisah dan tidak dihitung hadir kecuali aturan kelas menyebutnya.

## 10. Penilaian dan sertifikat

Latar belakang: di Google Sheets, Web Dev menilai tugas kelompok 20%, tugas individu 20%, project akhir 40%, dan absensi 20%, dengan syarat semua tugas selesai, izin maksimal 3, dan skor minimal 70. UI/UX dan ML memakai penanda manual dengan ambang yang tidak seragam.

Rancangan:
- `assessment_components`: komponen nilai per kelas, dengan bobot (total 100) dan jenis (`done_flag`, `score`, `attendance`).
- `assessment_scores`: nilai per anggota per komponen.
- `certificate_rules`: aturan per kelas dalam JSON, tervalidasi Zod, contoh:

```json
{
  "requireAllComponents": ["tugas_kelompok", "tugas_individu", "project_akhir"],
  "maxIzin": 3,
  "minScore": 70,
  "minAttendancePercent": null
}
```

- Evaluasi dilakukan oleh fungsi murni `evaluateCertificate(rule, components, scores, attendanceSummary)` yang mengembalikan status dan alasan (misalnya "izin 4 melebihi batas 3"). Wajib dites.
- Koordinator dapat menimpa status dengan catatan, tercatat di `audit_log`.
- Ekspor daftar penerima ke PDF/xlsx. Pembuatan PDF sertifikat adalah opsi tahap berikutnya.

Catatan data awal: rumus sertifikat Web Dev merujuk sel yang salah (kolom O) sehingga bobot absen tidak terhitung. Pada data saat ini hasilnya sama (17 dari 36 lolos), tetapi Presync menghitung bobot absen dengan benar.

Detail implementasi (tahap 8):
- Nilai komponen: `score` = nilai 0-100 (kosong dihitung 0), `done_flag` = 100/0, `attendance` = rasio hadir/sesi selesai x 100 **tanpa pembulatan** (agar skor akhir tidak bergeser 0,01 di sekitar ambang). Skor akhir = jumlah bobot x nilai / 100, dibulatkan 2 desimal. Satu kelas paling banyak satu komponen kehadiran.
- `requireAllComponents` berarti `score` sudah terisi atau `done_flag` dicentang. Total bobot selain 100 membuat semua anggota tidak lolos sampai diperbaiki.
- Aturan disimpan sebagai JSON di `certificate_rules` dan selalu dibaca lewat `parseRule` (Zod); JSON rusak dianggap aturan kosong.
- Penimpaan status (`certificate_overrides`) dan penghapusannya tercatat di `audit_log`. Daftar penerima diekspor lewat sistem laporan (`/laporan/sertifikat`).
- Anggota melihat nilai dan status sertifikatnya sendiri di halaman kelas.

## 11. Kas dan payment gateway

### Tahap awal: transfer manual
1. Bendahara membuat `fee_schedules` dan sistem membuat `invoices` per anggota per periode.
2. Anggota mengunggah bukti transfer ke Storage (bucket privat). Status tagihan `pending`.
3. Bendahara memverifikasi. Dalam satu transaksi: ubah status tagihan, buat `payments` terverifikasi, tambah baris `transactions`, tulis `audit_log`.

### Ledger
- `transactions` hanya-tambah. Trigger database menolak UPDATE dan DELETE:

```sql
CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transactions bersifat hanya-tambah; buat transaksi koreksi (reversal_of)';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_append_only
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
```

- Nominal `bigint` dalam rupiah. Saldo dari view yang menjumlahkan pemasukan dan pengeluaran.
- Status tagihan: `unpaid`, `pending`, `paid`, `waived`.

### Detail implementasi (tahap 5)
- Transaksi koreksi berjenis **kebalikan** dari transaksi asal dengan nominal sama, dibukukan pada tanggal koreksi. Koreksi tidak bisa dikoreksi lagi, dan satu transaksi hanya sekali dikoreksi (`reversal_of` unik). Mengoreksi transaksi dari pembayaran tagihan membuat pembayaran berstatus `reversed` dan tagihan kembali `unpaid`.
- View `finance_balance`, `finance_monthly`, `member_arrears` dibuat dengan `security_invoker = true` dan hak `anon`/`authenticated` dicabut. Tanpa itu, view di skema public bisa dibaca lewat API publik Supabase meski tabelnya ber-RLS. `bun run db:check-rls` ikut menguji view.
- **Tutup buku**: `finance_period_closures` per bulan, harus berurutan. Setelah ditutup, transaksi baru (termasuk verifikasi dan koreksi) tidak boleh bertanggal di bulan itu. Saldo penutupan disimpan sebagai catatan; sumber kebenaran tetap ledger.
- Bukti transfer diunggah lewat Server Action (maks. 4 MB, di bawah batas body Vercel 4,5 MB), jenis file dicek dari isi (JPG/PNG/WEBP/PDF), lalu disimpan di bucket privat `bukti-pembayaran` dengan service role. Bucket dibuat otomatis bila belum ada.
- Pembayaran tunai dicatat bendahara langsung sebagai pembayaran terverifikasi (tanpa bukti) dalam satu transaksi.

### Siap gateway
- `payments` memuat `method`, `provider`, `provider_order_id` (unik), `provider_status`, `fee_amount`, dan `raw_webhook`.
- Antarmuka adapter:

```ts
interface PaymentProvider {
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  verifyWebhook(req: Request): Promise<WebhookEvent>; // verifikasi tanda tangan
  getStatus(orderId: string): Promise<ProviderStatus>;
}
```

- Webhook: verifikasi tanda tangan, idempotent berdasarkan `provider_order_id`, cocokkan nominal, tangani lunas, kedaluwarsa, dan gagal. Rekonsiliasi harian membandingkan status provider dengan database.
- Pemasukan dicatat bruto, biaya gateway sebagai pengeluaran terpisah. Siapa yang menanggung biaya perlu diputuskan sebelum gateway aktif.
- Calon provider: Midtrans, Xendit, Duitku, Tripay, iPaymu. Persyaratan verifikasi (KYC/KYB) berbeda dan organisasi tanpa badan hukum bisa terkendala, jadi periksa lebih awal. Gunakan sandbox selama pengembangan.
- Begitu aplikasi memproses pembayaran, cek ulang ketentuan Vercel Hobby (non-komersial).

## 12. Notifikasi

Semua notifikasi lewat `notification_outbox`:

| Kolom | Isi |
|---|---|
| `id`, `idempotency_key` | kunci unik per notifikasi, mencegah kirim ganda saat retry |
| `member_id`, `channel`, `template`, `payload` | tujuan dan isi |
| `status` | `queued`, `sent`, `failed`, `skipped` |
| `attempts`, `scheduled_at`, `sent_at`, `last_error` | kontrol pengiriman |

Worker mengambil antrean per batch, memilih kanal sesuai preferensi anggota, mengirim lewat adapter, dan mencoba ulang yang gagal.

| Kanal | Peran |
|---|---|
| Email (Resend) | Aktivasi akun, reset password, konfirmasi pembayaran, digest tunggakan, pengumuman bertahap |
| Telegram bot | Pengingat dan pengumuman. Akun ditautkan lewat tautan sekali pakai (`t.me/<bot>?start=<token>`) |
| Web push | Pengingat dan pengumuman. Di iPhone hanya bekerja bila aplikasi ditambahkan ke Layar Utama |

Batas email (cek ulang di halaman harga Resend): free tier 3.000 per bulan dan 100 per hari. Worker maksimal 80/hari, 20/hari disisakan untuk email auth. Perkiraan pemakaian 800-1.200 per bulan, sehingga cukup untuk 170 anggota. Pertimbangkan Resend Pro bila anggota melebihi sekitar 300.

SMTP Supabase Auth memakai Resend (`smtp.resend.com`, port 465, username `resend`, password API key khusus SMTP). Email auth langsung ke Resend tanpa lewat outbox, jadi kuota harian dibagi dengan worker.

Undangan aktivasi: worker membuat tautan (`generateLink` tipe `recovery`) **saat email dikirim**, bukan saat impor, karena token Supabase cepat kedaluwarsa sedangkan undangan bisa menunggu beberapa hari di antrean. Undangan dibatasi 40 per hari di dalam batas 80. Undangan dilewati bila akun sudah pernah login.

Jadwal:
- Vercel Cron harian: rekap tunggakan, pengingat H-1, pengiriman outbox, ping database.
- GitHub Actions tiap 15-30 menit: pengingat "1 jam sebelum" untuk kegiatan di luar Kamis. Workflow terjadwal di repo yang lama tidak aktif bisa dinonaktifkan otomatis, jadi cek berkala.

Webhook Resend menandai email yang bounce atau dilaporkan spam, lalu pengiriman ke alamat itu dihentikan.

Detail implementasi (tahap 6):
- Kategori yang bisa diatur: `session_reminder` dan `finance`. Email akun (aktivasi, reset) selalu dikirim. Notifikasi disebar per kanal oleh `notifyMembers` (satu baris outbox per kanal, kunci idempotensi `<kunci>:<kanal>`) sesuai preferensi dan kanal yang tersedia (Telegram tertaut, ada langganan push, email tidak di daftar blokir).
- **Pengingat sesi bawaan tanpa email**: satu pengingat ke 85 anggota sudah melebihi 80 email/hari. Anggota diarahkan menautkan Telegram atau mengaktifkan notifikasi perangkat. Pengingat membawa `expiresAt` (waktu mulai sesi) dan dilewati bila terlambat terkirim.
- Pengingat "1 jam sebelum" berlaku untuk semua sesi (bukan hanya kegiatan di luar Kamis) karena Telegram dan push tidak berkuota; jendela 45-75 menit cocok dengan jadwal GitHub Actions tiap 15 menit, dan idempotensi mencegah ganda.
- Telegram: token penautan acak 15 menit, sekali pakai, hanya hash disimpan; satu chat untuk satu anggota; bot yang diblokir otomatis memutus tautan. Webhook diverifikasi header `X-Telegram-Bot-Api-Secret-Token`.
- Web push: langganan yang dibalas 404/410 oleh layanan push dihapus otomatis. Service worker hanya menampilkan notifikasi dan hanya membuka URL di origin sendiri.
- Webhook Resend diverifikasi dengan tanda tangan Svix (toleransi 5 menit); `email.bounced` dan `email.complained` masuk `email_suppressions`.

## 13. Laporan

| Laporan | Format |
|---|---|
| Kehadiran per anggota, kelas, divisi, periode | PDF, xlsx, csv |
| Nilai dan kelayakan sertifikat per kelas | PDF, xlsx, csv |
| Kas bulanan dan rekap tunggakan | PDF, xlsx, csv |
| Daftar anggota per divisi atau batch | PDF, xlsx, csv |
| Kartu anggota | PDF |

PDF dibuat di server dengan `@react-pdf/renderer`. Setiap laporan memuat judul organisasi, periode, pembuat, waktu cetak, dan nomor halaman, dengan font tertanam. Batasi rentang data per laporan agar tidak melewati batas waktu fungsi serverless.

Detail implementasi (tahap 7):
- Satu model laporan generik (`src/lib/reports/model.ts`: kolom bertipe teks/angka/rupiah/persen, baris, total) dirender ke PDF, XLSX, dan CSV oleh `render.tsx`. Menambah laporan cukup membuat fungsi pembangun di `builders.ts` yang memeriksa `can()` dan menghasilkan model itu.
- Unduhan lewat `/laporan/<jenis>?format=pdf|xlsx|csv`: `kehadiran-kelas`, `kehadiran-divisi`, `kehadiran-anggota` (anggota boleh mengunduh miliknya sendiri), `kas-bulanan`, `tunggakan`, `anggota`.
- Font PDF: Inter (OFL) dari `@fontsource/inter`, dibaca dari disk dan disertakan ke fungsi Vercel lewat `outputFileTracingIncludes`.
- CSV memakai BOM UTF-8 agar Excel membaca huruf dengan benar; XLSX menyimpan angka sebagai angka dengan format rupiah/persen.
- Batas: rentang periode 366 hari dan 3.000 baris per laporan.
- Rekap per divisi menghitung sesi kelas berstatus Selesai dalam periode untuk anggota yang terdaftar di kelas tersebut, dengan rumus yang sama seperti rekap kelas (`summarizeAttendance`).

## 14. Keamanan

- Login email + password, minimal 10 karakter. Turnstile dan rate limit di login dan lupa password.
- 2FA (TOTP) wajib untuk admin, bendahara, dan koordinator.
- Semua akses data lewat server. RLS aktif tanpa policy:

```sql
ALTER TABLE members ENABLE ROW LEVEL SECURITY; -- ulangi untuk semua tabel di skema public
```

- Cookie sesi terikat ke host `presync...`, tanpa atribut domain `.informaticstudyclub.com`.
- Secret hanya di environment variable (terpisah per lingkungan). Endpoint cron memeriksa header `Authorization: Bearer <CRON_SECRET>`.
- Bukti pembayaran di bucket privat, diakses lewat signed URL berumur pendek.
- `audit_log` mencatat: verifikasi dan koreksi kas, perubahan role, absen manual, impor, penerbitan ulang kartu, penimpaan status sertifikat.
- Data pribadi seminimal mungkin. Nomor HP hanya terlihat oleh admin, koordinator divisi terkait, dan bendahara. Sediakan halaman kebijakan data dan jalur permintaan penghapusan (selaras UU PDP).
- 2FA juga untuk akun layanan: GitHub, Vercel, Supabase, Resend, Upstash, Cloudflare, registrar.

## 15. Lingkungan dan deploy

| Lingkungan | Database | Domain |
|---|---|---|
| Development | Supabase lokal atau proyek dev | localhost |
| Staging (preview Vercel) | Proyek Supabase staging | `staging-presync.informaticstudyclub.com` |
| Production | Proyek Supabase production | `presync.informaticstudyclub.com` |

- Preview tidak boleh menunjuk ke database production.
- Migrasi dijalankan sebagai langkah terpisah dan terkontrol (GitHub Actions manual atau lokal), bukan di dalam build Vercel.
- Dua connection string: `DATABASE_URL` (pooler) untuk aplikasi, `DATABASE_URL_DIRECT` untuk migrasi.
- Daftarkan Site URL dan Redirect URL Supabase Auth per lingkungan. Arahkan tautan di template email ke rute konfirmasi aplikasi (`/auth/confirm`) yang memverifikasi token di server.
- Pilih region fungsi Vercel yang dekat dengan region Supabase (Singapura).

## 16. DNS dan domain (Cloudflare)

| Record | Tujuan |
|---|---|
| `presync` (CNAME) | Vercel, mode DNS only |
| `staging-presync` (CNAME) | Vercel preview/staging, mode DNS only |
| `mail` (SPF, DKIM, DMARC) | Resend, wajib DNS only. Mulai DMARC dengan `p=none`, perketat setelah email stabil |
| Opsional: Email Routing | `halo@informaticstudyclub.com` diteruskan ke email pengurus, dipakai sebagai `reply-to` |

Aktifkan DNSSEC dan 2FA di Cloudflare. Daftarkan domain atas nama organisasi dengan email bersama, auto-renew, domain lock, dan perpanjangan multi-tahun. Domain yang lupa diperpanjang mematikan seluruh aplikasi dan email.

## 17. Risiko dan batas free tier

Batas dan syarat layanan bisa berubah. Cek ulang sebelum peluncuran dan secara berkala.

| Risiko | Penanganan |
|---|---|
| Barcode kartu lama berisi kode polos dan mudah ditebak | Pemeriksaan visual, deteksi kejanggalan, migrasi bertahap ke kartu bertanda tangan |
| Kode ID salah cetak atau tidak seragam (`ISC25` vs `ISC26`) | Verifikasi dengan kartu fisik sebelum impor produksi |
| Pertemuan belum terisi dihitung sebagai tidak hadir | Status sesi, Tidak Hadir hanya untuk sesi `done` |
| Resend 100 email/hari | Outbox, digest, kanal kedua, undangan bertahap |
| Supabase gratis di-pause saat tidak aktif | Ping cron harian |
| Tidak ada cadangan otomatis di paket gratis | Workflow `backup.yml` mingguan: `pg_dump` terenkripsi GPG + uji pemulihan otomatis ke Postgres sementara. Password akun tidak dicadangkan (anggota memakai "Lupa password" setelah pemulihan bencana) |
| Vercel Hobby: non-komersial dan akun personal | Akun organisasi bersama, cek ulang saat gateway aktif, cadangan Cloudflare Pages |
| Cron Hobby hanya harian | GitHub Actions tiap 15 menit (`pengingat.yml`). Workflow terjadwal di repo publik nonaktif setelah 60 hari tanpa aktivitas: cek bulanan |
| Verifikasi provider gateway | Periksa persyaratan sejak dini |
| Domain lupa diperpanjang | Auto-renew, multi-tahun, pengingat jatuh tempo |
| Pergantian pengurus | Email organisasi, password manager bersama, `SERAH-TERIMA.md` |
| Tim lemah di SQL | Logika di TypeScript, SQL kustom minimal dan terdokumentasi |

## 18. Keputusan yang masih terbuka

| Keputusan | Default saat ini |
|---|---|
| Foto anggota di layar scan | Tidak dipakai di versi pertama |
| Geofencing untuk presensi offline | Tidak di versi pertama |
| Antrean scan offline (PWA) untuk lokasi sinyal buruk | Ditunda ke setelah peluncuran |
| Penanggung biaya payment gateway | Diputuskan sebelum gateway aktif |
| Provider payment gateway | Diputuskan setelah memeriksa persyaratan verifikasi |
| PDF sertifikat otomatis | Opsi setelah modul penilaian stabil |
| Penggantian kartu massal ke QR bertanda tangan | Bertahap, dimulai dari kartu hilang |
