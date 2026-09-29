export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_LOCKED"
  | "TOKEN_EXPIRED"
  | "SESSION_EXPIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "NO_TEXT_DETECTED"
  | "NO_QUESTIONS_DETECTED"
  | "UNPARSEABLE_FILE"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_LOCKED: 423,
  TOKEN_EXPIRED: 401,
  SESSION_EXPIRED: 401,
  PASSWORD_CHANGE_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  UNSUPPORTED_FILE_TYPE: 415,
  FILE_TOO_LARGE: 413,
  NO_TEXT_DETECTED: 422,
  NO_QUESTIONS_DETECTED: 422,
  UNPARSEABLE_FILE: 422,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError("BAD_REQUEST", message, details);
export const forbidden = (message = "You do not have permission to perform this action.") =>
  new AppError("FORBIDDEN", message);
export const notFound = (message = "The requested resource was not found.") => new AppError("NOT_FOUND", message);
export const conflict = (message: string, details?: unknown) => new AppError("CONFLICT", message, details);
export const invalidState = (message: string) => new AppError("INVALID_STATE", message);
export const unauthorized = (message = "Authentication is required.") => new AppError("UNAUTHORIZED", message);
