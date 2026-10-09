import { describe, expect, test } from "bun:test";
import {
  ACTIVATION_DAILY_CAP,
  EMAIL_DAILY_CAP,
  jakartaDayStart,
  retryDelayMs,
  selectEmailBatch,
} from "./schedule";
import { activationEmail, escapeHtml } from "./templates";

describe("jakartaDayStart", () => {
  test("00:00 WIB = 17:00 UTC hari sebelumnya", () => {
    expect(jakartaDayStart(new Date("2026-10-09T10:00:00Z")).toISOString()).toBe(
      "2026-10-08T17:00:00.000Z",
    );
  });
  test("lewat tengah malam WIB sudah hari baru", () => {
    expect(jakartaDayStart(new Date("2026-10-09T17:30:00Z")).toISOString()).toBe(
      "2026-10-09T17:00:00.000Z",
    );
  });
});

describe("retryDelayMs", () => {
  test("eksponensial dengan batas 24 jam", () => {
    expect(retryDelayMs(1)).toBe(15 * 60_000);
    expect(retryDelayMs(2)).toBe(30 * 60_000);
    expect(retryDelayMs(3)).toBe(60 * 60_000);
    expect(retryDelayMs(20)).toBe(24 * 60 * 60_000);
  });
});

describe("selectEmailBatch", () => {
  const queue = (n: number, template: string, start = 1) =>
    Array.from({ length: n }, (_, i) => ({ id: start + i, template }));

  test("undangan dibatasi 40 per hari", () => {
    const ids = selectEmailBatch(queue(85, "activation"), { sentToday: 0, activationSentToday: 0 });
    expect(ids).toHaveLength(ACTIVATION_DAILY_CAP);
    expect(ids[0]).toBe(1);
  });

  test("total dibatasi 80 per hari, email lain didahulukan", () => {
    const ids = selectEmailBatch(
      [...queue(30, "activation", 1), ...queue(60, "payment", 100)],
      { sentToday: 0, activationSentToday: 0 },
    );
    expect(ids).toHaveLength(EMAIL_DAILY_CAP);
    expect(ids.slice(0, 60)).toEqual(queue(60, "payment", 100).map((q) => q.id));
    expect(ids.slice(60)).toHaveLength(20);
  });

  test("memperhitungkan yang sudah terkirim hari ini", () => {
    expect(selectEmailBatch(queue(10, "activation"), { sentToday: 75, activationSentToday: 0 })).toHaveLength(5);
    expect(selectEmailBatch(queue(10, "activation"), { sentToday: 40, activationSentToday: 40 })).toEqual([]);
    expect(selectEmailBatch(queue(10, "x"), { sentToday: 90, activationSentToday: 0 })).toEqual([]);
  });
});

describe("template email aktivasi", () => {
  test("escape HTML", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  test("nama dan tautan di-escape di HTML, utuh di teks", () => {
    const email = activationEmail({ name: "Budi <b>", link: "https://x.test/a?b=1&c=2" });
    expect(email.html).toContain("Budi &lt;b&gt;");
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain('href="https://x.test/a?b=1&amp;c=2"');
    expect(email.text).toContain("https://x.test/a?b=1&c=2");
    expect(email.subject).toBe("Aktivasi akun Presync ISC");
  });
});
