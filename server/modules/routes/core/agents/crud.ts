import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import type { MeetingReviewDecision } from "../../shared/types.ts";

export function registerAgentCrudRoutes(ctx: RuntimeContext): void {
  const {
    app,
    db,
    broadcast,
    runInTransaction,
    nowMs,
    meetingPresenceUntil,
    meetingSeatIndexByAgent,
    meetingPhaseByAgent,
    meetingTaskIdByAgent,
    meetingReviewDecisionByAgent,
  } = ctx;

  app.get("/api/agents", (_req, res) => {
    const agents = db
      .prepare(
        `
    SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
    FROM agents a
    LEFT JOIN departments d ON a.department_id = d.id
    ORDER BY a.department_id, a.role, a.name
  `,
      )
      .all();
    res.json({ agents });
  });

  app.get("/api/meeting-presence", (_req, res) => {
    const now = nowMs();
    const presence: Array<{
      agent_id: string;
      seat_index: number;
      phase: "kickoff" | "review";
      task_id: string | null;
      decision: MeetingReviewDecision | null;
      until: number;
    }> = [];

    for (const [agentId, until] of meetingPresenceUntil.entries()) {
      if (until < now) {
        meetingPresenceUntil.delete(agentId);
        meetingSeatIndexByAgent.delete(agentId);
        meetingPhaseByAgent.delete(agentId);
        meetingTaskIdByAgent.delete(agentId);
        meetingReviewDecisionByAgent.delete(agentId);
        continue;
      }
      const phase = meetingPhaseByAgent.get(agentId) ?? "kickoff";
      presence.push({
        agent_id: agentId,
        seat_index: meetingSeatIndexByAgent.get(agentId) ?? 0,
        phase,
        task_id: meetingTaskIdByAgent.get(agentId) ?? null,
        decision: phase === "review" ? (meetingReviewDecisionByAgent.get(agentId) ?? "reviewing") : null,
        until,
      });
    }

    presence.sort((a, b) => a.seat_index - b.seat_index);
    res.json({ presence });
  });

  app.get("/api/agents/:id", (req, res) => {
    const id = String(req.params.id);
    const agent = db
      .prepare(
        `
    SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
    FROM agents a
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE a.id = ?
  `,
      )
      .get(id);
    if (!agent) return res.status(404).json({ error: "not_found" });

    const recentTasks = db
      .prepare("SELECT * FROM tasks WHERE assigned_agent_id = ? ORDER BY updated_at DESC LIMIT 10")
      .all(id);

    res.json({ agent, recent_tasks: recentTasks });
  });

  app.post("/api/agents", (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const name_ko = typeof body.name_ko === "string" ? body.name_ko.trim() : "";
      const name_ja = typeof body.name_ja === "string" ? body.name_ja.trim() : "";
      const name_zh = typeof body.name_zh === "string" ? body.name_zh.trim() : "";
      if (!name) return res.status(400).json({ error: "name_required" });

      if (body.department_id !== undefined && body.department_id !== null && typeof body.department_id !== "string") {
        return res.status(400).json({ error: "invalid_department_id" });
      }
      const department_id = typeof body.department_id === "string" ? body.department_id.trim() || null : null;
      if (department_id) {
        const deptExists = db.prepare("SELECT id FROM departments WHERE id = ?").get(department_id) as
          | { id: string }
          | undefined;
        if (!deptExists) return res.status(400).json({ error: "department_not_found" });
      }

      const role =
        typeof body.role === "string" && ["team_leader", "senior", "junior", "intern"].includes(body.role)
          ? body.role
          : "junior";
      const cli_provider =
        typeof body.cli_provider === "string" &&
        ["claude", "codex", "gemini", "opencode", "copilot", "antigravity", "api"].includes(body.cli_provider)
          ? body.cli_provider
          : "claude";
      const avatar_emoji =
        typeof body.avatar_emoji === "string" && body.avatar_emoji.trim() ? body.avatar_emoji.trim() : "🤖";
      const sprite_number =
        typeof body.sprite_number === "number" && body.sprite_number > 0 ? body.sprite_number : null;
      const personality = typeof body.personality === "string" ? body.personality.trim() || null : null;

      const id = randomUUID();
      try {
        db.prepare(
          `INSERT INTO agents (id, name, name_ko, name_ja, name_zh, department_id, role, cli_provider, avatar_emoji, sprite_number, personality)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          name,
          name_ko,
          name_ja,
          name_zh,
          department_id,
          role,
          cli_provider,
          avatar_emoji,
          sprite_number,
          personality,
        );
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.includes("FOREIGN KEY constraint failed")) {
          return res.status(400).json({ error: "department_not_found" });
        }
        throw err;
      }

      const created = db
        .prepare(
          `
      SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
      FROM agents a LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `,
        )
        .get(id);
      broadcast("agent_created", created);
      res.status(201).json({ ok: true, agent: created });
    } catch (err) {
      console.error("[agents] POST failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.delete("/api/agents/:id", (req, res) => {
    try {
      const id = String(req.params.id);
      const existing = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!existing) return res.status(404).json({ error: "not_found" });
      if (existing.status === "working") return res.status(400).json({ error: "cannot_delete_working_agent" });

      runInTransaction(() => {
        db.prepare("UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?").run(id);
        db.prepare("UPDATE subtasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?").run(id);
        db.prepare("UPDATE meeting_minute_entries SET speaker_agent_id = NULL WHERE speaker_agent_id = ?").run(id);
        db.prepare("UPDATE task_report_archives SET generated_by_agent_id = NULL WHERE generated_by_agent_id = ?").run(
          id,
        );
        db.prepare("UPDATE project_review_decision_states SET planner_agent_id = NULL WHERE planner_agent_id = ?").run(
          id,
        );
        db.prepare("UPDATE review_round_decision_states SET planner_agent_id = NULL WHERE planner_agent_id = ?").run(
          id,
        );
        db.prepare("DELETE FROM agents WHERE id = ?").run(id);
      });

      broadcast("agent_deleted", { id });
      res.json({ ok: true, id });
    } catch (err) {
      console.error("[agents] DELETE failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.patch("/api/agents/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const nextProviderRaw = ("cli_provider" in body ? body.cli_provider : existing.cli_provider) as
      | string
      | null
      | undefined;
    const nextProvider = nextProviderRaw ?? "claude";
    const nextOAuthProvider =
      nextProvider === "copilot" ? "github" : nextProvider === "antigravity" ? "google_antigravity" : null;
    const supportsCliModelOverride = ["claude", "codex", "gemini", "opencode", "cursor"].includes(nextProvider);
    const supportsCliReasoningOverride = nextProvider === "codex";
    const providerChanged = "cli_provider" in body && nextProvider !== String(existing.cli_provider ?? "claude");

    if (!nextOAuthProvider && !("oauth_account_id" in body) && "cli_provider" in body) {
      body.oauth_account_id = null;
    }
    if (nextProvider !== "api" && !("api_provider_id" in body) && "cli_provider" in body) {
      body.api_provider_id = null;
      body.api_model = null;
    }
    if ((!supportsCliModelOverride || providerChanged) && !("cli_model" in body)) {
      body.cli_model = null;
    }
    if ((!supportsCliReasoningOverride || providerChanged) && !("cli_reasoning_level" in body)) {
      body.cli_reasoning_level = null;
    }
    if ("cli_model" in body && !("cli_reasoning_level" in body) && supportsCliReasoningOverride) {
      body.cli_reasoning_level = null;
    }

    if ("oauth_account_id" in body) {
      if (body.oauth_account_id === "" || typeof body.oauth_account_id === "undefined") {
        body.oauth_account_id = null;
      }
      if (body.oauth_account_id !== null && typeof body.oauth_account_id !== "string") {
        return res.status(400).json({ error: "invalid_oauth_account_id" });
      }
      if (body.oauth_account_id && !nextOAuthProvider) {
        return res.status(400).json({ error: "oauth_account_requires_oauth_provider" });
      }
      if (body.oauth_account_id && nextOAuthProvider) {
        const oauthAccount = db
          .prepare("SELECT id, status FROM oauth_accounts WHERE id = ? AND provider = ?")
          .get(body.oauth_account_id, nextOAuthProvider) as { id: string; status: "active" | "disabled" } | undefined;
        if (!oauthAccount) {
          return res.status(400).json({ error: "oauth_account_not_found_for_provider" });
        }
        if (oauthAccount.status !== "active") {
          return res.status(400).json({ error: "oauth_account_disabled" });
        }
      }
    }

    if ("cli_model" in body) {
      if (body.cli_model === "" || typeof body.cli_model === "undefined") {
        body.cli_model = null;
      }
      if (body.cli_model !== null && typeof body.cli_model !== "string") {
        return res.status(400).json({ error: "invalid_cli_model" });
      }
      if (body.cli_model && !supportsCliModelOverride) {
        return res.status(400).json({ error: "cli_model_requires_cli_provider" });
      }
    }

    if ("cli_reasoning_level" in body) {
      if (body.cli_reasoning_level === "" || typeof body.cli_reasoning_level === "undefined") {
        body.cli_reasoning_level = null;
      }
      if (body.cli_reasoning_level !== null && typeof body.cli_reasoning_level !== "string") {
        return res.status(400).json({ error: "invalid_cli_reasoning_level" });
      }
      if (body.cli_reasoning_level && !supportsCliReasoningOverride) {
        return res.status(400).json({ error: "cli_reasoning_requires_codex_provider" });
      }
    }

    const allowedFields = [
      "name",
      "name_ko",
      "name_ja",
      "name_zh",
      "department_id",
      "role",
      "cli_provider",
      "oauth_account_id",
      "api_provider_id",
      "api_model",
      "cli_model",
      "cli_reasoning_level",
      "avatar_emoji",
      "sprite_number",
      "personality",
      "status",
      "current_task_id",
    ];

    const updates: string[] = [];
    const params: unknown[] = [];

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "no_fields_to_update" });
    }

    params.push(id);
    db.prepare(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));

    const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    broadcast("agent_status", updated);
    res.json({ ok: true, agent: updated });
  });
}
