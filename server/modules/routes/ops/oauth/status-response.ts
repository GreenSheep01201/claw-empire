import type { Request } from "express";

import { logRouteError, resolveRouteRequestId } from "../../shared/route-error.ts";

const OAUTH_STATUS_HINT =
  "OAuth status degraded. Verify OAUTH_ENCRYPTION_SECRET, runtime DB write access, and stored OAuth account integrity.";

type OAuthProviderFallback = {
  connected: boolean;
  detected: boolean;
  executionReady: boolean;
  requiresWebOAuth: boolean;
  source: string | null;
  email: string | null;
  scope: string | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
  webConnectable: boolean;
  hasRefreshToken: boolean;
  lastRefreshed: number | null;
  activeAccountId: string | null;
  activeAccountIds: string[];
  accounts: unknown[];
  errorCode: string;
  errorHint: string;
};

function buildProviderFallback(): OAuthProviderFallback {
  return {
    connected: false,
    detected: false,
    executionReady: false,
    requiresWebOAuth: false,
    source: null,
    email: null,
    scope: null,
    expires_at: null,
    created_at: 0,
    updated_at: 0,
    webConnectable: true,
    hasRefreshToken: false,
    lastRefreshed: null,
    activeAccountId: null,
    activeAccountIds: [],
    accounts: [],
    errorCode: "oauth_status_unavailable",
    errorHint: OAUTH_STATUS_HINT,
  };
}

export function buildDegradedOAuthStatus(req: Pick<Request, "header">, err: unknown) {
  const requestId = resolveRouteRequestId(req);
  logRouteError({
    requestId,
    route: "/api/oauth/status",
    errorCode: "oauth_status_unavailable",
    hint: OAUTH_STATUS_HINT,
    err,
  });

  return {
    storageReady: false,
    degraded: true,
    error: {
      errorCode: "oauth_status_unavailable",
      requestId,
      hint: OAUTH_STATUS_HINT,
    },
    providers: {
      "github-copilot": buildProviderFallback(),
      antigravity: buildProviderFallback(),
    },
  };
}

