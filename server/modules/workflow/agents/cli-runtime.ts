import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

type CliRuntimeDeps = {
  db: any;
  logsDir: string;
  buildAgentArgs: (provider: string, model?: string, reasoningLevel?: string) => string[];
  clearCliOutputDedup: (taskId: string) => void;
  normalizeStreamChunk: (chunk: Buffer, options?: { dropCliNoise?: boolean }) => string;
  shouldSkipDuplicateCliOutput: (taskId: string, stream: "stdout" | "stderr", text: string) => boolean;
  broadcast: (event: string, payload: unknown) => void;
  TASK_RUN_IDLE_TIMEOUT_MS: number;
  TASK_RUN_HARD_TIMEOUT_MS: number;
  killPidTree: (pid: number) => void;
  appendTaskLog: (taskId: string | null, kind: string, message: string) => void;
  activeProcesses: Map<string, ChildProcess>;
  createSubtaskFromCli: (taskId: string, toolUseId: string, title: string) => void;
  completeSubtaskFromCli: (toolUseId: string) => void;
};

export function createCliRuntimeTools(deps: CliRuntimeDeps) {
  const {
    db,
    logsDir,
    buildAgentArgs,
    clearCliOutputDedup,
    normalizeStreamChunk,
    shouldSkipDuplicateCliOutput,
    broadcast,
    TASK_RUN_IDLE_TIMEOUT_MS,
    TASK_RUN_HARD_TIMEOUT_MS,
    killPidTree,
    appendTaskLog,
    activeProcesses,
    createSubtaskFromCli,
    completeSubtaskFromCli,
  } = deps;

  // Codex multi-agent: map thread_id → cli_tool_use_id (item.id from spawn_agent)
  const codexThreadToSubtask = new Map<string, string>();

  function parseAndCreateSubtasks(taskId: string, data: string): void {
    try {
      const lines = data.split("\n").filter(Boolean);
      for (const line of lines) {
        let j: Record<string, unknown>;
        try {
          j = JSON.parse(line);
        } catch {
          continue;
        }

        // Detect sub-agent spawn: tool_use with tool === "Task" (Claude Code)
        if (j.type === "tool_use" && j.tool === "Task") {
          const toolUseId = (j.id as string) || `sub-${Date.now()}`;
          // Check for duplicate
          const existing = dbPrepareSubtaskByToolUseId().get(toolUseId) as { id: string } | undefined;
          if (existing) continue;

          const input = j.input as Record<string, unknown> | undefined;
          const title = (input?.description as string) || (input?.prompt as string)?.slice(0, 100) || "Sub-task";

          createSubtaskFromCli(taskId, toolUseId, title);
        }

        // Detect sub-agent completion: tool_result with tool === "Task" (Claude Code)
        if (j.type === "tool_result" && j.tool === "Task") {
          const toolUseId = j.id as string;
          if (!toolUseId) continue;
          completeSubtaskFromCli(toolUseId);
        }

        // Codex: spawn_agent started → create subtask
        if (j.type === "item.started") {
          const item = j.item as Record<string, unknown> | undefined;
          if (item?.type === "collab_tool_call" && item?.tool === "spawn_agent") {
            const itemId = (item.id as string) || `codex-spawn-${Date.now()}`;
            const existing = dbPrepareSubtaskByToolUseId().get(itemId) as { id: string } | undefined;
            if (!existing) {
              const prompt = (item.prompt as string) || "Sub-agent";
              const title = prompt
                .split("\n")[0]
                .replace(/^Task:\s*/, "")
                .slice(0, 100);
              createSubtaskFromCli(taskId, itemId, title);
            }
          }
        }

        // Codex: spawn_agent completed → save thread_id mapping
        // Codex: close_agent completed → complete subtask via thread_id
        if (j.type === "item.completed") {
          const item = j.item as Record<string, unknown> | undefined;
          if (item?.type === "collab_tool_call") {
            if (item.tool === "spawn_agent") {
              const itemId = item.id as string;
              const threadIds = (item.receiver_thread_ids as string[]) || [];
              if (itemId && threadIds[0]) {
                codexThreadToSubtask.set(threadIds[0], itemId);
              }
            } else if (item.tool === "close_agent") {
              const threadIds = (item.receiver_thread_ids as string[]) || [];
              for (const tid of threadIds) {
                const origItemId = codexThreadToSubtask.get(tid);
                if (origItemId) {
                  completeSubtaskFromCli(origItemId);
                  codexThreadToSubtask.delete(tid);
                }
              }
            }
          }
        }

        // Gemini: plan-based subtask detection from message
        if (j.type === "message" && j.content) {
          const content = j.content as string;
          // Detect plan output: {"subtasks": [...]}
          const planMatch = content.match(/\{"subtasks"\s*:\s*\[.*?\]\}/s);
          if (planMatch) {
            try {
              const plan = JSON.parse(planMatch[0]) as { subtasks: { title: string }[] };
              for (const st of plan.subtasks) {
                const stId = `gemini-plan-${st.title.slice(0, 30).replace(/\s/g, "-")}-${Date.now()}`;
                const existing = dbPrepareOpenSubtaskByTitle().get(taskId, st.title) as { id: string } | undefined;
                if (!existing) {
                  createSubtaskFromCli(taskId, stId, st.title);
                }
              }
            } catch {
              /* ignore malformed JSON */
            }
          }
          // Detect completion report: {"subtask_done": "..."}
          const doneMatch = content.match(/\{"subtask_done"\s*:\s*"(.+?)"\}/);
          if (doneMatch) {
            const doneTitle = doneMatch[1];
            const sub = dbPrepareOpenSubtaskToolUseIdByTitle().get(taskId, doneTitle) as
              | { cli_tool_use_id: string }
              | undefined;
            if (sub) completeSubtaskFromCli(sub.cli_tool_use_id);
          }
        }
      }
    } catch {
      // Not JSON or not parseable - ignore
    }
  }

  const dbPrepareSubtaskByToolUseId = () => db.prepare("SELECT id FROM subtasks WHERE cli_tool_use_id = ?");
  const dbPrepareOpenSubtaskByTitle = () =>
    db.prepare("SELECT id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done'");
  const dbPrepareOpenSubtaskToolUseIdByTitle = () =>
    db.prepare("SELECT cli_tool_use_id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done' LIMIT 1");

  function createSafeLogStreamOps(logStream: any): {
    safeWrite: (text: string) => boolean;
    safeEnd: (onDone?: () => void) => void;
    isClosed: () => boolean;
  } {
    let ended = false;
    const isClosed = () => ended || Boolean(logStream?.destroyed || logStream?.writableEnded || logStream?.closed);
    const safeWrite = (text: string): boolean => {
      if (!text || isClosed()) return false;
      try {
        logStream.write(text);
        return true;
      } catch {
        ended = true;
        return false;
      }
    };
    const safeEnd = (onDone?: () => void): void => {
      if (isClosed()) {
        ended = true;
        onDone?.();
        return;
      }
      ended = true;
      try {
        logStream.end(() => onDone?.());
      } catch {
        onDone?.();
      }
    };
    return { safeWrite, safeEnd, isClosed };
  }

  const CLI_PATH_FALLBACK_DIRS =
    process.platform === "win32"
      ? [
          path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs"),
          path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs"),
          path.join(process.env.APPDATA || "", "npm"),
        ].filter(Boolean)
      : [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          path.join(os.homedir(), ".local", "bin"),
          path.join(os.homedir(), "bin"),
        ];

  function withCliPathFallback(pathValue: string | undefined): string {
    const parts = (pathValue ?? "")
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean);
    const seen = new Set(parts);
    for (const dir of CLI_PATH_FALLBACK_DIRS) {
      if (!dir || seen.has(dir)) continue;
      parts.push(dir);
      seen.add(dir);
    }
    return parts.join(path.delimiter);
  }

  function spawnCliAgent(
    taskId: string,
    provider: string,
    prompt: string,
    projectPath: string,
    logPath: string,
    model?: string,
    reasoningLevel?: string,
  ): ChildProcess {
    clearCliOutputDedup(taskId);
    // Save prompt for debugging
    const promptPath = path.join(logsDir, `${taskId}.prompt.txt`);
    fs.writeFileSync(promptPath, prompt, "utf8");

    const args = buildAgentArgs(provider, model, reasoningLevel);
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);
    safeWrite(`\n===== task run start ${new Date().toISOString()} | provider=${provider} =====\n`);

    // Remove CLAUDECODE env var to prevent "nested session" detection
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE;
    cleanEnv.PATH = withCliPathFallback(String(cleanEnv.PATH ?? process.env.PATH ?? ""));
    cleanEnv.NO_COLOR = "1";
    cleanEnv.FORCE_COLOR = "0";
    cleanEnv.CI = "1";
    if (!cleanEnv.TERM) cleanEnv.TERM = "dumb";

    const child = spawn(args[0], args.slice(1), {
      cwd: projectPath,
      env: cleanEnv,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    let finished = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let stdoutListener: ((chunk: Buffer) => void) | null = null;
    let stderrListener: ((chunk: Buffer) => void) | null = null;
    const detachOutputListeners = () => {
      if (stdoutListener) {
        child.stdout?.off("data", stdoutListener);
        stdoutListener = null;
      }
      if (stderrListener) {
        child.stderr?.off("data", stderrListener);
        stderrListener = null;
      }
    };
    const clearRunTimers = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
    };
    const triggerTimeout = (kind: "idle" | "hard") => {
      if (finished) return;
      finished = true;
      clearRunTimers();
      const timeoutMs = kind === "idle" ? TASK_RUN_IDLE_TIMEOUT_MS : TASK_RUN_HARD_TIMEOUT_MS;
      const reason =
        kind === "idle"
          ? `no output for ${Math.round(timeoutMs / 1000)}s`
          : `exceeded max runtime ${Math.round(timeoutMs / 1000)}s`;
      const pid = child.pid && child.pid > 0 ? child.pid : null;
      const msg = pid
        ? `[Claw-Empire] RUN TIMEOUT (${reason}); stopping process tree pid=${pid}`
        : `[Claw-Empire] RUN TIMEOUT (${reason}); stopping child process (pid unavailable)`;
      safeWrite(`\n${msg}\n`);
      appendTaskLog(taskId, "error", msg);
      try {
        if (pid) {
          killPidTree(pid);
        } else {
          child.kill("SIGTERM");
        }
      } catch (err) {
        const errMsg = `[Claw-Empire] timeout termination failed: ${err instanceof Error ? err.message : String(err)}`;
        safeWrite(`\n${errMsg}\n`);
        appendTaskLog(taskId, "error", errMsg);
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore kill race
        }
      }
    };
    const touchIdleTimer = () => {
      if (finished || TASK_RUN_IDLE_TIMEOUT_MS <= 0) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => triggerTimeout("idle"), TASK_RUN_IDLE_TIMEOUT_MS);
    };

    touchIdleTimer();
    if (TASK_RUN_HARD_TIMEOUT_MS > 0) {
      hardTimer = setTimeout(() => triggerTimeout("hard"), TASK_RUN_HARD_TIMEOUT_MS);
    }

    activeProcesses.set(taskId, child);

    child.on("error", (err) => {
      finished = true;
      clearRunTimers();
      detachOutputListeners();
      console.error(`[Claw-Empire] spawn error for ${provider} (task ${taskId}): ${err.message}`);
      safeWrite(`\n[Claw-Empire] SPAWN ERROR: ${err.message}\n`);
      safeEnd();
      activeProcesses.delete(taskId);
      appendTaskLog(taskId, "error", `Agent spawn failed: ${err.message}`);
    });

    // Deliver prompt via stdin (cross-platform safe)
    child.stdin?.write(prompt);
    child.stdin?.end();

    // Pipe agent output to log file AND broadcast via WebSocket
    stdoutListener = (chunk: Buffer) => {
      touchIdleTimer();
      const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
      if (!text) return;
      if (shouldSkipDuplicateCliOutput(taskId, "stdout", text)) return;
      safeWrite(text);
      broadcast("cli_output", { task_id: taskId, stream: "stdout", data: text });
      parseAndCreateSubtasks(taskId, text);
    };
    stderrListener = (chunk: Buffer) => {
      touchIdleTimer();
      const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
      if (!text) return;
      if (shouldSkipDuplicateCliOutput(taskId, "stderr", text)) return;
      safeWrite(text);
      broadcast("cli_output", { task_id: taskId, stream: "stderr", data: text });
    };
    child.stdout?.on("data", stdoutListener);
    child.stderr?.on("data", stderrListener);

    child.on("close", () => {
      finished = true;
      clearRunTimers();
      detachOutputListeners();
      safeEnd();
      try {
        fs.unlinkSync(promptPath);
      } catch {
        /* ignore */
      }
    });

    if (process.platform !== "win32") child.unref();

    return child;
  }

  return {
    codexThreadToSubtask,
    spawnCliAgent,
  };
}
