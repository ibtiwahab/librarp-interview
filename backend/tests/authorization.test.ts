import { describe, expect, it } from "vitest";
import type { Role } from "../src/config/roles.js";
import {
  assignableRoles,
  auditScope,
  authorityLevel,
  canAssignRole,
  canChangeRoles,
  canCreateAccountWithRoles,
  canDeleteInterview,
  canInterviewOrganization,
  canManageQuestions,
  canManageUser,
  canModifyInterview,
  canViewInterview,
  capabilities,
  hasPermission,
  type Principal,
} from "../src/services/authorization.service.js";

let seq = 0;
const user = (...roles: Role[]): Principal => ({ id: `u${++seq}`, roles });

const executive = user("EXECUTIVE_DIRECTOR", "SERVER_ADMIN");
const headAdmin = user("HEAD_ADMIN", "SERVER_ADMIN");
const chiefState = user("CHIEF_CURATOR_STATE", "SERVER_ADMIN");
const chiefCrime = user("CHIEF_CURATOR_CRIME", "SERVER_ADMIN");
const stateCurator = user("SERVER_ADMIN", "STATE_CURATOR");
const crimeCurator = user("SERVER_ADMIN", "CRIME_CURATOR");
const supportCurator = user("SERVER_ADMIN", "SUPPORT_CURATOR");
const serverAdmin = user("SERVER_ADMIN");
const multiRole = user("SERVER_ADMIN", "STATE_CURATOR", "SUPPORT_CURATOR");

const STATE_ORGS = ["LSPD", "SAHP", "GOV", "EMS", "FIB"];
const CRIME_ORGS = ["FAMILIES", "BALLAS", "MARABUNTA", "VAGOS", "BLOODS"];

describe("interview permission matrix", () => {
  const matrix: Array<[string, Principal, boolean, boolean, boolean]> = [
    ["Executive Director", executive, true, true, true],
    ["Head Admin", headAdmin, true, true, true],
    ["Chief Curator of State", chiefState, true, false, false],
    ["Chief Curator of Crime", chiefCrime, false, true, false],
    ["State Curator", stateCurator, true, false, false],
    ["Crime Curator", crimeCurator, false, true, false],
    ["Support Curator", supportCurator, false, false, true],
    ["Server Admin", serverAdmin, false, false, false],
  ];

  it.each(matrix)("%s → state/crime/admin", (_name, p, state, crime, admin) => {
    for (const org of STATE_ORGS) expect(canInterviewOrganization(p, org)).toBe(state);
    for (const org of CRIME_ORGS) expect(canInterviewOrganization(p, org)).toBe(crime);
    expect(canInterviewOrganization(p, "SERVER_ADMIN")).toBe(admin);
  });

  it("rejects unknown organizations", () => {
    expect(canInterviewOrganization(executive, "NOT_AN_ORG")).toBe(false);
  });

  it("Crime Curator starting FIB interview → denied", () => {
    expect(canInterviewOrganization(crimeCurator, "FIB")).toBe(false);
  });
  it("Support Curator starting Ballas interview → denied", () => {
    expect(canInterviewOrganization(supportCurator, "BALLAS")).toBe(false);
  });
  it("Server Admin starting EMS interview → denied", () => {
    expect(canInterviewOrganization(serverAdmin, "EMS")).toBe(false);
  });
  it("Server Admin gains State access when State Curator is added", () => {
    expect(canInterviewOrganization({ id: "x", roles: ["SERVER_ADMIN", "STATE_CURATOR"] }, "EMS")).toBe(true);
  });
});

describe("multi-role administrator [SERVER_ADMIN, STATE_CURATOR, SUPPORT_CURATOR]", () => {
  it("can conduct FIB, EMS and Admin interviews", () => {
    expect(canInterviewOrganization(multiRole, "FIB")).toBe(true);
    expect(canInterviewOrganization(multiRole, "EMS")).toBe(true);
    expect(canInterviewOrganization(multiRole, "SERVER_ADMIN")).toBe(true);
  });
  it("cannot conduct Families interviews", () => {
    expect(canInterviewOrganization(multiRole, "FAMILIES")).toBe(false);
  });
  it("cannot assign Head Admin", () => {
    expect(canAssignRole(multiRole, serverAdmin, "HEAD_ADMIN").allowed).toBe(false);
    expect(assignableRoles(multiRole)).toEqual([]);
  });
  it("cannot delete arbitrary interviews", () => {
    expect(canDeleteInterview(multiRole)).toBe(false);
  });
  it("cannot modify someone else's interview", () => {
    expect(canModifyInterview(multiRole, { interviewType: "STATE", interviewerId: "someone-else" })).toBe(false);
  });
  it("capabilities reflect the union of roles", () => {
    const c = capabilities(multiRole);
    expect(c.canInterviewState).toBe(true);
    expect(c.canInterviewAdmins).toBe(true);
    expect(c.canInterviewCrime).toBe(false);
    expect(c.canCreateAdmins).toBe(false);
    expect(c.canViewAuditLogs).toBe(false);
  });
});

