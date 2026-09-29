import type { Request } from "express";
import type { z } from "zod";
import { Types } from "mongoose";
import {
  Interview,
  STATUS_TRANSITIONS,
  type IInterview,
  type InterviewQuestion,
  type InterviewStatus,
} from "../models/Interview.js";
import { AdminUser } from "../models/AdminUser.js";
import { QuestionSet } from "../models/QuestionSet.js";
import { Question } from "../models/Question.js";
import { getOrganizationConfig, organizationCategory, type InterviewType } from "../config/organizations.js";
import { AppError, forbidden, invalidState, notFound } from "../utils/errors.js";
import { escapeRegex, paginated } from "../utils/http.js";
import {
  canDeleteInterview,
  canInterviewOrganization,
  canModifyInterview,
  canViewInterview,
  viewableInterviewTypes,
  type Principal,
} from "./authorization.service.js";
import { actorFrom, audit } from "./audit.service.js";
import { getCandidateFieldSettings } from "./settings.service.js";
import { getOrganization } from "./organization.service.js";
import type {
  autosaveSchema,
  completeInterviewSchema,
  listInterviewsQuery,
  startInterviewSchema,
  updateRecordSchema,
} from "../validators/interview.validators.js";

type InterviewLean = IInterview & { _id: Types.ObjectId };
type InterviewDoc = Awaited<ReturnType<typeof loadInterview>>;
type QuestionLean = InterviewQuestion;

function summarize(questions: QuestionLean[]) {
  const counts = { total: questions.length, answered: 0, CORRECT: 0, PARTIAL: 0, INCORRECT: 0, SKIPPED: 0, NOT_SCORED: 0 };
  for (const q of questions) {
    counts[q.result]++;
    if (q.result !== "NOT_SCORED" || q.candidateAnswerNotes?.trim()) counts.answered++;
  }
  return counts;
}

