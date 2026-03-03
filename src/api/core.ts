const base = "";
const SESSION_BOOTSTRAP_PATH = "/api/auth/session";
const API_AUTH_TOKEN_SESSION_KEY = "claw_api_auth_token";
const API_CSRF_TOKEN_SESSION_KEY = "claw_api_csrf_token";
const POST_RETRY_LIMIT = 2;
const POST_TIMEOUT_MS = 12_000;
const POST_BACKOFF_BASE_MS = 250;
const POST_BACKOFF_MAX_MS = 2_000;
let runtimeApiAuthToken: string | undefined;
let runtimeCsrfToken: string | undefined;
let sessionBootstrapPromise: Promise<boolean> | null = null;

export function __resetApiRuntimeForTests(): void {
  runtimeApiAuthToken = undefined;
  runtimeCsrfToken = undefined;
  sessionBootstrapPromise = null;
}

export class ApiRequestError extends Error {
  status: number;
  code: string | null;
  details: unknown;
  url: string;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string | null;
      details?: unknown;
      url: string;
    },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = typeof options.code === "string" ? options.code : null;
    this.details = options.details;
    this.url = options.url;
  }
}

export function isApiRequestError(err: unknown): err is ApiRequestError {
  return err instanceof ApiRequestError;
}

function normalizeApiAuthToken(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeCsrfToken(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function readStoredApiAuthToken(): string {
  if (runtimeApiAuthToken !== undefined) return runtimeApiAuthToken;
  if (typeof window === "undefined") {
    runtimeApiAuthToken = "";
    return runtimeApiAuthToken;
  }
  try {
    runtimeApiAuthToken = normalizeApiAuthToken(window.sessionStorage.getItem(API_AUTH_TOKEN_SESSION_KEY));
  } catch {
    runtimeApiAuthToken = "";
  }
  return runtimeApiAuthToken;
}

function writeStoredApiAuthToken(token: string): void {
  runtimeApiAuthToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.sessionStorage.setItem(API_AUTH_TOKEN_SESSION_KEY, token);
    } else {
      window.sessionStorage.removeItem(API_AUTH_TOKEN_SESSION_KEY);
    }
  } catch {
    // ignore storage write errors
  }
}

function readStoredCsrfToken(): string {
  if (runtimeCsrfToken !== undefined) return runtimeCsrfToken;
  if (typeof window === "undefined") {
    runtimeCsrfToken = "";
    return runtimeCsrfToken;
  }
  try {
    runtimeCsrfToken = normalizeCsrfToken(window.sessionStorage.getItem(API_CSRF_TOKEN_SESSION_KEY));
  } catch {
    runtimeCsrfToken = "";
  }
  return runtimeCsrfToken;
}

function writeStoredCsrfToken(token: string): void {
  runtimeCsrfToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.sessionStorage.setItem(API_CSRF_TOKEN_SESSION_KEY, token);
    } else {
      window.sessionStorage.removeItem(API_CSRF_TOKEN_SESSION_KEY);
    }
  } catch {
    // ignore storage write errors
  }
}

function promptForApiAuthToken(hasExistingToken: boolean): string {
  if (typeof window === "undefined") return "";
  const promptText = hasExistingToken
    ? "Stored API token was rejected. Enter a new API token:"
    : "Enter API token for this server:";
  return normalizeApiAuthToken(window.prompt(promptText));
}

