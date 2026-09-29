import { AdminUser } from "../models/AdminUser.js";
import { Organization } from "../models/Organization.js";
import { RETIRED_ROLES } from "../config/roles.js";

/**
 * Idempotent data migrations, run on every startup. Each step is a cheap
 * no-op once applied, so it is safe on free-tier restarts.
 */
export async function runStartupMigrations(): Promise<void> {
  // 1. Roles that were removed from the hierarchy (e.g. SERVER_ADMIN).
  // Role history keeps them for the record; only live role lists are cleaned.
  const retired = Object.keys(RETIRED_ROLES);
  if (retired.length) {
    // Raw driver call: the retired names are no longer valid values in the Mongoose schema.
    const res = await AdminUser.collection.updateMany(
      { roles: { $in: retired } },
      { $pull: { roles: { $in: retired } }, $inc: { tokenVersion: 1 } } as Record<string, unknown>,
    );
    if (res.modifiedCount) console.info(`[migrate] Removed retired role(s) from ${res.modifiedCount} account(s).`);
  }

  // 2. The Admin category now has two interview kinds; keep the old default
  // label consistent with "Admin Assistant" / "Server Admin".
  await Organization.updateOne({ code: "SERVER_ADMIN", name: "Server Administration" }, { $set: { name: "Server Admin" } });
}
