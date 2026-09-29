import { http } from "@/lib/api-client";
import type {
  AppSettings,
  AuditLogEntry,
  DashboardData,
  Organization,
  OrganizationCode,
  OrganizationsResponse,
  Paginated,
} from "@/types/api";

export const organizationsService = {
  list: (includeInactive = false) =>
    http.get<OrganizationsResponse>("/organizations", { includeInactive: includeInactive ? "true" : undefined }),
  update: (
    code: OrganizationCode,
    input: Partial<Pick<Organization, "name" | "shortName" | "description" | "logo" | "color" | "defaultPosition" | "active">>,
  ) => http.patch<Organization>(`/organizations/${code}`, input),
};

export const settingsService = {
  get: () => http.get<AppSettings>("/settings"),
  update: (input: Partial<AppSettings>) => http.patch<AppSettings>("/settings", input),
};

export const dashboardService = {
  get: () => http.get<DashboardData>("/dashboard"),
};

export interface AuditListParams {
  category?: string;
  action?: string;
  search?: string;
  from?: string;
  to?: string;
  actor?: string;
  targetId?: string;
  page?: number;
  limit?: number;
}

export const auditService = {
  list: (params: AuditListParams) =>
    http.get<Paginated<AuditLogEntry> & { scope: "ALL" | "MANAGEMENT" }>("/audit-logs", { ...params }),
  meta: () => http.get<{ actions: string[]; categories: string[] }>("/audit-logs/meta"),
};
