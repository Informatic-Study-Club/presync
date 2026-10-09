"use client";

import { startTransition, useActionState, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { archiveAction } from "@/lib/attendance/actions";
import { id as t } from "@/messages/id";

const ar = t.attendance.archive;

export function ArchiveForm() {
  const [file, setFile] = useState<File | null>(null);
  const [program, setProgram] = useState("");
  const [state, dispatch, pending] = useActionState(archiveAction, undefined);

  function run(intent: "preview" | "commit") {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("program", program);
    formData.set("intent", intent);
    if (intent === "commit" && state?.fileHash) formData.set("fileHash", state.fileHash);
    startTransition(() => dispatch(formData));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="archive-program">{ar.program}</Label>
          <Input
            id="archive-program"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            placeholder={ar.programPlaceholder}
            maxLength={120}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="archive-file">{ar.file}</Label>
          <Input
            id="archive-file"
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => run("preview")} disabled={!file || pending}>
          {pending ? t.common.loading : ar.preview}
        </Button>
        {state?.rows && (state.validCount ?? 0) > 0 ? (
          <Button type="button" variant="secondary" onClick={() => run("commit")} disabled={pending || program.trim().length < 3}>
            {ar.commit(state.validCount ?? 0)}
          </Button>
        ) : null}
      </div>
      <FormMessage error={state?.error} success={state?.success} />

      {state?.rows ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.import.colRow}</TableHead>
              <TableHead>{t.members.colCode}</TableHead>
              <TableHead>{t.members.colName}</TableHead>
              <TableHead>{t.attendanceStatus.hadir}</TableHead>
              <TableHead>{t.attendanceStatus.izin}</TableHead>
              <TableHead>{t.attendanceStatus.sakit}</TableHead>
              <TableHead>{t.attendanceStatus.tidak_hadir}</TableHead>
              <TableHead>{t.import.colNotes}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.rows.map((r) => (
              <TableRow key={r.rowNumber} className="align-top">
                <TableCell>{r.rowNumber}</TableCell>
                <TableCell className="font-mono">{r.memberCode}</TableCell>
                <TableCell>{r.memberName ?? "-"}</TableCell>
                <TableCell>{r.counts.hadir}</TableCell>
                <TableCell>{r.counts.izin}</TableCell>
                <TableCell>{r.counts.sakit}</TableCell>
                <TableCell>{r.counts.tidakHadir}</TableCell>
                <TableCell className="min-w-56 whitespace-normal text-xs">
                  {!r.ok ? <Badge variant="destructive">{t.import.statusError}</Badge> : null}
                  {r.ok && r.needsVerification ? <Badge variant="outline">{ar.needsVerification}</Badge> : null}
                  <ul className="mt-1 list-disc pl-4">
                    {r.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
