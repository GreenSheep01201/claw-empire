import type { RuntimeContext } from "../../../types/runtime-context.ts";

const DEFAULT_PROJECT_PATH = "/home/naosuke/claw-empire";
const STUCK_PLANNED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface DiagnosticIssue {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  taskId?: string;
  agentId?: string;
  suggestedFix: string;
  autoFixable: boolean;
}

export function registerSystemConsoleRoutes(ctx: RuntimeContext): void {
  const { app, db, nowMs, resolveProjectPath, activeProcesses, broadcast } = ctx;

  // ---------------------------------------------------------------------------
  // GET /api/admin/diagnose
  // ---------------------------------------------------------------------------
  app.get("/api/admin/diagnose", (_req, res) => {
    try {
      const issues: DiagnosticIssue[] = [];
      const now = nowMs();

      // 1. Tasks with NULL project_path (non-terminal status)
      const nullPathTasks = db
        .prepare(
          `SELECT id, title, status, updated_at FROM tasks
           WHERE project_path IS NULL AND status NOT IN ('done','cancelled')
           ORDER BY updated_at DESC LIMIT 50`,
        )
        .all() as Array<{ id: string; title: string; status: string; updated_at: number }>;

      for (const t of nullPathTasks) {
        issues.push({
          id: `null_path_${t.id}`,
          type: "null_project_path",
          severity: t.status === "planned" || t.status === "in_progress" ? "critical" : "warning",
          title: `project_path が未設定: "${t.title.slice(0, 50)}"`,
          description: `タスク(${t.status}) の project_path が NULL です。このままだと git init / が実行されてエラーループになります。`,
          taskId: t.id,
          suggestedFix: `project_path を '${DEFAULT_PROJECT_PATH}' に設定する`,
          autoFixable: true,
        });
      }

      // 2. Stuck planned tasks (planned > threshold with no running process)
      const stuckPlanned = db
        .prepare(
          `SELECT id, title, assigned_agent_id, updated_at FROM tasks
           WHERE status = 'planned' AND updated_at < ?
           ORDER BY updated_at ASC LIMIT 20`,
        )
        .all(now - STUCK_PLANNED_THRESHOLD_MS) as Array<{
        id: string;
        title: string;
        assigned_agent_id: string | null;
        updated_at: number;
      }>;

      for (const t of stuckPlanned) {
        const hasProcess = activeProcesses && activeProcesses.has(t.id);
        if (!hasProcess) {
          const stuckMin = Math.round((now - t.updated_at) / 60000);
          issues.push({
            id: `stuck_planned_${t.id}`,
            type: "stuck_planned",
            severity: "critical",
            title: `planned で ${stuckMin} 分停止: "${t.title.slice(0, 50)}"`,
            description: `タスクが planned のまま実行されていません。エージェントは割り当て済みですが、プロセスが起動していません。`,
            taskId: t.id,
            suggestedFix: "タスクを強制起動する (/run)",
            autoFixable: true,
          });
        }
      }

      // 3. Orphan agents (working but no current_task_id)
      const orphanAgents = db
        .prepare(
          `SELECT id, name, status FROM agents WHERE status = 'working' AND (current_task_id IS NULL OR current_task_id = '')`,
        )
        .all() as Array<{ id: string; name: string; status: string }>;

      for (const a of orphanAgents) {
        issues.push({
          id: `orphan_agent_${a.id}`,
          type: "orphan_agent",
          severity: "warning",
          title: `${a.name} が working だがタスクなし`,
          description: `エージェントのステータスが 'working' ですが current_task_id が未設定です。UI上で誤表示になっています。`,
          agentId: a.id,
          suggestedFix: "エージェントを idle にリセット",
          autoFixable: true,
        });
      }

      // 4. Orphan tasks (in_progress but assigned agent not working)
      const inProgressTasks = db
        .prepare(
          `SELECT t.id, t.title, t.assigned_agent_id, a.status as agent_status, a.name as agent_name
           FROM tasks t
           LEFT JOIN agents a ON t.assigned_agent_id = a.id
           WHERE t.status = 'in_progress'
           ORDER BY t.updated_at DESC LIMIT 30`,
        )
        .all() as Array<{
        id: string;
        title: string;
        assigned_agent_id: string | null;
        agent_status: string | null;
        agent_name: string | null;
      }>;

      for (const t of inProgressTasks) {
        const hasProcess = activeProcesses && activeProcesses.has(t.id);
        if (!hasProcess && t.agent_status !== "working") {
          issues.push({
            id: `orphan_task_${t.id}`,
            type: "orphan_task",
            severity: "warning",
            title: `in_progress だがプロセスなし: "${t.title.slice(0, 50)}"`,
            description: `タスクが in_progress ですが、担当エージェント(${t.agent_name ?? "不明"})も working ではなく実行プロセスもありません。`,
            taskId: t.id,
            suggestedFix: "タスクを inbox に戻すか強制起動する",
            autoFixable: false,
          });
        }
      }

      // 5. yoloMode check
      const yoloRow = db.prepare("SELECT value FROM settings WHERE key = 'yoloMode'").get() as
        | { value: string }
        | undefined;
      const yoloMode = yoloRow?.value === "true";
      const inboxCount = (
        db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'inbox'").get() as { cnt: number }
      ).cnt;

      if (!yoloMode && inboxCount > 0) {
        issues.push({
          id: "yolo_mode_off",
          type: "yolo_mode",
          severity: "info",
          title: `yoloMode OFF — inbox に ${inboxCount} 件のタスクが承認待ち`,
          description:
            "yoloMode が無効のため、inbox のタスクは CEO の承認なしに実行されません。Decision Inbox で承認してください。",
          suggestedFix: "Decision Inbox でタスクを承認するか、yoloMode を有効にする",
          autoFixable: false,
        });
      }

      res.json({ ok: true, issues, checkedAt: now });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/admin/fix — bulk auto-fix all auto-fixable issues
  // ---------------------------------------------------------------------------
  app.post("/api/admin/fix", (_req, res) => {
    try {
      const now = nowMs();
      const results: Array<{ issue: string; action: string; ok: boolean; detail?: string }> = [];

      // Fix 1: NULL project_path tasks
      const nullPathTasks = db
        .prepare(
          `SELECT id, title, status FROM tasks
           WHERE project_path IS NULL AND status NOT IN ('done','cancelled')`,
        )
        .all() as Array<{ id: string; title: string; status: string }>;

      for (const t of nullPathTasks) {
        const resolved = resolveProjectPath({ project_path: null, project_id: null, title: t.title });
        const path = resolved || DEFAULT_PROJECT_PATH;
        db.prepare("UPDATE tasks SET project_path = ?, updated_at = ? WHERE id = ?").run(path, now, t.id);
        broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(t.id));
        results.push({ issue: `null_path_${t.id}`, action: `project_path = '${path}'`, ok: true });
      }

      // Fix 2: Orphan agents
      const orphanAgents = db
        .prepare(
          `SELECT id, name FROM agents WHERE status = 'working' AND (current_task_id IS NULL OR current_task_id = '')`,
        )
        .all() as Array<{ id: string; name: string }>;

      for (const a of orphanAgents) {
        db.prepare("UPDATE agents SET status = 'idle', updated_at = ? WHERE id = ?").run(now, a.id);
        broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(a.id));
        results.push({ issue: `orphan_agent_${a.id}`, action: `${a.name} → idle`, ok: true });
      }

      res.json({ ok: true, fixed: results.length, results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/admin/db-summary
  // ---------------------------------------------------------------------------
  app.get("/api/admin/db-summary", (_req, res) => {
    try {
      const tasksByStatus = db
        .prepare(
          `SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status ORDER BY cnt DESC`,
        )
        .all() as Array<{ status: string; cnt: number }>;

      const agentsByStatus = db
        .prepare(
          `SELECT status, COUNT(*) as cnt FROM agents GROUP BY status ORDER BY cnt DESC`,
        )
        .all() as Array<{ status: string; cnt: number }>;

      const recentErrors = db
        .prepare(
          `SELECT t.id, t.title, tl.content, tl.created_at
           FROM task_logs tl
           JOIN tasks t ON tl.task_id = t.id
           WHERE tl.role = 'error'
           ORDER BY tl.created_at DESC LIMIT 10`,
        )
        .all() as Array<{ id: string; title: string; content: string; created_at: number }>;

      res.json({ ok: true, tasksByStatus, agentsByStatus, recentErrors, checkedAt: nowMs() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/admin/tasks — active tasks list
  // ---------------------------------------------------------------------------
  app.get("/api/admin/tasks", (_req, res) => {
    try {
      const tasks = db
        .prepare(
          `SELECT t.id, t.title, t.status, t.project_path, t.updated_at,
                  a.name as agent_name, a.status as agent_status
           FROM tasks t
           LEFT JOIN agents a ON t.assigned_agent_id = a.id
           WHERE t.status NOT IN ('done','cancelled')
           ORDER BY t.updated_at DESC`,
        )
        .all() as Array<{
        id: string;
        title: string;
        status: string;
        project_path: string | null;
        updated_at: number;
        agent_name: string | null;
        agent_status: string | null;
      }>;

      res.json({ ok: true, tasks });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/admin/tasks/:id/fix-path — set project_path
  // ---------------------------------------------------------------------------
  app.post("/api/admin/tasks/:id/fix-path", (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as { project_path?: string };
      const path = body?.project_path || DEFAULT_PROJECT_PATH;
      const now = nowMs();
      const r = db
        .prepare("UPDATE tasks SET project_path = ?, updated_at = ? WHERE id = ? AND status NOT IN ('done','cancelled')")
        .run(path, now, id) as { changes?: number };
      if (!r.changes) {
        res.status(404).json({ ok: false, error: "Task not found or already done/cancelled" });
        return;
      }
      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
      res.json({ ok: true, taskId: id, project_path: path });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/admin/tasks/:id/cancel
  // ---------------------------------------------------------------------------
  app.post("/api/admin/tasks/:id/cancel", (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const now = nowMs();
      const r = db
        .prepare("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND status NOT IN ('done','cancelled')")
        .run(now, id) as { changes?: number };
      if (!r.changes) {
        res.status(404).json({ ok: false, error: "Task not found or already terminal" });
        return;
      }
      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
      res.json({ ok: true, taskId: id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/admin/tasks/:id/run — promote planned→run (calls existing run endpoint logic)
  // ---------------------------------------------------------------------------
  app.post("/api/admin/tasks/:id/run", async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      // Delegate to existing /api/tasks/:id/run by making internal fetch
      const baseUrl = `http://127.0.0.1:${(ctx as any).port ?? 8790}`;
      const token = (ctx as any).apiToken ?? "";
      const resp = await fetch(`${baseUrl}/api/tasks/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = (await resp.json()) as unknown;
      res.status(resp.status).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/admin/agents/:id/reset — set agent to idle
  // ---------------------------------------------------------------------------
  app.post("/api/admin/agents/:id/reset", (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const now = nowMs();
      const r = db
        .prepare(
          "UPDATE agents SET status = 'idle', current_task_id = NULL, updated_at = ? WHERE id = ?",
        )
        .run(now, id) as { changes?: number };
      if (!r.changes) {
        res.status(404).json({ ok: false, error: "Agent not found" });
        return;
      }
      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(id));
      res.json({ ok: true, agentId: id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });
}
