"use client";

import * as React from "react";
import { Suspense } from "react";
import { Reorder } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownUp,
  Copy,
  FileUp,
  FolderInput,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useOrganizations, useQuestions, useQuestionSets, useSetCategories } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { questionSetsService, questionsService, type BulkAction } from "@/services/questions";
import { errorMessage } from "@/lib/api-client";
import { INTERVIEW_TYPE_META } from "@/lib/constants";
import { cn, pluralize } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { RequireCapability } from "@/components/layout/require-auth";
import { OrgEmblem } from "@/components/domain/org-emblem";
import { QuestionEditorDialog } from "@/components/questions/question-editor-dialog";
import { QuestionSetDialog } from "@/components/questions/question-set-dialog";
import { ImportWizard } from "@/components/questions/import-wizard";
import { QuestionRow, ReorderRow } from "@/components/questions/question-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Checkbox, Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/label";
import type { InterviewType, Organization, OrganizationCode, Question, QuestionSet } from "@/types/api";

const DEFAULTS = { type: "", org: "", set: "" };
const NO_SELECTION: Set<string> = new Set();

type Confirm =
  | { kind: "deleteQuestion"; q: Question }
  | { kind: "deleteSet"; set: QuestionSet }
  | { kind: "bulkDelete"; ids: string[] }
  | null;