export function serializeInterviewSummary(i: InterviewLean) {
  return {
    id: String(i._id),
    interviewType: i.interviewType,
    organization: i.organization,
    candidate: i.candidate,
    positionAppliedFor: i.positionAppliedFor,
    interviewDate: i.interviewDate,
    recordingLinks: i.recordingLinks ?? [],
    interviewer: { id: String(i.interviewer), ...i.interviewerSnapshot },
    questionSet: { id: i.questionSet ? String(i.questionSet) : null, name: i.questionSetSnapshot?.name ?? "" },
    status: i.status,
    progress: summarize((i.questions ?? []) as QuestionLean[]),
    startedAt: i.startedAt,
    completedAt: i.completedAt ?? null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

export function serializeInterview(i: InterviewLean, principal: Principal) {
  const interviewerId = String(i.interviewer);
  return {
    ...serializeInterviewSummary(i),
    additionalNotes: i.additionalNotes,
    currentIndex: i.currentIndex,
    questions: (i.questions as QuestionLean[]).map((q) => ({
      id: String(q._id),
      questionId: q.questionId ? String(q.questionId) : null,
      order: q.order,
      questionText: q.questionText,
      followUpPrompts: q.followUpPrompts,
      expectedAnswer: q.expectedAnswer,
      guidance: q.guidance,
      category: q.category,
      required: q.required,
      candidateAnswerNotes: q.candidateAnswerNotes,
      interviewerNotes: q.interviewerNotes,
      result: q.result,
      answeredAt: q.answeredAt ?? null,
    })),
    finalComments: i.finalComments,
    strengths: i.strengths,
    concerns: i.concerns,
    decidedBy: i.decidedBy ? { id: String(i.decidedBy), ...(i.decidedBySnapshot ?? { username: "", displayName: "" }) } : null,
    lastSavedAt: i.lastSavedAt ?? null,
    permissions: {
      canEdit: i.status === "IN_PROGRESS" && canModifyInterview(principal, { interviewType: i.interviewType, interviewerId }),
      canDecide:
        STATUS_TRANSITIONS[i.status].length > 0 && canModifyInterview(principal, { interviewType: i.interviewType, interviewerId }),
      // After the decision: fix up links, answers and comments (the decision itself stays).
      canEditRecord:
        i.status !== "IN_PROGRESS" && canModifyInterview(principal, { interviewType: i.interviewType, interviewerId }),
      canDelete: canDeleteInterview(principal),
    },
  };
}

async function loadInterview(id: string) {
  const interview = await Interview.findOne({ _id: id, deletedAt: null });
  if (!interview) throw notFound("Interview not found. It may have been deleted.");
  return interview;
}

function interviewTypeLabel(type: InterviewType): string {
  return type === "ADMIN" ? "Admin" : type === "STATE" ? "State leadership" : "Crime leadership";
}

export async function startInterview(req: Request, input: z.infer<typeof startInterviewSchema>) {
  const principal = req.auth!.principal;
  const org = await getOrganization(input.organization);
  const category = organizationCategory(input.organization)!;

  if (!canInterviewOrganization(principal, input.organization)) {
    throw forbidden(
      category === "ADMIN"
        ? "You do not have permission to conduct Admin interviews."
        : `You do not have permission to conduct ${org.shortName} interviews.`,
    );
  }
  if (!org.active) throw invalidState(`${org.name} is currently inactive. Interviews cannot be started for it.`);

  // Enforce configured required candidate fields.
  const fields = await getCandidateFieldSettings();
  const missing: string[] = [];
  const valueOf: Record<string, unknown> = {
    ...input.candidate,
    positionAppliedFor: input.positionAppliedFor,
    additionalNotes: input.additionalNotes,
  };
  for (const [key, setting] of Object.entries(fields)) {
    const v = valueOf[key];
    if (setting.enabled && setting.required && (v === undefined || v === null || String(v).trim() === "")) missing.push(key);
  }
  if (missing.length) {
    throw new AppError("VALIDATION_ERROR", "Please complete all required candidate fields.", {
      fieldErrors: Object.fromEntries(missing.map((k) => [k, ["This field is required."]])),
    });
  }

  const set = input.questionSet
    ? await QuestionSet.findById(input.questionSet).lean()
    : await QuestionSet.findOne({ organization: input.organization, isDefault: true }).lean();
  if (!set) {
    throw new AppError(
      "INVALID_STATE",
      `No question set is configured for ${org.name}. Ask a question bank manager to create or import one.`,
    );
  }
  if (set.organization !== input.organization) throw new AppError("VALIDATION_ERROR", "That question set belongs to a different organization.");
  if (!set.active) throw invalidState("That question set is inactive.");

  const questions = await Question.find({ questionSet: set._id, active: true }).sort({ order: 1 }).lean();
  if (questions.length === 0) {
    throw invalidState(`The “${set.name}” question set has no active questions. Add or import questions first.`);
  }

  const user = await AdminUser.findById(principal.id).select("username displayName").lean();
  const interview = await Interview.create({
    interviewType: category,
    organization: input.organization,
    candidate: {
      ...input.candidate,
      age: fields.age.enabled ? (input.candidate.age ?? null) : null,
    },
    positionAppliedFor: input.positionAppliedFor || getOrganizationConfig(input.organization)?.defaultPosition || "",
    interviewDate: input.interviewDate ?? new Date(),
    additionalNotes: input.additionalNotes,
    recordingLinks: input.recordingLinks ?? [],
    interviewer: new Types.ObjectId(principal.id),
    interviewerSnapshot: { username: user?.username ?? "", displayName: user?.displayName ?? "" },
    questionSet: set._id,
    questionSetSnapshot: { name: set.name },
    // Snapshot every question exactly as it is right now.
    questions: questions.map((q, i) => ({
      questionId: q._id,
      order: i + 1,
      questionText: q.questionText,
      followUpPrompts: q.followUpPrompts ?? [],
      expectedAnswer: q.expectedAnswer ?? "",
      guidance: q.interviewerNotes ?? "",
      category: q.category ?? "",
      required: q.required,
    })),
    status: "IN_PROGRESS",
    startedAt: new Date(),
  });

  await audit({
    action: "INTERVIEW_STARTED",
    actor: actorFrom(req),
    targetType: "Interview",
    targetId: String(interview._id),
    targetLabel: `${input.candidate.name} — ${org.shortName}`,
    metadata: { organization: input.organization, questionSet: set.name, questionCount: questions.length },
    req,
  });
  return serializeInterview(interview.toObject() as InterviewLean, principal);
}

export async function getInterview(principal: Principal, id: string) {
  const i = await Interview.findOne({ _id: id, deletedAt: null }).lean();
  if (!i) throw notFound("Interview not found. It may have been deleted.");
  if (!canViewInterview(principal, { interviewType: i.interviewType, interviewerId: String(i.interviewer) })) {
    throw forbidden("You do not have permission to view this interview.");
  }
  return serializeInterview(i as InterviewLean, principal);
}

function visibilityFilter(principal: Principal): Record<string, unknown> {
  const types = viewableInterviewTypes(principal);
  if (types === "ALL") return {};
  return { $or: [{ interviewType: { $in: types } }, { interviewer: new Types.ObjectId(principal.id) }] };
}

export async function listInterviews(principal: Principal, q: z.infer<typeof listInterviewsQuery>) {
  const and: Record<string, unknown>[] = [{ deletedAt: null }, visibilityFilter(principal)];
  if (q.mine) and.push({ interviewer: new Types.ObjectId(principal.id) });
  if (q.interviewer) and.push({ interviewer: new Types.ObjectId(q.interviewer) });
  if (q.organization) and.push({ organization: q.organization });
  if (q.interviewType) and.push({ interviewType: q.interviewType });
  if (q.status) and.push({ status: q.status });
  if (q.discordId) and.push({ "candidate.discordId": q.discordId });
  if (q.inGameId) and.push({ "candidate.inGameId": q.inGameId });
  if (q.candidate) and.push({ "candidate.name": new RegExp(escapeRegex(q.candidate), "i") });
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    and.push({
      $or: [
        { "candidate.name": re },
        { "candidate.discordUsername": re },
        { "candidate.discordId": re },
        { "candidate.inGameName": re },
        { "candidate.inGameId": re },
        { "interviewerSnapshot.displayName": re },
        { "interviewerSnapshot.username": re },
        { positionAppliedFor: re },
      ],
    });
  }
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = q.from;
    if (q.to) {
      const end = new Date(q.to);
      // Treat a bare date as inclusive of the whole day.
      if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0) end.setUTCDate(end.getUTCDate() + 1);
      range.$lt = end;
    }
    and.push({ interviewDate: range });
  }
  const filter = { $and: and.filter((c) => Object.keys(c).length > 0) };
  const sortField = q.sort.replace(/^-/, "");
  const sort: Record<string, 1 | -1> = { [sortField]: q.sort.startsWith("-") ? -1 : 1, _id: -1 };

  const [items, total] = await Promise.all([
    Interview.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .select("-questions.expectedAnswer -questions.guidance -questions.followUpPrompts -questions.interviewerNotes")
      .lean(),
    Interview.countDocuments(filter),
  ]);
  return paginated(items.map((i) => serializeInterviewSummary(i as InterviewLean)), total, q.page, q.limit);
}

