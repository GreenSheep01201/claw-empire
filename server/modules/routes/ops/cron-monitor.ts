import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { RuntimeContext } from "../../../types/runtime-context.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CronJob {
  id: string;
  source: "crontab" | "launchd";
  label: string | null;
  schedule: string;
  scheduleHuman: string;
  command: string;
  enabled: boolean;
  nextRun: string | null;
  plistPath: string | null;
  assignedAgentId: string | null;
  description: string | null;
}

interface CronJobsResponse {
  ok: boolean;
  jobs: CronJob[];
  refreshedAt: number;
  platform: "darwin" | "linux" | "unknown";
}

// ---------------------------------------------------------------------------
// Helpers (unexported)
// ---------------------------------------------------------------------------

function makeJobId(source: string, label: string | null, schedule: string, command: string): string {
  const raw = `${source}:${label ?? ""}:${schedule}:${command}`;
  return Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/[+/=]/g, (c) => (c === "+" ? "-" : c === "/" ? "_" : ""));
}

function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, dom, mon, dow] = parts;

  // Every minute
  if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "Every minute";
  }

  // Every N minutes
  if (min?.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = min.slice(2);
    return n === "1" ? "Every minute" : `Every ${n} minutes`;
  }

  // Every N hours
  if (min === "0" && hour?.startsWith("*/") && dom === "*" && mon === "*" && dow === "*") {
    const n = hour.slice(2);
    return n === "1" ? "Every hour" : `Every ${n} hours`;
  }

  // Hourly at :MM
  if (min !== "*" && !min?.includes("/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Hourly at :${min!.padStart(2, "0")}`;
  }

  // Daily at HH:MM
  if (
    min !== "*" &&
    !min?.includes("/") &&
    hour !== "*" &&
    !hour?.includes("/") &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `Daily at ${hour!.padStart(2, "0")}:${min!.padStart(2, "0")}`;
  }

  // Weekdays at HH:MM
  if (
    min !== "*" &&
    !min?.includes("/") &&
    hour !== "*" &&
    !hour?.includes("/") &&
    dom === "*" &&
    mon === "*" &&
    dow === "1-5"
  ) {
    return `Weekdays at ${hour!.padStart(2, "0")}:${min!.padStart(2, "0")}`;
  }

  // Weekly (specific day)
  const dayNames: Record<string, string> = {
    "0": "Sun",
    "1": "Mon",
    "2": "Tue",
    "3": "Wed",
    "4": "Thu",
    "5": "Fri",
    "6": "Sat",
    "7": "Sun",
  };
  if (
    min !== "*" &&
    !min?.includes("/") &&
    hour !== "*" &&
    !hour?.includes("/") &&
    dom === "*" &&
    mon === "*" &&
    dow !== "*" &&
    dayNames[dow!]
  ) {
    return `${dayNames[dow!]} at ${hour!.padStart(2, "0")}:${min!.padStart(2, "0")}`;
  }

  return expr;
}

function computeNextCronRun(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minF, hourF, domF, monF, dowF] = parts;
  const now = new Date();

  // Forward-scan up to 48h (2880 minutes)
  for (let offset = 1; offset <= 2880; offset++) {
    const candidate = new Date(now.getTime() + offset * 60_000);
    candidate.setSeconds(0, 0);

    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const d = candidate.getDate();
    const mo = candidate.getMonth() + 1;
    const dw = candidate.getDay(); // 0=Sun

    if (!matchField(minF!, m, 0, 59)) continue;
    if (!matchField(hourF!, h, 0, 23)) continue;
    if (!matchField(domF!, d, 1, 31)) continue;
    if (!matchField(monF!, mo, 1, 12)) continue;
    if (!matchField(dowF!, dw, 0, 7)) continue;

    return candidate.toISOString();
  }

  return null;
}

function matchField(field: string, value: number, _min: number, _max: number): boolean {
  if (field === "*") return true;

  // step: */N
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // range: A-B
  if (field.includes("-") && !field.includes(",")) {
    const [a, b] = field.split("-").map(Number);
    if (a !== undefined && b !== undefined && !isNaN(a) && !isNaN(b)) {
      return value >= a && value <= b;
    }
  }

  // list: A,B,C
  if (field.includes(",")) {
    return field.split(",").some((v) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n === value;
    });
  }

  // exact value
  const exact = parseInt(field, 10);
  return !isNaN(exact) && exact === value;
}

