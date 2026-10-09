import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { QuestionSet } from "../src/models/QuestionSet.js";
import { Question } from "../src/models/Question.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { hashPassword } from "../src/utils/crypto.js";
import { ensureOrganizations } from "../src/services/organization.service.js";
import { runStartupMigrations } from "../src/services/migration.service.js";
import type { Role } from "../src/config/roles.js";
import type { InterviewType, OrganizationCode } from "../src/config/organizations.js";

/**
 * API-level authorization tests: every check here goes through real HTTP,
 * middleware and services — proving the backend (not the UI) enforces RBAC.
 */

let mongo: MongoMemoryServer;
let app: Express;
const PASSWORD = "Test-Password-123";
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

const USERS: Record<string, Role[]> = {
  exec: ["EXECUTIVE_DIRECTOR"],
  head: ["HEAD_ADMIN"],
  chiefState: ["CHIEF_CURATOR_STATE"],
  stateCur: ["STATE_CURATOR"],
  crimeCur: ["CRIME_CURATOR"],
  supportCur: ["SUPPORT_CURATOR"],
  plain: [],
  multi: ["STATE_CURATOR", "SUPPORT_CURATOR"],
  target: [],
};

const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const candidate = { name: "John Doe", discordUsername: "johnd", inGameName: "John Doe" };