export function setApiAuthToken(token?: string | null): void {
  writeStoredApiAuthToken(normalizeApiAuthToken(token));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeIdempotencyKey(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "AbortError";
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function backoffDelayMs(attempt: number): number {
  const exponential = Math.min(POST_BACKOFF_BASE_MS * 2 ** attempt, POST_BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * 120);
  return exponential + jitter;
}

export async function postWithIdempotency<T>(
  url: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
  canRetryAuth = true,
): Promise<T> {
  const payload = { ...body, idempotency_key: idempotencyKey };
  const baseHeaders: HeadersInit = {
    "content-type": "application/json",
    "x-idempotency-key": idempotencyKey,
  };

  for (let attempt = 0; attempt <= POST_RETRY_LIMIT; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);

    try {
      const headers = withAuthHeaders(baseHeaders, "POST");
      const requestUrl = `${base}${url}`;
      const r = await fetch(requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: "same-origin",
      });
      if (r.status === 401 && canRetryAuth && url !== SESSION_BOOTSTRAP_PATH) {
        await bootstrapSession({ force: true });
        return postWithIdempotency<T>(url, body, idempotencyKey, false);
      }
      if (r.ok) {
        return r.json();
      }

      const responseBody = await r.json().catch(() => null);
      const errCode = typeof responseBody?.error === "string" ? responseBody.error : null;
      const errMsg = errCode ?? responseBody?.message ?? `Request failed: ${r.status}`;
      if (attempt < POST_RETRY_LIMIT && shouldRetryStatus(r.status)) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      throw new ApiRequestError(errMsg, {
        status: r.status,
        code: errCode,
        details: responseBody,
        url: requestUrl,
      });
    } catch (err) {
      const retryableNetworkError = err instanceof TypeError || isAbortError(err);
      if (attempt < POST_RETRY_LIMIT && retryableNetworkError) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("unreachable_retry_loop");
}

export function extractMessageId(payload: unknown): string {
  const maybePayload = payload as {
    id?: unknown;
    message?: { id?: unknown };
  } | null;
  if (maybePayload && typeof maybePayload.id === "string" && maybePayload.id) {
    return maybePayload.id;
  }
  if (maybePayload?.message && typeof maybePayload.message.id === "string" && maybePayload.message.id) {
    return maybePayload.message.id;
  }
  throw new Error("message_id_missing");
}

function isMutationMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

function withAuthHeaders(init?: HeadersInit, method?: string): Headers {
  const headers = new Headers(init);
  const runtimeToken = readStoredApiAuthToken();
  if (runtimeToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${runtimeToken}`);
  }
  const csrfToken = readStoredCsrfToken();
  if (csrfToken && isMutationMethod(method) && !headers.has("x-csrf-token")) {
    headers.set("x-csrf-token", csrfToken);
  }
  return headers;
}

async function doBootstrapSession(promptOnUnauthorized: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${base}${SESSION_BOOTSTRAP_PATH}`, {
      method: "GET",
      headers: withAuthHeaders(),
      credentials: "same-origin",
    });
    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as { csrf_token?: unknown } | null;
      const csrfToken = normalizeCsrfToken(typeof payload?.csrf_token === "string" ? payload.csrf_token : "");
      writeStoredCsrfToken(csrfToken);
      return true;
    }
    if (response.status === 401 && promptOnUnauthorized) {
      const nextToken = promptForApiAuthToken(Boolean(readStoredApiAuthToken()));
      if (nextToken) {
        writeStoredApiAuthToken(nextToken);
        return doBootstrapSession(false);
      }
    }
  } catch {
    // ignore bootstrap failures; main request will surface any errors
  }
  return false;
}

export async function bootstrapSession(options?: {
  promptOnUnauthorized?: boolean;
  force?: boolean;
}): Promise<boolean> {
  const force = options?.force === true;
  if (!force && readStoredCsrfToken()) return true;
  const promptOnUnauthorized = options?.promptOnUnauthorized ?? true;
  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = doBootstrapSession(promptOnUnauthorized).finally(() => {
      sessionBootstrapPromise = null;
    });
  }
  return sessionBootstrapPromise;
}

export async function request<T>(url: string, init?: RequestInit, canRetryAuth = true): Promise<T> {
  const headers = withAuthHeaders(init?.headers, init?.method);
  const requestUrl = `${base}${url}`;
  const r = await fetch(requestUrl, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  if (r.status === 401 && canRetryAuth && url !== SESSION_BOOTSTRAP_PATH) {
    await bootstrapSession({ force: true });
    return request<T>(url, init, false);
  }
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    const errorCode = typeof body?.error === "string" ? body.error : null;
    throw new ApiRequestError(errorCode ?? body?.message ?? `Request failed: ${r.status}`, {
      status: r.status,
      code: errorCode,
      details: body,
      url: requestUrl,
    });
  }
  return r.json();
}

export function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function patch<T = unknown>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function put<T = unknown>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function del<T = unknown>(url: string): Promise<T> {
  return request<T>(url, { method: "DELETE" });
}
