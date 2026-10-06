"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleSlash, PauseCircle, XCircle } from "lucide-react";
import { interviewsService } from "@/services/interviews";
import { errorMessage } from "@/lib/api-client";
import { FINAL_STATUS_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Notice } from "@/components/ui/feedback";
import { CHOICE_TONES, ChoiceIndicator, choiceClasses, useRadioKeys, type ChoiceTone } from "@/components/ui/choice";
import { RecordingLinksEditor, normalizeLinks } from "./recording-links";
import { ScoreSummary } from "./score";
import type { FinalStatus, InterviewDetail, InterviewProgress, InterviewStatus } from "@/types/api";

const ICONS: Record<FinalStatus, React.ComponentType<{ className?: string }>> = {
  PASSED: CheckCircle2,
  FAILED: XCircle,
  ON_HOLD: PauseCircle,
  CANCELLED: CircleSlash,
};
const TONE: Record<FinalStatus, ChoiceTone> = {
  PASSED: "success",
  FAILED: "danger",
  ON_HOLD: "warning",
  CANCELLED: "neutral",
};

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
  const radioKeys = useRadioKeys(
    options.map((o) => o.value),
    status,
    setStatus,
  );

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
          <ScoreSummary progress={progress} />
          {unscoredRequired > 0 && currentStatus === "IN_PROGRESS" && (
            <Notice tone="warning" icon={AlertTriangle}>
              {unscoredRequired} required question{unscoredRequired === 1 ? " has" : "s have"} not been answered. You can still finish.
            </Notice>
          )}
          <div>
            <div className="mb-2 text-[13px] font-medium">
              Decision <span className="text-primary">*</span>
              {!status && <span className="ml-2 text-xs font-normal text-muted-foreground">Select one</span>}
            </div>
            <div
              role="radiogroup"
              aria-label="Final result"
              className="grid gap-2 sm:grid-cols-2"
              {...radioKeys}
            >
              {options.map((o) => {
                const Icon = ICONS[o.value];
                const on = status === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on || (!status && o === options[0]) ? 0 : -1}
                    onClick={() => setStatus(o.value)}
                    className={cn(choiceClasses(on, TONE[o.value]), "flex items-center gap-3 p-3")}
                  >
                    <ChoiceIndicator checked={on} tone={TONE[o.value]} />
                    <Icon className={cn("size-5 shrink-0", on ? CHOICE_TONES[TONE[o.value]].text : "text-subtle-foreground")} />
                    <div className="min-w-0">
                      <div className={cn("text-sm font-semibold", on ? "" : "text-foreground")}>{o.label}</div>
                      <div className={cn("text-xs", on ? "opacity-80" : "text-muted-foreground")}>{o.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
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
