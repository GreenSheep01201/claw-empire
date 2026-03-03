import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  cronToHuman,
  computeNextCronRun,
  makeJobId,
  matchField,
  isStringRecord,
  registerCronMonitorRoutes,
} from "./cron-monitor.ts";
import type { RuntimeContext } from "../../../types/runtime-context.ts";

// ---------------------------------------------------------------------------
// cronToHuman
// ---------------------------------------------------------------------------

describe("cronToHuman", () => {
  it("every minute", () => {
    expect(cronToHuman("* * * * *")).toBe("Every minute");
  });

  it("every 5 minutes", () => {
    expect(cronToHuman("*/5 * * * *")).toBe("Every 5 minutes");
  });

  it("every 1 minute (step)", () => {
    expect(cronToHuman("*/1 * * * *")).toBe("Every minute");
  });

  it("every 2 hours", () => {
    expect(cronToHuman("0 */2 * * *")).toBe("Every 2 hours");
  });

  it("hourly at :30", () => {
    expect(cronToHuman("30 * * * *")).toBe("Hourly at :30");
  });

  it("daily at 09:00", () => {
    expect(cronToHuman("0 9 * * *")).toBe("Daily at 09:00");
  });

  it("weekdays at 08:30", () => {
    expect(cronToHuman("30 8 * * 1-5")).toBe("Weekdays at 08:30");
  });

  it("specific weekday (Mon)", () => {
    expect(cronToHuman("0 9 * * 1")).toBe("Mon at 09:00");
  });

  it("returns raw expr for complex patterns", () => {
    expect(cronToHuman("0 9 1 1 *")).toBe("0 9 1 1 *"); // dom + mon set = not simple daily
    expect(cronToHuman("0 9 1 * 1")).toBe("0 9 1 * 1"); // dom + dow set = complex
  });

  it("returns raw for non-5-field expressions", () => {
    expect(cronToHuman("every 3600s")).toBe("every 3600s");
  });
});

// ---------------------------------------------------------------------------
// matchField
// ---------------------------------------------------------------------------