export async function listInterviewers(principal: Principal) {
  const rows = await Interview.aggregate<{ _id: Types.ObjectId; displayName: string; username: string }>([
    { $match: { deletedAt: null, ...visibilityFilter(principal) } },
    { $group: { _id: "$interviewer", displayName: { $last: "$interviewerSnapshot.displayName" }, username: { $last: "$interviewerSnapshot.username" } } },
    { $sort: { displayName: 1 } },
    { $limit: 500 },
  ]);
  return rows.map((r) => ({ id: String(r._id), displayName: r.displayName, username: r.username }));
}

function assertModifiable(principal: Principal, i: { interviewType: InterviewType; interviewer: Types.ObjectId }) {
  if (!canModifyInterview(principal, { interviewType: i.interviewType, interviewerId: String(i.interviewer) })) {
    throw forbidden("Only the assigned interviewer (or a senior administrator) can update this interview.");
  }
}

type AnswerPatch = NonNullable<z.infer<typeof autosaveSchema>["answers"]>[number];

/** Applies answer edits; returns how many questions actually changed. */
function applyAnswers(interview: InterviewDoc, answers: AnswerPatch[]): number {
  let changed = 0;
  for (const a of answers) {
    const q = interview.questions.id(a.id);
    if (!q) throw new AppError("VALIDATION_ERROR", "A saved answer refers to a question that is not part of this interview.");
    let touched = false;
    if (a.candidateAnswerNotes !== undefined && a.candidateAnswerNotes !== q.candidateAnswerNotes) {
      q.candidateAnswerNotes = a.candidateAnswerNotes;
      touched = true;
    }
    if (a.interviewerNotes !== undefined && a.interviewerNotes !== q.interviewerNotes) {
      q.interviewerNotes = a.interviewerNotes;
      touched = true;
    }
    if (a.result !== undefined && a.result !== q.result) {
      q.result = a.result;
      q.answeredAt = a.result === "NOT_SCORED" ? null : new Date();
      touched = true;
    }
    if (touched) changed++;
  }
  return changed;
}

