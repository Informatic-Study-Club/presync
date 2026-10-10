# Panduan Koordinator Presync

Panduan singkat untuk koordinator divisi. Semua menu hanya menampilkan data divisi yang Anda koordinasi. Peran koordinator wajib memakai **verifikasi dua langkah**: siapkan aplikasi autentikator (Google Authenticator, Aegis, atau 2FAS) sebelum login pertama.

## 1. Membuat program kelas

1. Pastikan admin sudah membuat tahun ajaran, semester, dan tanggal libur di **Kalender > Kelola kalender**.
2. Buka **Kelas > Buat kelas**. Isi nama, divisi, semester, jumlah pertemuan (biasanya 7), tanggal mulai, jam, durasi, dan lokasi atau tautan meeting.
3. Presync membuat semua pertemuan hari **Kamis** secara otomatis dan melewati tanggal libur. Bila ada pertemuan yang tidak muat sebelum akhir semester, Presync memberi tahu; tambahkan **kelas tambahan** di halaman kelas.
4. Di halaman kelas, bagian **Anggota terdaftar**, centang anggota divisi lalu **Daftarkan**. Hanya anggota terdaftar yang bisa dipindai dan melihat kelas di kalendernya.

Kegiatan di luar kelas (bebas hari) dibuat di **Kelas > Buat kegiatan**.

## 2. Presensi saat kelas

1. Di halaman kelas, pilih **Presensi** pada pertemuan hari itu, lalu **Buka pemindai**.
2. Pindai kartu dengan kamera, pemindai USB/Bluetooth, atau ketik kode ID lalu Enter. Pemindaian dibuka 60 menit sebelum sampai 60 menit setelah sesi.
3. **Selalu cocokkan nama, divisi, dan batch di layar dengan orang di depan Anda.** Kartu lama hanya berisi kode, jadi pemeriksaan visual inilah pengaman utamanya.
4. Warna hasil: hijau = tercatat, kuning = sudah tercatat sebelumnya, merah = ditolak (alasannya ditampilkan).
5. Dashboard presensi diperbarui otomatis. Bila muncul peringatan **Scan beruntun**, periksa apakah semua orangnya memang hadir.

**Kelas online/hybrid:** di dashboard presensi, tekan **Buat kode check-in**, lalu bagikan kode 6 karakter kepada peserta. Peserta memasukkannya di menu **Check-in**.

**Izin, sakit, atau koreksi:** gunakan **Absen manual** di dashboard presensi. Catatan wajib diisi dan tercatat di audit log.

## 3. Setelah kelas

1. Di halaman kelas, buka **Ubah status** pada pertemuan itu dan pilih **Selesai**. Kehadiran baru dihitung di rekap setelah sesi berstatus Selesai. Anggota tanpa catatan otomatis dihitung Tidak Hadir.
2. Pertemuan yang batal: pilih **Libur** dan isi alasannya. Sesi libur tidak masuk perhitungan persentase.

## 4. Penilaian dan sertifikat

1. Di halaman kelas, buka **Penilaian dan Sertifikat**.
2. Tambahkan komponen nilai (total bobot harus 100%), atau tekan **Pakai templat Web Development**.
3. Atur **aturan sertifikat**: komponen wajib, izin maksimal, skor minimal.
4. Isi tabel nilai (boleh desimal dengan koma) lalu **Simpan nilai**.
5. Bagian **Hasil evaluasi** menampilkan status dan alasannya. Untuk pengecualian, gunakan **Timpa status** dengan catatan (tercatat di audit log).
6. **Unduh daftar penerima** (PDF/XLSX) untuk keperluan sertifikat.

## 5. Laporan

Menu **Laporan**: rekap kehadiran per kelas, per divisi dan periode, daftar anggota, dalam PDF, XLSX, atau CSV.

## 6. Bila ada masalah

| Gejala | Yang dicek |
|---|---|
| Kartu ditolak "tidak terdaftar di kelas" | Daftarkan anggota di halaman kelas |
| "Presensi belum dibuka" | Jam sesi; pemindaian dibuka 60 menit sebelum mulai |
| "Kartu lama tidak berlaku lagi" | Kartu sudah diterbitkan ulang; minta anggota memakai kartu QR terbaru atau "Kartu Saya" |
| Kamera tidak menyala | Izin kamera di peramban, atau pakai pemindai USB/ketik kode |
| Lupa password / ganti HP autentikator | Hubungi admin ISC |
