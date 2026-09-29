import { z } from "zod";
import { FINAL_STATUSES, INTERVIEW_STATUSES, QUESTION_RESULTS } from "../models/Interview.js";
import { dateString, interviewTypeSchema, objectId, organizationSchema, pagination } from "./common.js";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const candidateSchema = z.object({
  name: z.string().trim().min(2, "Candidate name must be at least 2 characters.").max(100),
  discordUsername: optionalText(64),
  discordId: z
    .string()
    .trim()
    .max(32)
    .refine((v) => v === "" || /^\d{15,21}$/.test(v), { message: "Discord IDs are 15–21 digit numbers." })
    .optional()
    .default(""),
  inGameName: optionalText(100),
  inGameId: optionalText(32),
  age: z.coerce.number().int().min(10).max(100).nullable().optional().default(null),
  timezone: optionalText(64),
});

/** A recording link must be a full http(s) URL (blocks javascript: and similar schemes). */
export const recordingLinkSchema = z
  .string()
  .trim()
  .max(500, "Links must be at most 500 characters.")
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Enter a full link starting with https:// (YouTube, Medal, Google Drive…)." },
  );

export const recordingLinksSchema = z
  .array(recordingLinkSchema)
  .max(10, "At most 10 recording links per interview.")
  .transform((links) => [...new Set(links)]);

const answerPatch = z.object({
  id: objectId,
  candidateAnswerNotes: z.string().max(10000).optional(),
  interviewerNotes: z.string().max(10000).optional(),
  result: z.enum(QUESTION_RESULTS).optional(),
});

export const startInterviewSchema = z.object({
  recordingLinks: recordingLinksSchema.optional(),
  organization: organizationSchema,
  questionSet: objectId.optional(),
  candidate: candidateSchema,
  positionAppliedFor: optionalText(100),
  interviewDate: dateString.optional(),
  additionalNotes: optionalText(5000),
});

export const autosaveSchema = z.object({
  currentIndex: z.number().int().min(0).optional(),
  answers: z.array(answerPatch).max(500).optional(),
  recordingLinks: recordingLinksSchema.optional(),
  candidate: candidateSchema.partial().optional(),
  positionAppliedFor: z.string().trim().max(100).optional(),
  additionalNotes: z.string().max(5000).optional(),
  finalComments: z.string().max(10000).optional(),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
});

export const completeInterviewSchema = z.object({
  status: z.enum(FINAL_STATUSES, { message: "Choose Passed, Failed, On Hold or Cancelled." }),
  finalComments: z.string().trim().max(10000).default(""),
  strengths: z.string().trim().max(5000).default(""),
  concerns: z.string().trim().max(5000).default(""),
  recordingLinks: recordingLinksSchema.optional(),
});

/** Edits to an interview after its decision was recorded (the decision itself is not editable). */
export const updateRecordSchema = z
  .object({
    recordingLinks: recordingLinksSchema.optional(),
    answers: z.array(answerPatch).max(500).optional(),
    finalComments: z.string().trim().max(10000).optional(),
    strengths: z.string().trim().max(5000).optional(),
    concerns: z.string().trim().max(5000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "No changes were provided." });

export const listInterviewsQuery = pagination.extend({
  search: z.string().trim().max(100).optional(),
  candidate: z.string().trim().max(100).optional(),
  discordId: z.string().trim().max(32).optional(),
  inGameId: z.string().trim().max(32).optional(),
  interviewer: objectId.optional(),
  organization: organizationSchema.optional(),
  interviewType: interviewTypeSchema.optional(),
  status: z.enum(INTERVIEW_STATUSES).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  sort: z.enum(["-interviewDate", "interviewDate", "-createdAt", "createdAt"]).default("-interviewDate"),
});
