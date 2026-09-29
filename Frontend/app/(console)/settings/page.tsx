"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ClipboardList, KeyRound, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations, useSettings } from "@/hooks/queries";
import { organizationsService, settingsService } from "@/services/misc";
import { errorMessage } from "@/lib/api-client";
import { CANDIDATE_FIELD_META, INTERVIEW_TYPE_META } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { RoleList } from "@/components/domain/badges";
import { OrgEmblem } from "@/components/domain/org-emblem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppSettings, CandidateFieldKey, Organization } from "@/types/api";

function AccountTab() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Contact a senior administrator to change these details.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-[13px]">
            {[
              ["Display name", user.displayName],
              ["Username", `@${user.username}`],
              ["Last sign-in", formatDateTime(user.lastLoginAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-subtle-foreground">{k}</dt>
                <dd className="mt-0.5">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-[11px] text-subtle-foreground">Roles</dt>
              <dd className="mt-1">
                <RoleList roles={user.roles} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Changing your password signs out your other sessions.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

function CandidateFieldsTab() {
  const settings = useSettings();
  if (settings.error) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  if (!settings.data) return <Skeleton className="h-80 w-full" />;
  return <CandidateFieldsForm initial={settings.data.candidateFields} />;
}

function CandidateFieldsForm({ initial }: { initial: AppSettings["candidateFields"] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await settingsService.update({ candidateFields: draft });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Candidate fields updated");
    } catch (err) {
      toast.error("Couldn't save settings", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Candidate information fields</CardTitle>
          <CardDescription>Choose which fields interviewers record before starting, and which are mandatory. Candidate name is always required.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {(Object.keys(draft) as CandidateFieldKey[]).map((k) => (
          <div key={k} className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="text-[13px] font-medium">{CANDIDATE_FIELD_META[k].label}</div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <Switch checked={draft[k].enabled} onCheckedChange={(v) => setDraft({ ...draft, [k]: { enabled: v, required: v && draft[k].required } })} />
                Shown
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={draft[k].required}
                  disabled={!draft[k].enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, [k]: { ...draft[k], required: v } })}
                />
                Required
              </label>
            </div>
          </div>
        ))}
        <div className="pt-3">
          <Button onClick={save} loading={saving}>
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Rendered only while editing, keyed by organization, so state starts from the saved values. */
function OrgEditor({ org, onClose }: { org: Organization; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState({
    name: org.name,
    shortName: org.shortName,
    description: org.description,
    logo: org.logo,
    color: org.color,
    defaultPosition: org.defaultPosition,
    active: org.active,
  });
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Edit {org.shortName}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex items-center gap-3">
            <OrgEmblem org={{ ...org, ...v }} size="lg" />
            <p className="text-xs text-muted-foreground">Leave the logo empty to use the generated emblem. Put image files in the frontend&apos;s /public/orgs folder.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={v.name} onChange={set("name")} />
            </Field>
            <Field label="Short name">
              <Input value={v.shortName} onChange={set("shortName")} />
            </Field>
            <Field label="Logo path or URL" hint="e.g. /orgs/fib.png">
              <Input value={v.logo} onChange={set("logo")} />
            </Field>
            <Field label="Accent colour">
              <div className="flex gap-2">
                <input type="color" value={v.color} onChange={set("color")} className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent" />
                <Input value={v.color} onChange={set("color")} className="font-mono" />
              </div>
            </Field>
            <Field label="Default position" className="sm:col-span-2">
              <Input value={v.defaultPosition} onChange={set("defaultPosition")} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea rows={2} value={v.description} onChange={set("description")} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={v.active} onCheckedChange={(a) => setV((s) => ({ ...s, active: a }))} /> Active (available for new interviews)
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await organizationsService.update(org.code, v);
                await queryClient.invalidateQueries({ queryKey: ["organizations"] });
                toast.success(`${v.shortName} updated`);
                onClose();
              } catch (err) {
                toast.error("Couldn't save organization", { description: errorMessage(err) });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrganizationsTab() {
  const orgs = useOrganizations(true);
  const [editing, setEditing] = React.useState<Organization | null>(null);
  if (orgs.error) return <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />;
  if (!orgs.data) return <Skeleton className="h-80 w-full" />;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <div>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>Display names, logos and availability. Codes and categories are fixed.</CardDescription>
        </div>
      </CardHeader>
      {orgs.data.organizations.map((o) => (
        <div key={o.code} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
          <OrgEmblem org={o} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">
              {o.name} {!o.active && <span className="text-xs text-destructive">(inactive)</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {INTERVIEW_TYPE_META[o.category].label} · <span className="font-mono">{o.code}</span>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setEditing(o)}>
            Edit
          </Button>
        </div>
      ))}
      {editing && <OrgEditor key={editing.code} org={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const admin = can("canManageSettings");
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" description="Your account, and system configuration for senior administrators." />
      <PageBody>
        <Tabs defaultValue="account">
          <TabsList className="mb-6">
            <TabsTrigger value="account">
              <UserRound /> Account
            </TabsTrigger>
            {admin && (
              <TabsTrigger value="candidate">
                <ClipboardList /> Candidate fields
              </TabsTrigger>
            )}
            {admin && (
              <TabsTrigger value="orgs">
                <Building2 /> Organizations
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="account">
            <AccountTab />
          </TabsContent>
          {admin && (
            <TabsContent value="candidate">
              <CandidateFieldsTab />
            </TabsContent>
          )}
          {admin && (
            <TabsContent value="orgs">
              <OrganizationsTab />
            </TabsContent>
          )}
        </Tabs>
        {!admin && (
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRound className="size-3.5" /> System settings are managed by Head Admins and the Executive Director.
          </p>
        )}
      </PageBody>
    </>
  );
}
