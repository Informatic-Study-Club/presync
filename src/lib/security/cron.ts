import "server-only";
import { optionalSecret } from "@/lib/env";
import { safeEqual } from "@/lib/notifications/webhooks";

/** Endpoint cron: header Authorization: Bearer <CRON_SECRET> (dikirim otomatis oleh Vercel Cron). */
export function isAuthorizedCron(request: Request): boolean {
  const secret = optionalSecret("CRON_SECRET");
  const header = request.headers.get("authorization");
  return Boolean(secret && header && safeEqual(header, `Bearer ${secret}`));
}
