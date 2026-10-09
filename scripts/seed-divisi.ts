// Mengisi tabel divisions dengan tiga divisi ISC. Aman dijalankan berulang.
// Pemakaian: bun run seed:divisi

import { divisions } from "@/db/schema";
import { connectScriptDb } from "./lib/db";

const DIVISIONS = [
  { name: "Web Development", slug: "web-development" },
  { name: "Machine Learning", slug: "machine-learning" },
  { name: "UI/UX", slug: "ui-ux" },
];

const { db, close } = connectScriptDb();
try {
  const inserted = await db
    .insert(divisions)
    .values(DIVISIONS)
    .onConflictDoNothing({ target: divisions.slug })
    .returning({ slug: divisions.slug });
  console.log(
    inserted.length > 0
      ? `Divisi ditambahkan: ${inserted.map((d) => d.slug).join(", ")}`
      : "Semua divisi sudah ada.",
  );
} finally {
  await close();
}
