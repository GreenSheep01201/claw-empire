import { execFileSync } from "node:child_process";

type DbLike = {
  prepare: (sql: string) => {
    run: (...args: any[]) => unknown;
  };
};

type CreateProcessToolsDeps = {
  db: DbLike;
  nowMs: () => number;
};

export function createProcessTools(deps: CreateProcessToolsDeps) {
  const { db, nowMs } = deps;
  const WINDOWS_TASKKILL_TIMEOUT_MS = 8000;
  const WINDOWS_KILL_RETRY_DELAYS_MS = [450, 1200, 2400];
  const WINDOWS_INTERRUPT_RETRY_PLAN: Array<{ delayMs: number; force: boolean }> = [
    { delayMs: 450, force: false },
    { delayMs: 1400, force: true },
    { delayMs: 2600, force: true },
  ];

  function isPidAlive(pid: number): boolean {
    if (pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  function runWindowsTaskkill(pid: number, force: boolean): boolean {
    const args = ["/pid", String(pid), "/T"];
    if (force) args.push("/F");
    try {
      execFileSync("taskkill", args, { stdio: "ignore", timeout: WINDOWS_TASKKILL_TIMEOUT_MS });
      return true;
    } catch {
      return false;
    }
  }

  function tryDirectKill(pid: number): void {
    try {
      process.kill(pid);
    } catch {
      /* ignore */
    }
  }

  function killPidTree(pid: number): void {
    if (pid <= 0) return;

    if (process.platform === "win32") {
      if (!isPidAlive(pid)) return;
      const killed = runWindowsTaskkill(pid, true);
      if (!killed && isPidAlive(pid)) tryDirectKill(pid);
      for (const delayMs of WINDOWS_KILL_RETRY_DELAYS_MS) {
        setTimeout(() => {
          if (!isPidAlive(pid)) return;
          const retryKilled = runWindowsTaskkill(pid, true);
          if (!retryKilled && isPidAlive(pid)) tryDirectKill(pid);
        }, delayMs);
      }
      return;
    }

    const signalTree = (sig: NodeJS.Signals) => {
      try {
        process.kill(-pid, sig);
      } catch {
        /* ignore */
      }
      try {
        process.kill(pid, sig);
      } catch {
        /* ignore */
      }
    };

    signalTree("SIGTERM");
    setTimeout(() => {
      if (isPidAlive(pid)) signalTree("SIGKILL");
    }, 1200);
  }

  function interruptPidTree(pid: number): void {
    if (pid <= 0) return;

    if (process.platform === "win32") {
      if (!isPidAlive(pid)) return;
      const interrupted = runWindowsTaskkill(pid, false);
      if (!interrupted && isPidAlive(pid)) {
        try {
          process.kill(pid, "SIGINT");
        } catch {
          /* ignore */
        }
      }
      for (const step of WINDOWS_INTERRUPT_RETRY_PLAN) {
        setTimeout(() => {
          if (!isPidAlive(pid)) return;
          const ok = runWindowsTaskkill(pid, step.force);
          if (!ok && step.force && isPidAlive(pid)) tryDirectKill(pid);
        }, step.delayMs);
      }
      return;
    }

    const signalTree = (sig: NodeJS.Signals) => {
      try {
        process.kill(-pid, sig);
      } catch {
        /* ignore */
      }
      try {
        process.kill(pid, sig);
      } catch {
        /* ignore */
      }
    };

    signalTree("SIGINT");
    setTimeout(() => {
      if (isPidAlive(pid)) signalTree("SIGTERM");
    }, 1200);
    setTimeout(() => {
      if (isPidAlive(pid)) signalTree("SIGKILL");
    }, 2600);
  }

  function appendTaskLog(taskId: string, kind: string, message: string): void {
    const t = nowMs();
    db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, ?, ?, ?)").run(
      taskId,
      kind,
      message,
      t,
    );
  }

  return {
    killPidTree,
    isPidAlive,
    interruptPidTree,
    appendTaskLog,
  };
}
