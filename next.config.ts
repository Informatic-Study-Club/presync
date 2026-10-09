import type { NextConfig } from "next";

// cacheComponents sengaja tidak diaktifkan: hampir semua halaman Presync
// membaca sesi login, jadi manfaat prerender kecil dan aturan <Suspense>-nya
// menambah kerumitan bagi pemelihara.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
