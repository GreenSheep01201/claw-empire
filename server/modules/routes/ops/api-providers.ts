import type { Express, Request, Response } from "express";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "../../../oauth/helpers.ts";

type ApiProviderPreset = {
  base_url: string;
  models_path: string;
  auth_header: string;
};

type ApiProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "openrouter"
  | "together"
  | "groq"
  | "cerebras"
  | "custom";

type OfficialApiProviderType = Extract<ApiProviderType, "openai" | "anthropic">;

type OfficialApiProviderPreset = {
  label: string;
  description: string;
  type: OfficialApiProviderType;
  base_url: string;
  docs_url: string;
  api_key_hint: string;
  api_key_placeholder: string;
  fallback_models: string[];
  required_api_key_prefix?: string;
};

type ApiProviderRow = {
  id: string;
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_key_enc: string | null;
  preset_key: string | null;
  enabled: number;
  models_cache: string | null;
  models_cached_at: number | null;
  created_at: number;
  updated_at: number;
};

type ApiProviderPayload = {
  name?: unknown;
  type?: unknown;
  base_url?: unknown;
  api_key?: unknown;
  enabled?: unknown;
  preset_key?: unknown;
};

interface RegisterApiProviderRoutesOptions {
  app: Express;
  db: DatabaseSync;
  nowMs: () => number;
}

const API_PROVIDER_PRESETS: Record<ApiProviderType, ApiProviderPreset> = {
  openai: { base_url: "https://api.openai.com/v1", models_path: "/models", auth_header: "Bearer" },
  anthropic: { base_url: "https://api.anthropic.com/v1", models_path: "/models", auth_header: "x-api-key" },
  google: {
    base_url: "https://generativelanguage.googleapis.com/v1beta",
    models_path: "/models",
    auth_header: "key",
  },
  ollama: { base_url: "http://localhost:11434/v1", models_path: "/models", auth_header: "" },
  openrouter: { base_url: "https://openrouter.ai/api/v1", models_path: "/models", auth_header: "Bearer" },
  together: { base_url: "https://api.together.xyz/v1", models_path: "/models", auth_header: "Bearer" },
  groq: { base_url: "https://api.groq.com/openai/v1", models_path: "/models", auth_header: "Bearer" },
  cerebras: { base_url: "https://api.cerebras.ai/v1", models_path: "/models", auth_header: "Bearer" },
  custom: { base_url: "", models_path: "/models", auth_header: "Bearer" },
};

