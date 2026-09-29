import type { Request } from "express";
import type { z } from "zod";
import { Types } from "mongoose";
import { AdminUser, type AdminUserDoc, type IAdminUser, type RoleHistoryEntry } from "../models/AdminUser.js";
import { BASE_ROLE, ROLE_DEFINITIONS, type Role } from "../config/roles.js";
import { AppError, conflict, forbidden, notFound } from "../utils/errors.js";
import { escapeRegex, paginated } from "../utils/http.js";
import { generateTemporaryPassword, hashPassword } from "../utils/crypto.js";
import {
  assignableRoles,
  authorityLevel,
  canAssignRole,
  canChangeRoles,
  canCreateAccountWithRoles,
  canManageUser,
  roleLabel,
  type Principal,
} from "./authorization.service.js";
import { actorFrom, audit } from "./audit.service.js";
import { revokeAllSessions } from "./auth.service.js";
import { sortRoles, toPrincipal, toPublicUser } from "./user.serializer.js";
import type {
  createAdminSchema,
  listAdminsQuery,
  updateAdminSchema,
} from "../validators/admin.validators.js";

type ListQuery = z.infer<typeof listAdminsQuery>;
type CreateInput = z.infer<typeof createAdminSchema>;
type UpdateInput = z.infer<typeof updateAdminSchema>;

async function loadTarget(id: string): Promise<AdminUserDoc> {
  const user = await AdminUser.findOne({ _id: id, deletedAt: null });
  if (!user) throw notFound("Administrator not found.");
  return user;
}

function ensure(decision: { allowed: boolean; reason?: string }) {
  if (!decision.allowed) throw forbidden(decision.reason);
}

/** What the current actor may do to a given account — used for UI hints only. */
export function actionsFor(actor: Principal, target: Pick<IAdminUser, "roles"> & { _id: unknown }) {
  const t = toPrincipal({ _id: String(target._id), roles: target.roles });
  const assignable = assignableRoles(actor).filter((r) => canAssignRole(actor, t, r).allowed);
  return {
    canEdit: canManageUser(actor, t, "update").allowed,
    canDisable: canManageUser(actor, t, "disable").allowed,
    canDelete: canManageUser(actor, t, "delete").allowed,
    canResetPassword: canManageUser(actor, t, "password.reset").allowed,
    assignableRoles: assignable,
    isSelf: actor.id === t.id,
  };
}

type LeanUser = IAdminUser & { _id: Types.ObjectId };

function serializeListItem(actor: Principal, u: LeanUser, createdBy?: { displayName: string; username: string } | null) {
  return {
    ...toPublicUser(u),
    level: authorityLevel(u.roles),
    createdBy: createdBy ? { id: String(u.createdBy), displayName: createdBy.displayName, username: createdBy.username } : null,
    actions: actionsFor(actor, u),
  };
}

export async function listAdmins(actor: Principal, q: ListQuery) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (q.status === "active") filter.active = true;
  if (q.status === "disabled") filter.active = false;
  if (q.role) filter.roles = q.role;
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ username: re }, { displayName: re }, { discordId: re }];
  }
  const sortField = q.sort.replace(/^-/, "");
  const sort: Record<string, 1 | -1> = { [sortField]: q.sort.startsWith("-") ? -1 : 1, _id: -1 };

  const [items, total] = await Promise.all([
    AdminUser.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate<{ createdBy: { _id: Types.ObjectId; displayName: string; username: string } | null }>("createdBy", "displayName username")
      .lean(),
    AdminUser.countDocuments(filter),
  ]);

  return paginated(
    items.map((u) => {
      const creator = u.createdBy;
      const base = { ...u, createdBy: creator?._id ?? null } as unknown as LeanUser;
      return serializeListItem(actor, base, creator);
    }),
    total,
    q.page,
    q.limit,
  );
}

export async function getAdmin(actor: Principal, id: string) {
  const user = await AdminUser.findOne({ _id: id, deletedAt: null })
    .populate<{ createdBy: { _id: Types.ObjectId; displayName: string; username: string } | null }>("createdBy", "displayName username")
    .lean();
  if (!user) throw notFound("Administrator not found.");
  const creator = user.createdBy;
  const base = { ...user, createdBy: creator?._id ?? null } as unknown as LeanUser;
  return {
    ...serializeListItem(actor, base, creator),
    roleHistory: [...(user.roleHistory ?? [])]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map((h) => ({ role: h.role, action: h.action, by: h.by ? String(h.by) : null, byName: h.byName, at: h.at })),
    passwordChangedAt: user.passwordChangedAt ?? null,
  };
}

