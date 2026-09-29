import type { Types } from "mongoose";
import type { IAdminUser } from "../models/AdminUser.js";
import { ROLES, type Role } from "../config/roles.js";
import {
  assignableRoles,
  authorityLevel,
  capabilities,
  effectivePermissions,
  type Principal,
} from "./authorization.service.js";

type UserLike = Pick<
  IAdminUser,
  | "username"
  | "displayName"
  | "discordId"
  | "roles"
  | "active"
  | "mustChangePassword"
  | "lastLoginAt"
  | "createdAt"
  | "updatedAt"
> & { _id: Types.ObjectId | string };

export function sortRoles(roles: readonly Role[]): Role[] {
  return ROLES.filter((r) => roles.includes(r));
}

export function toPrincipal(user: { _id: Types.ObjectId | string; roles: readonly string[] }): Principal {
  return { id: String(user._id), roles: [...user.roles] };
}

export function toPublicUser(user: UserLike) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName,
    discordId: user.discordId ?? null,
    roles: sortRoles(user.roles),
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** The shape returned by /auth/me — includes server-computed permissions for UI hints. */
export function toSessionUser(user: UserLike) {
  const principal = toPrincipal(user);
  return {
    ...toPublicUser(user),
    level: authorityLevel(user.roles),
    permissions: [...effectivePermissions(user.roles)].sort(),
    capabilities: capabilities(principal),
    assignableRoles: assignableRoles(principal),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
export type SessionUser = ReturnType<typeof toSessionUser>;
