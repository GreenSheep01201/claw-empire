import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { registerOpsSettingsStatsRoutes } from "./settings-stats.ts";

describe("registerOpsSettingsStatsRoutes", () => {
  it("returns structured read error payload on sqlite failure", async () => {
    const app = express();
    app.use(express.json());
    registerOpsSettingsStatsRoutes({
      app,
      db: {
        prepare: () => {
          throw new Error("SQLITE_BUSY");
        },
      },
    } as any);

    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("settings_read_failed");
    expect(typeof res.body.requestId).toBe("string");
    expect(String(res.body.hint)).toContain("SQLite");
  });

  it("returns structured write error payload on sqlite failure", async () => {
    const app = express();
    app.use(express.json());
    registerOpsSettingsStatsRoutes({
      app,
      db: {
        prepare: () => ({
          run: () => {
            throw new Error("SQLITE_READONLY");
          },
        }),
      },
    } as any);

    const res = await request(app).put("/api/settings").send({ language: "ko" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("settings_write_failed");
    expect(typeof res.body.requestId).toBe("string");
    expect(String(res.body.hint)).toContain("permissions");
  });

  it("persists settings successfully with object payload", async () => {
    const storage = new Map<string, string>([["language", "en"]]);
    const app = express();
    app.use(express.json());
    registerOpsSettingsStatsRoutes({
      app,
      db: {
        prepare: (sql: string) => {
          if (sql.includes("SELECT key, value FROM settings")) {
            return {
              all: () => Array.from(storage.entries()).map(([key, value]) => ({ key, value })),
            };
          }
          if (sql.includes("INSERT INTO settings")) {
            return {
              run: (key: string, value: string) => {
                storage.set(key, value);
              },
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    } as any);

    const putRes = await request(app).put("/api/settings").send({ language: "ja", uiDensity: "compact" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.ok).toBe(true);

    const getRes = await request(app).get("/api/settings");
    expect(getRes.status).toBe(200);
    expect(getRes.body.settings.language).toBe("ja");
    expect(getRes.body.settings.uiDensity).toBe("compact");
  });

  it("rejects non-object payloads", async () => {
    const app = express();
    app.use(express.json());
    registerOpsSettingsStatsRoutes({
      app,
      db: { prepare: vi.fn() },
    } as any);

    const res = await request(app).put("/api/settings").send(["not", "object"]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("settings_invalid_payload");
  });
});

