import type { NextConfig } from "next";

// cacheComponents sengaja tidak diaktifkan: hampir semua halaman Presync
// membaca sesi login, jadi manfaat prerender kecil dan aturan <Suspense>-nya
// menambah kerumitan bagi pemelihara.
// Header keamanan untuk semua respons (docs/ARSITEKTUR.md bagian 14).
// CSP sengaja tanpa script-src: skrip inline Next.js butuh nonce per request,
// yang menambah kerumitan; direktif di bawah tetap menutup clickjacking,
// injeksi <base>/<object>, dan pengiriman form ke situs lain.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kamera hanya untuk pemindai presensi di domain sendiri.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  poweredByHeader: false,
  // `bun run lokal dev` memakai folder build sendiri supaya bisa berjalan
  // berdampingan dengan `bun run dev` (Next.js mengunci satu server per folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Unggahan bukti transfer maks. 4 MB (src/lib/finance/proof.ts). Batas
    // body fungsi Vercel 4,5 MB, jadi jangan dinaikkan lagi.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // Font PDF laporan dibaca dari disk saat runtime (src/lib/reports/render.tsx).
  outputFileTracingIncludes: {
    "/laporan/**": ["./node_modules/@fontsource/inter/files/inter-latin-{400,700}-normal.woff"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
