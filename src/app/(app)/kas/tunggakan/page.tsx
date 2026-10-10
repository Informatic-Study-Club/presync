import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FinanceNav } from "@/components/finance/finance-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/finance/money";
import { arrearsList } from "@/lib/finance/service";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.finance.arrears.title };

const a = t.finance.arrears;

export default async function ArrearsPage() {
  const { user } = await requireSession();
  if (!can(user, "finance.read")) notFound();
  const rows = await arrearsList(user);

  return (
    <div className="space-y-6">
      <h1>{a.title}</h1>
      <FinanceNav active="/kas/tunggakan" />
      <Card>
        <CardContent className="pt-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{a.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{a.colMember}</TableHead>
                  <TableHead>{t.dashboard.division}</TableHead>
                  <TableHead>{a.colCount}</TableHead>
                  <TableHead>{a.colTotal}</TableHead>
                  <TableHead>{a.colOldest}</TableHead>
                  <TableHead>{a.colPhone}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.memberId}>
                    <TableCell>
                      <span className="font-mono text-muted-foreground">{r.memberCode}</span> {r.fullName}
                    </TableCell>
                    <TableCell>{r.divisionName}</TableCell>
                    <TableCell>{r.invoiceCount}</TableCell>
                    <TableCell>{formatRupiah(r.totalAmount)}</TableCell>
                    <TableCell>{r.oldestDueOn}</TableCell>
                    <TableCell className="font-mono">{r.phone ?? "-"}</TableCell>
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
