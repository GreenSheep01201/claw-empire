import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cronToHuman, computeNextCronRun, makeJobId, matchField } from "./cron-monitor.ts";

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
