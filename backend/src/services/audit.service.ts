import type { Request } from "express";
import { AuditLog, type AuditAction, type AuditCategory, type AuditTargetType } from "../models/AuditLog.js";
import { clientIp, userAgent } from "../utils/http.js";

const CATEGORY_BY_PREFIX: Array<[string, AuditCategory]> = [
  ["AUTH_", "auth"],
  ["ADMIN_", "admin"],
  ["ROLE_", "admin"],
  ["BOOTSTRAP_", "admin"],
  ["QUESTION", "question"],
  ["INTERVIEW_", "interview"],
];

export function categoryForAction(action: AuditAction): AuditCategory {
  return CATEGORY_BY_PREFIX.find(([p]) => action.startsWith(p))?.[1] ?? "system";
}

/** Keys that must never be persisted in audit metadata. */
const FORBIDDEN_KEYS = /pass(word)?|token|secret|hash|cookie|authorization/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.test(k)) continue;
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  return value;
}

export interface AuditEntry {
  action: AuditAction;
  actor?: { id: string; username: string; displayName: string } | null;
  targetType?: AuditTargetType;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

/**
 * Records an audit event. Failures are logged but never break the request
 * that triggered them.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      action: entry.action,
      category: categoryForAction(entry.action),
      actor: entry.actor?.id ?? null,
      actorSnapshot: entry.actor ? { username: entry.actor.username, displayName: entry.actor.displayName } : null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      metadata: (scrub(entry.metadata ?? {}) as Record<string, unknown>) ?? {},
      ipAddress: entry.req ? (clientIp(entry.req) ?? null) : null,
      userAgent: entry.req ? (userAgent(entry.req) ?? null) : null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", (err as Error).message);
  }
}

/** Convenience: actor info from an authenticated request. */
export function actorFrom(req: Request): AuditEntry["actor"] {
  const u = req.auth?.user;
  return u ? { id: u.id, username: u.username, displayName: u.displayName } : null;
}
