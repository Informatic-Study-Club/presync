import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { listBatches, listMembers, visibleDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.members.title };

const filterSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  divisi: z.uuid().optional().catch(undefined),
  batch: z.string().regex(/^\d{2}$/).optional().catch(undefined),
  status: z.enum(["aktif", "nonaktif", "alumni"]).optional().catch(undefined),
});

export default async function MembersPage({ searchParams }: PageProps<"/anggota">) {
  const { user } = await requireSession();
  const divisions = await visibleDivisions(user);
  if (divisions.length === 0) notFound();

  const filters = filterSchema.parse(await searchParams);
  const [rows, batches] = await Promise.all([
    listMembers(user, {
      q: filters.q,
      divisionId: filters.divisi,
      batch: filters.batch,
      status: filters.status,
    }),
    listBatches(),
  ]);
  const showPhone = rows.some((r) => r.phone !== null);

  const printParams = new URLSearchParams();
  if (filters.divisi) printParams.set("divisi", filters.divisi);
  if (filters.batch) printParams.set("batch", filters.batch);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>{t.members.title}</h1>
        <Button
          variant="outline"
          size="sm"
          render={<a href={`/anggota/kartu?${printParams.toString()}`} />}
          nativeButton={false}
        >
          {t.members.printCards}
        </Button>
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <Input
          name="q"
          defaultValue={filters.q}
          placeholder={t.members.search}
          className="w-full sm:w-64"
          aria-label={t.members.search}
        />
        <NativeSelect name="divisi" defaultValue={filters.divisi ?? ""} aria-label={t.members.colDivision}>
          <option value="">{t.members.allDivisions}</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="batch" defaultValue={filters.batch ?? ""} aria-label={t.members.colBatch}>
          <option value="">{t.members.allBatches}</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={filters.status ?? ""} aria-label={t.members.colStatus}>
          <option value="">{t.members.allStatuses}</option>
          {(["aktif", "nonaktif", "alumni"] as const).map((s) => (
            <option key={s} value={s}>
              {t.memberStatus[s]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" className="h-8">
          {t.members.filter}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">{t.members.count(rows.length)}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.members.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.members.colCode}</TableHead>
              <TableHead>{t.members.colName}</TableHead>
              <TableHead>{t.members.colDivision}</TableHead>
              <TableHead>{t.members.colBatch}</TableHead>
              {showPhone ? <TableHead>{t.members.colPhone}</TableHead> : null}
              <TableHead>{t.members.colStatus}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono">{m.memberCode}</TableCell>
                <TableCell>
                  <Link href={`/anggota/${m.id}`} className="font-medium hover:underline">
                    {m.fullName}
                  </Link>
                </TableCell>
                <TableCell>{m.divisionName}</TableCell>
                <TableCell>{m.batch}</TableCell>
                {showPhone ? <TableCell className="font-mono">{m.phone ?? "-"}</TableCell> : null}
                <TableCell>
                  <Badge variant={m.status === "aktif" ? "secondary" : "outline"}>
                    {t.memberStatus[m.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
