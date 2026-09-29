import { ROLE_DEFINITIONS, isRole, type Permission, type Role, ROLES } from "../config/roles.js";
import { organizationCategory, type InterviewType } from "../config/organizations.js";

/**
 * Pure authorization engine. No database access, no Express — just rules
 * derived from config/roles.ts. Every permission decision in the API goes
 * through these functions so the logic lives in exactly one place.
 */

export interface Principal {
  id: string;
  roles: readonly string[];
}

function validRoles(roles: readonly string[]): Role[] {
  return roles.filter(isRole);
}

export function hasRole(principal: Principal, role: Role): boolean {
  return principal.roles.includes(role);
}

export function hasAnyRole(principal: Principal, roles: readonly Role[]): boolean {
  return roles.some((r) => principal.roles.includes(r));
}

export function authorityLevel(roles: readonly string[]): number {
  return validRoles(roles).reduce((max, r) => Math.max(max, ROLE_DEFINITIONS[r].level), 0);
}

export function effectivePermissions(roles: readonly string[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of validRoles(roles)) for (const p of ROLE_DEFINITIONS[r].permissions) set.add(p);
  return set;
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return effectivePermissions(principal.roles).has(permission);
}

export function hasAnyPermission(principal: Principal, permissions: readonly Permission[]): boolean {
  const eff = effectivePermissions(principal.roles);
  return permissions.some((p) => eff.has(p));
}

export function assignableRoles(principal: Principal): Role[] {
  if (!hasPermission(principal, "roles.assign")) return [];
  const set = new Set<Role>();
  for (const r of validRoles(principal.roles)) for (const a of ROLE_DEFINITIONS[r].assignableRoles) set.add(a);
  // Executive Director can never be granted through the application.
  set.delete("EXECUTIVE_DIRECTOR");
  return ROLES.filter((r) => set.has(r));
}

export function manageableRoles(principal: Principal): Set<Role> {
  const set = new Set<Role>();
  for (const r of validRoles(principal.roles)) for (const m of ROLE_DEFINITIONS[r].manageableRoles) set.add(m);
  set.delete("EXECUTIVE_DIRECTOR");
  return set;
}

/* ─────────────────────────── Interview permissions ─────────────────────────── */

const CONDUCT_PERMISSION: Record<InterviewType, Permission> = {
  STATE: "interviews.conduct.state",
  CRIME: "interviews.conduct.crime",
  ADMIN: "interviews.conduct.admin",
};

const MANAGE_QUESTIONS_PERMISSION: Record<InterviewType, Permission> = {
  STATE: "questions.manage.state",
  CRIME: "questions.manage.crime",
  ADMIN: "questions.manage.admin",
};

export function canConductInterviewType(principal: Principal, type: InterviewType): boolean {
  return hasPermission(principal, CONDUCT_PERMISSION[type]);
}

export function canInterviewOrganization(principal: Principal, organizationCode: string): boolean {
  const category = organizationCategory(organizationCode);
  if (!category) return false;
  return canConductInterviewType(principal, category);
}

export function conductableInterviewTypes(principal: Principal): InterviewType[] {
  return (Object.keys(CONDUCT_PERMISSION) as InterviewType[]).filter((t) => canConductInterviewType(principal, t));
}

/** Interview types whose records this principal may read. */
export function viewableInterviewTypes(principal: Principal): InterviewType[] | "ALL" {
  if (hasPermission(principal, "interviews.view.all")) return "ALL";
  return conductableInterviewTypes(principal);
}

export function canViewInterview(
  principal: Principal,
  interview: { interviewType: InterviewType; interviewerId: string },
): boolean {
  if (interview.interviewerId === principal.id) return true;
  const types = viewableInterviewTypes(principal);
  return types === "ALL" || types.includes(interview.interviewType);
}

