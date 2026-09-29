import type { Capabilities, CandidateFieldKey, FinalStatus, InterviewStatus, InterviewType, QuestionResult, Role } from "@/types/api";

/** Display metadata only — every permission decision is made by the API. */
export const ROLE_META: Record<Role, { label: string; short: string; tone: "gold" | "steel" | "state" | "crime" | "support" | "base" }> = {
  EXECUTIVE_DIRECTOR: { label: "Executive Director", short: "Exec. Director", tone: "gold" },
  HEAD_ADMIN: { label: "Head Admin", short: "Head Admin", tone: "steel" },
  CHIEF_CURATOR_STATE: { label: "Chief Curator of State", short: "Chief · State", tone: "state" },
  CHIEF_CURATOR_CRIME: { label: "Chief Curator of Crime", short: "Chief · Crime", tone: "crime" },
  STATE_CURATOR: { label: "State Curator", short: "State Curator", tone: "state" },
  CRIME_CURATOR: { label: "Crime Curator", short: "Crime Curator", tone: "crime" },
  SUPPORT_CURATOR: { label: "Support Curator", short: "Support Curator", tone: "support" },
};

export const ROLE_ORDER: Role[] = [
  "EXECUTIVE_DIRECTOR",
  "HEAD_ADMIN",
  "CHIEF_CURATOR_STATE",
  "CHIEF_CURATOR_CRIME",
  "STATE_CURATOR",
  "CRIME_CURATOR",
  "SUPPORT_CURATOR",
];

/** Roles that were removed from the system; they can still appear in role history. */
export const RETIRED_ROLE_LABELS: Record<string, string> = {
  SERVER_ADMIN: "Server Admin (retired)",
};

export function roleLabel(role: string): string {
  return ROLE_META[role as Role]?.label ?? RETIRED_ROLE_LABELS[role] ?? role;
}

export const INTERVIEW_TYPE_META: Record<InterviewType, { label: string; short: string; description: string; capability: keyof Capabilities }> = {
  STATE: {
    label: "State Leadership",
    short: "State",
    description: "LSPD, SAHP, Government, EMS and FIB leadership candidates.",
    capability: "canInterviewState",
  },
  CRIME: {
    label: "Crime Leadership",
    short: "Crime",
    description: "Families, Ballas, Marabunta, Vagos and Bloods leadership candidates.",
    capability: "canInterviewCrime",
  },
  ADMIN: {
    label: "Admin",
    short: "Admin",
    description: "Admin Assistant and Server Admin candidates for the Libra RP administration team.",
    capability: "canInterviewAdmins",
  },
};

export const STATUS_META: Record<InterviewStatus, { label: string; tone: "neutral" | "success" | "danger" | "warning" | "info" }> = {
  IN_PROGRESS: { label: "In progress", tone: "info" },
  PASSED: { label: "Passed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  ON_HOLD: { label: "On hold", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const FINAL_STATUS_OPTIONS: { value: FinalStatus; label: string; description: string }[] = [
  { value: "PASSED", label: "Passed", description: "The candidate is approved for the position." },
  { value: "FAILED", label: "Failed", description: "The candidate is not approved." },
  { value: "ON_HOLD", label: "On hold", description: "Decision deferred — can be resolved later." },
  { value: "CANCELLED", label: "Cancelled", description: "Interview did not complete (no-show, disconnect…)." },
];

export const RESULT_META: Record<QuestionResult, { label: string; key: string; tone: string; dot: string }> = {
  CORRECT: { label: "Correct", key: "1", tone: "text-success border-success/40 bg-success-soft", dot: "bg-success" },
  PARTIAL: { label: "Partial", key: "2", tone: "text-warning border-warning/40 bg-warning-soft", dot: "bg-warning" },
  INCORRECT: { label: "Incorrect", key: "3", tone: "text-destructive border-destructive/40 bg-destructive-soft", dot: "bg-destructive" },
  SKIPPED: { label: "Skipped", key: "4", tone: "text-muted-foreground border-border-strong bg-muted", dot: "bg-subtle-foreground" },
  NOT_SCORED: { label: "Not scored", key: "0", tone: "text-muted-foreground border-border bg-transparent", dot: "bg-border-strong" },
};

export const RESULT_ORDER: QuestionResult[] = ["CORRECT", "PARTIAL", "INCORRECT", "SKIPPED", "NOT_SCORED"];

export const CANDIDATE_FIELD_META: Record<CandidateFieldKey, { label: string; placeholder: string; hint?: string }> = {
  discordUsername: { label: "Discord username", placeholder: "e.g. johnny.d" },
  discordId: { label: "Discord ID", placeholder: "17–20 digit ID", hint: "Right-click the user in Discord → Copy User ID." },
  inGameName: { label: "In-game name", placeholder: "Character name" },
  inGameId: { label: "In-game ID", placeholder: "Server ID / CID" },
  age: { label: "Age", placeholder: "Age" },
  timezone: { label: "Timezone", placeholder: "e.g. GMT+1, EST" },
  positionAppliedFor: { label: "Position applied for", placeholder: "e.g. FIB Director" },
  additionalNotes: { label: "Additional notes", placeholder: "Anything the interviewer should know before starting…" },
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN: "Signed in",
  AUTH_LOGIN_FAILED: "Failed sign-in",
  AUTH_LOGOUT: "Signed out",
  AUTH_PASSWORD_CHANGED: "Changed password",
  AUTH_SESSION_REUSE_DETECTED: "Session token reuse detected",
  ADMIN_CREATED: "Created administrator",
  ADMIN_UPDATED: "Updated administrator",
  ADMIN_DISABLED: "Disabled account",
  ADMIN_ENABLED: "Re-enabled account",
  ADMIN_DELETED: "Deleted administrator",
  ADMIN_PASSWORD_RESET: "Reset password",
  ROLE_ASSIGNED: "Assigned role",
  ROLE_REMOVED: "Removed role",
  BOOTSTRAP_EXECUTIVE_CREATED: "Bootstrap Executive Director",
  QUESTION_CREATED: "Created question",
  QUESTION_UPDATED: "Updated question",
  QUESTION_DELETED: "Deleted question(s)",
  QUESTIONS_REORDERED: "Reordered questions",
  QUESTIONS_BULK_UPDATED: "Bulk-updated questions",
  QUESTIONS_IMPORTED: "Imported questions",
  QUESTION_SET_CREATED: "Created question set",
  QUESTION_SET_UPDATED: "Updated question set",
  QUESTION_SET_DELETED: "Deleted question set",
  QUESTION_SET_DUPLICATED: "Duplicated question set",
  INTERVIEW_STARTED: "Started interview",
  INTERVIEW_COMPLETED: "Recorded interview decision",
  INTERVIEW_UPDATED: "Edited submitted interview",
  INTERVIEW_DELETED: "Deleted interview",
  ORGANIZATION_UPDATED: "Updated organization",
  SETTINGS_UPDATED: "Updated settings",
};

export const ACCEPTED_IMPORT_TYPES = ".xlsx,.xls,.csv,.docx,.pdf,.txt";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
