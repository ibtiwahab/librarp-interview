import { RESULT_ORDER } from "@/lib/constants";
import type { InterviewProgress, QuestionResult } from "@/types/api";

/**
 * Interview score. Correct = 1 point, Partial = ½ point, everything else
 * (Incorrect, Skipped, Not answered) = 0. The percentage is out of ALL
 * questions in the interview, so unanswered questions lower the score.
 * The score is guidance only — the interviewer still decides the outcome.
 */
export const RESULT_POINTS: Record<QuestionResult, number> = {
  CORRECT: 1,
  PARTIAL: 0.5,
  INCORRECT: 0,
  SKIPPED: 0,
  NOT_SCORED: 0,
};

export interface ScoreSummary {
  percent: number;
  points: number;
  total: number;
  answered: number;
  breakdown: { result: QuestionResult; count: number; percent: number }[];
}

export function computeScore(p: InterviewProgress): ScoreSummary {
  const total = p.total || RESULT_ORDER.reduce((n, r) => n + (p[r] ?? 0), 0);
  const points = RESULT_ORDER.reduce((n, r) => n + (p[r] ?? 0) * RESULT_POINTS[r], 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return {
    percent: total ? Math.round((points / total) * 100) : 0,
    points,
    total,
    answered: total - (p.NOT_SCORED ?? 0),
    breakdown: RESULT_ORDER.map((r) => ({ result: r, count: p[r] ?? 0, percent: pct(p[r] ?? 0) })),
  };
}

/** Text colour for a score: green ≥ 75%, amber ≥ 50%, red below. */
export function scoreTone(percent: number): string {
  if (percent >= 75) return "text-success";
  if (percent >= 50) return "text-warning";
  return "text-destructive";
}
