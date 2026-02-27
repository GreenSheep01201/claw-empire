import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import type { CliStatusResult, CliToolDef, CliToolStatus, CliUsageEntry, CliUsageWindow } from "./types.ts";

type CreateUsageCliToolsDeps = {
  jsonHasKey: (filePath: string, key: string) => boolean;
  fileExistsNonEmpty: (filePath: string) => boolean;
  readClaudeToken: () => string | null;
  readCodexTokens: () => { access_token: string; account_id: string } | null;
  readGeminiCredsFromKeychain: () => unknown;
  freshGeminiToken: () => Promise<string | null>;
  getGeminiProjectId: (token: string) => Promise<string | null>;
};

export function createUsageCliTools(deps: CreateUsageCliToolsDeps) {
  const {
    jsonHasKey,
    fileExistsNonEmpty,
    readClaudeToken,
    readCodexTokens,
    readGeminiCredsFromKeychain,
    freshGeminiToken,
    getGeminiProjectId,
  } = deps;

  async function fetchClaudeUsage(): Promise<CliUsageEntry> {
    const token = readClaudeToken();
    if (!token) return { windows: [], error: "unauthenticated" };
    try {
      const resp = await fetch("https://api.anthropic.com/api/oauth/usage", {
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return { windows: [], error: `http_${resp.status}` };
      const data = (await resp.json()) as Record<string, { utilization?: number; resets_at?: string } | null>;
      const windows: CliUsageWindow[] = [];
      const labelMap: Record<string, string> = {
        five_hour: "5-hour",
        seven_day: "7-day",
        seven_day_sonnet: "7-day Sonnet",
        seven_day_opus: "7-day Opus",
      };
      for (const [key, label] of Object.entries(labelMap)) {
        const entry = data[key];
        if (entry) {
          windows.push({
            label,
            utilization: Math.round(entry.utilization ?? 0) / 100, // API returns 0-100, normalize to 0-1
            resetsAt: entry.resets_at ?? null,
          });
        }
      }
      return { windows, error: null };
    } catch {
      return { windows: [], error: "unavailable" };
    }
  }

  async function fetchCodexUsage(): Promise<CliUsageEntry> {
    const tokens = readCodexTokens();
    if (!tokens) return { windows: [], error: "unauthenticated" };
    try {
      const resp = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "ChatGPT-Account-Id": tokens.account_id,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return { windows: [], error: `http_${resp.status}` };
      const data = (await resp.json()) as {
        rate_limit?: {
          primary_window?: { used_percent?: number; reset_at?: number };
          secondary_window?: { used_percent?: number; reset_at?: number };
        };
      };
      const windows: CliUsageWindow[] = [];
      if (data.rate_limit?.primary_window) {
        const pw = data.rate_limit.primary_window;
        windows.push({
          label: "5-hour",
          utilization: (pw.used_percent ?? 0) / 100,
          resetsAt: pw.reset_at ? new Date(pw.reset_at * 1000).toISOString() : null,
        });
      }
      if (data.rate_limit?.secondary_window) {
        const sw = data.rate_limit.secondary_window;
        windows.push({
          label: "7-day",
          utilization: (sw.used_percent ?? 0) / 100,
          resetsAt: sw.reset_at ? new Date(sw.reset_at * 1000).toISOString() : null,
        });
      }
      return { windows, error: null };
    } catch {
      return { windows: [], error: "unavailable" };
    }
  }

  async function fetchGeminiUsage(): Promise<CliUsageEntry> {
    const token = await freshGeminiToken();
    if (!token) return { windows: [], error: "unauthenticated" };

    const projectId = await getGeminiProjectId(token);
    if (!projectId) return { windows: [], error: "unavailable" };

    try {
      const resp = await fetch("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project: projectId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return { windows: [], error: `http_${resp.status}` };
      const data = (await resp.json()) as {
        buckets?: Array<{ modelId?: string; remainingFraction?: number; resetTime?: string }>;
      };
      const windows: CliUsageWindow[] = [];
      if (data.buckets) {
        for (const b of data.buckets) {
          if (b.modelId?.endsWith("_vertex")) continue;
          windows.push({
            label: b.modelId ?? "Quota",
            utilization: Math.round((1 - (b.remainingFraction ?? 1)) * 100) / 100,
            resetsAt: b.resetTime ?? null,
          });
        }
      }
      return { windows, error: null };
    } catch {
      return { windows: [], error: "unavailable" };
    }
  }

  const CLI_TOOLS: CliToolDef[] = [
    {
      name: "claude",
      authHint: "Run: claude login",
      checkAuth: () => {
        const home = os.homedir();
        const claudeJson = path.join(home, ".claude.json");
        if (jsonHasKey(claudeJson, "oauthAccount") || jsonHasKey(claudeJson, "session")) return true;
        return fileExistsNonEmpty(path.join(home, ".claude", "auth.json"));
      },
    },
    {
      name: "codex",
      authHint: "Run: codex auth login",
      checkAuth: () => {
        const authPath = path.join(os.homedir(), ".codex", "auth.json");
        if (jsonHasKey(authPath, "OPENAI_API_KEY") || jsonHasKey(authPath, "tokens")) return true;
        if (process.env.OPENAI_API_KEY) return true;
        return false;
      },
    },
    {
      name: "gemini",
      authHint: "Run: gemini auth login",
      getVersion: () => {
        try {
          const whichCmd = process.platform === "win32" ? "where" : "which";
          const geminiPath = execFileSync(whichCmd, ["gemini"], { encoding: "utf8", timeout: 3000 })
            .split("\n")[0]
            .trim();
          if (!geminiPath) return null;
          const realPath = fs.realpathSync(geminiPath);
          let dir = path.dirname(realPath);
          for (let i = 0; i < 10; i++) {
            const pkgPath = path.join(dir, "node_modules", "@google", "gemini-cli", "package.json");
            if (fs.existsSync(pkgPath)) {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
              return pkg.version ?? null;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
          }
        } catch {
          /* ignore */
        }
        return null;
      },
      checkAuth: () => {
        if (readGeminiCredsFromKeychain()) return true;
        if (jsonHasKey(path.join(os.homedir(), ".gemini", "oauth_creds.json"), "access_token")) return true;
        const appData = process.env.APPDATA;
        if (appData && jsonHasKey(path.join(appData, "gcloud", "application_default_credentials.json"), "client_id"))
          return true;
        return false;
      },
    },
    {
      name: "opencode",
      authHint: "Run: opencode auth",
      checkAuth: () => {
        const home = os.homedir();
        if (fileExistsNonEmpty(path.join(home, ".local", "share", "opencode", "auth.json"))) return true;
        const xdgData = process.env.XDG_DATA_HOME;
        if (xdgData && fileExistsNonEmpty(path.join(xdgData, "opencode", "auth.json"))) return true;
        if (process.platform === "darwin") {
          if (fileExistsNonEmpty(path.join(home, "Library", "Application Support", "opencode", "auth.json")))
            return true;
        }
        return false;
      },
    },
  ];

  const cachedCliStatus: { data: CliStatusResult; loadedAt: number } | null = null;
  const CLI_STATUS_TTL = 30_000;

  function execWithTimeout(cmd: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const opts: any = { timeout: timeoutMs };
      if (process.platform === "win32") opts.shell = true;
      const child = execFile(cmd, args, opts, (err, stdout) => {
        if (err) return reject(err);
        resolve(String(stdout).trim());
      });
      child.unref?.();
    });
  }

  async function detectCliTool(tool: CliToolDef): Promise<CliToolStatus> {
    try {
      const whichCmd = process.platform === "win32" ? "where" : "which";
      try {
        await execWithTimeout(whichCmd, [tool.name], 3000);
      } catch {
        return { installed: false, version: null, authenticated: false, authHint: tool.authHint };
      }

      let version: string | null = null;
      if (tool.getVersion) {
        try {
          version = tool.getVersion();
        } catch {
          version = null;
        }
      } else {
        try {
          version = await execWithTimeout(tool.name, tool.versionArgs ?? ["--version"], 3000);
          if (version.includes("\n")) version = version.split("\n")[0].trim();
        } catch {
          /* binary found but --version failed */
        }
      }

      let authenticated = false;
      try {
        authenticated = Boolean(tool.checkAuth());
      } catch {
        authenticated = false;
      }
      return { installed: true, version, authenticated, authHint: tool.authHint };
    } catch {
      return { installed: false, version: null, authenticated: false, authHint: tool.authHint };
    }
  }

  async function detectAllCli(): Promise<CliStatusResult> {
    const results = await Promise.all(CLI_TOOLS.map((t) => detectCliTool(t)));
    const out: CliStatusResult = {};
    for (let i = 0; i < CLI_TOOLS.length; i++) {
      out[CLI_TOOLS[i].name] = results[i];
    }
    return out;
  }

  return {
    fetchClaudeUsage,
    fetchCodexUsage,
    fetchGeminiUsage,
    CLI_TOOLS,
    cachedCliStatus,
    CLI_STATUS_TTL,
    execWithTimeout,
    detectAllCli,
  };
}
