import type { ReactNode } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { initials } from "@/components/shell/initials";
import { ROLES } from "@/lib/authz";
import { logoutAction } from "@/lib/auth/actions";
import { requireSession } from "@/lib/auth/session";
import { listDivisions } from "@/lib/members/queries";
import { buildNavigation } from "@/lib/navigation";
import { id as t } from "@/messages/id";

// Kerangka halaman setelah login: sidebar berisi menu sesuai izin (RBAC).
// Menu hanya petunjuk; setiap halaman tetap memeriksa sesi dan izinnya sendiri.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, member } = await requireSession();
  const divisionIds = (await listDivisions()).map((d) => d.id);
  const groups = buildNavigation(user, divisionIds);

  // Peran tertinggi yang dimiliki (urutan ROLES: admin lebih dulu).
  const topRole = ROLES.find((r) => user.roles.includes(r)) ?? "anggota";
  const today = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppSidebar
        groups={groups}
        profile={{ fullName: member.fullName, memberCode: member.memberCode, roleLabel: t.roles[topRole] }}
        logoutAction={logoutAction}
      />
      <div className="flex flex-1 flex-col lg:pl-64">
        <AppHeader today={today} initials={initials(member.fullName)} />
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
