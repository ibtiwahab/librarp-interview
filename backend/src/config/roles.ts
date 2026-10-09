/**
 * Centralised role & permission configuration.
 *
 * Everything that decides "who may do what" lives here. Controllers and services
 * never compare role names directly — they ask the authorization service, which
 * reads from these tables. To change the hierarchy, edit this file only.
 */

export const ROLES = [
  "EXECUTIVE_DIRECTOR",
  "HEAD_ADMIN",
  "CHIEF_CURATOR_STATE",
  "CHIEF_CURATOR_CRIME",
  "STATE_CURATOR",
  "CRIME_CURATOR",
  "SUPPORT_CURATOR",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // Interviews
  "interviews.conduct.state",
  "interviews.conduct.crime",
  "interviews.conduct.admin",
  "interviews.view.all",
  "interviews.manage.all",
  "interviews.delete",
  // Administrator accounts
  "admins.view",
  "admins.create",
  "admins.update",
  "admins.disable",
  "admins.delete",
  "admins.password.reset",
  "roles.assign",
  // Question bank
  "questions.manage.state",
  "questions.manage.crime",
  "questions.manage.admin",
  // Oversight
  "audit.view.all",
  "audit.view.management",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface RoleDefinition {
  role: Role;
  label: string;
  shortLabel: string;
  description: string;
  /** Numeric authority. A user's level is the max over their roles. */
  level: number;
  permissions: readonly Permission[];
  /** Roles this role may add to / remove from other accounts. */
  assignableRoles: readonly Role[];
  /**
   * Accounts whose roles are ALL inside this set (and whose level is strictly
   * lower) can be edited, disabled, deleted or have their password reset.
   */
  manageableRoles: readonly Role[];
}

const ALL_PERMISSIONS = PERMISSIONS;

const BELOW_EXECUTIVE: Role[] = [
  "HEAD_ADMIN",
  "CHIEF_CURATOR_STATE",
  "CHIEF_CURATOR_CRIME",
  "STATE_CURATOR",
  "CRIME_CURATOR",
  "SUPPORT_CURATOR",
];

const BELOW_HEAD_ADMIN: Role[] = [
  "CHIEF_CURATOR_STATE",
  "CHIEF_CURATOR_CRIME",
  "STATE_CURATOR",
  "CRIME_CURATOR",
  "SUPPORT_CURATOR",
];

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  EXECUTIVE_DIRECTOR: {
    role: "EXECUTIVE_DIRECTOR",
    label: "Executive Director",
    shortLabel: "Exec. Director",
    description: "Highest authority. Full control over interviews, staff, question bank and audit history.",
    level: 100,
    permissions: ALL_PERMISSIONS,
    // Executive Director is never assignable through the application —
    // it is only created through the secure bootstrap script.
    assignableRoles: BELOW_EXECUTIVE,
    manageableRoles: BELOW_EXECUTIVE,
  },
  HEAD_ADMIN: {
    role: "HEAD_ADMIN",
    label: "Head Admin",
    shortLabel: "Head Admin",
    description: "Runs server administration. Conducts every interview type and manages staff below Head Admin.",
    level: 80,
    permissions: [
      "interviews.conduct.state",
      "interviews.conduct.crime",
      "interviews.conduct.admin",
      "interviews.view.all",
      "interviews.manage.all",
      "interviews.delete",
      "admins.view",
      "admins.create",
      "admins.update",
      "admins.disable",
      "admins.delete",
      "admins.password.reset",
      "roles.assign",
      "questions.manage.state",
      "questions.manage.crime",
      "questions.manage.admin",
      "audit.view.management",
      "settings.manage",
    ],
    // Strictly below own level: a Head Admin cannot mint peers or Executive Directors.
    assignableRoles: BELOW_HEAD_ADMIN,
    manageableRoles: BELOW_HEAD_ADMIN,
  },
  CHIEF_CURATOR_STATE: {
    role: "CHIEF_CURATOR_STATE",
    label: "Chief Curator of State",
    shortLabel: "Chief · State",
    description: "Leads State leadership interviewing. Manages State Curators and the State question bank.",
    level: 60,
    permissions: [
      "interviews.conduct.state",
      "admins.view",
      "admins.create",
      "admins.disable",
      "admins.delete",
      "admins.password.reset",
      "roles.assign",
      "questions.manage.state",
    ],
    assignableRoles: ["STATE_CURATOR"],
    manageableRoles: ["STATE_CURATOR"],
  },
  CHIEF_CURATOR_CRIME: {
    role: "CHIEF_CURATOR_CRIME",
    label: "Chief Curator of Crime",
    shortLabel: "Chief · Crime",
    description: "Leads Crime leadership interviewing. Manages Crime Curators and the Crime question bank.",
    level: 60,
    permissions: [
      "interviews.conduct.crime",
      "admins.view",
      "admins.create",
      "admins.disable",
      "admins.delete",
      "admins.password.reset",
      "roles.assign",
      "questions.manage.crime",
    ],
    assignableRoles: ["CRIME_CURATOR"],
    manageableRoles: ["CRIME_CURATOR"],
  },
  STATE_CURATOR: {
    role: "STATE_CURATOR",
    label: "State Curator",
    shortLabel: "State Curator",
    description: "Conducts State leadership interviews (LSPD, SAHP, GOV, EMS, FIB) and manages the State question bank.",
    level: 40,
    permissions: ["interviews.conduct.state", "questions.manage.state"],
    assignableRoles: [],
    manageableRoles: [],
  },
  CRIME_CURATOR: {
    role: "CRIME_CURATOR",
    label: "Crime Curator",
    shortLabel: "Crime Curator",
    description: "Conducts Crime leadership interviews (Families, Ballas, Marabunta, Vagos, Bloods) and manages the Crime question bank.",
    level: 40,
    permissions: ["interviews.conduct.crime", "questions.manage.crime"],
    assignableRoles: [],
    manageableRoles: [],
  },
  SUPPORT_CURATOR: {
    role: "SUPPORT_CURATOR",
    label: "Support Curator",
    shortLabel: "Support Curator",
    description: "Conducts Admin interviews (Admin Assistant and Server Admin) and manages the Admin question bank.",
    level: 40,
    permissions: ["interviews.conduct.admin", "questions.manage.admin"],
    assignableRoles: [],
    manageableRoles: [],
  },
};

/**
 * Roles that no longer exist. They are stripped from accounts on startup but may
 * still appear in historical role-change records.
 */
export const RETIRED_ROLES: Record<string, string> = {
  SERVER_ADMIN: "Server Admin (retired role)",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
