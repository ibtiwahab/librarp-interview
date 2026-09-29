"use client";

import * as React from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileSpreadsheet,
  FileText,
  FileUp,
  GripVertical,
  Info,
  Loader2,
  ShieldCheck,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { useQuestionSets } from "@/hooks/queries";
import { questionSetsService, questionsService } from "@/services/questions";
import { ApiError, errorMessage } from "@/lib/api-client";
import { ACCEPTED_IMPORT_TYPES, INTERVIEW_TYPE_META, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { cn, pluralize } from "@/lib/utils";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Checkbox, Switch, Tooltip } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/feedback";
import type {
  ColumnMapping,
  DetectedQuestion,
  DuplicateMatch,
  ImportPreview,
  ImportResult,
  InterviewType,
  Organization,
  OrganizationCode,
} from "@/types/api";

type Stage = "setup" | "processing" | "review" | "importing" | "done";

interface Row extends DetectedQuestion {
  selected: boolean;
  allowDuplicate: boolean;
}

const NEW_SET = "__new__";
const EMPTY_DUPES = new Map<string, DuplicateMatch>();

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: "question", label: "Question", required: true },
  { key: "expectedAnswer", label: "Answer" },
  { key: "followUp", label: "Follow up" },
  { key: "category", label: "Category" },
  { key: "required", label: "Required" },
  { key: "order", label: "Order" },
  { key: "notes", label: "Notes" },
];

function toRows(qs: DetectedQuestion[]): Row[] {
  return qs.map((q) => ({ ...q, selected: !q.flags.some((f) => f.startsWith("Duplicate of another")), allowDuplicate: false }));
}

