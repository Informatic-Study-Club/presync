import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";

const BUCKETS = {
  login: { limit: 5, window: "5 m" },
  forgot: { limit: 3, window: "15 m" },
  mfa: { limit: 5, window: "5 m" },
} as const satisfies Record<string, { limit: number; window: `${number} ${"s" | "m" | "h"}` }>;

export type RateLimitBucket = keyof typeof BUCKETS;

let redis: Redis | null | undefined;
const limiters = new Map<RateLimitBucket, Ratelimit>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const env = serverEnv();
  redis =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
        })
      : null;
  return redis;
}

function getLimiter(bucket: RateLimitBucket, client: Redis): Ratelimit {
  let limiter = limiters.get(bucket);
  if (!limiter) {
    const { limit, window } = BUCKETS[bucket];
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `presync:${bucket}`,
    });
    limiters.set(bucket, limiter);
  }
  return limiter;
}

/**
 * true bila semua kunci masih di bawah batas. Tanpa Upstash (hanya mungkin
 * di development, karena env wajib di production) pemeriksaan dilewati.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  keys: string[],
): Promise<boolean> {
  const client = getRedis();
  if (!client) return true;
  const limiter = getLimiter(bucket, client);
  const results = await Promise.all(keys.map((key) => limiter.limit(key)));
  return results.every((r) => r.success);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
