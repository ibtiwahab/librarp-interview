"use client";

import * as React from "react";
import { Suspense } from "react";
import { ChevronDown, ScrollText, Search } from "lucide-react";
import { useAuditLogs } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { AUDIT_ACTION_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { RequireCapability } from "@/components/layout/require-auth";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/table";
import type { AuditLogEntry } from "@/types/api";

const DEFAULTS = { q: "", category: "", action: "", from: "", to: "", page: "1" };

const CATEGORY_TONE: Record<AuditLogEntry["category"], BadgeTone> = {
  auth: "info",
  admin: "gold",
  question: "support",
  interview: "state",
  system: "neutral",
};

function danger(action: string) {
  return /DELETED|DISABLED|FAILED|REUSE|REMOVED|RESET/.test(action);
}

function MetadataView({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);
  if (!entries.length) return <span className="text-subtle-foreground">No additional details.</span>;
  return (
    <pre className="scroll-thin max-h-72 overflow-auto rounded-md border border-border bg-[#0a0a0c] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

function Entry({ log, showIp }: { log: AuditLogEntry; showIp: boolean }) {
  const [open, setOpen] = React.useState(false);
  const role = typeof log.metadata.role === "string" ? log.metadata.role : null;
  return (
    <li className="border-b border-border last:border-b-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-4 px-5 py-3 text-left transition-colors hover:bg-[#111114]">
        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", danger(log.action) ? "bg-destructive" : "bg-primary/70")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium">{log.actor?.displayName ?? "System"}</span>
            <span className={danger(log.action) ? "text-destructive" : "text-secondary-foreground"}>
              {AUDIT_ACTION_LABELS[log.action] ?? log.action}
            </span>
            {role && <Badge tone="gold">{role.replaceAll("_", " ").toLowerCase()}</Badge>}
            {log.targetLabel && <span className="truncate text-muted-foreground">→ {log.targetLabel}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-subtle-foreground">
            <Badge tone={CATEGORY_TONE[log.category]}>{log.category}</Badge>
            <span>{formatDateTime(log.createdAt)}</span>
            {log.actor && <span>@{log.actor.username}</span>}
            {showIp && log.ipAddress && <span className="font-mono">{log.ipAddress}</span>}
          </div>
        </div>
        <ChevronDown className={cn("mt-1 size-4 text-subtle-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-5 pb-4 pl-10">
          <MetadataView metadata={log.metadata} />
          <div className="mt-2 font-mono text-[10px] text-subtle-foreground">
            {log.action} · {log.targetType ?? "—"} {log.targetId ?? ""}
          </div>
        </div>
      )}
    </li>
  );
}

function AuditView() {
  const [f, setF] = useUrlState(DEFAULTS);
  const [search, setSearch] = React.useState(f.q);
  const debounced = useDebouncedValue(search, 350);
  React.useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced, page: "1" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, error, isLoading, refetch } = useAuditLogs({
    search: f.q || undefined,
    category: f.category || undefined,
    action: f.action || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    page: Number(f.page) || 1,
    limit: 50,
  });

  return (
    <>
      <PageHeader
        eyebrow="Oversight"
        title="Audit log"
        description={
          data?.scope === "MANAGEMENT"
            ? "Administrative, question bank and interview activity. Sign-in events are visible to the Executive Director only."
            : "Every security-relevant action in the system. Passwords and tokens are never recorded."
        }
      />
      <PageBody className="space-y-4">
        <Card className="grid gap-2 p-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor or target…" className="pl-9" />
          </div>
          <NativeSelect value={f.category} onChange={(e) => setF({ category: e.target.value, page: "1" })} className="md:w-36">
            <option value="">All categories</option>
            {(["admin", "question", "interview", "auth", "system"] as const)
              .filter((c) => data?.scope !== "MANAGEMENT" || c !== "auth")
              .map((c) => (
                <option key={c} value={c}>
                  {c[0]!.toUpperCase() + c.slice(1)}
                </option>
              ))}
          </NativeSelect>
          <NativeSelect value={f.action} onChange={(e) => setF({ action: e.target.value, page: "1" })} className="md:w-52">
            <option value="">All actions</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" aria-label="From" value={f.from} onChange={(e) => setF({ from: e.target.value, page: "1" })} className="md:w-40" />
          <Input type="date" aria-label="To" value={f.to} onChange={(e) => setF({ to: e.target.value, page: "1" })} className="md:w-40" />
        </Card>
        <Card className="overflow-hidden">
          {error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState icon={ScrollText} title="No audit entries" description="Nothing matches these filters." />
          ) : (
            <>
              <ul>
                {data.items.map((l) => (
                  <Entry key={l.id} log={l} showIp={data.scope === "ALL"} />
                ))}
              </ul>
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(p) => setF({ page: String(p) })} label="entries" />
            </>
          )}
        </Card>
      </PageBody>
    </>
  );
}

export default function AuditPage() {
  return (
    <RequireCapability capability="canViewAuditLogs">
      <Suspense fallback={<Skeleton className="m-8 h-64" />}>
        <AuditView />
      </Suspense>
    </RequireCapability>
  );
}
