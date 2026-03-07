import { execFileSync } from "node:child_process";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import type { CliUsageEntry } from "../shared/types.ts";

export function registerWorktreeAndUsageRoutes(ctx: RuntimeContext): {
  refreshCliUsageData: () => Promise<Record<string, CliUsageEntry>>;
} {
  const {
    app,
    taskWorktrees,
    mergeWorktree,
    cleanupWorktree,
    appendTaskLog,
    resolveLang,
    pickL,
    l,
    notifyCeo,
    db,
    nowMs,
    CLI_TOOLS,
    fetchClaudeUsage,
    fetchCodexUsage,
    fetchGeminiUsage,
    broadcast,
  } = ctx;

  app.get("/api/tasks/:id/diff", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.json({ ok: true, hasWorktree: false, diff: "", stat: "" });
    }

    try {
      const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 5000,
      })
        .toString()
        .trim();

      const stat = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`, "--stat"], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 10000,
      })
        .toString()
        .trim();

      const diff = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 15000,
      }).toString();

      res.json({
        ok: true,
        hasWorktree: true,
        branchName: wtInfo.branchName,
        stat,
        diff: diff.length > 50000 ? diff.slice(0, 50000) + "\n... (truncated)" : diff,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ ok: false, error: msg });
    }
  });

  app.post("/api/tasks/:id/merge", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
    }

    const result = mergeWorktree(wtInfo.projectPath, id);
    const lang = resolveLang();

    if (result.success) {
      cleanupWorktree(wtInfo.projectPath, id);
      appendTaskLog(id, "system", `Manual merge completed: ${result.message}`);
      notifyCeo(
        pickL(
          l(
            [`수동 병합 완료: ${result.message}`],
            [`Manual merge completed: ${result.message}`],
            [`手動マージ完了: ${result.message}`],
            [`手动合并完成: ${result.message}`],
          ),
          lang,
        ),
        id,
      );
    } else {
      appendTaskLog(id, "system", `Manual merge failed: ${result.message}`);
    }

    res.json({ ok: result.success, message: result.message, conflicts: result.conflicts });
  });

  app.post("/api/tasks/:id/discard", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
    }

    cleanupWorktree(wtInfo.projectPath, id);
    appendTaskLog(id, "system", "Worktree discarded (changes abandoned)");
    const lang = resolveLang();
    notifyCeo(
      pickL(
        l(
          [`작업 브랜치가 폐기되었습니다: climpire/${id.slice(0, 8)}`],
          [`Task branch discarded: climpire/${id.slice(0, 8)}`],
          [`タスクブランチを破棄しました: climpire/${id.slice(0, 8)}`],
          [`任务分支已丢弃: climpire/${id.slice(0, 8)}`],
        ),
        lang,
      ),
      id,
    );

    res.json({ ok: true, message: "Worktree discarded" });
  });

  // POST /api/tasks/:id/decompose-to-components — decompose a feature task into component subtasks
  app.post("/api/tasks/:id/decompose-to-components", async (req, res) => {
    const parentId = String(req.params.id);
    const parentTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(parentId) as Record<string, any> | undefined;
    if (!parentTask) return res.status(404).json({ ok: false, error: "Task not found" });

    const projectPath = parentTask.project_path as string | null;
    if (!projectPath) return res.status(400).json({ ok: false, error: "Task has no project_path" });

    // Build component specs from request body, or use auto-decompose via Copilot API
    const body = req.body as { components?: Array<{ filePath: string; description: string; props?: string; requirements?: string[] }> };
    const specs = body.components;
    if (!specs || specs.length === 0) {
      return res.status(400).json({ ok: false, error: "Provide components[] array in request body" });
    }

    const { buildComponentTaskPayload } = await import("../../workflow/core/task-templates.ts");

    const created: string[] = [];
    for (const spec of specs) {
      const payload = buildComponentTaskPayload(spec, projectPath, parentId);
      const newId = crypto.randomUUID();
      const nowMs = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, department_id, task_type, project_path, source_task_id, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?)`,
      ).run(newId, payload.title, payload.description, payload.department_id, payload.task_type, payload.project_path, payload.source_task_id ?? null, payload.priority ?? 0, nowMs, nowMs);
      created.push(newId);
    }

    broadcast("tasks_updated", {});
    return res.json({ ok: true, created, count: created.length });
  });

  // GET /api/tasks/:id/verify-commit
  app.get("/api/tasks/:id/verify-commit", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);

    const worktreePath = wtInfo?.worktreePath ?? null;

    if (!worktreePath) {
      return res.json({ ok: true, hasWorktree: false, hasCommit: false, commitCount: 0, files: [], verdict: "no_worktree" });
    }

    try {
      // Count commits ahead of origin/main
      const commitLog = execFileSync(
        "git",
        ["log", "origin/main..HEAD", "--oneline"],
        { cwd: worktreePath, stdio: "pipe", timeout: 8000 },
      ).toString().trim();
      const commits = commitLog ? commitLog.split("\n").filter(Boolean) : [];

      // List files changed vs origin/main
      let changedFiles: string[] = [];
      try {
        changedFiles = execFileSync(
          "git",
          ["diff", "origin/main..HEAD", "--name-only"],
          { cwd: worktreePath, stdio: "pipe", timeout: 8000 },
        ).toString().trim().split("\n").filter(Boolean);
      } catch { /* no diff */ }

      const hasRealCode = changedFiles.some(
        (f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".tsx") || f.endsWith(".jsx") ||
               f.endsWith(".json") || f.endsWith(".html") || f.endsWith(".css") || f.endsWith(".py"),
      );

      const verdict = commits.length === 0
        ? "no_commit"
        : hasRealCode
          ? "ok"
          : "commit_but_no_code";

      res.json({
        ok: true,
        hasWorktree: true,
        hasCommit: commits.length > 0,
        commitCount: commits.length,
        commits,
        files: changedFiles,
        hasRealCode,
        verdict,
        worktreePath,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ ok: false, error: msg, verdict: "error" });
    }
  });

  app.get("/api/worktrees", (_req, res) => {
    const entries: Array<{ taskId: string; branchName: string; worktreePath: string; projectPath: string }> = [];
    for (const [taskId, info] of taskWorktrees) {
      entries.push({ taskId, ...info });
    }
    res.json({ ok: true, worktrees: entries });
  });

  function readCliUsageFromDb(): Record<string, CliUsageEntry> {
    const rows = db.prepare("SELECT provider, data_json FROM cli_usage_cache").all() as Array<{
      provider: string;
      data_json: string;
    }>;
    const usage: Record<string, CliUsageEntry> = {};
    for (const row of rows) {
      try {
        usage[row.provider] = JSON.parse(row.data_json);
      } catch {
        // invalid json row
      }
    }
    return usage;
  }

  async function refreshCliUsageData(): Promise<Record<string, CliUsageEntry>> {
    const providers = ["claude", "codex", "gemini", "copilot", "antigravity"];
    const usage: Record<string, CliUsageEntry> = {};

    const fetchMap: Record<string, () => Promise<CliUsageEntry>> = {
      claude: fetchClaudeUsage,
      codex: fetchCodexUsage,
      gemini: fetchGeminiUsage,
    };

    const fetches = providers.map(async (p) => {
      const tool = CLI_TOOLS.find((t) => t.name === p);
      if (!tool) {
        usage[p] = { windows: [], error: "not_implemented" };
        return;
      }
      if (!tool.checkAuth()) {
        usage[p] = { windows: [], error: "unauthenticated" };
        return;
      }
      const fetcher = fetchMap[p];
      if (fetcher) {
        usage[p] = await fetcher();
      } else {
        usage[p] = { windows: [], error: "not_implemented" };
      }
    });

    await Promise.all(fetches);

    const upsert = db.prepare(
      "INSERT INTO cli_usage_cache (provider, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(provider) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
    );
    const now = nowMs();
    for (const [p, entry] of Object.entries(usage)) {
      upsert.run(p, JSON.stringify(entry), now);
    }

    return usage;
  }

  app.get("/api/cli-usage", async (_req, res) => {
    let usage = readCliUsageFromDb();
    if (Object.keys(usage).length === 0) {
      usage = await refreshCliUsageData();
    }
    res.json({ ok: true, usage });
  });

  app.post("/api/cli-usage/refresh", async (_req, res) => {
    try {
      const usage = await refreshCliUsageData();
      broadcast("cli_usage_update", usage);
      res.json({ ok: true, usage });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return { refreshCliUsageData };
}
