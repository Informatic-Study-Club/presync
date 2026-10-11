import { expect, test as setup } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_STATE, freshTotp, login } from "./helpers";

// Admin wajib 2FA: login, daftarkan TOTP dari awal (faktor lama dihapus di
// global-setup), lalu simpan sesi untuk tes admin lainnya.
setup("admin login dan daftar 2FA", async ({ page }) => {
  await login(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/2fa/);

  await page.getByRole("button", { name: "Aktifkan verifikasi dua langkah" }).click();
  const secret = (await page.locator("code").first().textContent())?.trim();
  expect(secret, "kunci TOTP tampil di halaman").toBeTruthy();

  await page.getByLabel("Kode 6 digit").fill(await freshTotp(secret!));
  await page.getByRole("button", { name: "Verifikasi" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: /Halo, Admin Uji/ })).toBeVisible();

  await page.context().storageState({ path: ADMIN_STATE });
});
