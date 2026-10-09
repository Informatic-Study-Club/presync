import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { emailSuppressions } from "@/db/schema";
import { optionalSecret } from "@/lib/env";
import { verifySvixSignature } from "@/lib/notifications/webhooks";

// Webhook Resend: alamat yang bounce atau melaporkan spam berhenti dikirimi
// (docs/ARSITEKTUR.md bagian 12). Tanda tangan Svix diverifikasi.

const eventSchema = z.object({
  type: z.string(),
  data: z.object({ to: z.array(z.string()).or(z.string()).optional() }).passthrough(),
});

const SUPPRESS = { "email.bounced": "bounce", "email.complained": "spam" } as const;

export async function POST(request: Request) {
  const secret = optionalSecret("RESEND_WEBHOOK_SECRET");
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const body = await request.text();
  const valid = verifySvixSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
    now: new Date(),
  });
  if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const parsed = eventSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return NextResponse.json({ ok: true });
  const reason = SUPPRESS[parsed.data.type as keyof typeof SUPPRESS];
  if (reason) {
    const to = parsed.data.data.to;
    const addresses = (Array.isArray(to) ? to : to ? [to] : []).map((a) => a.trim().toLowerCase()).filter(Boolean);
    if (addresses.length > 0) {
      await getDb()
        .insert(emailSuppressions)
        .values(addresses.map((email) => ({ email, reason })))
        .onConflictDoNothing();
    }
  }
  return NextResponse.json({ ok: true });
}
