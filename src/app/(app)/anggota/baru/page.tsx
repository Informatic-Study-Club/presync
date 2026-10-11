import { FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { listBatches, listDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";
import { AddMembersForm } from "./add-members-form";

export const metadata: Metadata = { title: t.members.add.title };
// Akun login dibuat satu per satu lewat Supabase Admin API.
export const maxDuration = 60;

export default async function AddMembersPage() {
  const { user } = await requireSession();
  if (!can(user, "member.import")) notFound();
  const [divisions, batches] = await Promise.all([listDivisions(), listBatches()]);

  return (
    <div className="space-y-6">
      <PageHeader title={t.members.add.title} description={t.members.add.description} />
      <Card>
        <CardContent className="space-y-5">
          <Link
            href="/anggota/impor"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <FileUp className="size-4" aria-hidden />
            {t.members.add.orImport}
          </Link>
          <AddMembersForm
            divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
            defaultBatch={batches.at(-1) ?? "01"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
