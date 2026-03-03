import { describe, expect, it } from "vitest";

import { buildDegradedOAuthStatus } from "./status-response.ts";

describe("buildDegradedOAuthStatus", () => {
  it("builds diagnostic payload with provider fallbacks", () => {
    const payload = buildDegradedOAuthStatus(
      {
        header: (name: string) => (name.toLowerCase() === "x-request-id" ? "req-123" : undefined),
      } as any,
      new Error("db locked"),
    );

    expect(payload.storageReady).toBe(false);
    expect(payload.degraded).toBe(true);
    expect(payload.error.errorCode).toBe("oauth_status_unavailable");
    expect(payload.error.requestId).toBe("req-123");

    const copilot = payload.providers["github-copilot"];
    expect(copilot.connected).toBe(false);
    expect(copilot.errorCode).toBe("oauth_status_unavailable");
    expect(copilot.errorHint).toContain("OAUTH_ENCRYPTION_SECRET");
    expect(Array.isArray(copilot.accounts)).toBe(true);
  });
});
