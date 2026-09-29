import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export interface AccessTokenPayload {
  sub: string;
  /** AdminUser.tokenVersion at issue time. */
  ver: number;
  sid: string;
}

export interface RefreshTokenPayload {
  sid: string;
  jti: string;
}

const common = { issuer: env.jwt.issuer, audience: env.jwt.audience, algorithm: "HS256" as const };

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    ...common,
    expiresIn: env.jwt.accessTtl as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret, {
      issuer: common.issuer,
      audience: common.audience,
      algorithms: [common.algorithm],
    });
    if (typeof decoded !== "object" || typeof decoded.sub !== "string" || typeof decoded.ver !== "number") {
      throw new AppError("UNAUTHORIZED", "Invalid access token.");
    }
    return { sub: decoded.sub, ver: decoded.ver, sid: String(decoded.sid ?? "") };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) throw new AppError("TOKEN_EXPIRED", "Your access token has expired.");
    throw new AppError("UNAUTHORIZED", "Invalid access token.");
  }
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    ...common,
    expiresIn: `${env.jwt.refreshTtlDays}d` as SignOptions["expiresIn"],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwt.refreshSecret, {
      issuer: common.issuer,
      audience: common.audience,
      algorithms: [common.algorithm],
    });
    if (typeof decoded !== "object" || typeof decoded.sid !== "string" || typeof decoded.jti !== "string") {
      throw new Error("malformed");
    }
    return { sid: decoded.sid, jti: decoded.jti };
  } catch {
    throw new AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }
}
