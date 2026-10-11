import { expect, test } from "@playwright/test";
import { login, MEMBER_EMAIL } from "./helpers";

// Anggota biasa: tanpa 2FA, menu sesuai peran, halaman pengelola tertutup.
test.describe("anggota", () => {
  test("login, menu sesuai peran, halaman pengelola tertutup", async ({ page }) => {
    await login(page, MEMBER_EMAIL);
    await expect(page).toHaveURL("/");

    const nav = page.getByRole("navigation", { name: "Navigasi utama" }).first();
    await expect(nav.getByRole("link", { name: "Tagihan" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Kartu Saya" })).toBeVisible();
    for (const hidden of ["Anggota", "Tambah Anggota", "Kas", "Impor"]) {
      await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    }

    for (const path of ["/anggota", "/anggota/baru", "/kas/kelola", "/kalender/kelola"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("halaman anggota terbuka dengan breadcrumb", async ({ page }) => {
    await login(page, MEMBER_EMAIL);
    for (const [path, crumb] of [
      ["/kas", "Tagihan"],
      ["/kartu", "Kartu Saya"],
      ["/kalender", "Kalender"],
      ["/notifikasi", "Notifikasi"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Lokasi halaman" }).getByText(crumb)).toBeVisible();
    }
  });

  test("tanpa login dialihkan ke halaman masuk", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto("/kas");
    await expect(page).toHaveURL(/\/masuk/);
  });
});