function columnLetter(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ───────────────────────────── Row editor ───────────────────────────── */

function ReviewRow({
  row,
  index,
  total,
  duplicate,
  onChange,
  onRemove,
  onMove,
}: {
  row: Row;
  index: number;
  total: number;
  duplicate?: DuplicateMatch;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const controls = useDragControls();
  const [expanded, setExpanded] = React.useState(false);
  const warn = row.confidence !== "high" || row.flags.length > 0;

  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "relative rounded-lg border bg-[#0e0e11] transition-colors",
        row.selected ? "border-border" : "border-border opacity-50",
        duplicate && row.selected && !row.allowDuplicate && "border-warning/30",
      )}
    >
      <div className="flex items-start gap-2 p-2.5">
        <button
          className="mt-1.5 cursor-grab touch-none text-subtle-foreground hover:text-muted-foreground active:cursor-grabbing"
          onPointerDown={(e) => controls.start(e)}
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <Checkbox className="mt-2" checked={row.selected} onCheckedChange={(v) => onChange({ selected: v === true })} aria-label="Include question" />
        <span className="tabular mt-1.5 w-7 shrink-0 text-right font-mono text-[11px] text-subtle-foreground">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <Textarea
            value={row.questionText}
            onChange={(e) => onChange({ questionText: e.target.value })}
            rows={1}
            className="min-h-9 resize-none border-transparent bg-transparent px-2 py-1.5 text-[13px] shadow-none focus-visible:border-input focus-visible:bg-[#0c0c0f] [field-sizing:content]"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 px-2">
            {row.followUpPrompts.length > 0 && <Badge tone="gold">{pluralize(row.followUpPrompts.length, "follow-up")}</Badge>}
            {row.expectedAnswer && <Badge tone="info">Answer</Badge>}
            {row.category && <Badge>{row.category}</Badge>}
            {!row.required && <Badge tone="base">Optional</Badge>}
            {duplicate && (
              <Tooltip content={<span>Matches existing: “{duplicate.existingText}”</span>}>
                <span>
                  <Badge tone="warning">
                    <Copy /> {duplicate.kind === "exact" ? "Duplicate" : `Similar (${Math.round(duplicate.similarity * 100)}%)`}
                  </Badge>
                </span>
              </Tooltip>
            )}
            {warn &&
              row.flags.map((f) => (
                <Tooltip key={f} content={f}>
                  <span>
                    <Badge tone={row.confidence === "low" ? "danger" : "warning"}>
                      <AlertTriangle /> {row.confidence === "low" ? "Check" : "Review"}
                    </Badge>
                  </span>
                </Tooltip>
              ))}
            <button onClick={() => setExpanded((e) => !e)} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
              Details <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
          {duplicate && row.selected && (
            <label className="mt-1.5 flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
              <Checkbox checked={row.allowDuplicate} onCheckedChange={(v) => onChange({ allowDuplicate: v === true })} />
              Import anyway
            </label>
          )}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="grid gap-3 px-2 pt-3 pb-1 sm:grid-cols-2">
                  <Field label="Follow-up prompts (one per line)" className="sm:col-span-2">
                    <Textarea
                      rows={2}
                      value={row.followUpPrompts.join("\n")}
                      onChange={(e) => onChange({ followUpPrompts: e.target.value.split("\n") })}
                      onBlur={(e) => onChange({ followUpPrompts: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                    />
                  </Field>
                  <Field label="Expected answer">
                    <Textarea rows={2} value={row.expectedAnswer} onChange={(e) => onChange({ expectedAnswer: e.target.value })} />
                  </Field>
                  <Field label="Interviewer notes">
                    <Textarea rows={2} value={row.interviewerNotes} onChange={(e) => onChange({ interviewerNotes: e.target.value })} />
                  </Field>
                  <Field label="Category">
                    <Input value={row.category} onChange={(e) => onChange({ category: e.target.value })} />
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
                    <Switch checked={row.required} onCheckedChange={(v) => onChange({ required: v })} /> Required
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <Button variant="ghost" size="icon-sm" className="size-7" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" className="size-7" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-sm" className="size-7 hover:text-destructive" onClick={onRemove} aria-label="Remove row">
            <Trash2 />
          </Button>
        </div>
      </div>
    </Reorder.Item>
  );
}

/* ───────────────────────────── Wizard ───────────────────────────── */

function ImportWizardDialog({
  open,
  onOpenChange,
  organizations,
  initial,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizations: Organization[];
  initial?: { interviewType?: InterviewType; organization?: OrganizationCode; questionSet?: string };
  onImported?: (setId: string) => void;
}) {
  const queryClient = useQueryClient();
  const manageable = organizations.filter((o) => o.canManageQuestions);
  const types = (Object.keys(INTERVIEW_TYPE_META) as InterviewType[]).filter((t) => manageable.some((o) => o.category === t));

  // This component is mounted only while the dialog is open, so initial state
  // is derived straight from the props.
  const [stage, setStage] = React.useState<Stage>("setup");
  const [type, setType] = React.useState<InterviewType | "">(() =>
    initial?.interviewType && types.includes(initial.interviewType) ? initial.interviewType : types.length === 1 ? types[0]! : "",
  );
  const [org, setOrg] = React.useState<OrganizationCode | "">(() =>
    initial?.organization && manageable.some((o) => o.code === initial.organization) ? initial.organization : "",
  );
  const [setChoice, setSetChoice] = React.useState(initial?.questionSet ?? "");
  const [newSetName, setNewSetName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [dupState, setDupState] = React.useState<{ key: string; map: Map<string, DuplicateMatch> }>({ key: "", map: new Map() });
  const [strategy, setStrategy] = React.useState<"skip" | "import">("skip");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [showWarnings, setShowWarnings] = React.useState(false);
  const [mappingOpen, setMappingOpen] = React.useState(false);
  const [sheetIndex, setSheetIndex] = React.useState(0);
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null);
  const [hasHeader, setHasHeader] = React.useState(true);
  const [mappingBusy, setMappingBusy] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const sets = useQuestionSets({ organization: (org || undefined) as OrganizationCode | undefined, includeInactive: true }, !!org);

  // The destination set defaults to the organization's default set.
  const defaultSetId = sets.data ? ((sets.data.find((s) => s.isDefault) ?? sets.data[0])?.id ?? NEW_SET) : "";
  const setId =
    setChoice && (setChoice === NEW_SET || sets.data?.some((s) => s.id === setChoice)) ? setChoice : org ? defaultSetId : "";

  // Re-check duplicates whenever the destination or question texts change.
  const dupKey =
    stage === "review" && setId && setId !== NEW_SET && rows.length > 0 ? `${setId}:${JSON.stringify(rows.map((r) => r.questionText))}` : "";
  const duplicates = dupState.key === dupKey ? dupState.map : EMPTY_DUPES;
  React.useEffect(() => {
    if (!dupKey) return;
    const ctrl = { cancelled: false };
    const snapshot = rows.map((r) => ({ id: r.tempId, text: r.questionText }));
    const target = setId;
    const t = setTimeout(async () => {
      try {
        const res = await questionsService.checkDuplicates(
          target,
          snapshot.map((s) => s.text),
        );
        if (ctrl.cancelled) return;
        setDupState({ key: dupKey, map: new Map(res.duplicates.map((d) => [snapshot[d.index]!.id, d])) });
      } catch {
        // Non-fatal: the server re-checks on import anyway.
      }
    }, 500);
    return () => {
      ctrl.cancelled = true;
      clearTimeout(t);
    };
    // dupKey captures setId + every question text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey]);

  const orgObj = manageable.find((o) => o.code === org);
  const destinationReady = !!org && !!setId && (setId !== NEW_SET || newSetName.trim().length >= 2);

  const pickFile = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_IMPORT_TYPES.split(",").includes(ext)) {
      setError(`This file type is not supported. Upload one of: ${ACCEPTED_IMPORT_TYPES.replaceAll(",", ", ")}.`);
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`This file is ${formatBytes(f.size)}. The maximum upload size is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    setFile(f);
  };

  const process = async () => {
    if (!file) return;
    setError(null);
    setStage("processing");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const data = await questionsService.importPreview(file, setId && setId !== NEW_SET ? setId : undefined, ctrl.signal);
      setPreview(data);
      setRows(toRows(data.detectedQuestions));
      setWarnings(data.warnings);
      if (data.tables?.length) {
        setSheetIndex(0);
        setMapping(data.tables[0]!.mapping ?? { question: 0 });
        setHasHeader(data.tables[0]!.hasHeader);
        setMappingOpen(data.detectedQuestions.length === 0 || data.tables[0]!.guessed);
      }
      setStage("review");
    } catch (err) {
      if (ctrl.signal.aborted) {
        setStage("setup");
        return;
      }
      setError(errorMessage(err));
      setStage("setup");
    } finally {
      abortRef.current = null;
    }
  };

  const applyMapping = async () => {
    const table = preview?.tables?.[sheetIndex];
    if (!table || !mapping) return;
    setMappingBusy(true);
    try {
      const res = await questionsService.importMap(table.rows, mapping, hasHeader);
      setRows(toRows(res.detectedQuestions));
      setWarnings(res.warnings);
      toast.success(`${pluralize(res.detectedQuestions.length, "question")} mapped from “${table.sheetName}”`);
    } catch (err) {
      toast.error("Couldn't apply mapping", { description: errorMessage(err) });
    } finally {
      setMappingBusy(false);
    }
  };

  const selected = rows.filter((r) => r.selected && r.questionText.trim().length >= 3);
  const selectedDupes = selected.filter((r) => duplicates.has(r.tempId));
  const willSkip = strategy === "skip" ? selectedDupes.filter((r) => !r.allowDuplicate).length : 0;
  const importCount = selected.length - willSkip;

  const doImport = async () => {
    setError(null);
    setStage("importing");
    try {
      let target = setId;
      if (setId === NEW_SET) {
        const created = await questionSetsService.create({
          name: newSetName.trim(),
          description: preview ? `Imported from ${preview.fileName}` : "",
          organization: org as OrganizationCode,
          isDefault: false,
        });
        target = created.id;
        setSetChoice(created.id);
      }
      const res = await questionsService.bulkImport({
        questionSet: target,
        fileName: preview?.fileName,
        duplicateStrategy: strategy,
        questions: selected.map((r) => ({
          questionText: r.questionText.trim(),
          followUpPrompts: r.followUpPrompts.map((f) => f.trim()).filter(Boolean),
          expectedAnswer: r.expectedAnswer.trim(),
          interviewerNotes: r.interviewerNotes.trim(),
          category: r.category.trim(),
          required: r.required,
          active: true,
          allowDuplicate: r.allowDuplicate || undefined,
        })),
      });
      setResult(res);
      setStage("done");
      await queryClient.invalidateQueries({ queryKey: ["questions"] });
      await queryClient.invalidateQueries({ queryKey: ["question-sets"] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      onImported?.(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
      setStage("review");
    }
  };

  const updateRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.tempId === id ? { ...r, ...patch } : r)));
  const moveRow = (i: number, d: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [item] = next.splice(i, 1);
      next.splice(i + d, 0, item!);
      return next;
    });

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const someSelected = rows.some((r) => r.selected);
  const table = preview?.tables?.[sheetIndex];
  const width = table ? table.rows.reduce((w, r) => Math.max(w, r.length), 0) : 0;
  const lowConfidence = rows.filter((r) => r.confidence !== "high" || r.flags.length).length;

  const close = (o: boolean) => {
    if (!o && stage === "processing") abortRef.current?.abort();
    if (!o && stage === "importing") return;
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size={stage === "review" ? "full" : "lg"} className="h-auto sm:max-h-[90dvh]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {stage === "done" ? "Import complete" : orgObj ? `Import ${orgObj.shortName} questions` : "Import questions from a document"}
          </DialogTitle>
          <DialogDescription>
            {stage === "review"
              ? `Review what was detected in ${preview?.fileName}. Nothing is saved until you press Import.`
              : "Upload a Word, PDF, Excel, CSV or text document. It is read in memory and never stored."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Stage 1: setup ── */}
        {stage === "setup" && (
          <DialogBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Interview type" required>
                <NativeSelect
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as InterviewType);
                    setOrg("");
                    setSetChoice("");
                  }}
                >
                  <option value="">Select…</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {INTERVIEW_TYPE_META[t].label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Organization" required>
                <NativeSelect
                  value={org}
                  disabled={!type}
                  onChange={(e) => {
                    setOrg(e.target.value as OrganizationCode);
                    setSetChoice("");
                  }}
                >
                  <option value="">Select…</option>
                  {manageable
                    .filter((o) => o.category === type)
                    .map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Question set" required>
                <NativeSelect value={setId} disabled={!org || sets.isLoading} onChange={(e) => setSetChoice(e.target.value)}>
                  {!org && <option value="">Select…</option>}
                  {(sets.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                  {org && <option value={NEW_SET}>+ New question set…</option>}
                </NativeSelect>
              </Field>
            </div>
            {setId === NEW_SET && (
              <Field label="New set name" required hint="Created when you confirm the import.">
                <Input value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder={`${orgObj?.shortName ?? ""} Leadership — Season 2`} />
              </Field>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
              role="button"
              tabIndex={0}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dragOver ? "border-primary bg-primary-soft" : "border-border-strong bg-[#0c0c0f] hover:border-muted-foreground/40",
              )}
            >
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_IMPORT_TYPES}
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {file ? (
                <>
                  {/\.(xlsx|xls|csv)$/i.test(file.name) ? <FileSpreadsheet className="size-8 text-primary" /> : <FileText className="size-8 text-primary" />}
                  <div className="mt-3 text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{formatBytes(file.size)} · click to choose another file</div>
                </>
              ) : (
                <>
                  <Upload className="size-7 text-muted-foreground" />
                  <div className="mt-3 text-sm font-medium">Drop a document here or click to browse</div>
                  <div className="mt-1 text-xs text-muted-foreground">.docx · .pdf · .xlsx · .xls · .csv · .txt — up to {formatBytes(MAX_UPLOAD_BYTES)}</div>
                </>
              )}
            </div>
            {error && (
              <Notice tone="danger" icon={AlertTriangle}>
                {error}
              </Notice>
            )}
            <Notice tone="info" icon={ShieldCheck}>
              The document is parsed in server memory and discarded immediately. Only the questions you approve are saved.
            </Notice>
          </DialogBody>
        )}

        {/* ── Stage 2: processing ── */}
        {(stage === "processing" || stage === "importing") && (
          <DialogBody className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative grid size-14 place-items-center rounded-xl border border-primary/30 bg-primary-soft">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
            <div className="mt-5 text-sm font-medium">{stage === "processing" ? "Processing document…" : `Importing ${pluralize(importCount, "question")}…`}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {stage === "processing" ? "Extracting numbered questions, follow-ups and answers." : "Checking duplicates and saving to the question bank."}
            </div>
          </DialogBody>
        )}

        {/* ── Stage 3: review ── */}
        {stage === "review" && preview && (
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Questions detected", rows.length, ""],
                ["Possible duplicates", duplicates.size, duplicates.size ? "text-warning" : ""],
                ["Needs review", lowConfidence, lowConfidence ? "text-warning" : ""],
                ["Warnings", warnings.length, warnings.length ? "text-info" : ""],
              ].map(([label, n, tone]) => (
                <div key={label as string} className="rounded-md border border-border bg-[#0c0c0f] px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className={cn("tabular font-mono text-lg font-semibold", tone as string)}>{n}</div>
                </div>
              ))}
            </div>

            {warnings.length > 0 && (
              <div className="rounded-md border border-info/25 bg-info-soft">
                <button onClick={() => setShowWarnings((s) => !s)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#b9c8ea]">
                  <Info className="size-4" /> {pluralize(warnings.length, "warning")} from extraction
                  <ChevronDown className={cn("ml-auto size-4 transition-transform", showWarnings && "rotate-180")} />
                </button>
                {showWarnings && (
                  <ul className="space-y-1 border-t border-info/20 px-3 py-2 text-xs text-[#b9c8ea]/90">
                    {warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {preview.tables && preview.tables.length > 0 && (
              <div className="rounded-md border border-border">
                <button onClick={() => setMappingOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]">
                  <Table2 className="size-4 text-primary" /> Column mapping
                  {table?.guessed && <Badge tone="warning">Guessed</Badge>}
                  <ChevronDown className={cn("ml-auto size-4 transition-transform", mappingOpen && "rotate-180")} />
                </button>
                {mappingOpen && table && mapping && (
                  <div className="space-y-3 border-t border-border p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      {preview.tables.length > 1 && (
                        <Field label="Sheet">
                          <NativeSelect
                            value={sheetIndex}
                            onChange={(e) => {
                              const i = Number(e.target.value);
                              setSheetIndex(i);
                              setMapping(preview.tables![i]!.mapping ?? { question: 0 });
                              setHasHeader(preview.tables![i]!.hasHeader);
                            }}
                            className="w-44"
                          >
                            {preview.tables.map((t, i) => (
                              <option key={i} value={i}>
                                {t.sheetName}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                      )}
                      <label className="flex h-9 items-center gap-2 text-[13px]">
                        <Switch checked={hasHeader} onCheckedChange={setHasHeader} /> First row is a header
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                      {MAPPING_FIELDS.map((f) => (
                        <Field key={f.key} label={f.label} required={f.required}>
                          <NativeSelect
                            value={mapping[f.key] ?? ""}
                            onChange={(e) =>
                              setMapping((m) => ({ ...m!, [f.key]: e.target.value === "" ? (f.required ? 0 : null) : Number(e.target.value) }))
                            }
                          >
                            {!f.required && <option value="">—</option>}
                            {Array.from({ length: width }).map((_, c) => (
                              <option key={c} value={c}>
                                {columnLetter(c)}
                                {hasHeader && table.rows[0]?.[c] ? ` · ${String(table.rows[0][c]).slice(0, 18)}` : ""}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                      ))}
                    </div>
                    <div className="scroll-thin overflow-x-auto rounded border border-border">
                      <table className="text-[11px]">
                        <tbody>
                          {table.rows.slice(0, 4).map((r, i) => (
                            <tr key={i} className={cn("border-b border-border last:border-0", i === 0 && hasHeader && "text-primary")}>
                              {Array.from({ length: width }).map((_, c) => (
                                <td key={c} className={cn("max-w-48 truncate px-2 py-1", c === mapping.question && "bg-primary-soft")}>
                                  {r[c]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button size="sm" variant="secondary" onClick={applyMapping} loading={mappingBusy}>
                      Apply mapping
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-[#0c0c0f] px-3 py-2">
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => setRows((rs) => rs.map((r) => ({ ...r, selected: v === true })))}
                />
                Select all
              </label>
              <span className="text-xs text-muted-foreground">{selected.length} selected</span>
              {rows.some((r) => !r.selected) && (
                <Button variant="ghost" size="xs" onClick={() => setRows((rs) => rs.filter((r) => r.selected))}>
                  <Trash2 /> Remove unselected
                </Button>
              )}
              {duplicates.size > 0 && (
                <div className="ml-auto flex items-center gap-2 text-[13px]">
                  <span className="text-warning">{pluralize(duplicates.size, "possible duplicate")}</span>
                  <NativeSelect value={strategy} onChange={(e) => setStrategy(e.target.value as "skip" | "import")} className="h-8 w-40">
                    <option value="skip">Skip duplicates</option>
                    <option value="import">Import anyway</option>
                  </NativeSelect>
                </div>
              )}
            </div>

            {rows.length === 0 ? (
              <Notice tone="warning" icon={AlertTriangle}>
                No questions are left to import.{preview.tables?.length ? " Adjust the column mapping above." : ""}
              </Notice>
            ) : (
              <Reorder.Group axis="y" values={rows} onReorder={setRows} className="space-y-1.5">
                {rows.map((r, i) => (
                  <ReviewRow
                    key={r.tempId}
                    row={r}
                    index={i}
                    total={rows.length}
                    duplicate={duplicates.get(r.tempId)}
                    onChange={(p) => updateRow(r.tempId, p)}
                    onRemove={() => setRows((rs) => rs.filter((x) => x.tempId !== r.tempId))}
                    onMove={(d) => moveRow(i, d)}
                  />
                ))}
              </Reorder.Group>
            )}
            {error && (
              <Notice tone="danger" icon={AlertTriangle}>
                {error}
              </Notice>
            )}
          </DialogBody>
        )}

        {/* ── Stage 4: done ── */}
        {stage === "done" && result && (
          <DialogBody className="flex flex-col items-center py-12 text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid size-14 place-items-center rounded-xl border border-success/40 bg-success-soft">
              <CheckCircle2 className="size-7 text-success" />
            </motion.div>
            <div className="mt-5 text-lg font-semibold">{pluralize(result.imported, "question")} imported</div>
            {result.skipped > 0 && <div className="mt-1 text-sm text-muted-foreground">{pluralize(result.skipped, "duplicate")} skipped</div>}
            {result.skippedQuestions.length > 0 && (
              <ul className="scroll-thin mt-5 max-h-40 w-full max-w-lg space-y-1 overflow-y-auto rounded-md border border-border p-3 text-left text-xs text-muted-foreground">
                {result.skippedQuestions.map((s, i) => (
                  <li key={i}>
                    <span className="text-foreground">{s.questionText}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-5 text-xs text-muted-foreground">The uploaded document was not stored.</p>
          </DialogBody>
        )}

        <DialogFooter>
          {stage === "setup" && (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={process} disabled={!file || !destinationReady}>
                <FileUp /> Process document
              </Button>
            </>
          )}
          {stage === "processing" && (
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          )}
          {stage === "review" && (
            <>
              <Button variant="ghost" className="sm:mr-auto" onClick={() => setStage("setup")}>
                Choose another file
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={doImport} disabled={importCount === 0}>
                Import {pluralize(importCount, "Question")}
              </Button>
            </>
          )}
          {stage === "done" && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface WizardProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizations: Organization[];
  initial?: { interviewType?: InterviewType; organization?: OrganizationCode; questionSet?: string };
  onImported?: (setId: string) => void;
}

/** The wizard is mounted only while open, so every import starts from a clean slate. */
export function ImportWizard(props: WizardProps) {
  return props.open ? <ImportWizardDialog {...props} /> : null;
}
