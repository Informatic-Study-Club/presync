import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { can, canInAnyDivision } from "@/lib/authz";
import { logoutAction } from "@/lib/auth/actions";
import { requireSession } from "@/lib/auth/session";
import { listDivisions } from "@/lib/members/queries";
import { id as t } from "@/messages/id";

// Kerangka halaman setelah login. Menu hanya petunjuk; setiap halaman tetap
// memeriksa sesi dan izinnya sendiri.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, member } = await requireSession();
  const divisionIds = (await listDivisions()).map((d) => d.id);

  const links = [
    { href: "/", label: t.nav.home, show: true },
    { href: "/kartu", label: t.nav.myCard, show: true },
    { href: "/anggota", label: t.nav.members, show: canInAnyDivision(user, "member.list", divisionIds) },
    { href: "/anggota/impor", label: t.nav.import, show: can(user, "member.import") },
    { href: "/admin/permintaan-data", label: t.nav.dataRequests, show: can(user, "privacy.manage") },
    { href: "/privasi", label: t.nav.privacy, show: true },
  ].filter((l) => l.show);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-primary">
            {t.app.name}
          </Link>
          <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{member.fullName}</span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                {t.auth.logout}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">{children}</main>
    </div>
  );
}
