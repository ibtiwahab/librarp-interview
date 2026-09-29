/**
 * Secure bootstrap for the FIRST Executive Director.
 *
 *   npm run seed:executive            (development, via tsx)
 *   npm run seed:executive:prod       (after `npm run build`)
 *
 * Credentials come from BOOTSTRAP_EXEC_* environment variables, or are asked
 * for interactively (password input is hidden). Nothing is hard-coded.
 *
 * Refuses to run if an Executive Director already exists, unless
 * --allow-additional is passed (e.g. to recover access).
 */
import readline from "node:readline";
import { Writable } from "node:stream";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { AdminUser } from "../models/AdminUser.js";
import { hashPassword } from "../utils/crypto.js";
import { passwordSchema } from "../validators/common.js";
import { audit } from "../services/audit.service.js";
import { ensureOrganizations } from "../services/organization.service.js";

const WEAK = new Set(["admin", "admin123", "password", "password123", "changeme", "letmein", "qwerty123", "librarp123"]);

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

async function main() {
  const allowAdditional = process.argv.includes("--allow-additional");
  const interactive = process.stdin.isTTY;

  await connectDatabase();
  await ensureOrganizations();

  const existing = await AdminUser.countDocuments({ roles: "EXECUTIVE_DIRECTOR", deletedAt: null });
  if (existing > 0 && !allowAdditional) {
    console.error(
      `\n✖ An Executive Director already exists (${existing}). Bootstrap refused.\n` +
        "  Pass --allow-additional only if you are deliberately recovering access.\n",
    );
    await disconnectDatabase();
    process.exit(1);
  }

  const env = process.env;
  // Usernames are case-insensitive (stored lowercase); the display name keeps the typed casing.
  let rawUsername = env.BOOTSTRAP_EXEC_USERNAME?.trim() ?? "";
  let displayName = env.BOOTSTRAP_EXEC_DISPLAY_NAME?.trim() ?? "";
  let password = env.BOOTSTRAP_EXEC_PASSWORD ?? "";

  if (!rawUsername || !password) {
    if (!interactive) {
      console.error("\n✖ Set BOOTSTRAP_EXEC_USERNAME and BOOTSTRAP_EXEC_PASSWORD, or run this command in an interactive terminal.\n");
      await disconnectDatabase();
      process.exit(1);
    }
    console.log("\nLibra RP — create the first Executive Director\n");
    rawUsername ||= await ask("Username: ");
    if (!password) {
      password = await ask("Password (hidden): ", true);
      const confirm = await ask("Confirm password (hidden): ", true);
      if (password !== confirm) throw new Error("Passwords do not match.");
    }
  }
  const username = rawUsername.toLowerCase();
  displayName ||= rawUsername;

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Username must be 3–32 chars: letters, numbers, . _ -");
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw new Error(pw.error.issues[0]?.message ?? "Password does not meet the policy.");
  if (WEAK.has(password.toLowerCase())) throw new Error("That password is too easy to guess. Choose a stronger one.");

  if (await AdminUser.exists({ username })) throw new Error("An account with that username already exists.");
  const user = await AdminUser.create({
    username,
    displayName,
    passwordHash: await hashPassword(password),
    roles: ["EXECUTIVE_DIRECTOR"],
    active: true,
    mustChangePassword: false,
    roleHistory: [
      { role: "EXECUTIVE_DIRECTOR", action: "ADDED", by: null, byName: "System bootstrap", at: new Date() },
    ],
  });

  await audit({
    action: "BOOTSTRAP_EXECUTIVE_CREATED",
    targetType: "AdminUser",
    targetId: String(user._id),
    targetLabel: user.username,
    metadata: { via: "seed:executive" },
  });

  console.log(`\n✔ Executive Director “${user.displayName}” (${user.username}) created.`);
  console.log("  Remove any BOOTSTRAP_EXEC_* variables from your environment now.\n");
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(`\n✖ ${(err as Error).message}\n`);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
