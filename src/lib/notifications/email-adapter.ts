import "server-only";
import { z } from "zod";
import { optionalSecret, requireSecret } from "@/lib/env";
import type { EmailContent } from "./templates";

// Adapter kanal email lewat API Resend. Kode fitur tidak memanggil ini
// langsung; hanya worker outbox (aturan wajib 13).

const RESEND_URL = "https://api.resend.com/emails";
const responseSchema = z.object({ id: z.string() });

export class EmailSendError extends Error {
  constructor(
    message: string,
    /** false untuk kesalahan permanen (misalnya alamat ditolak). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

export async function sendEmail(input: {
  to: string;
  content: EmailContent;
  idempotencyKey: string;
}): Promise<{ providerMessageId: string }> {
  const replyTo = optionalSecret("EMAIL_REPLY_TO");
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireSecret("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: requireSecret("EMAIL_FROM"),
        to: [input.to],
        subject: input.content.subject,
        html: input.content.html,
        text: input.content.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new EmailSendError(`Gagal menghubungi Resend: ${String(err)}`, true);
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    // 429 dan 5xx bisa dicoba lagi; 4xx lain umumnya permanen.
    const retryable = res.status === 429 || res.status >= 500;
    throw new EmailSendError(`Resend HTTP ${res.status}: ${body}`, retryable);
  }
  const parsed = responseSchema.safeParse(await res.json());
  if (!parsed.success) throw new EmailSendError("Respons Resend tidak dikenal", true);
  return { providerMessageId: parsed.data.id };
}