const OFFICIAL_API_PROVIDER_PRESETS = {
  "opencode-go-openai": {
    label: "OpenCode Go (OpenAI)",
    description: "OpenCode Go direct API preset using the OpenAI-compatible protocol.",
    type: "openai",
    base_url: "https://opencode.ai/zen/go/v1",
    docs_url: "https://opencode.ai/docs/ko/go/",
    api_key_hint: "Use an OpenCode Go direct API key for this endpoint.",
    api_key_placeholder: "sk-...",
    fallback_models: ["glm-5", "kimi-k2.5"],
  },
  "opencode-go-anthropic": {
    label: "OpenCode Go (Anthropic)",
    description: "OpenCode Go direct API preset using the Anthropic-compatible protocol.",
    type: "anthropic",
    base_url: "https://opencode.ai/zen/go/v1",
    docs_url: "https://opencode.ai/docs/ko/go/",
    api_key_hint: "Use an OpenCode Go direct API key for this endpoint.",
    api_key_placeholder: "sk-...",
    fallback_models: ["minimax-m2.5"],
  },
  "minimax-global-openai": {
    label: "MiniMax Global (OpenAI)",
    description: "MiniMax Global API preset using the OpenAI-compatible protocol.",
    type: "openai",
    base_url: "https://api.minimax.io/v1",
    docs_url: "https://platform.minimax.io/docs",
    api_key_hint: "Use a MiniMax API key for this endpoint.",
    api_key_placeholder: "...",
    fallback_models: ["MiniMax-M3", "MiniMax-M2.7"],
  },
  "minimax-global-anthropic": {
    label: "MiniMax Global (Anthropic)",
    description: "MiniMax Global API preset using the Anthropic-compatible protocol.",
    type: "anthropic",
    base_url: "https://api.minimax.io/anthropic",
    docs_url: "https://platform.minimax.io/docs",
    api_key_hint: "Use a MiniMax API key for this endpoint.",
    api_key_placeholder: "...",
    fallback_models: ["MiniMax-M3", "MiniMax-M2.7"],
  },
  "minimax-cn-openai": {
    label: "MiniMax China (OpenAI)",
    description: "MiniMax China API preset using the OpenAI-compatible protocol.",
    type: "openai",
    base_url: "https://api.minimaxi.com/v1",
    docs_url: "https://platform.minimaxi.com/docs",
    api_key_hint: "Use a MiniMax API key for this endpoint.",
    api_key_placeholder: "...",
    fallback_models: ["MiniMax-M3", "MiniMax-M2.7"],
  },
  "minimax-cn-anthropic": {
    label: "MiniMax China (Anthropic)",
    description: "MiniMax China API preset using the Anthropic-compatible protocol.",
    type: "anthropic",
    base_url: "https://api.minimaxi.com/anthropic",
    docs_url: "https://platform.minimaxi.com/docs",
    api_key_hint: "Use a MiniMax API key for this endpoint.",
    api_key_placeholder: "...",
    fallback_models: ["MiniMax-M3", "MiniMax-M2.7"],
  },
  "alibaba-coding-plan-openai": {
    label: "Bailian Coding Plan (OpenAI)",
    description: "Alibaba Bailian Coding Plan direct API preset using the OpenAI-compatible protocol.",
    type: "openai",
    base_url: "https://coding-intl.dashscope.aliyuncs.com/v1",
    docs_url: "https://www.alibabacloud.com/help/en/model-studio/other-tools-coding-plan",
    api_key_hint: "Bailian Coding Plan keys for this preset must start with sk-sp-.",
    api_key_placeholder: "sk-sp-...",
    fallback_models: [
      "qwen3.5-plus",
      "kimi-k2.5",
      "glm-5",
      "MiniMax-M2.5",
      "qwen3-max-2026-01-23",
      "qwen3-coder-next",
      "qwen3-coder-plus",
      "glm-4.7",
    ],
    required_api_key_prefix: "sk-sp-",
  },
  "alibaba-coding-plan-anthropic": {
    label: "Bailian Coding Plan (Anthropic)",
    description: "Alibaba Bailian Coding Plan direct API preset using the Anthropic-compatible protocol.",
    type: "anthropic",
    base_url: "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic",
    docs_url: "https://www.alibabacloud.com/help/en/model-studio/other-tools-coding-plan",
    api_key_hint: "Bailian Coding Plan keys for this preset must start with sk-sp-.",
    api_key_placeholder: "sk-sp-...",
    fallback_models: [
      "qwen3.5-plus",
      "kimi-k2.5",
      "glm-5",
      "MiniMax-M2.5",
      "qwen3-max-2026-01-23",
      "qwen3-coder-next",
      "qwen3-coder-plus",
      "glm-4.7",
    ],
    required_api_key_prefix: "sk-sp-",
  },
} as const satisfies Record<string, OfficialApiProviderPreset>;

type OfficialApiProviderPresetKey = keyof typeof OFFICIAL_API_PROVIDER_PRESETS;

function isApiProviderType(value: unknown): value is ApiProviderType {
  return typeof value === "string" && value in API_PROVIDER_PRESETS;
}

function isOfficialApiProviderPresetKey(value: unknown): value is OfficialApiProviderPresetKey {
  return typeof value === "string" && value in OFFICIAL_API_PROVIDER_PRESETS;
}

function parseBody(req: Request): ApiProviderPayload {
  return (req.body ?? {}) as ApiProviderPayload;
}

function readProvider(db: DatabaseSync, id: string): ApiProviderRow | null {
  const row = db.prepare("SELECT * FROM api_providers WHERE id = ?").get(id) as ApiProviderRow | undefined;
  return row ?? null;
}

function readOfficialPreset(
  presetKey: string | null | undefined,
): { key: OfficialApiProviderPresetKey; preset: OfficialApiProviderPreset } | null {
  if (!presetKey || !isOfficialApiProviderPresetKey(presetKey)) return null;
  return { key: presetKey, preset: OFFICIAL_API_PROVIDER_PRESETS[presetKey] };
}

function parsePresetKeyInput(value: unknown): { valid: boolean; presetKey: OfficialApiProviderPresetKey | null } {
  if (value == null) return { valid: true, presetKey: null };
  if (typeof value !== "string") return { valid: false, presetKey: null };
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, presetKey: null };
  if (!isOfficialApiProviderPresetKey(trimmed)) return { valid: false, presetKey: null };
  return { valid: true, presetKey: trimmed };
}

