"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, ClipboardCopy, KeyRound, Lock } from "lucide-react";
import { useRoleCatalogue } from "@/hooks/queries";
import { adminsService } from "@/services/admins";
import { ApiError, errorMessage } from "@/lib/api-client";
import { ROLE_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Checkbox, Tooltip } from "@/components/ui/controls";
import { Notice, Skeleton } from "@/components/ui/feedback";
import type { AdminDetail, AdminListItem, Role } from "@/types/api";

/* ───────────────────────────── One-time password reveal ───────────────────────────── */

export function TemporaryPassword({ password, username }: { password: string; username: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="space-y-3">
      <Notice tone="warning" icon={KeyRound}>
        This temporary password is shown <strong>once</strong>. Share it privately with <strong>@{username}</strong>. They must change it at first
        sign-in.
      </Notice>
      <div className="flex items-center gap-2 rounded-md border border-border-strong bg-[#0c0c0f] p-2 pl-4">
        <code className="flex-1 font-mono text-lg tracking-wider text-primary select-all">{password}</code>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Copy failed — select the password and copy it manually.");
            }
          }}
        >
          {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Role picker ───────────────────────────── */

export function RolePicker({
  value,
  onChange,
  assignable,
  lockedRoles = [],
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
  /** Roles the current actor may toggle (computed by the server). */
  assignable: Role[];
  lockedRoles?: Role[];
}) {
  const catalogue = useRoleCatalogue();
  if (catalogue.isLoading) return <Skeleton className="h-64 w-full" />;
  const entries = [...(catalogue.data ?? [])].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map((r) => {
        const checked = value.includes(r.role);
        const locked = lockedRoles.includes(r.role);
        const canToggle = assignable.includes(r.role) && !locked;
        const reason = locked
          ? "Every account keeps the base Server Admin role."
          : !canToggle
            ? (r.reason ?? "You cannot assign or remove this role for this administrator.")
            : null;
        const card = (
          <label
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 transition-colors",
              checked ? "border-primary/45 bg-primary-soft/50" : "border-border bg-[#0c0c0f]",
              canToggle ? "cursor-pointer hover:border-border-strong" : "cursor-not-allowed opacity-55",
            )}
          >
            <Checkbox
              className="mt-0.5"
              checked={checked}
              disabled={!canToggle}
              onCheckedChange={(v) => onChange(v === true ? [...value, r.role] : value.filter((x) => x !== r.role))}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                {r.label}
                {!canToggle && <Lock className="size-3 text-subtle-foreground" />}
              </div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{r.description}</div>
            </div>
          </label>
        );
        return reason ? (
          <Tooltip key={r.role} content={reason}>
            <div>{card}</div>
          </Tooltip>
        ) : (
          <React.Fragment key={r.role}>{card}</React.Fragment>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Create administrator ───────────────────────────── */

const createSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "At least 3 characters.")
      .max(32)
      .regex(/^[a-z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only."),
    displayName: z.string().trim().max(80),
    passwordMode: z.enum(["generate", "manual"]),
    password: z.string(),
  })
  .refine((v) => v.passwordMode === "generate" || (v.password.length >= 8 && /[a-zA-Z]/.test(v.password) && /\d/.test(v.password)), {
    message: "At least 8 characters with a letter and a number.",
    path: ["password"],
  });
type CreateValues = z.infer<typeof createSchema>;

export function CreateAdminDialog({ open, onOpenChange, assignable }: { open: boolean; onOpenChange: (o: boolean) => void; assignable: Role[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">{open && <CreateAdminForm onOpenChange={onOpenChange} assignable={assignable} />}</DialogContent>
    </Dialog>
  );
}

/** Mounted fresh each time the dialog opens. */
function CreateAdminForm({ onOpenChange, assignable }: { onOpenChange: (o: boolean) => void; assignable: Role[] }) {
  const queryClient = useQueryClient();
  const [roles, setRoles] = React.useState<Role[]>(["SERVER_ADMIN"]);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ admin: AdminDetail; temporaryPassword: string | null } | null>(null);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: "", displayName: "", passwordMode: "manual", password: "" },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const res = await adminsService.create({
        username: v.username,
        displayName: v.displayName || undefined,
        password: v.passwordMode === "manual" ? v.password : undefined,
        roles: roles.filter((r) => r !== "SERVER_ADMIN"),
      });
      await queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast.success("Administrator created", { description: `${res.admin.displayName} (@${res.admin.username})` });
      setCreated(res);
    } catch (err) {
      if (err instanceof ApiError && err.details && typeof err.details.field === "string") {
        form.setError(err.details.field as keyof CreateValues, { message: err.message });
      } else if (err instanceof ApiError && err.details?.fieldErrors) {
        for (const [k, m] of Object.entries(err.details.fieldErrors)) form.setError(k as keyof CreateValues, { message: m[0] });
      }
      setError(errorMessage(err));
    }
  });

  const e = form.formState.errors;
  const mode = useWatch({ control: form.control, name: "passwordMode" });

  return (
    <>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                {created.admin.displayName} can now sign in as <span className="text-foreground">@{created.admin.username}</span>.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {created.temporaryPassword ? (
                <TemporaryPassword password={created.temporaryPassword} username={created.admin.username} />
              ) : (
                <Notice tone="success" icon={Check}>
                  The password you set was saved. The administrator will be asked to change it at first sign-in.
                </Notice>
              )}
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <DialogHeader>
              <DialogTitle>Create administrator</DialogTitle>
              <DialogDescription>New accounts start as Server Admin. Add curator roles within your authority.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              {error && (
                <Notice tone="danger" icon={AlertTriangle}>
                  {error}
                </Notice>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Username" htmlFor="u" required error={e.username?.message}>
                  <Input id="u" autoComplete="off" spellCheck={false} aria-invalid={!!e.username} {...form.register("username")} />
                </Field>
                <Field label="Display name" htmlFor="d" error={e.displayName?.message} hint="Optional — defaults to the username.">
                  <Input id="d" aria-invalid={!!e.displayName} {...form.register("displayName")} />
                </Field>
              </div>
              <div className="space-y-2">
                <div className="text-[13px] font-medium">Initial password</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["manual", "generate"] as const).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-[13px]",
                        mode === m ? "border-primary/45 bg-primary-soft/50" : "border-border bg-[#0c0c0f]",
                      )}
                    >
                      <input type="radio" value={m} className="mt-0.5 accent-[#c9a45c]" {...form.register("passwordMode")} />
                      <span>
                        <span className="font-medium">{m === "generate" ? "Generate temporary password" : "Set password"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {m === "generate" ? "A random password, shown once after creation." : "You choose the initial password."}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {mode === "manual" && (
                  <Field htmlFor="pw" error={e.password?.message}>
                    <Input id="pw" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...form.register("password")} />
                  </Field>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-[13px] font-medium">Roles</div>
                <RolePicker value={roles} onChange={setRoles} assignable={assignable} lockedRoles={["SERVER_ADMIN"]} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create administrator
              </Button>
            </DialogFooter>
          </form>
        )}
    </>
  );
}

