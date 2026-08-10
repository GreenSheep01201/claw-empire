import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { registerDepartmentRoutes } from "./departments.ts";

type RouteHandler = (req: any, res: any) => any;

function response() {
  return {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
  };
}

function harness() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE departments (
      id TEXT PRIMARY KEY, name TEXT, name_ko TEXT, name_ja TEXT, name_zh TEXT,
      icon TEXT, color TEXT, description TEXT, prompt TEXT,
      sort_order INTEGER, created_at INTEGER
    );
    CREATE TABLE agents (
      id TEXT PRIMARY KEY, name TEXT, department_id TEXT, workflow_pack_key TEXT,
      personality TEXT, role TEXT, status TEXT
    );
  `);
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) { routes.set(`GET ${path}`, handler); return this; },
    post(path: string, handler: RouteHandler) { routes.set(`POST ${path}`, handler); return this; },
    patch(path: string, handler: RouteHandler) { routes.set(`PATCH ${path}`, handler); return this; },
    delete(path: string, handler: RouteHandler) { routes.set(`DELETE ${path}`, handler); return this; },
  };
  registerDepartmentRoutes({
    app: app as any,
    db: db as any,
    broadcast: () => {},
    normalizeTextField: (value: unknown) => typeof value === "string" ? value.trim() || null : null,
    runInTransaction: (fn: () => void) => fn(),
  });
  return { db, routes };
}

describe("department Notion scope", () => {
  it("GET /api/departments exposes the complete Notion-managed department catalog", () => {
    const { db, routes } = harness();
    try {
      for (const [id, name, icon, order] of [
        ["planning", "Planning", "📋", 1],
        ["representative", "代表", "👤", 101],
        ["secretariat", "秘書室", "🧑‍💼", 102],
        ["marketing", "マーケティング部門", "📊", 103],
        ["social", "SNS運用部門", "🌏", 104],
        ["sales", "営業部門", "💸", 105],
        ["dev", "開発部門", "🎨", 106],
        ["backoffice", "バックオフィス部門", "⚙️", 107],
        ["qa", "QA", "🔍", 4],
      ] as const) {
        db.prepare("INSERT INTO departments (id, name, name_ja, icon, sort_order) VALUES (?, ?, ?, ?, ?)")
          .run(id, name, name, icon, order);
      }
      const marker = (hex: string) => `hermes-member:${hex.repeat(64)}\n\nprofile`;
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)").run("athena", "アテナ", "dev", "development", marker("a"), "team_leader", "idle");
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)").run("hermes", "エルメス", "secretariat", "development", marker("b"), "team_leader", "idle");
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)").run("default", "Default", "planning", "development", "default", "senior", "idle");

      const res = response();
      routes.get("GET /api/departments")?.({ query: { workflow_pack_key: "development" } }, res);
      expect((res.payload as { departments: Array<{ id: string; name_ja: string; icon: string }> }).departments.map(({ id, name_ja, icon }) => [id, name_ja, icon])).toEqual([
        ["representative", "代表", "👤"],
        ["secretariat", "秘書室", "🧑‍💼"],
        ["marketing", "マーケティング部門", "📊"],
        ["social", "SNS運用部門", "🌏"],
        ["sales", "営業部門", "💸"],
        ["dev", "開発部門", "🎨"],
        ["backoffice", "バックオフィス部門", "⚙️"],
      ]);
    } finally {
      db.close();
    }
  });
});
