"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminsService, type AdminListParams } from "@/services/admins";
import { interviewsService, type InterviewListParams } from "@/services/interviews";
import { questionSetsService, questionsService, type QuestionListParams } from "@/services/questions";
import { auditService, dashboardService, organizationsService, settingsService, type AuditListParams } from "@/services/misc";
import type { InterviewType, OrganizationCode } from "@/types/api";

export const qk = {
  organizations: (includeInactive = false) => ["organizations", { includeInactive }] as const,
  dashboard: ["dashboard"] as const,
  interviews: (p: InterviewListParams) => ["interviews", "list", p] as const,
  interview: (id: string) => ["interviews", "detail", id] as const,
  interviewers: ["interviews", "interviewers"] as const,
  activeInterviews: ["interviews", "active"] as const,
  questionSets: (p: { interviewType?: InterviewType; organization?: OrganizationCode; includeInactive?: boolean }) =>
    ["question-sets", p] as const,
  questions: (p: QuestionListParams) => ["questions", p] as const,
  categories: (setId: string) => ["question-sets", setId, "categories"] as const,
  admins: (p: AdminListParams) => ["admins", "list", p] as const,
  admin: (id: string) => ["admins", "detail", id] as const,
  roles: ["roles"] as const,
  settings: ["settings"] as const,
  audit: (p: AuditListParams) => ["audit", p] as const,
};

export function useOrganizations(includeInactive = false) {
  return useQuery({
    queryKey: qk.organizations(includeInactive),
    queryFn: () => organizationsService.list(includeInactive),
    staleTime: 5 * 60_000,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: dashboardService.get });
}

export function useInterviews(params: InterviewListParams) {
  return useQuery({ queryKey: qk.interviews(params), queryFn: () => interviewsService.list(params), placeholderData: keepPreviousData });
}

export function useInterview(id: string) {
  return useQuery({ queryKey: qk.interview(id), queryFn: () => interviewsService.get(id), enabled: !!id });
}

export function useInterviewers() {
  return useQuery({ queryKey: qk.interviewers, queryFn: interviewsService.interviewers, staleTime: 5 * 60_000 });
}

export function useQuestionSets(params: { interviewType?: InterviewType; organization?: OrganizationCode; includeInactive?: boolean }, enabled = true) {
  return useQuery({ queryKey: qk.questionSets(params), queryFn: () => questionSetsService.list(params), enabled });
}

export function useQuestions(params: QuestionListParams, enabled = true) {
  return useQuery({
    queryKey: qk.questions(params),
    queryFn: () => questionsService.list(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useSetCategories(setId: string | undefined) {
  return useQuery({
    queryKey: qk.categories(setId ?? ""),
    queryFn: () => questionSetsService.categories(setId!),
    enabled: !!setId,
  });
}

export function useAdmins(params: AdminListParams) {
  return useQuery({ queryKey: qk.admins(params), queryFn: () => adminsService.list(params), placeholderData: keepPreviousData });
}

export function useAdmin(id: string) {
  return useQuery({ queryKey: qk.admin(id), queryFn: () => adminsService.get(id), enabled: !!id });
}

export function useRoleCatalogue() {
  return useQuery({ queryKey: qk.roles, queryFn: adminsService.roles, staleTime: 5 * 60_000 });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: settingsService.get, staleTime: 5 * 60_000 });
}

export function useAuditLogs(params: AuditListParams, enabled = true) {
  return useQuery({ queryKey: qk.audit(params), queryFn: () => auditService.list(params), placeholderData: keepPreviousData, enabled });
}
