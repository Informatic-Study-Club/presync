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

// ---------------------------------------------------------------- pesan per kanal

export type PushContent = { title: string; body: string; url: string };

export type ReminderPayload = {
  kind: "h1" | "1h";
  title: string;
  startsAt: string;
  location: string | null;
  meetingUrl: string | null;
  url: string;
};

const reminderTime = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

function reminderLines(p: ReminderPayload): { heading: string; lines: string[] } {
  const m = t.emails.reminder;
  return {
    heading: p.kind === "h1" ? m.headingTomorrow(p.title) : m.headingSoon(p.title),
    lines: [
      reminderTime.format(new Date(p.startsAt)),
      ...(p.location ? [`${m.location}: ${p.location}`] : []),
      ...(p.meetingUrl ? [`${m.meeting}: ${p.meetingUrl}`] : []),
    ],
  };
}

export function reminderEmail(p: ReminderPayload): EmailContent {
  const { heading, lines } = reminderLines(p);
  return {
    subject: heading,
    text: [heading, "", ...lines, "", p.url].join("\n"),
    html: `<!doctype html><html lang="id"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
<p><strong>${escapeHtml(heading)}</strong></p>
${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n")}
<p><a href="${escapeHtml(p.url)}">${escapeHtml(t.emails.reminder.open)}</a></p>
</body></html>`,
  };
}

export function reminderTelegram(p: ReminderPayload): string {
  const { heading, lines } = reminderLines(p);
  return [heading, ...lines, p.url].join("\n");
}

export function reminderPush(p: ReminderPayload): PushContent {
  const { heading, lines } = reminderLines(p);
  return { title: heading, body: lines.join(" · "), url: p.url };
}

export type ArrearsPayload = { count: number; totalLabel: string; url: string };

export function arrearsEmail(p: ArrearsPayload): EmailContent {
  const m = t.emails.arrears;
  const body = m.body(p.count, p.totalLabel);
  return {
    subject: m.subject,
    text: [body, "", p.url].join("\n"),
    html: `<!doctype html><html lang="id"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(p.url)}">${escapeHtml(m.open)}</a></p>
</body></html>`,
  };
}

export function arrearsTelegram(p: ArrearsPayload): string {
  return `${t.emails.arrears.body(p.count, p.totalLabel)}\n${p.url}`;
}

export function arrearsPush(p: ArrearsPayload): PushContent {
  return { title: t.emails.arrears.subject, body: t.emails.arrears.body(p.count, p.totalLabel), url: p.url };
}
