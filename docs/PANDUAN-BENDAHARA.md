# Panduan Bendahara Presync

Panduan singkat modul kas. Peran bendahara wajib memakai **verifikasi dua langkah**. Prinsip utama: **buku kas tidak bisa diubah atau dihapus.** Kesalahan diperbaiki dengan transaksi koreksi, sehingga riwayat selalu bisa diaudit.

## 1. Persiapan (sekali di awal)

1. Buka **Kas > Kelola Kas**.
2. Buat **kategori**, minimal satu pemasukan (misalnya "Iuran") dan beberapa pengeluaran (misalnya "Konsumsi", "Perlengkapan").
3. Buat **jadwal iuran**: nama, kategori pemasukan, nominal, bulanan (tanggal jatuh tempo) atau sekali bayar (tanggal), dan cakupan (semua anggota, satu divisi, atau satu batch).

## 2. Setiap bulan: membuat tagihan

1. Di **Kelola Kas**, pada jadwal iuran, pilih bulan lalu tekan **Buat tagihan**.
2. Tagihan dibuat untuk semua anggota aktif dalam cakupan. Menekan dua kali tidak membuat tagihan ganda.
3. Anggota melihat tagihannya di menu **Tagihan**, transfer, lalu mengunggah bukti.

## 3. Verifikasi pembayaran

1. Buka **Kas > Verifikasi**. Tekan **Lihat bukti** (tautan berlaku 60 detik).
2. Cocokkan bukti dengan mutasi rekening organisasi.
3. **Verifikasi**: tagihan menjadi Lunas dan pemasukan otomatis tercatat di buku kas.
4. **Tolak** dengan alasan bila bukti tidak sesuai; tagihan kembali Belum bayar dan anggota melihat alasannya.

**Bayar tunai:** di daftar tagihan (Kelola Kas), pilih **Catat bayar tunai** pada tagihan anggota.
**Membebaskan tagihan** (misalnya keringanan): pilih **Bebaskan** dan isi alasannya.

Semua verifikasi, penolakan, pembebasan, dan koreksi tercatat di audit log.

## 4. Pengeluaran dan transaksi lain

Buka **Kas > Buku kas**, isi **Catat transaksi** (tanggal, jenis, kategori, nominal tanpa desimal, keterangan).

## 5. Memperbaiki kesalahan

1. Di **Buku kas**, pada transaksi yang salah, pilih **Koreksi** dan isi alasannya.
2. Presync membuat transaksi kebalikan dengan nominal sama pada tanggal hari ini, sehingga saldo kembali seperti sebelum transaksi salah.
3. Bila perlu, catat transaksi yang benar sebagai transaksi baru.
4. Mengoreksi pemasukan dari pembayaran tagihan membuat tagihan itu kembali Belum bayar.

Transaksi koreksi tidak bisa dikoreksi lagi, dan satu transaksi hanya bisa dikoreksi sekali.

## 6. Tutup buku bulanan

1. Pastikan semua bukti bulan itu sudah diverifikasi atau ditolak.
2. Di **Buku kas**, pilih bulan dan cocokkan **saldo akhir** dengan rekening dan buku manual.
3. Tekan **Tutup bulan**. Bulan harus ditutup berurutan. Setelah ditutup, transaksi baru tidak bisa bertanggal di bulan itu; koreksi masuk ke bulan berjalan.

## 7. Tunggakan dan laporan

- **Kas > Tunggakan**: anggota yang tagihannya lewat jatuh tempo, lengkap dengan nomor HP untuk ditagih.
- Presync mengirim pengingat tunggakan otomatis tiap Senin (email/Telegram sesuai pengaturan anggota).
- **Laporan**: kas bulanan dan tunggakan dalam PDF, XLSX, atau CSV.

## 8. Bila ada masalah

| Gejala | Yang dicek |
|---|---|
| "Bulan ini sudah ditutup" | Catat transaksi atau koreksi di bulan berjalan |
| Bukti tidak bisa dibuka | Tautan hanya 60 detik; tekan Lihat bukti lagi |
| Saldo tidak cocok | Cari transaksi yang terlewat atau salah nominal di Buku kas, lalu koreksi |
| Tagihan anggota tidak muncul | Cakupan jadwal iuran (divisi/batch) dan status anggota (harus aktif) |
