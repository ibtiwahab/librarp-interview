import type { NextFunction, Request, Response } from "express";
import { AdminUser } from "../models/AdminUser.js";
import type { Permission, Role } from "../config/roles.js";
import { AppError, forbidden } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/tokens.js";
import { hasAnyPermission, hasPermission, type Principal } from "../services/authorization.service.js";

export interface AuthContext {
  user: {
    id: string;
    username: string;
    displayName: string;
    roles: Role[];
    mustChangePassword: boolean;
  };
  sessionId: string;
  principal: Principal;
}

function bearer(req: Request): string | undefined {
  const header = req.get("authorization");
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

interface RequireAuthOptions {
  /** Allow access while the account is flagged to change its password. */
  allowPendingPasswordChange?: boolean;
}

/**
 * Verifies the access token AND reloads the account from MongoDB on every
 * request, so role changes, disables and deletions take effect immediately.
 * Nothing about roles or permissions is trusted from the client.
 */
export function requireAuth(options: RequireAuthOptions = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) throw new AppError("UNAUTHORIZED", "Authentication is required.");

    const payload = verifyAccessToken(token);
    const user = await AdminUser.findById(payload.sub).lean();
    if (!user || user.deletedAt) throw new AppError("UNAUTHORIZED", "Your account is no longer available.");
    if (!user.active) {
      throw new AppError("ACCOUNT_DISABLED", "This account has been disabled. Contact a senior administrator.");
    }
    if (user.tokenVersion !== payload.ver) {
      throw new AppError("TOKEN_EXPIRED", "Your session was updated. Please refresh.");
    }
    if (user.mustChangePassword && !options.allowPendingPasswordChange) {
      throw new AppError("PASSWORD_CHANGE_REQUIRED", "You must change your password before continuing.");
    }

    const id = String(user._id);
    req.auth = {
      user: {
        id,
        username: user.username,
        displayName: user.displayName,
        roles: [...user.roles],
        mustChangePassword: user.mustChangePassword,
      },
      sessionId: payload.sid,
      principal: { id, roles: [...user.roles] },
    };
    next();
  };
}

export function principalOf(req: Request): Principal {
  if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication is required.");
  return req.auth.principal;
}

export function requirePermission(permission: Permission, message?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!hasPermission(principalOf(req), permission)) throw forbidden(message);
    next();
  };
}

export function requireAnyPermission(permissions: readonly Permission[], message?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!hasAnyPermission(principalOf(req), permissions)) throw forbidden(message);
    next();
  };
}
