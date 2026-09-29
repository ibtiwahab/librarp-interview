import type { z } from "zod";
import { Types } from "mongoose";
import { AuditLog, type AuditCategory } from "../models/AuditLog.js";
import { escapeRegex, paginated } from "../utils/http.js";
import { forbidden } from "../utils/errors.js";
import { auditScope, type Principal } from "./authorization.service.js";
import type { listAuditQuery } from "../validators/misc.validators.js";

/** Head Admins see administrative, question-bank and interview activity — not raw auth events. */
const MANAGEMENT_CATEGORIES: AuditCategory[] = ["admin", "question", "interview", "system"];

export async function listAuditLogs(principal: Principal, q: z.infer<typeof listAuditQuery>) {
  const scope = auditScope(principal);
  if (scope === "NONE") throw forbidden("You do not have permission to view the audit log.");

  const and: Record<string, unknown>[] = [];
  if (scope === "MANAGEMENT") and.push({ category: { $in: MANAGEMENT_CATEGORIES } });
  if (q.category) {
    if (scope === "MANAGEMENT" && !MANAGEMENT_CATEGORIES.includes(q.category)) {
      throw forbidden("You do not have permission to view this audit category.");
    }
    and.push({ category: q.category });
  }
  if (q.action) and.push({ action: q.action });
  if (q.targetType) and.push({ targetType: q.targetType });
  if (q.targetId) and.push({ targetId: q.targetId });
  if (q.actor) and.push({ actor: new Types.ObjectId(q.actor) });
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    and.push({ $or: [{ targetLabel: re }, { "actorSnapshot.displayName": re }, { "actorSnapshot.username": re }, { action: re }] });
  }
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = q.from;
    if (q.to) {
      const end = new Date(q.to);
      if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0) end.setUTCDate(end.getUTCDate() + 1);
      range.$lt = end;
    }
    and.push({ createdAt: range });
  }
  const filter = and.length ? { $and: and } : {};

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    scope,
    ...paginated(
      items.map((l) => ({
        id: String(l._id),
        action: l.action,
        category: l.category,
        actor: l.actor ? { id: String(l.actor), ...(l.actorSnapshot ?? { username: "", displayName: "" }) } : null,
        targetType: l.targetType ?? null,
        targetId: l.targetId ?? null,
        targetLabel: l.targetLabel ?? null,
        metadata: l.metadata ?? {},
        ipAddress: scope === "ALL" ? (l.ipAddress ?? null) : null,
        createdAt: l.createdAt,
      })),
      total,
      q.page,
      q.limit,
    ),
  };
}
