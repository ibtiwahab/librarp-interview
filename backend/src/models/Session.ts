import { Schema, model, type Types } from "mongoose";

/**
 * Refresh-token session. Only a SHA-256 hash of the current token id is
 * stored; tokens rotate on every refresh and re-use of an old token revokes
 * the session.
 */
export interface ISession {
  user: Types.ObjectId;
  tokenHash: string;
  previousTokenHash?: string | null;
  rotatedAt?: Date | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  lastUsedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    user: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true, index: true },
    tokenHash: { type: String, required: true },
    previousTokenHash: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    lastUsedAt: { type: Date, default: () => new Date() },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: true },
);

// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>("Session", sessionSchema);
