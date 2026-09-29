import { Schema, model, type Types } from "mongoose";

export const CANDIDATE_FIELD_KEYS = [
  "discordUsername",
  "discordId",
  "inGameName",
  "inGameId",
  "age",
  "timezone",
  "positionAppliedFor",
  "additionalNotes",
] as const;
export type CandidateFieldKey = (typeof CANDIDATE_FIELD_KEYS)[number];

export interface CandidateFieldSetting {
  enabled: boolean;
  required: boolean;
}

export type CandidateFieldSettings = Record<CandidateFieldKey, CandidateFieldSetting>;

export const DEFAULT_CANDIDATE_FIELDS: CandidateFieldSettings = {
  discordUsername: { enabled: true, required: true },
  discordId: { enabled: true, required: false },
  inGameName: { enabled: true, required: true },
  inGameId: { enabled: true, required: false },
  age: { enabled: false, required: false },
  timezone: { enabled: true, required: false },
  positionAppliedFor: { enabled: true, required: false },
  additionalNotes: { enabled: true, required: false },
};

export interface IAppSettings {
  key: "global";
  candidateFields: CandidateFieldSettings;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const appSettingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, enum: ["global"], default: "global", unique: true },
    candidateFields: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_CANDIDATE_FIELDS }) },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true, minimize: false },
);

export const AppSettings = model<IAppSettings>("AppSettings", appSettingsSchema);