/** Update an in-progress interview or record its decision. */
export function canModifyInterview(
  principal: Principal,
  interview: { interviewType: InterviewType; interviewerId: string },
): boolean {
  if (!canConductInterviewType(principal, interview.interviewType)) return false;
  if (interview.interviewerId === principal.id) return true;
  return hasPermission(principal, "interviews.manage.all");
}

export function canDeleteInterview(principal: Principal): boolean {
  return hasPermission(principal, "interviews.delete");
}

/* ─────────────────────────── Question bank permissions ─────────────────────── */

export function canManageQuestions(principal: Principal, type: InterviewType): boolean {
  return hasPermission(principal, MANAGE_QUESTIONS_PERMISSION[type]);
}

export function manageableQuestionTypes(principal: Principal): InterviewType[] {
  return (Object.keys(MANAGE_QUESTIONS_PERMISSION) as InterviewType[]).filter((t) => canManageQuestions(principal, t));
}

/** Reading the bank: anyone who can conduct or manage that interview type. */
export function canViewQuestions(principal: Principal, type: InterviewType): boolean {
  return canManageQuestions(principal, type) || canConductInterviewType(principal, type);
}

/* ─────────────────────────── Account management ────────────────────────────── */

export type ManageAction = "update" | "disable" | "delete" | "password.reset";

const MANAGE_ACTION_PERMISSION: Record<ManageAction, Permission> = {
  update: "admins.update",
  disable: "admins.disable",
  delete: "admins.delete",
  "password.reset": "admins.password.reset",
};

export interface Decision {
  allowed: boolean;
  reason?: string;
}

const allow: Decision = { allowed: true };
const deny = (reason: string): Decision => ({ allowed: false, reason });

/**
 * Whether `actor` outranks `target` enough to perform a destructive/editing
 * action on the account (edit, disable, delete, reset password).
 */
export function canManageUser(actor: Principal, target: Principal, action: ManageAction): Decision {
  if (actor.id === target.id) return deny("You cannot perform this action on your own account.");
  if (!hasPermission(actor, MANAGE_ACTION_PERMISSION[action])) {
    return deny("You do not have permission to perform this action on administrator accounts.");
  }
  if (hasRole(target, "EXECUTIVE_DIRECTOR")) return deny("Executive Director accounts cannot be modified.");
  if (authorityLevel(actor.roles) <= authorityLevel(target.roles)) {
    return deny("You can only manage administrators below your authority level.");
  }
  const manageable = manageableRoles(actor);
  const outside = validRoles(target.roles).filter((r) => !manageable.has(r));
  if (outside.length > 0) {
    return deny(`This administrator holds roles outside your management scope (${outside.map(roleLabel).join(", ")}).`);
  }
  return allow;
}

/** Whether `actor` may add or remove `role` on `target`. */
export function canAssignRole(actor: Principal, target: Principal, role: Role): Decision {
  if (role === "EXECUTIVE_DIRECTOR") return deny("The Executive Director role cannot be assigned through the application.");
  if (actor.id === target.id) return deny("You cannot change your own roles.");
  if (!hasPermission(actor, "roles.assign")) return deny("You do not have permission to assign roles.");
  if (hasRole(target, "EXECUTIVE_DIRECTOR")) return deny("Executive Director accounts cannot be modified.");
  if (!assignableRoles(actor).includes(role)) {
    return deny(`You cannot assign or remove the ${roleLabel(role)} role. It is outside your permission level.`);
  }
  if (ROLE_DEFINITIONS[role].level >= authorityLevel(actor.roles)) {
    return deny("You cannot assign a role equal to or higher than your own authority level.");
  }
  if (authorityLevel(actor.roles) <= authorityLevel(target.roles)) {
    return deny("You can only change roles of administrators below your authority level.");
  }
  return allow;
}

/**
 * Validates a full role-set change (diff between current and requested).
 * Returns the first denial, or allow.
 */
