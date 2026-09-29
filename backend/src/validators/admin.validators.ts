import { z } from "zod";
import { pagination, passwordSchema, roleSchema } from "./common.js";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be at most 32 characters.")
  .regex(/^[a-z0-9._-]+$/, "Username may only contain letters, numbers, dots, dashes and underscores.");

const discordId = z
  .string()
  .trim()
  .regex(/^\d{15,21}$/, "Discord IDs are 15–21 digit numbers.")
  .optional()
  .or(z.literal("").transform(() => undefined))
  .nullable();

export const listAdminsQuery = pagination.extend({
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: z.enum(["active", "disabled", "all"]).default("all"),
  sort: z.enum(["createdAt", "-createdAt", "displayName", "-displayName", "lastLoginAt", "-lastLoginAt"]).default("-createdAt"),
});

export const createAdminSchema = z.object({
  username,
  /** Optional — defaults to the username. */
  displayName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v ? v : undefined)),
  discordId,
  /** Omit to have the server generate a one-time temporary password. */
  password: passwordSchema.optional(),
  roles: z.array(roleSchema).max(8).default([]),
});

export const updateAdminSchema = z
  .object({
    username: username.optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
    discordId,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "No changes were provided." });

export const setRolesSchema = z.object({
  roles: z.array(roleSchema).min(1, "An administrator must keep at least one role.").max(8),
});

export const addRoleSchema = z.object({ role: roleSchema });

export const resetPasswordSchema = z.object({
  password: passwordSchema.optional(),
});
