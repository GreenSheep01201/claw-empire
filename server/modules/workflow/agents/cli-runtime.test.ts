import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { createCliRuntimeTools } from "./cli-runtime.ts";

class FakeChild extends EventEmitter {
  pid?: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;

  constructor(pid?: number) {
    super();
    this.pid = pid;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    this.kill = vi.fn();
    this.unref = vi.fn();
  }
}

describe("cli-runtime timeout handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(spawn).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hard timeout logs process-tree stop semantics and calls killPidTree", () => {
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-runtime-timeout-"));
    const logPath = path.join(logsDir, "task-1.log");
    const fakeChild = new FakeChild(5555);
    vi.mocked(spawn).mockReturnValue(fakeChild as any);

    const appendTaskLog = vi.fn();
    const killPidTree = vi.fn();
    const activeProcesses = new Map<string, any>();

    const runtime = createCliRuntimeTools({
      db: {
        prepare: () => ({
          get: () => undefined,
          all: () => [],
          run: () => ({ changes: 0 }),
        }),
      },
      logsDir,
      buildAgentArgs: () => ["dummy-cli", "exec"],
      clearCliOutputDedup: vi.fn(),
      normalizeStreamChunk: (chunk: Buffer) => chunk.toString("utf8"),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: vi.fn(),
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 1000,
      killPidTree,
      appendTaskLog,
      activeProcesses,
      createSubtaskFromCli: vi.fn(),
      completeSubtaskFromCli: vi.fn(),
    });

    runtime.spawnCliAgent("task-1", "codex", "hello", logsDir, logPath);
    vi.advanceTimersByTime(1000);

    expect(killPidTree).toHaveBeenCalledWith(5555);
    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-1",
      "error",
      expect.stringContaining("RUN TIMEOUT"),
    );
    expect(appendTaskLog).toHaveBeenCalledWith(
      "task-1",
      "error",
      expect.stringContaining("stopping process tree pid=5555"),
    );

    fakeChild.emit("close", 1);
  });
});
