import {
  ClipboardList,
  History,
  LayoutDashboard,
  Library,
  PlayCircle,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Capabilities } from "@/types/api";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only if the user has at least one of these capabilities. Empty = always. */
  anyOf: (keyof Capabilities)[];
  match?: (pathname: string) => boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, anyOf: [] },
      {
        href: "/interviews/new",
        label: "Start Interview",
        icon: PlayCircle,
        anyOf: ["canInterviewState", "canInterviewCrime", "canInterviewAdmins"],
        match: (p) => p === "/interviews/new",
      },
      {
        href: "/history",
        label: "Interview History",
        icon: History,
        anyOf: [],
        match: (p) => p.startsWith("/history") || (p.startsWith("/interviews/") && p !== "/interviews/new"),
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        href: "/questions",
        label: "Question Bank",
        icon: Library,
        anyOf: ["canManageQuestions", "canInterviewState", "canInterviewCrime", "canInterviewAdmins"],
      },
      { href: "/admins", label: "Admin Management", icon: Users, anyOf: ["canViewAdmins"] },
      { href: "/audit", label: "Audit Log", icon: ScrollText, anyOf: ["canViewAuditLogs"] },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, anyOf: [] };
export const FALLBACK_ICON = ClipboardList;
