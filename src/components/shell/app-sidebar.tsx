"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { activeHref, type NavGroup } from "@/lib/navigation";
import { initials } from "@/components/shell/initials";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import { id as t } from "@/messages/id";

export type SidebarProfile = {
  fullName: string;
  memberCode: string;
  roleLabel: string;
};

type Props = {
  groups: NavGroup[];
  profile: SidebarProfile;
  logoutAction: () => Promise<void>;
};

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-xl px-2 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.19_290)] text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30">
        P
      </span>
      <span className="leading-tight">
        <span className="block text-[0.95rem] font-semibold tracking-tight">{t.app.name}</span>
        <span className="block text-xs text-muted-foreground">{t.app.org}</span>
      </span>
    </Link>
  );
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeHref(groups, pathname);
  return (
    <nav aria-label={t.nav.mainLabel} className="flex-1 space-y-5 overflow-y-auto px-3 py-2 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="px-3 pb-1.5 text-[0.7rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const isActive = item.href === active;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-[1.1rem] shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground",
                      )}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ProfileCard({ profile, logoutAction }: Pick<Props, "profile" | "logoutAction">) {
  return (
    <div className="m-3 flex items-center gap-3 rounded-2xl border bg-background/60 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initials(profile.fullName)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{profile.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {profile.roleLabel} · {profile.memberCode}
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          title={t.auth.logout}
          aria-label={t.auth.logout}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}

export function AppSidebar({ groups, profile, logoutAction }: Props) {
  const [open, setOpen] = useState(false);

  // Laci mobile: tutup dengan Escape, kunci gulir halaman selama terbuka.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const content = (onNavigate?: () => void) => (
    <>
      <div className="flex h-14 shrink-0 items-center border-b px-3 lg:h-16">
        <Brand />
      </div>
      <NavList groups={groups} onNavigate={onNavigate} />
      <ProfileCard profile={profile} logoutAction={logoutAction} />
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        {content()}
      </aside>

      {/* Mobile: bilah atas + laci */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.nav.openMenu}
          aria-expanded={open}
          className="grid size-9 place-items-center rounded-xl text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl transition-transform duration-200 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t.nav.closeMenu}
          className="absolute top-3.5 right-3 grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-5" aria-hidden />
        </button>
        {content(() => setOpen(false))}
      </aside>
    </>
  );
}
