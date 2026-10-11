import { describe, expect, test } from "bun:test";
import { allowedHostnames, isTestSecret, isTurnstileValid } from "./turnstile-check";

const hostnames = allowedHostnames("https://presync-isc.vercel.app", true);
const real = { action: "login" as const, hostnames, testSecret: false };

describe("isTurnstileValid", () => {
  test("sukses dengan action dan hostname cocok", () => {
    expect(isTurnstileValid({ success: true, action: "login", hostname: "presync-isc.vercel.app" }, real)).toBe(true);
  });

  test("gagal dari Cloudflare selalu ditolak", () => {
    expect(isTurnstileValid({ success: false, action: "login", hostname: "presync-isc.vercel.app" }, real)).toBe(false);
  });

  test("token formulir lain ditolak", () => {
    expect(isTurnstileValid({ success: true, action: "lupa-password", hostname: "presync-isc.vercel.app" }, real)).toBe(false);
  });

  test("token dari situs lain atau tanpa hostname ditolak", () => {
    expect(isTurnstileValid({ success: true, action: "login", hostname: "evil.example" }, real)).toBe(false);
    expect(isTurnstileValid({ success: true, action: "login" }, real)).toBe(false);
  });

  test("secret uji hanya butuh success", () => {
    expect(isTurnstileValid({ success: true, action: "", hostname: "example.com" }, { ...real, testSecret: true })).toBe(true);
  });
});

describe("allowedHostnames dan isTestSecret", () => {
  test("localhost hanya di luar production", () => {
    expect(hostnames).toEqual(["presync-isc.vercel.app"]);
    expect(allowedHostnames("http://localhost:3001", false)).toEqual(["localhost", "localhost", "127.0.0.1"]);
  });

  test("mengenali secret uji Cloudflare", () => {
    expect(isTestSecret("1x0000000000000000000000000000000AA")).toBe(true);
    expect(isTestSecret("0x4AAAAAAA-rahasia-asli")).toBe(false);
  });
});
