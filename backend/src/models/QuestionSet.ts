import { Schema, model, type Types } from "mongoose";
import { INTERVIEW_TYPES, ORGANIZATION_CODES, type InterviewType, type OrganizationCode } from "../config/organizations.js";

export interface IQuestionSet {
  name: string;
  description: string;
  interviewType: InterviewType;
  organization: OrganizationCode;
  /** The set used by default when starting an interview for this organization. */
  isDefault: boolean;
  active: boolean;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const questionSetSchema = new Schema<IQuestionSet>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    interviewType: { type: String, enum: INTERVIEW_TYPES, required: true },
    organization: { type: String, enum: ORGANIZATION_CODES, required: true },
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true },
);

questionSetSchema.index({ organization: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
// At most one default set per organization.
questionSetSchema.index({ organization: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: "one_default_per_org" });
questionSetSchema.index({ interviewType: 1, organization: 1 });

export const QuestionSet = model<IQuestionSet>("QuestionSet", questionSetSchema);
