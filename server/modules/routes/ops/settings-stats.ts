import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { sendRouteError } from "../shared/route-error.ts";

const SETTINGS_READ_HINT =
  "Failed to read settings from SQLite. Check DB path/permissions and ensure only one writer is locking the runtime DB.";
const SETTINGS_WRITE_HINT =
  "Failed to persist settings to SQLite. Check DB write permissions, DB lock state, and runtime DB health.";

export function registerOpsSettingsStatsRoutes(ctx: RuntimeContext): void {
  const { app, db } = ctx;

  app.get("/api/settings", (req, res) => {
    try {
      const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
      const settings: Record<string, unknown> = {};
      for (const row of rows) {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch {
          settings[row.key] = row.value;
        }
      }
      res.json({ settings });
      return;
    } catch (err) {
      sendRouteError(req, res, {
        status: 500,
        route: "/api/settings",
        errorCode: "settings_read_failed",
        hint: SETTINGS_READ_HINT,
        err,
      });
      return;
    }
  });

  app.put("/api/settings", (req, res): void => {
    const body = req.body ?? {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({
        error: "settings_invalid_payload",
        hint: "Request body must be a JSON object.",
      });
      return;
    }

    try {
      const upsert = db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      );

      for (const [key, value] of Object.entries(body)) {
        upsert.run(key, typeof value === "string" ? value : JSON.stringify(value));
      }

      res.json({ ok: true });
      return;
    } catch (err) {
      sendRouteError(req, res, {
        status: 500,
        route: "/api/settings",
        errorCode: "settings_write_failed",
        hint: SETTINGS_WRITE_HINT,
        err,
      });
      return;
    }
  });

  app.get("/api/stats", (_req, res) => {
    const totalTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number }).cnt;
    const doneTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'done'").get() as { cnt: number })
      .cnt;
    const inProgressTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'in_progress'").get() as { cnt: number }
    ).cnt;
    const inboxTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'inbox'").get() as { cnt: number })
      .cnt;
    const plannedTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'planned'").get() as {
        cnt: number;
      }
    ).cnt;
    const reviewTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'review'").get() as {
        cnt: number;
      }
    ).cnt;
    const cancelledTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'cancelled'").get() as {
        cnt: number;
      }
    ).cnt;
    const collaboratingTasks = (
      db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'collaborating'").get() as {
        cnt: number;
      }
    ).cnt;

    const totalAgents = (db.prepare("SELECT COUNT(*) as cnt FROM agents").get() as { cnt: number }).cnt;
    const workingAgents = (
      db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'working'").get() as {
        cnt: number;
      }
    ).cnt;
    const idleAgents = (
      db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'idle'").get() as {
        cnt: number;
      }
    ).cnt;

    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const topAgents = db
      .prepare("SELECT id, name, avatar_emoji, stats_tasks_done, stats_xp FROM agents ORDER BY stats_xp DESC LIMIT 5")
      .all();

    const tasksByDept = db
      .prepare(
        `
    SELECT d.id, d.name, d.icon, d.color,
      COUNT(t.id) AS total_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks
    FROM departments d
    LEFT JOIN tasks t ON t.department_id = d.id
    GROUP BY d.id
    ORDER BY d.name
  `,
      )
      .all();

    const recentActivity = db
      .prepare(
        `
    SELECT tl.*, t.title AS task_title
    FROM task_logs tl
    LEFT JOIN tasks t ON tl.task_id = t.id
    ORDER BY tl.created_at DESC
    LIMIT 20
  `,
      )
      .all();

    res.json({
      stats: {
        tasks: {
          total: totalTasks,
          done: doneTasks,
          in_progress: inProgressTasks,
          inbox: inboxTasks,
          planned: plannedTasks,
          collaborating: collaboratingTasks,
          review: reviewTasks,
          cancelled: cancelledTasks,
          completion_rate: completionRate,
        },
        agents: {
          total: totalAgents,
          working: workingAgents,
          idle: idleAgents,
        },
        top_agents: topAgents,
        tasks_by_department: tasksByDept,
        recent_activity: recentActivity,
      },
    });
  });
}
