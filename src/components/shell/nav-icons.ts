import {
  Archive,
  Bell,
  CalendarDays,
  ChartColumn,
  FileUp,
  GraduationCap,
  House,
  IdCard,
  Inbox,
  type LucideIcon,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { NavIcon } from "@/lib/navigation";

// Ikon menu, dipakai sidebar (klien) dan beranda (server).
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  calendar: CalendarDays,
  classes: GraduationCap,
  checkin: ScanLine,
  card: IdCard,
  bills: ReceiptText,
  finance: Wallet,
  members: Users,
  import: FileUp,
  archive: Archive,
  reports: ChartColumn,
  notifications: Bell,
  privacy: ShieldCheck,
  dataRequests: Inbox,
};
