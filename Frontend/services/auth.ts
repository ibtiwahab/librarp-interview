import { http, refreshSession, setAccessToken } from "@/lib/api-client";
import type { AuthPayload, SessionUser } from "@/types/api";

export const authService = {
  async login(identifier: string, password: string): Promise<AuthPayload> {
    const data = await http.post<AuthPayload>("/auth/login", { identifier, password }, { noRefresh: true, timeoutMs: 60_000 });
    setAccessToken(data.accessToken);
    return data;
  },
  async restore(): Promise<AuthPayload> {
    return (await refreshSession()) as AuthPayload;
  },
  async logout(): Promise<void> {
    try {
      await http.post("/auth/logout", undefined, { noRefresh: true });
    } finally {
      setAccessToken(null);
    }
  },
  me: () => http.get<SessionUser>("/auth/me"),
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthPayload> {
    const data = await http.post<AuthPayload>("/auth/change-password", { currentPassword, newPassword });
    setAccessToken(data.accessToken);
    return data;
  },
};
