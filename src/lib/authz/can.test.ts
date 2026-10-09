import { describe, expect, test } from "bun:test";
import {
  ACTIONS,
  type Action,
  assertCan,
  can,
  ForbiddenError,
  requiresTwoFactor,
  type Resource,
  type SessionUser,
} from "./index";

const SELF = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const DIV_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; // divisi yang dikoordinasi
const DIV_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const SCENARIOS = {
  own: { memberId: SELF, divisionId: DIV_A },
  sameDiv: { memberId: OTHER, divisionId: DIV_A },
  otherDiv: { memberId: OTHER, divisionId: DIV_B },
  arrears: { memberId: OTHER, divisionId: DIV_B, hasArrears: true },
  none: undefined,
} satisfies Record<string, Resource | undefined>;
type Scenario = keyof typeof SCENARIOS;
const ALL: Scenario[] = ["own", "sameDiv", "otherDiv", "arrears", "none"];

const USERS = {
  admin: { id: SELF, roles: ["anggota", "admin"], coordinatorDivisionIds: [] },
  koordinator: {
    id: SELF,
    roles: ["anggota", "koordinator"],
    coordinatorDivisionIds: [DIV_A],
  },
  bendahara: {
    id: SELF,
    roles: ["anggota", "bendahara"],
    coordinatorDivisionIds: [],
  },
  anggota: { id: SELF, roles: ["anggota"], coordinatorDivisionIds: [] },
} satisfies Record<string, SessionUser>;

type NonAdmin = Exclude<keyof typeof USERS, "admin">;

// Matriks harapan, ditulis manual dari tabel peran di docs/ARSITEKTUR.md
// bagian 4. Skenario yang tidak tercantum harus ditolak.
const EXPECTED: Record<Action, Record<NonAdmin, Scenario[]>> = {
  "member.list": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "member.read": { koordinator: ["own", "sameDiv"], bendahara: ["own"], anggota: ["own"] },
  "member.read_contact": { koordinator: ["own", "sameDiv"], bendahara: ["arrears"], anggota: [] },
  "member.update": { koordinator: [], bendahara: [], anggota: [] },
  "member.import": { koordinator: [], bendahara: [], anggota: [] },
  "member.invite": { koordinator: [], bendahara: [], anggota: [] },
  "role.manage": { koordinator: [], bendahara: [], anggota: [] },
  "division.manage": { koordinator: [], bendahara: [], anggota: [] },
  "audit.read": { koordinator: [], bendahara: [], anggota: [] },
  "card.view": { koordinator: ["own", "sameDiv"], bendahara: ["own"], anggota: ["own"] },
  "card.print": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "card.reissue": { koordinator: [], bendahara: [], anggota: [] },
  "card.block": { koordinator: [], bendahara: [], anggota: [] },
  "calendar.read": { koordinator: ALL, bendahara: ALL, anggota: ALL },
  "calendar.manage": { koordinator: [], bendahara: [], anggota: [] },
  "class.manage": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "session.manage": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "attendance.scan": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "attendance.manual": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "attendance.self_checkin": { koordinator: ["own"], bendahara: ["own"], anggota: ["own"] },
  "attendance.read": { koordinator: ["own", "sameDiv"], bendahara: ["own"], anggota: ["own"] },
  "assessment.manage": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "assessment.read": { koordinator: ["own", "sameDiv"], bendahara: ["own"], anggota: ["own"] },
  "certificate.override": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "report.attendance": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "report.members": { koordinator: ["own", "sameDiv"], bendahara: [], anggota: [] },
  "finance.read": { koordinator: [], bendahara: ALL, anggota: [] },
  "finance.manage": { koordinator: [], bendahara: ALL, anggota: [] },
  "finance.verify": { koordinator: [], bendahara: ALL, anggota: [] },
  "finance.report": { koordinator: [], bendahara: ALL, anggota: [] },
  "invoice.read": { koordinator: ["own"], bendahara: ALL, anggota: ["own"] },
  "payment.submit": { koordinator: ["own"], bendahara: ["own"], anggota: ["own"] },
  "notification.preferences": { koordinator: ["own"], bendahara: ["own"], anggota: ["own"] },
  "privacy.request": { koordinator: ["own"], bendahara: ["own"], anggota: ["own"] },
  "privacy.manage": { koordinator: [], bendahara: [], anggota: [] },
};

