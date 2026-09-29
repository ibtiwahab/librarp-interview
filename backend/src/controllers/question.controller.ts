import type { Request, Response } from "express";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import { principalOf } from "../middleware/auth.js";
import * as questionService from "../services/question.service.js";
import * as setService from "../services/questionSet.service.js";
import { buildImportPreview, mapTableColumns } from "../services/import/import.service.js";
import { AppError } from "../utils/errors.js";
import { created, ok } from "../utils/http.js";
import { idParams, objectId } from "../validators/common.js";
import {
  bulkActionSchema,
  bulkImportSchema,
  checkDuplicatesSchema,
  createQuestionSchema,
  createQuestionSetSchema,
  duplicateQuestionSetSchema,
  listQuestionSetsQuery,
  listQuestionsQuery,
  mapColumnsSchema,
  reorderSchema,
  updateQuestionSchema,
  updateQuestionSetSchema,
} from "../validators/question.validators.js";
import { manageableQuestionTypes } from "../services/authorization.service.js";

/* ───────────────────────────── Question sets ──────────────────────────── */

export async function listSets(req: Request, res: Response) {
  return ok(res, await setService.listSets(principalOf(req), parse(listQuestionSetsQuery, req.query)));
}
export async function getSet(req: Request, res: Response) {
  return ok(res, await setService.getSet(principalOf(req), parse(idParams, req.params).id));
}
export async function createSet(req: Request, res: Response) {
  return created(res, await setService.createSet(req, parse(createQuestionSetSchema, req.body)));
}
export async function updateSet(req: Request, res: Response) {
  return ok(res, await setService.updateSet(req, parse(idParams, req.params).id, parse(updateQuestionSetSchema, req.body)));
}
export async function deleteSet(req: Request, res: Response) {
  await setService.deleteSet(req, parse(idParams, req.params).id);
  return ok(res, { deleted: true });
}
export async function duplicateSet(req: Request, res: Response) {
  return created(res, await setService.duplicateSet(req, parse(idParams, req.params).id, parse(duplicateQuestionSetSchema, req.body)));
}
export async function setCategories(req: Request, res: Response) {
  return ok(res, await questionService.listCategories(principalOf(req), parse(idParams, req.params).id));
}

/* ───────────────────────────── Questions ──────────────────────────────── */

export async function list(req: Request, res: Response) {
  return ok(res, await questionService.listQuestions(principalOf(req), parse(listQuestionsQuery, req.query)));
}
export async function create(req: Request, res: Response) {
  return created(res, await questionService.createQuestion(req, parse(createQuestionSchema, req.body)));
}
export async function update(req: Request, res: Response) {
  return ok(res, await questionService.updateQuestion(req, parse(idParams, req.params).id, parse(updateQuestionSchema, req.body)));
}
export async function remove(req: Request, res: Response) {
  await questionService.deleteQuestion(req, parse(idParams, req.params).id);
  return ok(res, { deleted: true });
}
export async function duplicate(req: Request, res: Response) {
  return created(res, await questionService.duplicateQuestion(req, parse(idParams, req.params).id));
}
export async function reorder(req: Request, res: Response) {
  const { questionSet, orderedIds } = parse(reorderSchema, req.body);
  await questionService.reorderQuestions(req, questionSet, orderedIds);
  return ok(res, { reordered: true });
}
export async function bulkAction(req: Request, res: Response) {
  return ok(res, await questionService.bulkAction(req, parse(bulkActionSchema, req.body)));
}

/* ───────────────────────────── Import ─────────────────────────────────── */

function assertCanImport(req: Request) {
  if (manageableQuestionTypes(principalOf(req)).length === 0) {
    throw new AppError("FORBIDDEN", "You do not have permission to import interview questions.");
  }
}

/**
 * Parses an uploaded document in memory. The file is never written to disk or
 * stored; the buffer is dropped once this handler returns.
 */
export async function importPreview(req: Request, res: Response) {
  assertCanImport(req);
  const file = req.file;
  if (!file) throw new AppError("BAD_REQUEST", "Choose a document to upload.");
  try {
    const preview = await buildImportPreview(file);
    const questionSet = parse(z.object({ questionSet: objectId.optional() }), req.body ?? {}).questionSet;
    const duplicates = questionSet
      ? await questionService.findDuplicates(principalOf(req), questionSet, preview.detectedQuestions.map((q) => q.questionText))
      : [];
    res.setHeader("Cache-Control", "no-store");
    return ok(res, { ...preview, duplicates });
  } finally {
    // Release the in-memory upload immediately.
    (file as { buffer?: Buffer }).buffer = Buffer.alloc(0);
    req.file = undefined;
  }
}

export async function importMapColumns(req: Request, res: Response) {
  assertCanImport(req);
  const { rows, mapping, hasHeader } = parse(mapColumnsSchema, req.body);
  const result = mapTableColumns(rows, mapping, hasHeader);
  return ok(res, { detectedQuestions: result.questions, warnings: result.warnings });
}

export async function checkDuplicates(req: Request, res: Response) {
  const { questionSet, questions } = parse(checkDuplicatesSchema, req.body);
  return ok(res, { duplicates: await questionService.findDuplicates(principalOf(req), questionSet, questions) });
}

export async function bulkImport(req: Request, res: Response) {
  return created(res, await questionService.bulkImport(req, parse(bulkImportSchema, req.body)));
}
