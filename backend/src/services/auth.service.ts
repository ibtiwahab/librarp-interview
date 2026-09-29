import type { Request } from "express";
import { AdminUser, type AdminUserDoc } from "../models/AdminUser.js";
import { Session } from "../models/Session.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { burnPasswordCheck, hashPassword, randomToken, safeEqualHex, sha256, verifyPassword } from "../utils/crypto.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import { clientIp, userAgent } from "../utils/http.js";
import { audit } from "./audit.service.js";
import { toSessionUser } from "./user.serializer.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
/** Concurrent tabs may refresh with the just-rotated token for a short time. */
const ROTATION_GRACE_MS = 30_000;

export interface IssuedTokens {
  accessToken: string;
  refreshToken?: string;
  refreshExpiresAt?: Date;
  user: ReturnType<typeof toSessionUser>;
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
}

export function isUsable(user: AdminUserDoc | null): user is AdminUserDoc {
  return !!user && !user.deletedAt;
}

async function createSession(user: AdminUserDoc, req: Request): Promise<IssuedTokens> {
  const jti = randomToken();
  const expiresAt = refreshExpiry();
  const session = await Session.create({
    user: user._id,
    tokenHash: sha256(jti),
    expiresAt,
    ipAddress: clientIp(req),
    userAgent: userAgent(req),
  });
  const sid = String(session._id);
  return {
    accessToken: signAccessToken({ sub: String(user._id), ver: user.tokenVersion, sid }),
    refreshToken: signRefreshToken({ sid, jti }),
    refreshExpiresAt: expiresAt,
    user: toSessionUser(user),
  };
}

export async function login(identifier: string, password: string, req: Request): Promise<IssuedTokens> {
  const id = identifier.trim().toLowerCase();
  const user = await AdminUser.findOne({
    deletedAt: null,
    username: id,
  }).select("+passwordHash");

  const invalid = new AppError("INVALID_CREDENTIALS", "Incorrect username or password.");

  if (!user) {
    await burnPasswordCheck(password);
    await audit({ action: "AUTH_LOGIN_FAILED", metadata: { identifier: id.slice(0, 80), reason: "unknown_user" }, req });
    throw invalid;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(
      "ACCOUNT_LOCKED",
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await audit({
      action: "AUTH_LOGIN_FAILED",
      targetType: "AdminUser",
      targetId: String(user._id),
      targetLabel: user.username,
      metadata: { reason: "bad_password", locked: !!user.lockedUntil && user.lockedUntil > new Date() },
      req,
    });
    throw invalid;
  }

  if (!user.active) {
    throw new AppError("ACCOUNT_DISABLED", "This account has been disabled. Contact a senior administrator.");
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await createSession(user, req);
  await audit({
    action: "AUTH_LOGIN",
    actor: { id: String(user._id), username: user.username, displayName: user.displayName },
    targetType: "AdminUser",
    targetId: String(user._id),
    targetLabel: user.username,
    req,
  });
  return tokens;
}

export async function refresh(rawToken: string | undefined, req: Request): Promise<IssuedTokens> {
  if (!rawToken) throw new AppError("SESSION_EXPIRED", "You are not signed in.");
  const { sid, jti } = verifyRefreshToken(rawToken);

  const session = await Session.findById(sid);
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    throw new AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }

  const presented = sha256(jti);
  const isCurrent = safeEqualHex(presented, session.tokenHash);
  const isRecentPrevious =
    !isCurrent &&
    !!session.previousTokenHash &&
    safeEqualHex(presented, session.previousTokenHash) &&
    !!session.rotatedAt &&
    Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;

  if (!isCurrent && !isRecentPrevious) {
    // A rotated-out token was replayed: assume theft and kill the session.
    session.revokedAt = new Date();
    session.revokedReason = "refresh_token_reuse";
    await session.save();
    await audit({
      action: "AUTH_SESSION_REUSE_DETECTED",
      targetType: "Session",
      targetId: String(session._id),
      metadata: { userId: String(session.user) },
      req,
    });
    throw new AppError("SESSION_EXPIRED", "Your session is no longer valid. Please sign in again.");
  }

  const user = await AdminUser.findById(session.user);
  if (!isUsable(user)) throw new AppError("SESSION_EXPIRED", "Your account is no longer available.");
  if (!user.active) {
    throw new AppError("ACCOUNT_DISABLED", "This account has been disabled. Contact a senior administrator.");
  }

  const accessToken = signAccessToken({ sub: String(user._id), ver: user.tokenVersion, sid: String(session._id) });

  if (isRecentPrevious) {
    // Another tab already rotated the cookie; just hand out an access token.
    return { accessToken, user: toSessionUser(user) };
  }

  const nextJti = randomToken();
  session.previousTokenHash = session.tokenHash;
  session.tokenHash = sha256(nextJti);
  session.rotatedAt = new Date();
  session.lastUsedAt = new Date();
  session.expiresAt = refreshExpiry();
  await session.save();

  return {
    accessToken,
    refreshToken: signRefreshToken({ sid: String(session._id), jti: nextJti }),
    refreshExpiresAt: session.expiresAt,
    user: toSessionUser(user),
  };
}

export async function logout(rawToken: string | undefined, req: Request): Promise<void> {
  if (!rawToken) return;
  try {
    const { sid } = verifyRefreshToken(rawToken);
    const session = await Session.findByIdAndUpdate(sid, { revokedAt: new Date(), revokedReason: "logout" });
    if (session) {
      const user = await AdminUser.findById(session.user);
      await audit({
        action: "AUTH_LOGOUT",
        actor: user ? { id: String(user._id), username: user.username, displayName: user.displayName } : null,
        req,
      });
    }
  } catch {
    // Invalid/expired tokens: nothing to revoke.
  }
}

export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
  const filter: Record<string, unknown> = { user: userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  await Session.updateMany(filter, { revokedAt: new Date(), revokedReason: reason });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  req: Request,
): Promise<IssuedTokens> {
  const user = await AdminUser.findById(userId).select("+passwordHash");
  if (!isUsable(user)) throw new AppError("UNAUTHORIZED", "Account not found.");

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION_ERROR", "Your current password is incorrect.", {
      fieldErrors: { currentPassword: ["Your current password is incorrect."] },
    });
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AppError("VALIDATION_ERROR", "The new password must be different from your current password.", {
      fieldErrors: { newPassword: ["Choose a password you have not used for this account."] },
    });
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  user.tokenVersion += 1;
  await user.save();

  await revokeAllSessions(String(user._id), "password_changed");
  await audit({
    action: "AUTH_PASSWORD_CHANGED",
    actor: { id: String(user._id), username: user.username, displayName: user.displayName },
    targetType: "AdminUser",
    targetId: String(user._id),
    targetLabel: user.username,
    req,
  });
  return createSession(user, req);
}
