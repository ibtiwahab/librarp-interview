import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import { principalOf } from "../middleware/auth.js";
import { ok } from "../utils/http.js";
import { organizationSchema, queryBool } from "../validators/common.js";
import { listAuditQuery, updateOrganizationSchema, updateSettingsSchema } from "../validators/misc.validators.js";
import { listOrganizationsFor, updateOrganization } from "../services/organization.service.js";
import { getSettings, updateSettings } from "../services/settings.service.js";
import { getDashboard } from "../services/dashboard.service.js";
import { listAuditLogs } from "../services/auditLog.service.js";
import { AUDIT_ACTIONS, AUDIT_CATEGORIES } from "../models/AuditLog.js";
import { INTERVIEW_TYPE_LABELS, INTERVIEW_TYPES } from "../config/organizations.js";

export async function health(_req: Request, res: Response) {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.setHeader("Cache-Control", "no-store");
  res.status(dbState === 1 ? 200 : 503).json({
    status: dbState === 1 ? "ok" : "degraded",
    database: dbState === 1 ? "connected" : "unavailable",
    uptime: Math.round(process.uptime()),
  });
}

export async function organizations(req: Request, res: Response) {
  const { includeInactive } = parse(z.object({ includeInactive: queryBool }), req.query);
  return ok(res, {
    interviewTypes: INTERVIEW_TYPES.map((t) => ({ code: t, label: INTERVIEW_TYPE_LABELS[t] })),
    organizations: await listOrganizationsFor(principalOf(req), includeInactive ?? false),
  });
}

export async function patchOrganization(req: Request, res: Response) {
  const code = parse(organizationSchema, req.params.code);
  return ok(res, await updateOrganization(req, code, parse(updateOrganizationSchema, req.body)));
}

export async function settings(_req: Request, res: Response) {
  return ok(res, await getSettings());
}

export async function patchSettings(req: Request, res: Response) {
  return ok(res, await updateSettings(req, parse(updateSettingsSchema, req.body)));
}

export async function dashboard(req: Request, res: Response) {
  return ok(res, await getDashboard(principalOf(req)));
}

export async function auditLogs(req: Request, res: Response) {
  return ok(res, await listAuditLogs(principalOf(req), parse(listAuditQuery, req.query)));
}

export async function auditMeta(_req: Request, res: Response) {
  return ok(res, { actions: AUDIT_ACTIONS, categories: AUDIT_CATEGORIES });
}
