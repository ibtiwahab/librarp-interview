import { z } from "zod";
import { AUDIT_ACTIONS, AUDIT_CATEGORIES, AUDIT_TARGET_TYPES } from "../models/AuditLog.js";
import { CANDIDATE_FIELD_KEYS } from "../models/AppSettings.js";
import { dateString, objectId, pagination } from "./common.js";

export const listAuditQuery = pagination.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.enum(AUDIT_ACTIONS).optional(),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  targetId: z.string().trim().max(64).optional(),
  actor: objectId.optional(),
  search: z.string().trim().max(100).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

const fieldSetting = z.object({ enabled: z.boolean(), required: z.boolean() });

export const updateSettingsSchema = z.object({
  candidateFields: z
    .object(Object.fromEntries(CANDIDATE_FIELD_KEYS.map((k) => [k, fieldSetting.optional()])) as Record<
      (typeof CANDIDATE_FIELD_KEYS)[number],
      z.ZodOptional<typeof fieldSetting>
    >)
    .optional(),
});

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    shortName: z.string().trim().min(1).max(40).optional(),
    description: z.string().trim().max(500).optional(),
    logo: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//i.test(v), {
        message: "Logo must be a site path (e.g. /orgs/fib.png) or an https:// URL.",
      })
      .optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-f]{6}$/i, "Colour must be a hex value like #4a6fa5.")
      .optional(),
    defaultPosition: z.string().trim().max(80).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "No changes were provided." });
