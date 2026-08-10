import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { registerAgentCrudRoutes } from "./crud.ts";

type RouteHandler = (req: any, res: any) => any;

type FakeResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
};

function createFakeResponse(): FakeResponse {
  return {
    statusCode: 200,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function createHarness(): { db: DatabaseSync; routes: Map<string, RouteHandler> } {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT,
      name_ko TEXT,
      color TEXT
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ko TEXT NOT NULL DEFAULT '',
      name_ja TEXT NOT NULL DEFAULT '',
      name_zh TEXT NOT NULL DEFAULT '',
      department_id TEXT,
      role TEXT NOT NULL,
      acts_as_planning_leader INTEGER NOT NULL DEFAULT 0,
      cli_provider TEXT,
      oauth_account_id TEXT,
      api_provider_id TEXT,
      api_model TEXT,
      cli_model TEXT,
      cli_reasoning_level TEXT,
      avatar_emoji TEXT NOT NULL DEFAULT '🤖',
      sprite_number INTEGER,
      personality TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task_id TEXT,
      stats_tasks_done INTEGER NOT NULL DEFAULT 0,
      stats_xp INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      assigned_agent_id TEXT
    );

    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY,
      assigned_agent_id TEXT
    );

    CREATE TABLE meeting_minute_entries (
      id INTEGER PRIMARY KEY,
      speaker_agent_id TEXT,
      speaker_name TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE TABLE task_report_archives (
      id TEXT PRIMARY KEY,
      generated_by_agent_id TEXT
    );

    CREATE TABLE project_review_decision_states (
      id TEXT PRIMARY KEY,
      planner_agent_id TEXT
    );

    CREATE TABLE review_round_decision_states (
      meeting_id TEXT PRIMARY KEY,
      snapshot_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      planner_summary TEXT,
      planner_agent_id TEXT,
      planner_agent_name TEXT
    );

    CREATE TABLE project_agents (
      project_id TEXT NOT NULL,
      agent_id TEXT NOT NULL
    );
  `);

  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
      return this;
    },
    post(path: string, handler: RouteHandler) {
      routes.set(`POST ${path}`, handler);
      return this;
    },
    patch(path: string, handler: RouteHandler) {
      routes.set(`PATCH ${path}`, handler);
      return this;
    },
    delete(path: string, handler: RouteHandler) {
      routes.set(`DELETE ${path}`, handler);
      return this;
    },
  };

  registerAgentCrudRoutes({
    app: app as any,
    db: db as any,
    broadcast: () => {},
    runInTransaction: (fn: () => void) => fn(),
    nowMs: () => Date.now(),
    meetingPresenceUntil: new Map(),
    meetingSeatIndexByAgent: new Map(),
    meetingPhaseByAgent: new Map(),
    meetingTaskIdByAgent: new Map(),
    meetingReviewDecisionByAgent: new Map(),
  } as any);

  return { db, routes };
}

describe("agent CRUD seed filter", () => {
  it("GET /api/agents 기본 응답은 seed 에이전트를 제외한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO departments (id, name, name_ko, color) VALUES ('dev', 'Dev', '개발팀', '#3b82f6')").run();
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 1)",
      ).run("dev-leader", "Dev Leader");
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 2)",
      ).run("video_preprod-seed-2", "Video Seed");

      const handler = routes.get("GET /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ query: {} }, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { agents: Array<{ id: string }> };
      expect(payload.agents.map((agent) => agent.id)).toEqual(["dev-leader"]);
    } finally {
      db.close();
    }
  });

  it("GET /api/agents?include_seed=true 는 seed 에이전트를 포함한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO departments (id, name, name_ko, color) VALUES ('dev', 'Dev', '개발팀', '#3b82f6')").run();
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 1)",
      ).run("dev-leader", "Dev Leader");
      db.prepare(
        "INSERT INTO agents (id, name, department_id, role, status, created_at) VALUES (?, ?, 'dev', 'team_leader', 'idle', 2)",
      ).run("video_preprod-seed-2", "Video Seed");

      const handler = routes.get("GET /api/agents");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ query: { include_seed: "true" } }, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as { agents: Array<{ id: string }> };
      expect(payload.agents.map((agent) => agent.id)).toEqual(["dev-leader", "video_preprod-seed-2"]);
    } finally {
      db.close();
    }
  });

  it("DELETE /api/agents/:id preserves denormalized meeting and review attribution", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare(
        "INSERT INTO agents (id, name, role, status, created_at) VALUES (?, ?, 'senior', 'idle', 1)",
      ).run("historical-agent", "Historical Agent");
      db.prepare(
        "INSERT INTO meeting_minute_entries (id, speaker_agent_id, speaker_name, content) VALUES (1, ?, ?, ?)",
      ).run("historical-agent", "Historical Agent", "Retained meeting content");
      db.prepare(
        `INSERT INTO review_round_decision_states
          (meeting_id, snapshot_hash, status, planner_summary, planner_agent_id, planner_agent_name)
         VALUES ('meeting-1', 'snapshot-1', 'ready', 'Retained planner summary', ?, ?)`,
      ).run("historical-agent", "Historical Agent");

      const handler = routes.get("DELETE /api/agents/:id");
      expect(handler).toBeTypeOf("function");
      const res = createFakeResponse();
      handler?.({ params: { id: "historical-agent" } }, res);

      expect(res.statusCode).toBe(200);
      expect(db.prepare("SELECT id FROM agents WHERE id = ?").get("historical-agent")).toBeUndefined();
      expect(
        db.prepare(
          "SELECT speaker_agent_id, speaker_name, content FROM meeting_minute_entries WHERE id = 1",
        ).get(),
      ).toEqual({
        speaker_agent_id: null,
        speaker_name: "Historical Agent",
        content: "Retained meeting content",
      });
      expect(
        db.prepare(
          `SELECT snapshot_hash, status, planner_summary, planner_agent_id, planner_agent_name
           FROM review_round_decision_states WHERE meeting_id = 'meeting-1'`,
        ).get(),
      ).toEqual({
        snapshot_hash: "snapshot-1",
        status: "ready",
        planner_summary: "Retained planner summary",
        planner_agent_id: null,
        planner_agent_name: "Historical Agent",
      });
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id 는 팩 내 기존 Lead가 있으면 409를 반환한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("officeWorkflowPack", "video_preprod");
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackProfiles",
        JSON.stringify({
          video_preprod: {
            departments: [{ id: "planning" }],
            agents: [{ id: "video_preprod-seed-1" }, { id: "video_preprod-seed-2" }],
          },
        }),
      );
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-1", "Lead A", 1, 1);
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-2", "Lead B", 0, 2);

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");
      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "video_preprod-seed-2" },
          body: {
            acts_as_planning_leader: 1,
            workflow_pack_key: "video_preprod",
          },
        },
        res,
      );

      expect(res.statusCode).toBe(409);
      expect((res.payload as { error?: string }).error).toBe("planning_leader_exists");
    } finally {
      db.close();
    }
  });

  it("PATCH /api/agents/:id force override 로 팩 리더를 교체한다", () => {
    const { db, routes } = createHarness();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("officeWorkflowPack", "video_preprod");
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "officePackProfiles",
        JSON.stringify({
          video_preprod: {
            departments: [{ id: "planning" }],
            agents: [{ id: "video_preprod-seed-1" }, { id: "video_preprod-seed-2" }],
          },
        }),
      );
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-1", "Lead A", 1, 1);
      db.prepare(
        "INSERT INTO agents (id, name, role, acts_as_planning_leader, created_at) VALUES (?, ?, 'team_leader', ?, ?)",
      ).run("video_preprod-seed-2", "Lead B", 0, 2);

      const handler = routes.get("PATCH /api/agents/:id");
      expect(handler).toBeTypeOf("function");
      const res = createFakeResponse();
      handler?.(
        {
          params: { id: "video_preprod-seed-2" },
          body: {
            acts_as_planning_leader: 1,
            workflow_pack_key: "video_preprod",
            force_planning_leader_override: true,
          },
        },
        res,
      );

      expect(res.statusCode).toBe(200);
      const before = db
        .prepare("SELECT acts_as_planning_leader FROM agents WHERE id = ?")
        .get("video_preprod-seed-1") as { acts_as_planning_leader: number } | undefined;
      const after = db
        .prepare("SELECT acts_as_planning_leader FROM agents WHERE id = ?")
        .get("video_preprod-seed-2") as { acts_as_planning_leader: number } | undefined;
      expect(before?.acts_as_planning_leader).toBe(0);
      expect(after?.acts_as_planning_leader).toBe(1);

      const profileRow = db.prepare("SELECT value FROM settings WHERE key = 'officePackProfiles'").get() as
        | { value?: string }
        | undefined;
      const parsed = profileRow?.value ? (JSON.parse(profileRow.value) as any) : null;
      const leadFlags = (parsed?.video_preprod?.agents ?? []).map((agent: any) => ({
        id: agent.id,
        acts: agent.acts_as_planning_leader ?? 0,
      }));
      expect(leadFlags).toEqual([
        { id: "video_preprod-seed-1", acts: 0 },
        { id: "video_preprod-seed-2", acts: 1 },
      ]);
    } finally {
      db.close();
    }
  });
});
