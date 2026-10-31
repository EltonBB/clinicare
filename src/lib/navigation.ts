import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  MessageSquareMore,
  Settings,
  UserRoundCog,
  Users,
  Workflow,
} from "lucide-react";

export type NavigationItem = {
  /** Its name in the `shell.nav` dictionary. */
  key: "dashboard" | "calendar" | "clients" | "staff" | "inbox" | "automations" | "reports" | "settings";
  href: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "calendar",
    href: "/calendar",
    icon: CalendarDays,
  },
  {
    key: "clients",
    href: "/clients",
    icon: Users,
  },
  {
    key: "staff",
    href: "/staff",
    icon: UserRoundCog,
  },
  {
    key: "inbox",
    href: "/inbox",
    icon: MessageSquareMore,
  },
  {
    key: "automations",
    href: "/automations",
    icon: Workflow,
  },
  {
    key: "reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    key: "settings",
    href: "/settings",
    icon: Settings,
  },
];
