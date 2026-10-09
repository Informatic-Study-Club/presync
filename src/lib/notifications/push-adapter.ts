import "server-only";
import webpush from "web-push";
import { optionalSecret } from "@/lib/env";
import type { PushContent } from "./templates";

// Adapter web push (VAPID). Di iPhone hanya bekerja bila Presync ditambahkan
// ke Layar Utama (docs/ARSITEKTUR.md bagian 12).

let configured = false;

export function pushConfigured(): boolean {
  return Boolean(optionalSecret("VAPID_PUBLIC_KEY") && optionalSecret("VAPID_PRIVATE_KEY") && optionalSecret("VAPID_SUBJECT"));
}

function configure() {
  if (configured) return;
  const publicKey = optionalSecret("VAPID_PUBLIC_KEY");
  const privateKey = optionalSecret("VAPID_PRIVATE_KEY");
  const subject = optionalSecret("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID belum dikonfigurasi");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** "sent", atau "gone" bila langganan sudah tidak berlaku (hapus dari DB). */
export async function sendPush(target: PushTarget, content: PushContent): Promise<"sent" | "gone"> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(content),
      { TTL: 60 * 60, timeout: 10_000 },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    throw err;
  }
}