describe("privilege escalation attempts", () => {
  it("State Curator assigning Head Admin → denied", () => {
    const d = canAssignRole(stateCurator, serverAdmin, "HEAD_ADMIN");
    expect(d.allowed).toBe(false);
  });
  it("Head Admin assigning Executive Director → denied", () => {
    expect(canAssignRole(headAdmin, serverAdmin, "EXECUTIVE_DIRECTOR").allowed).toBe(false);
  });
  it("Executive Director assigning Executive Director → denied (bootstrap only)", () => {
    expect(canAssignRole(executive, serverAdmin, "EXECUTIVE_DIRECTOR").allowed).toBe(false);
  });
  it("Head Admin cannot mint another Head Admin", () => {
    expect(canAssignRole(headAdmin, serverAdmin, "HEAD_ADMIN").allowed).toBe(false);
  });
  it("Chief State Curator assigning Crime Curator → denied", () => {
    expect(canAssignRole(chiefState, serverAdmin, "CRIME_CURATOR").allowed).toBe(false);
  });
  it("Chief State Curator assigning State Curator to a Server Admin → allowed", () => {
    expect(canAssignRole(chiefState, serverAdmin, "STATE_CURATOR").allowed).toBe(true);
  });
  it("Chief Crime Curator assigning Crime Curator → allowed, State Curator → denied", () => {
    expect(canAssignRole(chiefCrime, serverAdmin, "CRIME_CURATOR").allowed).toBe(true);
    expect(canAssignRole(chiefCrime, serverAdmin, "STATE_CURATOR").allowed).toBe(false);
  });
  it("Chief Curators cannot assign Support Curator or Chief roles", () => {
    for (const r of ["SUPPORT_CURATOR", "CHIEF_CURATOR_STATE", "CHIEF_CURATOR_CRIME", "HEAD_ADMIN"] as Role[]) {
      expect(canAssignRole(chiefState, serverAdmin, r).allowed).toBe(false);
    }
  });
  it("nobody can change their own roles", () => {
    expect(canAssignRole(executive, executive, "HEAD_ADMIN").allowed).toBe(false);
    expect(canAssignRole(chiefState, chiefState, "STATE_CURATOR").allowed).toBe(false);
  });
  it("Chief Curator cannot change roles on a peer Chief Curator", () => {
    expect(canAssignRole(chiefState, chiefCrime, "STATE_CURATOR").allowed).toBe(false);
  });
  it("Head Admin cannot modify roles of an Executive Director", () => {
    expect(canAssignRole(headAdmin, executive, "SUPPORT_CURATOR").allowed).toBe(false);
  });
  it("canChangeRoles rejects a diff containing any disallowed role", () => {
    const target = user("SERVER_ADMIN");
    expect(canChangeRoles(chiefState, target, ["SERVER_ADMIN", "STATE_CURATOR"]).allowed).toBe(true);
    expect(canChangeRoles(chiefState, target, ["SERVER_ADMIN", "STATE_CURATOR", "CRIME_CURATOR"]).allowed).toBe(false);
    expect(canChangeRoles(chiefState, target, []).allowed).toBe(false);
  });
  it("account creation is limited to assignable roles", () => {
    expect(canCreateAccountWithRoles(chiefState, ["SERVER_ADMIN"]).allowed).toBe(true);
    expect(canCreateAccountWithRoles(chiefState, ["SERVER_ADMIN", "STATE_CURATOR"]).allowed).toBe(true);
    expect(canCreateAccountWithRoles(chiefState, ["SERVER_ADMIN", "HEAD_ADMIN"]).allowed).toBe(false);
    expect(canCreateAccountWithRoles(stateCurator, ["SERVER_ADMIN"]).allowed).toBe(false);
    expect(canCreateAccountWithRoles(headAdmin, ["EXECUTIVE_DIRECTOR"]).allowed).toBe(false);
  });
});

