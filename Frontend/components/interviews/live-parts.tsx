"use client";

import * as React from "react";
import { motion } from "motion/react";
import { AlertCircle, Check, CloudOff, CornerDownRight, Eye, EyeOff, Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESULT_META, RESULT_ORDER } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { Kbd, Tooltip } from "@/components/ui/controls";
import { ChoiceIndicator, choiceClasses, type ChoiceTone } from "@/components/ui/choice";
import type { SaveStatus, AnswerState } from "@/hooks/use-interview-autosave";
import type { InterviewQuestion, QuestionResult } from "@/types/api";

export function SaveIndicator({
  status,
  lastSavedAt,
  error,
  onRetry,
}: {
  status: SaveStatus;
  lastSavedAt: string | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive-soft px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20"
        title={error ?? undefined}
      >
        <CloudOff className="size-3.5" /> Save failed — retry <RotateCw className="size-3" />
      </button>
    );
  }
  if (status === "retrying") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-warning" title="Your notes are kept on this device and will sync automatically.">
        <Loader2 className="size-3.5 animate-spin" /> Reconnecting… notes kept on this device
      </span>
    );
  }
  if (status === "saving" || status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={lastSavedAt ?? undefined}>
      <Check className="size-3.5 text-success" /> {lastSavedAt ? `Saved ${formatRelative(lastSavedAt).toLowerCase()}` : "All changes saved"}
    </span>
  );
}

const RESULT_TONE: Record<QuestionResult, ChoiceTone> = {
  CORRECT: "success",
  PARTIAL: "warning",
  INCORRECT: "danger",
  SKIPPED: "neutral",
  NOT_SCORED: "neutral",
};

/**
 * One-of-five result selector. The chosen option gets a filled check circle,
 * solid coloured border and tint; the rest stay grey. (Arrow keys are left to
 * question navigation — use 1–4 / 0 as shortcuts.)
 */
export function ResultPicker({ value, onChange, disabled }: { value: QuestionResult; onChange: (r: QuestionResult) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Question result" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {RESULT_ORDER.map((r) => {
        const meta = RESULT_META[r];
        const on = value === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(r)}
            title={`${meta.label} (key ${meta.key})`}
            className={cn(choiceClasses(on, RESULT_TONE[r]), "flex h-11 items-center gap-2 px-2.5 text-[13px] font-medium")}
          >
            <ChoiceIndicator checked={on} tone={RESULT_TONE[r]} />
            <span className="min-w-0 flex-1 truncate">{meta.label}</span>
          </button>
        );
      })}
      <p className="col-span-full hidden text-[11px] text-subtle-foreground md:block">
        Keyboard: {RESULT_ORDER.map((r) => `${RESULT_META[r].key} ${RESULT_META[r].label}`).join(" · ")}
      </p>
    </div>
  );
}

