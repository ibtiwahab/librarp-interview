import type { Request } from "express";
import type { z } from "zod";
import { Types } from "mongoose";
import { Question, type IQuestion } from "../models/Question.js";
import { QuestionSet } from "../models/QuestionSet.js";
import { AppError, notFound } from "../utils/errors.js";
import { escapeRegex, paginated } from "../utils/http.js";
import { normalizeQuestionText, similarity } from "../utils/text.js";
import { conductableInterviewTypes, manageableQuestionTypes, type Principal } from "./authorization.service.js";
import { actorFrom, audit } from "./audit.service.js";
import { assertCanManage, assertCanView, loadSet } from "./questionSet.service.js";
import type {
  bulkActionSchema,
  bulkImportSchema,
  createQuestionSchema,
  listQuestionsQuery,
  updateQuestionSchema,
} from "../validators/question.validators.js";
import type { InterviewType } from "../config/organizations.js";

type QuestionLean = IQuestion & { _id: Types.ObjectId };

const SIMILARITY_THRESHOLD = 0.9;

export function serializeQuestion(q: QuestionLean) {
  return {
    id: String(q._id),
    questionSet: String(q.questionSet),
    interviewType: q.interviewType,
    organization: q.organization,
    questionText: q.questionText,
    followUpPrompts: q.followUpPrompts ?? [],
    expectedAnswer: q.expectedAnswer ?? "",
    interviewerNotes: q.interviewerNotes ?? "",
    category: q.category ?? "",
    required: q.required,
    order: q.order,
    active: q.active,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

async function nextOrder(questionSet: Types.ObjectId): Promise<number> {
  const last = await Question.findOne({ questionSet }).sort({ order: -1 }).select("order").lean();
  return (last?.order ?? 0) + 1;
}

async function loadQuestion(id: string) {
  const q = await Question.findById(id);
  if (!q) throw notFound("Question not found.");
  return q;
}

export async function listQuestions(principal: Principal, q: z.infer<typeof listQuestionsQuery>) {
  const filter: Record<string, unknown> = {};
  if (q.questionSet) {
    const set = await QuestionSet.findById(q.questionSet).select("interviewType").lean();
    if (!set) throw notFound("Question set not found.");
    assertCanView(principal, set.interviewType);
    filter.questionSet = new Types.ObjectId(q.questionSet);
  } else {
    const visible = new Set<InterviewType>([...conductableInterviewTypes(principal), ...manageableQuestionTypes(principal)]);
    if (q.interviewType) {
      assertCanView(principal, q.interviewType);
      filter.interviewType = q.interviewType;
    } else filter.interviewType = { $in: [...visible] };
  }
  if (q.organization) filter.organization = q.organization;
  if (q.category) filter.category = q.category;
  if (q.active !== undefined) filter.active = q.active;
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ questionText: re }, { followUpPrompts: re }, { expectedAnswer: re }, { category: re }];
  }

  const [items, total] = await Promise.all([
    Question.find(filter)
      .sort({ questionSet: 1, order: 1, _id: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Question.countDocuments(filter),
  ]);
  return paginated(items.map(serializeQuestion), total, q.page, q.limit);
}

export async function listCategories(principal: Principal, questionSet: string) {
  const set = await loadSet(questionSet);
  assertCanView(principal, set.interviewType);
  const cats = await Question.distinct("category", { questionSet: set._id });
  return cats.filter((c): c is string => typeof c === "string" && c.trim() !== "").sort((a, b) => a.localeCompare(b));
}

export async function createQuestion(req: Request, input: z.infer<typeof createQuestionSchema>) {
  const principal = req.auth!.principal;
  const set = await loadSet(input.questionSet);
  assertCanManage(principal, set.interviewType);
  const q = await Question.create({
    ...input,
    questionSet: set._id,
    interviewType: set.interviewType,
    organization: set.organization,
    normalizedText: normalizeQuestionText(input.questionText),
    order: await nextOrder(set._id),
    createdBy: new Types.ObjectId(principal.id),
    updatedBy: new Types.ObjectId(principal.id),
  });
  await audit({
    action: "QUESTION_CREATED",
    actor: actorFrom(req),
    targetType: "Question",
    targetId: String(q._id),
    targetLabel: q.questionText.slice(0, 120),
    metadata: { questionSet: String(set._id), setName: set.name },
    req,
  });
  return serializeQuestion(q.toObject());
}

export async function updateQuestion(req: Request, id: string, input: z.infer<typeof updateQuestionSchema>) {
  const principal = req.auth!.principal;
  const q = await loadQuestion(id);
  assertCanManage(principal, q.interviewType);
  const before = serializeQuestion(q.toObject());
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) q.set(k, v);
  }
  if (input.questionText !== undefined) q.normalizedText = normalizeQuestionText(input.questionText);
  q.updatedBy = new Types.ObjectId(principal.id);
  await q.save();
  const after = serializeQuestion(q.toObject());

  const changed = (Object.keys(input) as Array<keyof typeof before>).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  if (changed.length) {
    await audit({
      action: "QUESTION_UPDATED",
      actor: actorFrom(req),
      targetType: "Question",
      targetId: id,
      targetLabel: after.questionText.slice(0, 120),
      metadata: { changed, before: Object.fromEntries(changed.map((k) => [k, before[k]])) },
      req,
    });
  }
  return after;
}