export function canChangeRoles(actor: Principal, target: Principal, nextRoles: readonly Role[]): Decision {
  const current = new Set(validRoles(target.roles));
  const next = new Set(nextRoles);
  const added = [...next].filter((r) => !current.has(r));
  const removed = [...current].filter((r) => !next.has(r));
  if (added.length === 0 && removed.length === 0) return deny("No role changes were requested.");
  for (const role of [...added, ...removed]) {
    const d = canAssignRole(actor, target, role);
    if (!d.allowed) return d;
  }
  return allow;
}

/** Roles a newly created account may start with when created by `actor`. */
export function canCreateAccountWithRoles(actor: Principal, roles: readonly Role[]): Decision {
  if (!hasPermission(actor, "admins.create")) return deny("You do not have permission to create administrator accounts.");
  if (roles.length === 0) return deny("Choose at least one role for the new account.");
  const assignable = new Set(assignableRoles(actor));
  for (const role of roles) {
    if (!assignable.has(role)) return deny(`You cannot create an account with the ${roleLabel(role)} role.`);
  }
  return allow;
}

/* ─────────────────────────── Audit visibility ──────────────────────────────── */

export type AuditScope = "ALL" | "MANAGEMENT" | "NONE";

export function auditScope(principal: Principal): AuditScope {
  if (hasPermission(principal, "audit.view.all")) return "ALL";
  if (hasPermission(principal, "audit.view.management")) return "MANAGEMENT";
  return "NONE";
}

/* ─────────────────────────── Capabilities summary ──────────────────────────── */

export interface Capabilities {
  canInterviewState: boolean;
  canInterviewCrime: boolean;
  canInterviewAdmins: boolean;
  canViewAllInterviews: boolean;
  canDeleteInterviews: boolean;
  canViewAdmins: boolean;
  canCreateAdmins: boolean;
  canDeleteAdmins: boolean;
  canDisableAdmins: boolean;
  canResetPasswords: boolean;
  canEditAdmins: boolean;
  canAssignRoles: boolean;
  canAssignStateCurator: boolean;
  canAssignCrimeCurator: boolean;
  canAssignSupportCurator: boolean;
  canAssignChiefCurator: boolean;
  canAssignHeadAdmin: boolean;
  canManageQuestions: boolean;
  canViewAuditLogs: boolean;
  canManageSettings: boolean;
}

export function capabilities(principal: Principal): Capabilities {
  const assignable = assignableRoles(principal);
  return {
    canInterviewState: canConductInterviewType(principal, "STATE"),
    canInterviewCrime: canConductInterviewType(principal, "CRIME"),
    canInterviewAdmins: canConductInterviewType(principal, "ADMIN"),
    canViewAllInterviews: hasPermission(principal, "interviews.view.all"),
    canDeleteInterviews: canDeleteInterview(principal),
    canViewAdmins: hasPermission(principal, "admins.view"),
    canCreateAdmins: hasPermission(principal, "admins.create"),
    canDeleteAdmins: hasPermission(principal, "admins.delete"),
    canDisableAdmins: hasPermission(principal, "admins.disable"),
    canResetPasswords: hasPermission(principal, "admins.password.reset"),
    canEditAdmins: hasPermission(principal, "admins.update"),
    canAssignRoles: assignable.length > 0,
    canAssignStateCurator: assignable.includes("STATE_CURATOR"),
    canAssignCrimeCurator: assignable.includes("CRIME_CURATOR"),
    canAssignSupportCurator: assignable.includes("SUPPORT_CURATOR"),
    canAssignChiefCurator: assignable.includes("CHIEF_CURATOR_STATE") || assignable.includes("CHIEF_CURATOR_CRIME"),
    canAssignHeadAdmin: assignable.includes("HEAD_ADMIN"),
    canManageQuestions: manageableQuestionTypes(principal).length > 0,
    canViewAuditLogs: auditScope(principal) !== "NONE",
    canManageSettings: hasPermission(principal, "settings.manage"),
  };
}

export function roleLabel(role: Role): string {
  return ROLE_DEFINITIONS[role]?.label ?? role;
}