describe("matchField", () => {
  it("wildcard matches everything", () => {
    expect(matchField("*", 0, 0, 59)).toBe(true);
    expect(matchField("*", 30, 0, 59)).toBe(true);
  });

  it("exact value", () => {
    expect(matchField("5", 5, 0, 59)).toBe(true);
    expect(matchField("5", 6, 0, 59)).toBe(false);
  });

  it("step */N", () => {
    expect(matchField("*/5", 0, 0, 59)).toBe(true);
    expect(matchField("*/5", 5, 0, 59)).toBe(true);
    expect(matchField("*/5", 3, 0, 59)).toBe(false);
  });

  it("range A-B", () => {
    expect(matchField("1-5", 3, 0, 7)).toBe(true);
    expect(matchField("1-5", 0, 0, 7)).toBe(false);
    expect(matchField("1-5", 6, 0, 7)).toBe(false);
  });

  it("list A,B,C", () => {
    expect(matchField("1,3,5", 3, 0, 59)).toBe(true);
    expect(matchField("1,3,5", 2, 0, 59)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeNextCronRun
// ---------------------------------------------------------------------------

describe("computeNextCronRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix time at 2026-03-03 10:00:00 UTC
    vi.setSystemTime(new Date("2026-03-03T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ISO string for every-minute cron", () => {
    const result = computeNextCronRun("* * * * *");
    expect(result).toBeTruthy();
    const nextDate = new Date(result!);
    // Should be 1 minute after now
    expect(nextDate.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null for invalid expressions", () => {
    expect(computeNextCronRun("invalid")).toBeNull();
    expect(computeNextCronRun("every 3600s")).toBeNull();
  });

  it("finds next run for */5 schedule", () => {
    const result = computeNextCronRun("*/5 * * * *");
    expect(result).toBeTruthy();
    const nextDate = new Date(result!);
    expect(nextDate.getMinutes() % 5).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// makeJobId
// ---------------------------------------------------------------------------

describe("makeJobId", () => {
  it("generates stable id for same inputs", () => {
    const id1 = makeJobId("crontab", null, "*/5 * * * *", "/usr/bin/foo");
    const id2 = makeJobId("crontab", null, "*/5 * * * *", "/usr/bin/foo");
    expect(id1).toBe(id2);
  });

  it("generates different ids for different inputs", () => {
    const id1 = makeJobId("crontab", null, "*/5 * * * *", "/usr/bin/foo");
    const id2 = makeJobId("launchd", "com.test", "every 300s", "/usr/bin/bar");
    expect(id1).not.toBe(id2);
  });

  it("produces url-safe characters", () => {
    const id = makeJobId("crontab", null, "* * * * *", "echo hello world");
    expect(id).not.toMatch(/[+/=]/);
  });
});

// ---------------------------------------------------------------------------
// isStringRecord
// ---------------------------------------------------------------------------

describe("isStringRecord", () => {
  it("accepts valid string record", () => {
    expect(isStringRecord({ a: "1", b: "2" })).toBe(true);
  });

  it("accepts empty object", () => {
    expect(isStringRecord({})).toBe(true);
  });

  it("rejects null, undefined, array", () => {
    expect(isStringRecord(null)).toBe(false);
    expect(isStringRecord(undefined)).toBe(false);
    expect(isStringRecord([])).toBe(false);
    expect(isStringRecord([1, 2])).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isStringRecord({ a: 123 })).toBe(false);
    expect(isStringRecord({ a: true })).toBe(false);
    expect(isStringRecord({ a: null })).toBe(false);
  });

  it("rejects values exceeding max length", () => {
    const longVal = "x".repeat(2001);
    expect(isStringRecord({ a: longVal })).toBe(false);
  });

  it("rejects keys exceeding max length", () => {
    const longKey = "k".repeat(513);
    expect(isStringRecord({ [longKey]: "v" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route handlers (integration tests)
// ---------------------------------------------------------------------------

function createTestApp() {
  const app = express();
  app.use(express.json());

  const store: Record<string, string> = {};
  const db = {
    prepare(sql: string) {
      const isSelect = sql.startsWith("SELECT");
      return {
        get(key: string) {
          if (!isSelect) return undefined;
          return store[key] ? { value: store[key] } : undefined;
        },
        run(key: string, value: string) {
          store[key] = value;
        },
      };
    },
  } as unknown as RuntimeContext["db"];

  registerCronMonitorRoutes({ app, db } as unknown as RuntimeContext);
  return { app, store };
}

describe("GET /api/cron/assignments", () => {
  it("returns empty assignments initially", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/cron/assignments").expect(200);
    expect(res.body).toEqual({ assignments: {} });
  });
});

describe("PUT /api/cron/assignments", () => {
  it("saves and retrieves assignments", async () => {
    const { app } = createTestApp();
    await request(app)
      .put("/api/cron/assignments")
      .send({ assignments: { job1: "agent-abc" } })
      .expect(200, { ok: true });

    const res = await request(app).get("/api/cron/assignments").expect(200);
    expect(res.body.assignments).toEqual({ job1: "agent-abc" });
  });

  it("rejects invalid payload (not an object)", async () => {
    const { app } = createTestApp();
    await request(app).put("/api/cron/assignments").send("not-json").expect(400);
  });

  it("rejects invalid assignments (non-string values)", async () => {
    const { app } = createTestApp();
    await request(app)
      .put("/api/cron/assignments")
      .send({ assignments: { job1: 123 } })
      .expect(400);
  });

  it("rejects array payload", async () => {
    const { app } = createTestApp();
    await request(app).put("/api/cron/assignments").send([1, 2, 3]).expect(400);
  });
});

describe("GET /api/cron/descriptions", () => {
  it("returns empty descriptions initially", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/cron/descriptions").expect(200);
    expect(res.body).toEqual({ descriptions: {} });
  });
});

describe("PUT /api/cron/descriptions", () => {
  it("saves and retrieves descriptions", async () => {
    const { app } = createTestApp();
    await request(app)
      .put("/api/cron/descriptions")
      .send({ descriptions: { job1: "SNS auto-posting — daily at 9:00" } })
      .expect(200, { ok: true });

    const res = await request(app).get("/api/cron/descriptions").expect(200);
    expect(res.body.descriptions).toEqual({ job1: "SNS auto-posting — daily at 9:00" });
  });

  it("rejects invalid descriptions (non-string values)", async () => {
    const { app } = createTestApp();
    await request(app)
      .put("/api/cron/descriptions")
      .send({ descriptions: { job1: false } })
      .expect(400);
  });

  it("accepts undefined descriptions (saves empty)", async () => {
    const { app } = createTestApp();
    await request(app).put("/api/cron/descriptions").send({}).expect(200, { ok: true });
  });
});