export async function deleteQuestion(req: Request, id: string) {
  const principal = req.auth!.principal;
  const q = await loadQuestion(id);
  assertCanManage(principal, q.interviewType);
  await q.deleteOne();
  await audit({
    action: "QUESTION_DELETED",
    actor: actorFrom(req),
    targetType: "Question",
    targetId: id,
    targetLabel: q.questionText.slice(0, 120),
    metadata: { questionSet: String(q.questionSet), questionText: q.questionText },
    req,
  });
}

export async function duplicateQuestion(req: Request, id: string) {
  const principal = req.auth!.principal;
  const q = await loadQuestion(id);
  assertCanManage(principal, q.interviewType);
  // Insert directly after the source question.
  await Question.updateMany({ questionSet: q.questionSet, order: { $gt: q.order } }, { $inc: { order: 1 } });
  const copy = await Question.create({
    questionSet: q.questionSet,
    interviewType: q.interviewType,
    organization: q.organization,
    questionText: q.questionText,
    normalizedText: q.normalizedText,
    followUpPrompts: q.followUpPrompts,
    expectedAnswer: q.expectedAnswer,
    interviewerNotes: q.interviewerNotes,
    category: q.category,
    required: q.required,
    active: q.active,
    order: q.order + 1,
    createdBy: new Types.ObjectId(principal.id),
    updatedBy: new Types.ObjectId(principal.id),
  });
  await audit({
    action: "QUESTION_CREATED",
    actor: actorFrom(req),
    targetType: "Question",
    targetId: String(copy._id),
    targetLabel: copy.questionText.slice(0, 120),
    metadata: { duplicatedFrom: id },
    req,
  });
  return serializeQuestion(copy.toObject());
}

export async function reorderQuestions(req: Request, questionSet: string, orderedIds: string[]) {
  const principal = req.auth!.principal;
  const set = await loadSet(questionSet);
  assertCanManage(principal, set.interviewType);

  const existing = await Question.find({ questionSet: set._id }).select("_id order").sort({ order: 1 }).lean();
  const existingIds = new Set(existing.map((e) => String(e._id)));
  const unique = [...new Set(orderedIds)];
  if (unique.some((id) => !existingIds.has(id))) {
    throw new AppError("VALIDATION_ERROR", "Some questions do not belong to this question set. Refresh and try again.");
  }
  // Questions not mentioned (e.g. filtered out in the UI) keep their relative order at the end.
  const rest = existing.map((e) => String(e._id)).filter((id) => !unique.includes(id));
  const finalOrder = [...unique, ...rest];

  await Question.bulkWrite(
    finalOrder.map((id, i) => ({ updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $set: { order: i + 1 } } } })),
  );
  await audit({
    action: "QUESTIONS_REORDERED",
    actor: actorFrom(req),
    targetType: "QuestionSet",
    targetId: questionSet,
    targetLabel: set.name,
    metadata: { count: finalOrder.length },
    req,
  });
}

