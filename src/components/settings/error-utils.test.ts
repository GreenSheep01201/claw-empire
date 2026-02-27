import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../api/core";
import { toSettingsSectionError } from "./error-utils";

describe("toSettingsSectionError", () => {
  it("maps oauth_status_unavailable to actionable hint", () => {
    const err = new ApiRequestError("oauth failed", {
      status: 500,
      code: "oauth_status_unavailable",
      url: "/api/oauth/status",
    });

    const mapped = toSettingsSectionError("oauth", err);
    expect(mapped.errorCode).toBe("oauth_status_unavailable");
    expect(mapped.message).toContain("OAuth status");
    expect(mapped.actionHint).toContain("OAUTH_ENCRYPTION_SECRET");
    expect(mapped.recoverable).toBe(true);
  });

  it("maps auth failures to localhost guidance", () => {
    const err = new ApiRequestError("unauthorized", {
      status: 401,
      code: "unauthorized",
      url: "/api/settings",
    });

    const mapped = toSettingsSectionError("settings", err);
    expect(mapped.message).toContain("Authentication failed");
    expect(mapped.actionHint).toContain("127.0.0.1/localhost");
  });

  it("returns fallback message for unknown non-api errors", () => {
    const mapped = toSettingsSectionError("cli", new Error("boom"));
    expect(mapped.errorCode).toBeNull();
    expect(mapped.message).toContain("Failed to load CLI status");
    expect(mapped.actionHint).toContain("Refresh");
  });
});

