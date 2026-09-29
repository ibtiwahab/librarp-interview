"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CornerDownRight, Gavel, PlayCircle, Printer, Trash2 } from "lucide-react";
import { useInterview } from "@/hooks/queries";
import { interviewsService } from "@/services/interviews";
import { errorMessage } from "@/lib/api-client";
import { CANDIDATE_FIELD_META, INTERVIEW_TYPE_META, RESULT_META } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { useOrgLookup } from "@/components/domain/interview-row";
import { OrgEmblem } from "@/components/domain/org-emblem";
import { StatusBadge } from "@/components/domain/badges";
import { CompleteInterviewDialog, ProgressSummary } from "@/components/interviews/complete-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/dialog";

function Fact({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <dt className="text-[11px] text-subtle-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-[13px] break-words", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">{title}</div>
      <p className={cn("text-[13px] leading-relaxed whitespace-pre-wrap", text ? "text-secondary-foreground" : "text-subtle-foreground italic")}>
        {text || "None recorded"}
      </p>
    </div>
  );
}

export default function InterviewRecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: i, error, refetch, isLoading } = useInterview(id);
  const orgOf = useOrgLookup();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [decideOpen, setDecideOpen] = React.useState(false);

  if (isLoading) {
    return (
      <PageBody className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageBody>
    );
  }
  if (error || !i) {
    return (
      <PageBody>
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this interview" />
      </PageBody>
    );
  }

  const org = orgOf(i.organization);
  const doDelete = async () => {
    setDeleting(true);
    try {
      await interviewsService.remove(i.id);
      await queryClient.invalidateQueries({ queryKey: ["interviews"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Interview deleted", { description: "It has been removed from history. The deletion was logged." });
      router.replace("/history");
    } catch (err) {
      toast.error("Couldn't delete interview", { description: errorMessage(err) });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/history" className="no-print inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3" /> Interview history
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <OrgEmblem org={org} size="md" />
            <span>{i.candidate.name}</span>
            <StatusBadge status={i.status} className="text-xs" />
          </span>
        }
        description={`${org.name} · ${INTERVIEW_TYPE_META[i.interviewType].label} · Interviewed by ${i.interviewer.displayName} · ${formatDate(i.interviewDate)}`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {i.status === "IN_PROGRESS" && i.permissions.canEdit && (
              <Button asChild>
                <Link href={`/interviews/${i.id}/live`}>
                  <PlayCircle /> Resume interview
                </Link>
              </Button>
            )}
            {i.status === "ON_HOLD" && i.permissions.canDecide && (
              <Button onClick={() => setDecideOpen(true)}>
                <Gavel /> Resolve decision
              </Button>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            {i.permissions.canDelete && (
              <Button variant="destructive-ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            )}
          </div>
        }
      />
      <PageBody className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {i.status !== "IN_PROGRESS" && (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                <div className="text-right text-xs text-muted-foreground">
                  {i.decidedBy && <div>Recorded by {i.decidedBy.displayName}</div>}
                  {i.completedAt && <div>{formatDateTime(i.completedAt)}</div>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <TextBlock title="Final comments" text={i.finalComments} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextBlock title="Strengths" text={i.strengths} />
                  <TextBlock title="Concerns" text={i.concerns} />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="border-b border-border">
              <div>
                <CardTitle>Questions asked</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Snapshot of “{i.questionSet.name}” as it was when the interview started.
                </p>
              </div>
            </CardHeader>
            <ol>
              {i.questions.map((q, n) => (
                <li key={q.id} className="border-b border-border px-5 py-4 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span className="tabular mt-0.5 w-7 shrink-0 font-mono text-xs text-subtle-foreground">{String(n + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[14px] font-medium">{q.questionText}</p>
                        <span className={cn("rounded border px-1.5 py-px text-[11px] font-medium", RESULT_META[q.result].tone)}>
                          {RESULT_META[q.result].label}
                        </span>
                      </div>
                      {q.category && <div className="mt-1 text-[11px] text-subtle-foreground">{q.category}</div>}
                      {q.followUpPrompts.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {q.followUpPrompts.map((f, k) => (
                            <div key={k} className="flex gap-1.5 text-xs text-muted-foreground">
                              <CornerDownRight className="mt-0.5 size-3 shrink-0" /> {f}
                            </div>
                          ))}
                        </div>
                      )}
                      {(q.candidateAnswerNotes || q.interviewerNotes || q.expectedAnswer) && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {q.candidateAnswerNotes && (
                            <div className="rounded-md border border-border bg-[#0c0c0f] px-3 py-2">
                              <div className="text-[10px] font-semibold tracking-wider text-subtle-foreground uppercase">Candidate answer</div>
                              <p className="mt-1 text-[13px] whitespace-pre-wrap">{q.candidateAnswerNotes}</p>
                            </div>
                          )}
                          {q.interviewerNotes && (
                            <div className="rounded-md border border-border bg-[#0c0c0f] px-3 py-2">
                              <div className="text-[10px] font-semibold tracking-wider text-subtle-foreground uppercase">Interviewer notes</div>
                              <p className="mt-1 text-[13px] whitespace-pre-wrap">{q.interviewerNotes}</p>
                            </div>
                          )}
                          {q.expectedAnswer && (
                            <div className="rounded-md border border-primary/15 bg-primary-soft/40 px-3 py-2 md:col-span-2">
                              <div className="text-[10px] font-semibold tracking-wider text-primary/80 uppercase">Expected answer</div>
                              <p className="mt-1 text-[13px] whitespace-pre-wrap text-secondary-foreground">{q.expectedAnswer}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Candidate</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <Fact label="Name" value={i.candidate.name} />
                <Fact label={CANDIDATE_FIELD_META.discordUsername.label} value={i.candidate.discordUsername} />
                <Fact label={CANDIDATE_FIELD_META.discordId.label} value={i.candidate.discordId} mono />
                <Fact label={CANDIDATE_FIELD_META.inGameName.label} value={i.candidate.inGameName} />
                <Fact label={CANDIDATE_FIELD_META.inGameId.label} value={i.candidate.inGameId} mono />
                <Fact label="Age" value={i.candidate.age ?? undefined} />
                <Fact label="Timezone" value={i.candidate.timezone} />
                <Fact label="Position applied for" value={i.positionAppliedFor} />
                <Fact label="Additional notes" value={i.additionalNotes} />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scoring</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressSummary progress={i.progress} />
              <dl className="mt-4 grid gap-3">
                <Fact label="Interviewer" value={`${i.interviewer.displayName} (@${i.interviewer.username})`} />
                <Fact label="Started" value={formatDateTime(i.startedAt)} />
                <Fact label="Completed" value={i.completedAt ? formatDateTime(i.completedAt) : undefined} />
                <Fact label="Question set" value={i.questionSet.name} />
              </dl>
            </CardContent>
          </Card>
        </div>
      </PageBody>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this interview?</AlertDialogTitle>
          <AlertDialogDescription>
            The interview with <strong className="text-foreground">{i.candidate.name}</strong> will be removed from history for everyone. The record is
            retained for auditing and the deletion is logged under your name.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={doDelete} loading={deleting}>
              Delete interview
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {i.permissions.canDecide && i.status === "ON_HOLD" && (
        <CompleteInterviewDialog
          open={decideOpen}
          onOpenChange={(o) => {
            setDecideOpen(o);
            if (!o) refetch();
          }}
          interview={i}
          progress={i.progress}
          currentStatus={i.status}
        />
      )}
    </>
  );
}
