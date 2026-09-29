/**
 * Organization catalogue. Codes are the stable identifiers used everywhere
 * (database, API, permissions). Display metadata can be overridden per
 * deployment through the Organization collection (logo, description, active).
 */

export const INTERVIEW_TYPES = ["STATE", "CRIME", "ADMIN"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  STATE: "State Leadership",
  CRIME: "Crime Leadership",
  ADMIN: "Admin",
};

export const ORGANIZATION_CODES = [
  "LSPD",
  "SAHP",
  "GOV",
  "EMS",
  "FIB",
  "FAMILIES",
  "BALLAS",
  "MARABUNTA",
  "VAGOS",
  "BLOODS",
  "SERVER_ADMIN",
] as const;
export type OrganizationCode = (typeof ORGANIZATION_CODES)[number];

export interface OrganizationConfig {
  code: OrganizationCode;
  name: string;
  shortName: string;
  category: InterviewType;
  description: string;
  /** Public path (served by the frontend) or absolute URL. Empty = generated emblem. */
  logo: string;
  /** Accent used by generated emblems. */
  color: string;
  defaultPosition: string;
  order: number;
  active: boolean;
}

export const ORGANIZATIONS: readonly OrganizationConfig[] = [
  {
    code: "LSPD",
    name: "Los Santos Police Department",
    shortName: "LSPD",
    category: "STATE",
    description: "City law enforcement for Los Santos.",
    logo: "",
    color: "#4a6fa5",
    defaultPosition: "Chief of Police",
    order: 1,
    active: true,
  },
  {
    code: "SAHP",
    name: "San Andreas Highway Patrol",
    shortName: "SAHP",
    category: "STATE",
    description: "State highway and county law enforcement.",
    logo: "",
    color: "#b08d3c",
    defaultPosition: "Commissioner",
    order: 2,
    active: true,
  },
  {
    code: "GOV",
    name: "Government",
    shortName: "GOV",
    category: "STATE",
    description: "San Andreas state government and administration.",
    logo: "",
    color: "#8a8f98",
    defaultPosition: "Governor",
    order: 3,
    active: true,
  },
  {
    code: "EMS",
    name: "Emergency Medical Services",
    shortName: "EMS",
    category: "STATE",
    description: "Medical response and hospital services.",
    logo: "",
    color: "#c0504d",
    defaultPosition: "EMS Director",
    order: 4,
    active: true,
  },
  {
    code: "FIB",
    name: "Federal Investigation Bureau",
    shortName: "FIB",
    category: "STATE",
    description: "Federal investigations and organised crime taskforce.",
    logo: "",
    color: "#5b6b7f",
    defaultPosition: "FIB Director",
    order: 5,
    active: true,
  },
  {
    code: "FAMILIES",
    name: "Families",
    shortName: "Families",
    category: "CRIME",
    description: "Grove Street Families.",
    logo: "",
    color: "#3f8f55",
    defaultPosition: "Gang Leader",
    order: 10,
    active: true,
  },
  {
    code: "BALLAS",
    name: "Ballas",
    shortName: "Ballas",
    category: "CRIME",
    description: "Ballas street gang.",
    logo: "",
    color: "#7d4fa0",
    defaultPosition: "Gang Leader",
    order: 11,
    active: true,
  },
  {
    code: "MARABUNTA",
    name: "Marabunta Grande",
    shortName: "Marabunta",
    category: "CRIME",
    description: "Marabunta Grande street gang.",
    logo: "",
    color: "#3d7ea6",
    defaultPosition: "Gang Leader",
    order: 12,
    active: true,
  },
  {
    code: "VAGOS",
    name: "Vagos",
    shortName: "Vagos",
    category: "CRIME",
    description: "Los Santos Vagos street gang.",
    logo: "",
    color: "#c9a227",
    defaultPosition: "Gang Leader",
    order: 13,
    active: true,
  },
  {
    code: "BLOODS",
    name: "Bloods",
    shortName: "Bloods",
    category: "CRIME",
    description: "Bloods street gang.",
    logo: "",
    color: "#a83a3a",
    defaultPosition: "Gang Leader",
    order: 14,
    active: true,
  },
  {
    code: "SERVER_ADMIN",
    name: "Server Administration",
    shortName: "Server Admin",
    category: "ADMIN",
    description: "Libra RP server administration team.",
    logo: "",
    color: "#c9a45c",
    defaultPosition: "Server Admin",
    order: 20,
    active: true,
  },
];

const BY_CODE = new Map(ORGANIZATIONS.map((o) => [o.code, o]));

export function getOrganizationConfig(code: string): OrganizationConfig | undefined {
  return BY_CODE.get(code as OrganizationCode);
}

export function organizationCategory(code: string): InterviewType | undefined {
  return BY_CODE.get(code as OrganizationCode)?.category;
}

export function isOrganizationCode(value: unknown): value is OrganizationCode {
  return typeof value === "string" && BY_CODE.has(value as OrganizationCode);
}
