// Semua teks antarmuka Presync. Jangan menulis teks UI langsung di komponen.

export const id = {
  app: {
    name: "Presync",
    org: "Informatics Study Club",
    description: "Sistem presensi dan manajemen Informatics Study Club",
  },
  common: {
    submit: "Kirim",
    save: "Simpan",
    back: "Kembali",
    loading: "Memproses…",
    unknownError: "Terjadi kesalahan. Coba lagi beberapa saat lagi.",
  },
  auth: {
    loginTitle: "Masuk",
    loginDescription: "Masuk dengan email dan password akun Presync.",
    email: "Email",
    password: "Password",
    login: "Masuk",
    logout: "Keluar",
    forgotPassword: "Lupa password?",
    invalidCredentials: "Email atau password salah.",
    invalidInput: "Periksa kembali isian Anda.",
    rateLimited: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
    captchaFailed: "Verifikasi anti-bot gagal. Muat ulang halaman lalu coba lagi.",
    noMemberRecord:
      "Akun ini belum terhubung ke data anggota. Hubungi admin ISC.",
    inactiveMember: "Akun anggota ini tidak aktif. Hubungi admin ISC.",
    noPublicSignup: "Akun dibuat oleh admin ISC. Tidak ada pendaftaran publik.",

    forgotTitle: "Lupa password",
    forgotDescription:
      "Masukkan email akun Anda. Bila terdaftar, kami kirim tautan untuk membuat password baru.",
    forgotSubmit: "Kirim tautan",
    forgotSent:
      "Bila email tersebut terdaftar, tautan reset sudah dikirim. Periksa juga folder spam.",
    backToLogin: "Kembali ke halaman masuk",

    setPasswordTitle: "Buat password baru",
    setPasswordDescription: "Password minimal 10 karakter.",
    newPassword: "Password baru",
    confirmPassword: "Ulangi password baru",
    passwordTooShort: "Password minimal 10 karakter.",
    passwordMismatch: "Kedua password tidak sama.",
    passwordUpdated: "Password berhasil diperbarui.",
    linkInvalid: "Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.",
  },
  mfa: {
    setupTitle: "Aktifkan verifikasi dua langkah",
    setupDescription:
      "Peran Anda wajib memakai verifikasi dua langkah. Pindai kode QR dengan aplikasi autentikator (misalnya Google Authenticator, Aegis, atau 2FAS), lalu masukkan kode 6 digit.",
    secretLabel: "Atau masukkan kunci ini secara manual:",
    verifyTitle: "Verifikasi dua langkah",
    verifyDescription: "Masukkan kode 6 digit dari aplikasi autentikator Anda.",
    code: "Kode 6 digit",
    verify: "Verifikasi",
    invalidCode: "Kode salah atau sudah kedaluwarsa.",
    qrAlt: "Kode QR untuk aplikasi autentikator",
  },
  dashboard: {
    title: "Beranda",
    greeting: (name: string) => `Halo, ${name}`,
    memberCode: "Kode ID",
    division: "Divisi",
    batch: "Batch",
    roles: "Peran",
  },
  roles: {
    admin: "Admin",
    koordinator: "Koordinator",
    bendahara: "Bendahara",
    anggota: "Anggota",
  },
  attendanceStatus: {
    hadir: "Hadir",
    izin: "Izin",
    sakit: "Sakit",
    tidak_hadir: "Tidak Hadir",
  },
} as const;

export type Messages = typeof id;
