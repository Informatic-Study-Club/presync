import { z } from "zod";

// Validasi environment variable di server. Dibaca saat pertama dipakai
// (bukan saat import) supaya `next build` tetap jalan tanpa secret.

const isProduction = process.env.NODE_ENV === "production";

const serverSchema = z.object({
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  // Wajib di production; di development rate limit dilewati bila kosong.
  UPSTASH_REDIS_REST_URL: isProduction ? z.url() : z.url().optional().or(z.literal("")),
  UPSTASH_REDIS_REST_TOKEN: isProduction
    ? z.string().min(1)
    : z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Environment variable tidak valid atau kosong: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}


// Secret yang hanya dibutuhkan fitur tertentu. Dibaca saat dipakai supaya
// halaman lain tetap jalan walau secret itu belum diisi.
const optionalSecrets = {
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CARD_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().min(10),
  EMAIL_FROM: z.string().min(3),
  EMAIL_REPLY_TO: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^[0-9]+:[A-Za-z0-9_-]{30,}$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  VAPID_PUBLIC_KEY: z.string().min(40),
  VAPID_PRIVATE_KEY: z.string().min(20),
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:)/),
} as const;

type OptionalSecret = keyof typeof optionalSecrets;

/** Nilai secret, atau undefined bila kosong/tidak valid. */
export function optionalSecret(name: OptionalSecret): string | undefined {
  const parsed = optionalSecrets[name].safeParse(process.env[name] || undefined);
  return parsed.success ? parsed.data : undefined;
}

/** Nilai secret; melempar error yang jelas bila kosong. */
export function requireSecret(name: Exclude<OptionalSecret, "EMAIL_REPLY_TO">): string {
  const value = optionalSecret(name);
  if (!value) throw new Error(`${name} belum diisi atau tidak valid (lihat .env.example)`);
  return value;
}