describe("can(): matriks peran × aksi × resource", () => {
  for (const action of ACTIONS) {
    for (const scenario of ALL) {
      test(`admin boleh ${action} (${scenario})`, () => {
        expect(can(USERS.admin, action, SCENARIOS[scenario])).toBe(true);
      });
    }
    for (const role of ["koordinator", "bendahara", "anggota"] as const) {
      for (const scenario of ALL) {
        const allowed = EXPECTED[action][role].includes(scenario);
        test(`${role} ${allowed ? "boleh" : "ditolak"} ${action} (${scenario})`, () => {
          expect(can(USERS[role], action, SCENARIOS[scenario])).toBe(allowed);
        });
      }
    }
  }
});

describe("can(): kasus khusus", () => {
  test("tanpa user selalu ditolak", () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action, SCENARIOS.own)).toBe(false);
    }
  });

  test("user tanpa peran selalu ditolak", () => {
    const user: SessionUser = { id: SELF, roles: [], coordinatorDivisionIds: [] };
    for (const action of ACTIONS) {
      expect(can(user, action, SCENARIOS.own)).toBe(false);
    }
  });

  test("koordinator tanpa divisionId pada resource ditolak", () => {
    expect(can(USERS.koordinator, "attendance.scan", { memberId: OTHER })).toBe(false);
  });

  test("peran koordinator saja tidak memberi izin milik sendiri", () => {
    const user: SessionUser = {
      id: SELF,
      roles: ["koordinator"],
      coordinatorDivisionIds: [DIV_A],
    };
    expect(can(user, "payment.submit", SCENARIOS.own)).toBe(false);
  });

  test("koordinator dua divisi berwenang di keduanya", () => {
    const user: SessionUser = {
      id: SELF,
      roles: ["anggota", "koordinator"],
      coordinatorDivisionIds: [DIV_A, DIV_B],
    };
    expect(can(user, "session.manage", SCENARIOS.sameDiv)).toBe(true);
    expect(can(user, "session.manage", SCENARIOS.otherDiv)).toBe(true);
  });

  test("peran gabungan koordinator + bendahara", () => {
    const user: SessionUser = {
      id: SELF,
      roles: ["anggota", "koordinator", "bendahara"],
      coordinatorDivisionIds: [DIV_A],
    };
    expect(can(user, "finance.verify")).toBe(true);
    expect(can(user, "attendance.scan", SCENARIOS.sameDiv)).toBe(true);
    expect(can(user, "attendance.scan", SCENARIOS.otherDiv)).toBe(false);
    expect(can(user, "member.read_contact", SCENARIOS.arrears)).toBe(true);
    expect(can(user, "role.manage")).toBe(false);
  });

  test("hasArrears false tidak membuka kontak untuk bendahara", () => {
    expect(
      can(USERS.bendahara, "member.read_contact", { ...SCENARIOS.otherDiv, hasArrears: false }),
    ).toBe(false);
  });
});

describe("requiresTwoFactor", () => {
  test("wajib untuk admin, koordinator, bendahara", () => {
    expect(requiresTwoFactor(USERS.admin)).toBe(true);
    expect(requiresTwoFactor(USERS.koordinator)).toBe(true);
    expect(requiresTwoFactor(USERS.bendahara)).toBe(true);
  });
  test("tidak wajib untuk anggota biasa", () => {
    expect(requiresTwoFactor(USERS.anggota)).toBe(false);
  });
});

describe("assertCan", () => {
  test("melempar ForbiddenError bila ditolak", () => {
    expect(() => assertCan(USERS.anggota, "role.manage")).toThrow(ForbiddenError);
  });
  test("tidak melempar bila diizinkan", () => {
    expect(() => assertCan(USERS.admin, "role.manage")).not.toThrow();
  });
});

describe("canInAnyDivision", () => {
  test("koordinator hanya berwenang bila divisinya ada di daftar", async () => {
    const { canInAnyDivision } = await import("./index");
    expect(canInAnyDivision(USERS.koordinator, "member.list", [DIV_B, DIV_A])).toBe(true);
    expect(canInAnyDivision(USERS.koordinator, "member.list", [DIV_B])).toBe(false);
    expect(canInAnyDivision(USERS.anggota, "member.list", [DIV_A, DIV_B])).toBe(false);
    expect(canInAnyDivision(USERS.admin, "member.list", [DIV_B])).toBe(true);
    expect(canInAnyDivision(USERS.admin, "member.list", [])).toBe(false);
  });
});
