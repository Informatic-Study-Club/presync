import { describe, expect, test } from "bun:test";
import {
  balanceOf,
  canCloseMonth,
  checkReversal,
  type FeeSchedule,
  type LedgerEntry,
  monthlyStatement,
  planInvoices,
  previousMonth,
} from "./ledger";
import { formatRupiah, parseRupiah } from "./money";

describe("rupiah", () => {
  test.each([
    ["50000", 50000],
    ["50.000", 50000],
    ["Rp 50.000", 50000],
    ["rp1.250.000", 1250000],
  ])("parse %p", (input, expected) => {
    expect(parseRupiah(input)).toBe(expected);
  });

  test.each([["0"], ["-5000"], ["50.000,50"], ["abc"], [""], ["2000000000"]])("tolak %p", (input) => {
    expect(parseRupiah(input)).toBeNull();
  });

  test("format id-ID tanpa desimal", () => {
    expect(formatRupiah(1250000).replace(/\s/g, " ")).toMatch(/^Rp\s?1\.250\.000$/);
  });
});

describe("tagihan dari jadwal iuran", () => {
  const monthly: FeeSchedule = {
    id: "f1",
    name: "Iuran bulanan",
    amount: 10000,
    period: "monthly",
    dueDay: 10,
    dueOn: null,
    divisionId: null,
    batch: null,
  };
  const members = [
    { id: "a", divisionId: "web", batch: "01", status: "aktif" as const },
    { id: "b", divisionId: "ml", batch: "01", status: "aktif" as const },
    { id: "c", divisionId: "web", batch: "02", status: "aktif" as const },
    { id: "d", divisionId: "web", batch: "01", status: "alumni" as const },
  ];

  test("bulanan untuk semua anggota aktif", () => {
    const planned = planInvoices(monthly, "2026-10", members, new Set());
    expect(planned.map((p) => p.memberId)).toEqual(["a", "b", "c"]);
    expect(planned[0]).toEqual({
      memberId: "a",
      period: "2026-10",
      title: "Iuran bulanan 2026-10",
      amount: 10000,
      dueOn: "2026-10-10",
    });
  });

  test("cakupan divisi dan batch, serta tidak menagih dua kali", () => {
    const planned = planInvoices({ ...monthly, divisionId: "web", batch: "01" }, "2026-10", members, new Set());
    expect(planned.map((p) => p.memberId)).toEqual(["a"]);
    expect(planInvoices(monthly, "2026-10", members, new Set(["a", "b"])).map((p) => p.memberId)).toEqual(["c"]);
  });

  test("iuran sekali bayar memakai periode tetap", () => {
    const once: FeeSchedule = { ...monthly, period: "once", dueDay: null, dueOn: "2026-11-30", name: "Kaos ISC" };
    const planned = planInvoices(once, "2026-10", members, new Set());
    expect(planned[0]).toMatchObject({ period: "sekali", dueOn: "2026-11-30", title: "Kaos ISC" });
  });

  test("bulan tidak valid", () => {
    expect(() => planInvoices(monthly, "2026-13", members, new Set())).toThrow(RangeError);
  });
});

describe("laporan bulanan dan saldo", () => {
  const entries: LedgerEntry[] = [
    { id: "1", occurredOn: "2026-09-20", kind: "income", amount: 100000, reversalOf: null },
    { id: "2", occurredOn: "2026-10-05", kind: "income", amount: 50000, reversalOf: null },
    { id: "3", occurredOn: "2026-10-06", kind: "expense", amount: 20000, reversalOf: null },
    { id: "4", occurredOn: "2026-10-31", kind: "expense", amount: 5000, reversalOf: null },
    { id: "5", occurredOn: "2026-11-02", kind: "income", amount: 20000, reversalOf: "3" },
  ];

  test("saldo awal dari bulan-bulan sebelumnya", () => {
    expect(monthlyStatement(entries, "2026-10")).toEqual({
      month: "2026-10",
      opening: 100000,
      income: 50000,
      expense: 25000,
      closing: 125000,
      entries: 3,
    });
  });

  test("koreksi di bulan berikutnya menetralkan transaksi asal", () => {
    expect(monthlyStatement(entries, "2026-11")).toMatchObject({ opening: 125000, income: 20000, closing: 145000 });
    expect(balanceOf(entries)).toBe(145000);
  });

  test("saldo akhir satu bulan = saldo awal bulan berikutnya", () => {
    expect(monthlyStatement(entries, "2026-10").closing).toBe(monthlyStatement(entries, "2026-11").opening);
  });

  test("bulan sebelumnya", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });
});

describe("koreksi ledger", () => {
  const income: LedgerEntry = { id: "x", occurredOn: "2026-10-05", kind: "income", amount: 1000, reversalOf: null };

  test("koreksi berjenis kebalikan", () => {
    expect(checkReversal(income, new Set(), "2026-11-01", new Set())).toEqual({ ok: true, kind: "expense" });
    expect(checkReversal({ ...income, kind: "expense" }, new Set(), "2026-11-01", new Set())).toEqual({ ok: true, kind: "income" });
  });

  test("koreksi tidak bisa dikoreksi, tidak boleh dua kali, tidak di bulan tertutup", () => {
    expect(checkReversal({ ...income, reversalOf: "y" }, new Set(), "2026-11-01", new Set())).toEqual({ ok: false, reason: "is_reversal" });
    expect(checkReversal(income, new Set(["x"]), "2026-11-01", new Set())).toEqual({ ok: false, reason: "already_reversed" });
    expect(checkReversal(income, new Set(), "2026-11-01", new Set(["2026-11"]))).toEqual({ ok: false, reason: "closed_month" });
  });
});

describe("tutup bulan", () => {
  test("berurutan dan tidak untuk bulan mendatang", () => {
    expect(canCloseMonth("2026-09", new Set(), "2026-09", "2026-10")).toEqual({ ok: true });
    expect(canCloseMonth("2026-10", new Set(), "2026-09", "2026-10")).toEqual({ ok: false, reason: "previous_open" });
    expect(canCloseMonth("2026-10", new Set(["2026-09"]), "2026-09", "2026-10")).toEqual({ ok: true });
    expect(canCloseMonth("2026-10", new Set(["2026-10"]), "2026-09", "2026-10")).toEqual({ ok: false, reason: "already_closed" });
    expect(canCloseMonth("2026-11", new Set(["2026-09", "2026-10"]), "2026-09", "2026-10")).toEqual({ ok: false, reason: "future_month" });
  });

  test("bulan sebelum transaksi pertama tidak perlu ditutup", () => {
    expect(canCloseMonth("2026-09", new Set(), null, "2026-10")).toEqual({ ok: true });
  });
});

describe("bukti transfer", () => {
  test("jenis file dari magic bytes", async () => {
    const { detectProofType, proofObjectPath } = await import("./proof");
    expect(detectProofType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(detectProofType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(detectProofType(new TextEncoder().encode("RIFF1234WEBPVP8 "))?.ext).toBe("webp");
    expect(detectProofType(new TextEncoder().encode("%PDF-1.7"))?.ext).toBe("pdf");
    expect(detectProofType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectProofType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(proofObjectPath("m", "i", "f", "png")).toBe("m/i/f.png");
  });
});
