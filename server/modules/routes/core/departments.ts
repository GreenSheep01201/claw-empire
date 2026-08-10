import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { DEFAULT_WORKFLOW_PACK_KEY, type WorkflowPackKey } from "../../workflow/packs/definitions.ts";
import {
  getDepartmentForPack,
  parseWorkflowPackKeyInput,
  readActiveOfficeWorkflowPackKey,
} from "../../workflow/packs/department-scope.ts";
import { readNotionManagedDevelopmentDepartmentIds } from "../../workflow/packs/notion-managed-development.ts";

export type DepartmentRouteDeps = Pick<
  RuntimeContext,
  "app" | "db" | "broadcast" | "normalizeTextField" | "runInTransaction"
>;

export function registerDepartmentRoutes(deps: DepartmentRouteDeps): void {
  const { app, db, broadcast, normalizeTextField, runInTransaction } = deps;

  const PROTECTED_DEPARTMENT_IDS = new Set(["planning", "dev", "design", "qa", "devsecops", "operations"]);
  const hasAgentWorkflowPackColumn = (() => {
    try {
      const cols = db.prepare("PRAGMA table_info(agents)").all() as Array<{ name?: unknown }>;
      return cols.some((col) => String(col.name ?? "").trim() === "workflow_pack_key");
    } catch {
      return false;
    }
  })();

  function parseIncludeSeedParam(input: unknown): boolean {
    if (Array.isArray(input)) input = input[0];
    const raw = String(input ?? "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  }

  function resolvePackKeyFromInput(input: unknown): { packKey: WorkflowPackKey | null; invalid: boolean } {
    if (Array.isArray(input)) input = input[0];
    const raw = String(input ?? "").trim();
    if (!raw) return { packKey: null, invalid: false };
    const parsed = parseWorkflowPackKeyInput(raw);
    return parsed ? { packKey: parsed, invalid: false } : { packKey: null, invalid: true };
  }

  function resolveRequestedPackKey(
    queryRaw: unknown,
    bodyRaw?: unknown,
  ): { packKey: WorkflowPackKey; invalid: boolean } {
    const fromQuery = resolvePackKeyFromInput(queryRaw);
    if (fromQuery.invalid) return { packKey: DEFAULT_WORKFLOW_PACK_KEY, invalid: true };
    if (fromQuery.packKey) return { packKey: fromQuery.packKey, invalid: false };

    const fromBody = resolvePackKeyFromInput(bodyRaw);
    if (fromBody.invalid) return { packKey: DEFAULT_WORKFLOW_PACK_KEY, invalid: true };
    if (fromBody.packKey) return { packKey: fromBody.packKey, invalid: false };

    return { packKey: readActiveOfficeWorkflowPackKey(db as any), invalid: false };
  }

  function listDevelopmentDepartments(includeSeed: boolean): unknown[] {
    const seedFilterClause = includeSeed ? "" : " AND a.id NOT LIKE '%-seed-%'";
    const agentPackExpr = hasAgentWorkflowPackColumn ? "COALESCE(a.workflow_pack_key, 'development')" : "'development'";
    const managedDepartmentIds = readNotionManagedDevelopmentDepartmentIds(db as any);
    const managedDepartmentClause = managedDepartmentIds
      ? `WHERE d.id IN (${managedDepartmentIds.map(() => "?").join(", ")})`
      : "";
    return db
      .prepare(
        `
    SELECT d.*,
      (SELECT COUNT(*)
       FROM agents a
       WHERE a.department_id = d.id
         AND ${agentPackExpr} = 'development'${seedFilterClause}) AS agent_count
    FROM departments d
    ${managedDepartmentClause}
    ORDER BY d.sort_order ASC
  `,
      )
      .all(...(managedDepartmentIds ?? []));
  }

  function listScopedDepartments(packKey: WorkflowPackKey, includeSeed: boolean): unknown[] {
    if (packKey === DEFAULT_WORKFLOW_PACK_KEY) return listDevelopmentDepartments(includeSeed);
    const seedFilterClause = includeSeed ? "" : " AND a.id NOT LIKE '%-seed-%'";
    const agentPackExpr = hasAgentWorkflowPackColumn ? "COALESCE(a.workflow_pack_key, 'development')" : "'development'";
    try {
      const scoped = db
        .prepare(
          `
      SELECT
        opd.department_id AS id,
        opd.name,
        opd.name_ko,
        opd.name_ja,
        opd.name_zh,
        opd.icon,
        opd.color,
        opd.description,
        opd.prompt,
        opd.sort_order,
        opd.created_at,
        (SELECT COUNT(*)
         FROM agents a
         WHERE a.department_id = opd.department_id
           AND ${agentPackExpr} = ?${seedFilterClause}) AS agent_count
      FROM office_pack_departments opd
      WHERE opd.workflow_pack_key = ?
      ORDER BY opd.sort_order ASC, opd.department_id ASC
    `,
        )
        .all(packKey, packKey);
      if (Array.isArray(scoped) && scoped.length > 0) return scoped;
    } catch {
      // fall through to development fallback
    }
    return listDevelopmentDepartments(includeSeed);
  }

  app.get("/api/departments", (req, res) => {
    const resolved = resolveRequestedPackKey(req.query?.workflow_pack_key);
    if (resolved.invalid) return res.status(400).json({ error: "invalid_workflow_pack_key" });
    const includeSeed = parseIncludeSeedParam(req.query?.include_seed);
    const departments = listScopedDepartments(resolved.packKey, includeSeed);
    res.json({ departments });
  });

  app.get("/api/departments/:id", (req, res) => {
    const resolved = resolveRequestedPackKey(req.query?.workflow_pack_key);
    if (resolved.invalid) return res.status(400).json({ error: "invalid_workflow_pack_key" });
    const id = String(req.params.id);
    const includeSeed = parseIncludeSeedParam(req.query?.include_seed);
    const seedFilterClause = includeSeed ? "" : " AND id NOT LIKE '%-seed-%'";
    const department = getDepartmentForPack(db as any, resolved.packKey, id);
    if (!department) return res.status(404).json({ error: "not_found" });

    const agents =
      resolved.packKey === DEFAULT_WORKFLOW_PACK_KEY
        ? db
            .prepare(
              `SELECT * FROM agents WHERE department_id = ?${hasAgentWorkflowPackColumn ? " AND COALESCE(workflow_pack_key, 'development') = 'development'" : ""}${seedFilterClause} ORDER BY role, name`,
            )
            .all(id)
        : db
            .prepare(
              `SELECT * FROM agents WHERE department_id = ?${hasAgentWorkflowPackColumn ? " AND COALESCE(workflow_pack_key, 'development') = ?" : ""}${seedFilterClause} ORDER BY role, name`,
            )
            .all(...(hasAgentWorkflowPackColumn ? [id, resolved.packKey] : [id]));
    res.json({ department, agents });
  });

  app.post("/api/departments", (req, res) => {
    try {
      const resolved = resolveRequestedPackKey(req.query?.workflow_pack_key, (req.body as any)?.workflow_pack_key);
      if (resolved.invalid) return res.status(400).json({ error: "invalid_workflow_pack_key" });
      const packKey = resolved.packKey;
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "invalid_payload" });
      }

      const id = normalizeTextField((body as any).id);
      const name = normalizeTextField((body as any).name);
      if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
        return res.status(400).json({ error: "invalid_department_id" });
      }

      const existing =
        packKey === DEFAULT_WORKFLOW_PACK_KEY
          ? db.prepare("SELECT id FROM departments WHERE id = ?").get(id)
          : db
              .prepare(
                "SELECT department_id AS id FROM office_pack_departments WHERE workflow_pack_key = ? AND department_id = ?",
              )
              .get(packKey, id);
      if (existing) return res.status(409).json({ error: "department_id_exists" });

      const nameKo = normalizeTextField((body as any).name_ko) ?? "";
      const nameJa = normalizeTextField((body as any).name_ja) ?? "";
      const nameZh = normalizeTextField((body as any).name_zh) ?? "";
      const icon = normalizeTextField((body as any).icon) ?? "📁";
      const colorInput = normalizeTextField((body as any).color);
      const color = colorInput && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colorInput) ? colorInput : "#6b7280";
      const description = normalizeTextField((body as any).description);
      const prompt = normalizeTextField((body as any).prompt);

      const maxOrder =
        packKey === DEFAULT_WORKFLOW_PACK_KEY
          ? ((db.prepare("SELECT MAX(sort_order) AS m FROM departments").get() as any)?.m ?? 0)
          : ((
              db
                .prepare("SELECT MAX(sort_order) AS m FROM office_pack_departments WHERE workflow_pack_key = ?")
                .get(packKey) as any
            )?.m ?? 0);
      try {
        if (packKey === DEFAULT_WORKFLOW_PACK_KEY) {
          db.prepare(
            "INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, description, prompt, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(id, name, nameKo, nameJa, nameZh, icon, color, description || null, prompt || null, maxOrder + 1);
        } else {
          db.prepare(
            "INSERT INTO office_pack_departments (workflow_pack_key, department_id, name, name_ko, name_ja, name_zh, icon, color, description, prompt, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            packKey,
            id,
            name,
            nameKo,
            nameJa,
            nameZh,
            icon,
            color,
            description || null,
            prompt || null,
            maxOrder + 1,
          );
        }
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (
          msg.includes("idx_departments_sort_order") ||
          msg.includes("departments.sort_order") ||
          msg.includes("idx_office_pack_departments_pack_sort")
        ) {
          return res.status(409).json({ error: "sort_order_conflict" });
        }
        throw err;
      }

      const dept = getDepartmentForPack(db as any, packKey, id);
      broadcast("departments_changed", { workflow_pack_key: packKey });
      res.status(201).json({ department: dept });
    } catch (err) {
      console.error("[departments] POST failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.patch("/api/departments/:id", (req, res, next) => {
    try {
      const resolved = resolveRequestedPackKey(req.query?.workflow_pack_key, (req.body as any)?.workflow_pack_key);
      if (resolved.invalid) return res.status(400).json({ error: "invalid_workflow_pack_key" });
      const packKey = resolved.packKey;
      const id = String(req.params.id);
      if (id === "reorder") return next();
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "invalid_payload" });
      }
      const existing =
        packKey === DEFAULT_WORKFLOW_PACK_KEY
          ? db.prepare("SELECT * FROM departments WHERE id = ?").get(id)
          : db
              .prepare("SELECT * FROM office_pack_departments WHERE workflow_pack_key = ? AND department_id = ?")
              .get(packKey, id);
      if (!existing) return res.status(404).json({ error: "not_found" });

      let nextSortOrder: number | undefined;
      if ((body as any).sort_order !== undefined) {
        const parsed = Number((body as any).sort_order);
        if (!Number.isInteger(parsed) || parsed < 0) {
          return res.status(400).json({ error: "invalid_sort_order" });
        }
        nextSortOrder = parsed;
        const conflict =
          packKey === DEFAULT_WORKFLOW_PACK_KEY
            ? db.prepare("SELECT id FROM departments WHERE sort_order = ? AND id != ?").get(nextSortOrder, id)
            : db
                .prepare(
                  "SELECT department_id AS id FROM office_pack_departments WHERE workflow_pack_key = ? AND sort_order = ? AND department_id != ?",
                )
                .get(packKey, nextSortOrder, id);
        if (conflict) {
          return res.status(409).json({ error: "sort_order_conflict", conflicting_id: (conflict as any).id });
        }
      }

      const sets: string[] = [];
      const vals: any[] = [];

      if ((body as any).name !== undefined) {
        const value = normalizeTextField((body as any).name);
        if (!value) return res.status(400).json({ error: "invalid_name" });
        sets.push("name = ?");
        vals.push(value);
      }
      if ((body as any).name_ko !== undefined) {
        sets.push("name_ko = ?");
        vals.push(normalizeTextField((body as any).name_ko) ?? "");
      }
      if ((body as any).name_ja !== undefined) {
        sets.push("name_ja = ?");
        vals.push(normalizeTextField((body as any).name_ja) ?? "");
      }
      if ((body as any).name_zh !== undefined) {
        sets.push("name_zh = ?");
        vals.push(normalizeTextField((body as any).name_zh) ?? "");
      }
      if ((body as any).icon !== undefined) {
        const value = normalizeTextField((body as any).icon);
        if (!value) return res.status(400).json({ error: "invalid_icon" });
        sets.push("icon = ?");
        vals.push(value);
      }
      if ((body as any).color !== undefined) {
        const value = normalizeTextField((body as any).color);
        if (!value || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
          return res.status(400).json({ error: "invalid_color" });
        }
        sets.push("color = ?");
        vals.push(value);
      }
      if ((body as any).description !== undefined) {
        if ((body as any).description === null) {
          sets.push("description = ?");
          vals.push(null);
        } else {
          sets.push("description = ?");
          vals.push(normalizeTextField((body as any).description) || null);
        }
      }
      if ((body as any).prompt !== undefined) {
        if ((body as any).prompt === null) {
          sets.push("prompt = ?");
          vals.push(null);
        } else {
          sets.push("prompt = ?");
          vals.push(normalizeTextField((body as any).prompt) || null);
        }
      }
      if (nextSortOrder !== undefined) {
        sets.push("sort_order = ?");
        vals.push(nextSortOrder);
      }

      if (sets.length === 0) return res.status(400).json({ error: "no_fields" });
      vals.push(id);
      try {
        if (packKey === DEFAULT_WORKFLOW_PACK_KEY) {
          db.prepare(`UPDATE departments SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
        } else {
          db.prepare(
            `UPDATE office_pack_departments SET ${sets.join(", ")} WHERE workflow_pack_key = ? AND department_id = ?`,
          ).run(...vals.slice(0, -1), packKey, id);
        }
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (
          msg.includes("idx_departments_sort_order") ||
          msg.includes("departments.sort_order") ||
          msg.includes("idx_office_pack_departments_pack_sort")
        ) {
          return res.status(409).json({ error: "sort_order_conflict" });
        }
        throw err;
      }

      const dept = getDepartmentForPack(db as any, packKey, id);
      broadcast("departments_changed", { workflow_pack_key: packKey });
      res.json({ department: dept });
    } catch (err) {
      console.error("[departments] PATCH failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.delete("/api/departments/:id", (req, res) => {
    try {
      const resolved = resolveRequestedPackKey(req.query?.workflow_pack_key, (req.body as any)?.workflow_pack_key);
      if (resolved.invalid) return res.status(400).json({ error: "invalid_workflow_pack_key" });
      const packKey = resolved.packKey;
      const id = String(req.params.id);
      const existing =
        packKey === DEFAULT_WORKFLOW_PACK_KEY
          ? db.prepare("SELECT id FROM departments WHERE id = ?").get(id)
          : db
              .prepare(
                "SELECT department_id AS id FROM office_pack_departments WHERE workflow_pack_key = ? AND department_id = ?",
              )
              .get(packKey, id);
      if (!existing) return res.status(404).json({ error: "not_found" });
      if (packKey === DEFAULT_WORKFLOW_PACK_KEY && PROTECTED_DEPARTMENT_IDS.has(id)) {
        return res.status(403).json({ error: "department_protected" });
      }

      const agentCount =
        packKey === DEFAULT_WORKFLOW_PACK_KEY
          ? ((
              db
                .prepare(
                  `SELECT COUNT(*) AS c FROM agents WHERE department_id = ?${hasAgentWorkflowPackColumn ? " AND COALESCE(workflow_pack_key, 'development') = 'development'" : ""}`,
                )
                .get(id) as any
            )?.c ?? 0)
          : ((
              db
                .prepare(
                  `SELECT COUNT(*) AS c FROM agents WHERE department_id = ?${hasAgentWorkflowPackColumn ? " AND COALESCE(workflow_pack_key, 'development') = ?" : ""}`,
                )
                .get(...(hasAgentWorkflowPackColumn ? [id, packKey] : [id])) as any
            )?.c ?? 0);
      if (agentCount > 0) return res.status(409).json({ error: "department_has_agents", agent_count: agentCount });
      const taskCount =
        packKey === DEFAULT_WORKFLOW_PACK_KEY
          ? ((
              db
                .prepare(
                  "SELECT COUNT(*) AS c FROM tasks WHERE department_id = ? AND COALESCE(workflow_pack_key, 'development') = 'development'",
                )
                .get(id) as any
            )?.c ?? 0)
          : ((
              db
                .prepare(
                  "SELECT COUNT(*) AS c FROM tasks WHERE department_id = ? AND COALESCE(workflow_pack_key, 'development') = ?",
                )
                .get(id, packKey) as any
            )?.c ?? 0);
      if (taskCount > 0) return res.status(409).json({ error: "department_has_tasks", task_count: taskCount });

      if (packKey === DEFAULT_WORKFLOW_PACK_KEY) {
        db.prepare("DELETE FROM departments WHERE id = ?").run(id);
      } else {
        db.prepare("DELETE FROM office_pack_departments WHERE workflow_pack_key = ? AND department_id = ?").run(
          packKey,
          id,
        );
      }
      broadcast("departments_changed", { workflow_pack_key: packKey });
      res.json({ ok: true });
    } catch (err) {
      console.error("[departments] DELETE failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  app.patch("/api/departments/reorder", (req, res) => {
    try {
      const resolved = resolveRequestedPackKey(req.query?.workflow_pack_key, (req.body as any)?.workflow_pack_key);
      if (resolved.invalid) return res.status(400).json({ error: "invalid_workflow_pack_key" });
      const packKey = resolved.packKey;
      const body = req.body;
      if (!body || !Array.isArray(body.orders)) {
        return res.status(400).json({ error: "orders_array_required" });
      }
      const orders = body.orders as Array<{ id: string; sort_order: number }>;
      for (const item of orders) {
        if (
          !item.id ||
          typeof item.sort_order !== "number" ||
          !Number.isInteger(item.sort_order) ||
          item.sort_order < 0
        ) {
          return res.status(400).json({ error: "invalid_order_entry", detail: item });
        }
      }

      runInTransaction(() => {
        const tempBase = 90000;
        const stmtTemp =
          packKey === DEFAULT_WORKFLOW_PACK_KEY
            ? db.prepare("UPDATE departments SET sort_order = ? WHERE id = ?")
            : db.prepare(
                "UPDATE office_pack_departments SET sort_order = ? WHERE workflow_pack_key = ? AND department_id = ?",
              );
        for (let i = 0; i < orders.length; i++) {
          if (packKey === DEFAULT_WORKFLOW_PACK_KEY) {
            stmtTemp.run(tempBase + i, orders[i].id);
          } else {
            stmtTemp.run(tempBase + i, packKey, orders[i].id);
          }
        }

        const stmtFinal =
          packKey === DEFAULT_WORKFLOW_PACK_KEY
            ? db.prepare("UPDATE departments SET sort_order = ? WHERE id = ?")
            : db.prepare(
                "UPDATE office_pack_departments SET sort_order = ? WHERE workflow_pack_key = ? AND department_id = ?",
              );
        for (const item of orders) {
          if (packKey === DEFAULT_WORKFLOW_PACK_KEY) {
            stmtFinal.run(item.sort_order, item.id);
          } else {
            stmtFinal.run(item.sort_order, packKey, item.id);
          }
        }
      });
      broadcast("departments_changed", { workflow_pack_key: packKey });
      res.json({ ok: true });
    } catch (err) {
      console.error("[departments] PATCH reorder failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });
}
