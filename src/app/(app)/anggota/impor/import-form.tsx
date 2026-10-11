"use client";

import { startTransition, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { ImportPreviewTable } from "@/components/members/import-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importAction } from "@/lib/members/import/actions";
import { id as t } from "@/messages/id";
import { useSafeActionState } from "@/lib/use-safe-action-state";

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [state, dispatch, pending] = useSafeActionState(importAction, undefined);

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
          <ImportPreviewTable rows={state.rows} />
        </div>
      ) : null}
    </div>
  );
}
