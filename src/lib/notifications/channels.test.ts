import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { DEFAULT_PREFERENCES, resolveChannels } from "./channels";
import { isDigestDay, isExpired, reminderKey, selectSessionsForReminder } from "./reminders";
import { arrearsTelegram, reminderEmail, reminderPush, reminderTelegram } from "./templates";
import { isStopCommand, parseStartCommand, safeEqual, verifySvixSignature } from "./webhooks";

const all = { telegramLinked: true, pushSubscribed: true, emailSuppressed: false };

describe("pemilihan kanal", () => {
  test("bawaan: pengingat sesi tanpa email", () => {
    expect(resolveChannels("session_reminder", null, all)).toEqual(["telegram", "push"]);
    expect(DEFAULT_PREFERENCES.session_reminder.email).toBe(false);
  });

  test("hanya kanal yang tersedia", () => {
    expect(resolveChannels("session_reminder", null, { ...all, telegramLinked: false })).toEqual(["push"]);
    expect(resolveChannels("session_reminder", null, { ...all, telegramLinked: false, pushSubscribed: false })).toEqual([]);
  });

  test("preferensi anggota dan daftar bounce/spam", () => {
    const prefs = { email: true, telegram: false, push: true };
    expect(resolveChannels("finance", prefs, all)).toEqual(["email", "push"]);
    expect(resolveChannels("finance", prefs, { ...all, emailSuppressed: true })).toEqual(["push"]);
  });
});

describe("pemilihan sesi untuk pengingat", () => {
  const now = new Date("2026-10-14T03:00:00Z"); // Rabu 10:00 WIB
  const sessions = [
    { id: "kamis", status: "scheduled" as const, startsAt: new Date("2026-10-15T08:30:00Z") },
    { id: "kamis-off", status: "off" as const, startsAt: new Date("2026-10-15T09:00:00Z") },
    { id: "kamis-dini", status: "scheduled" as const, startsAt: new Date("2026-10-14T17:30:00Z") }, // Kamis 00:30 WIB
    { id: "jumat", status: "scheduled" as const, startsAt: new Date("2026-10-16T08:30:00Z") },
    { id: "satu-jam", status: "scheduled" as const, startsAt: new Date("2026-10-14T04:00:00Z") },
    { id: "terlalu-dekat", status: "scheduled" as const, startsAt: new Date("2026-10-14T03:30:00Z") },
  ];

  test("H-1 memakai tanggal WIB besok, sesi libur dilewati", () => {
    expect(selectSessionsForReminder(sessions, "h1", now).map((s) => s.id)).toEqual(["kamis", "kamis-dini"]);
  });

  test("1 jam sebelum: mulai 45-75 menit lagi", () => {
    expect(selectSessionsForReminder(sessions, "1h", now).map((s) => s.id)).toEqual(["satu-jam"]);
  });

  test("kunci idempotensi dan kedaluwarsa", () => {
    expect(reminderKey("h1", "s", "m")).toBe("reminder:h1:s:m");
    expect(isExpired({ expiresAt: "2026-10-14T02:00:00Z" }, now)).toBe(true);
    expect(isExpired({ expiresAt: "2026-10-14T04:00:00Z" }, now)).toBe(false);
    expect(isExpired({}, now)).toBe(false);
  });

  test("digest tiap Senin WIB", () => {
    expect(isDigestDay(new Date("2026-10-12T01:00:00Z"))).toBe(true);
    expect(isDigestDay(new Date("2026-10-11T18:00:00Z"))).toBe(true); // Senin 01:00 WIB
    expect(isDigestDay(new Date("2026-10-13T01:00:00Z"))).toBe(false);
  });
});

describe("webhook Svix (Resend)", () => {
  const secretBytes = Buffer.from("rahasia-uji-webhook-resend-32byte");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.c"] } });
  const now = new Date("2026-10-14T03:00:00Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const sig = createHmac("sha256", secretBytes).update(`msg_1.${timestamp}.${body}`).digest("base64");

  test("tanda tangan sah diterima, termasuk di antara beberapa versi", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp, signature: `v1,${sig}`, body, now })).toBe(true);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp, signature: `v1,AAAA v1,${sig}`, body, now })).toBe(true);
  });

  test("isi diubah, secret lain, atau header hilang ditolak", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp, signature: `v1,${sig}`, body: `${body} `, now })).toBe(false);
    expect(verifySvixSignature({ secret: "whsec_bGFpbg==", id: "msg_1", timestamp, signature: `v1,${sig}`, body, now })).toBe(false);
    expect(verifySvixSignature({ secret, id: null, timestamp, signature: `v1,${sig}`, body, now })).toBe(false);
  });

  test("timestamp lama (replay) ditolak", () => {
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp, signature: `v1,${sig}`, body, now: later })).toBe(false);
  });

  test("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("perintah bot Telegram", () => {
  test("/start dengan token", () => {
    expect(parseStartCommand("/start abcdefghijklmnopqrstuvwxyz012345")).toBe("abcdefghijklmnopqrstuvwxyz012345");
    expect(parseStartCommand("/start@PresyncBot abcdefghijklmnop_-12")).toBe("abcdefghijklmnop_-12");
    expect(parseStartCommand("/start")).toBeNull();
    expect(parseStartCommand("/start pendek")).toBeNull();
    expect(parseStartCommand("halo")).toBeNull();
    expect(parseStartCommand(undefined)).toBeNull();
  });

  test("/stop dan /berhenti", () => {
    expect(isStopCommand("/stop")).toBe(true);
    expect(isStopCommand("/berhenti")).toBe(true);
    expect(isStopCommand("/start x")).toBe(false);
  });
});

describe("template pengingat dan tunggakan", () => {
  const payload = {
    kind: "h1" as const,
    title: "Web Dev #3",
    startsAt: "2026-10-15T08:30:00Z",
    location: "Lab <3>",
    meetingUrl: null,
    url: "https://presync.test/kalender",
  };

  test("isi sama di semua kanal, HTML di-escape", () => {
    expect(reminderEmail(payload).subject).toBe("Besok: Web Dev #3");
    expect(reminderEmail(payload).html).toContain("Lab &lt;3&gt;");
    expect(reminderTelegram(payload)).toContain("15.30");
    expect(reminderTelegram(payload)).toContain("Lab <3>");
    expect(reminderPush({ ...payload, kind: "1h" }).title).toBe("1 jam lagi: Web Dev #3");
  });

  test("digest tunggakan", () => {
    expect(arrearsTelegram({ count: 2, totalLabel: "Rp 20.000", url: "https://x.test/kas" })).toContain("2 tagihan");
  });
});
