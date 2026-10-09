// Rute yang bisa dibuka tanpa login.
// /api/cron memeriksa CRON_SECRET sendiri; /kebijakan-data terbuka untuk umum.
const PUBLIC_PATHS = [
  "/masuk",
  "/lupa-password",
  "/auth/confirm",
  "/kebijakan-data",
  "/api/cron",
  // Webhook memverifikasi tanda tangan atau secret sendiri.
  "/api/webhooks",
  // Aset PWA harus bisa diambil tanpa sesi.
  "/sw.js",
  "/manifest.webmanifest",
  // Feed .ics dilindungi token acak, karena aplikasi kalender tidak mengirim cookie.
  "/kalender/feed",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Hanya menerima path relatif di aplikasi sendiri ("/..."), untuk mencegah
 * open redirect lewat parameter `next`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
