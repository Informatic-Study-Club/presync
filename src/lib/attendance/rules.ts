import type { ScannedCard } from "@/lib/cards/token";

// Aturan presensi sebagai fungsi murni (docs/ARSITEKTUR.md bagian 9).

const MINUTE = 60_000;

/** Pemindaian dibuka 60 menit sebelum mulai sampai 60 menit setelah selesai. */
export const SCAN_WINDOW = { beforeMin: 60, afterMin: 60 };
/** Check-in online dibuka 15 menit sebelum mulai sampai sesi selesai. */
export const CHECKIN_WINDOW = { beforeMin: 15, afterMin: 0 };

export type SessionForAttendance = {
  status: "scheduled" | "done" | "off";
  kind: "regular" | "extra" | "activity";
  mode: "offline" | "online" | "hybrid";
  startsAt: Date;
  endsAt: Date;
  classId: string | null;
  divisionId: string | null;
};

export type WindowState = "open" | "not_yet" | "closed";

export function windowState(
  session: Pick<SessionForAttendance, "startsAt" | "endsAt">,
  now: Date,
  window: { beforeMin: number; afterMin: number },
): WindowState {
  if (now.getTime() < session.startsAt.getTime() - window.beforeMin * MINUTE) return "not_yet";
  if (now.getTime() > session.endsAt.getTime() + window.afterMin * MINUTE) return "closed";
  return "open";
}

export type MemberForAttendance = {
  id: string;
  status: "aktif" | "nonaktif" | "alumni";
  divisionId: string;
  cardVersion: number;
  legacyCardAllowed: boolean;
  cardStatus: "active" | "blocked";
};

/** Kelas rutin/tambahan: harus terdaftar. Kegiatan: sesuai cakupan divisi. */
export function isEligible(
  session: Pick<SessionForAttendance, "kind" | "divisionId">,
  member: Pick<MemberForAttendance, "divisionId">,
  enrolled: boolean,
): boolean {
  if (session.kind === "activity") {
    return session.divisionId === null || session.divisionId === member.divisionId;
  }
  return enrolled;
}

export type ScanRejection =
  | "session_off"
  | "session_not_open"
  | "session_closed"
  | "invalid_format"
  | "invalid_signature"
  | "unknown_card"
  | "card_outdated"
  | "legacy_not_allowed"
  | "card_blocked"
  | "member_inactive"
  | "not_eligible";

export type ScanSource = "camera" | "scanner" | "typed";

export type ScanEvaluation =
  | { ok: true; method: "scan_barcode" | "scan_qr" | "manual_entry" }
  | { ok: false; reason: ScanRejection };

/**
 * Semua pemeriksaan scan kartu selain hak pemindai (dicek terpisah dengan
 * can()) dan duplikat (ditangani unique constraint di transaksi).
 */
export function evaluateScan(input: {
  card: ScannedCard;
  member: MemberForAttendance | null;
  session: SessionForAttendance;
  enrolled: boolean;
  source: ScanSource;
  now: Date;
}): ScanEvaluation {
  const { card, member, session } = input;
  if (session.status === "off") return { ok: false, reason: "session_off" };
  const state = windowState(session, input.now, SCAN_WINDOW);
  if (state === "not_yet") return { ok: false, reason: "session_not_open" };
  if (state === "closed") return { ok: false, reason: "session_closed" };

  if (card.kind === "invalid") {
    return { ok: false, reason: card.reason === "signature" ? "invalid_signature" : "invalid_format" };
  }
  if (!member) return { ok: false, reason: "unknown_card" };
  if (card.kind === "signed" && card.cardVersion !== member.cardVersion) {
    return { ok: false, reason: "card_outdated" };
  }
  if (card.kind === "legacy" && !member.legacyCardAllowed) {
    return { ok: false, reason: "legacy_not_allowed" };
  }
  if (member.cardStatus !== "active") return { ok: false, reason: "card_blocked" };
  if (member.status !== "aktif") return { ok: false, reason: "member_inactive" };
  if (!isEligible(session, member, input.enrolled)) return { ok: false, reason: "not_eligible" };

  const method =
    input.source === "typed" ? "manual_entry" : card.kind === "signed" ? "scan_qr" : "scan_barcode";
  return { ok: true, method };
}

export type CheckinRejection =
  | "session_off"
  | "not_online"
  | "session_not_open"
  | "session_closed"
  | "member_inactive"
  | "not_eligible";

export function evaluateSelfCheckin(input: {
  member: Pick<MemberForAttendance, "status" | "divisionId">;
  session: SessionForAttendance;
  enrolled: boolean;
  now: Date;
}): { ok: true } | { ok: false; reason: CheckinRejection } {
  const { session } = input;
  if (session.status === "off") return { ok: false, reason: "session_off" };
  if (session.mode === "offline") return { ok: false, reason: "not_online" };
  const state = windowState(session, input.now, CHECKIN_WINDOW);
  if (state === "not_yet") return { ok: false, reason: "session_not_open" };
  if (state === "closed") return { ok: false, reason: "session_closed" };
  if (input.member.status !== "aktif") return { ok: false, reason: "member_inactive" };
  if (!isEligible(session, input.member, input.enrolled)) return { ok: false, reason: "not_eligible" };
  return { ok: true };
}

// ---------------------------------------------------------------- kode check-in

/** Tanpa karakter yang mudah tertukar (I, L, O, 0, 1). */
export const CHECKIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CHECKIN_LENGTH = 6;

export function checkinCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < CHECKIN_LENGTH) throw new RangeError("Byte acak kurang");
  let code = "";
  for (let i = 0; i < CHECKIN_LENGTH; i++) {
    code += CHECKIN_ALPHABET[(bytes[i] as number) % CHECKIN_ALPHABET.length];
  }
  return code;
}

export function normalizeCheckinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CHECKIN_LENGTH) return null;
  return [...code].every((c) => CHECKIN_ALPHABET.includes(c)) ? code : null;
}

// ---------------------------------------------------------------- sumber input pemindai

/**
 * Pemindai USB/Bluetooth "mengetik" seluruh kode dalam hitungan milidetik.
 * Rata-rata jeda antartombol di bawah ambang dianggap pemindai.
 */
export function inferKeyboardSource(keyTimestamps: readonly number[], thresholdMs = 35): "scanner" | "typed" {
  if (keyTimestamps.length < 4) return "typed";
  const first = keyTimestamps[0] as number;
  const last = keyTimestamps[keyTimestamps.length - 1] as number;
  const average = (last - first) / (keyTimestamps.length - 1);
  return average <= thresholdMs ? "scanner" : "typed";
}
