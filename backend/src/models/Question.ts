import { Schema, model, type Types } from "mongoose";
import { INTERVIEW_TYPES, ORGANIZATION_CODES, type InterviewType, type OrganizationCode } from "../config/organizations.js";
import { normalizeQuestionText } from "../utils/text.js";

export interface IQuestion {
  questionSet: Types.ObjectId;
  interviewType: InterviewType;
  organization: OrganizationCode;
  questionText: string;
  normalizedText: string;
  followUpPrompts: string[];
  expectedAnswer: string;
  /** Guidance for the interviewer (not read aloud). */
  interviewerNotes: string;
  /** Topic within the set, e.g. "Server Rules" or "Leadership". */
  category: string;
  required: boolean;
  order: number;
  active: boolean;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    questionSet: { type: Schema.Types.ObjectId, ref: "QuestionSet", required: true },
    interviewType: { type: String, enum: INTERVIEW_TYPES, required: true },
    organization: { type: String, enum: ORGANIZATION_CODES, required: true },
    questionText: { type: String, required: true, trim: true, maxlength: 2000 },
    normalizedText: { type: String, required: true },
    followUpPrompts: { type: [String], default: [] },
    expectedAnswer: { type: String, default: "", maxlength: 4000 },
    interviewerNotes: { type: String, default: "", maxlength: 4000 },
    category: { type: String, default: "", trim: true, maxlength: 80 },
    required: { type: Boolean, default: true },
    order: { type: Number, required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true },
);

questionSchema.index({ questionSet: 1, order: 1 });
questionSchema.index({ questionSet: 1, normalizedText: 1 });
questionSchema.index({ interviewType: 1, organization: 1 });

questionSchema.pre("validate", function () {
  if (this.isModified("questionText") || !this.normalizedText) {
    this.normalizedText = normalizeQuestionText(this.questionText ?? "");
  }
});

export const Question = model<IQuestion>("Question", questionSchema);
