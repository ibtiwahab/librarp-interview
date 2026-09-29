"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronsUpDown, KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/libra-mark";
import { Avatar } from "@/components/domain/avatar";
import { RoleList } from "@/components/domain/badges";
import { Tooltip } from "@/components/ui/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from "./nav-config";

const COLLAPSE_KEY = "lrp.sidebar.collapsed";

function useVisibleNav() {
  const { can } = useAuth();
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.anyOf.length === 0 || i.anyOf.some((c) => can(c))),
  })).filter((g) => g.items.length > 0);
}

function isActive(item: NavItem, pathname: string) {
  return item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(item, pathname);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        active ? "bg-[#17171c] text-foreground" : "text-muted-foreground hover:bg-[#131317] hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-primary" : "text-subtle-foreground group-hover:text-muted-foreground")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors outline-none hover:bg-[#131317] focus-visible:ring-2 focus-visible:ring-ring",
          collapsed && "justify-center",
        )}
      >
        <Avatar name={user.displayName} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{user.displayName}</div>
              <div className="truncate text-[11px] text-muted-foreground">@{user.username}</div>
            </div>
            <ChevronsUpDown className="size-3.5 text-subtle-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-64">
        <div className="px-2 py-2">
          <div className="text-[13px] font-medium">{user.displayName}</div>
          <div className="text-xs text-muted-foreground">@{user.username}</div>
          <RoleList roles={user.roles} short className="mt-2" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <KeyRound /> Account & password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContents({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const groups = useVisibleNav();
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center border-b border-border px-4", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" onClick={onNavigate} aria-label="Libra RP dashboard">
          <Wordmark compact={collapsed} />
        </Link>
      </div>
      <nav className="scroll-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((g) => (
          <div key={g.label}>
            {!collapsed && (
              <div className="mb-2 px-2.5 text-[10px] font-semibold tracking-[0.14em] text-subtle-foreground uppercase">{g.label}</div>
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t border-border p-3">
        <NavLink item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The shell only renders client-side after auth resolves, so reading storage here is safe.
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  };

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "no-print sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-[#0b0b0d] transition-[width] duration-200 lg:block",
          collapsed ? "w-[4.25rem]" : "w-[var(--sidebar-width)]",
        )}
      >
        <SidebarContents collapsed={collapsed} />
        <button
          onClick={toggle}
          className="absolute top-4 -right-3 z-10 grid size-6 place-items-center rounded-full border border-border-strong bg-[#141418] text-muted-foreground transition-colors hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-3" /> : <PanelLeftClose className="size-3" />}
        </button>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard">
            <Wordmark />
          </Link>
          <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogPrimitive.Trigger className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground" aria-label="Open navigation">
              <Menu className="size-4" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-[#0b0b0d] data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
                <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
                <DialogPrimitive.Close className="absolute top-4 right-3 z-10 rounded-md p-1 text-muted-foreground" aria-label="Close navigation">
                  <X className="size-4" />
                </DialogPrimitive.Close>
                <SidebarContents collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </header>

        <main className="min-w-0 flex-1">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {children}
            </motion.div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-border px-4 pt-6 pb-5 sm:px-8 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
        {description && <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 py-6 sm:px-8", className)}>{children}</div>;
}
