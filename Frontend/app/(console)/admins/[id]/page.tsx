"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Minus, Pencil, Plus, Power, PowerOff, ShieldCheck, Trash2 } from "lucide-react";
import { useAdmin } from "@/hooks/queries";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ROLE_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { RequireCapability } from "@/components/layout/require-auth";
import { Avatar } from "@/components/domain/avatar";
import { AccountStatus, RoleBadge, RoleList } from "@/components/domain/badges";
import { EditAdminDialog } from "@/components/admins/admin-dialogs";
import { useAdminActions } from "@/components/admins/admin-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import type { AdminDetail } from "@/types/api";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-subtle-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{children}</dd>
    </div>
  );
}

function AdminProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: a, error, isLoading, refetch } = useAdmin(id);
  const actions = useAdminActions(() => router.replace("/admins"));
  const [editing, setEditing] = React.useState<AdminDetail | null>(null);

  if (isLoading) return <PageBody><Skeleton className="h-72 w-full" /></PageBody>;
  if (error || !a) return <PageBody><ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this administrator" /></PageBody>;

  const x = a.actions;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admins" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3" /> Admin management
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={a.displayName} className="size-10 text-sm" />
            <span>
              {a.displayName}
              <span className="block text-sm font-normal text-muted-foreground">@{a.username}</span>
            </span>
          </span>
        }
        actions={
          <>
            {x.canEdit && (
              <Button variant="secondary" onClick={() => setEditing(a)}>
                <Pencil /> Edit
              </Button>
            )}
            {x.assignableRoles.length > 0 && (
              <Button onClick={() => actions.openRoles(a)}>
                <ShieldCheck /> Manage roles
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Roles</CardTitle>
                <CardDescription>Permissions are the combination of every role below.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <RoleList roles={a.roles} />
              {x.isSelf && <p className="mt-3 text-xs text-muted-foreground">You can&apos;t change your own roles.</p>}
              {!x.isSelf && x.assignableRoles.length === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">This administrator&apos;s roles are outside your authority.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Role history</CardTitle>
                <CardDescription>Every role added or removed, and by whom.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {a.roleHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No role changes recorded.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {a.roleHistory.map((h, i) => (
                    <li key={i} className="relative">
                      <span
                        className={cn(
                          "absolute top-1 -left-[1.6rem] grid size-4 place-items-center rounded-full border bg-background",
                          h.action === "ADDED" ? "border-success/60 text-success" : "border-destructive/60 text-destructive",
                        )}
                      >
                        {h.action === "ADDED" ? <Plus className="size-2.5" /> : <Minus className="size-2.5" />}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className={h.action === "ADDED" ? "text-foreground" : "text-muted-foreground"}>
                          {h.action === "ADDED" ? "Granted" : "Removed"}
                        </span>
                        <RoleBadge role={h.role} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        by {h.byName} · {formatDateTime(h.at)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <AccountStatus active={a.active} />
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <Fact label="Highest role">{ROLE_META[a.roles[0]!]?.label ?? "—"}</Fact>
                <Fact label="Created">
                  {formatDateTime(a.createdAt)}
                  {a.createdBy && <span className="block text-xs text-muted-foreground">by {a.createdBy.displayName}</span>}
                </Fact>
                <Fact label="Last sign-in">{formatRelative(a.lastLoginAt)}</Fact>
                <Fact label="Password last changed">{a.passwordChangedAt ? formatDateTime(a.passwordChangedAt) : "—"}</Fact>
                {a.mustChangePassword && <Fact label="Pending">Must change password at next sign-in</Fact>}
              </dl>
            </CardContent>
          </Card>

          {(x.canResetPassword || x.canDisable || x.canDelete) && (
            <Card>
              <CardHeader>
                <CardTitle>Security actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {x.canResetPassword && (
                  <Button variant="secondary" className="justify-start" onClick={() => actions.openReset(a)}>
                    <KeyRound /> Reset password
                  </Button>
                )}
                {x.canDisable && (
                  <Button variant="secondary" className="justify-start" onClick={() => actions.setPending({ kind: a.active ? "disable" : "enable", admin: a })}>
                    {a.active ? <PowerOff /> : <Power />} {a.active ? "Disable account" : "Re-enable account"}
                  </Button>
                )}
                {x.canDelete && (
                  <Button variant="destructive-ghost" className="justify-start" onClick={() => actions.setPending({ kind: "delete", admin: a })}>
                    <Trash2 /> Delete account
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageBody>
      <EditAdminDialog admin={editing} onOpenChange={(o) => !o && setEditing(null)} />
      {actions.dialogs}
    </>
  );
}

export default function AdminProfilePage() {
  return (
    <RequireCapability capability="canViewAdmins">
      <AdminProfile />
    </RequireCapability>
  );
}
