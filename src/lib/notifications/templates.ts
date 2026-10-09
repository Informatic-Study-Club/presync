import { id as t } from "@/messages/id";

export type EmailContent = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function activationEmail(input: { name: string; link: string }): EmailContent {
  const m = t.emails.activation;
  const link = escapeHtml(input.link);
  return {
    subject: m.subject,
    text: [m.greeting(input.name), "", m.body, "", `${m.action}: ${input.link}`, "", m.expiry, "", m.ignore].join("\n"),
    html: `<!doctype html><html lang="id"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(m.greeting(input.name))}</p>
<p>${escapeHtml(m.body)}</p>
<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#0369a1;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(m.action)}</a></p>
<p style="font-size:13px;color:#555">${escapeHtml(m.expiry)}</p>
<p style="font-size:13px;color:#555">${escapeHtml(m.ignore)}</p>
</body></html>`,
  };
}
