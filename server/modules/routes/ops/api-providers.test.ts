import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { applyTaskSchemaMigrations } from "../../bootstrap/schema/task-schema-migrations.ts";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function createHarness(now = 1_717_171_717_000) {
  process.env.SESSION_SECRET = "api-provider-test-secret";
  vi.resetModules();

  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  applyTaskSchemaMigrations(db);

  const app = express();
  app.use(express.json());

  const { registerApiProviderRoutes } = await import("./api-providers.ts");
  registerApiProviderRoutes({
    app,
    db,
    nowMs: () => now,
  });

  return { app, db };
}

describe("api provider routes", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, SESSION_SECRET: "api-provider-test-secret" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns generic presets and official preset catalog", async () => {
    const { app, db } = await createHarness();

    try {
      const response = await request(app).get("/api/api-providers/presets").expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.presets.openai.base_url).toBe("https://api.openai.com/v1");
      expect(response.body.official_presets["opencode-go-openai"]).toMatchObject({
        type: "openai",
        base_url: "https://opencode.ai/zen/go/v1",
      });
      expect(response.body.official_presets["alibaba-coding-plan-openai"].fallback_models).toContain("qwen3.5-plus");
    } finally {
      db.close();
    }
  });

  it("creates a preset-backed provider with authoritative type/base_url and seeded models", async () => {
    const { app, db } = await createHarness();

    try {
      const createResponse = await request(app).post("/api/api-providers").send({
        name: "OpenCode Go",
        type: "custom",
        base_url: "https://example.com/not-used",
        preset_key: "opencode-go-openai",
        api_key: "sk-test-open",
      });

      expect(createResponse.status).toBe(200);
      expect(createResponse.body.ok).toBe(true);

      const row = db
        .prepare(
          `
            SELECT name, type, base_url, preset_key, models_cache, models_cached_at
            FROM api_providers
            WHERE id = ?
          `,
        )
        .get(createResponse.body.id) as
        | {
            name: string;
            type: string;
            base_url: string;
            preset_key: string | null;
            models_cache: string | null;
            models_cached_at: number | null;
          }
        | undefined;

      expect(row).toMatchObject({
        name: "OpenCode Go",
        type: "openai",
        base_url: "https://opencode.ai/zen/go/v1",
        preset_key: "opencode-go-openai",
      });
      expect(JSON.parse(String(row?.models_cache))).toEqual(["glm-5", "kimi-k2.5"]);
      expect(row?.models_cached_at).toBe(1_717_171_717_000);

      const listResponse = await request(app).get("/api/api-providers").expect(200);
      expect(listResponse.body.providers[0]).toMatchObject({
        preset_key: "opencode-go-openai",
        type: "openai",
        base_url: "https://opencode.ai/zen/go/v1",
        models_cache: ["glm-5", "kimi-k2.5"],
      });
    } finally {
      db.close();
    }
  });

  it("rejects invalid Bailian Coding Plan API keys on update", async () => {
    const { app, db } = await createHarness();

    try {
      const insertResult = db
        .prepare(
          `
            INSERT INTO api_providers (id, name, type, base_url, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
          `,
        )
        .run("provider-1", "Legacy", "openai", "https://api.openai.com/v1", 1_000, 1_000);

      expect(insertResult.changes).toBe(1);

      const response = await request(app).put("/api/api-providers/provider-1").send({
        preset_key: "alibaba-coding-plan-openai",
        api_key: "sk-invalid-prefix",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("sk-sp-");

      const row = db.prepare("SELECT preset_key, models_cache FROM api_providers WHERE id = ?").get("provider-1") as {
        preset_key: string | null;
        models_cache: string | null;
      };
      expect(row.preset_key).toBeNull();
      expect(row.models_cache).toBeNull();
    } finally {
      db.close();
    }
  });

  it("rejects retained invalid keys when switching to a Bailian preset", async () => {
    const { app, db } = await createHarness();

    try {
      const { encryptSecret } = await import("../../../oauth/helpers.ts");
      const insertResult = db
        .prepare(
          `
            INSERT INTO api_providers (id, name, type, base_url, api_key_enc, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          `,
        )
        .run(
          "provider-legacy-key",
          "Legacy",
          "openai",
          "https://api.openai.com/v1",
          encryptSecret("sk-legacy-openai"),
          1_000,
          1_000,
        );

      expect(insertResult.changes).toBe(1);

      const response = await request(app).put("/api/api-providers/provider-legacy-key").send({
        preset_key: "alibaba-coding-plan-openai",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("sk-sp-");

      const row = db
        .prepare("SELECT preset_key, type, base_url FROM api_providers WHERE id = ?")
        .get("provider-legacy-key") as {
        preset_key: string | null;
        type: string;
        base_url: string;
      };
      expect(row).toMatchObject({
        preset_key: null,
        type: "openai",
        base_url: "https://api.openai.com/v1",
      });
    } finally {
      db.close();
    }
  });

  it("prefers an explicitly entered replacement key over a retained incompatible key during preset switch", async () => {
    const { app, db } = await createHarness();

    try {
      const { encryptSecret } = await import("../../../oauth/helpers.ts");
      const insertResult = db
        .prepare(
          `
            INSERT INTO api_providers (id, name, type, base_url, api_key_enc, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          `,
        )
        .run(
          "provider-explicit-key",
          "Legacy",
          "openai",
          "https://api.openai.com/v1",
          encryptSecret("sk-legacy-openai"),
          1_000,
          1_000,
        );

      expect(insertResult.changes).toBe(1);

      const response = await request(app).put("/api/api-providers/provider-explicit-key").send({
        preset_key: "alibaba-coding-plan-openai",
        api_key: "sk-sp-valid-replacement",
      });

      expect(response.status).toBe(200);

      const row = db
        .prepare("SELECT preset_key, type, base_url FROM api_providers WHERE id = ?")
        .get("provider-explicit-key") as {
        preset_key: string | null;
        type: string;
        base_url: string;
      };
      expect(row).toEqual({
        preset_key: "alibaba-coding-plan-openai",
        type: "openai",
        base_url: "https://coding-intl.dashscope.aliyuncs.com/v1",
      });
    } finally {
      db.close();
    }
  });

  it("replaces stale cached models when switching into a preset", async () => {
    const { app, db } = await createHarness();

    try {
      const insertResult = db
        .prepare(
          `
            INSERT INTO api_providers (
              id, name, type, base_url, enabled, models_cache, models_cached_at, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
          `,
        )
        .run(
          "provider-stale-cache",
          "Legacy",
          "openai",
          "https://api.openai.com/v1",
          JSON.stringify(["gpt-4.1", "claude-3-7-sonnet"]),
          999,
          1_000,
          1_000,
        );

      expect(insertResult.changes).toBe(1);

      const response = await request(app).put("/api/api-providers/provider-stale-cache").send({
        preset_key: "opencode-go-openai",
      });

      expect(response.status).toBe(200);

      const row = db
        .prepare("SELECT preset_key, type, base_url, models_cache, models_cached_at FROM api_providers WHERE id = ?")
        .get("provider-stale-cache") as {
        preset_key: string | null;
        type: string;
        base_url: string;
        models_cache: string | null;
        models_cached_at: number | null;
      };

      expect(row.preset_key).toBe("opencode-go-openai");
      expect(row.type).toBe("openai");
      expect(row.base_url).toBe("https://opencode.ai/zen/go/v1");
      expect(JSON.parse(String(row.models_cache))).toEqual(["glm-5", "kimi-k2.5"]);
      expect(row.models_cached_at).toBe(1_717_171_717_000);
    } finally {
      db.close();
    }
  });

  it("clears cached models when leaving preset mode", async () => {
    const { app, db } = await createHarness();

    try {
      const insertResult = db
        .prepare(
          `
            INSERT INTO api_providers (
              id, name, type, base_url, preset_key, enabled, models_cache, models_cached_at, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
          `,
        )
        .run(
          "provider-leave-preset",
          "Preset Provider",
          "openai",
          "https://opencode.ai/zen/go/v1",
          "opencode-go-openai",
          JSON.stringify(["glm-5", "kimi-k2.5"]),
          1_111,
          1_000,
          1_000,
        );

      expect(insertResult.changes).toBe(1);

      const response = await request(app).put("/api/api-providers/provider-leave-preset").send({
        preset_key: null,
        type: "custom",
        base_url: "https://custom.example/v1",
      });

      expect(response.status).toBe(200);

      const row = db
        .prepare("SELECT preset_key, type, base_url, models_cache, models_cached_at FROM api_providers WHERE id = ?")
        .get("provider-leave-preset") as {
        preset_key: string | null;
        type: string;
        base_url: string;
        models_cache: string | null;
        models_cached_at: number | null;
      };

      expect(row).toEqual({
        preset_key: null,
        type: "custom",
        base_url: "https://custom.example/v1",
        models_cache: null,
        models_cached_at: null,
      });
    } finally {
      db.close();
    }
  });

  it("returns novita-ai in the official presets catalog with correct metadata", async () => {
    const { app, db } = await createHarness();

    try {
      const response = await request(app).get("/api/api-providers/presets").expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.presets.novita.base_url).toBe("https://api.novita.ai/openai");
      expect(response.body.official_presets["novita-ai"]).toMatchObject({
        type: "novita",
        base_url: "https://api.novita.ai/openai",
      });
      expect(response.body.official_presets["novita-ai"].fallback_models).toContain("moonshotai/kimi-k2.5");
    } finally {
      db.close();
    }
  });

  it("creates a novita-ai preset-backed provider with seeded fallback models", async () => {
    const { app, db } = await createHarness();

    try {
      const createResponse = await request(app).post("/api/api-providers").send({
        name: "Novita AI",
        preset_key: "novita-ai",
        api_key: "test-novita-key",
      });

      expect(createResponse.status).toBe(200);
      expect(createResponse.body.ok).toBe(true);

      const row = db
        .prepare("SELECT name, type, base_url, preset_key, models_cache FROM api_providers WHERE id = ?")
        .get(createResponse.body.id) as
        | { name: string; type: string; base_url: string; preset_key: string | null; models_cache: string | null }
        | undefined;

      expect(row).toMatchObject({
        name: "Novita AI",
        type: "novita",
        base_url: "https://api.novita.ai/openai",
        preset_key: "novita-ai",
      });
      const models = JSON.parse(String(row?.models_cache));
      expect(models).toContain("moonshotai/kimi-k2.5");
      expect(models).toContain("deepseek/deepseek-v3.2");
      expect(models).toContain("zai-org/glm-5");
    } finally {
      db.close();
    }
  });

  it("merges fetched models with preset fallback models during test", async () => {
    const { app, db } = await createHarness();

    try {
      const createResponse = await request(app).post("/api/api-providers").send({
        name: "OpenCode Go",
        type: "openai",
        base_url: "https://ignored.example",
        preset_key: "opencode-go-openai",
      });

      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ id: "glm-5" }, { id: "deepseek-v3" }] }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      const response = await request(app).post(`/api/api-providers/${createResponse.body.id}/test`).expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        model_count: 3,
        models: ["glm-5", "kimi-k2.5", "deepseek-v3"],
      });

      const row = db.prepare("SELECT models_cache FROM api_providers WHERE id = ?").get(createResponse.body.id) as {
        models_cache: string | null;
      };
      expect(JSON.parse(String(row.models_cache))).toEqual(["glm-5", "kimi-k2.5", "deepseek-v3"]);
    } finally {
      db.close();
    }
  });

  it("keeps seeded fallback cache when model refresh fails", async () => {
    const { app, db } = await createHarness();

    try {
      const createResponse = await request(app).post("/api/api-providers").send({
        name: "Bailian Coding Plan",
        type: "openai",
        base_url: "https://ignored.example",
        preset_key: "alibaba-coding-plan-openai",
      });

      const fetchMock = vi.fn().mockResolvedValueOnce(new Response("upstream failed", { status: 502 }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      const response = await request(app)
        .get(`/api/api-providers/${createResponse.body.id}/models?refresh=true`)
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.cached).toBe(true);
      expect(response.body.stale).toBe(true);
      expect(response.body.models).toEqual([
        "qwen3.5-plus",
        "kimi-k2.5",
        "glm-5",
        "MiniMax-M2.5",
        "qwen3-max-2026-01-23",
        "qwen3-coder-next",
        "qwen3-coder-plus",
        "glm-4.7",
      ]);
    } finally {
      db.close();
    }
  });
});
