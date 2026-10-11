import { describe, expect, test } from "bun:test";
import { diffProfile, type EditableProfile, profileChangeError, profileUpdateSchema } from "./profile";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const DIV = "33333333-3333-4333-8333-333333333333";

const base: EditableProfile = {
  fullName: "Budi Santoso",
  email: "budi@contoh.com",
  phone: "+6281234567890",
  divisionId: DIV,
  status: "aktif",
};

function input(overrides: Record<string, string> = {}) {
  return {
    memberId: MEMBER,
    fullName: "Budi Santoso",
    email: "budi@contoh.com",
    phone: "081234567890",
    divisionId: DIV,
    status: "aktif",
    ...overrides,
  };
}

describe("profileUpdateSchema", () => {
  test("menormalkan nama, email, dan nomor HP", () => {
    const r = profileUpdateSchema.parse(
      input({ fullName: "  Budi   Santoso ", email: " Budi@Contoh.COM ", phone: "0812-3456-7890" }),
    );
    expect(r.fullName).toBe("Budi Santoso");
    expect(r.email).toBe("budi@contoh.com");
    expect(r.phone).toBe("+6281234567890");
    expect(r.note).toBe("");
  });

  test.each([
    ["fullName", "   "],
    ["email", "bukan-email"],
    ["phone", "021123456"],
    ["divisionId", ""],
    ["status", "keluar"],
  ])("menolak %s tidak valid", (field, value) => {
    expect(profileUpdateSchema.safeParse(input({ [field]: value })).success).toBe(false);
  });
});

describe("diffProfile", () => {
  test("tanpa perubahan", () => {
    expect(diffProfile(base, { ...base })).toEqual([]);
  });

  test("mencatat field yang berubah beserta nilai lama dan baru", () => {
    expect(diffProfile(base, { ...base, phone: "+6289999999999", status: "alumni" })).toEqual([
      { field: "phone", from: "+6281234567890", to: "+6289999999999" },
      { field: "status", from: "aktif", to: "alumni" },
    ]);
  });
});

describe("profileChangeError", () => {
  const nameChange = diffProfile(base, { ...base, fullName: "Budi S." });
  const statusChange = diffProfile(base, { ...base, status: "nonaktif" });
  const emailChange = diffProfile(base, { ...base, email: "baru@contoh.com" });

  test("tidak ada perubahan ditolak", () => {
    expect(profileChangeError(ADMIN, MEMBER, [], "")).not.toBeNull();
  });

  test("ubah nama tidak wajib catatan", () => {
    expect(profileChangeError(ADMIN, MEMBER, nameChange, "")).toBeNull();
  });

  test("ubah status dan email wajib catatan", () => {
    expect(profileChangeError(ADMIN, MEMBER, statusChange, "")).not.toBeNull();
    expect(profileChangeError(ADMIN, MEMBER, emailChange, "ok")).not.toBeNull();
    expect(profileChangeError(ADMIN, MEMBER, statusChange, "Lulus 2026")).toBeNull();
    expect(profileChangeError(ADMIN, MEMBER, emailChange, "Ganti email kampus")).toBeNull();
  });

  test("admin tidak bisa mengubah status akunnya sendiri", () => {
    expect(profileChangeError(MEMBER, MEMBER, statusChange, "alasan apa pun")).not.toBeNull();
    expect(profileChangeError(MEMBER, MEMBER, nameChange, "")).toBeNull();
  });
});
