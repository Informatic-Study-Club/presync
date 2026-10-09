import { describe, expect, test } from "bun:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./index";

// Aturan wajib 2: RLS aktif di semua tabel. Tes ini gagal bila ada tabel
// baru di skema yang lupa memanggil .enableRLS().
describe("RLS", () => {
  const exported: unknown[] = Object.values(schema);
  const tables = exported.filter((value): value is PgTable => is(value, PgTable));

  test("skema memuat tabel", () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  for (const table of tables) {
    const config = getTableConfig(table);
    test(`${config.name} mengaktifkan RLS tanpa policy`, () => {
      expect(config.enableRLS).toBe(true);
      expect(config.policies).toHaveLength(0);
    });
  }
});
