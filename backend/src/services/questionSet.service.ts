import type { Request } from "express";
import type { z } from "zod";
import mongoose, { Types } from "mongoose";
import { QuestionSet, type IQuestionSet } from "../models/QuestionSet.js";
import { Question } from "../models/Question.js";
import { organizationCategory, type InterviewType, type OrganizationCode } from "../config/organizations.js";
import { AppError, conflict, forbidden, notFound } from "../utils/errors.js";
import {
  canManageQuestions,
  canViewQuestions,
  conductableInterviewTypes,
  manageableQuestionTypes,
  type Principal,
} from "./authorization.service.js";
import { actorFrom, audit } from "./audit.service.js";
import type {
  createQuestionSetSchema,
  duplicateQuestionSetSchema,
  listQuestionSetsQuery,
  updateQuestionSetSchema,
} from "../validators/question.validators.js";

type SetLean = IQuestionSet & { _id: Types.ObjectId };

export function serializeSet(s: SetLean, counts?: { total: number; active: number }, principal?: Principal) {
  return {
    id: String(s._id),
    name: s.name,
    description: s.description,
    interviewType: s.interviewType,
    organization: s.organization,
    isDefault: s.isDefault,
    active: s.active,
    questionCount: counts?.total ?? 0,
    activeQuestionCount: counts?.active ?? 0,
    canManage: principal ? canManageQuestions(principal, s.interviewType) : false,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function countsFor(ids: Types.ObjectId[]) {
  const rows = await Question.aggregate<{ _id: Types.ObjectId; total: number; active: number }>([
    { $match: { questionSet: { $in: ids } } },
    { $group: { _id: "$questionSet", total: { $sum: 1 }, active: { $sum: { $cond: ["$active", 1, 0] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, active: r.active }]));
}

export async function loadSet(id: string): Promise<mongoose.HydratedDocument<IQuestionSet>> {
  const set = await QuestionSet.findById(id);
  if (!set) throw notFound("Question set not found.");
  return set;
}

export function assertCanView(principal: Principal, type: InterviewType) {
  if (!canViewQuestions(principal, type)) throw forbidden("You do not have access to this question bank.");
}

export function assertCanManage(principal: Principal, type: InterviewType) {
  if (!canManageQuestions(principal, type)) {
    throw forbidden(`You do not have permission to manage ${type.toLowerCase()} interview questions.`);
  }
}

export async function listSets(principal: Principal, q: z.infer<typeof listQuestionSetsQuery>) {
  const visible = new Set<InterviewType>([...conductableInterviewTypes(principal), ...manageableQuestionTypes(principal)]);
  if (q.interviewType && !visible.has(q.interviewType)) throw forbidden("You do not have access to this question bank.");
  const filter: Record<string, unknown> = { interviewType: { $in: q.interviewType ? [q.interviewType] : [...visible] } };
  if (q.organization) filter.organization = q.organization;
  if (!q.includeInactive) filter.active = true;
  const sets = await QuestionSet.find(filter).sort({ organization: 1, isDefault: -1, name: 1 }).lean();
  const counts = await countsFor(sets.map((s) => s._id));
  return sets.map((s) => serializeSet(s, counts.get(String(s._id)), principal));
}

export async function getSet(principal: Principal, id: string) {
  const set = await QuestionSet.findById(id).lean();
  if (!set) throw notFound("Question set not found.");
  assertCanView(principal, set.interviewType);
  const counts = await countsFor([set._id]);
  return serializeSet(set, counts.get(String(set._id)), principal);
}

async function clearDefault(organization: OrganizationCode, exceptId?: Types.ObjectId) {
  await QuestionSet.updateMany(
    { organization, isDefault: true, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { $set: { isDefault: false } },
  );
}

export async function createSet(req: Request, input: z.infer<typeof createQuestionSetSchema>) {
  const principal = req.auth!.principal;
  const interviewType = organizationCategory(input.organization)!;
  assertCanManage(principal, interviewType);

  const existing = await QuestionSet.countDocuments({ organization: input.organization });
  const isDefault = input.isDefault || existing === 0;
  if (isDefault) await clearDefault(input.organization);

  const set = await QuestionSet.create({
    ...input,
    interviewType,
    isDefault,
    createdBy: new Types.ObjectId(principal.id),
    updatedBy: new Types.ObjectId(principal.id),
  });
  await audit({
    action: "QUESTION_SET_CREATED",
    actor: actorFrom(req),
    targetType: "QuestionSet",
    targetId: String(set._id),
    targetLabel: set.name,
    metadata: { organization: set.organization, isDefault },
    req,
  });
  return serializeSet(set.toObject(), { total: 0, active: 0 }, principal);
}

export async function updateSet(req: Request, id: string, input: z.infer<typeof updateQuestionSetSchema>) {
  const principal = req.auth!.principal;
  const set = await loadSet(id);
  assertCanManage(principal, set.interviewType);

  if (input.isDefault === false && set.isDefault) {
    throw new AppError("INVALID_STATE", "Choose another set as the default instead of unsetting the current default.");
  }
  if (input.active === false && (input.isDefault ?? set.isDefault)) {
    throw new AppError("INVALID_STATE", "The default question set cannot be deactivated. Make another set the default first.");
  }
  if (input.isDefault && !set.isDefault) await clearDefault(set.organization, set._id);

  const before = { name: set.name, description: set.description, active: set.active, isDefault: set.isDefault };
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  if (input.active !== undefined) set.active = input.active;
  if (input.isDefault !== undefined) set.isDefault = input.isDefault;
  set.updatedBy = new Types.ObjectId(principal.id);
  await set.save();

  await audit({
    action: "QUESTION_SET_UPDATED",
    actor: actorFrom(req),
    targetType: "QuestionSet",
    targetId: id,
    targetLabel: set.name,
    metadata: { before, after: { name: set.name, description: set.description, active: set.active, isDefault: set.isDefault } },
    req,
  });
  return getSet(principal, id);
}

export async function deleteSet(req: Request, id: string) {
  const principal = req.auth!.principal;
  const set = await loadSet(id);
  assertCanManage(principal, set.interviewType);
  if (set.isDefault) {
    const others = await QuestionSet.countDocuments({ organization: set.organization, _id: { $ne: set._id } });
    if (others > 0) throw new AppError("INVALID_STATE", "Make another set the default before deleting this one.");
  }
  const { deletedCount } = await Question.deleteMany({ questionSet: set._id });
  await set.deleteOne();
  // Historical interviews keep full snapshots of the questions they used.
  await audit({
    action: "QUESTION_SET_DELETED",
    actor: actorFrom(req),
    targetType: "QuestionSet",
    targetId: id,
    targetLabel: set.name,
    metadata: { organization: set.organization, questionsDeleted: deletedCount },
    req,
  });
}

export async function duplicateSet(req: Request, id: string, input: z.infer<typeof duplicateQuestionSetSchema>) {
  const principal = req.auth!.principal;
  const source = await loadSet(id);
  assertCanView(principal, source.interviewType);
  const organization = input.organization ?? source.organization;
  const interviewType = organizationCategory(organization)!;
  assertCanManage(principal, interviewType);

  if (await QuestionSet.exists({ organization, name: input.name }).collation({ locale: "en", strength: 2 })) {
    throw conflict("A question set with that name already exists for this organization.");
  }

  const copy = await QuestionSet.create({
    name: input.name,
    description: source.description,
    interviewType,
    organization,
    isDefault: false,
    active: true,
    createdBy: new Types.ObjectId(principal.id),
    updatedBy: new Types.ObjectId(principal.id),
  });
  const questions = await Question.find({ questionSet: source._id }).sort({ order: 1 }).lean();
  if (questions.length) {
    await Question.insertMany(
      questions.map((q, i) => ({
        questionSet: copy._id,
        interviewType,
        organization,
        questionText: q.questionText,
        normalizedText: q.normalizedText,
        followUpPrompts: q.followUpPrompts,
        expectedAnswer: q.expectedAnswer,
        interviewerNotes: q.interviewerNotes,
        category: q.category,
        required: q.required,
        order: i + 1,
        active: q.active,
        createdBy: new Types.ObjectId(principal.id),
        updatedBy: new Types.ObjectId(principal.id),
      })),
    );
  }
  await audit({
    action: "QUESTION_SET_DUPLICATED",
    actor: actorFrom(req),
    targetType: "QuestionSet",
    targetId: String(copy._id),
    targetLabel: copy.name,
    metadata: { sourceId: id, sourceName: source.name, questionCount: questions.length },
    req,
  });
  return getSet(principal, String(copy._id));
}
