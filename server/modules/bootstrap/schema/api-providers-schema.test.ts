import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { applyBaseSchema } from "./base-schema.ts";
import { initializeOAuthRuntime } from "./oauth-runtime.ts";
import { applyTaskSchemaMigrations } from "./task-schema-migrations.ts";

function tableColumns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name);
}

function runInTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

describe("api_providers schema migrations", () => {
  it("adds preset_key to legacy rows via task migrations", () => {
    const db = new DatabaseSync(":memory:");

    try {
      applyBaseSchema(db);
      db.exec("DROP TABLE api_providers");
      db.exec(`
        CREATE TABLE api_providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'openai' CHECK(type IN ('openai','anthropic','google','ollama','openrouter','together','groq','cerebras','custom')),
          base_url TEXT NOT NULL,
          api_key_enc TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          models_cache TEXT,
          models_cached_at INTEGER,
          created_at INTEGER DEFAULT (unixepoch()*1000),
          updated_at INTEGER DEFAULT (unixepoch()*1000)
        );
      `);
      db.prepare(
        `
          INSERT INTO api_providers (id, name, type, base_url, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `,
      ).run("legacy-provider", "Legacy Provider", "openai", "https://api.openai.com/v1", 100, 100);

      applyTaskSchemaMigrations(db);

      expect(tableColumns(db, "api_providers")).toContain("preset_key");
      const row = db.prepare("SELECT id, name, preset_key FROM api_providers WHERE id = ?").get("legacy-provider") as {
        id: string;
        name: string;
        preset_key: string | null;
      };
      expect(row).toEqual({
        id: "legacy-provider",
        name: "Legacy Provider",
        preset_key: null,
      });
    } finally {
      db.close();
    }
  });

  it("oauth runtime legacy rebuild keeps rows and adds preset_key", () => {
    const db = new DatabaseSync(":memory:");

    try {
      applyBaseSchema(db);
      db.exec("DROP TABLE api_providers");
      db.exec(`
        CREATE TABLE api_providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'openai' CHECK(type IN ('openai','anthropic','google','ollama','openrouter','together','groq','custom')),
          base_url TEXT NOT NULL,
          api_key_enc TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          models_cache TEXT,
          models_cached_at INTEGER,
          created_at INTEGER DEFAULT (unixepoch()*1000),
          updated_at INTEGER DEFAULT (unixepoch()*1000)
        );
      `);
      db.prepare(
        `
          INSERT INTO api_providers (id, name, type, base_url, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `,
      ).run("old-provider", "Old Provider", "openai", "https://api.openai.com/v1", 200, 200);

      initializeOAuthRuntime({
        db,
        nowMs: () => 1_717_171_717_000,
        runInTransaction: (fn) => runInTransaction(db, fn),
      });

      expect(tableColumns(db, "api_providers")).toContain("preset_key");
      const row = db
        .prepare("SELECT type, base_url, preset_key FROM api_providers WHERE id = ?")
        .get("old-provider") as {
        type: string;
        base_url: string;
        preset_key: string | null;
      };
      expect(row).toEqual({
        type: "openai",
        base_url: "https://api.openai.com/v1",
        preset_key: null,
      });

      const tableSql = (
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'api_providers'").get() as
          | { sql?: string }
          | undefined
      )?.sql;
      expect(tableSql).toContain("'cerebras'");
      expect(tableSql).toContain("'novita'");
    } finally {
      db.close();
    }
  });
});
