import { Badge } from "@/components/ui/badge";
import { ROLE_META, ROLE_ORDER, STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { InterviewStatus, Role } from "@/types/api";

export function RoleBadge({ role, short = false, className }: { role: Role; short?: boolean; className?: string }) {
  const meta = ROLE_META[role];
  return (
    <Badge tone={meta.tone} className={className}>
      {short ? meta.short : meta.label}
    </Badge>
  );
}

export function RoleList({ roles, short = false, max, className }: { roles: Role[]; short?: boolean; max?: number; className?: string }) {
  const sorted = ROLE_ORDER.filter((r) => roles.includes(r));
  const shown = max ? sorted.slice(0, max) : sorted;
  const hidden = sorted.length - shown.length;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((r) => (
        <RoleBadge key={r} role={r} short={short} />
      ))}
      {hidden > 0 && <Badge tone="base">+{hidden}</Badge>}
    </div>
  );
}

export function StatusBadge({ status, className }: { status: InterviewStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone === "neutral" ? "neutral" : meta.tone} className={cn("gap-1.5", className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          meta.tone === "success" && "bg-success",
          meta.tone === "danger" && "bg-destructive",
          meta.tone === "warning" && "bg-warning",
          meta.tone === "info" && "animate-pulse bg-info",
          meta.tone === "neutral" && "bg-subtle-foreground",
        )}
      />
      {meta.label}
    </Badge>
  );
}

export function AccountStatus({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-1.5 rounded-full bg-success" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
      <span className="size-1.5 rounded-full bg-destructive" /> Disabled
    </span>
  );
}
