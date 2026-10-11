import { expect, test } from "@playwright/test";
import { ADMIN_STATE } from "./helpers";

// Alur admin dengan sesi tersimpan dari auth.setup.e2e.ts (sudah 2FA).
test.use({ storageState: ADMIN_STATE });

test.describe.serial("admin", () => {
  const stamp = Date.now();
  const email = `e2e.${stamp}@presync.test`;
  let memberCode = "";

  test("tambah anggota dengan kode ID otomatis", async ({ page }) => {
    await page.goto("/anggota/baru");
    await page.getByLabel("Nama").fill("Peserta E2E");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("No. HP").fill(`0857${String(stamp).slice(-8)}`);
    await page.getByLabel("Divisi").selectOption({ label: "Machine Learning" });
    await page.getByRole("button", { name: "Periksa" }).click();

    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row.getByText("Siap")).toBeVisible();
    await page.getByRole("button", { name: "Simpan 1 anggota" }).click();

    const success = page.getByText(/1 anggota ditambahkan: ISC\d{7}/);
    await expect(success).toBeVisible();
    memberCode = (await success.textContent())!.match(/ISC\d{7}/)![0];
  });

  test("pemindai: tercatat hadir, duplikat, dan kode asing", async ({ page }) => {
    expect(memberCode, "kode dari tes sebelumnya").toMatch(/^ISC\d{7}$/);
    await page.goto(`/presensi/${process.env.E2E_SESSION_ID}/pindai`);
    const input = page.getByLabel("Pindai atau ketik kode ID");

    await input.fill(memberCode);
    await input.press("Enter");
    await expect(page.getByText("Tercatat Hadir").first()).toBeVisible();

    await input.fill(memberCode);
    await input.press("Enter");
    await expect(page.getByText(/Sudah tercatat pukul/).first()).toBeVisible();

    await input.fill("ISC9999999");
    await input.press("Enter");
    await expect(page.getByText("Kode ID tidak terdaftar.").first()).toBeVisible();
  });

  test("ubah profil: email wajib bercatatan, lalu tersimpan", async ({ page }) => {
    await page.goto(`/anggota?q=${encodeURIComponent("Peserta E2E")}`);
    await page.getByRole("link", { name: "Peserta E2E" }).first().click();
    await expect(page).toHaveURL(/\/anggota\/[0-9a-f-]{36}$/);

    const newEmail = `e2e.ganti.${stamp}@presync.test`;
    await page.getByLabel("Email (juga email login)").fill(newEmail);
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByText("Isi catatan minimal 3 karakter untuk perubahan status atau email.")).toBeVisible();

    await page.getByLabel("Catatan (wajib bila status atau email berubah)").fill("Uji e2e ganti email");
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByText("Profil diperbarui.")).toBeVisible();
  });

  test("hapus kelas yang sudah berpresensi ditolak", async ({ page }) => {
    await page.goto("/kelas");
    const link = page.getByRole("link", { name: /Web Development Dasar/ }).first();
    const name = (await link.locator("[data-slot=card-title]").textContent())!.trim();
    await link.click();
    await expect(page).toHaveURL(/\/kelas\/[0-9a-f-]{36}$/);
    await page.getByLabel("Ketik nama kelas untuk konfirmasi").fill(name);
    await page.getByRole("button", { name: "Hapus kelas" }).click();
    await expect(page.getByText("Kelas sudah punya data presensi. Arsipkan saja agar riwayat tetap utuh.")).toBeVisible();
  });

  test("laporan terunduh dalam tiga format", async ({ page }) => {
    const month = new Date().toISOString().slice(0, 7);
    const expected = { pdf: "application/pdf", xlsx: "spreadsheetml", csv: "text/csv" } as const;
    for (const [format, type] of Object.entries(expected)) {
      const response = await page.request.get(`/laporan/kas-bulanan?format=${format}&bulan=${month}`);
      expect(response.status(), format).toBe(200);
      expect(response.headers()["content-type"], format).toContain(type);
      expect((await response.body()).byteLength, format).toBeGreaterThan(100);
    }
  });
});
