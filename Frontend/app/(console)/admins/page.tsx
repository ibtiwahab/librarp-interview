"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAdmins } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { ROLE_META, ROLE_ORDER } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { RequireCapability } from "@/components/layout/require-auth";
import { Avatar } from "@/components/domain/avatar";
import { AccountStatus, RoleList } from "@/components/domain/badges";
import { CreateAdminDialog } from "@/components/admins/admin-dialogs";
import { useAdminActions } from "@/components/admins/admin-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Pagination, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { Role } from "@/types/api";

const DEFAULTS = { q: "", role: "", status: "all", page: "1" };

function AdminsView() {
  const router = useRouter();
  const { user, can } = useAuth();
  const [f, setF] = useUrlState(DEFAULTS);
  const [search, setSearch] = React.useState(f.q);
  const debounced = useDebouncedValue(search, 350);
  const [createOpen, setCreateOpen] = React.useState(false);
  const actions = useAdminActions();

  React.useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced, page: "1" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, error, isLoading, isFetching, refetch } = useAdmins({
    search: f.q || undefined,
    role: (f.role || undefined) as Role | undefined,
    status: f.status as "all" | "active" | "disabled",
    page: Number(f.page) || 1,
    limit: 25,
  });

  return (
    <>
      <PageHeader
        eyebrow="Staff"
        title="Admin management"
        description="Administrator accounts and their roles. You can only change accounts and roles below your authority."
        actions={
          can("canCreateAdmins") && (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus /> Create administrator
            </Button>
          )
        }
      />
      <PageBody className="space-y-4">
        <Card className="flex flex-col gap-2 p-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or username…" className="pl-9" />
          </div>
          <NativeSelect value={f.role} onChange={(e) => setF({ role: e.target.value, page: "1" })} className="md:w-52">
            <option value="">All roles</option>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={f.status} onChange={(e) => setF({ status: e.target.value, page: "1" })} className="md:w-36">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </NativeSelect>
        </Card>

        <Card className="overflow-hidden">
          {error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState icon={Users} title="No administrators found" description="Try a different search or filter." />
          ) : (
            <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
              <Table>
                <THead>
                  <TR>
                    <TH>Administrator</TH>
                    <TH>Roles</TH>
                    <TH className="hidden md:table-cell">Status</TH>
                    <TH className="hidden lg:table-cell">Last sign-in</TH>
                    <TH className="hidden xl:table-cell">Created</TH>
                    <TH className="w-10" />
                  </TR>
                </THead>
                <TBody>
                  {data.items.map((a) => (
                    <TR key={a.id} className="cursor-pointer hover:bg-[#121216]" onClick={() => router.push(`/admins/${a.id}`)}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={a.displayName} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium">
                              {a.displayName}
                              {a.id === user?.id && <Badge tone="gold">You</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">@{a.username}</div>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <RoleList roles={a.roles} short max={4} />
                      </TD>
                      <TD className="hidden md:table-cell">
                        <AccountStatus active={a.active} />
                      </TD>
                      <TD className="hidden text-muted-foreground lg:table-cell">{formatRelative(a.lastLoginAt)}</TD>
                      <TD className="hidden text-muted-foreground xl:table-cell">
                        <div>{formatDate(a.createdAt, "MMM d, yyyy")}</div>
                        {a.createdBy && <div className="text-[11px] text-subtle-foreground">by {a.createdBy.displayName}</div>}
                      </TD>
                      <TD onClick={(e) => e.stopPropagation()}>{actions.menu(a, { showProfile: () => router.push(`/admins/${a.id}`) })}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(p) => setF({ page: String(p) })} label="administrators" />
            </div>
          )}
        </Card>
      </PageBody>
      <CreateAdminDialog open={createOpen} onOpenChange={setCreateOpen} assignable={user?.assignableRoles ?? []} />
      {actions.dialogs}
    </>
  );
}

export default function AdminsPage() {
  return (
    <RequireCapability capability="canViewAdmins">
      <Suspense fallback={<Skeleton className="m-8 h-64" />}>
        <AdminsView />
      </Suspense>
    </RequireCapability>
  );
}