export async function bulkAction(req: Request, input: z.infer<typeof bulkActionSchema>) {
  const principal = req.auth!.principal;
  const ids = [...new Set(input.ids)].map((id) => new Types.ObjectId(id));
  const questions = await Question.find({ _id: { $in: ids } }).sort({ questionSet: 1, order: 1 });
  if (questions.length !== ids.length) throw notFound("Some selected questions no longer exist. Refresh and try again.");
  for (const type of new Set(questions.map((q) => q.interviewType))) assertCanManage(principal, type);

  const userId = new Types.ObjectId(principal.id);
  let affected = 0;
  let targetName: string | undefined;

  switch (input.action) {
    case "activate":
    case "deactivate":
      affected = (await Question.updateMany({ _id: { $in: ids } }, { $set: { active: input.action === "activate", updatedBy: userId } }))
        .modifiedCount;
      break;
    case "setRequired":
      affected = (await Question.updateMany({ _id: { $in: ids } }, { $set: { required: input.required, updatedBy: userId } })).modifiedCount;
      break;
    case "setCategory":
      affected = (await Question.updateMany({ _id: { $in: ids } }, { $set: { category: input.category, updatedBy: userId } })).modifiedCount;
      break;
    case "delete":
      affected = (await Question.deleteMany({ _id: { $in: ids } })).deletedCount;
      break;
    case "move":
    case "copy": {
      const target = await loadSet(input.targetQuestionSet);
      assertCanManage(principal, target.interviewType);
      targetName = target.name;
      let order = await nextOrder(target._id);
      if (input.action === "move") {
        if (questions.every((q) => String(q.questionSet) === String(target._id))) {
          throw new AppError("INVALID_STATE", "The selected questions are already in that question set.");
        }
        await Question.bulkWrite(
          questions.map((q) => ({
            updateOne: {
              filter: { _id: q._id },
              update: {
                $set: {
                  questionSet: target._id,
                  interviewType: target.interviewType,
                  organization: target.organization,
                  order: order++,
                  updatedBy: userId,
                },
              },
            },
          })),
        );
      } else {
        await Question.insertMany(
          questions.map((q) => ({
            questionSet: target._id,
            interviewType: target.interviewType,
            organization: target.organization,
            questionText: q.questionText,
            normalizedText: q.normalizedText,
            followUpPrompts: q.followUpPrompts,
            expectedAnswer: q.expectedAnswer,
            interviewerNotes: q.interviewerNotes,
            category: q.category,
            required: q.required,
            active: q.active,
            order: order++,
            createdBy: userId,
            updatedBy: userId,
          })),
        );
      }
      affected = questions.length;
      break;
    }
  }

  await audit({
    action: input.action === "delete" ? "QUESTION_DELETED" : "QUESTIONS_BULK_UPDATED",
    actor: actorFrom(req),
    targetType: "Question",
    metadata: {
      bulkAction: input.action,
      count: ids.length,
      affected,
      ...(targetName ? { targetSet: targetName } : {}),
      ...(input.action === "delete" ? { questions: questions.map((q) => q.questionText.slice(0, 120)) } : {}),
    },
    req,
  });
  return { affected };
}

/* ───────────────────────────── Import / duplicates ────────────────────── */

export interface DuplicateMatch {
  index: number;
  kind: "exact" | "similar";
  existingId: string;
  existingText: string;
  similarity: number;
}