function QuestionBank() {
  const queryClient = useQueryClient();
  const orgsQuery = useOrganizations();
  const [url, setUrl] = useUrlState(DEFAULTS);

  const orgs = React.useMemo(() => (orgsQuery.data?.organizations ?? []).filter((o) => o.canViewQuestions), [orgsQuery.data]);
  const types = (Object.keys(INTERVIEW_TYPE_META) as InterviewType[]).filter((t) => orgs.some((o) => o.category === t));
  const type = (types.includes(url.type as InterviewType) ? url.type : types[0] ?? "") as InterviewType | "";
  const typeOrgs = orgs.filter((o) => o.category === type);
  const org: Organization | undefined = typeOrgs.find((o) => o.code === url.org) ?? typeOrgs[0];

  const canManage = !!org?.canManageQuestions;
  const setsQuery = useQuestionSets({ organization: org?.code, includeInactive: canManage }, !!org);
  const sets = React.useMemo(() => setsQuery.data ?? [], [setsQuery.data]);
  const set = sets.find((s) => s.id === url.set) ?? sets.find((s) => s.isDefault) ?? sets[0];

  const questionsQuery = useQuestions({ questionSet: set?.id, limit: 1000 }, !!set);
  const categoriesQuery = useSetCategories(set?.id);
  const all = React.useMemo(() => questionsQuery.data?.items ?? [], [questionsQuery.data]);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  // Selection and reorder mode are scoped to the current set: switching sets clears them.
  const [selection, setSelection] = React.useState<{ setId?: string; ids: Set<string> }>({ ids: new Set() });
  const selected = selection.setId === set?.id ? selection.ids : NO_SELECTION;
  const setSelected = (next: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    setSelection((prev) => {
      const base = prev.setId === set?.id ? prev.ids : NO_SELECTION;
      return { setId: set?.id, ids: typeof next === "function" ? next(base) : next };
    });
  const [reorderFor, setReorderFor] = React.useState<string | null>(null);
  const reordering = !!set && reorderFor === set.id;
  const setReordering = (on: boolean) => setReorderFor(on ? (set?.id ?? null) : null);
  const [orderDraft, setOrderDraft] = React.useState<Question[]>([]);
  const [savingOrder, setSavingOrder] = React.useState(false);
  const [editor, setEditor] = React.useState<{ open: boolean; question: Question | null }>({ open: false, question: null });
  const [setDialog, setSetDialog] = React.useState<React.ComponentProps<typeof QuestionSetDialog>["mode"]>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm>(null);
  const [busy, setBusy] = React.useState(false);
  const [moveDialog, setMoveDialog] = React.useState<null | "move" | "copy">(null);
  const [categoryDialog, setCategoryDialog] = React.useState(false);

  const filtered = all.filter((q) => {
    if (statusFilter === "active" && !q.active) return false;
    if (statusFilter === "inactive" && q.active) return false;
    if (categoryFilter && q.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        q.questionText.toLowerCase().includes(s) ||
        q.category.toLowerCase().includes(s) ||
        q.followUpPrompts.some((f) => f.toLowerCase().includes(s)) ||
        q.expectedAnswer.toLowerCase().includes(s)
      );
    }
    return true;
  });
  const numberOf = new Map(all.map((q, i) => [q.id, i + 1]));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["questions"] });
    await queryClient.invalidateQueries({ queryKey: ["question-sets"] });
    await queryClient.invalidateQueries({ queryKey: ["organizations"] });
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(label);
      return true;
    } catch (err) {
      toast.error("Action failed", { description: errorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action: BulkAction, label: string) => {
    const ok = await run(label, () => questionsService.bulkAction(action));
    if (ok) setSelected(new Set());
  };

  const rowActions = {
    onEdit: (q: Question) => setEditor({ open: true, question: q }),
    onDuplicate: (q: Question) => run("Question duplicated", () => questionsService.duplicate(q.id)),
    onToggleActive: (q: Question) => run(q.active ? "Question deactivated" : "Question activated", () => questionsService.update(q.id, { active: !q.active })),
    onDelete: (q: Question) => setConfirm({ kind: "deleteQuestion", q }),
  };

  const startReorder = () => {
    setOrderDraft(all);
    setReordering(true);
    setSelected(new Set());
  };
  const saveOrder = async () => {
    if (!set) return;
    setSavingOrder(true);
    const ok = await run("Order saved", () => questionsService.reorder(set.id, orderDraft.map((q) => q.id)));
    setSavingOrder(false);
    if (ok) setReordering(false);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id));
  const selectedIds = [...selected];

  if (orgsQuery.error) return <ErrorState error={orgsQuery.error} onRetry={() => orgsQuery.refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow="Question bank"
        title="Interview questions"
        description="Organised by interview type, organization and question set. Interviews snapshot their questions, so edits never rewrite history."
        actions={
          orgs.some((o) => o.canManageQuestions) && (
            <Button onClick={() => setImportOpen(true)}>
              <FileUp /> Import document
            </Button>
          )
        }
      />
      <PageBody className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        {/* Filters: type → organization */}
        <aside className="space-y-4">
          {types.length > 0 && (
            <Tabs value={type} onValueChange={(v) => setUrl({ type: v, org: "", set: "" })}>
              <TabsList className="w-full">
                {types.map((t) => (
                  <TabsTrigger key={t} value={t} className="flex-1">
                    {INTERVIEW_TYPE_META[t].short}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <div className="space-y-0.5">
            {orgsQuery.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)
              : typeOrgs.map((o) => (
                  <button
                    key={o.code}
                    onClick={() => setUrl({ type, org: o.code, set: "" })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                      o.code === org?.code ? "bg-[#17171c]" : "hover:bg-[#121216]",
                    )}
                  >
                    <OrgEmblem org={o} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{o.shortName}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {o.defaultQuestionSet ? `${o.defaultQuestionSet.questionCount} questions` : "No default set"}
                      </div>
                    </div>
                  </button>
                ))}
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 space-y-4">
          {!org ? (
            <Card>
              <EmptyState icon={Library} title="No question banks available" description="Your roles don't include any interview categories." />
            </Card>
          ) : (
            <>
              <Card className="p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <OrgEmblem org={org} />
                    <div className="min-w-0 flex-1">
                      {setsQuery.isLoading ? (
                        <Skeleton className="h-9 w-64" />
                      ) : sets.length ? (
                        <NativeSelect value={set?.id} onChange={(e) => setUrl({ type, org: org.code, set: e.target.value })} className="max-w-md font-medium">
                          {sets.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                              {s.isDefault ? " ★" : ""}
                              {!s.active ? " (inactive)" : ""}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <div className="text-sm text-muted-foreground">No question sets for {org.name} yet.</div>
                      )}
                      {set && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {set.isDefault && (
                            <Badge tone="gold">
                              <Star /> Default
                            </Badge>
                          )}
                          {!set.active && <Badge tone="danger">Inactive</Badge>}
                          <span>
                            {set.activeQuestionCount} active · {set.questionCount} total
                          </span>
                          {set.description && <span className="truncate">· {set.description}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSetDialog({ kind: "create", organization: org })}>
                        <Plus /> New set
                      </Button>
                      {set && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="icon-sm" aria-label="Set actions">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => setSetDialog({ kind: "edit", set })}>
                              <Pencil /> Edit set
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setSetDialog({ kind: "duplicate", set })}>
                              <Copy /> Duplicate set
                            </DropdownMenuItem>
                            {!set.isDefault && (
                              <DropdownMenuItem onSelect={() => run("Default set updated", () => questionSetsService.update(set.id, { isDefault: true, active: true }))}>
                                <Star /> Make default
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setConfirm({ kind: "deleteSet", set })}>
                              <Trash2 /> Delete set
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {set && (
                <Card className="overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center">
                    {reordering ? (
                      <div className="flex flex-1 items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">Drag questions into the order they should be asked.</span>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setReordering(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={saveOrder} loading={savingOrder}>
                            Save order
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
                          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions, follow-ups, answers…" className="pl-9" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="w-32">
                            <option value="all">All</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </NativeSelect>
                          {(categoriesQuery.data?.length ?? 0) > 0 && (
                            <NativeSelect value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-40">
                              <option value="">All categories</option>
                              {categoriesQuery.data!.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                          {canManage && (
                            <>
                              <Button variant="secondary" size="sm" className="h-9" onClick={startReorder} disabled={all.length < 2}>
                                <ArrowDownUp /> Reorder
                              </Button>
                              <Button size="sm" className="h-9" onClick={() => setEditor({ open: true, question: null })}>
                                <Plus /> Add question
                              </Button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {canManage && !reordering && filtered.length > 0 && (
                    <div className="flex items-center gap-3 border-b border-border bg-[#0d0d10] px-4 py-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={allFilteredSelected ? true : selected.size ? "indeterminate" : false}
                        onCheckedChange={(v) => setSelected(v === true ? new Set(filtered.map((q) => q.id)) : new Set())}
                        aria-label="Select all"
                      />
                      {selected.size ? `${selected.size} selected` : `${filtered.length} of ${all.length} shown`}
                    </div>
                  )}

                  {questionsQuery.error ? (
                    <ErrorState error={questionsQuery.error} onRetry={() => questionsQuery.refetch()} />
                  ) : questionsQuery.isLoading ? (
                    <div className="space-y-2 p-4">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : reordering ? (
                    <Reorder.Group axis="y" values={orderDraft} onReorder={setOrderDraft}>
                      {orderDraft.map((q, i) => (
                        <ReorderRow key={q.id} q={q} number={i + 1} />
                      ))}
                    </Reorder.Group>
                  ) : filtered.length === 0 ? (
                    <EmptyState
                      icon={Library}
                      title={all.length ? "No questions match" : "This set is empty"}
                      description={all.length ? "Adjust your search or filters." : canManage ? "Add questions one by one or import them from a document." : undefined}
                      action={
                        !all.length && canManage ? (
                          <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setEditor({ open: true, question: null })}>
                              <Plus /> Add question
                            </Button>
                            <Button onClick={() => setImportOpen(true)}>
                              <FileUp /> Import document
                            </Button>
                          </div>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div>
                      {filtered.map((q) => (
                        <QuestionRow
                          key={q.id}
                          q={q}
                          number={numberOf.get(q.id) ?? 0}
                          canManage={canManage}
                          selected={selected.has(q.id)}
                          onSelect={(v) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (v) n.add(q.id);
                              else n.delete(q.id);
                              return n;
                            })
                          }
                          actions={rowActions}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      </PageBody>

      {/* Bulk action bar */}
      {selected.size > 0 && canManage && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border-strong bg-[#141418]/95 p-1.5 shadow-2xl backdrop-blur">
            <span className="px-3 text-[13px] font-medium">{selected.size} selected</span>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => bulk({ action: "activate", ids: selectedIds }, "Questions activated")}>
              <Power /> Activate
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => bulk({ action: "deactivate", ids: selectedIds }, "Questions deactivated")}>
              <PowerOff /> Deactivate
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCategoryDialog(true)}>
              <Tag /> Category
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMoveDialog("move")}>
              <FolderInput /> Move
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMoveDialog("copy")}>
              <Copy /> Copy
            </Button>
            <Button variant="destructive-ghost" size="sm" disabled={busy} onClick={() => setConfirm({ kind: "bulkDelete", ids: selectedIds })}>
              <Trash2 /> Delete
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      )}

      {set && (
        <QuestionEditorDialog
          open={editor.open}
          onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}
          questionSetId={set.id}
          question={editor.question}
          categories={categoriesQuery.data ?? []}
        />
      )}
      <QuestionSetDialog
        mode={setDialog}
        onOpenChange={(o) => !o && setSetDialog(null)}
        organizations={orgsQuery.data?.organizations ?? []}
        onSaved={(s) => setUrl({ type: s.interviewType, org: s.organization, set: s.id })}
      />
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        organizations={orgsQuery.data?.organizations ?? []}
        initial={{ interviewType: type || undefined, organization: org?.code, questionSet: set?.id }}
        onImported={(id) => {
          const target = sets.find((s) => s.id === id);
          if (target || org) setUrl({ type, org: target?.organization ?? org?.code ?? "", set: id });
        }}
      />
      {moveDialog && (
        <MoveDialog
          mode={moveDialog}
          onClose={() => setMoveDialog(null)}
          type={type || undefined}
          currentSetId={set?.id}
          orgs={orgs}
          onConfirm={async (target) => {
            await bulk(
              { action: moveDialog, ids: selectedIds, targetQuestionSet: target },
              moveDialog === "move" ? "Questions moved" : "Questions copied",
            );
            setMoveDialog(null);
          }}
        />
      )}
      {categoryDialog && (
        <CategoryDialog
          open
          onClose={() => setCategoryDialog(false)}
          categories={categoriesQuery.data ?? []}
          onConfirm={async (category) => {
            await bulk({ action: "setCategory", ids: selectedIds, category }, "Category updated");
            setCategoryDialog(false);
          }}
        />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          {confirm?.kind === "deleteQuestion" && (
            <>
              <AlertDialogTitle>Delete this question?</AlertDialogTitle>
              <AlertDialogDescription>
                “{confirm.q.questionText}” will be removed from the set. Past interviews keep their own copy. Consider deactivating instead if you may need
                it again.
              </AlertDialogDescription>
            </>
          )}
          {confirm?.kind === "bulkDelete" && (
            <>
              <AlertDialogTitle>Delete {pluralize(confirm.ids.length, "question")}?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone. Past interviews are not affected.</AlertDialogDescription>
            </>
          )}
          {confirm?.kind === "deleteSet" && (
            <>
              <AlertDialogTitle>Delete “{confirm.set.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                The set and its {pluralize(confirm.set.questionCount, "question")} will be permanently removed. Past interviews that used it keep their
                snapshots.
              </AlertDialogDescription>
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={busy}
              onClick={async () => {
                if (!confirm) return;
                if (confirm.kind === "deleteQuestion") await run("Question deleted", () => questionsService.remove(confirm.q.id));
                if (confirm.kind === "bulkDelete") await bulk({ action: "delete", ids: confirm.ids }, "Questions deleted");
                if (confirm.kind === "deleteSet") {
                  const ok = await run("Question set deleted", () => questionSetsService.remove(confirm.set.id));
                  if (ok) setUrl({ type, org: org?.code ?? "", set: "" });
                }
                setConfirm(null);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MoveDialog({
  mode,
  onClose,
  onConfirm,
  type,
  currentSetId,
  orgs,
}: {
  mode: null | "move" | "copy";
  onClose: () => void;
  onConfirm: (targetSetId: string) => Promise<void>;
  type?: InterviewType;
  currentSetId?: string;
  orgs: Organization[];
}) {
  const sets = useQuestionSets({ interviewType: type, includeInactive: true }, !!mode && !!type);
  const [target, setTarget] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const options = (sets.data ?? []).filter((s) => s.canManage && s.id !== currentSetId);
  const orgName = (code: OrganizationCode) => orgs.find((o) => o.code === code)?.shortName ?? code;

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{mode === "move" ? "Move questions" : "Copy questions"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field label="Destination question set">
            <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Select…</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {orgName(s.organization)} — {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {sets.data && options.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No other question sets you can manage in this category.</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!target}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(target);
              setBusy(false);
            }}
          >
            {mode === "move" ? "Move" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  open,
  onClose,
  onConfirm,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (c: string) => Promise<void>;
  categories: string[];
}) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Set category</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field label="Category" hint="Leave empty to clear the category.">
            <Input list={id} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <datalist id={id}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(value.trim());
              setBusy(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function QuestionsPage() {
  return (
    <RequireCapability anyOf={["canManageQuestions", "canInterviewState", "canInterviewCrime", "canInterviewAdmins"]}>
      <Suspense fallback={<Skeleton className="m-8 h-64" />}>
        <QuestionBank />
      </Suspense>
    </RequireCapability>
  );
}
