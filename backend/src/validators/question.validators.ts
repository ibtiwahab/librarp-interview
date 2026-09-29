import { z } from "zod";
import { interviewTypeSchema, objectId, organizationSchema, pagination, queryBool } from "./common.js";

const followUps = z
  .array(z.string().trim().min(1).max(1000))
  .max(20, "At most 20 follow-up prompts per question.")
  .default([]);

export const questionInput = z.object({
  questionText: z.string().trim().min(3, "Question text must be at least 3 characters.").max(2000),
  followUpPrompts: followUps,
  expectedAnswer: z.string().trim().max(4000).default(""),
  interviewerNotes: z.string().trim().max(4000).default(""),
  category: z.string().trim().max(80).default(""),
  required: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const createQuestionSchema = questionInput.extend({ questionSet: objectId });

export const updateQuestionSchema = questionInput
  .partial()
  .extend({
    questionText: z.string().trim().min(3).max(2000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "No changes were provided." });

export const listQuestionsQuery = pagination.extend({
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  questionSet: objectId.optional(),
  interviewType: interviewTypeSchema.optional(),
  organization: organizationSchema.optional(),
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  active: queryBool,
});

export const reorderSchema = z.object({
  questionSet: objectId,
  orderedIds: z.array(objectId).min(1).max(2000),
});

export const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), ids: z.array(objectId).min(1).max(1000) }),
  z.object({ action: z.literal("deactivate"), ids: z.array(objectId).min(1).max(1000) }),
  z.object({ action: z.literal("delete"), ids: z.array(objectId).min(1).max(1000) }),
  z.object({ action: z.literal("setRequired"), ids: z.array(objectId).min(1).max(1000), required: z.boolean() }),
  z.object({ action: z.literal("setCategory"), ids: z.array(objectId).min(1).max(1000), category: z.string().trim().max(80) }),
  z.object({ action: z.literal("move"), ids: z.array(objectId).min(1).max(1000), targetQuestionSet: objectId }),
  z.object({ action: z.literal("copy"), ids: z.array(objectId).min(1).max(1000), targetQuestionSet: objectId }),
]);

export const bulkImportSchema = z.object({
  questionSet: objectId,
  fileName: z.string().trim().max(255).optional(),
  duplicateStrategy: z.enum(["skip", "import"]).default("skip"),
  questions: z
    .array(
      questionInput.extend({
        allowDuplicate: z.boolean().optional(),
      }),
    )
    .min(1, "Select at least one question to import.")
    .max(1000, "At most 1000 questions can be imported at once."),
});

export const checkDuplicatesSchema = z.object({
  questionSet: objectId,
  questions: z.array(z.string().max(2000)).max(1000),
});

export const mapColumnsSchema = z.object({
  rows: z.array(z.array(z.string().max(4000)).max(100)).min(1).max(5000),
  hasHeader: z.boolean(),
  mapping: z.object({
    question: z.number().int().min(0),
    expectedAnswer: z.number().int().min(0).nullable().optional(),
    followUp: z.number().int().min(0).nullable().optional(),
    category: z.number().int().min(0).nullable().optional(),
    required: z.number().int().min(0).nullable().optional(),
    order: z.number().int().min(0).nullable().optional(),
    notes: z.number().int().min(0).nullable().optional(),
  }),
});

export const createQuestionSetSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  description: z.string().trim().max(1000).default(""),
  organization: organizationSchema,
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const updateQuestionSetSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    active: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "No changes were provided." });

export const duplicateQuestionSetSchema = z.object({
  name: z.string().trim().min(2).max(120),
  organization: organizationSchema.optional(),
});

export const listQuestionSetsQuery = z.object({
  interviewType: interviewTypeSchema.optional(),
  organization: organizationSchema.optional(),
  includeInactive: queryBool,
});
