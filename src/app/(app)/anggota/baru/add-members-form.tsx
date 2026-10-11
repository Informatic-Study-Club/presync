"use client";

import { Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { ImportPreviewTable } from "@/components/members/import-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { addMembersAction } from "@/lib/members/import/actions";
import { id as t } from "@/messages/id";

const a = t.members.add;
const MAX_ROWS = 50;

type Row = {
  key: number;
  nama: string;
  email: string;
  no_hp: string;
  divisi: string;
  batch: string;
  kode_id: string;
};
type Field = Exclude<keyof Row, "key">;

let nextKey = 1;
function blankRow(from?: Pick<Row, "divisi" | "batch">): Row {
  return { key: nextKey++, nama: "", email: "", no_hp: "", divisi: from?.divisi ?? "", batch: from?.batch ?? "", kode_id: "" };
}

export function AddMembersForm({
  divisions,
  defaultBatch,
}: {
  divisions: { id: string; name: string }[];
  defaultBatch: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow({ divisi: "", batch: defaultBatch })]);
  // Pratinjau hanya berlaku untuk isian yang diperiksa; ubahan apa pun membatalkannya.
  const [dirty, setDirty] = useState(true);
  const [state, dispatch, pending] = useActionState(addMembersAction, undefined);

  function update(key: number, field: Field, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setDirty(true);
  }

  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, blankRow(prev.at(-1))]));
    setDirty(true);
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
    setDirty(true);
  }

  function run(intent: "preview" | "commit") {
    const formData = new FormData();
    formData.set("intent", intent);
    formData.set(
      "rows",
      JSON.stringify(rows.map((r) => ({ nama: r.nama, email: r.email, no_hp: r.no_hp, divisi: r.divisi, batch: r.batch, kode_id: r.kode_id }))),
    );
    if (intent === "commit" && state?.fileHash) formData.set("hash", state.fileHash);
    if (intent === "preview") setDirty(false);
    startTransition(() => dispatch(formData));
  }

  // Setelah tersimpan, kosongkan formulir (divisi dan batch terakhir dipertahankan).
  const [seenSuccess, setSeenSuccess] = useState<string | undefined>();
  if (state?.success && state.success !== seenSuccess) {
    setSeenSuccess(state.success);
    setRows([blankRow(rows.at(-1))]);
  }

  const saved = Boolean(state?.success);
  const savable = (state?.counts?.ok ?? 0) + (state?.counts?.warning ?? 0);

  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-2xl border bg-background/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{a.rowLabel(i + 1)}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1 || pending}
                aria-label={`${a.removeRow} ${i + 1}`}
                title={a.removeRow}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor={`nama-${row.key}`}>{t.members.colName}</Label>
                <Input id={`nama-${row.key}`} value={row.nama} onChange={(e) => update(row.key, "nama", e.target.value)} autoComplete="off" required />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor={`email-${row.key}`}>{t.members.colEmail}</Label>
                <Input id={`email-${row.key}`} type="email" value={row.email} onChange={(e) => update(row.key, "email", e.target.value)} autoComplete="off" required />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor={`hp-${row.key}`}>{t.members.colPhone}</Label>
                <Input id={`hp-${row.key}`} type="tel" inputMode="tel" placeholder="08..." value={row.no_hp} onChange={(e) => update(row.key, "no_hp", e.target.value)} autoComplete="off" required />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor={`divisi-${row.key}`}>{t.members.colDivision}</Label>
                <NativeSelect id={`divisi-${row.key}`} value={row.divisi} onChange={(e) => update(row.key, "divisi", e.target.value)} className="w-full" required>
                  <option value="" disabled>
                    -
                  </option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`batch-${row.key}`}>{t.members.colBatch}</Label>
                <Input id={`batch-${row.key}`} inputMode="numeric" maxLength={2} placeholder="01" title={a.batchHint} value={row.batch} onChange={(e) => update(row.key, "batch", e.target.value)} className="font-mono" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`kode-${row.key}`}>{t.members.colCode}</Label>
                <Input id={`kode-${row.key}`} placeholder={a.codePlaceholder} maxLength={10} value={row.kode_id} onChange={(e) => update(row.key, "kode_id", e.target.value.toUpperCase())} className="font-mono" autoComplete="off" />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={addRow} disabled={rows.length >= MAX_ROWS || pending}>
          <Plus data-icon="inline-start" />
          {a.addRow}
        </Button>
        <p className="text-xs text-muted-foreground">{a.bulkHint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="button" onClick={() => run("preview")} disabled={pending}>
          {pending ? t.common.loading : a.preview}
        </Button>
        {state?.rows && !dirty && !saved ? (
          <Button type="button" variant="secondary" onClick={() => run("commit")} disabled={savable === 0 || pending}>
            {a.commit(savable)}
          </Button>
        ) : null}
      </div>

      <FormMessage error={state?.error} success={state?.success} />

      {state?.rows && state.counts && !dirty ? (
        <div className="space-y-3">
          <p className="text-sm">
            {t.import.summary(state.counts.ok, state.counts.warning, state.counts.error)}
            {saved ? null : <span className="text-muted-foreground"> · {a.commitHint}</span>}
          </p>
          <ImportPreviewTable rows={state.rows} />
        </div>
      ) : null}
    </div>
  );
}
