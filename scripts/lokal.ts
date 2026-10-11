// Menjalankan perintah Presync terhadap Supabase lokal (Docker), tanpa
// menyentuh .env yang menunjuk ke staging. Nilai koneksi diambil dari
// `supabase status` lalu dipasang sebagai environment variable proses anak,
// yang mengalahkan isi .env (Next.js dan Bun tidak menimpa env yang sudah ada).
//
// Pemakaian:
//   bun run lokal:start          # nyalakan Supabase lokal (butuh Docker)
//   bun run lokal migrate        # migrasi Drizzle + cek RLS
//   bun run lokal seed           # divisi + data dummy (scripts/seed-dummy.ts)
//   bun run lokal dev            # aplikasi di http://localhost:3001
//   bun run lokal start          # build + server production di port yang sama
//   bun run lokal:stop
//
// Email dari Supabase lokal (undangan, reset password) masuk ke Mailpit:
// http://127.0.0.1:54324

export const SUPABASE_CLI = ["bunx", "supabase@2.120.0"];
const PORT = "3001";

const COMMANDS: Record<string, string[][]> = {
  dev: [["bunx", "next", "dev", "-p", PORT]],
  // Build dan server production (folder build .next-lokal), untuk cek header,
  // ukuran bundle, dan kecepatan seperti di Vercel.
  start: [
    ["bunx", "next", "build"],
    ["bunx", "next", "start", "-p", PORT],
  ],
  migrate: [
    ["bunx", "drizzle-kit", "migrate"],
    ["bun", "run", "scripts/check-rls.ts"],
  ],
  seed: [
    ["bun", "run", "scripts/seed-divisi.ts"],
    ["bun", "run", "scripts/seed-dummy.ts"],
  ],
  "check-rls": [["bun", "run", "scripts/check-rls.ts"]],
  test: [["bunx", "playwright", "test"]],
};

function readStatus(): Record<string, string> {
  const result = Bun.spawnSync([...SUPABASE_CLI, "status", "-o", "env"], { stderr: "pipe" });
  if (result.exitCode !== 0) {
    console.error(result.stderr.toString());
    throw new Error("Supabase lokal belum menyala. Jalankan: bun run lokal:start");
  }
  const values: Record<string, string> = {};
  for (const line of result.stdout.toString().split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

function pick(status: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = status[name];
    if (value) return value;
  }
  throw new Error(`supabase status tidak memuat ${names.join(" / ")}`);
}

export function localEnv(): Record<string, string> {
  const status = readStatus();
  const dbUrl = pick(status, "DB_URL");
  return {
    APP_URL: `http://localhost:${PORT}`,
    DATABASE_URL: dbUrl,
    DATABASE_URL_DIRECT: dbUrl,
    NEXT_PUBLIC_SUPABASE_URL: pick(status, "API_URL"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pick(status, "PUBLISHABLE_KEY"),
    SUPABASE_SECRET_KEY: pick(status, "SECRET_KEY"),
    // Kunci uji resmi Cloudflare (selalu lolos).
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    // Layanan luar dimatikan supaya uji lokal tidak memakai kuota sungguhan.
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
    RESEND_API_KEY: "",
    TELEGRAM_BOT_TOKEN: "",
    CARD_SECRET: process.env.CARD_SECRET || "kunci-kartu-lokal-hanya-untuk-pengembangan-presync",
    CRON_SECRET: process.env.CRON_SECRET || "cron-lokal-presync",
    PRESYNC_LOKAL: "1",
    NEXT_DIST_DIR: ".next-lokal",
  };
}

if (import.meta.main) {
  const name = process.argv[2] ?? "";
  const steps = COMMANDS[name];
  if (!steps) {
    console.error(`Perintah tidak dikenal: "${name}". Pilihan: ${Object.keys(COMMANDS).join(", ")}`);
    process.exit(1);
  }
  const env: Record<string, string | undefined> = { ...process.env, ...localEnv() };
  if (name === "start") {
    // Mode production mewajibkan Upstash (rate limit); pakai nilai dari .env.
    env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
    env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  for (const cmd of steps) {
    const proc = Bun.spawn([...cmd, ...process.argv.slice(3)], { env, stdio: ["inherit", "inherit", "inherit"] });
    const code = await proc.exited;
    if (code !== 0) process.exit(code);
  }
}
