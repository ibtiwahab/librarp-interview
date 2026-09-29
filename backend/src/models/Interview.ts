import { Schema, model, type Types } from "mongoose";
import { INTERVIEW_TYPES, ORGANIZATION_CODES, type InterviewType, type OrganizationCode } from "../config/organizations.js";

export const QUESTION_RESULTS = ["NOT_SCORED", "CORRECT", "PARTIAL", "INCORRECT", "SKIPPED"] as const;
export type QuestionResult = (typeof QUESTION_RESULTS)[number];

export const INTERVIEW_STATUSES = ["IN_PROGRESS", "PASSED", "FAILED", "ON_HOLD", "CANCELLED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const FINAL_STATUSES = ["PASSED", "FAILED", "ON_HOLD", "CANCELLED"] as const;
export type FinalStatus = (typeof FINAL_STATUSES)[number];

/**
 * Allowed status transitions. PASSED / FAILED / CANCELLED are terminal;
 * ON_HOLD can later be resolved.
 */
export const STATUS_TRANSITIONS: Record<InterviewStatus, readonly InterviewStatus[]> = {
  IN_PROGRESS: ["PASSED", "FAILED", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["PASSED", "FAILED", "CANCELLED"],
  PASSED: [],
  FAILED: [],
  CANCELLED: [],
};

/**
 * Immutable snapshot of a question as it was asked. Editing the Question Bank
 * later never changes historical interviews.
 */
export interface InterviewQuestion {
  _id: Types.ObjectId;
  questionId?: Types.ObjectId | null;
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
  answeredAt?: Date | null;
}

export interface CandidateInfo {
  name: string;
  discordUsername?: string;
  discordId?: string;
  inGameName?: string;
  inGameId?: string;
  age?: number | null;
  timezone?: string;
}

export interface IInterview {
  interviewType: InterviewType;
  organization: OrganizationCode;
  candidate: CandidateInfo;
  positionAppliedFor: string;
  interviewDate: Date;
  additionalNotes: string;
  interviewer: Types.ObjectId;
  interviewerSnapshot: { username: string; displayName: string };
  questionSet?: Types.ObjectId | null;
  questionSetSnapshot: { name: string };
  questions: Types.DocumentArray<InterviewQuestion & Types.Subdocument>;
  currentIndex: number;
  status: InterviewStatus;
  finalComments: string;
  strengths: string;
  concerns: string;
  decidedBy?: Types.ObjectId | null;
  decidedBySnapshot?: { username: string; displayName: string } | null;
  startedAt: Date;
  completedAt?: Date | null;
  lastSavedAt?: Date | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const interviewQuestionSchema = new Schema<InterviewQuestion>({
  questionId: { type: Schema.Types.ObjectId, ref: "Question", default: null },
  order: { type: Number, required: true },
  questionText: { type: String, required: true },
  followUpPrompts: { type: [String], default: [] },
  expectedAnswer: { type: String, default: "" },
  guidance: { type: String, default: "" },
  category: { type: String, default: "" },
  required: { type: Boolean, default: true },
  candidateAnswerNotes: { type: String, default: "", maxlength: 10000 },
  interviewerNotes: { type: String, default: "", maxlength: 10000 },
  result: { type: String, enum: QUESTION_RESULTS, default: "NOT_SCORED" },
  answeredAt: { type: Date, default: null },
});

const snapshotUserSchema = new Schema({ username: String, displayName: String }, { _id: false });

const interviewSchema = new Schema<IInterview>(
  {
    interviewType: { type: String, enum: INTERVIEW_TYPES, required: true },
    organization: { type: String, enum: ORGANIZATION_CODES, required: true },
    candidate: {
      name: { type: String, required: true, trim: true, maxlength: 100 },
      discordUsername: { type: String, trim: true, default: "", maxlength: 64 },
      discordId: { type: String, trim: true, default: "", maxlength: 32 },
      inGameName: { type: String, trim: true, default: "", maxlength: 100 },
      inGameId: { type: String, trim: true, default: "", maxlength: 32 },
      age: { type: Number, default: null, min: 0, max: 120 },
      timezone: { type: String, trim: true, default: "", maxlength: 64 },
    },
    positionAppliedFor: { type: String, trim: true, default: "", maxlength: 100 },
    interviewDate: { type: Date, default: () => new Date() },
    additionalNotes: { type: String, default: "", maxlength: 5000 },
    interviewer: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    interviewerSnapshot: { type: snapshotUserSchema, required: true },
    questionSet: { type: Schema.Types.ObjectId, ref: "QuestionSet", default: null },
    questionSetSnapshot: { type: new Schema({ name: String }, { _id: false }), default: () => ({ name: "" }) },
    questions: { type: [interviewQuestionSchema], default: [] },
    currentIndex: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: INTERVIEW_STATUSES, default: "IN_PROGRESS" },
    finalComments: { type: String, default: "", maxlength: 10000 },
    strengths: { type: String, default: "", maxlength: 5000 },
    concerns: { type: String, default: "", maxlength: 5000 },
    decidedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    decidedBySnapshot: { type: snapshotUserSchema, default: null },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
    lastSavedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true },
);

interviewSchema.index({ deletedAt: 1, createdAt: -1 });
interviewSchema.index({ deletedAt: 1, status: 1, interviewDate: -1 });
interviewSchema.index({ organization: 1, interviewDate: -1 });
interviewSchema.index({ interviewType: 1, interviewDate: -1 });
interviewSchema.index({ interviewer: 1, status: 1 });
interviewSchema.index({ "candidate.discordId": 1 });
interviewSchema.index({ "candidate.inGameId": 1 });
interviewSchema.index({ "candidate.name": 1 });

export const Interview = model<IInterview>("Interview", interviewSchema);
