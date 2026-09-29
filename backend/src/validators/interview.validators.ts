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

export const startInterviewSchema = z.object({
  organization: organizationSchema,
  questionSet: objectId.optional(),
  candidate: candidateSchema,
  positionAppliedFor: optionalText(100),
  interviewDate: dateString.optional(),
  additionalNotes: optionalText(5000),
});

export const autosaveSchema = z.object({
  currentIndex: z.number().int().min(0).optional(),
  answers: z
    .array(
      z.object({
        id: objectId,
        candidateAnswerNotes: z.string().max(10000).optional(),
        interviewerNotes: z.string().max(10000).optional(),
        result: z.enum(QUESTION_RESULTS).optional(),
      }),
    )
    .max(500)
    .optional(),
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
});

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
