import { describe, expect, test } from "bun:test";
import {
  diffSchedule,
  scheduleChangeError,
  scheduleInputSchema,
  scheduleUpdateSchema,
  type ScheduleValues,
} from "./schedule-edit";

const CAT = "11111111-1111-4111-8111-111111111111";
const SCH = "22222222-2222-4222-8222-222222222222";

const form = {
  name: "Iuran bulanan",
  categoryId: CAT,
  amount: "10.000",
  period: "monthly",
  dueDay: "10",
  dueOn: "",
  divisionId: "",
  batch: "",
};

const base: ScheduleValues = {
  name: "Iuran bulanan",
  categoryId: CAT,
  amount: 10000,
  period: "monthly",
  dueDay: 10,
  dueOn: null,
  divisionId: null,
  batch: null,
};

describe("scheduleInputSchema", () => {
  test("bulanan: nominal rupiah diurai, tanggal sekali bayar dikosongkan", () => {
    const r = scheduleInputSchema.parse({ ...form, dueOn: "2026-12-01", batch: "1" });
    expect(r).toMatchObject({ amount: 10000, dueDay: 10, dueOn: null, divisionId: null, batch: "01" });
  });

  test("sekali bayar wajib tanggal, hari jatuh tempo dikosongkan", () => {
    expect(scheduleInputSchema.safeParse({ ...form, period: "once" }).success).toBe(false);
    const r = scheduleInputSchema.parse({ ...form, period: "once", dueOn: "2026-12-01" });
    expect(r).toMatchObject({ dueDay: null, dueOn: "2026-12-01" });
  });

  test("hari jatuh tempo bulanan 1-28", () => {
    expect(scheduleInputSchema.safeParse({ ...form, dueDay: "29" }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...form, dueDay: "" }).success).toBe(false);
  });

  test("nominal tidak valid ditolak", () => {
    expect(scheduleInputSchema.safeParse({ ...form, amount: "sepuluh ribu" }).success).toBe(false);
  });

  test("skema ubah membawa scheduleId", () => {
    const r = scheduleUpdateSchema.parse({ ...form, scheduleId: SCH });
    expect(r.scheduleId).toBe(SCH);
    expect(scheduleUpdateSchema.safeParse(form).success).toBe(false);
  });
});

describe("diffSchedule dan scheduleChangeError", () => {
  test("tanpa perubahan ditolak", () => {
    expect(scheduleChangeError(diffSchedule(base, { ...base }), 0)).not.toBeNull();
  });

  test("ubah nominal boleh walau sudah ada tagihan", () => {
    const changes = diffSchedule(base, { ...base, amount: 15000 });
    expect(changes).toEqual([{ field: "amount", from: 10000, to: 15000 }]);
    expect(scheduleChangeError(changes, 40)).toBeNull();
  });

  test("ganti periode hanya boleh sebelum ada tagihan", () => {
    const changes = diffSchedule(base, { ...base, period: "once", dueDay: null, dueOn: "2026-12-01" });
    expect(scheduleChangeError(changes, 0)).toBeNull();
    expect(scheduleChangeError(changes, 1)).not.toBeNull();
  });
});
