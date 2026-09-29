"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, MoreHorizontal, Power, PowerOff, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { adminsService } from "@/services/admins";
import { errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { ManageRolesDialog, ResetPasswordDialog } from "./admin-dialogs";
import type { AdminListItem } from "@/types/api";

type Pending = { kind: "disable" | "enable" | "delete"; admin: AdminListItem } | null;

/** Row-level account actions, each shown only when the server says it's allowed. */
export function useAdminActions(onDeleted?: () => void) {
  const queryClient = useQueryClient();
  const [rolesFor, setRolesFor] = React.useState<AdminListItem | null>(null);
  const [resetFor, setResetFor] = React.useState<AdminListItem | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [busy, setBusy] = React.useState(false);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "delete") await adminsService.remove(pending.admin.id);
      else if (pending.kind === "disable") await adminsService.disable(pending.admin.id);
      else await adminsService.enable(pending.admin.id);
      await queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast.success(
        pending.kind === "delete" ? "Administrator deleted" : pending.kind === "disable" ? "Account disabled" : "Account re-enabled",
        { description: pending.admin.displayName },
      );
      if (pending.kind === "delete") onDeleted?.();
      setPending(null);
    } catch (err) {
      toast.error("Action failed", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const menu = (a: AdminListItem, opts: { showProfile?: () => void } = {}) => {
    const x = a.actions;
    const any = x.assignableRoles.length > 0 || x.canResetPassword || x.canDisable || x.canDelete;
    if (!any && !opts.showProfile) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Account actions" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
          {opts.showProfile && (
            <DropdownMenuItem onSelect={opts.showProfile}>
              <UserRound /> View profile
            </DropdownMenuItem>
          )}
          {x.assignableRoles.length > 0 && (
            <DropdownMenuItem onSelect={() => setRolesFor(a)}>
              <ShieldCheck /> Manage roles
            </DropdownMenuItem>
          )}
          {x.canResetPassword && (
            <DropdownMenuItem onSelect={() => setResetFor(a)}>
              <KeyRound /> Reset password
            </DropdownMenuItem>
          )}
          {x.canDisable &&
            (a.active ? (
              <DropdownMenuItem onSelect={() => setPending({ kind: "disable", admin: a })}>
                <PowerOff /> Disable account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setPending({ kind: "enable", admin: a })}>
                <Power /> Re-enable account
              </DropdownMenuItem>
            ))}
          {x.canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setPending({ kind: "delete", admin: a })}>
                <Trash2 /> Delete account
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const dialogs = (
    <>
      <ManageRolesDialog admin={rolesFor} onOpenChange={(o) => !o && setRolesFor(null)} />
      <ResetPasswordDialog admin={resetFor} onOpenChange={(o) => !o && setResetFor(null)} />
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogTitle>
                {pending.kind === "delete" ? "Delete" : pending.kind === "disable" ? "Disable" : "Re-enable"} {pending.admin.displayName}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pending.kind === "delete"
                  ? "The account is removed and signed out everywhere. Their interview history remains. The username becomes available again. This is logged."
                  : pending.kind === "disable"
                    ? "They are signed out immediately and cannot sign in until re-enabled."
                    : "They will be able to sign in again with their current password."}
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button variant={pending.kind === "enable" ? "default" : "destructive"} loading={busy} onClick={confirm}>
                  {pending.kind === "delete" ? "Delete account" : pending.kind === "disable" ? "Disable account" : "Re-enable"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { menu, dialogs, openRoles: setRolesFor, openReset: setResetFor, setPending };
}
