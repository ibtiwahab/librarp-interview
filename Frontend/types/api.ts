export type Role =
  | "EXECUTIVE_DIRECTOR"
  | "HEAD_ADMIN"
  | "CHIEF_CURATOR_STATE"
  | "CHIEF_CURATOR_CRIME"
  | "STATE_CURATOR"
  | "CRIME_CURATOR"
  | "SUPPORT_CURATOR"
  | "SERVER_ADMIN";

export type InterviewType = "STATE" | "CRIME" | "ADMIN";

export type OrganizationCode =
  | "LSPD"
  | "SAHP"
  | "GOV"
  | "EMS"
  | "FIB"
  | "FAMILIES"
  | "BALLAS"
  | "MARABUNTA"
  | "VAGOS"
  | "BLOODS"
  | "SERVER_ADMIN";

export type InterviewStatus = "IN_PROGRESS" | "PASSED" | "FAILED" | "ON_HOLD" | "CANCELLED";
export type FinalStatus = Exclude<InterviewStatus, "IN_PROGRESS">;
export type QuestionResult = "NOT_SCORED" | "CORRECT" | "PARTIAL" | "INCORRECT" | "SKIPPED";

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Capabilities {
  canInterviewState: boolean;
  canInterviewCrime: boolean;
  canInterviewAdmins: boolean;
  canViewAllInterviews: boolean;
  canDeleteInterviews: boolean;
  canViewAdmins: boolean;
  canCreateAdmins: boolean;
  canDeleteAdmins: boolean;
  canDisableAdmins: boolean;
  canResetPasswords: boolean;
  canEditAdmins: boolean;
  canAssignRoles: boolean;
  canAssignStateCurator: boolean;
  canAssignCrimeCurator: boolean;
  canAssignSupportCurator: boolean;
  canAssignChiefCurator: boolean;
  canAssignHeadAdmin: boolean;
  canManageQuestions: boolean;
  canViewAuditLogs: boolean;
  canManageSettings: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  discordId: string | null;
  roles: Role[];
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUser extends PublicUser {
  level: number;
  permissions: string[];
  capabilities: Capabilities;
  assignableRoles: Role[];
}

export interface AuthPayload {
  accessToken: string;
  user: SessionUser;
}

export interface AdminActions {
  canEdit: boolean;
  canDisable: boolean;
  canDelete: boolean;
  canResetPassword: boolean;
  assignableRoles: Role[];
  isSelf: boolean;
}

export interface AdminListItem extends PublicUser {
  level: number;
  createdBy: { id: string; displayName: string; username: string } | null;
  actions: AdminActions;
}

export interface RoleHistoryEntry {
  role: Role;
  action: "ADDED" | "REMOVED";
  by: string | null;
  byName: string;
  at: string;
}

export interface AdminDetail extends AdminListItem {
  roleHistory: RoleHistoryEntry[];
  passwordChangedAt: string | null;
}

export interface RoleCatalogueEntry {
  role: Role;
  label: string;
  shortLabel: string;
  description: string;
  level: number;
  assignable: boolean;
  reason: string | null;
}

export interface Organization {
  code: OrganizationCode;
  name: string;
  shortName: string;
  category: InterviewType;
  description: string;
  logo: string;
  color: string;
  defaultPosition: string;
  order: number;
  active: boolean;
  canConduct: boolean;
  canViewQuestions: boolean;
  canManageQuestions: boolean;
  defaultQuestionSet: { id: string; name: string; questionCount: number } | null;
}

export interface OrganizationsResponse {
  interviewTypes: { code: InterviewType; label: string }[];
  organizations: Organization[];
}

export interface QuestionSet {
  id: string;
  name: string;
  description: string;
  interviewType: InterviewType;
  organization: OrganizationCode;
  isDefault: boolean;
  active: boolean;
  questionCount: number;
  activeQuestionCount: number;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  questionSet: string;
  interviewType: InterviewType;
  organization: OrganizationCode;
  questionText: string;
  followUpPrompts: string[];
  expectedAnswer: string;
  interviewerNotes: string;
  category: string;
  required: boolean;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionInput {
  questionText: string;
  followUpPrompts: string[];
  expectedAnswer: string;
  interviewerNotes: string;
  category: string;
  required: boolean;
  active: boolean;
}

export interface Candidate {
  name: string;
  discordUsername?: string;
  discordId?: string;
  inGameName?: string;
  inGameId?: string;
  age?: number | null;
  timezone?: string;
}

export interface InterviewProgress {
  total: number;
  answered: number;
  CORRECT: number;
  PARTIAL: number;
  INCORRECT: number;
  SKIPPED: number;
  NOT_SCORED: number;
}

export interface InterviewSummary {
  id: string;
  interviewType: InterviewType;
  organization: OrganizationCode;
  candidate: Candidate;
  positionAppliedFor: string;
  interviewDate: string;
  interviewer: { id: string; username: string; displayName: string };
  questionSet: { id: string | null; name: string };
  status: InterviewStatus;
  progress: InterviewProgress;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewQuestion {
  id: string;
  questionId: string | null;
  order: number;
  questionText: string;
  followUpPrompts: string[];
  expectedAnswer: string;
  guidance: string;
  category: string;
  required: boolean;
  candidateAnswerNotes: string;
  interviewerNotes: string;
  result: QuestionResult;
  answeredAt: string | null;
}

export interface InterviewDetail extends InterviewSummary {
  additionalNotes: string;
  currentIndex: number;
  questions: InterviewQuestion[];
  finalComments: string;
  strengths: string;
  concerns: string;
  decidedBy: { id: string; username: string; displayName: string } | null;
  lastSavedAt: string | null;
  permissions: { canEdit: boolean; canDecide: boolean; canDelete: boolean };
}

export interface CandidateFieldSetting {
  enabled: boolean;
  required: boolean;
}

export type CandidateFieldKey =
  | "discordUsername"
  | "discordId"
  | "inGameName"
  | "inGameId"
  | "age"
  | "timezone"
  | "positionAppliedFor"
  | "additionalNotes";

export interface AppSettings {
  candidateFields: Record<CandidateFieldKey, CandidateFieldSetting>;
}

export interface DashboardData {
  stats: {
    interviewsToday: number;
    completed: number;
    passed: number;
    failed: number;
    onHold: number;
    inProgress: number;
    cancelled: number;
    total: number;
    availableQuestionSets: number;
  };
  mine: { total: number; passed: number; failed: number; inProgress: number };
  recentInterviews: InterviewSummary[];
  activeInterviews: InterviewSummary[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  category: "auth" | "admin" | "question" | "interview" | "system";
  actor: { id: string; username: string; displayName: string } | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

/* ─── Import ─── */

export interface DetectedQuestion {
  tempId: string;
  questionText: string;
  followUpPrompts: string[];
  expectedAnswer: string;
  interviewerNotes: string;
  category: string;
  required: boolean;
  sourceNumber: number | null;
  confidence: "high" | "medium" | "low";
  flags: string[];
}

export interface ColumnMapping {
  question: number;
  expectedAnswer?: number | null;
  followUp?: number | null;
  category?: number | null;
  required?: number | null;
  order?: number | null;
  notes?: number | null;
}

export interface TablePreview {
  sheetName: string;
  rows: string[][];
  hasHeader: boolean;
  mapping: ColumnMapping | null;
  guessed: boolean;
  truncated: boolean;
}

export interface DuplicateMatch {
  index: number;
  kind: "exact" | "similar";
  existingId: string;
  existingText: string;
  similarity: number;
}

export interface ImportPreview {
  fileName: string;
  fileType: string;
  fileSize: number;
  source: "text" | "table";
  documentTitle: string | null;
  detectedQuestions: DetectedQuestion[];
  warnings: string[];
  tables?: TablePreview[];
  duplicates: DuplicateMatch[];
  stats: { linesRead: number; pages?: number };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  skippedQuestions: { questionText: string; reason: string }[];
}
