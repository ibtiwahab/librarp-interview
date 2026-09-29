"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { authService } from "@/services/auth";
import { ApiError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Notice } from "@/components/ui/feedback";
import { AlertTriangle } from "lucide-react";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(128)
      .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Include at least one letter and one number."),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: "Passwords do not match.", path: ["confirm"] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: "Choose a different password.", path: ["newPassword"] });

type Values = z.infer<typeof schema>;

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { setUser } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const data = await authService.changePassword(v.currentPassword, v.newPassword);
      setUser(data.user);
      form.reset();
      toast.success("Password updated", { description: "Other sessions have been signed out." });
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.fieldError("currentPassword")) {
        form.setError("currentPassword", { message: err.fieldError("currentPassword") });
      } else if (err instanceof ApiError && err.fieldError("newPassword")) {
        form.setError("newPassword", { message: err.fieldError("newPassword") });
      } else setError(errorMessage(err));
    }
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <Notice tone="danger" icon={AlertTriangle}>
          {error}
        </Notice>
      )}
      <Field label="Current password" htmlFor="cp" error={e.currentPassword?.message}>
        <Input id="cp" type="password" autoComplete="current-password" aria-invalid={!!e.currentPassword} {...form.register("currentPassword")} />
      </Field>
      <Field label="New password" htmlFor="np" error={e.newPassword?.message} hint="At least 8 characters, including a letter and a number.">
        <Input id="np" type="password" autoComplete="new-password" aria-invalid={!!e.newPassword} {...form.register("newPassword")} />
      </Field>
      <Field label="Confirm new password" htmlFor="cf" error={e.confirm?.message}>
        <Input id="cf" type="password" autoComplete="new-password" aria-invalid={!!e.confirm} {...form.register("confirm")} />
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting}>
        Update password
      </Button>
    </form>
  );
}
