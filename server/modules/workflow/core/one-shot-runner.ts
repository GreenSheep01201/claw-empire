import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AgentRow, OneShotRunOptions, OneShotRunResult } from "./conversation-types.ts";

type CreateOneShotRunnerDeps = {
  logsDir: string;
  broadcast: (event: string, payload: unknown) => void;
  getProviderModelConfig: () => Record<string, { model?: string; reasoningLevel?: string }>;
  executeApiProviderAgent: (...args: any[]) => Promise<void>;
  executeCopilotAgent: (...args: any[]) => Promise<void>;
  executeAntigravityAgent: (...args: any[]) => Promise<void>;
  killPidTree: (pid: number) => void;
  prettyStreamJson: (raw: string) => string;
  getPreferredLanguage: () => string;
  normalizeStreamChunk: (raw: Buffer | string, opts?: { dropCliNoise?: boolean }) => string;
  hasStructuredJsonLines: (raw: string) => boolean;
  normalizeConversationReply: (raw: string, maxChars?: number, opts?: { maxSentences?: number }) => string;
  buildAgentArgs: (provider: string, model?: string, reasoningLevel?: string, opts?: { noTools?: boolean }) => string[];
  withCliPathFallback: (pathValue: string | undefined) => string;
  getCursorApiKeyFromDb?: () => string | null;
};

