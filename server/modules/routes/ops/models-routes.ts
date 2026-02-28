import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { RuntimeContext } from "../../../types/runtime-context.ts";

interface CliModelInfoServer {
  slug: string;
  displayName?: string;
  description?: string;
  reasoningLevels?: Array<{ effort: string; description: string }>;
  defaultReasoningLevel?: string;
}

export function registerModelRoutes(ctx: RuntimeContext): void {
  const { app, db, exchangeCopilotToken, getPreferredOAuthAccounts, execWithTimeout } = ctx;
  let cachedModels = ctx.cachedModels;
  let cachedCliModels: { data: Record<string, CliModelInfoServer[]>; loadedAt: number } | null = null;

  async function fetchCopilotModelsFromAPI(): Promise<string[]> {
    try {
      const accounts = getPreferredOAuthAccounts("github");
      const account = accounts.find((a: any) => Boolean(a.accessToken));
      if (!account) return [];

      const { token, baseUrl } = await exchangeCopilotToken(account.accessToken);
      const resp = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "climpire",
          "Editor-Version": "climpire/1.0.0",
          "Copilot-Integration-Id": "vscode-chat",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [];

      const data = (await resp.json()) as { data?: Array<{ id?: string }> };
      const seen = new Set<string>();
      const models: string[] = [];
      if (data.data && Array.isArray(data.data)) {
        for (const m of data.data) {
          if (m.id) {
            const slug = `github-copilot/${m.id}`;
            if (!seen.has(slug)) {
              seen.add(slug);
              models.push(slug);
            }
          }
        }
      }
      return models;
    } catch {
      return [];
    }
  }

  async function fetchOpenCodeModels(): Promise<Record<string, string[]>> {
    const grouped: Record<string, string[]> = { opencode: [] };
    try {
      const output = await execWithTimeout("opencode", ["models"], 10_000);
      for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes("/")) continue;
        const slashIdx = trimmed.indexOf("/");
        const provider = trimmed.slice(0, slashIdx);
        if (provider === "github-copilot") {
          if (!grouped.copilot) grouped.copilot = [];
          if (!grouped.copilot.includes(trimmed)) grouped.copilot.push(trimmed);
        } else if (provider === "google" && trimmed.includes("antigravity")) {
          if (!grouped.antigravity) grouped.antigravity = [];
          if (!grouped.antigravity.includes(trimmed)) grouped.antigravity.push(trimmed);
        } else {
          if (!grouped.opencode.includes(trimmed)) grouped.opencode.push(trimmed);
        }
      }
    } catch {
      // opencode not available
    }
    return grouped;
  }

  function readCodexModelsCache(): CliModelInfoServer[] {
    try {
      const cachePath = path.join(os.homedir(), ".codex", "models_cache.json");
      if (!fs.existsSync(cachePath)) return [];
      const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      const modelsArr: Array<{
        slug?: string;
        display_name?: string;
        description?: string;
        visibility?: string;
        priority?: number;
        supported_reasoning_levels?: Array<{ effort: string; description: string }>;
        default_reasoning_level?: string;
      }> = Array.isArray(raw) ? raw : raw.models || raw.data || [];

      const listModels = modelsArr
        .filter((m) => m.visibility === "list" && m.slug)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

      return listModels.map((m) => ({
        slug: m.slug!,
        displayName: m.display_name || m.slug!,
        description: m.description,
        reasoningLevels:
          m.supported_reasoning_levels && m.supported_reasoning_levels.length > 0
            ? m.supported_reasoning_levels
            : undefined,
        defaultReasoningLevel: m.default_reasoning_level || undefined,
      }));
    } catch {
      return [];
    }
  }

  function fetchGeminiModels(): CliModelInfoServer[] {
    const FALLBACK: CliModelInfoServer[] = [
      { slug: "gemini-3-pro-preview", displayName: "Gemini 3 Pro Preview" },
      { slug: "gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview" },
      { slug: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
      { slug: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { slug: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash Lite" },
    ];

    try {
      const geminiPath = execFileSync("which", ["gemini"], {
        stdio: "pipe",
        timeout: 5000,
        encoding: "utf8",
      }).trim();
      if (!geminiPath) return FALLBACK;

      const realPath = fs.realpathSync(geminiPath);
      let dir = path.dirname(realPath);
      let configPath = "";
      for (let i = 0; i < 10; i++) {
        const candidate = path.join(
          dir,
          "node_modules",
          "@google",
          "gemini-cli-core",
          "dist",
          "src",
          "config",
          "defaultModelConfigs.js",
        );
        if (fs.existsSync(candidate)) {
          configPath = candidate;
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }

      if (!configPath) return FALLBACK;

      const content = fs.readFileSync(configPath, "utf8");
      const models: CliModelInfoServer[] = [];
      const entryRegex = /["']([a-z][a-z0-9._-]+)["']\s*:\s*\{([^}]*extends\s*:\s*["']chat-base[^"']*["'][^}]*)\}/g;
      let match;
      while ((match = entryRegex.exec(content)) !== null) {
        const slug = match[1];
        if (slug.startsWith("chat-base")) continue;
        models.push({ slug, displayName: slug });
      }

      return models.length > 0 ? models : FALLBACK;
    } catch {
      return FALLBACK;
    }
  }

  async function fetchCursorModelsFromApi(): Promise<CliModelInfoServer[]> {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return [];
    try {
      const resp = await fetch("https://api.cursor.com/v0/models", {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as { models?: string[] };
      if (!data.models || !Array.isArray(data.models)) return [];
      return data.models.filter(Boolean).map((slug) => ({
        slug,
        displayName: slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
    } catch {
      return [];
    }
  }

  async function fetchCursorModelsFromCli(): Promise<CliModelInfoServer[]> {
    try {
      const output = await execWithTimeout("cursor", ["agent", "--list-models"], 10_000);
      const models: CliModelInfoServer[] = [];
      for (const line of output.split(/\r?\n/)) {
        // eslint-disable-next-line no-control-regex
        const stripped = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
        if (!stripped) continue;
        if (/no model|unavailable|available|loading/i.test(stripped)) continue;
        models.push({ slug: stripped, displayName: stripped });
      }
      return models;
    } catch {
      return [];
    }
  }

  async function fetchCursorModels(): Promise<CliModelInfoServer[]> {
    const catalog: CliModelInfoServer[] = [
      { slug: "claude-4.6-opus", displayName: "Claude 4.6 Opus" },
      { slug: "claude-4.6-sonnet", displayName: "Claude 4.6 Sonnet" },
      { slug: "claude-4.5-opus", displayName: "Claude 4.5 Opus" },
      { slug: "claude-4.5-sonnet", displayName: "Claude 4.5 Sonnet" },
      { slug: "claude-4-sonnet-thinking", displayName: "Claude 4 Sonnet (Thinking)" },
      { slug: "claude-4-opus-thinking", displayName: "Claude 4 Opus (Thinking)" },
      { slug: "claude-4.5-haiku", displayName: "Claude 4.5 Haiku" },
      { slug: "gpt-5.3-codex", displayName: "GPT-5.3 Codex" },
      { slug: "gpt-5.2", displayName: "GPT-5.2" },
      { slug: "gpt-5.2-codex", displayName: "GPT-5.2 Codex" },
      { slug: "gpt-5", displayName: "GPT-5" },
      { slug: "gpt-5-mini", displayName: "GPT-5 Mini" },
      { slug: "o3", displayName: "OpenAI o3" },
      { slug: "gemini-3.1-pro", displayName: "Gemini 3.1 Pro" },
      { slug: "gemini-3-flash", displayName: "Gemini 3 Flash" },
      { slug: "gemini-3-pro", displayName: "Gemini 3 Pro" },
      { slug: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { slug: "composer-1.5", displayName: "Composer 1.5" },
      { slug: "grok-code", displayName: "Grok Code" },
    ];

    const seen = new Set(catalog.map((m) => m.slug));

    const [apiModels, cliModels] = await Promise.all([
      fetchCursorModelsFromApi(),
      fetchCursorModelsFromCli(),
    ]);

    for (const m of [...apiModels, ...cliModels]) {
      if (!seen.has(m.slug)) {
        catalog.push(m);
        seen.add(m.slug);
      }
    }

    return catalog;
  }

  function toModelInfo(slug: string): CliModelInfoServer {
    return { slug, displayName: slug };
  }

  function readModelCache(cacheKey: string): any | null {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(cacheKey) as any;
      if (row?.value) return JSON.parse(row.value);
    } catch {
      // ignore malformed cache
    }
    return null;
  }

  function writeModelCache(cacheKey: string, data: any): void {
    try {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(cacheKey, JSON.stringify(data));
    } catch {
      // ignore cache persistence failures
    }
  }

  app.get("/api/cli-models", async (req, res) => {
    const refresh = req.query.refresh === "true";

    if (!refresh) {
      if (cachedCliModels) {
        return res.json({ models: cachedCliModels.data });
      }
      const dbCached = readModelCache("cli_models_cache");
      if (dbCached) {
        cachedCliModels = { data: dbCached, loadedAt: Date.now() };
        return res.json({ models: dbCached });
      }
    }

    const models: Record<string, CliModelInfoServer[]> = {
      claude: [
        "opus",
        "sonnet",
        "haiku",
        "claude-opus-4-6",
        "claude-sonnet-4-6",
        "claude-sonnet-4-5",
        "claude-haiku-4-5",
      ].map(toModelInfo),
      gemini: fetchGeminiModels(),
      opencode: [],
      cursor: await fetchCursorModels(),
    };

    const codexModels = readCodexModelsCache();
    models.codex =
      codexModels.length > 0
        ? codexModels
        : ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-max", "gpt-5.2", "gpt-5.1-codex-mini"].map(toModelInfo);

    try {
      const ocModels = await fetchOpenCodeModels();
      const ocList: string[] = [];
      for (const [, modelList] of Object.entries(ocModels)) {
        for (const m of modelList) {
          if (!ocList.includes(m)) ocList.push(m);
        }
      }
      if (ocList.length > 0) models.opencode = ocList.map(toModelInfo);
    } catch {
      // keep defaults
    }

    cachedCliModels = { data: models, loadedAt: Date.now() };
    writeModelCache("cli_models_cache", models);
    res.json({ models });
  });

  app.get("/api/oauth/models", async (req, res) => {
    const refresh = req.query.refresh === "true";

    if (!refresh) {
      if (cachedModels) {
        return res.json({ models: cachedModels.data });
      }
      const dbCached = readModelCache("oauth_models_cache");
      if (dbCached) {
        cachedModels = { data: dbCached, loadedAt: Date.now() };
        ctx.cachedModels = cachedModels;
        return res.json({ models: dbCached });
      }
    }

    try {
      const [copilotModels, ocModels] = await Promise.all([fetchCopilotModelsFromAPI(), fetchOpenCodeModels()]);

      const merged: Record<string, string[]> = { ...ocModels };

      if (copilotModels.length > 0) {
        const existing = new Set(copilotModels);
        const supplement = (merged.copilot ?? []).filter((m: string) => !existing.has(m));
        merged.copilot = [...new Set([...copilotModels, ...supplement])];
      } else if (merged.copilot) {
        merged.copilot = [...new Set(merged.copilot)];
      }

      if (!merged.copilot || merged.copilot.length === 0) {
        merged.copilot = [
          "github-copilot/claude-sonnet-4.6",
          "github-copilot/claude-sonnet-4.5",
          "github-copilot/claude-3.7-sonnet",
          "github-copilot/claude-3.5-sonnet",
          "github-copilot/gpt-4o",
          "github-copilot/gpt-4.1",
          "github-copilot/o4-mini",
          "github-copilot/gemini-2.5-pro",
        ];
      }

      if (!merged.antigravity || merged.antigravity.length === 0) {
        merged.antigravity = [
          "google/antigravity-gemini-3-pro",
          "google/antigravity-gemini-3-flash",
          "google/antigravity-claude-sonnet-4-5",
          "google/antigravity-claude-sonnet-4-5-thinking",
          "google/antigravity-claude-opus-4-5-thinking",
          "google/antigravity-claude-opus-4-6-thinking",
        ];
      }

      cachedModels = { data: merged, loadedAt: Date.now() };
      ctx.cachedModels = cachedModels;
      writeModelCache("oauth_models_cache", merged);
      res.json({ models: merged });
    } catch (err) {
      res.status(500).json({ error: "model_fetch_failed", message: String(err) });
    }
  });
}
