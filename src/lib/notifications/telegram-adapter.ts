import "server-only";
import { requireSecret } from "@/lib/env";

// Adapter kanal Telegram (Bot API). Hanya dipanggil worker outbox dan webhook bot.

export class TelegramSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** Pengguna memblokir bot atau chat tidak ada lagi: tautan perlu diputus. */
    readonly gone: boolean,
  ) {
    super(message);
    this.name = "TelegramSendError";
  }
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const token = requireSecret("TELEGRAM_BOT_TOKEN");
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new TelegramSendError(`Gagal menghubungi Telegram: ${String(err)}`, true, false);
  }
  if (res.ok) return;
  const body = (await res.text()).slice(0, 300);
  const gone = res.status === 403 || (res.status === 400 && /chat not found/i.test(body));
  throw new TelegramSendError(`Telegram HTTP ${res.status}: ${body}`, res.status === 429 || res.status >= 500, gone);
}
