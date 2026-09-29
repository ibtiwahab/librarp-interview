import { Schema, model } from "mongoose";
import { INTERVIEW_TYPES, ORGANIZATION_CODES, type InterviewType, type OrganizationCode } from "../config/organizations.js";

/**
 * Per-deployment organization metadata. Codes and categories are fixed by
 * config/organizations.ts; display fields here can be edited from Settings.
 */
export interface IOrganization {
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
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    code: { type: String, enum: ORGANIZATION_CODES, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    shortName: { type: String, required: true, trim: true, maxlength: 40 },
    category: { type: String, enum: INTERVIEW_TYPES, required: true },
    description: { type: String, default: "", maxlength: 500 },
    logo: { type: String, default: "", maxlength: 500 },
    color: { type: String, default: "#8a8f98", maxlength: 20 },
    defaultPosition: { type: String, default: "", maxlength: 80 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Organization = model<IOrganization>("Organization", organizationSchema);
