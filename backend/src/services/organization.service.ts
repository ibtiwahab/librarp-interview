import type { Request } from "express";
import type { z } from "zod";
import { ORGANIZATIONS, type InterviewType, type OrganizationCode } from "../config/organizations.js";
import { Organization, type IOrganization } from "../models/Organization.js";
import { QuestionSet } from "../models/QuestionSet.js";
import { Question } from "../models/Question.js";
import { notFound } from "../utils/errors.js";
import { canInterviewOrganization, canManageQuestions, canViewQuestions, type Principal } from "./authorization.service.js";
import { actorFrom, audit } from "./audit.service.js";
import type { updateOrganizationSchema } from "../validators/misc.validators.js";

/** Inserts any organizations from config that are missing in the database. */
export async function ensureOrganizations(): Promise<void> {
  const existing = new Set((await Organization.find().select("code").lean()).map((o) => o.code));
  const missing = ORGANIZATIONS.filter((o) => !existing.has(o.code));
  if (missing.length) {
    await Organization.insertMany(missing.map((o) => ({ ...o })));
    console.info(`[orgs] Seeded ${missing.length} organization(s).`);
  }
}

export async function listOrganizationDocs(includeInactive = false): Promise<IOrganization[]> {
  const docs = await Organization.find(includeInactive ? {} : { active: true }).sort({ order: 1 }).lean();
  if (docs.length) return docs;
  // Fallback if the collection has not been seeded yet.
  return ORGANIZATIONS.filter((o) => includeInactive || o.active).map((o) => ({
    ...o,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

export async function getOrganization(code: OrganizationCode): Promise<IOrganization> {
  const doc = await Organization.findOne({ code }).lean();
  if (doc) return doc;
  const cfg = ORGANIZATIONS.find((o) => o.code === code);
  if (!cfg) throw notFound("Organization not found.");
  return { ...cfg, createdAt: new Date(0), updatedAt: new Date(0) };
}

export async function listOrganizationsFor(principal: Principal, includeInactive = false) {
  const orgs = await listOrganizationDocs(includeInactive);
  const codes = orgs.map((o) => o.code);

  const [defaults, counts] = await Promise.all([
    QuestionSet.find({ organization: { $in: codes }, isDefault: true, active: true }).select("_id name organization").lean(),
    Question.aggregate<{ _id: { organization: OrganizationCode; set: unknown }; n: number }>([
      { $match: { organization: { $in: codes }, active: true } },
      { $group: { _id: { organization: "$organization", set: "$questionSet" }, n: { $sum: 1 } } },
    ]),
  ]);
  const defaultByOrg = new Map(defaults.map((d) => [d.organization, d]));

  return orgs.map((o) => {
    const def = defaultByOrg.get(o.code);
    const defCount = def ? (counts.find((c) => c._id.organization === o.code && String(c._id.set) === String(def._id))?.n ?? 0) : 0;
    return {
      code: o.code,
      name: o.name,
      shortName: o.shortName,
      category: o.category,
      description: o.description,
      logo: o.logo,
      color: o.color,
      defaultPosition: o.defaultPosition,
      order: o.order,
      active: o.active,
      canConduct: canInterviewOrganization(principal, o.code),
      canViewQuestions: canViewQuestions(principal, o.category as InterviewType),
      canManageQuestions: canManageQuestions(principal, o.category as InterviewType),
      defaultQuestionSet: def ? { id: String(def._id), name: def.name, questionCount: defCount } : null,
    };
  });
}

export async function updateOrganization(req: Request, code: OrganizationCode, input: z.infer<typeof updateOrganizationSchema>) {
  const doc = await Organization.findOne({ code });
  if (!doc) throw notFound("Organization not found.");
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    const key = k as keyof typeof input;
    if (doc.get(key) !== v) {
      changes[key] = { from: doc.get(key), to: v };
      doc.set(key, v);
    }
  }
  await doc.save();
  if (Object.keys(changes).length) {
    await audit({
      action: "ORGANIZATION_UPDATED",
      actor: actorFrom(req),
      targetType: "Organization",
      targetId: code,
      targetLabel: doc.name,
      metadata: { changes },
      req,
    });
  }
  return doc.toObject();
}
