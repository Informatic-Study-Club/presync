import Link from "next/link";
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
    <nav className="flex flex-wrap gap-2 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            l.href === active
              ? "rounded-md bg-secondary px-3 py-1 font-medium"
              : "rounded-md px-3 py-1 text-muted-foreground hover:text-foreground"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
