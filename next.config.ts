import type { NextConfig } from "next";

// cacheComponents sengaja tidak diaktifkan: hampir semua halaman Presync
// membaca sesi login, jadi manfaat prerender kecil dan aturan <Suspense>-nya
// menambah kerumitan bagi pemelihara.
const nextConfig: NextConfig = {
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
