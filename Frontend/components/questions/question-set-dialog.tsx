"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { questionSetsService } from "@/services/questions";
import { errorMessage } from "@/lib/api-client";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/controls";
import { Notice } from "@/components/ui/feedback";
import type { Organization, OrganizationCode, QuestionSet } from "@/types/api";

export type QuestionSetDialogMode =
  | { kind: "create"; organization: Organization }
  | { kind: "edit"; set: QuestionSet }
  | { kind: "duplicate"; set: QuestionSet };

interface Props {
  mode: QuestionSetDialogMode | null;
  onOpenChange: (o: boolean) => void;
  organizations: Organization[];
  onSaved?: (set: QuestionSet) => void;
}

function initialName(mode: QuestionSetDialogMode): string {
  if (mode.kind === "create") return `${mode.organization.shortName} ${mode.organization.category === "ADMIN" ? "Interview" : "Leadership"} — `;
  if (mode.kind === "edit") return mode.set.name;
  return `${mode.set.name} (copy)`;
}

/** Mounted only while the dialog is open, so state initialises from the current mode. */
function QuestionSetForm({ mode, onOpenChange, organizations, onSaved }: Props & { mode: QuestionSetDialogMode }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(() => initialName(mode));
  const [description, setDescription] = React.useState(mode.kind === "edit" ? mode.set.description : "");
  const [isDefault, setIsDefault] = React.useState(mode.kind === "edit" ? mode.set.isDefault : false);
  const [active, setActive] = React.useState(mode.kind === "edit" ? mode.set.active : true);
  const [org, setOrg] = React.useState<OrganizationCode>(mode.kind === "create" ? mode.organization.code : mode.set.organization);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const sameCategory =
    mode.kind === "duplicate" ? organizations.filter((o) => o.category === mode.set.interviewType && o.canManageQuestions) : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Give the set a name.");
      return;
    }
    setSaving(true);
    try {
      let saved: QuestionSet;
      if (mode.kind === "create") {
        saved = await questionSetsService.create({ name: name.trim(), description, organization: mode.organization.code, isDefault });
      } else if (mode.kind === "edit") {
        saved = await questionSetsService.update(mode.set.id, {
          name: name.trim(),
          description,
          active,
          ...(isDefault && !mode.set.isDefault ? { isDefault: true } : {}),
        });
      } else {
        saved = await questionSetsService.duplicate(mode.set.id, { name: name.trim(), organization: org });
      }
      await queryClient.invalidateQueries({ queryKey: ["question-sets"] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success(mode.kind === "create" ? "Question set created" : mode.kind === "edit" ? "Question set updated" : "Question set duplicated");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{mode.kind === "create" ? "New question set" : mode.kind === "edit" ? "Edit question set" : "Duplicate question set"}</DialogTitle>
        <DialogDescription>
          {mode.kind === "duplicate"
            ? "Copies every question into a new set — useful for a revised season."
            : "An organization can have several sets; one is the default used for new interviews."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {error && (
          <Notice tone="danger" icon={AlertTriangle}>
            {error}
          </Notice>
        )}
        <Field label="Name" htmlFor="sn" required>
          <Input id="sn" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {mode.kind !== "duplicate" && (
          <Field label="Description" htmlFor="sd">
            <Textarea id="sd" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        )}
        {mode.kind === "duplicate" && sameCategory.length > 1 && (
          <Field label="Organization" htmlFor="so">
            <NativeSelect id="so" value={org} onChange={(e) => setOrg(e.target.value as OrganizationCode)}>
              {sameCategory.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {mode.kind !== "duplicate" && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span>
                Default set
                <span className="block text-xs text-muted-foreground">Used automatically when starting an interview.</span>
              </span>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} disabled={mode.kind === "edit" && mode.set.isDefault} />
            </label>
            {mode.kind === "edit" && (
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span>
                  Active
                  <span className="block text-xs text-muted-foreground">Inactive sets can&apos;t be used for new interviews.</span>
                </span>
                <Switch checked={active} onCheckedChange={setActive} disabled={mode.set.isDefault} />
              </label>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {mode.kind === "create" ? "Create set" : mode.kind === "edit" ? "Save" : "Duplicate"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function QuestionSetDialog(props: Props) {
  return (
    <Dialog open={!!props.mode} onOpenChange={props.onOpenChange}>
      <DialogContent size="md">{props.mode && <QuestionSetForm {...props} mode={props.mode} />}</DialogContent>
    </Dialog>
  );
}
