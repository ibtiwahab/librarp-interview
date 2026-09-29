import type { Request, Response } from "express";
import { parse } from "../middleware/validate.js";
import { principalOf } from "../middleware/auth.js";
import * as adminService from "../services/admin.service.js";
import { created, ok } from "../utils/http.js";
import { idParams, roleSchema } from "../validators/common.js";
import {
  addRoleSchema,
  createAdminSchema,
  listAdminsQuery,
  resetPasswordSchema,
  setRolesSchema,
  updateAdminSchema,
} from "../validators/admin.validators.js";

export async function list(req: Request, res: Response) {
  return ok(res, await adminService.listAdmins(principalOf(req), parse(listAdminsQuery, req.query)));
}

export async function get(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await adminService.getAdmin(principalOf(req), id));
}

export async function create(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  return created(res, await adminService.createAdmin(req, parse(createAdminSchema, req.body)));
}

export async function update(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await adminService.updateAdmin(req, id, parse(updateAdminSchema, req.body)));
}

export async function setRoles(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await adminService.setRoles(req, id, parse(setRolesSchema, req.body).roles));
}

export async function addRole(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await adminService.addRole(req, id, parse(addRoleSchema, req.body).role));
}

export async function removeRole(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const role = parse(roleSchema, req.params.role);
  return ok(res, await adminService.removeRole(req, id, role));
}

export async function disable(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await adminService.setActive(req, id, false));
}

export async function enable(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await adminService.setActive(req, id, true));
}

export async function resetPassword(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  res.setHeader("Cache-Control", "no-store");
  return ok(res, await adminService.resetPassword(req, id, parse(resetPasswordSchema, req.body ?? {}).password));
}

export async function remove(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  await adminService.deleteAdmin(req, id);
  return ok(res, { deleted: true });
}

export async function roles(req: Request, res: Response) {
  return ok(res, adminService.roleCatalogue(principalOf(req)));
}
