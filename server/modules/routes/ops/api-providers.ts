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
  | "cursor"
  | "custom";

type ApiProviderRow = {
  id: string;
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_key_enc: string | null;
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
  cursor: { base_url: "https://api.cursor.com", models_path: "/v0/models", auth_header: "Bearer" },
  custom: { base_url: "", models_path: "/models", auth_header: "Bearer" },
};

function isApiProviderType(value: unknown): value is ApiProviderType {
  return typeof value === "string" && value in API_PROVIDER_PRESETS;
}

function parseBody(req: Request): ApiProviderPayload {
  return (req.body ?? {}) as ApiProviderPayload;
}

function readProvider(db: DatabaseSync, id: string): ApiProviderRow | null {
  const row = db.prepare("SELECT * FROM api_providers WHERE id = ?").get(id) as ApiProviderRow | undefined;
  return row ?? null;
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
    models?: Array<string | { id?: string; name?: string; model?: string }>;
  };

  if (type === "cursor") {
    if (Array.isArray(payload.models)) {
      for (const m of payload.models) {
        const id = typeof m === "string" ? m : (m.id || m.name || m.model || "");
        if (id) models.push(id);
      }
    }
  } else if (type === "google") {
    if (Array.isArray(payload.models)) {
      for (const m of payload.models) {
        if (typeof m === "string") { models.push(m); continue; }
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
        if (typeof m === "string") { models.push(m); continue; }
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
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const baseUrl = typeof body.base_url === "string" ? body.base_url.trim() : "";
    const type: ApiProviderType = isApiProviderType(body.type) ? body.type : "openai";
    const apiKey = typeof body.api_key === "string" ? body.api_key : "";

    if (!name || (!baseUrl && type !== "cursor")) {
      return res.status(400).json({ error: "name and base_url are required" });
    }

    const id = randomUUID();
    const now = nowMs();
    db.prepare(
      "INSERT INTO api_providers (id, name, type, base_url, api_key_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, name, type, baseUrl.replace(/\/+$/, ""), apiKey ? encryptSecret(apiKey) : null, now, now);
    res.json({ ok: true, id });
  });

  app.put("/api/api-providers/:id", (req, res) => {
    const id = String(req.params.id ?? "");
    const body = parseBody(req);
    const updates: string[] = ["updated_at = ?"];
    const params: unknown[] = [nowMs()];

    if ("name" in body && typeof body.name === "string" && body.name.trim()) {
      updates.push("name = ?");
      params.push(body.name.trim());
    }
    if ("type" in body && isApiProviderType(body.type)) {
      updates.push("type = ?");
      params.push(body.type);
    }
    if ("base_url" in body && typeof body.base_url === "string" && body.base_url.trim()) {
      updates.push("base_url = ?");
      params.push(body.base_url.trim().replace(/\/+$/, ""));
    }
    if ("api_key" in body) {
      const apiKey = typeof body.api_key === "string" ? body.api_key : "";
      updates.push("api_key_enc = ?");
      params.push(apiKey ? encryptSecret(apiKey) : null);
    }
    if ("enabled" in body) {
      updates.push("enabled = ?");
      params.push(body.enabled ? 1 : 0);
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
      const models = extractModelIds(row.type, data);
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
      const models = extractModelIds(row.type, data);
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
    res.json({ ok: true, presets: API_PROVIDER_PRESETS });
  });
}