export function createOneShotRunner(deps: CreateOneShotRunnerDeps) {
  const {
    logsDir,
    broadcast,
    getProviderModelConfig,
    executeApiProviderAgent,
    executeCopilotAgent,
    executeAntigravityAgent,
    killPidTree,
    prettyStreamJson,
    getPreferredLanguage,
    normalizeStreamChunk,
    hasStructuredJsonLines,
    normalizeConversationReply,
    buildAgentArgs,
    withCliPathFallback,
    getCursorApiKeyFromDb,
  } = deps;
  const NO_TOOLS_POLICY_ERROR = "tool_use_blocked_by_no_tools_policy";
  const CLI_TOOL_SIGNAL_REGEX =
    /"type"\s*:\s*"(?:tool_use|tool_result|command_execution|function_call|tool_call|mcp_tool_call)"|"tool_use_id"\s*:|"toolName"\s*:/i;

  function hasCliToolSignal(text: string): boolean {
    return CLI_TOOL_SIGNAL_REGEX.test(text);
  }

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

  async function runAgentOneShot(
    agent: AgentRow,
    prompt: string,
    opts: OneShotRunOptions = {},
  ): Promise<OneShotRunResult> {
    const provider = agent.cli_provider || "claude";
    const timeoutMs = opts.timeoutMs ?? 180_000;
    const projectPath = opts.projectPath || process.cwd();
    const streamTaskId = opts.streamTaskId ?? null;
    const noTools = opts.noTools === true;
    const runId = `meeting-${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const logPath = path.join(logsDir, `${runId}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: "w" });
    const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);
    let rawOutput = "";
    let exitCode = 0;
    let activeChild: any = null;
    let activeStdoutListener: ((chunk: Buffer) => void) | null = null;
    let activeStderrListener: ((chunk: Buffer) => void) | null = null;
    let activeErrorListener: ((err: Error) => void) | null = null;
    let activeCloseListener: ((code: number | null) => void) | null = null;
    let abortActiveRun: ((reason: string) => void) | null = null;
    let noToolsViolationDetected = false;
    const detachChildListeners = () => {
      const child = activeChild;
      if (!child) return;
      if (activeStdoutListener) {
        child.stdout?.off("data", activeStdoutListener);
        activeStdoutListener = null;
      }
      if (activeStderrListener) {
        child.stderr?.off("data", activeStderrListener);
        activeStderrListener = null;
      }
      if (activeErrorListener) {
        child.off("error", activeErrorListener);
        activeErrorListener = null;
      }
      if (activeCloseListener) {
        child.off("close", activeCloseListener);
        activeCloseListener = null;
      }
      activeChild = null;
    };

    const onChunk = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
      const text = normalizeStreamChunk(chunk, {
        dropCliNoise: provider !== "copilot" && provider !== "antigravity" && provider !== "api",
      });
      if (!text) return;
      rawOutput += text;
      safeWrite(text);
      if (streamTaskId) broadcast("cli_output", { task_id: streamTaskId, stream, data: text });
      if (noTools && !noToolsViolationDetected && hasCliToolSignal(text)) {
        noToolsViolationDetected = true;
        abortActiveRun?.(NO_TOOLS_POLICY_ERROR);
      }
    };

    try {
      if (provider === "api") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          await executeApiProviderAgent(
            prompt,
            projectPath,
            logStream,
            controller.signal,
            streamTaskId ?? undefined,
            (agent as any).api_provider_id ?? null,
            (agent as any).api_model ?? null,
            (text: string) => {
              rawOutput += text;
              return safeWrite(text);
            },
          );
        } finally {
          clearTimeout(timeout);
        }
        if (!rawOutput.trim() && fs.existsSync(logPath)) rawOutput = fs.readFileSync(logPath, "utf8");
      } else if (provider === "copilot" || provider === "antigravity") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const oauthWrite = (text: string) => {
          rawOutput += text;
          return safeWrite(text);
        };
        try {
          if (provider === "copilot") {
            await executeCopilotAgent(
              prompt,
              projectPath,
              logStream,
              controller.signal,
              streamTaskId ?? undefined,
              agent.oauth_account_id ?? null,
              oauthWrite,
            );
          } else {
            await executeAntigravityAgent(
              prompt,
              logStream,
              controller.signal,
              streamTaskId ?? undefined,
              agent.oauth_account_id ?? null,
              oauthWrite,
            );
          }
        } finally {
          clearTimeout(timeout);
        }
        if (!rawOutput.trim() && fs.existsSync(logPath)) rawOutput = fs.readFileSync(logPath, "utf8");
      } else {
        const modelConfig = getProviderModelConfig();
        const model = agent.cli_model || modelConfig[provider]?.model || undefined;
        const reasoningLevel =
          provider === "codex"
            ? agent.cli_reasoning_level || modelConfig[provider]?.reasoningLevel || undefined
            : modelConfig[provider]?.reasoningLevel || undefined;
        const args = buildAgentArgs(provider, model, reasoningLevel, { noTools });

        await new Promise<void>((resolve, reject) => {
          const cleanEnv = { ...process.env };
          delete cleanEnv.CLAUDECODE;
          delete cleanEnv.CLAUDE_CODE;
          if (provider === "cursor") {
            delete cleanEnv.CURSOR_API_KEY;
            const dbKey = getCursorApiKeyFromDb?.();
            if (dbKey) cleanEnv.CURSOR_API_KEY = dbKey;
          }
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
            detached: false,
            windowsHide: true,
          });
          activeChild = child;
          let settled = false;
          const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            abortActiveRun = null;
            detachChildListeners();
            callback();
          };
          const abortRun = (reason: string) => {
            if (settled) return;
            const pid = child.pid ?? 0;
            detachChildListeners();
            if (pid > 0) killPidTree(pid);
            settle(() => reject(new Error(reason)));
          };
          abortActiveRun = abortRun;

          const timeout = setTimeout(() => {
            abortRun(`timeout after ${timeoutMs}ms`);
          }, timeoutMs);

          activeErrorListener = (err: Error) => {
            clearTimeout(timeout);
            settle(() => reject(err));
          };
          activeStdoutListener = (chunk: Buffer) => onChunk(chunk, "stdout");
          activeStderrListener = (chunk: Buffer) => onChunk(chunk, "stderr");
          activeCloseListener = (code: number | null) => {
            clearTimeout(timeout);
            exitCode = code ?? 1;
            settle(() => resolve());
          };
          child.on("error", activeErrorListener);
          child.stdout?.on("data", activeStdoutListener);
          child.stderr?.on("data", activeStderrListener);
          child.on("close", activeCloseListener);

          child.stdin?.write(prompt);
          child.stdin?.end();
        });
      }
    } catch (err: any) {
      const message = err?.message ? String(err.message) : String(err);
      if (message === NO_TOOLS_POLICY_ERROR) {
        if (opts.rawOutput) {
          const raw = rawOutput.trim();
          if (raw) return { text: raw };
          const pretty = prettyStreamJson(rawOutput).trim();
          if (pretty) return { text: pretty };
          return { text: "" };
        }
        const partial = normalizeConversationReply(rawOutput, 320);
        if (partial) return { text: partial };
        const pretty = prettyStreamJson(rawOutput);
        const roughSource = pretty.trim() || hasStructuredJsonLines(rawOutput) ? pretty : rawOutput;
        const rough = roughSource.replace(/\s+/g, " ").trim();
        if (rough) {
          const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
          return { text: clipped };
        }
        return { text: "" };
      }
      onChunk(`\n[one-shot-error] ${message}\n`, "stderr");
      if (opts.rawOutput) {
        const raw = rawOutput.trim();
        if (raw) return { text: raw, error: message };
        const pretty = prettyStreamJson(rawOutput).trim();
        if (pretty) return { text: pretty, error: message };
        return { text: "", error: message };
      }
      const partial = normalizeConversationReply(rawOutput, 320);
      if (partial) return { text: partial, error: message };
      const pretty = prettyStreamJson(rawOutput);
      const roughSource = pretty.trim() || hasStructuredJsonLines(rawOutput) ? pretty : rawOutput;
      const rough = roughSource.replace(/\s+/g, " ").trim();
      if (rough) {
        const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
        return { text: clipped, error: message };
      }
      return { text: "", error: message };
    } finally {
      abortActiveRun = null;
      detachChildListeners();
      await new Promise<void>((resolve) => safeEnd(resolve));
    }

    if (exitCode !== 0 && !rawOutput.trim()) {
      return { text: "", error: `${provider} exited with code ${exitCode}` };
    }

    if (opts.rawOutput) {
      const pretty = prettyStreamJson(rawOutput).trim();
      const raw = rawOutput.trim();
      return { text: pretty || raw };
    }

    const normalized = normalizeConversationReply(rawOutput);
    if (normalized) return { text: normalized };

    const pretty = prettyStreamJson(rawOutput);
    const roughSource = pretty.trim() || hasStructuredJsonLines(rawOutput) ? pretty : rawOutput;
    const rough = roughSource.replace(/\s+/g, " ").trim();
    if (rough) {
      const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
      return { text: clipped };
    }

    const lang = getPreferredLanguage();
    if (lang === "en") return { text: "Acknowledged. Continuing to the next step." };
    if (lang === "ja") return { text: "確認しました。次のステップへ進みます。" };
    if (lang === "zh") return { text: "已确认，继续进入下一步。" };
    return { text: "확인했습니다. 다음 단계로 진행하겠습니다." };
  }

  return {
    runAgentOneShot,
  };
}