function buildApiProviderHeaders(type: ApiProviderType, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!apiKey) return headers;
  if (type === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (type !== "google") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

function normalizeApiBaseUrl(rawUrl: string): string {
  let url = rawUrl.replace(/\/+$/, "");
  url = url.replace(/\/v1\/(chat\/completions|models|messages)$/i, "/v1");
  url = url.replace(/\/v1beta\/models\/.+$/i, "/v1beta");
  return url;
}

function buildModelsUrl(type: ApiProviderType, baseUrl: string, apiKey: string): string {
  const preset = API_PROVIDER_PRESETS[type] || API_PROVIDER_PRESETS.custom;
  const base = normalizeApiBaseUrl(baseUrl);
  let url = `${base}${preset.models_path}`;
  if (type === "google" && apiKey) {
    url += `?key=${encodeURIComponent(apiKey)}`;
  }
  return url;
}

function extractModelIds(type: ApiProviderType, data: unknown): string[] {
  const models: string[] = [];
  const payload = data as {
    data?: Array<{ id?: string }>;
    models?: Array<{ id?: string; name?: string; model?: string }>;
  };

  if (type === "google") {
    if (Array.isArray(payload.models)) {
      for (const m of payload.models) {
        const name = m.name || m.model || "";
        if (name) models.push(name.replace(/^models\//, ""));
      }
    }
  } else if (type === "anthropic") {
    if (Array.isArray(payload.data)) {
      for (const m of payload.data) {
        if (m.id) models.push(m.id);
      }
    }
  } else {
    if (Array.isArray(payload.data)) {
      for (const m of payload.data) {
        if (m.id) models.push(m.id);
      }
    } else if (Array.isArray(payload.models)) {
      for (const m of payload.models) {
        const id = m.id || m.name || m.model || "";
        if (id) models.push(id);
      }
    }
  }
  return models.sort();
}

function parseModelsCache(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v).trim()).filter((v) => v.length > 0) : [];
  } catch {
    return [];
  }
}

function mergeModelLists(...groups: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const model = String(raw ?? "").trim();
      if (!model || seen.has(model)) continue;
      seen.add(model);
      merged.push(model);
    }
  }
  return merged;
}

function validateOfficialPresetApiKey(preset: OfficialApiProviderPreset | null, apiKey: string): string | null {
  if (!preset?.required_api_key_prefix || !apiKey) return null;
  if (!apiKey.startsWith(preset.required_api_key_prefix)) {
    return `API key for ${preset.label} must start with ${preset.required_api_key_prefix}`;
  }
  return null;
}

function resolveApiKeyForPresetValidation(params: {
  officialPreset: OfficialApiProviderPreset | null;
  incomingApiKey: string | null;
  retainedEncryptedApiKey: string | null;
  shouldReuseStoredKey: boolean;
}): string {
  const { officialPreset, incomingApiKey, retainedEncryptedApiKey, shouldReuseStoredKey } = params;
  if (!officialPreset) return "";
  if (incomingApiKey !== null) return incomingApiKey;
  if (!shouldReuseStoredKey || !retainedEncryptedApiKey) return "";
  return decryptSecret(retainedEncryptedApiKey);
}

function sendNotFound(res: Response): void {
  res.status(404).json({ error: "not_found" });
}

