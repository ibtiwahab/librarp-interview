import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { AppError } from "../utils/errors.js";
import { env } from "../config/env.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError("NOT_FOUND", `Route ${req.method} ${req.path} does not exist.`));
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return new AppError("FILE_TOO_LARGE", `This file is too large. The maximum upload size is ${env.upload.maxBytes / 1024 / 1024} MB.`);
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") return new AppError("BAD_REQUEST", "Upload the document in the “file” field.");
    return new AppError("BAD_REQUEST", err.message);
  }

  if (err instanceof mongoose.Error.CastError) {
    return new AppError("BAD_REQUEST", `Invalid value for ${err.path}.`);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(err.errors)) fieldErrors[k] = [v.message];
    const first = Object.values(err.errors)[0];
    return new AppError("VALIDATION_ERROR", first?.message ?? "Validation failed.", { fieldErrors });
  }

  const anyErr = err as { code?: number; keyValue?: Record<string, unknown>; type?: string; status?: number };
  if (anyErr?.code === 11000) {
    const field = Object.keys(anyErr.keyValue ?? {})[0] ?? "value";
    const label = field;
    return new AppError("CONFLICT", `That ${label} is already in use.`, { field });
  }
  if (anyErr?.type === "entity.parse.failed") return new AppError("BAD_REQUEST", "The request body is not valid JSON.");
  if (anyErr?.type === "entity.too.large") return new AppError("FILE_TOO_LARGE", "The request body is too large.");

  return new AppError("INTERNAL_ERROR", "An unexpected server error occurred. The error has been logged.");
}

// Express recognises error handlers by their four-argument signature.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const appErr = toAppError(err);
  if (appErr.status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }
  res.status(appErr.status).json({
    success: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
    },
  });
}
