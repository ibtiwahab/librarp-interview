import { z } from "zod";
import { Types } from "mongoose";
import { INTERVIEW_TYPES, ORGANIZATION_CODES } from "../config/organizations.js";
import { ROLES } from "../config/roles.js";

export const objectId = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v) && /^[a-f\d]{24}$/i.test(v), { message: "Invalid identifier." });

export const idParams = z.object({ id: objectId });

export const roleSchema = z.enum(ROLES, { message: "Unknown role." });
export const interviewTypeSchema = z.enum(INTERVIEW_TYPES, { message: "Unknown interview type." });
export const organizationSchema = z.enum(ORGANIZATION_CODES, { message: "Unknown organization." });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Query-string boolean ("true"/"false"/"1"/"0"). */
export const queryBool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true" || v === "1"));

export const trimmed = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters.`);
export const optionalTrimmed = (max: number) => trimmed(max).optional().default("");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), { message: "Password must contain at least one letter and one number." });

export const dateString = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date." })
  .transform((v) => new Date(v));
