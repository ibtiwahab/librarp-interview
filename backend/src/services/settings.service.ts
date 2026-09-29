import type { Request } from "express";
import { Types } from "mongoose";
import {
  AppSettings,
  CANDIDATE_FIELD_KEYS,
  DEFAULT_CANDIDATE_FIELDS,
  type CandidateFieldSetting,
  type CandidateFieldSettings,
} from "../models/AppSettings.js";
import { actorFrom, audit } from "./audit.service.js";

export async function getCandidateFieldSettings(): Promise<CandidateFieldSettings> {
  const doc = await AppSettings.findOne({ key: "global" }).lean();
  const stored = (doc?.candidateFields ?? {}) as Partial<CandidateFieldSettings>;
  const merged = { ...DEFAULT_CANDIDATE_FIELDS };
  for (const key of CANDIDATE_FIELD_KEYS) {
    const s = stored[key];
    if (s && typeof s.enabled === "boolean" && typeof s.required === "boolean") {
      merged[key] = { enabled: s.enabled, required: s.enabled && s.required };
    }
  }
  return merged;
}

export async function getSettings() {
  return { candidateFields: await getCandidateFieldSettings() };
}

export async function updateSettings(
  req: Request,
  input: { candidateFields?: Partial<Record<keyof CandidateFieldSettings, CandidateFieldSetting | undefined>> },
) {
  const current = await getCandidateFieldSettings();
  const next = { ...current };
  for (const key of CANDIDATE_FIELD_KEYS) {
    const v = input.candidateFields?.[key];
    if (v) next[key] = { enabled: v.enabled, required: v.enabled && v.required };
  }
  await AppSettings.findOneAndUpdate(
    { key: "global" },
    { $set: { candidateFields: next, updatedBy: new Types.ObjectId(req.auth!.user.id) } },
    { upsert: true, new: true },
  );
  await audit({
    action: "SETTINGS_UPDATED",
    actor: actorFrom(req),
    targetType: "Settings",
    targetId: "global",
    metadata: { candidateFields: next },
    req,
  });
  return { candidateFields: next };
}
