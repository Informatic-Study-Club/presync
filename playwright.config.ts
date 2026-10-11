import { defineConfig, devices } from "@playwright/test";

// Tes end-to-end terhadap Supabase lokal (README bagian "Uji lokal").
// Jalankan lewat `bun run lokal test` supaya koneksi database lokal terpasang;
// server aplikasi dinyalakan otomatis bila belum berjalan.
//
// Berkas tes memakai akhiran .e2e.ts supaya tidak ikut `bun test` (tes unit).

const PORT = 3001;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  // Alur saling bergantung pada data yang sama (sesi uji, akun admin).
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "**/auth.setup.e2e.ts" },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: "**/auth.setup.e2e.ts",
    },
  ],
  webServer: {
    command: "bun run lokal dev",
    url: `http://localhost:${PORT}/masuk`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
