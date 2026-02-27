import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { registerCliStatusRoute } from "./cli-status-route.ts";

describe("registerCliStatusRoute", () => {
  it("returns fresh detection data and caches it", async () => {
    const app = express();
    const detectAllCli = vi.fn().mockResolvedValue({
      claude: { installed: true, version: "1.0.0", authenticated: true, authHint: "Run: claude login" },
    });
    let cache: { data: Record<string, unknown>; loadedAt: number } | null = null;

    registerCliStatusRoute({
      app,
      cliStatusTtlMs: 30_000,
      cliTools: [{ name: "claude", authHint: "Run: claude login" }],
      detectAllCli,
      getCachedCliStatus: () => cache as any,
      setCachedCliStatus: (next) => {
        cache = next as any;
      },
    });

    const res = await request(app).get("/api/cli-status");
    expect(res.status).toBe(200);
    expect(res.body.providers?.claude?.installed).toBe(true);
    expect(detectAllCli).toHaveBeenCalledTimes(1);
    expect(cache).not.toBeNull();
  });

  it("returns degraded 200 payload when detection fails", async () => {
    const app = express();
    const detectAllCli = vi.fn().mockRejectedValue(new Error("spawn failed"));
    let cache: { data: Record<string, unknown>; loadedAt: number } | null = {
      data: {
        codex: { installed: true, version: "0.9.0", authenticated: false, authHint: "Run: codex auth login" },
      },
      loadedAt: Date.now(),
    };

    registerCliStatusRoute({
      app,
      cliStatusTtlMs: 30_000,
      cliTools: [
        { name: "claude", authHint: "Run: claude login" },
        { name: "codex", authHint: "Run: codex auth login" },
      ],
      detectAllCli,
      getCachedCliStatus: () => cache as any,
      setCachedCliStatus: (next) => {
        cache = next as any;
      },
    });

    const res = await request(app).get("/api/cli-status?refresh=1");
    expect(res.status).toBe(200);
    expect(res.body.degraded).toBe(true);
    expect(res.body.error?.errorCode).toBe("cli_detection_failed");
    expect(res.body.providers?.claude?.errorCode).toBe("cli_detection_failed");
    expect(res.body.providers?.codex?.installed).toBe(true);
    expect(res.body.providers?.codex?.version).toBe("0.9.0");
  });
});
