import { Schema, model, type Types, type HydratedDocument } from "mongoose";
import { ROLES, type Role } from "../config/roles.js";

export interface RoleHistoryEntry {
  role: Role;
  action: "ADDED" | "REMOVED";
  by?: Types.ObjectId | null;
  byName: string;
  at: Date;
}

export interface IAdminUser {
  username: string;
  displayName: string;
  discordId?: string | null;
  passwordHash: string;
  roles: Role[];
  active: boolean;
  mustChangePassword: boolean;
  /** Bumped on password change / disable / role change to invalidate access tokens. */
  tokenVersion: number;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  passwordChangedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdBy?: Types.ObjectId | null;
  roleHistory: RoleHistoryEntry[];
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  /** Original identifiers kept for the record after a soft delete frees them. */
  deletedIdentity?: { username: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminUserDoc = HydratedDocument<IAdminUser>;

const roleHistorySchema = new Schema<RoleHistoryEntry>(
  {
    role: { type: String, enum: ROLES, required: true },
    action: { type: String, enum: ["ADDED", "REMOVED"], required: true },
    by: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    byName: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const adminUserSchema = new Schema<IAdminUser>(
  {
    username: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 64 },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    discordId: { type: String, trim: true, default: null },
    passwordHash: { type: String, required: true, select: false },
    roles: {
      type: [{ type: String, enum: ROLES }],
      default: ["SERVER_ADMIN"],
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0 && new Set(v).size === v.length,
        message: "Roles must be a non-empty list without duplicates.",
      },
    },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    roleHistory: { type: [roleHistorySchema], default: [] },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    deletedIdentity: {
      type: new Schema({ username: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true },
);

adminUserSchema.index({ username: 1 }, { unique: true });
adminUserSchema.index({ roles: 1 });
adminUserSchema.index({ deletedAt: 1, active: 1 });

adminUserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const out = ret as unknown as Record<string, unknown>;
    delete out.passwordHash;
    delete out.tokenVersion;
    delete out.__v;
    return out;
  },
});

export const AdminUser = model<IAdminUser>("AdminUser", adminUserSchema);
