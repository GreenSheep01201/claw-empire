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
  it("GET /api/departments exposes exactly the two Notion-managed departments", () => {
    const { db, routes } = harness();
    try {
      for (const [id, order] of [["planning", 1], ["dev", 2], ["secretariat", 3], ["qa", 4]] as const) {
        db.prepare("INSERT INTO departments (id, name, name_ja, sort_order) VALUES (?, ?, ?, ?)")
          .run(id, id, id === "dev" ? "🎨 開発部門" : id === "secretariat" ? "🧑‍💼 秘書室" : id, order);
      }
      const marker = (hex: string) => `hermes-member:${hex.repeat(64)}\n\nprofile`;
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)").run("athena", "アテナ", "dev", "development", marker("a"), "team_leader", "idle");
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)").run("hermes", "エルメス", "secretariat", "development", marker("b"), "team_leader", "idle");
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)").run("default", "Default", "planning", "development", "default", "senior", "idle");

      const res = response();
      routes.get("GET /api/departments")?.({ query: { workflow_pack_key: "development" } }, res);
      expect((res.payload as { departments: Array<{ id: string }> }).departments.map(({ id }) => id)).toEqual(["dev", "secretariat"]);
    } finally {
      db.close();
    }
  });
});
