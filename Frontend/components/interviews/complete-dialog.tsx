"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleSlash, PauseCircle, XCircle } from "lucide-react";
import { interviewsService } from "@/services/interviews";
import { errorMessage } from "@/lib/api-client";
import { FINAL_STATUS_OPTIONS, RESULT_META, RESULT_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Notice } from "@/components/ui/feedback";
import { RecordingLinksEditor, normalizeLinks } from "./recording-links";
import type { FinalStatus, InterviewDetail, InterviewProgress, InterviewStatus } from "@/types/api";

const ICONS: Record<FinalStatus, React.ComponentType<{ className?: string }>> = {
  PASSED: CheckCircle2,
  FAILED: XCircle,
  ON_HOLD: PauseCircle,
  CANCELLED: CircleSlash,
};
const TONE: Record<FinalStatus, string> = {
  PASSED: "data-[on=true]:border-success/60 data-[on=true]:bg-success-soft [&_svg]:text-success",
  FAILED: "data-[on=true]:border-destructive/60 data-[on=true]:bg-destructive-soft [&_svg]:text-destructive",
  ON_HOLD: "data-[on=true]:border-warning/60 data-[on=true]:bg-warning-soft [&_svg]:text-warning",
  CANCELLED: "data-[on=true]:border-border-strong data-[on=true]:bg-muted [&_svg]:text-muted-foreground",
};

export function ProgressSummary({ progress }: { progress: InterviewProgress }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {RESULT_ORDER.map((r) => (
        <div key={r} className="rounded-md border border-border bg-[#0c0c0f] px-2 py-2 text-center">
          <div className="tabular font-mono text-lg font-semibold">{progress[r]}</div>
          <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", RESULT_META[r].dot)} />
            {RESULT_META[r].label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Records the human interviewer's decision. The system never decides on its
 * own whether a candidate passes.
 */
export function CompleteInterviewDialog({
  open,
  onOpenChange,
  interview,
  progress,
  currentStatus,
  beforeSubmit,
  unscoredRequired = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interview: InterviewDetail;
  progress: InterviewProgress;
  currentStatus: InterviewStatus;
  beforeSubmit?: () => Promise<void>;
  unscoredRequired?: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<FinalStatus | null>(null);
  const [finalComments, setFinalComments] = React.useState(interview.finalComments);
  const [strengths, setStrengths] = React.useState(interview.strengths);
  const [concerns, setConcerns] = React.useState(interview.concerns);
  const [links, setLinks] = React.useState<string[]>(interview.recordingLinks ?? []);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const options = FINAL_STATUS_OPTIONS.filter((o) => currentStatus !== "ON_HOLD" || o.value !== "ON_HOLD");

  const submit = async () => {
    if (!status) {
      setError("Choose the final result.");
      return;
    }
    const recording = normalizeLinks(links);
    if (recording.error) {
      setError(recording.error);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await beforeSubmit?.();
      await interviewsService.complete(interview.id, { status, finalComments, strengths, concerns, recordingLinks: recording.links });
      await queryClient.invalidateQueries({ queryKey: ["interviews"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      try {
        localStorage.removeItem(`lrp.interview.${interview.id}.draft`);
      } catch {
        // ignore
      }
      toast.success("Decision recorded", { description: `${interview.candidate.name} — ${options.find((o) => o.value === status)?.label}` });
      onOpenChange(false);
      router.push(`/interviews/${interview.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{currentStatus === "ON_HOLD" ? "Resolve on-hold interview" : "Finish interview"}</DialogTitle>
          <DialogDescription>
            You decide the outcome for <span className="text-foreground">{interview.candidate.name}</span>. Scores are for reference only.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <ProgressSummary progress={progress} />
          {unscoredRequired > 0 && currentStatus === "IN_PROGRESS" && (
            <Notice tone="warning" icon={AlertTriangle}>
              {unscoredRequired} required question{unscoredRequired === 1 ? " has" : "s have"} not been scored. You can still finish.
            </Notice>
          )}
          <div role="radiogroup" aria-label="Final result" className="grid gap-2 sm:grid-cols-2">
            {options.map((o) => {
              const Icon = ICONS[o.value];
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={status === o.value}
                  data-on={status === o.value}
                  onClick={() => setStatus(o.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-[#0c0c0f] p-3 text-left transition-colors hover:border-border-strong",
                    TONE[o.value],
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{o.label}</div>
                    <div className="text-xs text-muted-foreground">{o.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <Field label="Final comments" htmlFor="fc">
            <Textarea id="fc" rows={3} value={finalComments} onChange={(e) => setFinalComments(e.target.value)} placeholder="Overall assessment and reasoning…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Strengths" htmlFor="st">
              <Textarea id="st" rows={3} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
            </Field>
            <Field label="Concerns" htmlFor="co">
              <Textarea id="co" rows={3} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
            </Field>
          </div>
          <Field label="Recording / stream link" hint="YouTube, Medal, Google Drive… You can still add or change this later from the interview record.">
            <RecordingLinksEditor value={links} onChange={setLinks} />
          </Field>
          {error && (
            <Notice tone="danger" icon={AlertTriangle}>
              {error}
            </Notice>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep interviewing
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!status}>
            Record decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