describe("account management hierarchy", () => {
  it("nobody below can delete or modify an Executive Director", () => {
    for (const actor of [headAdmin, chiefState, chiefCrime, stateCurator, supportCurator]) {
      for (const action of ["update", "disable", "delete", "password.reset"] as const) {
        expect(canManageUser(actor, executive, action).allowed).toBe(false);
      }
    }
  });
  it("Executive Director can delete a Head Admin", () => {
    expect(canManageUser(executive, headAdmin, "delete").allowed).toBe(true);
  });
  it("Head Admin cannot delete another Head Admin", () => {
    expect(canManageUser(headAdmin, user("HEAD_ADMIN", "SERVER_ADMIN"), "delete").allowed).toBe(false);
  });
  it("Chief State Curator can delete a State Curator but not a Crime Curator", () => {
    expect(canManageUser(chiefState, stateCurator, "delete").allowed).toBe(true);
    expect(canManageUser(chiefState, crimeCurator, "delete").allowed).toBe(false);
    expect(canManageUser(chiefState, supportCurator, "delete").allowed).toBe(false);
  });
  it("Chief Curators cannot edit basic info (admins.update not granted)", () => {
    expect(canManageUser(chiefState, serverAdmin, "update").allowed).toBe(false);
  });
  it("no one can delete their own account", () => {
    expect(canManageUser(executive, executive, "delete").allowed).toBe(false);
  });
  it("curators and server admins cannot manage anyone", () => {
    expect(canManageUser(stateCurator, serverAdmin, "delete").allowed).toBe(false);
    expect(canManageUser(serverAdmin, user("SERVER_ADMIN"), "disable").allowed).toBe(false);
  });
  it("authority level is the max across roles", () => {
    expect(authorityLevel(["SERVER_ADMIN", "STATE_CURATOR"])).toBe(40);
    expect(authorityLevel(["SERVER_ADMIN", "HEAD_ADMIN"])).toBe(80);
    expect(authorityLevel(["NOT_A_ROLE"])).toBe(0);
  });
});

describe("interviews, question bank and audit", () => {
  it("only Executive Director and Head Admin can delete interviews", () => {
    expect(canDeleteInterview(executive)).toBe(true);
    expect(canDeleteInterview(headAdmin)).toBe(true);
    for (const p of [chiefState, chiefCrime, stateCurator, crimeCurator, supportCurator, serverAdmin]) {
      expect(canDeleteInterview(p)).toBe(false);
    }
  });
  it("interview visibility follows interview category or ownership", () => {
    expect(canViewInterview(stateCurator, { interviewType: "STATE", interviewerId: "other" })).toBe(true);
    expect(canViewInterview(stateCurator, { interviewType: "CRIME", interviewerId: "other" })).toBe(false);
    expect(canViewInterview(stateCurator, { interviewType: "CRIME", interviewerId: stateCurator.id })).toBe(true);
    expect(canViewInterview(headAdmin, { interviewType: "ADMIN", interviewerId: "other" })).toBe(true);
  });
  it("interviewer loses edit rights if their conduct permission is revoked", () => {
    const formerCurator = { id: "fc", roles: ["SERVER_ADMIN"] };
    expect(canModifyInterview(formerCurator, { interviewType: "STATE", interviewerId: "fc" })).toBe(false);
  });
  it("question bank management is scoped by category", () => {
    expect(canManageQuestions(chiefState, "STATE")).toBe(true);
    expect(canManageQuestions(chiefState, "CRIME")).toBe(false);
    expect(canManageQuestions(stateCurator, "STATE")).toBe(false);
    expect(canManageQuestions(headAdmin, "ADMIN")).toBe(true);
  });
  it("audit scopes", () => {
    expect(auditScope(executive)).toBe("ALL");
    expect(auditScope(headAdmin)).toBe("MANAGEMENT");
    expect(auditScope(chiefState)).toBe("NONE");
    expect(hasPermission(serverAdmin, "audit.view.all")).toBe(false);
  });
  it("ignores unknown role strings smuggled into a principal", () => {
    const forged = { id: "f", roles: ["SERVER_ADMIN", "SUPER_ADMIN", "root"] };
    expect(capabilities(forged).canCreateAdmins).toBe(false);
    expect(canInterviewOrganization(forged, "FIB")).toBe(false);
  });
});
