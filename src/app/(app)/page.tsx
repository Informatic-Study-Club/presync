import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { listDivisions } from "@/lib/members/queries";
import { buildNavigation } from "@/lib/navigation";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.dashboard.title };

export default async function HomePage() {
  const { member, user } = await requireSession();
  const divisionIds = (await listDivisions()).map((d) => d.id);

  // Akses cepat mengikuti menu RBAC yang sama dengan sidebar.
  const shortcuts = buildNavigation(user, divisionIds)
    .filter((g) => g.id !== "akun")
    .flatMap((g) => g.items)
    .filter((i) => i.href !== "/");

  const details: [string, string][] = [
    [t.dashboard.memberCode, member.memberCode],
    [t.dashboard.division, member.divisionName],
    [t.dashboard.batch, member.batch],
    [t.dashboard.roles, user.roles.map((r) => t.roles[r]).join(", ")],
  ];

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[oklch(0.58_0.2_290)] p-6 text-primary-foreground shadow-lg shadow-primary/20 sm:p-8">
        <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 size-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <p className="relative text-sm font-medium text-primary-foreground/80">{t.app.org}</p>
        <h1 className="relative mt-1 text-2xl sm:text-3xl">{t.dashboard.greeting(member.fullName)}</h1>
        <p className="relative mt-2 max-w-xl text-sm text-primary-foreground/85">{t.dashboard.subtitle}</p>
        <div className="relative mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 font-mono text-xs font-medium tracking-wide backdrop-blur">
            {member.memberCode}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            {member.divisionName}
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t.dashboard.quickAccess}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shortcuts.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex h-full flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs transition-all outline-none hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="flex items-start justify-between">
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <ArrowUpRight
                        className="size-4 text-muted-foreground/50 transition-colors group-hover:text-primary"
                        aria-hidden
                      />
                    </span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t.dashboard.profile}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {details.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
