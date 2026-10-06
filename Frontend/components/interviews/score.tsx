"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESULT_META } from "@/lib/constants";
import { computeScore, scoreTone } from "@/lib/score";
import { Tooltip } from "@/components/ui/controls";
import type { InterviewProgress } from "@/types/api";

const HOW = "Correct = 1 point, Partial = ½ point, Incorrect / Skipped / Not answered = 0. Out of all questions in the interview.";

/** Stacked bar of results, in result order. */
export function ScoreBar({ progress, className }: { progress: InterviewProgress; className?: string }) {
  const s = computeScore(progress);
  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full bg-border", className)}>
      {s.breakdown
        .filter((b) => b.result !== "NOT_SCORED" && b.count > 0)
        .map((b) => (
          <div key={b.result} className={RESULT_META[b.result].dot} style={{ width: `${(b.count / (s.total || 1)) * 100}%` }} />
        ))}
    </div>
  );
}

/** Small inline score, e.g. for tables. */
export function ScorePill({ progress }: { progress: InterviewProgress }) {
  const s = computeScore(progress);
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("tabular font-mono text-[13px] font-semibold", scoreTone(s.percent))}>{s.percent}%</span>
      <ScoreBar progress={progress} className="hidden h-1.5 w-14 sm:flex" />
    </span>
  );
}

/**
 * Full score panel: overall percentage plus the share of each result.
 * `layout="stack"` suits narrow side panels.
 */
export function ScoreSummary({ progress, layout = "grid" }: { progress: InterviewProgress; layout?: "grid" | "stack" }) {
  const s = computeScore(progress);
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-subtle-foreground">
            Score
            <Tooltip content={HOW}>
              <Info className="size-3 cursor-help" aria-label={HOW} />
            </Tooltip>
          </div>
          <div className={cn("tabular font-mono text-3xl leading-none font-semibold tracking-tight", scoreTone(s.percent))}>{s.percent}%</div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <div>
            <span className="tabular font-mono text-foreground">{s.points % 1 ? s.points.toFixed(1) : s.points}</span> / {s.total} points
          </div>
          <div>
            {s.answered} of {s.total} answered
          </div>
        </div>
      </div>
      <ScoreBar progress={progress} />
      <div className={cn("grid gap-1.5", layout === "grid" ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-1")}>
        {s.breakdown.map((b) => (
          <div
            key={b.result}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border bg-[#0c0c0f] px-2.5 py-1.5",
              layout === "grid" && "sm:flex-col sm:items-start sm:gap-0.5",
            )}
          >
            <span className="flex flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", RESULT_META[b.result].dot)} />
              {RESULT_META[b.result].label}
            </span>
            <span className="tabular font-mono text-[13px]">
              <span className="font-semibold text-foreground">{b.percent}%</span>
              <span className="ml-1 text-[11px] text-subtle-foreground">({b.count})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
