"use client";

import * as React from "react";
import { interviewsService, type AnswerPatch } from "@/services/interviews";
import { ApiError } from "@/lib/api-client";
import type { InterviewDetail, QuestionResult } from "@/types/api";

export interface AnswerState {
  candidateAnswerNotes: string;
  interviewerNotes: string;
  result: QuestionResult;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "retrying" | "error";

const DEBOUNCE_MS = 900;
/** Backoff while the API is unreachable (e.g. a free-tier instance waking up, which can take ~60s). */
const RETRY_DELAYS = [3000, 6000, 10000, 15000, 20000, 30000];
const draftKey = (id: string) => `lrp.interview.${id}.draft`;

interface Draft {
  ts: number;
  currentIndex: number;
  answers: Record<string, AnswerState>;
}

function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(id), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(id));
  } catch {
    // Storage full or blocked: server autosave still protects the work.
  }
}

/**
 * Debounced autosave for a live interview.
 *
 * - Only changed answers are sent (PATCH), never on every keystroke.
 * - Unsaved changes are mirrored to localStorage, so a refresh or a network
 *   blip never loses notes; they're replayed on the next load.
 * - Exposes Saving… / Saved / Save failed state for the UI.
 */
export function useInterviewAutosave(interview: InterviewDetail, enabled: boolean) {
  const id = interview.id;

  // Server state, with any newer unsaved local draft (from a refresh or crash) layered on top.
  // This page only renders client-side, so reading localStorage during init is safe.
  const [initial] = React.useState(() => {
    const answers: Record<string, AnswerState> = {};
    for (const q of interview.questions) {
      answers[q.id] = { candidateAnswerNotes: q.candidateAnswerNotes, interviewerNotes: q.interviewerNotes, result: q.result };
    }
    const last = Math.max(0, interview.questions.length - 1);
    let index = Math.min(interview.currentIndex, last);
    const replayed: string[] = [];
    const draft = enabled ? readDraft(interview.id) : null;
    const serverTs = interview.lastSavedAt ? new Date(interview.lastSavedAt).getTime() : 0;
    if (draft && draft.ts > serverTs) {
      for (const [qid, a] of Object.entries(draft.answers)) {
        if (!(qid in answers)) continue;
        answers[qid] = a;
        replayed.push(qid);
      }
      if (Number.isInteger(draft.currentIndex)) index = Math.min(draft.currentIndex, last);
    } else if (draft) {
      writeDraft(interview.id, null);
    }
    return { answers, index, replayed, indexReplayed: !!draft && draft.ts > serverTs };
  });
  const [answers, setAnswers] = React.useState<Record<string, AnswerState>>(initial.answers);
  const [currentIndex, setCurrentIndexState] = React.useState(initial.index);
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(interview.lastSavedAt);
  const [error, setError] = React.useState<string | null>(null);

  const answersRef = React.useRef(answers);
  const indexRef = React.useRef(currentIndex);
  const dirty = React.useRef(new Map<string, number>()); // id -> version
  const indexDirty = React.useRef(false);
  const version = React.useRef(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef<Promise<void> | null>(null);
  const retries = React.useRef(0);
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = React.useRef<((opts?: { keepalive?: boolean }) => Promise<void>) | null>(null);

  const persistDraft = React.useCallback(() => {
    if (dirty.current.size === 0 && !indexDirty.current) {
      writeDraft(id, null);
      return;
    }
    const pending: Record<string, AnswerState> = {};
    for (const qid of dirty.current.keys()) pending[qid] = answersRef.current[qid]!;
    writeDraft(id, { ts: Date.now(), currentIndex: indexRef.current, answers: pending });
  }, [id]);

  const flush = React.useCallback(
    async (opts: { keepalive?: boolean } = {}): Promise<void> => {
      if (!enabled) return;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (inFlight.current) await inFlight.current.catch(() => undefined);
      if (dirty.current.size === 0 && !indexDirty.current) return;

      const snapshot = new Map(dirty.current);
      const payload: AnswerPatch[] = [...snapshot.keys()].map((qid) => ({ id: qid, ...answersRef.current[qid]! }));
      const sendIndex = indexDirty.current;
      indexDirty.current = false;
      setStatus("saving");

      const run = (async () => {
        try {
          const res = await interviewsService.autosave(
            id,
            { answers: payload.length ? payload : undefined, currentIndex: sendIndex || payload.length ? indexRef.current : undefined },
            opts.keepalive,
          );
          // Only clear entries that weren't edited again while saving.
          for (const [qid, v] of snapshot) if (dirty.current.get(qid) === v) dirty.current.delete(qid);
          setLastSavedAt(res.lastSavedAt);
          setError(null);
          setStatus(dirty.current.size || indexDirty.current ? "pending" : "saved");
          persistDraft();
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retries.current = 0;
        } catch (err) {
          if (sendIndex) indexDirty.current = true;
          persistDraft();
          // Server waking up (free hosting), network blip or overload: keep retrying on our own.
          const transient = !(err instanceof ApiError) || err.isNetwork || err.status >= 500 || err.status === 429;
          if (transient) {
            const delay = RETRY_DELAYS[Math.min(retries.current, RETRY_DELAYS.length - 1)]!;
            retries.current++;
            setStatus("retrying");
            setError(null);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => {
              flushRef.current?.().catch(() => undefined);
            }, delay);
          } else {
            setStatus("error");
            setError(err instanceof ApiError ? err.message : "Save failed.");
          }
          throw err;
        }
      })();
      inFlight.current = run;
      try {
        await run;
      } finally {
        inFlight.current = null;
      }
    },
    [enabled, id, persistDraft],
  );

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = React.useCallback(() => {
    setStatus((s) => (s === "saving" ? s : "pending"));
    persistDraft();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flush().catch(() => undefined);
    }, DEBOUNCE_MS);
  }, [flush, persistDraft]);

  const update = React.useCallback(
    (qid: string, patch: Partial<AnswerState>) => {
      if (!enabled) return;
      // Update the ref synchronously so the draft backup and the next save see this edit.
      const prev = answersRef.current;
      const next = { ...prev, [qid]: { ...prev[qid]!, ...patch } };
      answersRef.current = next;
      setAnswers(next);
      dirty.current.set(qid, ++version.current);
      schedule();
    },
    [enabled, schedule],
  );

  const setCurrentIndex = React.useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(i, interview.questions.length - 1));
      indexRef.current = clamped;
      setCurrentIndexState(clamped);
      if (enabled) {
        indexDirty.current = true;
        schedule();
      }
    },
    [enabled, interview.questions.length, schedule],
  );

  // Push any replayed local draft (applied during init) to the server.
  React.useEffect(() => {
    if (!enabled || (initial.replayed.length === 0 && !initial.indexReplayed)) return;
    for (const qid of initial.replayed) dirty.current.set(qid, ++version.current);
    if (initial.indexReplayed) indexDirty.current = true;
    const t = setTimeout(() => {
      flush().catch(() => undefined);
    }, 0);
    return () => clearTimeout(t);
  }, [enabled, initial, flush]);

  // Flush when the tab is hidden; warn before closing with unsaved work.
  React.useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") flush({ keepalive: true }).catch(() => undefined);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || indexDirty.current || inFlight.current) {
        persistDraft();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, flush, persistDraft]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const retry = React.useCallback(() => flush().catch(() => undefined), [flush]);
  const hasUnsaved = () => dirty.current.size > 0 || indexDirty.current;

  return { answers, update, currentIndex, setCurrentIndex, status, error, lastSavedAt, flush, retry, hasUnsaved };
}