export async function autosave(req: Request, id: string, input: z.infer<typeof autosaveSchema>) {
  const principal = req.auth!.principal;
  const interview = await loadInterview(id);
  assertModifiable(principal, interview);

  const decisionOnly =
    input.answers === undefined &&
    input.currentIndex === undefined &&
    input.candidate === undefined &&
    input.positionAppliedFor === undefined &&
    input.additionalNotes === undefined;

  if (interview.status !== "IN_PROGRESS") {
    // Draft final comments may still be saved while a decision is pending (ON_HOLD).
    if (!(decisionOnly && interview.status === "ON_HOLD")) {
      throw invalidState(
        interview.status === "CANCELLED" ? "This interview was cancelled and can no longer be edited." : "This interview was already completed.",
      );
    }
  }

  if (input.currentIndex !== undefined) {
    interview.currentIndex = Math.min(input.currentIndex, Math.max(0, interview.questions.length - 1));
  }
  if (input.answers) applyAnswers(interview, input.answers);
  if (input.recordingLinks !== undefined) interview.recordingLinks = input.recordingLinks;
  if (input.candidate) {
    for (const [k, v] of Object.entries(input.candidate)) {
      if (v !== undefined) interview.set(`candidate.${k}`, v);
    }
  }
  if (input.positionAppliedFor !== undefined) interview.positionAppliedFor = input.positionAppliedFor;
  if (input.additionalNotes !== undefined) interview.additionalNotes = input.additionalNotes;
  if (input.finalComments !== undefined) interview.finalComments = input.finalComments;
  if (input.strengths !== undefined) interview.strengths = input.strengths;
  if (input.concerns !== undefined) interview.concerns = input.concerns;
  interview.lastSavedAt = new Date();
  await interview.save();
  return { lastSavedAt: interview.lastSavedAt, currentIndex: interview.currentIndex, status: interview.status };
}

