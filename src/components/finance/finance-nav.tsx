import Link from "next/link";
import { cn } from "@/lib/utils";
import { id as t } from "@/messages/id";

const m = t.finance.manage;
const LINKS = [
  { href: "/kas/kelola", label: m.title },
  { href: "/kas/verifikasi", label: m.navVerify },
  { href: "/kas/buku", label: m.navLedger },
  { href: "/kas/tunggakan", label: m.navArrears },
];

export function FinanceNav({ active }: { active: string }) {
  return (
    <nav className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      <div className="inline-flex gap-1 rounded-xl border bg-card p-1 shadow-xs">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.href === active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              l.href === active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
