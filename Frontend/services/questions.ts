import { http } from "@/lib/api-client";
import type {
  ColumnMapping,
  DetectedQuestion,
  DuplicateMatch,
  ImportPreview,
  ImportResult,
  InterviewType,
  OrganizationCode,
  Paginated,
  Question,
  QuestionInput,
  QuestionSet,
} from "@/types/api";

export interface QuestionListParams {
  questionSet?: string;
  search?: string;
  category?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}

export type BulkAction =
  | { action: "activate" | "deactivate" | "delete"; ids: string[] }
  | { action: "setRequired"; ids: string[]; required: boolean }
  | { action: "setCategory"; ids: string[]; category: string }
  | { action: "move" | "copy"; ids: string[]; targetQuestionSet: string };

export const questionSetsService = {
  list: (params: { interviewType?: InterviewType; organization?: OrganizationCode; includeInactive?: boolean }) =>
    http.get<QuestionSet[]>("/question-sets", { ...params, includeInactive: params.includeInactive ? "true" : undefined }),
  get: (id: string) => http.get<QuestionSet>(`/question-sets/${id}`),
  categories: (id: string) => http.get<string[]>(`/question-sets/${id}/categories`),
  create: (input: { name: string; description: string; organization: OrganizationCode; isDefault: boolean }) =>
    http.post<QuestionSet>("/question-sets", input),
  update: (id: string, input: Partial<Pick<QuestionSet, "name" | "description" | "active" | "isDefault">>) =>
    http.patch<QuestionSet>(`/question-sets/${id}`, input),
  remove: (id: string) => http.delete<{ deleted: true }>(`/question-sets/${id}`),
  duplicate: (id: string, input: { name: string; organization?: OrganizationCode }) =>
    http.post<QuestionSet>(`/question-sets/${id}/duplicate`, input),
};

export const questionsService = {
  list: (params: QuestionListParams) =>
    http.get<Paginated<Question>>("/questions", {
      ...params,
      active: params.active === undefined ? undefined : String(params.active),
    }),
  create: (input: QuestionInput & { questionSet: string }) => http.post<Question>("/questions", input),
  update: (id: string, input: Partial<QuestionInput>) => http.patch<Question>(`/questions/${id}`, input),
  remove: (id: string) => http.delete<{ deleted: true }>(`/questions/${id}`),
  duplicate: (id: string) => http.post<Question>(`/questions/${id}/duplicate`),
  reorder: (questionSet: string, orderedIds: string[]) => http.post<{ reordered: true }>("/questions/reorder", { questionSet, orderedIds }),
  bulkAction: (input: BulkAction) => http.post<{ affected: number }>("/questions/bulk-action", input),

  importPreview: (file: File, questionSet?: string, signal?: AbortSignal) => {
    const form = new FormData();
    if (questionSet) form.append("questionSet", questionSet);
    form.append("file", file);
    return http.post<ImportPreview>("/questions/import/preview", form, { timeoutMs: 120_000, signal });
  },
  importMap: (rows: string[][], mapping: ColumnMapping, hasHeader: boolean) =>
    http.post<{ detectedQuestions: DetectedQuestion[]; warnings: string[] }>("/questions/import/map", { rows, mapping, hasHeader }),
  checkDuplicates: (questionSet: string, questions: string[]) =>
    http.post<{ duplicates: DuplicateMatch[] }>("/questions/import/check-duplicates", { questionSet, questions }),
  bulkImport: (input: {
    questionSet: string;
    fileName?: string;
    duplicateStrategy: "skip" | "import";
    questions: Array<QuestionInput & { allowDuplicate?: boolean }>;
  }) => http.post<ImportResult>("/questions/bulk", input, { timeoutMs: 60_000 }),
};