export async function completeInterview(req: Request, id: string, input: z.infer<typeof completeInterviewSchema>) {
  const principal = req.auth!.principal;
  const interview = await loadInterview(id);
  assertModifiable(principal, interview);

  const from = interview.status as InterviewStatus;
  if (!STATUS_TRANSITIONS[from].includes(input.status)) {
    if (from === "CANCELLED") throw invalidState("This interview was cancelled.");
    if (from === "PASSED" || from === "FAILED") throw invalidState("This interview was already completed.");
    throw invalidState(`An interview that is ${from.replace("_", " ").toLowerCase()} cannot be marked ${input.status.replace("_", " ").toLowerCase()}.`);
  }

  const user = await AdminUser.findById(principal.id).select("username displayName").lean();
  interview.status = input.status;
  interview.finalComments = input.finalComments;
  interview.strengths = input.strengths;
  interview.concerns = input.concerns;
  if (input.recordingLinks !== undefined) interview.recordingLinks = input.recordingLinks;
  interview.decidedBy = new Types.ObjectId(principal.id);
  interview.decidedBySnapshot = { username: user?.username ?? "", displayName: user?.displayName ?? "" };
  interview.completedAt = new Date();
  interview.lastSavedAt = new Date();
  await interview.save();

  await audit({
    action: "INTERVIEW_COMPLETED",
    actor: actorFrom(req),
    targetType: "Interview",
    targetId: id,
    targetLabel: `${interview.candidate.name} — ${interview.organization}`,
    metadata: { from, to: input.status, organization: interview.organization, type: interviewTypeLabel(interview.interviewType) },
    req,
  });
  return serializeInterview(interview.toObject() as InterviewLean, principal);
}

/**
 * Edits after the decision was recorded: recording links, answers and the
 * written assessment. The decision (status) itself cannot be changed here.
 */
export async function updateRecord(req: Request, id: string, input: z.infer<typeof updateRecordSchema>) {
  const principal = req.auth!.principal;
  const interview = await loadInterview(id);
  if (!canModifyInterview(principal, { interviewType: interview.interviewType, interviewerId: String(interview.interviewer) })) {
    throw forbidden("Only the interviewer who conducted this interview (or a senior administrator) can edit it.");
  }
  if (interview.status === "IN_PROGRESS") {
    throw invalidState("This interview is still in progress. Continue it from the live interview screen.");
  }

  const changed: string[] = [];
  if (input.recordingLinks !== undefined && JSON.stringify(input.recordingLinks) !== JSON.stringify(interview.recordingLinks ?? [])) {
    interview.recordingLinks = input.recordingLinks;
    changed.push("recordingLinks");
  }
  const answersChanged = input.answers ? applyAnswers(interview, input.answers) : 0;
  if (answersChanged) changed.push("answers");
  for (const key of ["finalComments", "strengths", "concerns"] as const) {
    const v = input[key];
    if (v !== undefined && v !== interview[key]) {
      interview[key] = v;
      changed.push(key);
    }
  }

  if (changed.length) {
    interview.lastSavedAt = new Date();
    await interview.save();
    await audit({
      action: "INTERVIEW_UPDATED",
      actor: actorFrom(req),
      targetType: "Interview",
      targetId: id,
      targetLabel: `${interview.candidate.name} — ${interview.organization}`,
      metadata: { changed, answersChanged, recordingLinks: interview.recordingLinks, status: interview.status },
      req,
    });
  }
  return serializeInterview(interview.toObject() as InterviewLean, principal);
}

export async function deleteInterview(req: Request, id: string) {
  const principal = req.auth!.principal;
  if (!canDeleteInterview(principal)) throw forbidden("You do not have permission to delete interviews.");
  const interview = await loadInterview(id);
  interview.deletedAt = new Date();
  interview.deletedBy = new Types.ObjectId(principal.id);
  await interview.save();
  await audit({
    action: "INTERVIEW_DELETED",
    actor: actorFrom(req),
    targetType: "Interview",
    targetId: id,
    targetLabel: `${interview.candidate.name} — ${interview.organization}`,
    metadata: {
      status: interview.status,
      organization: interview.organization,
      interviewer: interview.interviewerSnapshot?.displayName,
      interviewDate: interview.interviewDate,
    },
    req,
  });
}

export async function myActiveInterviews(principal: Principal) {
  const items = await Interview.find({ deletedAt: null, interviewer: new Types.ObjectId(principal.id), status: "IN_PROGRESS" })
    .sort({ updatedAt: -1 })
    .limit(10)
    .select("-questions.expectedAnswer -questions.guidance -questions.followUpPrompts -questions.interviewerNotes")
    .lean();
  return items.map((i) => serializeInterviewSummary(i as InterviewLean));
}

export { visibilityFilter as interviewVisibilityFilter };
