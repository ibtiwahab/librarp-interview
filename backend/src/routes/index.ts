import { Router } from "express";
import { requireAuth, requireAnyPermission, requirePermission } from "../middleware/auth.js";
import { loginIpLimiter, loginLimiter, refreshLimiter, uploadLimiter } from "../middleware/rateLimit.js";
import { documentUpload } from "../middleware/upload.js";
import * as auth from "../controllers/auth.controller.js";
import * as admins from "../controllers/admin.controller.js";
import * as questions from "../controllers/question.controller.js";
import * as interviews from "../controllers/interview.controller.js";
import * as misc from "../controllers/misc.controller.js";

/**
 * Route map. Permission middleware here is the coarse gate; services apply the
 * fine-grained checks (hierarchy, organization category, ownership).
 * There is intentionally NO public registration route.
 */
export function buildRouter(): Router {
  const api = Router();
  const authed = requireAuth();

  api.get("/health", misc.health);

  /* ── Auth ── */
  const authRouter = Router();
  authRouter.post("/login", loginIpLimiter, loginLimiter, auth.login);
  authRouter.post("/refresh", refreshLimiter, auth.requireCsrfHeader, auth.refresh);
  authRouter.post("/logout", auth.requireCsrfHeader, auth.logout);
  authRouter.get("/me", requireAuth({ allowPendingPasswordChange: true }), auth.me);
  authRouter.post("/change-password", requireAuth({ allowPendingPasswordChange: true }), auth.changePassword);
  api.use("/auth", authRouter);

  /* ── Roles ── */
  api.get("/roles", authed, admins.roles);

  /* ── Administrators ── */
  const adminRouter = Router();
  adminRouter.use(authed, requirePermission("admins.view", "You do not have permission to view administrator accounts."));
  adminRouter.get("/", admins.list);
  adminRouter.post("/", requirePermission("admins.create", "You do not have permission to create administrator accounts."), admins.create);
  adminRouter.get("/:id", admins.get);
  adminRouter.patch("/:id", admins.update);
  adminRouter.put("/:id/roles", requirePermission("roles.assign", "You do not have permission to assign roles."), admins.setRoles);
  adminRouter.post("/:id/roles", requirePermission("roles.assign", "You do not have permission to assign roles."), admins.addRole);
  adminRouter.delete("/:id/roles/:role", requirePermission("roles.assign", "You do not have permission to remove roles."), admins.removeRole);
  adminRouter.post("/:id/disable", admins.disable);
  adminRouter.post("/:id/enable", admins.enable);
  adminRouter.post("/:id/reset-password", admins.resetPassword);
  adminRouter.delete("/:id", admins.remove);
  api.use("/admins", adminRouter);

  /* ── Organizations & settings ── */
  api.get("/organizations", authed, misc.organizations);
  api.patch("/organizations/:code", authed, requirePermission("settings.manage"), misc.patchOrganization);
  api.get("/settings", authed, misc.settings);
  api.patch("/settings", authed, requirePermission("settings.manage", "You do not have permission to change settings."), misc.patchSettings);
  api.get("/dashboard", authed, misc.dashboard);

  /* ── Question sets ── */
  const setRouter = Router();
  setRouter.use(authed);
  setRouter.get("/", questions.listSets);
  setRouter.post("/", questions.createSet);
  setRouter.get("/:id", questions.getSet);
  setRouter.get("/:id/categories", questions.setCategories);
  setRouter.patch("/:id", questions.updateSet);
  setRouter.delete("/:id", questions.deleteSet);
  setRouter.post("/:id/duplicate", questions.duplicateSet);
  api.use("/question-sets", setRouter);

  /* ── Questions ── */
  const manageAny = requireAnyPermission(
    ["questions.manage.state", "questions.manage.crime", "questions.manage.admin"],
    "You do not have permission to manage interview questions.",
  );
  const questionRouter = Router();
  questionRouter.use(authed);
  questionRouter.get("/", questions.list);
  questionRouter.post("/", manageAny, questions.create);
  questionRouter.post("/import/preview", manageAny, uploadLimiter, documentUpload, questions.importPreview);
  questionRouter.post("/import/map", manageAny, questions.importMapColumns);
  questionRouter.post("/import/check-duplicates", manageAny, questions.checkDuplicates);
  questionRouter.post("/bulk", manageAny, questions.bulkImport);
  questionRouter.post("/bulk-action", manageAny, questions.bulkAction);
  questionRouter.post("/reorder", manageAny, questions.reorder);
  questionRouter.patch("/:id", manageAny, questions.update);
  questionRouter.delete("/:id", manageAny, questions.remove);
  questionRouter.post("/:id/duplicate", manageAny, questions.duplicate);
  api.use("/questions", questionRouter);

  /* ── Interviews ── */
  const interviewRouter = Router();
  interviewRouter.use(authed);
  interviewRouter.get("/", interviews.list);
  interviewRouter.get("/active", interviews.active);
  interviewRouter.get("/interviewers", interviews.interviewers);
  interviewRouter.post(
    "/",
    requireAnyPermission(
      ["interviews.conduct.state", "interviews.conduct.crime", "interviews.conduct.admin"],
      "You do not have permission to conduct interviews.",
    ),
    interviews.start,
  );
  interviewRouter.get("/:id", interviews.get);
  interviewRouter.patch("/:id", interviews.autosave);
  interviewRouter.post("/:id/complete", interviews.complete);
  interviewRouter.delete("/:id", requirePermission("interviews.delete", "You do not have permission to delete interviews."), interviews.remove);
  api.use("/interviews", interviewRouter);

  /* ── Audit log ── */
  api.get(
    "/audit-logs",
    authed,
    requireAnyPermission(["audit.view.all", "audit.view.management"], "You do not have permission to view the audit log."),
    misc.auditLogs,
  );
  api.get("/audit-logs/meta", authed, requireAnyPermission(["audit.view.all", "audit.view.management"]), misc.auditMeta);

  return api;
}
