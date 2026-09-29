import type { CookieOptions, NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AdminUser } from "../models/AdminUser.js";
import { parse } from "../middleware/validate.js";
import { changePasswordSchema, loginSchema } from "../validators/auth.validators.js";
import * as authService from "../services/auth.service.js";
import { toSessionUser } from "../services/user.serializer.js";
import { ok } from "../utils/http.js";
import { AppError } from "../utils/errors.js";

export const REFRESH_COOKIE = "lrp_rt";

function cookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: "/api/auth",
    ...(expires ? { expires } : {}),
  };
}

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(REFRESH_COOKIE, token, cookieOptions(expires));
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

/**
 * Cookie-authenticated endpoints require a custom header. Browsers cannot send
 * it cross-origin without a CORS preflight, which only our frontend passes.
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (req.get("x-requested-with") !== "librarp") {
    throw new AppError("FORBIDDEN", "Missing request verification header.");
  }
  next();
}

function respondWithTokens(res: Response, tokens: authService.IssuedTokens) {
  if (tokens.refreshToken && tokens.refreshExpiresAt) setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  res.setHeader("Cache-Control", "no-store");
  return ok(res, { accessToken: tokens.accessToken, user: tokens.user });
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = parse(loginSchema, req.body);
  const tokens = await authService.login(identifier, password, req);
  return respondWithTokens(res, tokens);
}

export async function refresh(req: Request, res: Response) {
  try {
    const tokens = await authService.refresh(req.cookies?.[REFRESH_COOKIE], req);
    return respondWithTokens(res, tokens);
  } catch (err) {
    if (err instanceof AppError && (err.code === "SESSION_EXPIRED" || err.code === "ACCOUNT_DISABLED")) clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], req);
  clearRefreshCookie(res);
  return ok(res, { signedOut: true });
}

export async function me(req: Request, res: Response) {
  const user = await AdminUser.findById(req.auth!.user.id);
  if (!user) throw new AppError("UNAUTHORIZED", "Account not found.");
  res.setHeader("Cache-Control", "no-store");
  return ok(res, toSessionUser(user));
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const tokens = await authService.changePassword(req.auth!.user.id, currentPassword, newPassword, req);
  return respondWithTokens(res, tokens);
}
