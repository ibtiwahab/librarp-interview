"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Flag, ListOrdered, PanelRightClose, PanelRightOpen, UserRound, X } from "lucide-react";
import { useInterview } from "@/hooks/queries";
import { useInterviewAutosave } from "@/hooks/use-interview-autosave";
import { useOrgLookup } from "@/components/domain/interview-row";
import { OrgEmblem } from "@/components/domain/org-emblem";
import { StatusBadge } from "@/components/domain/badges";
import { CompleteInterviewDialog } from "@/components/interviews/complete-dialog";
import { QuestionCard, QuestionNavigator, ResultPicker, SaveIndicator, ShortcutHelp } from "@/components/interviews/live-parts";
import { ConnectingScreen } from "@/components/layout/connecting-screen";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/feedback";
import { Kbd } from "@/components/ui/controls";
import { CANDIDATE_FIELD_META, RESULT_META, RESULT_ORDER } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InterviewDetail, InterviewProgress, QuestionResult } from "@/types/api";

const KEY_TO_RESULT: Record<string, QuestionResult> = Object.fromEntries(RESULT_ORDER.map((r) => [RESULT_META[r].key, r]));

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function LiveInterview({ interview }: { interview: InterviewDetail }) {
  const router = useRouter();
  const orgOf = useOrgLookup();
  const org = orgOf(interview.organization);
  const editable = interview.permissions.canEdit;
  const save = useInterviewAutosave(interview, editable);
  const { answers, currentIndex, setCurrentIndex, update } = save;

  const [showReference, setShowReference] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const [sideOpen, setSideOpen] = React.useState(true);
  const [finishOpen, setFinishOpen] = React.useState(false);
  const notesRef = React.useRef<HTMLTextAreaElement>(null);

  const total = interview.questions.length;
  const question = interview.questions[currentIndex]!;
  const answer = answers[question.id]!;

  const progress: InterviewProgress = React.useMemo(() => {
    const p: InterviewProgress = { total, answered: 0, CORRECT: 0, PARTIAL: 0, INCORRECT: 0, SKIPPED: 0, NOT_SCORED: 0 };
    for (const q of interview.questions) {
      const a = answers[q.id]!;
      p[a.result]++;
      if (a.result !== "NOT_SCORED" || a.candidateAnswerNotes.trim()) p.answered++;
    }
    return p;
  }, [answers, interview.questions, total]);

  const scored = total - progress.NOT_SCORED;
  const unscoredRequired = interview.questions.filter((q) => q.required && answers[q.id]!.result === "NOT_SCORED").length;

  const go = React.useCallback(
    (delta: number) => {
      const next = currentIndex + delta;
      if (next < 0 || next >= total) return;
      setCurrentIndex(next);
      setShowReference(false);
    },
    [currentIndex, total, setCurrentIndex],
  );

  // Keyboard controls.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finishOpen) return;
      const typing = isTyping(e.target);
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (currentIndex === total - 1) setFinishOpen(true);
        else go(1);
        return;
      }
      if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        go(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "r") setShowReference((s) => !s);
      else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        notesRef.current?.focus();
      } else if (editable && KEY_TO_RESULT[e.key]) update(question.id, { result: KEY_TO_RESULT[e.key]! });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, currentIndex, total, finishOpen, editable, update, question.id]);

  const exit = async () => {
    await save.flush().catch(() => undefined);
    router.push("/dashboard");
  };

  const c = interview.candidate;
  const candidateFacts: [string, string | number | null | undefined][] = [
    [CANDIDATE_FIELD_META.discordUsername.label, c.discordUsername],
    [CANDIDATE_FIELD_META.discordId.label, c.discordId],
    [CANDIDATE_FIELD_META.inGameName.label, c.inGameName],
    [CANDIDATE_FIELD_META.inGameId.label, c.inGameId],
    [CANDIDATE_FIELD_META.age.label, c.age],
    [CANDIDATE_FIELD_META.timezone.label, c.timezone],
    ["Position", interview.positionAppliedFor],
    ["Interview date", formatDate(interview.interviewDate)],
  ];

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="relative shrink-0 border-b border-border bg-[#0b0b0d]">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <Button variant="ghost" size="icon-sm" onClick={exit} aria-label="Leave interview (progress is saved)">
            <X />
          </Button>
          <OrgEmblem org={org} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{c.name}</span>
              {!editable && <StatusBadge status={interview.status} />}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {org.shortName} · {interview.positionAppliedFor || "Leadership"} · {interview.questionSet.name}
            </div>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <ShortcutHelp />
            {editable && <SaveIndicator status={save.status} lastSavedAt={save.lastSavedAt} error={save.error} onRetry={save.retry} />}
          </div>
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setNavOpen((o) => !o)}>
            <ListOrdered /> <span className="tabular font-mono">{currentIndex + 1}/{total}</span>
          </Button>
          {editable && (
            <Button size="sm" onClick={() => setFinishOpen(true)}>
              <Flag /> <span className="hidden sm:inline">Finish</span>
            </Button>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-border">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${((currentIndex + 1) / total) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Navigator */}
        <aside
          className={cn(
            "scroll-thin w-72 shrink-0 overflow-y-auto border-r border-border bg-[#0b0b0d] p-2",
            navOpen ? "absolute inset-y-[3.6rem] left-0 z-20 block shadow-2xl" : "hidden lg:block",
          )}
        >
          <div className="flex items-center justify-between px-3 pt-2 pb-2 text-xs text-muted-foreground">
            <span>
              <span className="tabular font-mono text-foreground">{scored}</span> of {total} scored
            </span>
            <span className="tabular font-mono">{Math.round((scored / total) * 100)}%</span>
          </div>
          <QuestionNavigator
            questions={interview.questions}
            answers={answers}
            currentIndex={currentIndex}
            onSelect={(i) => {
              setCurrentIndex(i);
              setShowReference(false);
              setNavOpen(false);
            }}
          />
        </aside>

        {/* Main question area */}
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
              <QuestionCard
                key={question.id}
                question={question}
                index={currentIndex}
                total={total}
                showReference={showReference}
                onToggleReference={() => setShowReference((s) => !s)}
              />

            <div className="mt-8 space-y-5">
              <div>
                <Label className="mb-2">Result</Label>
                <ResultPicker value={answer.result} onChange={(r) => update(question.id, { result: r })} disabled={!editable} />
              </div>
              <div>
                <Label htmlFor="answer-notes" className="mb-2 justify-between">
                  Candidate answer
                  <span className="text-[11px] font-normal text-subtle-foreground">
                    <Kbd>N</Kbd> to focus
                  </span>
                </Label>
                <Textarea
                  id="answer-notes"
                  ref={notesRef}
                  rows={5}
                  readOnly={!editable}
                  value={answer.candidateAnswerNotes}
                  onChange={(e) => update(question.id, { candidateAnswerNotes: e.target.value })}
                  placeholder="Summarise what the candidate said…"
                  className="text-[14px]"
                />
              </div>
              <div>
                <Label htmlFor="interviewer-notes" className="mb-2">
                  Interviewer notes <span className="text-[11px] font-normal text-subtle-foreground">(private to staff)</span>
                </Label>
                <Textarea
                  id="interviewer-notes"
                  rows={3}
                  readOnly={!editable}
                  value={answer.interviewerNotes}
                  onChange={(e) => update(question.id, { interviewerNotes: e.target.value })}
                  placeholder="Your observations, tone, red flags…"
                />
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
              <Button variant="secondary" onClick={() => go(-1)} disabled={currentIndex === 0}>
                <ArrowLeft /> Previous
              </Button>
              <span className="tabular font-mono text-xs text-muted-foreground">
                {currentIndex + 1} / {total}
              </span>
              {currentIndex < total - 1 ? (
                <Button onClick={() => go(1)}>
                  Next <ArrowRight />
                </Button>
              ) : editable ? (
                <Button onClick={() => setFinishOpen(true)}>
                  <Flag /> Finish interview
                </Button>
              ) : (
                <Button asChild variant="secondary">
                  <Link href={`/interviews/${interview.id}`}>View record</Link>
                </Button>
              )}
            </div>
            <div className="mt-4 flex justify-center md:hidden">
              {editable && <SaveIndicator status={save.status} lastSavedAt={save.lastSavedAt} error={save.error} onRetry={save.retry} />}
            </div>
          </div>
        </main>

        {/* Candidate panel */}
        <aside className={cn("scroll-thin hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-[#0b0b0d] xl:block", !sideOpen && "xl:hidden")}>
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UserRound className="size-4 text-primary" /> Candidate
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setSideOpen(false)} aria-label="Hide candidate panel">
              <PanelRightClose />
            </Button>
          </div>
          <dl className="space-y-3 px-5 py-4 text-[13px]">
            {candidateFacts
              .filter(([, v]) => v !== undefined && v !== null && v !== "")
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-subtle-foreground">{k}</dt>
                  <dd className={cn("mt-0.5 break-words", (k.includes("ID") || k.includes("Id")) && "font-mono")}>{String(v)}</dd>
                </div>
              ))}
          </dl>
          {interview.additionalNotes && (
            <div className="border-t border-border px-5 py-4">
              <div className="mb-1 text-[11px] text-subtle-foreground">Notes</div>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-secondary-foreground">{interview.additionalNotes}</p>
            </div>
          )}
          <div className="border-t border-border px-5 py-4">
            <div className="mb-3 text-[11px] text-subtle-foreground">Running tally</div>
            <div className="space-y-2">
              {RESULT_ORDER.filter((r) => r !== "NOT_SCORED").map((r) => (
                <div key={r} className="flex items-center gap-2 text-xs">
                  <span className={cn("size-2 rounded-full", RESULT_META[r].dot)} />
                  <span className="flex-1 text-muted-foreground">{RESULT_META[r].label}</span>
                  <span className="tabular font-mono">{progress[r]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-border">
              {(["CORRECT", "PARTIAL", "INCORRECT", "SKIPPED"] as const).map((r) => (
                <div key={r} className={RESULT_META[r].dot} style={{ width: `${(progress[r] / total) * 100}%` }} />
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-subtle-foreground">Scores are guidance. The final decision is yours.</p>
          </div>
        </aside>
        {!sideOpen && (
          <button
            onClick={() => setSideOpen(true)}
            className="absolute right-3 bottom-3 hidden rounded-md border border-border bg-[#141418] p-2 text-muted-foreground hover:text-foreground xl:block"
            aria-label="Show candidate panel"
          >
            <PanelRightOpen className="size-4" />
          </button>
        )}
      </div>

      {editable && (
        <CompleteInterviewDialog
          open={finishOpen}
          onOpenChange={setFinishOpen}
          interview={interview}
          progress={progress}
          currentStatus={interview.status}
          unscoredRequired={unscoredRequired}
          beforeSubmit={() => save.flush()}
        />
      )}
    </div>
  );
}

export default function LiveInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, refetch, isLoading } = useInterview(id);

  // Completed interviews open as a record instead.
  React.useEffect(() => {
    if (data && data.status !== "IN_PROGRESS") router.replace(`/interviews/${id}`);
  }, [data, id, router]);

  if (isLoading) return <ConnectingScreen state="restoring" />;
  if (error || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't open this interview" />
      </div>
    );
  }
  if (data.status !== "IN_PROGRESS") return <ConnectingScreen state="restoring" />;
  if (data.questions.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState error={new Error("This interview has no questions.")} title="Nothing to ask" />
      </div>
    );
  }
  return <LiveInterview interview={data} />;
}
