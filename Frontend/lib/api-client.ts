/**
 * Thin fetch wrapper for the Libra RP API.
 *
 * - Access token lives in memory only; the refresh token is an httpOnly cookie.
 * - A 401 triggers ONE shared refresh attempt, then the request is retried.
 * - Errors are normalised to ApiError with the backend's code + message.
 * - Generous timeouts tolerate free-tier (Render) cold starts.
 */

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
export const API_BASE = `${RAW_BASE.replace(/\/+$/, "")}/api`;

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "TOKEN_EXPIRED"
  | "SESSION_EXPIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | string;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: { fieldErrors?: Record<string, string[]>; [k: string]: unknown };

  constructor(status: number, code: ApiErrorCode, message: string, details?: ApiError["details"]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetwork() {
    return this.code === "NETWORK_ERROR" || this.code === "TIMEOUT";
  }

  fieldError(field: string): string | undefined {
    return this.details?.fieldErrors?.[field]?.[0];
  }
}

export function errorMessage(err: unknown, fallback = "Something unexpected happened. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

let accessToken: string | null = null;
let refreshPromise: Promise<RefreshPayload> | null = null;

export interface RefreshPayload {
  accessToken: string;
  user: unknown;
}

type Listener = {
  onSessionExpired?: () => void;
  onPasswordChangeRequired?: () => void;
  onTokenRefreshed?: (payload: unknown) => void;
};
const listeners: Listener = {};

export function configureApiClient(l: Listener) {
  Object.assign(listeners, l);
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skip the automatic refresh-and-retry on 401. */
  noRefresh?: boolean;
  /** Keep the request alive on page unload (autosave flush). */
  keepalive?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), opts.timeoutMs ?? 45_000);
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const headers: Record<string, string> = { "X-Requested-With": "librarp" };
  if (!isForm && opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      credentials: "include",
      signal: controller.signal,
      keepalive: opts.keepalive,
      cache: "no-store",
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    if ((err as Error)?.name === "AbortError" || (err as Error)?.name === "TimeoutError" || controller.signal.aborted) {
      throw new ApiError(0, "TIMEOUT", "Libra RP services took too long to respond. They may be waking up — please try again in a moment.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach Libra RP services. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // fall through
    }
  }
  if (res.ok) {
    return (json as { data: T })?.data as T;
  }
  const err = (json as { error?: { code?: string; message?: string; details?: ApiError["details"] } })?.error;
  const fallback =
    res.status >= 500
      ? "The Libra RP server hit an error. Please try again shortly."
      : res.status === 404
        ? "The requested resource was not found."
        : `Request failed (${res.status}).`;
  throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? fallback, err?.details);
}

/** Exchanges the httpOnly refresh cookie for a fresh access token (single-flight). */
export function refreshSession(): Promise<RefreshPayload> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await rawRequest("/auth/refresh", { method: "POST", noRefresh: true, timeoutMs: 60_000 });
        const data = await parse<RefreshPayload>(res);
        accessToken = data.accessToken;
        listeners.onTokenRefreshed?.(data);
        return data;
      } catch (err) {
        if (err instanceof ApiError && !err.isNetwork) accessToken = null;
        throw err;
      } finally {
        setTimeout(() => (refreshPromise = null), 0);
      }
    })();
  }
  return refreshPromise;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, opts);

  if (res.status === 401 && !opts.noRefresh) {
    try {
      await refreshSession();
    } catch (err) {
      if (err instanceof ApiError && !err.isNetwork) listeners.onSessionExpired?.();
      throw err instanceof ApiError && !err.isNetwork
        ? new ApiError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.")
        : err;
    }
    res = await rawRequest(path, opts);
  }

  try {
    return await parse<T>(res);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "PASSWORD_CHANGE_REQUIRED") listeners.onPasswordChangeRequired?.();
      if (err.status === 401 && !opts.noRefresh) listeners.onSessionExpired?.();
    }
    throw err;
  }
}

export const http = {
  get: <T>(path: string, query?: RequestOptions["query"], opts?: Omit<RequestOptions, "query" | "method">) =>
    api<T>(path, { ...opts, query, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body" | "method">) =>
    api<T>(path, { ...opts, body, method: "POST" }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body" | "method">) =>
    api<T>(path, { ...opts, body, method: "PATCH" }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body" | "method">) =>
    api<T>(path, { ...opts, body, method: "PUT" }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method">) => api<T>(path, { ...opts, method: "DELETE" }),
};