function historyEntry(req: Request, role: Role, action: "ADDED" | "REMOVED"): RoleHistoryEntry {
  const a = req.auth!.user;
  return { role, action, by: new Types.ObjectId(a.id), byName: a.displayName, at: new Date() };
}

async function assertUsernameAvailable(username: string | undefined, excludeId?: string) {
  if (!username) return;
  const filter: Record<string, unknown> = { username };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await AdminUser.exists(filter)) throw conflict("That username is already in use.", { field: "username" });
}

export async function createAdmin(req: Request, input: CreateInput) {
  const actor = req.auth!.principal;
  const roles = sortRoles([...new Set<Role>([BASE_ROLE, ...input.roles])]);
  ensure(canCreateAccountWithRoles(actor, roles));
  await assertUsernameAvailable(input.username);

  const temporaryPassword = input.password ? undefined : generateTemporaryPassword();
  const passwordHash = await hashPassword(input.password ?? temporaryPassword!);

  const user = await AdminUser.create({
    username: input.username,
    displayName: input.displayName ?? input.username,
    discordId: input.discordId ?? null,
    passwordHash,
    roles,
    active: true,
    mustChangePassword: true,
    createdBy: new Types.ObjectId(actor.id),
    roleHistory: roles.map((r) => historyEntry(req, r, "ADDED")),
  });

  await audit({
    action: "ADMIN_CREATED",
    actor: actorFrom(req),
    targetType: "AdminUser",
    targetId: String(user._id),
    targetLabel: user.username,
    metadata: { roles, displayName: user.displayName },
    req,
  });

  return {
    admin: await getAdmin(actor, String(user._id)),
    // Returned exactly once so the creator can pass it on; never stored or logged.
    temporaryPassword: temporaryPassword ?? null,
  };
}

export async function updateAdmin(req: Request, id: string, input: UpdateInput) {
  const actor = req.auth!.principal;
  const target = await loadTarget(id);
  ensure(canManageUser(actor, toPrincipal(target), "update"));
  await assertUsernameAvailable(input.username && input.username !== target.username ? input.username : undefined, id);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const apply = <K extends "username" | "displayName" | "discordId">(key: K, value: IAdminUser[K] | undefined) => {
    if (value === undefined) return;
    if (target[key] !== value) {
      changes[key] = { from: target[key] ?? null, to: value ?? null };
      target[key] = value as AdminUserDoc[K];
    }
  };
  apply("username", input.username);
  apply("displayName", input.displayName);
  apply("discordId", input.discordId === undefined ? undefined : (input.discordId ?? null));

  if (Object.keys(changes).length === 0) return getAdmin(actor, id);
  await target.save();
  await audit({
    action: "ADMIN_UPDATED",
    actor: actorFrom(req),
    targetType: "AdminUser",
    targetId: id,
    targetLabel: target.username,
    metadata: { changes },
    req,
  });
  return getAdmin(actor, id);
}

async function applyRoleChange(req: Request, target: AdminUserDoc, nextRoles: Role[]) {
  const current = new Set(target.roles);
  const next = new Set(nextRoles);
  const added = [...next].filter((r) => !current.has(r));
  const removed = [...current].filter((r) => !next.has(r));

  target.roles = sortRoles([...next]);
  target.roleHistory.push(...added.map((r) => historyEntry(req, r, "ADDED")), ...removed.map((r) => historyEntry(req, r, "REMOVED")));
  // Force clients to pick up the new permissions on their next request.
  target.tokenVersion += 1;
  await target.save();

  for (const role of added) {
    await audit({
      action: "ROLE_ASSIGNED",
      actor: actorFrom(req),
      targetType: "AdminUser",
      targetId: String(target._id),
      targetLabel: target.username,
      metadata: { role },
      req,
    });
  }
  for (const role of removed) {
    await audit({
      action: "ROLE_REMOVED",
      actor: actorFrom(req),
      targetType: "AdminUser",
      targetId: String(target._id),
      targetLabel: target.username,
      metadata: { role },
      req,
    });
  }
}

