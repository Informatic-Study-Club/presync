import type { NextConfig } from "next";

// cacheComponents sengaja tidak diaktifkan: hampir semua halaman Presync
// membaca sesi login, jadi manfaat prerender kecil dan aturan <Suspense>-nya
// menambah kerumitan bagi pemelihara.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Unggahan bukti transfer maks. 4 MB (src/lib/finance/proof.ts). Batas
    // body fungsi Vercel 4,5 MB, jadi jangan dinaikkan lagi.
    serverActions: { bodySizeLimit: "4.5mb" },
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
