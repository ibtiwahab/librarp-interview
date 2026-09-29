import type { Request, Response } from "express";
import { parse } from "../middleware/validate.js";
import { principalOf } from "../middleware/auth.js";
import * as interviewService from "../services/interview.service.js";
import { created, ok } from "../utils/http.js";
import { idParams } from "../validators/common.js";
import {
  autosaveSchema,
  completeInterviewSchema,
  listInterviewsQuery,
  startInterviewSchema,
  updateRecordSchema,
} from "../validators/interview.validators.js";

export async function list(req: Request, res: Response) {
  return ok(res, await interviewService.listInterviews(principalOf(req), parse(listInterviewsQuery, req.query)));
}
export async function active(req: Request, res: Response) {
  return ok(res, await interviewService.myActiveInterviews(principalOf(req)));
}
export async function interviewers(req: Request, res: Response) {
  return ok(res, await interviewService.listInterviewers(principalOf(req)));
}
export async function get(req: Request, res: Response) {
  return ok(res, await interviewService.getInterview(principalOf(req), parse(idParams, req.params).id));
}
export async function start(req: Request, res: Response) {
  return created(res, await interviewService.startInterview(req, parse(startInterviewSchema, req.body)));
}
export async function autosave(req: Request, res: Response) {
  return ok(res, await interviewService.autosave(req, parse(idParams, req.params).id, parse(autosaveSchema, req.body)));
}
export async function complete(req: Request, res: Response) {
  return ok(res, await interviewService.completeInterview(req, parse(idParams, req.params).id, parse(completeInterviewSchema, req.body)));
}
export async function updateRecord(req: Request, res: Response) {
  return ok(res, await interviewService.updateRecord(req, parse(idParams, req.params).id, parse(updateRecordSchema, req.body)));
}
export async function remove(req: Request, res: Response) {
  await interviewService.deleteInterview(req, parse(idParams, req.params).id);
  return ok(res, { deleted: true });
}
