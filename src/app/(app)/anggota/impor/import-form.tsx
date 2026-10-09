"use client";

import { startTransition, useActionState, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importAction } from "@/lib/members/import/actions";
import { id as t } from "@/messages/id";

const STATUS = {
  ok: { label: t.import.statusOk, variant: "secondary" },
  warning: { label: t.import.statusWarning, variant: "outline" },
  error: { label: t.import.statusError, variant: "destructive" },
} as const;

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [state, dispatch, pending] = useActionState(importAction, undefined);

  function run(intent: "preview" | "commit") {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("intent", intent);
    if (intent === "commit" && state?.fileHash) formData.set("fileHash", state.fileHash);
    startTransition(() => dispatch(formData));
  }

  const importable = (state?.counts?.ok ?? 0) + (state?.counts?.warning ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="file">{t.import.file}</Label>
          <Input
            id="file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="button" onClick={() => run("preview")} disabled={!file || pending}>
          {pending ? t.common.loading : t.import.preview}
        </Button>
      </div>

      <FormMessage error={state?.error} success={state?.success} />

      {state?.rows && state.counts ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium">{state.fileName}</span>:{" "}
            {t.import.summary(state.counts.ok, state.counts.warning, state.counts.error)}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => run("commit")} disabled={importable === 0 || pending}>
              {t.import.commit(importable)}
            </Button>
            <p className="text-xs text-muted-foreground">{t.import.commitHint}</p>
          </div>
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
              {state.rows.map((r) => (
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
        </div>
      ) : null}
    </div>
  );
}