export async function setRoles(req: Request, id: string, roles: Role[]) {
  const actor = req.auth!.principal;
  const target = await loadTarget(id);
  const next = sortRoles([...new Set(roles)]);
  ensure(canChangeRoles(actor, toPrincipal(target), next));
  await applyRoleChange(req, target, next);
  return getAdmin(actor, id);
}

export async function addRole(req: Request, id: string, role: Role) {
  const actor = req.auth!.principal;
  const target = await loadTarget(id);
  if (target.roles.includes(role)) {
    throw conflict(`This administrator already has the ${roleLabel(role)} role.`);
  }
  ensure(canAssignRole(actor, toPrincipal(target), role));
  await applyRoleChange(req, target, [...target.roles, role]);
  return getAdmin(actor, id);
}

export async function removeRole(req: Request, id: string, role: Role) {
  const actor = req.auth!.principal;
  const target = await loadTarget(id);
  if (!target.roles.includes(role)) {
    throw conflict(`This administrator does not have the ${roleLabel(role)} role.`);
  }
  if (target.roles.length === 1) throw new AppError("INVALID_STATE", "An administrator must keep at least one role.");
  ensure(canAssignRole(actor, toPrincipal(target), role));
  await applyRoleChange(
    req,
    target,
    target.roles.filter((r) => r !== role),
  );
  return getAdmin(actor, id);
}

export async function setActive(req: Request, id: string, active: boolean) {
  const actor = req.auth!.principal;
  const target = await loadTarget(id);
  ensure(canManageUser(actor, toPrincipal(target), "disable"));
  if (target.active === active) {
    throw new AppError("INVALID_STATE", active ? "This account is already active." : "This account is already disabled.");
  }
  target.active = active;
  target.tokenVersion += 1;
  await target.save();
  if (!active) await revokeAllSessions(id, "account_disabled");
  await audit({
    action: active ? "ADMIN_ENABLED" : "ADMIN_DISABLED",
    actor: actorFrom(req),
    targetType: "AdminUser",
    targetId: id,
    targetLabel: target.username,
    req,
  });
  return getAdmin(actor, id);
}

export async function resetPassword(req: Request, id: string, password?: string) {
  const actor = req.auth!.principal;
  const target = await loadTarget(id);
  ensure(canManageUser(actor, toPrincipal(target), "password.reset"));
  const temporaryPassword = password ? undefined : generateTemporaryPassword();
  target.passwordHash = await hashPassword(password ?? temporaryPassword!);
  target.mustChangePassword = true;
  target.passwordChangedAt = new Date();
  target.failedLoginAttempts = 0;
  target.lockedUntil = null;
  target.tokenVersion += 1;
  await target.save();
  await revokeAllSessions(id, "password_reset");
  await audit({
    action: "ADMIN_PASSWORD_RESET",
    actor: actorFrom(req),
    targetType: "AdminUser",
    targetId: id,
    targetLabel: target.username,
    metadata: { generated: !password },
    req,
  });
  return { temporaryPassword: temporaryPassword ?? null };
}

export async function deleteAdmin(req: Request, id: string) {
  const actor = req.auth!.principal;
  const target = await loadTarget(id);
  ensure(canManageUser(actor, toPrincipal(target), "delete"));

  const identity = { username: target.username };
  target.deletedAt = new Date();
  target.deletedBy = new Types.ObjectId(actor.id);
  target.deletedIdentity = identity;
  // Free the username so it can be reused by a new account.
  target.username = `deleted_${String(target._id)}`;
  target.active = false;
  target.tokenVersion += 1;
  await target.save();
  await revokeAllSessions(id, "account_deleted");

  await audit({
    action: "ADMIN_DELETED",
    actor: actorFrom(req),
    targetType: "AdminUser",
    targetId: id,
    targetLabel: identity.username,
    metadata: { roles: target.roles, displayName: target.displayName },
    req,
  });
}

/** Metadata for the role picker: every role with whether the actor may grant it. */
export function roleCatalogue(actor: Principal) {
  const assignable = new Set(assignableRoles(actor));
  return Object.values(ROLE_DEFINITIONS).map((d) => ({
    role: d.role,
    label: d.label,
    shortLabel: d.shortLabel,
    description: d.description,
    level: d.level,
    assignable: assignable.has(d.role),
    reason: assignable.has(d.role)
      ? null
      : d.role === "EXECUTIVE_DIRECTOR"
        ? "Executive Director can only be created through the secure bootstrap process."
        : "Outside your permission level.",
  }));
}