export function registerApiProviderRoutes({ app, db, nowMs }: RegisterApiProviderRoutesOptions): void {
  app.get("/api/api-providers", (_req, res) => {
    const rows = db.prepare("SELECT * FROM api_providers ORDER BY created_at ASC").all() as ApiProviderRow[];
    const providers = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      base_url: row.base_url,
      preset_key: row.preset_key ?? null,
      has_api_key: Boolean(row.api_key_enc),
      enabled: Boolean(row.enabled),
      models_cache: parseModelsCache(row.models_cache),
      models_cached_at: row.models_cached_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    res.json({ ok: true, providers });
  });

  app.post("/api/api-providers", (req, res) => {
    const body = parseBody(req);
    const presetKeyInput = parsePresetKeyInput(body.preset_key);
    if (!presetKeyInput.valid) {
      return res.status(400).json({ error: "invalid preset_key" });
    }
    const officialPreset = presetKeyInput.presetKey ? OFFICIAL_API_PROVIDER_PRESETS[presetKeyInput.presetKey] : null;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const baseUrl = officialPreset?.base_url ?? (typeof body.base_url === "string" ? body.base_url.trim() : "");
    const type: ApiProviderType = officialPreset?.type ?? (isApiProviderType(body.type) ? body.type : "openai");
    const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";

    if (!name || !baseUrl) {
      return res.status(400).json({ error: "name and base_url are required" });
    }

    const apiKeyError = validateOfficialPresetApiKey(officialPreset, apiKey);
    if (apiKeyError) {
      return res.status(400).json({ error: apiKeyError });
    }

    const id = randomUUID();
    const now = nowMs();
    const seededModels = mergeModelLists(officialPreset?.fallback_models ?? []);
    db.prepare(
      `
        INSERT INTO api_providers (
          id, name, type, base_url, api_key_enc, preset_key, enabled,
          models_cache, models_cached_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `,
    ).run(
      id,
      name,
      type,
      baseUrl.replace(/\/+$/, ""),
      apiKey ? encryptSecret(apiKey) : null,
      presetKeyInput.presetKey,
      seededModels.length ? JSON.stringify(seededModels) : null,
      seededModels.length ? now : null,
      now,
      now,
    );
    res.json({ ok: true, id });
  });

  app.put("/api/api-providers/:id", (req, res) => {
    const id = String(req.params.id ?? "");
    const row = readProvider(db, id);
    if (!row) return sendNotFound(res);

    const body = parseBody(req);
    const existingPreset = readOfficialPreset(row.preset_key);
    const presetKeyInput = "preset_key" in body ? parsePresetKeyInput(body.preset_key) : null;
    if (presetKeyInput && !presetKeyInput.valid) {
      return res.status(400).json({ error: "invalid preset_key" });
    }
    const nextPresetKey = presetKeyInput ? presetKeyInput.presetKey : (existingPreset?.key ?? null);
    const officialPreset = nextPresetKey ? OFFICIAL_API_PROVIDER_PRESETS[nextPresetKey] : null;
    const updates: string[] = ["updated_at = ?"];
    const now = nowMs();
    const params: unknown[] = [now];
    const existingPresetKey = existingPreset?.key ?? null;
    const incomingApiKey = "api_key" in body ? (typeof body.api_key === "string" ? body.api_key.trim() : "") : null;
    const isPresetTransition = presetKeyInput != null && presetKeyInput.presetKey !== existingPresetKey;
    const shouldReuseStoredKeyForValidation = incomingApiKey === null && isPresetTransition;
    const nextManualType = "type" in body && isApiProviderType(body.type) ? body.type : row.type;
    const nextManualBaseUrl =
      "base_url" in body && typeof body.base_url === "string" && body.base_url.trim()
        ? body.base_url.trim().replace(/\/+$/, "")
        : row.base_url;
    const nextType = officialPreset?.type ?? nextManualType;
    const nextBaseUrl = officialPreset?.base_url ?? nextManualBaseUrl;
    const shouldInvalidateModelCache =
      nextPresetKey !== existingPresetKey ||
      nextType !== row.type ||
      normalizeApiBaseUrl(nextBaseUrl) !== normalizeApiBaseUrl(row.base_url);

    if ("name" in body && typeof body.name === "string" && body.name.trim()) {
      updates.push("name = ?");
      params.push(body.name.trim());
    }
    if (officialPreset && (incomingApiKey !== null || isPresetTransition)) {
      const apiKeyToValidate = resolveApiKeyForPresetValidation({
        officialPreset,
        incomingApiKey,
        retainedEncryptedApiKey: row.api_key_enc,
        shouldReuseStoredKey: shouldReuseStoredKeyForValidation,
      });
      const apiKeyError = validateOfficialPresetApiKey(officialPreset, apiKeyToValidate);
      if (apiKeyError) {
        return res.status(400).json({ error: apiKeyError });
      }
    }
    if (incomingApiKey !== null) {
      updates.push("api_key_enc = ?");
      params.push(incomingApiKey ? encryptSecret(incomingApiKey) : null);
    }
    if ("enabled" in body) {
      updates.push("enabled = ?");
      params.push(body.enabled ? 1 : 0);
    }
    if (officialPreset) {
      updates.push("preset_key = ?");
      params.push(nextPresetKey);
      updates.push("type = ?");
      params.push(officialPreset.type);
      updates.push("base_url = ?");
      params.push(officialPreset.base_url);

      const mergedModels = shouldInvalidateModelCache
        ? mergeModelLists(officialPreset.fallback_models)
        : mergeModelLists(officialPreset.fallback_models, parseModelsCache(row.models_cache));
      if (mergedModels.length > 0) {
        const mergedJson = JSON.stringify(mergedModels);
        if (shouldInvalidateModelCache || mergedJson !== (row.models_cache ?? "") || row.models_cached_at == null) {
          updates.push("models_cache = ?");
          params.push(mergedJson);
          updates.push("models_cached_at = ?");
          params.push(shouldInvalidateModelCache ? now : (row.models_cached_at ?? now));
        }
      }
    } else {
      if ("preset_key" in body) {
        updates.push("preset_key = ?");
        params.push(null);
      }
      if ("type" in body && isApiProviderType(body.type)) {
        updates.push("type = ?");
        params.push(body.type);
      }
      if ("base_url" in body && typeof body.base_url === "string" && body.base_url.trim()) {
        updates.push("base_url = ?");
        params.push(body.base_url.trim().replace(/\/+$/, ""));
      }
      if (shouldInvalidateModelCache) {
        updates.push("models_cache = ?");
        params.push(null);
        updates.push("models_cached_at = ?");
        params.push(null);
      }
    }

    params.push(id);
    const result = db
      .prepare(`UPDATE api_providers SET ${updates.join(", ")} WHERE id = ?`)
      .run(...(params as SQLInputValue[]));

    if (result.changes === 0) return sendNotFound(res);
    res.json({ ok: true });
  });

  app.delete("/api/api-providers/:id", (req, res) => {
    const id = String(req.params.id ?? "");
    const result = db.prepare("DELETE FROM api_providers WHERE id = ?").run(id);
    if (result.changes === 0) return sendNotFound(res);
    res.json({ ok: true });
  });

  app.post("/api/api-providers/:id/test", async (req, res) => {
    const id = String(req.params.id ?? "");
    const row = readProvider(db, id);
    if (!row) return sendNotFound(res);

    const officialPreset = readOfficialPreset(row.preset_key)?.preset ?? null;
    const apiKey = row.api_key_enc ? decryptSecret(row.api_key_enc) : "";
    const url = buildModelsUrl(row.type, row.base_url, apiKey);
    const headers = buildApiProviderHeaders(row.type, apiKey);

    try {
      const resp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        return res.json({ ok: false, status: resp.status, error: errBody.slice(0, 500) });
      }

      const data = await resp.json();
      const models = mergeModelLists(officialPreset?.fallback_models ?? [], extractModelIds(row.type, data));
      const now = nowMs();
      db.prepare("UPDATE api_providers SET models_cache = ?, models_cached_at = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(models),
        now,
        now,
        id,
      );
      res.json({ ok: true, model_count: models.length, models });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.json({ ok: false, error: message });
    }
  });

  app.get("/api/api-providers/:id/models", async (req, res) => {
    const id = String(req.params.id ?? "");
    const refresh = req.query.refresh === "true";
    const row = readProvider(db, id);
    if (!row) return sendNotFound(res);

    const officialPreset = readOfficialPreset(row.preset_key)?.preset ?? null;
    const cachedModels = parseModelsCache(row.models_cache);
    if (!refresh && row.models_cache) {
      return res.json({ ok: true, models: cachedModels, cached: true });
    }

    const apiKey = row.api_key_enc ? decryptSecret(row.api_key_enc) : "";
    const url = buildModelsUrl(row.type, row.base_url, apiKey);
    const headers = buildApiProviderHeaders(row.type, apiKey);

    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!resp.ok) {
        if (row.models_cache) {
          return res.json({ ok: true, models: cachedModels, cached: true, stale: true });
        }
        return res.status(502).json({ error: `upstream returned ${resp.status}` });
      }
      const data = await resp.json();
      const models = mergeModelLists(officialPreset?.fallback_models ?? [], extractModelIds(row.type, data));
      const now = nowMs();
      db.prepare("UPDATE api_providers SET models_cache = ?, models_cached_at = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(models),
        now,
        now,
        id,
      );
      res.json({ ok: true, models, cached: false });
    } catch (error) {
      if (row.models_cache) {
        return res.json({ ok: true, models: cachedModels, cached: true, stale: true });
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: message });
    }
  });

  app.get("/api/api-providers/presets", (_req, res) => {
    res.json({ ok: true, presets: API_PROVIDER_PRESETS, official_presets: OFFICIAL_API_PROVIDER_PRESETS });
  });
}
