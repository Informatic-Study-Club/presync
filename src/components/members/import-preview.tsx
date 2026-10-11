import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PreviewRow } from "@/lib/members/import/actions";
import { id as t } from "@/messages/id";

const STATUS = {
  ok: { label: t.import.statusOk, variant: "secondary" },
  warning: { label: t.import.statusWarning, variant: "outline" },
  error: { label: t.import.statusError, variant: "destructive" },
} as const;

/** Hasil pemeriksaan baris anggota, dipakai impor file dan formulir web. */
export function ImportPreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.import.colRow}</TableHead>
          <TableHead>{t.import.colStatus}</TableHead>
          <TableHead>{t.members.colCode}</TableHead>
          <TableHead>{t.members.colName}</TableHead>
          <TableHead>{t.members.colEmail}</TableHead>
          <TableHead>{t.members.colPhone}</TableHead>
          <TableHead>{t.members.colDivision}</TableHead>
          <TableHead>{t.import.colNotes}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.rowNumber} className="align-top">
            <TableCell>{r.rowNumber}</TableCell>
            <TableCell>
              <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
            </TableCell>
            <TableCell className="font-mono">{r.display.kode_id}</TableCell>
            <TableCell>{r.display.nama}</TableCell>
            <TableCell>{r.display.email}</TableCell>
            <TableCell className="font-mono">{r.display.no_hp}</TableCell>
            <TableCell>
              {r.display.divisi} · {r.display.batch}
            </TableCell>
            <TableCell className="min-w-64 whitespace-normal text-xs">
              <ul className="list-disc space-y-1 pl-4">
                {r.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