/* ───────────────────────────── Manage roles ───────────────────────────── */

type AdminDialogProps<T> = { admin: T | null; onOpenChange: (o: boolean) => void };

/** Keyed by admin id so each opening starts from fresh state. */
export function ManageRolesDialog(props: AdminDialogProps<AdminListItem>) {
  return <ManageRolesInner key={props.admin?.id ?? "closed"} {...props} />;
}

function ManageRolesInner({ admin, onOpenChange }: AdminDialogProps<AdminListItem>) {
  const queryClient = useQueryClient();
  const [roles, setRoles] = React.useState<Role[]>(admin?.roles ?? []);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!admin) return null;
  const changed = roles.length !== admin.roles.length || roles.some((r) => !admin.roles.includes(r));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminsService.setRoles(admin.id, roles);
      await queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast.success("Roles updated", { description: `${admin.displayName}'s access changes immediately.` });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!admin} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Manage roles — {admin.displayName}</DialogTitle>
          <DialogDescription>Locked roles are outside your authority. The server enforces the same rules.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <Notice tone="danger" icon={AlertTriangle}>
              {error}
            </Notice>
          )}
          <RolePicker value={roles} onChange={setRoles} assignable={admin.actions.assignableRoles} />
          {roles.length === 0 && <p className="text-xs text-destructive">An administrator must keep at least one role.</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!changed || roles.length === 0}>
            Save roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Reset password ───────────────────────────── */

export function ResetPasswordDialog(props: AdminDialogProps<AdminListItem>) {
  return <ResetPasswordInner key={props.admin?.id ?? "closed"} {...props} />;
}

function ResetPasswordInner({ admin, onOpenChange }: AdminDialogProps<AdminListItem>) {
  const [busy, setBusy] = React.useState(false);
  const [temp, setTemp] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (!admin) return null;
  return (
    <Dialog open={!!admin} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Reset password — {admin.displayName}</DialogTitle>
          <DialogDescription>A new temporary password is generated. All of their sessions are signed out.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {temp ? (
            <TemporaryPassword password={temp} username={admin.username} />
          ) : (
            <>
              {error && (
                <Notice tone="danger" icon={AlertTriangle} className="mb-3">
                  {error}
                </Notice>
              )}
              <p className="text-sm text-muted-foreground">They&apos;ll be required to choose a new password when they next sign in.</p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {temp ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await adminsService.resetPassword(admin.id);
                    setTemp(res.temporaryPassword);
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reset password
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Edit basic info ───────────────────────────── */

export function EditAdminDialog(props: AdminDialogProps<AdminDetail>) {
  return <EditAdminInner key={props.admin?.id ?? "closed"} {...props} />;
}

function EditAdminInner({ admin, onOpenChange }: AdminDialogProps<AdminDetail>) {
  const queryClient = useQueryClient();
  const [values, setValues] = React.useState({
    username: admin?.username ?? "",
    displayName: admin?.displayName ?? "",
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!admin) return null;
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Dialog open={!!admin} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await adminsService.update(admin.id, {
                username: values.username.trim().toLowerCase(),
                displayName: values.displayName.trim() || values.username.trim(),
              });
              await queryClient.invalidateQueries({ queryKey: ["admins"] });
              toast.success("Administrator updated");
              onOpenChange(false);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit administrator</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Notice tone="danger" icon={AlertTriangle}>
                {error}
              </Notice>
            )}
            <Field label="Username" required>
              <Input value={values.username} onChange={set("username")} />
            </Field>
            <Field label="Display name">
              <Input value={values.displayName} onChange={set("displayName")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
