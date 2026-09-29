import { z } from "zod";
import { AppError } from "../utils/errors.js";

/**
 * Parses `data` with `schema`, throwing a consistent VALIDATION_ERROR on
 * failure. Used by controllers for body, query and params.
 */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  const first = result.error.issues[0];
  const where = first?.path.length ? `${first.path.join(".")}: ` : "";
  throw new AppError("VALIDATION_ERROR", `${where}${first?.message ?? "Invalid request."}`, { fieldErrors });
}
