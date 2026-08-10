import type { RuntimeContext } from "../../../types/runtime-context.ts";
import {
  decryptMessengerChannelsForClient,
  encryptMessengerChannelsForStorage,
} from "../../../messenger/token-crypto.ts";
import { syncOfficePackAgentsForPack } from "../collab/office-pack-agent-hydration.ts";
import { readNotionManagedDevelopmentScope } from "../../workflow/packs/notion-managed-development.ts";

const MESSENGER_SETTINGS_KEY = "messengerChannels";
const OFFICE_PACK_PROFILES_KEY = "officePackProfiles";
const OFFICE_PACK_SEED_INIT_KEY = "officePackSeedAgentsInitialized";
const OFFICE_PACK_HYDRATED_PACKS_KEY = "officePackHydratedPacks";

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function registerOpsSettingsStatsRoutes(ctx: RuntimeContext): void {
  const { app, db, nowMs } = ctx;

  const readBooleanLikeSetting = (key: string): boolean => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as
      | { value?: unknown }
      | undefined;
    if (!row) return false;
    const raw = String(row.value ?? "")
      .trim()
      .toLowerCase();
    if (!raw) return false;
    if (raw === "true" || raw === "1") return true;
    try {
      const parsed = JSON.parse(String(row.value));
      return parsed === true || parsed === 1;
    } catch {
      return false;
    }
  };

  const markSeedInitDone = (): void => {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'",
    ).run(OFFICE_PACK_SEED_INIT_KEY);
  };

  const maybeRunOfficePackSeedInit = (): void => {
    if (readBooleanLikeSetting(OFFICE_PACK_SEED_INIT_KEY)) return;

    // Do not bulk-insert office-pack seed agents into global agents table.
    // Pack agents are loaded from settings profiles and hydrated on-demand only.
    markSeedInitDone();
  };

  const normalizePackKey = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim().replace(/^["']|["']$/g, "");
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  };

  const readHydratedPackSet = (): Set<string> => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(OFFICE_PACK_HYDRATED_PACKS_KEY) as
      | { value?: unknown }
      | undefined;
    if (!row) return new Set<string>();
    const parsed = safeJsonParse(String(row.value ?? ""));
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((entry) => normalizePackKey(entry)).filter((entry): entry is string => !!entry));
  };

  const saveHydratedPackSet = (packSet: Set<string>): void => {
    const serialized = JSON.stringify([...packSet].sort());
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(OFFICE_PACK_HYDRATED_PACKS_KEY, serialized);
  };

  const maybeHydratePackOnFirstSelection = (selectedPackRaw: unknown, profilesOverride?: unknown): void => {
    const selectedPack = normalizePackKey(selectedPackRaw);
    if (!selectedPack || selectedPack === "development") return;

    const hydratedPacks = readHydratedPackSet();
    if (hydratedPacks.has(selectedPack)) return;

    const profilesValue =
      profilesOverride ??
      (
        db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(OFFICE_PACK_PROFILES_KEY) as
          | { value?: unknown }
          | undefined
      )?.value;
    if (profilesValue === undefined) return;

    const result = syncOfficePackAgentsForPack(db, profilesValue, selectedPack, nowMs);
    if (result.departmentsSynced > 0 || result.agentsSynced > 0) {
      hydratedPacks.add(selectedPack);
      saveHydratedPackSet(hydratedPacks);
    }
  };

  try {
    maybeRunOfficePackSeedInit();
  } catch {
    // best-effort sync only
  }

  app.get("/api/settings", (_req, res) => {
    try {
      const selectedPackRow = db
        .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .get("officeWorkflowPack") as { value?: unknown } | undefined;
      const profilesRow = db
        .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .get(OFFICE_PACK_PROFILES_KEY) as { value?: unknown } | undefined;
      maybeHydratePackOnFirstSelection(selectedPackRow?.value, profilesRow?.value);
    } catch {
      // best-effort hydration only
    }

    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        settings[row.key] = row.key === MESSENGER_SETTINGS_KEY ? decryptMessengerChannelsForClient(parsed) : parsed;
      } catch {
        settings[row.key] = row.value;
      }
    }
    res.json({ settings });
  });

  app.put("/api/settings", (req, res) => {
    const body = req.body ?? {};
    const officePackProfilesInPayload = (body as Record<string, unknown>)[OFFICE_PACK_PROFILES_KEY];
    const selectedOfficePackInPayload = (body as Record<string, unknown>)["officeWorkflowPack"];

    const upsert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );

    try {
      for (const [key, value] of Object.entries(body)) {
        if (key === MESSENGER_SETTINGS_KEY) {
          const parsedValue = typeof value === "string" ? safeJsonParse(value) : value;
          const encrypted = encryptMessengerChannelsForStorage(parsedValue);
          upsert.run(key, typeof encrypted === "string" ? encrypted : JSON.stringify(encrypted));
          continue;
        }

        if (key === OFFICE_PACK_PROFILES_KEY && !readBooleanLikeSetting(OFFICE_PACK_SEED_INIT_KEY)) {
          markSeedInitDone();
        }
        upsert.run(key, typeof value === "string" ? value : JSON.stringify(value));
      }
      if (selectedOfficePackInPayload !== undefined) {
        maybeHydratePackOnFirstSelection(selectedOfficePackInPayload, officePackProfilesInPayload);
      }
    } catch (err: any) {
      const detail = err?.message || String(err);
      return res.status(500).json({ ok: false, error: "settings_write_failed", detail });
    }

    res.json({ ok: true });
  });

  app.get("/api/stats", (_req, res) => {
    const activePackRow = db.prepare("SELECT value FROM settings WHERE key = 'officeWorkflowPack' LIMIT 1").get() as
      | { value?: unknown }
      | undefined;
    const activePack = normalizePackKey(activePackRow?.value) ?? "development";
    const managedDevelopmentScope = activePack === "development"
      ? readNotionManagedDevelopmentScope(db as any)
      : null;
    const managedAgentWhere = managedDevelopmentScope
      ? `WHERE id IN (${managedDevelopmentScope.agentIds.map(() => "?").join(", ")})`
      : "";
    const managedAgentAnd = managedDevelopmentScope
      ? `AND id IN (${managedDevelopmentScope.agentIds.map(() => "?").join(", ")})`
      : "";
    const managedAgentParams = managedDevelopmentScope?.agentIds ?? [];
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

    const totalAgents = (
      db.prepare(`SELECT COUNT(*) as cnt FROM agents ${managedAgentWhere}`).get(...managedAgentParams) as { cnt: number }
    ).cnt;
    const workingAgents = (
      db.prepare(`SELECT COUNT(*) as cnt FROM agents WHERE status = 'working' ${managedAgentAnd}`).get(...managedAgentParams) as {
        cnt: number;
      }
    ).cnt;
    const idleAgents = (
      db.prepare(`SELECT COUNT(*) as cnt FROM agents WHERE status = 'idle' ${managedAgentAnd}`).get(...managedAgentParams) as {
        cnt: number;
      }
    ).cnt;

    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const topAgents = db
      .prepare(`SELECT id, name, avatar_emoji, stats_tasks_done, stats_xp FROM agents ${managedAgentWhere} ORDER BY stats_xp DESC LIMIT 5`)
      .all(...managedAgentParams);

    let tasksByDept: unknown[];
    if (activePack !== "development") {
      try {
        tasksByDept = db
          .prepare(
            `
        SELECT
          opd.department_id AS id,
          opd.name,
          opd.icon,
          opd.color,
          COUNT(t.id) AS total_tasks,
          SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks
        FROM office_pack_departments opd
        LEFT JOIN tasks t
          ON t.department_id = opd.department_id
         AND COALESCE(t.workflow_pack_key, 'development') = ?
        WHERE opd.workflow_pack_key = ?
        GROUP BY opd.department_id
        ORDER BY opd.sort_order ASC, opd.department_id ASC
      `,
          )
          .all(activePack, activePack);
      } catch {
        tasksByDept = [];
      }
    } else {
      tasksByDept = [];
    }

    if (!Array.isArray(tasksByDept) || tasksByDept.length <= 0) {
      const managedDepartmentIds = managedDevelopmentScope?.departmentIds ?? null;
      const managedDepartmentClause = managedDepartmentIds
        ? `WHERE d.id IN (${managedDepartmentIds.map(() => "?").join(", ")})`
        : "";
      tasksByDept = db
        .prepare(
          `
      SELECT d.id, d.name, d.icon, d.color,
        COUNT(t.id) AS total_tasks,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks
      FROM departments d
      LEFT JOIN tasks t
        ON t.department_id = d.id
       AND COALESCE(t.workflow_pack_key, 'development') = 'development'
      ${managedDepartmentClause}
      GROUP BY d.id
      ORDER BY d.sort_order ASC, d.id ASC
    `,
        )
        .all(...(managedDepartmentIds ?? []));
    }

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