export function QuestionNavigator({
  questions,
  answers,
  currentIndex,
  onSelect,
}: {
  questions: InterviewQuestion[];
  answers: Record<string, AnswerState>;
  currentIndex: number;
  onSelect: (i: number) => void;
}) {
  const activeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentIndex]);

  return (
    <nav aria-label="Questions" className="space-y-px">
      {questions.map((q, i) => {
        const a = answers[q.id];
        // Show a category heading whenever it changes from the previous question.
        const showCat = !!q.category && q.category !== questions[i - 1]?.category;
        const hasNotes = !!a?.candidateAnswerNotes?.trim();
        return (
          <React.Fragment key={q.id}>
            {showCat && <div className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">{q.category}</div>}
            <button
              ref={i === currentIndex ? activeRef : undefined}
              onClick={() => onSelect(i)}
              className={cn(
                "group flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors",
                i === currentIndex ? "bg-[#18181d] text-foreground" : "text-muted-foreground hover:bg-[#131317] hover:text-foreground",
              )}
            >
              <span className={cn("tabular mt-px w-6 shrink-0 font-mono text-[11px]", i === currentIndex ? "text-primary" : "text-subtle-foreground")}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="line-clamp-2 flex-1 leading-snug">{q.questionText}</span>
              <span className="mt-1 flex shrink-0 items-center gap-1">
                {hasNotes && a?.result === "NOT_SCORED" && <span className="size-1 rounded-full bg-muted-foreground" />}
                <span className={cn("size-2 rounded-full", RESULT_META[a?.result ?? "NOT_SCORED"].dot)} />
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export function QuestionCard({
  question,
  index,
  total,
  showReference,
  onToggleReference,
}: {
  question: InterviewQuestion;
  index: number;
  total: number;
  showReference: boolean;
  onToggleReference: () => void;
}) {
  const hasReference = !!question.expectedAnswer || !!question.guidance;
  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-primary">
          Question {index + 1} <span className="text-subtle-foreground">/ {total}</span>
        </span>
        {question.category && <span className="rounded border border-border-strong px-1.5 py-px text-[11px] text-muted-foreground">{question.category}</span>}
        {!question.required && <span className="rounded border border-border px-1.5 py-px text-[11px] text-subtle-foreground">Optional</span>}
      </div>

      <h2 className="mt-3 text-xl leading-snug font-medium tracking-tight text-balance sm:text-2xl">{question.questionText}</h2>

      {question.followUpPrompts.length > 0 && (
        <div className="mt-5 space-y-1.5">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-subtle-foreground uppercase">Follow-up</div>
          {question.followUpPrompts.map((f, i) => (
            <div key={i} className="flex gap-2 text-[14px] leading-relaxed text-secondary-foreground">
              <CornerDownRight className="mt-1 size-3.5 shrink-0 text-primary/70" />
              {f}
            </div>
          ))}
        </div>
      )}

      {hasReference && (
        <div className="mt-5">
          <button
            onClick={onToggleReference}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {showReference ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showReference ? "Hide reference" : "Show reference"} <Kbd>R</Kbd>
          </button>
          {showReference && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 space-y-2 overflow-hidden">
              {question.expectedAnswer && (
                <div className="rounded-md border border-primary/20 bg-primary-soft/60 px-3 py-2.5 text-[13px] leading-relaxed">
                  <div className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-primary uppercase">Expected answer</div>
                  <p className="whitespace-pre-wrap text-secondary-foreground">{question.expectedAnswer}</p>
                </div>
              )}
              {question.guidance && (
                <div className="rounded-md border border-border bg-[#0c0c0f] px-3 py-2.5 text-[13px] leading-relaxed">
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    <AlertCircle className="size-3" /> Interviewer guidance
                  </div>
                  <p className="whitespace-pre-wrap text-secondary-foreground">{question.guidance}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function ShortcutHelp() {
  return (
    <Tooltip
      side="bottom"
      content={
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 py-1">
          <span>
            <Kbd>←</Kbd> <Kbd>→</Kbd>
          </span>
          <span>Previous / next question</span>
          <span>
            <Kbd>Alt</Kbd>+<Kbd>←→</Kbd>
          </span>
          <span>Navigate while typing</span>
          <span>
            <Kbd>Ctrl</Kbd>+<Kbd>↵</Kbd>
          </span>
          <span>Next question</span>
          <span>
            <Kbd>1</Kbd>–<Kbd>4</Kbd>, <Kbd>0</Kbd>
          </span>
          <span>Correct · Partial · Incorrect · Skipped · Not answered</span>
          <span>
            <Kbd>N</Kbd>
          </span>
          <span>Focus answer notes</span>
          <span>
            <Kbd>R</Kbd>
          </span>
          <span>Toggle reference answer</span>
        </div>
      }
    >
      <button className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground md:inline-flex">
        <Kbd>?</Kbd> Shortcuts
      </button>
    </Tooltip>
  );
}