async function seedSet(organization: OrganizationCode, interviewType: InterviewType, questions: string[]) {
  const set = await QuestionSet.create({ name: `${organization} Default`, organization, interviewType, isDefault: true });
  await Question.insertMany(
    questions.map((q, i) => ({
      questionSet: set._id,
      organization,
      interviewType,
      questionText: q,
      normalizedText: q.toLowerCase(),
      order: i + 1,
    })),
  );
  return set;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await ensureOrganizations();
  app = createApp();

  const hash = await hashPassword(PASSWORD);
  for (const [username, roles] of Object.entries(USERS)) {
    const u = await AdminUser.create({ username: username.toLowerCase(), displayName: username, passwordHash: hash, roles });
    ids[username] = String(u._id);
  }
  for (const username of Object.keys(USERS)) {
    const res = await request(app).post("/api/auth/login").send({ identifier: username.toLowerCase(), password: PASSWORD });
    expect(res.status).toBe(200);
    tokens[username] = res.body.data.accessToken;
  }

  await seedSet("FIB", "STATE", ["What is the primary role of FIB?", "Who are your deputies?"]);
  await seedSet("EMS", "STATE", ["What are the primary duties of EMS?"]);
  await seedSet("BALLAS", "CRIME", ["Why do you want to lead Ballas?"]);
  await seedSet("FAMILIES", "CRIME", ["Why do you want to lead Families?"]);
  await seedSet("SERVER_ADMIN", "ADMIN", ["Why do you want to be a Server Admin?"]);
  await seedSet("ADMIN_ASSISTANT", "ADMIN", ["Why do you want to be an Admin Assistant?"]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("no public registration", () => {
  it.each(["/api/auth/register", "/api/auth/signup", "/api/register", "/api/sign-up", "/api/create-account"])("%s → 404", async (path) => {
    const res = await request(app).post(path).send({ username: "hacker", password: "whatever-123" });
    expect(res.status).toBe(404);
  });
  it("creating an admin without a token → 401", async () => {
    const res = await request(app).post("/api/admins").send({ username: "hacker", displayName: "Hacker" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
  });
});

describe("authentication", () => {
  it("rejects a wrong password with a generic message", async () => {
    const res = await request(app).post("/api/auth/login").send({ identifier: "plain", password: "nope-nope-123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
  it("never returns the password hash", async () => {
    const res = await request(app).get("/api/auth/me").set(auth("exec"));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
  it("ignores roles sent by the client", async () => {
    const res = await request(app)
      .post("/api/interviews")
      .set(auth("plain"))
      .send({ organization: "FIB", candidate, roles: ["EXECUTIVE_DIRECTOR"], permissions: ["interviews.conduct.state"] });
    expect(res.status).toBe(403);
  });
  it("refresh requires the verification header and rotates the cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ identifier: "stateCur".toLowerCase(), password: PASSWORD }).expect(200);
    await agent.post("/api/auth/refresh").expect(403);
    const res = await agent.post("/api/auth/refresh").set("X-Requested-With", "librarp");
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers["set-cookie"]?.[0]).toMatch(/lrp_rt=.*HttpOnly/i);
  });
});

describe("interview start permissions (API level)", () => {
  it("Crime Curator starting FIB interview → 403", async () => {
    const res = await request(app).post("/api/interviews").set(auth("crimeCur")).send({ organization: "FIB", candidate });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("You do not have permission to conduct FIB interviews.");
  });
  it("Support Curator starting Ballas interview → 403", async () => {
    const res = await request(app).post("/api/interviews").set(auth("supportCur")).send({ organization: "BALLAS", candidate });
    expect(res.status).toBe(403);
  });
  it("Server Admin starting EMS interview → 403", async () => {
    const res = await request(app).post("/api/interviews").set(auth("plain")).send({ organization: "EMS", candidate });
    expect(res.status).toBe(403);
  });
  it("State Curator starting Admin interview → 403", async () => {
    const res = await request(app).post("/api/interviews").set(auth("stateCur")).send({ organization: "SERVER_ADMIN", candidate });
    expect(res.status).toBe(403);
  });
  it("multi-role [STATE_CURATOR, SUPPORT_CURATOR] can do FIB, EMS and both Admin kinds but not Families", async () => {
    for (const organization of ["FIB", "EMS", "ADMIN_ASSISTANT", "SERVER_ADMIN"]) {
      const res = await request(app).post("/api/interviews").set(auth("multi")).send({ organization, candidate });
      expect(res.status, organization).toBe(201);
    }
    const res = await request(app).post("/api/interviews").set(auth("multi")).send({ organization: "FAMILIES", candidate });
    expect(res.status).toBe(403);
  });
});

describe("role assignment escalation (API level)", () => {
  it("State Curator attempting to assign Head Admin → 403", async () => {
    const res = await request(app).put(`/api/admins/${ids.target}/roles`).set(auth("stateCur")).send({ roles: ["HEAD_ADMIN"] });
    expect(res.status).toBe(403);
  });
  it("Head Admin assigning Executive Director → 403", async () => {
    const res = await request(app).post(`/api/admins/${ids.target}/roles`).set(auth("head")).send({ role: "EXECUTIVE_DIRECTOR" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
  it("Chief State Curator assigning Crime Curator → 403", async () => {
    const res = await request(app).post(`/api/admins/${ids.target}/roles`).set(auth("chiefState")).send({ role: "CRIME_CURATOR" });
    expect(res.status).toBe(403);
  });
  it("Chief State Curator assigning State Curator → 200, then duplicate → 409", async () => {
    const ok = await request(app).post(`/api/admins/${ids.target}/roles`).set(auth("chiefState")).send({ role: "STATE_CURATOR" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.roles).toEqual(["STATE_CURATOR"]);
    const dup = await request(app).post(`/api/admins/${ids.target}/roles`).set(auth("chiefState")).send({ role: "STATE_CURATOR" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe("This administrator already has the State Curator role.");
  });
  it("role changes invalidate the target's existing access token", async () => {
    const login = await request(app).post("/api/auth/login").send({ identifier: "target", password: PASSWORD });
    const token = login.body.data.accessToken as string;
    await request(app).delete(`/api/admins/${ids.target}/roles/STATE_CURATOR`).set(auth("exec")).expect(200);
    const res = await request(app).get("/api/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });
  it("nobody can modify their own roles", async () => {
    const res = await request(app).post(`/api/admins/${ids.exec}/roles`).set(auth("exec")).send({ role: "HEAD_ADMIN" });
    expect(res.status).toBe(403);
  });
  it("Head Admin cannot delete or disable the Executive Director", async () => {
    expect((await request(app).delete(`/api/admins/${ids.exec}`).set(auth("head"))).status).toBe(403);
    expect((await request(app).post(`/api/admins/${ids.exec}/disable`).set(auth("head"))).status).toBe(403);
  });
  it("Chief State Curator cannot create a Head Admin account", async () => {
    const res = await request(app)
      .post("/api/admins")
      .set(auth("chiefState"))
      .send({ username: "newbie", displayName: "Newbie", roles: ["HEAD_ADMIN"] });
    expect(res.status).toBe(403);
  });
});

describe("account lifecycle", () => {
  it("creates an account with a one-time temporary password and forces a password change", async () => {
    const created = await request(app)
      .post("/api/admins")
      .set(auth("chiefState"))
      .send({ username: "recruit", displayName: "Recruit", roles: ["STATE_CURATOR"] });
    expect(created.status).toBe(201);
    expect(created.body.data.admin.roles).toEqual(["STATE_CURATOR"]);
    const temp = created.body.data.temporaryPassword as string;
    expect(temp).toMatch(/^\S{4}-\S{4}-\S{4}-\S{4}$/);

    const login = await request(app).post("/api/auth/login").send({ identifier: "recruit", password: temp });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
    const blocked = await request(app).get("/api/dashboard").set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const audit = await AuditLog.findOne({ action: "ADMIN_CREATED", targetLabel: "recruit" }).lean();
    expect(JSON.stringify(audit)).not.toContain(temp);
  });

  it("accounts need only a username and password (no email)", async () => {
    const created = await request(app).post("/api/admins").set(auth("exec")).send({ username: "Minimal", password: "Short1pw", roles: ["SUPPORT_CURATOR"], email: "x@y.z" });
    expect(created.status).toBe(201);
    expect(created.body.data.admin).toMatchObject({ username: "minimal", displayName: "minimal" });
    expect(created.body.data.admin).not.toHaveProperty("email");
    const login = await request(app).post("/api/auth/login").send({ identifier: "MINIMAL", password: "Short1pw" });
    expect(login.status).toBe(200);
  });

  it("new accounts must be given at least one role", async () => {
    const res = await request(app).post("/api/admins").set(auth("exec")).send({ username: "noroles", password: "Short1pw", roles: [] });
    expect(res.status).toBe(400);
    const retired = await request(app).post("/api/admins").set(auth("exec")).send({ username: "retired", password: "Short1pw", roles: ["SERVER_ADMIN"] });
    expect(retired.status).toBe(400);
  });

  it("disabled accounts cannot sign in", async () => {
    const created = await request(app).post("/api/admins").set(auth("exec")).send({ username: "tobedisabled", displayName: "Dis", password: PASSWORD, roles: ["STATE_CURATOR"] });
    await request(app).post(`/api/admins/${created.body.data.admin.id}/disable`).set(auth("exec")).expect(200);
    const res = await request(app).post("/api/auth/login").send({ identifier: "tobedisabled", password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("soft-deleted accounts disappear and free their username", async () => {
    const created = await request(app).post("/api/admins").set(auth("exec")).send({ username: "ghost", displayName: "Ghost", password: PASSWORD, roles: ["CRIME_CURATOR"] });
    const id = created.body.data.admin.id;
    await request(app).delete(`/api/admins/${id}`).set(auth("exec")).expect(200);
    expect((await request(app).get(`/api/admins/${id}`).set(auth("exec"))).status).toBe(404);
    const doc = await AdminUser.findById(id).lean();
    expect(doc?.deletedAt).toBeTruthy();
    expect(doc?.deletedIdentity?.username).toBe("ghost");
  });
});

describe("interview lifecycle, snapshots and deletion", () => {
  it("keeps the original question wording after the bank is edited", async () => {
    const started = await request(app).post("/api/interviews").set(auth("stateCur")).send({ organization: "FIB", candidate });
    expect(started.status).toBe(201);
    const interview = started.body.data;
    expect(interview.questions[0].questionText).toBe("What is the primary role of FIB?");

    const q = await Question.findOne({ organization: "FIB", order: 1 });
    await request(app).patch(`/api/questions/${q!._id}`).set(auth("head")).send({ questionText: "EDITED question text?" }).expect(200);

    const reloaded = await request(app).get(`/api/interviews/${interview.id}`).set(auth("stateCur"));
    expect(reloaded.body.data.questions[0].questionText).toBe("What is the primary role of FIB?");
  });

  it("autosaves, completes, and refuses edits after completion", async () => {
    const started = await request(app).post("/api/interviews").set(auth("stateCur")).send({ organization: "EMS", candidate });
    const i = started.body.data;
    await request(app)
      .patch(`/api/interviews/${i.id}`)
      .set(auth("stateCur"))
      .send({ currentIndex: 0, answers: [{ id: i.questions[0].id, candidateAnswerNotes: "Treat patients", result: "CORRECT" }] })
      .expect(200);

    // Another curator of the same category cannot edit someone else's interview.
    const other = await request(app).patch(`/api/interviews/${i.id}`).set(auth("multi")).send({ currentIndex: 0 });
    expect(other.status).toBe(403);

    const done = await request(app).post(`/api/interviews/${i.id}/complete`).set(auth("stateCur")).send({ status: "PASSED", finalComments: "Strong" });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe("PASSED");

    const again = await request(app).patch(`/api/interviews/${i.id}`).set(auth("stateCur")).send({ currentIndex: 0 });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("This interview was already completed.");
    const redecide = await request(app).post(`/api/interviews/${i.id}/complete`).set(auth("stateCur")).send({ status: "FAILED" });
    expect(redecide.status).toBe(409);
  });

  it("accepts recording links at start and finish, and rejects non-http links", async () => {
    const bad = await request(app)
      .post("/api/interviews")
      .set(auth("stateCur"))
      .send({ organization: "FIB", candidate, recordingLinks: ["javascript:alert(1)"] });
    expect(bad.status).toBe(400);

    const started = await request(app)
      .post("/api/interviews")
      .set(auth("stateCur"))
      .send({ organization: "FIB", candidate, recordingLinks: ["https://youtu.be/abc123"] });
    expect(started.status).toBe(201);
    expect(started.body.data.recordingLinks).toEqual(["https://youtu.be/abc123"]);

    const done = await request(app)
      .post(`/api/interviews/${started.body.data.id}/complete`)
      .set(auth("stateCur"))
      .send({ status: "PASSED", recordingLinks: ["https://youtu.be/abc123", "https://medal.tv/games/gta-v/clips/xyz"] });
    expect(done.status).toBe(200);
    expect(done.body.data.recordingLinks).toHaveLength(2);
    expect(done.body.data.permissions.canEditRecord).toBe(true);
  });

  it("lets the interviewer edit links and answers after submitting, without changing the decision", async () => {
    const started = await request(app).post("/api/interviews").set(auth("stateCur")).send({ organization: "EMS", candidate });
    const i = started.body.data;

    // Not allowed while still in progress.
    const early = await request(app).patch(`/api/interviews/${i.id}/record`).set(auth("stateCur")).send({ recordingLinks: [] });
    expect(early.status).toBe(409);

    await request(app).post(`/api/interviews/${i.id}/complete`).set(auth("stateCur")).send({ status: "FAILED" }).expect(200);

    const edited = await request(app)
      .patch(`/api/interviews/${i.id}/record`)
      .set(auth("stateCur"))
      .send({
        recordingLinks: ["https://drive.google.com/file/d/123/view"],
        answers: [{ id: i.questions[0].id, candidateAnswerNotes: "Added after review", result: "PARTIAL" }],
        finalComments: "Updated after watching the recording.",
      });
    expect(edited.status).toBe(200);
    expect(edited.body.data.status).toBe("FAILED");
    expect(edited.body.data.recordingLinks).toEqual(["https://drive.google.com/file/d/123/view"]);
    expect(edited.body.data.questions[0]).toMatchObject({ candidateAnswerNotes: "Added after review", result: "PARTIAL" });
    expect(await AuditLog.exists({ action: "INTERVIEW_UPDATED", targetId: i.id })).toBeTruthy();

    // A status field in the body is ignored — the decision cannot be changed here.
    await request(app).patch(`/api/interviews/${i.id}/record`).set(auth("stateCur")).send({ status: "PASSED", concerns: "x" }).expect(200);
    expect((await request(app).get(`/api/interviews/${i.id}`).set(auth("stateCur"))).body.data.status).toBe("FAILED");

    // Another curator of the same category cannot edit someone else's record.
    const other = await request(app).patch(`/api/interviews/${i.id}/record`).set(auth("multi")).send({ recordingLinks: [] });
    expect(other.status).toBe(403);
    // A senior administrator can.
    await request(app).patch(`/api/interviews/${i.id}/record`).set(auth("head")).send({ strengths: "Calm" }).expect(200);
  });

  it("only authorized roles can delete; deleted interviews disappear", async () => {
    const started = await request(app).post("/api/interviews").set(auth("multi")).send({ organization: "FIB", candidate });
    const id = started.body.data.id;
    expect((await request(app).delete(`/api/interviews/${id}`).set(auth("multi"))).status).toBe(403);
    expect((await request(app).delete(`/api/interviews/${id}`).set(auth("chiefState"))).status).toBe(403);
    expect((await request(app).delete(`/api/interviews/${id}`).set(auth("head"))).status).toBe(200);
    expect((await request(app).get(`/api/interviews/${id}`).set(auth("head"))).status).toBe(404);
    const list = await request(app).get("/api/interviews").set(auth("head"));
    expect(list.body.data.items.some((x: { id: string }) => x.id === id)).toBe(false);
    expect(await AuditLog.exists({ action: "INTERVIEW_DELETED", targetId: id })).toBeTruthy();
  });

  it("Crime Curator cannot read State interview history", async () => {
    const list = await request(app).get("/api/interviews").set(auth("crimeCur"));
    expect(list.status).toBe(200);
    expect(list.body.data.items.every((x: { interviewType: string }) => x.interviewType === "CRIME")).toBe(true);
  });
});

describe("question bank permissions", () => {
  it("Chief State cannot touch Crime questions", async () => {
    const fib = await Question.findOne({ organization: "FIB" });
    const ballas = await Question.findOne({ organization: "BALLAS" });
    expect((await request(app).patch(`/api/questions/${ballas!._id}`).set(auth("chiefState")).send({ required: false })).status).toBe(403);
    expect((await request(app).patch(`/api/questions/${fib!._id}`).set(auth("chiefState")).send({ required: false })).status).toBe(200);
  });

  it("State Curator can add, edit and delete questions and create sets — for State organizations only", async () => {
    const fibSet = await QuestionSet.findOne({ organization: "FIB" });
    const created = await request(app)
      .post("/api/questions")
      .set(auth("stateCur"))
      .send({ questionSet: String(fibSet!._id), questionText: "How will you recruit new agents?" });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    await request(app).patch(`/api/questions/${id}`).set(auth("stateCur")).send({ questionText: "How will you recruit and train new agents?" }).expect(200);
    await request(app).delete(`/api/questions/${id}`).set(auth("stateCur")).expect(200);

    const newSet = await request(app)
      .post("/api/question-sets")
      .set(auth("stateCur"))
      .send({ name: "FIB Leadership — Season 2", organization: "FIB" });
    expect(newSet.status).toBe(201);
    expect(newSet.body.data.canManage).toBe(true);

    // Outside their category: blocked.
    const ballas = await Question.findOne({ organization: "BALLAS" });
    expect((await request(app).patch(`/api/questions/${ballas!._id}`).set(auth("stateCur")).send({ required: false })).status).toBe(403);
    expect((await request(app).post("/api/question-sets").set(auth("stateCur")).send({ name: "Ballas — Rogue", organization: "BALLAS" })).status).toBe(403);
    expect((await request(app).post("/api/question-sets").set(auth("stateCur")).send({ name: "Admin — Rogue", organization: "SERVER_ADMIN" })).status).toBe(403);
  });

  it("Crime and Support Curators manage only their own category", async () => {
    const ballasSet = await QuestionSet.findOne({ organization: "BALLAS" });
    const adminSet = await QuestionSet.findOne({ organization: "ADMIN_ASSISTANT" });
    const fib = await Question.findOne({ organization: "FIB" });
    expect((await request(app).post("/api/questions").set(auth("crimeCur")).send({ questionSet: String(ballasSet!._id), questionText: "Who runs your corners?" })).status).toBe(201);
    expect((await request(app).post("/api/questions").set(auth("supportCur")).send({ questionSet: String(adminSet!._id), questionText: "How do you handle a toxic ticket?" })).status).toBe(201);
    expect((await request(app).post("/api/questions").set(auth("supportCur")).send({ questionSet: String(ballasSet!._id), questionText: "Nope?" })).status).toBe(403);
    expect((await request(app).delete(`/api/questions/${fib!._id}`).set(auth("crimeCur"))).status).toBe(403);
  });

  it("an account with no roles cannot manage questions", async () => {
    const fib = await Question.findOne({ organization: "FIB" });
    expect((await request(app).patch(`/api/questions/${fib!._id}`).set(auth("plain")).send({ required: false })).status).toBe(403);
  });

  it("import preview → bulk import skips duplicates", async () => {
    const set = await QuestionSet.findOne({ organization: "EMS" });
    const preview = await request(app)
      .post("/api/questions/import/preview")
      .set(auth("chiefState"))
      .field("questionSet", String(set!._id))
      .attach("file", Buffer.from("EMS\n1. What are the primary duties of EMS?\n2. Can EMS be corrupt?\n"), "ems.txt");
    expect(preview.status).toBe(200);
    expect(preview.body.data.detectedQuestions).toHaveLength(2);
    expect(preview.body.data.duplicates).toHaveLength(1);

    const imported = await request(app)
      .post("/api/questions/bulk")
      .set(auth("chiefState"))
      .send({ questionSet: String(set!._id), questions: preview.body.data.detectedQuestions.map((q: { questionText: string }) => ({ questionText: q.questionText })) });
    expect(imported.status).toBe(201);
    expect(imported.body.data).toMatchObject({ imported: 1, skipped: 1 });
  });

  it("rejects an executable disguised as a document", async () => {
    const res = await request(app)
      .post("/api/questions/import/preview")
      .set(auth("head"))
      .attach("file", Buffer.from("MZ\x90\x00this is not a docx"), "questions.docx");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("curators can import documents; accounts with no roles cannot", async () => {
    const ok = await request(app)
      .post("/api/questions/import/preview")
      .set(auth("stateCur"))
      .attach("file", Buffer.from("1. What is RDM?\n2. What is VDM?\n"), "q.txt");
    expect(ok.status).toBe(200);
    const denied = await request(app)
      .post("/api/questions/import/preview")
      .set(auth("plain"))
      .attach("file", Buffer.from("1. Q?"), "q.txt");
    expect(denied.status).toBe(403);
  });
});

describe("retired Server Admin role migration", () => {
  it("strips the retired role but keeps other roles and history", async () => {
    const hash = await hashPassword(PASSWORD);
    const now = new Date();
    const base = { passwordHash: hash, active: true, mustChangePassword: false, tokenVersion: 0, failedLoginAttempts: 0, deletedAt: null, createdAt: now, updatedAt: now };
    await AdminUser.collection.insertMany([
      { ...base, username: "legacy1", displayName: "Legacy One", roles: ["SERVER_ADMIN", "STATE_CURATOR"], roleHistory: [{ role: "SERVER_ADMIN", action: "ADDED", byName: "x", at: now }] },
      { ...base, username: "legacy2", displayName: "Legacy Two", roles: ["SERVER_ADMIN"], roleHistory: [] },
    ]);
    await runStartupMigrations();
    const one = await AdminUser.findOne({ username: "legacy1" }).lean();
    const two = await AdminUser.findOne({ username: "legacy2" }).lean();
    expect(one?.roles).toEqual(["STATE_CURATOR"]);
    expect(one?.roleHistory[0]?.role).toBe("SERVER_ADMIN");
    expect(two?.roles).toEqual([]);

    // An account left with no roles can still sign in, but has no permissions.
    const login = await request(app).post("/api/auth/login").send({ identifier: "legacy2", password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.permissions).toEqual([]);
    expect((await request(app).post("/api/interviews").set("Authorization", `Bearer ${login.body.data.accessToken}`).send({ organization: "FIB", candidate })).status).toBe(403);
  });
});

describe("audit log visibility", () => {
  it("Executive Director sees everything, Head Admin sees management, curators nothing", async () => {
    expect((await request(app).get("/api/audit-logs").set(auth("exec"))).body.data.scope).toBe("ALL");
    const head = await request(app).get("/api/audit-logs").set(auth("head"));
    expect(head.body.data.scope).toBe("MANAGEMENT");
    expect(head.body.data.items.every((l: { category: string }) => l.category !== "auth")).toBe(true);
    expect((await request(app).get("/api/audit-logs").set(auth("chiefState"))).status).toBe(403);
  });
});
