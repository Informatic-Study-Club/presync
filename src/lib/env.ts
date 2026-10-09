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

