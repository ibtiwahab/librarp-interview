import { Schema, model, type Types } from "mongoose";

export const AUDIT_ACTIONS = [
  "AUTH_LOGIN",
  "AUTH_LOGIN_FAILED",
  "AUTH_LOGOUT",
  "AUTH_PASSWORD_CHANGED",
  "AUTH_SESSION_REUSE_DETECTED",
  "ADMIN_CREATED",
  "ADMIN_UPDATED",
  "ADMIN_DISABLED",
  "ADMIN_ENABLED",
  "ADMIN_DELETED",
  "ADMIN_PASSWORD_RESET",
  "ROLE_ASSIGNED",
  "ROLE_REMOVED",
  "BOOTSTRAP_EXECUTIVE_CREATED",
  "QUESTION_CREATED",
  "QUESTION_UPDATED",
  "QUESTION_DELETED",
  "QUESTIONS_REORDERED",
  "QUESTIONS_BULK_UPDATED",
  "QUESTIONS_IMPORTED",
  "QUESTION_SET_CREATED",
  "QUESTION_SET_UPDATED",
  "QUESTION_SET_DELETED",
  "QUESTION_SET_DUPLICATED",
  "INTERVIEW_STARTED",
  "INTERVIEW_COMPLETED",
  "INTERVIEW_DELETED",
  "ORGANIZATION_UPDATED",
  "SETTINGS_UPDATED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_CATEGORIES = ["auth", "admin", "question", "interview", "system"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_TARGET_TYPES = ["AdminUser", "Question", "QuestionSet", "Interview", "Organization", "Settings", "Session"] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export interface IAuditLog {
  actor?: Types.ObjectId | null;
  actorSnapshot?: { username: string; displayName: string } | null;
  action: AuditAction;
  category: AuditCategory;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    actorSnapshot: { type: new Schema({ username: String, displayName: String }, { _id: false }), default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    category: { type: String, enum: AUDIT_CATEGORIES, required: true },
    targetType: { type: String, enum: AUDIT_TARGET_TYPES, default: null },
    targetId: { type: String, default: null },
    targetLabel: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
