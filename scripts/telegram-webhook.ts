// Memasang webhook bot Telegram ke APP_URL/api/webhooks/telegram dengan
// secret_token = TELEGRAM_WEBHOOK_SECRET. Jalankan sekali per lingkungan,
// dan ulangi setelah token bot dirotasi (SERAH-TERIMA bagian 6).
// Pemakaian: bun run telegram:webhook

import { requireEnv } from "./lib/db";

const token = requireEnv("TELEGRAM_BOT_TOKEN");
const url = `${requireEnv("APP_URL")}/api/webhooks/telegram`;
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: requireEnv("TELEGRAM_WEBHOOK_SECRET"),
    allowed_updates: ["message"],
    drop_pending_updates: true,
  }),
});
const body = (await res.json()) as { ok: boolean; description?: string };
if (body.ok) console.log(`Webhook Telegram terpasang ke ${url}`);
else {
  console.error(`Gagal memasang webhook: ${body.description ?? res.status}`);
  process.exitCode = 1;
}
