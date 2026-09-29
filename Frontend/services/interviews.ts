import { http } from "@/lib/api-client";
import type {
  Candidate,
  FinalStatus,
  InterviewDetail,
  InterviewStatus,
  InterviewSummary,
  InterviewType,
  OrganizationCode,
  Paginated,
  QuestionResult,
} from "@/types/api";

export interface InterviewListParams {
  search?: string;
  discordId?: string;
  inGameId?: string;
  interviewer?: string;
  organization?: OrganizationCode | "";
  interviewType?: InterviewType | "";
  status?: InterviewStatus | "";
  from?: string;
  to?: string;
  mine?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface StartInterviewInput {
  organization: OrganizationCode;
  questionSet?: string;
  candidate: Candidate;
  positionAppliedFor?: string;
  interviewDate?: string;
  additionalNotes?: string;
}

export interface AnswerPatch {
  id: string;
  candidateAnswerNotes?: string;
  interviewerNotes?: string;
  result?: QuestionResult;
}

export interface AutosaveInput {
  currentIndex?: number;
  answers?: AnswerPatch[];
  candidate?: Partial<Candidate>;
  positionAppliedFor?: string;
  additionalNotes?: string;
  finalComments?: string;
  strengths?: string;
  concerns?: string;
}

export interface CompleteInput {
  status: FinalStatus;
  finalComments: string;
  strengths: string;
  concerns: string;
}

export const interviewsService = {
  list: (params: InterviewListParams) =>
    http.get<Paginated<InterviewSummary>>("/interviews", { ...params, mine: params.mine ? "true" : undefined }),
  active: () => http.get<InterviewSummary[]>("/interviews/active"),
  interviewers: () => http.get<{ id: string; displayName: string; username: string }[]>("/interviews/interviewers"),
  get: (id: string) => http.get<InterviewDetail>(`/interviews/${id}`),
  start: (input: StartInterviewInput) => http.post<InterviewDetail>("/interviews", input),
  autosave: (id: string, input: AutosaveInput, keepalive = false) =>
    http.patch<{ lastSavedAt: string; currentIndex: number; status: InterviewStatus }>(`/interviews/${id}`, input, {
      keepalive,
      // Long enough to ride out a free-tier cold start (~30–60s).
      timeoutMs: 70_000,
    }),
  complete: (id: string, input: CompleteInput) => http.post<InterviewDetail>(`/interviews/${id}/complete`, input),
  remove: (id: string) => http.delete<{ deleted: true }>(`/interviews/${id}`),
};
