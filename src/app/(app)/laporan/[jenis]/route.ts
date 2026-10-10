import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDateString } from "@/lib/academic/time";
import { routeSession } from "@/lib/auth/session";
import { MONTH_RE } from "@/lib/finance/ledger";
import {
  arrearsReport,
  attendanceByClass,
  attendanceByDivision,
  attendanceByMember,
  type BuildResult,
  financeMonthly,
  membersReport,
} from "@/lib/reports/builders";
import { REPORT_FORMATS, reportFileName } from "@/lib/reports/model";
import { CONTENT_TYPES, renderReport } from "@/lib/reports/render";
import { id as t } from "@/messages/id";

// Unduhan laporan: /laporan/<jenis>?format=pdf|xlsx|csv&...
export const maxDuration = 60;

const date = z.string().refine(isDateString);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

const SCHEMAS = {
  "kehadiran-kelas": z.object({ kelas: z.uuid() }),
  "kehadiran-divisi": z.object({ divisi: z.uuid(), dari: date, sampai: date }),
  "kehadiran-anggota": z.object({ anggota: z.uuid(), dari: date, sampai: date }),
  "kas-bulanan": z.object({ bulan: z.string().regex(MONTH_RE) }),
  tunggakan: z.object({}),
  anggota: z.object({
    divisi: optional(z.uuid()),
    batch: optional(z.string().regex(/^\d{2}$/)),
    status: optional(z.enum(["aktif", "nonaktif", "alumni"])),
  }),
} as const;

type Kind = keyof typeof SCHEMAS;

export async function GET(request: NextRequest, { params }: RouteContext<"/laporan/[jenis]">) {
  const session = await routeSession();
  if (!session) return NextResponse.json({ error: t.errors.forbidden }, { status: 401 });

  const { jenis } = await params;
  if (!(jenis in SCHEMAS)) return NextResponse.json({ error: t.errors.notFound }, { status: 404 });
  const kind = jenis as Kind;
  const query = Object.fromEntries(request.nextUrl.searchParams);
  const format = z.enum(REPORT_FORMATS as [string, ...string[]]).safeParse(query.format ?? "pdf");
  const parsed = SCHEMAS[kind].safeParse(query);
  if (!format.success || !parsed.success) {
    return NextResponse.json({ error: t.reports.errors.invalid }, { status: 400 });
  }

  let result: BuildResult;
  switch (kind) {
    case "kehadiran-kelas": {
      const p = parsed.data as z.infer<(typeof SCHEMAS)["kehadiran-kelas"]>;
      result = await attendanceByClass(session, p.kelas);
      break;
    }
    case "kehadiran-divisi": {
      const p = parsed.data as z.infer<(typeof SCHEMAS)["kehadiran-divisi"]>;
      result = await attendanceByDivision(session, p.divisi, p.dari, p.sampai);
      break;
    }
    case "kehadiran-anggota": {
      const p = parsed.data as z.infer<(typeof SCHEMAS)["kehadiran-anggota"]>;
      result = await attendanceByMember(session, p.anggota, p.dari, p.sampai);
      break;
    }
    case "kas-bulanan": {
      const p = parsed.data as z.infer<(typeof SCHEMAS)["kas-bulanan"]>;
      result = await financeMonthly(session, p.bulan);
      break;
    }
    case "tunggakan":
      result = await arrearsReport(session);
      break;
    case "anggota": {
      const p = parsed.data as z.infer<(typeof SCHEMAS)["anggota"]>;
      result = await membersReport(session, { divisionId: p.divisi, batch: p.batch, status: p.status });
      break;
    }
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const fmt = format.data as (typeof REPORT_FORMATS)[number];
  const body = await renderReport(result.report, fmt);
  return new Response(body.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": CONTENT_TYPES[fmt],
      "Content-Disposition": `attachment; filename="${reportFileName(result.report, fmt)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
