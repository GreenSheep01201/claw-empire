import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import type { ChildProcess } from "node:child_process";

interface ServerConfig {
  id: string;
  name: string;
  command: string;
  cwd: string;
  port: number | null;
  env_json: string | null;
  created_at: number;
}

interface RunningServer {
  pid: number;
  process: ChildProcess;
  logs: string[];
  startedAt: number;
  status: "running" | "stopped" | "error";
  explicitStop?: boolean; // set when stop is intentional, so exit code=null isn't treated as error
}

// In-memory process registry
const runningServers = new Map<string, RunningServer>();
const MAX_LOG_LINES = 200;
const MAX_CONCURRENT_SERVERS = 4; // 4 project servers (CRM, SalonChat, QuickInvoice, offce_naosuke)

function ensureTable(db: RuntimeContext["db"]) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_server_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT NOT NULL,
      port INTEGER,
      env_json TEXT,
      created_at INTEGER NOT NULL
    )
  `);
}

function getMemAvailableMB(): number {
  try {
    const content = readFileSync("/proc/meminfo", "utf8");
    const match = content.match(/MemAvailable:\s+(\d+)\s+kB/);
    return match ? Math.floor(parseInt(match[1]) / 1024) : 9999;
  } catch {
    return 9999;
  }
}

function getPidMemMB(pid: number): number {
  try {
    const content = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = content.match(/VmRSS:\s+(\d+)\s+kB/);
    return match ? Math.floor(parseInt(match[1]) / 1024) : 0;
  } catch {
    return 0;
  }
}

export function registerLocalServerRoutes(ctx: RuntimeContext): void {
  const { app, db } = ctx;
  ensureTable(db);

  // GET /api/local-servers — list all with status
  app.get("/api/local-servers", (_req, res) => {
    const configs = db.prepare("SELECT * FROM local_server_configs ORDER BY created_at DESC").all() as unknown as ServerConfig[];
    const memAvailMB = getMemAvailableMB();

    const servers = configs.map((cfg) => {
      const running = runningServers.get(cfg.id);
      const pid = running?.process?.pid;
      return {
        ...cfg,
        status: running?.status ?? "stopped",
        pid: pid ?? null,
        startedAt: running?.startedAt ?? null,
        memMB: pid ? getPidMemMB(pid) : null,
      };
    });

    res.json({ ok: true, servers, memAvailMB, maxConcurrent: MAX_CONCURRENT_SERVERS });
  });

  // POST /api/local-servers — register new server
  app.post("/api/local-servers", (req, res) => {
    const { name, command, cwd, port, env_json } = req.body as {
      name?: string;
      command?: string;
      cwd?: string;
      port?: number;
      env_json?: string;
    };
    if (!name || !command || !cwd) {
      res.status(400).json({ ok: false, error: "name, command, cwd は必須です" });
      return;
    }
    if (!existsSync(cwd)) {
      res.status(400).json({ ok: false, error: `ディレクトリが存在しません: ${cwd}` });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO local_server_configs (id, name, command, cwd, port, env_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, name, command, cwd, port ?? null, env_json ?? null, Date.now());
    res.json({ ok: true, id });
  });

  // DELETE /api/local-servers/:id
  app.delete("/api/local-servers/:id", (req, res) => {
    const { id } = req.params as { id: string };
    const running = runningServers.get(id);
    if (running && running.status === "running") {
      running.process.kill("SIGTERM");
      runningServers.delete(id);
    }
    db.prepare("DELETE FROM local_server_configs WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  // POST /api/local-servers/:id/start
  app.post("/api/local-servers/:id/start", (req, res) => {
    const { id } = req.params as { id: string };
    const cfg = db.prepare("SELECT * FROM local_server_configs WHERE id = ?").get(id) as unknown as ServerConfig | undefined;
    if (!cfg) {
      res.status(404).json({ ok: false, error: "サーバー設定が見つかりません" });
      return;
    }

    const existing = runningServers.get(id);
    if (existing?.status === "running") {
      res.status(400).json({ ok: false, error: "既に起動中です" });
      return;
    }

    // PC spec: limit concurrent servers
    const runningCount = [...runningServers.values()].filter((s) => s.status === "running").length;
    if (runningCount >= MAX_CONCURRENT_SERVERS) {
      res.status(429).json({
        ok: false,
        error: `同時起動上限 (${MAX_CONCURRENT_SERVERS}) に達しています。他のサーバーを停止してから試してください。`,
      });
      return;
    }

    // Warn if low memory
    const memAvailMB = getMemAvailableMB();
    const memWarning = memAvailMB < 500 ? `⚠️ 空きRAMが少ない (${memAvailMB}MB)` : null;

    const extraEnv: Record<string, string> = {};
    if (cfg.env_json) {
      try {
        Object.assign(extraEnv, JSON.parse(cfg.env_json));
      } catch {
        // ignore
      }
    }

    const [cmd, ...args] = cfg.command.split(/\s+/);
    const child = spawn(cmd, args, {
      cwd: cfg.cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    const entry: RunningServer = {
      pid: child.pid ?? 0,
      process: child,
      logs: [],
      startedAt: Date.now(),
      status: "running",
    };
    runningServers.set(id, entry);

    function appendLog(data: Buffer) {
      const lines = data.toString().split("\n").filter(Boolean);
      entry.logs.push(...lines);
      if (entry.logs.length > MAX_LOG_LINES) {
        entry.logs.splice(0, entry.logs.length - MAX_LOG_LINES);
      }
    }
    child.stdout?.on("data", appendLog);
    child.stderr?.on("data", appendLog);

    child.on("exit", (code) => {
      // code=null means killed by signal (SIGTERM/SIGKILL from explicit stop) — not an error
      entry.status = (code === 0 || code === null && entry.explicitStop) ? "stopped" : "error";
      entry.logs.push(`[exit] code=${code}`);
    });

    res.json({ ok: true, pid: child.pid, memWarning });
  });

  // POST /api/local-servers/:id/stop
  app.post("/api/local-servers/:id/stop", (req, res) => {
    const { id } = req.params as { id: string };
    const entry = runningServers.get(id);
    if (!entry || entry.status !== "running") {
      res.status(400).json({ ok: false, error: "起動中ではありません" });
      return;
    }
    entry.explicitStop = true;
    entry.process.kill("SIGTERM");
    setTimeout(() => {
      if (entry.status === "running") entry.process.kill("SIGKILL");
    }, 5000);
    res.json({ ok: true });
  });

  // POST /api/local-servers/:id/restart
  app.post("/api/local-servers/:id/restart", async (req, res) => {
    const { id } = req.params as { id: string };
    const entry = runningServers.get(id);
    if (entry?.status === "running") {
      entry.process.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
    }
    // reuse start logic via internal call
    req.url = `/api/local-servers/${id}/start`;
    // We can't easily re-invoke, so just respond with instruction
    res.json({ ok: false, error: "再起動は停止後に手動で起動してください（安全のため）" });
  });

  // GET /api/local-servers/:id/logs — return recent logs as JSON
  app.get("/api/local-servers/:id/logs", (req, res) => {
    const { id } = req.params as { id: string };
    const entry = runningServers.get(id);
    if (!entry) {
      res.json({ ok: true, logs: [], status: "stopped" });
      return;
    }
    res.json({ ok: true, logs: entry.logs.slice(-100), status: entry.status });
  });

  // GET /api/apps — projects list with linked server configs
  app.get("/api/apps", (_req, res) => {
    const projects = (
      db
        .prepare(
          `SELECT id, name, project_path, core_goal, default_pack_key, github_repo,
                  last_used_at, created_at
           FROM projects ORDER BY last_used_at DESC NULLS LAST`,
        )
        .all() as Record<string, unknown>[]
    ).map((p) => {
      // Find server configs whose cwd matches the project path
      const servers = (
        db
          .prepare("SELECT * FROM local_server_configs WHERE cwd = ?")
          .all(p.project_path as string) as Record<string, unknown>[]
      ).map((s) => {
        const running = runningServers.get(s.id as string);
        return { ...s, status: running?.status ?? "stopped", pid: running?.process?.pid ?? null };
      });
      // Task counts
      const taskCounts = db
        .prepare(
          `SELECT status, COUNT(*) as cnt FROM tasks WHERE project_path = ? GROUP BY status`,
        )
        .all(p.project_path as string) as Array<{ status: string; cnt: number }>;
      const counts: Record<string, number> = {};
      for (const row of taskCounts) counts[row.status] = row.cnt;
      return { ...p, servers, taskCounts: counts };
    });
    res.json({ ok: true, projects });
  });
}
