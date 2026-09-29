"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, configureApiClient, setAccessToken } from "@/lib/api-client";
import { authService } from "@/services/auth";
import type { Capabilities, SessionUser } from "@/types/api";

type Status = "restoring" | "connecting" | "authenticated" | "unauthenticated" | "unreachable";

interface AuthContextValue {
  status: Status;
  user: SessionUser | null;
  login: (identifier: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  setUser: (user: SessionUser) => void;
  refreshUser: () => Promise<void>;
  retryConnection: () => void;
  can: (capability: keyof Capabilities) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Backoff for free-tier cold starts (Render can take ~30–60s to wake). */
const RETRY_DELAYS = [2000, 3000, 5000, 8000, 10000, 12000, 15000];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<Status>("restoring");
  const [user, setUserState] = React.useState<SessionUser | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  const setUser = React.useCallback((u: SessionUser) => setUserState(u), []);

  const clearSession = React.useCallback(() => {
    setAccessToken(null);
    setUserState(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  // Wire API client events into auth state.
  React.useEffect(() => {
    configureApiClient({
      onSessionExpired: clearSession,
      onPasswordChangeRequired: () => setUserState((u) => (u ? { ...u, mustChangePassword: true } : u)),
      onTokenRefreshed: (payload) => {
        const p = payload as { user?: SessionUser };
        if (p?.user) setUserState(p.user);
      },
    });
  }, [clearSession]);

  // Restore the session from the refresh cookie, riding out cold starts.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slowTimer = setTimeout(() => !cancelled && setStatus((s) => (s === "restoring" ? "connecting" : s)), 1200);

    const tryRestore = async (n: number) => {
      try {
        const data = await authService.restore();
        if (cancelled) return;
        setUserState(data.user);
        setStatus("authenticated");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.isNetwork) {
          if (n < RETRY_DELAYS.length) {
            setStatus("connecting");
            timer = setTimeout(() => tryRestore(n + 1), RETRY_DELAYS[n]);
          } else {
            setStatus("unreachable");
          }
          return;
        }
        if (err instanceof ApiError && err.status >= 500) {
          setStatus("unreachable");
          return;
        }
        setStatus("unauthenticated");
      } finally {
        clearTimeout(slowTimer);
      }
    };
    tryRestore(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  const login = React.useCallback(async (identifier: string, password: string) => {
    const data = await authService.login(identifier, password);
    setUserState(data.user);
    setStatus("authenticated");
    return data.user;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Even if the network call fails, clear local state.
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = React.useCallback(async () => {
    const me = await authService.me();
    setUserState(me);
  }, []);

  const retryConnection = React.useCallback(() => {
    setStatus("restoring");
    setAttempt((a) => a + 1);
  }, []);

  const can = React.useCallback((c: keyof Capabilities) => !!user?.capabilities?.[c], [user]);

  const value = React.useMemo(
    () => ({ status, user, login, logout, setUser, refreshUser, retryConnection, can }),
    [status, user, login, logout, setUser, refreshUser, retryConnection, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
