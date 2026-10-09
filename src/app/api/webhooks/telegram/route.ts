import { NextResponse } from "next/server";
import { optionalSecret } from "@/lib/env";
import { handleTelegramUpdate } from "@/lib/notifications/telegram";
import { safeEqual } from "@/lib/notifications/webhooks";

// Webhook bot Telegram. Telegram mengirim header
// X-Telegram-Bot-Api-Secret-Token sesuai secret_token saat setWebhook
// (scripts/telegram-webhook.ts).
export async function POST(request: Request) {
  const secret = optionalSecret("TELEGRAM_WEBHOOK_SECRET");
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !header || !safeEqual(header, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await handleTelegramUpdate(await request.json());
  } catch (err) {
    // Tetap 200 agar Telegram tidak mengulang update yang sama terus-menerus.
    console.error("Webhook Telegram gagal", err);
  }
  return NextResponse.json({ ok: true });
}