/** Compares candidate question texts to the questions already in a set. */
export async function findDuplicates(principal: Principal, questionSet: string, texts: string[]): Promise<DuplicateMatch[]> {
  const set = await loadSet(questionSet);
  assertCanView(principal, set.interviewType);
  const existing = await Question.find({ questionSet: set._id }).select("_id questionText normalizedText").lean();
  const byNormalized = new Map(existing.map((e) => [e.normalizedText, e]));
  const matches: DuplicateMatch[] = [];

  texts.forEach((text, index) => {
    const norm = normalizeQuestionText(text);
    if (!norm) return;
    const exact = byNormalized.get(norm);
    if (exact) {
      matches.push({ index, kind: "exact", existingId: String(exact._id), existingText: exact.questionText, similarity: 1 });
      return;
    }
    let best: { e: (typeof existing)[number]; s: number } | null = null;
    for (const e of existing) {
      // Cheap length pre-filter before computing similarity.
      if (Math.abs(e.normalizedText.length - norm.length) > norm.length * 0.25) continue;
      const s = similarity(norm, e.normalizedText);
      if (s >= SIMILARITY_THRESHOLD && (!best || s > best.s)) best = { e, s };
    }
    if (best) {
      matches.push({
        index,
        kind: "similar",
        existingId: String(best.e._id),
        existingText: best.e.questionText,
        similarity: Math.round(best.s * 100) / 100,
      });
    }
  });
  return matches;
}

export async function bulkImport(req: Request, input: z.infer<typeof bulkImportSchema>) {
  const principal = req.auth!.principal;
  const set = await loadSet(input.questionSet);
  assertCanManage(principal, set.interviewType);

  // Re-check duplicates server-side: never trust the client's preview state.
  const matches = await findDuplicates(principal, input.questionSet, input.questions.map((q) => q.questionText));
  const dupIndex = new Map(matches.map((m) => [m.index, m]));
  const seenInBatch = new Set<string>();

  const toInsert: typeof input.questions = [];
  const skipped: Array<{ questionText: string; reason: string }> = [];
  input.questions.forEach((q, i) => {
    const norm = normalizeQuestionText(q.questionText);
    const dup = dupIndex.get(i);
    const allow = q.allowDuplicate ?? input.duplicateStrategy === "import";
    if (dup && !allow) {
      skipped.push({ questionText: q.questionText, reason: dup.kind === "exact" ? "Already in this question set" : "Very similar question exists" });
      return;
    }
    if (seenInBatch.has(norm) && !allow) {
      skipped.push({ questionText: q.questionText, reason: "Duplicated within this import" });
      return;
    }
    seenInBatch.add(norm);
    toInsert.push(q);
  });

  let order = await nextOrder(set._id);
  const userId = new Types.ObjectId(principal.id);
  if (toInsert.length) {
    await Question.insertMany(
      toInsert.map((q) => ({
        questionSet: set._id,
        interviewType: set.interviewType,
        organization: set.organization,
        questionText: q.questionText,
        normalizedText: normalizeQuestionText(q.questionText),
        followUpPrompts: q.followUpPrompts,
        expectedAnswer: q.expectedAnswer,
        interviewerNotes: q.interviewerNotes,
        category: q.category,
        required: q.required,
        active: q.active,
        order: order++,
        createdBy: userId,
        updatedBy: userId,
      })),
    );
  }

  await audit({
    action: "QUESTIONS_IMPORTED",
    actor: actorFrom(req),
    targetType: "QuestionSet",
    targetId: String(set._id),
    targetLabel: set.name,
    metadata: {
      fileName: input.fileName ?? null,
      organization: set.organization,
      submitted: input.questions.length,
      imported: toInsert.length,
      skipped: skipped.length,
    },
    req,
  });

  return { imported: toInsert.length, skipped: skipped.length, skippedQuestions: skipped.slice(0, 200) };
}
