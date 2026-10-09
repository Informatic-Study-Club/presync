import { describe, expect, test } from "bun:test";
import { parseScannedCard, printedCardBarcode, signCardPayload } from "./token";

const SECRET = "s".repeat(32);
const OTHER_SECRET = "t".repeat(32);

describe("token kartu", () => {
  test("payload bertanda tangan berformat v1.<kode>.<versi>.<sig>", () => {
    const payload = signCardPayload(SECRET, "ISC2601009", 2);
    expect(payload).toMatch(/^v1\.ISC2601009\.2\.[A-Za-z0-9_-]{43}$/);
  });

  test("deterministik untuk input yang sama", () => {
    expect(signCardPayload(SECRET, "ISC2601009", 1)).toBe(
      signCardPayload(SECRET, "ISC2601009", 1),
    );
  });

  test("tanda tangan berbeda per versi dan per secret", () => {
    const a = signCardPayload(SECRET, "ISC2601009", 1);
    expect(signCardPayload(SECRET, "ISC2601009", 2).split(".")[3]).not.toBe(a.split(".")[3]);
    expect(signCardPayload(OTHER_SECRET, "ISC2601009", 1)).not.toBe(a);
  });

  test("menolak input tidak valid saat menandatangani", () => {
    expect(() => signCardPayload(SECRET, "ISC26", 1)).toThrow(RangeError);
    expect(() => signCardPayload(SECRET, "ISC2601009", 0)).toThrow(RangeError);
    expect(() => signCardPayload("pendek", "ISC2601009", 1)).toThrow();
  });

  test("kode polos dikenali sebagai kartu lama", () => {
    expect(parseScannedCard("ISC2601009", SECRET)).toEqual({
      kind: "legacy",
      memberCode: "ISC2601009",
    });
    expect(parseScannedCard("  ISC2601009\r\n", SECRET)).toEqual({
      kind: "legacy",
      memberCode: "ISC2601009",
    });
  });

  test("payload sah diverifikasi", () => {
    const payload = signCardPayload(SECRET, "ISC2601085", 3);
    expect(parseScannedCard(payload, SECRET)).toEqual({
      kind: "signed",
      memberCode: "ISC2601085",
      cardVersion: 3,
    });
  });

  test("payload dengan secret lain ditolak", () => {
    const payload = signCardPayload(OTHER_SECRET, "ISC2601085", 1);
    expect(parseScannedCard(payload, SECRET)).toEqual({ kind: "invalid", reason: "signature" });
  });

  test("payload yang diubah ditolak", () => {
    const payload = signCardPayload(SECRET, "ISC2601085", 1);
    const [v, , version, sig] = payload.split(".");
    expect(parseScannedCard(`${v}.ISC2601086.${version}.${sig}`, SECRET)).toEqual({
      kind: "invalid",
      reason: "signature",
    });
    expect(parseScannedCard(`${v}.ISC2601085.2.${sig}`, SECRET)).toEqual({
      kind: "invalid",
      reason: "signature",
    });
  });

  test("format asing ditolak", () => {
    for (const input of ["", "hello", "v2.ISC2601085.1.abc", "v1.ISC2601085.0.x", "isc2601009"]) {
      expect(parseScannedCard(input, SECRET).kind).toBe("invalid");
    }
  });
});

describe("format barcode kartu cetak", () => {
  test("kartu lama memakai Code 128 kode polos", () => {
    expect(
      printedCardBarcode({ memberCode: "ISC2601009", cardVersion: 1, legacyCardAllowed: true }, undefined),
    ).toEqual({ symbology: "code128", text: "ISC2601009" });
  });

  test("kartu pengganti memakai QR bertanda tangan", () => {
    const barcode = printedCardBarcode(
      { memberCode: "ISC2601009", cardVersion: 2, legacyCardAllowed: false },
      SECRET,
    );
    expect(barcode.symbology).toBe("qrcode");
    expect(parseScannedCard(barcode.text, SECRET)).toEqual({
      kind: "signed",
      memberCode: "ISC2601009",
      cardVersion: 2,
    });
  });

  test("kartu pengganti tanpa secret gagal", () => {
    expect(() =>
      printedCardBarcode({ memberCode: "ISC2601009", cardVersion: 2, legacyCardAllowed: false }, undefined),
    ).toThrow();
  });
});