function parseCrontab(): CronJob[] {
  let output: string;
  try {
    output = execFileSync("crontab", ["-l"], {
      encoding: "utf-8",
      timeout: 5_000,
    });
  } catch {
    return [];
  }

  const jobs: CronJob[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip env var lines (e.g. SHELL=/bin/bash)
    if (/^[A-Z_]+=/.test(line)) continue;

    const disabled = line.startsWith("#");
    const effective = disabled ? line.replace(/^#+\s*/, "") : line;

    // Match 5-field cron expression + command
    const match = effective.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
    if (!match) continue;

    const schedule = match[1]!;
    const command = match[2]!;

    // Validate that each field looks like a cron field (digits, *, /, -, comma)
    const cronFields = schedule.split(/\s+/);
    const isCronLike = cronFields.every((f) => /^[0-9*/,-]+$/.test(f));
    if (!isCronLike) continue;

    jobs.push({
      id: makeJobId("crontab", null, schedule, command),
      source: "crontab",
      label: null,
      schedule,
      scheduleHuman: cronToHuman(schedule),
      command,
      enabled: !disabled,
      nextRun: disabled ? null : computeNextCronRun(schedule),
      plistPath: null,
      assignedAgentId: null,
      description: null,
    });
  }

  return jobs;
}

function parseLaunchdAgents(): CronJob[] {
  if (platform() !== "darwin") return [];

  const agentsDir = join(homedir(), "Library", "LaunchAgents");
  let files: string[];
  try {
    files = readdirSync(agentsDir).filter((f) => f.endsWith(".plist"));
  } catch {
    return [];
  }

  const jobs: CronJob[] = [];

  for (const file of files) {
    const plistPath = join(agentsDir, file);
    let plist: Record<string, unknown>;
    try {
      const jsonStr = execFileSync("plutil", ["-convert", "json", "-o", "-", plistPath], {
        encoding: "utf-8",
        timeout: 5_000,
      });
      plist = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      continue;
    }

    const label = (typeof plist.Label === "string" ? plist.Label : file.replace(/\.plist$/, "")) as string;
    const disabled = plist.Disabled === true;

    // Extract command
    let command = "";
    if (Array.isArray(plist.ProgramArguments) && plist.ProgramArguments.length > 0) {
      command = (plist.ProgramArguments as string[]).join(" ");
    } else if (typeof plist.Program === "string") {
      command = plist.Program;
    }

    // Extract schedule
    let schedule = "";
    let scheduleHuman = "";

    if (typeof plist.StartInterval === "number") {
      const seconds = plist.StartInterval;
      schedule = `every ${seconds}s`;
      if (seconds < 60) {
        scheduleHuman = `Every ${seconds} seconds`;
      } else if (seconds < 3600) {
        const mins = Math.round(seconds / 60);
        scheduleHuman = mins === 1 ? "Every minute" : `Every ${mins} minutes`;
      } else {
        const hrs = Math.round(seconds / 3600);
        scheduleHuman = hrs === 1 ? "Every hour" : `Every ${hrs} hours`;
      }
    } else if (plist.StartCalendarInterval != null) {
      const intervals = Array.isArray(plist.StartCalendarInterval)
        ? plist.StartCalendarInterval
        : [plist.StartCalendarInterval];
      const first = intervals[0] as Record<string, number> | undefined;
      if (first) {
        const parts: string[] = [];
        if (first.Hour !== undefined) parts.push(`Hour=${first.Hour}`);
        if (first.Minute !== undefined) parts.push(`Minute=${first.Minute}`);
        if (first.Weekday !== undefined) parts.push(`Weekday=${first.Weekday}`);
        if (first.Day !== undefined) parts.push(`Day=${first.Day}`);
        if (first.Month !== undefined) parts.push(`Month=${first.Month}`);
        schedule = parts.join(" ");

        // Build human-readable
        const h = first.Hour !== undefined ? String(first.Hour).padStart(2, "0") : "*";
        const m = first.Minute !== undefined ? String(first.Minute).padStart(2, "0") : "00";
        const dayNames: Record<number, string> = {
          0: "Sun",
          1: "Mon",
          2: "Tue",
          3: "Wed",
          4: "Thu",
          5: "Fri",
          6: "Sat",
        };
        if (first.Weekday !== undefined) {
          const dayName = dayNames[first.Weekday] ?? `day ${first.Weekday}`;
          scheduleHuman = `${dayName} at ${h}:${m}`;
        } else if (first.Day !== undefined) {
          scheduleHuman = `Monthly day ${first.Day} at ${h}:${m}`;
        } else if (first.Hour !== undefined) {
          scheduleHuman = `Daily at ${h}:${m}`;
        } else if (first.Minute !== undefined) {
          scheduleHuman = `Hourly at :${m}`;
        } else {
          scheduleHuman = schedule;
        }
      }
    } else if (plist.KeepAlive === true || plist.RunAtLoad === true) {
      schedule = "on-demand";
      scheduleHuman = "On load / keep-alive";
    } else {
      schedule = "manual";
      scheduleHuman = "Manual";
    }

    jobs.push({
      id: makeJobId("launchd", label, schedule, command),
      source: "launchd",
      label,
      schedule,
      scheduleHuman,
      command,
      enabled: !disabled,
      nextRun: null,
      plistPath,
      assignedAgentId: null,
      description: null,
    });
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 500;
const MAX_KEY_LENGTH = 512;
const MAX_VALUE_LENGTH = 2000;

function isStringRecord(val: unknown): val is Record<string, string> {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  for (const [k, v] of Object.entries(val)) {
    if (typeof k !== "string" || typeof v !== "string") return false;
    if (k.length > MAX_KEY_LENGTH || v.length > MAX_VALUE_LENGTH) return false;
  }
  return Object.keys(val).length <= MAX_ENTRIES;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

function readSettingsJson(db: RuntimeContext["db"], key: string): Record<string, string> {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSettingsJson(db: RuntimeContext["db"], key: string, value: Record<string, string>): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, JSON.stringify(value));
}

export function registerCronMonitorRoutes(ctx: RuntimeContext): void {
  const { app, db } = ctx;

  app.get("/api/cron/jobs", (_req, res) => {
    try {
      const crontabJobs = parseCrontab();
      const launchdJobs = parseLaunchdAgents();
      const jobs = [...crontabJobs, ...launchdJobs];

      const assignments = readSettingsJson(db, "patrol_assignments");
      const descriptions = readSettingsJson(db, "job_descriptions");
      for (const job of jobs) {
        job.assignedAgentId = assignments[job.id] ?? null;
        job.description = descriptions[job.id] ?? null;
      }

      const p = platform();
      const platformLabel: CronJobsResponse["platform"] =
        p === "darwin" ? "darwin" : p === "linux" ? "linux" : "unknown";

      const response: CronJobsResponse = {
        ok: true,
        jobs,
        refreshedAt: Date.now(),
        platform: platformLabel,
      };

      res.json(response);
    } catch (err) {
      console.error("[cron-monitor]", err);
      res.status(500).json({ ok: false, error: "cron_monitor_failed", message: String(err) });
    }
  });

  app.get("/api/cron/assignments", (_req, res) => {
    try {
      const assignments = readSettingsJson(db, "patrol_assignments");
      res.json({ assignments });
    } catch (err) {
      console.error("[cron-monitor]", err);
      res.status(500).json({ ok: false, error: "read_assignments_failed", message: String(err) });
    }
  });

  app.put("/api/cron/assignments", (req, res) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ ok: false, error: "invalid_payload" });
      }
      const { assignments } = body as { assignments: unknown };
      if (assignments !== undefined && !isStringRecord(assignments)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_assignments", message: "Expected Record<string,string>" });
      }
      writeSettingsJson(db, "patrol_assignments", (assignments as Record<string, string>) ?? {});
      res.json({ ok: true });
    } catch (err) {
      console.error("[cron-monitor]", err);
      res.status(500).json({ ok: false, error: "save_assignments_failed", message: String(err) });
    }
  });

  app.get("/api/cron/descriptions", (_req, res) => {
    try {
      const descriptions = readSettingsJson(db, "job_descriptions");
      res.json({ descriptions });
    } catch (err) {
      console.error("[cron-monitor]", err);
      res.status(500).json({ ok: false, error: "read_descriptions_failed", message: String(err) });
    }
  });

  app.put("/api/cron/descriptions", (req, res) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ ok: false, error: "invalid_payload" });
      }
      const { descriptions } = body as { descriptions: unknown };
      if (descriptions !== undefined && !isStringRecord(descriptions)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_descriptions", message: "Expected Record<string,string>" });
      }
      writeSettingsJson(db, "job_descriptions", (descriptions as Record<string, string>) ?? {});
      res.json({ ok: true });
    } catch (err) {
      console.error("[cron-monitor]", err);
      res.status(500).json({ ok: false, error: "save_descriptions_failed", message: String(err) });
    }
  });
}

// Exported for testing
export { parseCrontab, parseLaunchdAgents, cronToHuman, computeNextCronRun, makeJobId, matchField, isStringRecord };
export type { CronJob, CronJobsResponse };
