import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { createProcessTools } from "./process-tools.ts";

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

function createHarness() {
  const appendLogRun = vi.fn();
  const db = {
    prepare: () => ({
      run: appendLogRun,
    }),
  };
  const tools = createProcessTools({
    db: db as any,
    nowMs: () => 123456,
  });
  return { tools };
}

describe("process-tools windows hardening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPlatform("win32");
    vi.mocked(execFileSync).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    setPlatform(originalPlatform);
    vi.restoreAllMocks();
  });

  it("killPidTree retries forced taskkill while the pid remains alive", () => {
    const pid = 4200;
    let alive = true;
    let attempts = 0;
    const killSpy = vi.spyOn(process, "kill").mockImplementation(((targetPid: number, signal?: number | string) => {
      if (targetPid !== pid) return true;
      if (signal === 0) {
        if (!alive) throw new Error("not running");
        return true;
      }
      alive = false;
      return true;
    }) as any);

    vi.mocked(execFileSync).mockImplementation(((_cmd: string, args: string[]) => {
      attempts += 1;
      if (args.includes("/F") && attempts >= 3) {
        alive = false;
      }
      return Buffer.from("");
    }) as any);

    const { tools } = createHarness();
    tools.killPidTree(pid);

    vi.advanceTimersByTime(3000);

    expect(vi.mocked(execFileSync)).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(execFileSync).mock.calls) {
      expect(call[1]).toEqual(["/pid", String(pid), "/T", "/F"]);
    }
    const nonProbeKillCalls = killSpy.mock.calls.filter(([, signal]) => signal !== 0);
    expect(nonProbeKillCalls).toHaveLength(0);
  });

  it("interruptPidTree escalates from graceful taskkill to forced taskkill", () => {
    const pid = 9901;
    let alive = true;
    const seenArgs: string[][] = [];
    const killSpy = vi.spyOn(process, "kill").mockImplementation(((targetPid: number, signal?: number | string) => {
      if (targetPid !== pid) return true;
      if (signal === 0) {
        if (!alive) throw new Error("not running");
        return true;
      }
      alive = false;
      return true;
    }) as any);

    vi.mocked(execFileSync).mockImplementation(((_cmd: string, args: string[]) => {
      seenArgs.push([...args]);
      if (args.includes("/F")) alive = false;
      return Buffer.from("");
    }) as any);

    const { tools } = createHarness();
    tools.interruptPidTree(pid);

    vi.advanceTimersByTime(4000);

    expect(seenArgs).toEqual([
      ["/pid", String(pid), "/T"],
      ["/pid", String(pid), "/T"],
      ["/pid", String(pid), "/T", "/F"],
    ]);
    const nonProbeKillCalls = killSpy.mock.calls.filter(([, signal]) => signal !== 0);
    expect(nonProbeKillCalls).toHaveLength(0);
  });
});
