import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { members, telegramLinks, telegramLinkTokens } from "@/db/schema";
import { optionalSecret } from "@/lib/env";
import { id as t } from "@/messages/id";
import { sendTelegramMessage } from "./telegram-adapter";
import { isStopCommand, parseStartCommand } from "./webhooks";

// Penautan akun Telegram lewat tautan sekali pakai (docs/ARSITEKTUR.md bagian 12).

const TOKEN_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function telegramConfigured(): boolean {
  return Boolean(optionalSecret("TELEGRAM_BOT_TOKEN") && optionalSecret("TELEGRAM_BOT_USERNAME"));
}

/** Tautan t.me/<bot>?start=<token>; token asli tidak disimpan. */
export async function createLinkToken(memberId: string): Promise<string | null> {
  const username = optionalSecret("TELEGRAM_BOT_USERNAME");
  if (!username) return null;
  const token = randomBytes(24).toString("base64url");
  const db = getDb();
  // Token lama yang belum terpakai tidak berlaku lagi.
  await db.delete(telegramLinkTokens).where(and(eq(telegramLinkTokens.memberId, memberId), isNull(telegramLinkTokens.usedAt)));
  await db.insert(telegramLinkTokens).values({
    tokenHash: hashToken(token),
    memberId,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return `https://t.me/${username}?start=${token}`;
}

export async function unlinkTelegram(memberId: string) {
  await getDb().delete(telegramLinks).where(eq(telegramLinks.memberId, memberId));
}

const updateSchema = z.object({
  message: z
    .object({
      chat: z.object({ id: z.number().int(), type: z.string() }),
      text: z.string().max(4096).optional(),
    })
    .optional(),
});

async function linkWithToken(chatId: number, token: string): Promise<string> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(telegramLinkTokens)
      .where(
        and(
          eq(telegramLinkTokens.tokenHash, hashToken(token)),
          isNull(telegramLinkTokens.usedAt),
          gt(telegramLinkTokens.expiresAt, new Date()),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) return t.notifications.telegram.replyInvalid;
    const [member] = await tx
      .select({ fullName: members.fullName, status: members.status })
      .from(members)
      .where(eq(members.id, row.memberId))
      .limit(1);
    if (!member || member.status !== "aktif") return t.notifications.telegram.replyInvalid;

    await tx.update(telegramLinkTokens).set({ usedAt: new Date() }).where(eq(telegramLinkTokens.tokenHash, row.tokenHash));
    // Satu chat untuk satu anggota: lepas tautan lama di kedua sisi.
    await tx.delete(telegramLinks).where(eq(telegramLinks.chatId, chatId));
    await tx
      .insert(telegramLinks)
      .values({ memberId: row.memberId, chatId })
      .onConflictDoUpdate({ target: telegramLinks.memberId, set: { chatId, linkedAt: new Date() } });
    return t.notifications.telegram.replyLinked(member.fullName);
  });
}

/** Proses satu update dari webhook bot. Hanya chat pribadi yang dilayani. */
export async function handleTelegramUpdate(body: unknown): Promise<void> {
  const parsed = updateSchema.safeParse(body);
  const message = parsed.success ? parsed.data.message : undefined;
  if (!message || message.chat.type !== "private") return;
  const chatId = message.chat.id;

  let reply: string;
  const token = parseStartCommand(message.text);
  if (token) {
    reply = await linkWithToken(chatId, token);
  } else if (isStopCommand(message.text)) {
    await getDb().delete(telegramLinks).where(eq(telegramLinks.chatId, chatId));
    reply = t.notifications.telegram.replyUnlinked;
  } else {
    reply = t.notifications.telegram.replyHelp;
  }
  await sendTelegramMessage(chatId, reply);
}
