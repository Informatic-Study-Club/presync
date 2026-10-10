"use client";

import { Bell, ChevronRight, House } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildBreadcrumbs } from "@/lib/breadcrumbs";
import { id as t } from "@/messages/id";

type Props = {
  /** Tanggal hari ini (Asia/Jakarta), diformat di server agar tidak beda saat hidrasi. */
  today: string;
  initials: string;
};

export function AppHeader({ today, initials }: Props) {
  const crumbs = buildBreadcrumbs(usePathname());

  return (
    <header className="sticky top-14 z-20 border-b bg-background/75 backdrop-blur-md lg:top-0">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:h-16 lg:px-10">
        <nav aria-label={t.breadcrumb.label} className="min-w-0 flex-1">
          <ol className="flex items-center gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={crumb.href} className="flex shrink-0 items-center gap-1">
                  {i > 0 ? <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden /> : null}
                  {last ? (
                    <span aria-current="page" className="rounded-lg px-1.5 py-1 font-semibold text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {i === 0 ? <House className="size-3.5" aria-hidden /> : null}
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="mr-2 text-sm text-muted-foreground">{today}</span>
          <Link
            href="/notifikasi"
            aria-label={t.header.notifications}
            title={t.header.notifications}
            className="grid size-9 place-items-center rounded-xl border bg-card text-muted-foreground shadow-xs transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Bell className="size-4" aria-hidden />
          </Link>
          <Link
            href="/kartu"
            aria-label={t.header.profile}
            title={t.header.profile}
            className="grid size-9 place-items-center rounded-xl bg-primary/10 text-xs font-semibold text-primary transition-colors outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {initials}
          </Link>
        </div>
      </div>
    </header>
  );
}
