import { z } from "zod";
import { passwordSchema } from "./common.js";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username.").max(64),
  password: z.string().min(1, "Enter your password.").max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "The new password must be different from your current password.",
    path: ["newPassword"],
  });
