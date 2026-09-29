import { http } from "@/lib/api-client";
import type { AdminDetail, AdminListItem, Paginated, Role, RoleCatalogueEntry } from "@/types/api";

export interface AdminListParams {
  search?: string;
  role?: Role | "";
  status?: "active" | "disabled" | "all";
  page?: number;
  limit?: number;
  sort?: string;
}

export interface CreateAdminInput {
  username: string;
  displayName?: string;
  password?: string;
  roles: Role[];
}

export const adminsService = {
  list: (params: AdminListParams) => http.get<Paginated<AdminListItem>>("/admins", { ...params }),
  get: (id: string) => http.get<AdminDetail>(`/admins/${id}`),
  create: (input: CreateAdminInput) =>
    http.post<{ admin: AdminDetail; temporaryPassword: string | null }>("/admins", input),
  update: (id: string, input: Partial<Pick<AdminDetail, "username" | "displayName" | "discordId">>) =>
    http.patch<AdminDetail>(`/admins/${id}`, input),
  setRoles: (id: string, roles: Role[]) => http.put<AdminDetail>(`/admins/${id}/roles`, { roles }),
  disable: (id: string) => http.post<AdminDetail>(`/admins/${id}/disable`),
  enable: (id: string) => http.post<AdminDetail>(`/admins/${id}/enable`),
  resetPassword: (id: string, password?: string) =>
    http.post<{ temporaryPassword: string | null }>(`/admins/${id}/reset-password`, password ? { password } : {}),
  remove: (id: string) => http.delete<{ deleted: true }>(`/admins/${id}`),
  roles: () => http.get<RoleCatalogueEntry[]>("/roles"),
};
