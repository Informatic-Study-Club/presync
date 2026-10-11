import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { archivePrograms } from "@/lib/attendance/archive-service";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { ArchiveForm } from "./archive-form";

export const metadata: Metadata = { title: t.attendance.archive.title };

const ar = t.attendance.archive;
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

export default async function ArchivePage() {
  const { user } = await requireSession();
  if (!can(user, "member.import")) notFound();
  const programs = await archivePrograms();

  return (
    <div className="space-y-6">
      <PageHeader title={ar.title} description={ar.description} />
      <Card>
        <CardContent>
          <ArchiveForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar.listTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar.colProgram}</TableHead>
                  <TableHead>{ar.colRows}</TableHead>
                  <TableHead>{ar.needsVerification}</TableHead>
                  <TableHead>{t.import.historyCols.time}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((p) => (
                  <TableRow key={p.program}>
                    <TableCell className="font-medium">{p.program}</TableCell>
                    <TableCell>{p.rows}</TableCell>
                    <TableCell>
                      {p.needsVerification > 0 ? (
                        <Badge variant="outline">{p.needsVerification}</Badge>
                      ) : (
                        <Badge variant="secondary">{ar.verified}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{dateFormat.format(p.importedAt)}</TableCell>
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
