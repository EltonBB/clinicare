import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  MessageSquareMore,
  Settings,
  Users,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
  },
  {
    label: "Clients",
    href: "/clients",
    icon: Users,
  },
  {
    label: "Inbox",
    href: "/inbox",
    icon: MessageSquareMore,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];
