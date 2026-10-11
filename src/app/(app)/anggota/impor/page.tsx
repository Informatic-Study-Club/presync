import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { recentImports } from "@/lib/members/queries";
import { id as t } from "@/messages/id";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: t.import.title };
// Impor membuat akun login satu per satu; beri waktu lebih untuk ±170 baris.
export const maxDuration = 60;

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export default async function ImportPage() {
  const { user } = await requireSession();
  if (!can(user, "member.import")) notFound();
  const history = await recentImports();

  return (
    <div className="space-y-6">
      <PageHeader title={t.import.title} description={t.import.description} />
      <Card>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            render={<a href="/anggota/impor/template" download />}
            nativeButton={false}
          >
            {t.import.downloadTemplate}
          </Button>
          <ImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.import.history}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.import.historyEmpty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.import.historyCols.time}</TableHead>
                  <TableHead>{t.import.historyCols.file}</TableHead>
                  <TableHead>{t.import.colStatus}</TableHead>
                  <TableHead>{t.import.historyCols.rows}</TableHead>
                  <TableHead>{t.import.historyCols.by}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{dateFormat.format(h.createdAt)}</TableCell>
                    <TableCell>{h.fileName}</TableCell>
                    <TableCell>
                      <Badge variant={h.status === "completed" ? "secondary" : "destructive"}>
                        {t.import.historyStatus[h.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {h.importedRows}/{h.totalRows}
                    </TableCell>
                    <TableCell>{h.createdByName ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
