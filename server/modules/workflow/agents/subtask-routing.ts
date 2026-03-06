import type { Lang } from "../../../types/lang.ts";
import { resolveConstrainedAgentScopeForTask } from "../../routes/core/tasks/execution-run-auto-assign.ts";

type PlannerSubtaskAssignment = {
  subtask_id: string;
  target_department_id: string | null;
  reason?: string;
  confidence?: number;
};

type SubtaskRoutingDeps = {
  db: any;
  DEPT_KEYWORDS: Record<string, string[]>;
  detectTargetDepartments: (text: string) => string[];
  runAgentOneShot: (agent: any, prompt: string, options: any) => Promise<{ text: string }>;
  resolveProjectPath: (task: { title?: string; description?: string | null; project_path?: string | null }) => string;
  resolveLang: (text: string) => Lang;
  findTeamLeader: (departmentId: string, candidateAgentIds?: string[] | null) => any;
  getDeptName: (departmentId: string) => string;
  pickL: (choices: any, lang: string) => string;
  l: (ko: string[], en: string[], ja: string[], zh: string[]) => any;
  broadcast: (event: string, payload: unknown) => void;
  appendTaskLog: (taskId: string | null, kind: string, message: string) => void;
  notifyCeo: (message: string, taskId: string | null, messageType?: string) => void;
};

export function createSubtaskRoutingTools(deps: SubtaskRoutingDeps) {
  const {
    db,
    DEPT_KEYWORDS,
    detectTargetDepartments,
    runAgentOneShot,
    resolveProjectPath,
    resolveLang,
    findTeamLeader,
    getDeptName,
    pickL,
    l,
    broadcast,
    appendTaskLog,
    notifyCeo,
  } = deps;

  function findExplicitDepartmentByMention(text: string, parentDeptId: string | null): string | null {
    const normalized = text.toLowerCase();
    const deptRows = db.prepare("SELECT id, name, name_ko FROM departments ORDER BY sort_order ASC").all() as Array<{
      id: string;
      name: string;
      name_ko: string;
    }>;

    let best: { id: string; index: number; len: number } | null = null;
    for (const dept of deptRows) {
      if (dept.id === parentDeptId) continue;
      const variants = [dept.name, dept.name_ko, dept.name_ko.replace(/팀$/, "")];
      for (const variant of variants) {
        const token = variant.trim().toLowerCase();
        if (!token) continue;
        const idx = normalized.indexOf(token);
        if (idx < 0) continue;
        if (!best || idx < best.index || (idx === best.index && token.length > best.len)) {
          best = { id: dept.id, index: idx, len: token.length };
        }
      }
    }
    return best?.id ?? null;
  }

  function analyzeSubtaskDepartment(subtaskTitle: string, parentDeptId: string | null): string | null {
    const cleaned = subtaskTitle
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return null;

    const prefix = cleaned.includes(":") ? cleaned.split(":")[0] : cleaned;
    const explicitFromPrefix = findExplicitDepartmentByMention(prefix, parentDeptId);
    if (explicitFromPrefix) return explicitFromPrefix;

    const explicitFromWhole = findExplicitDepartmentByMention(cleaned, parentDeptId);
    if (explicitFromWhole) return explicitFromWhole;

    const foreignDepts = detectTargetDepartments(cleaned).filter((d) => d !== parentDeptId);
    if (foreignDepts.length <= 1) return foreignDepts[0] ?? null;

    const normalized = cleaned.toLowerCase();
    let bestDept: string | null = null;
    let bestScore = -1;
    let bestFirstHit = Number.MAX_SAFE_INTEGER;

    for (const deptId of foreignDepts) {
      const keywords = DEPT_KEYWORDS[deptId] ?? [];
      let score = 0;
      let firstHit = Number.MAX_SAFE_INTEGER;
      for (const keyword of keywords) {
        const token = keyword.toLowerCase();
        const idx = normalized.indexOf(token);
        if (idx < 0) continue;
        score += 1;
        if (idx < firstHit) firstHit = idx;
      }
      if (score > bestScore || (score === bestScore && firstHit < bestFirstHit)) {
        bestScore = score;
        bestFirstHit = firstHit;
        bestDept = deptId;
      }
    }

    return bestDept ?? foreignDepts[0] ?? null;
  }

  const plannerSubtaskRoutingInFlight = new Set<string>();

  function normalizeDeptAliasToken(input: string): string {
    return input.toLowerCase().replace(/[\s_\-()[\]{}]/g, "");
  }

  function normalizePlannerTargetDeptId(
    rawTarget: unknown,
    ownerDeptId: string | null,
    deptRows: Array<{ id: string; name: string; name_ko: string }>,
  ): string | null {
    if (rawTarget == null) return null;
    const raw = String(rawTarget).trim();
    if (!raw) return null;
    const token = normalizeDeptAliasToken(raw);
    const nullAliases = new Set([
      "null",
      "none",
      "owner",
      "ownerdept",
      "ownerdepartment",
      "same",
      "sameasowner",
      "自部署",
      "内部",
      "同一部署",
      "元部署",
      "なし",
      "无",
      "同部门",
      "同部門",
    ]);
    if (nullAliases.has(token)) return null;

    for (const dept of deptRows) {
      const aliases = new Set<string>(
        [dept.id, dept.name, dept.name_ko, dept.name_ko.replace(/팀$/g, ""), dept.name.replace(/\s*team$/i, "")].map(
          (v) => normalizeDeptAliasToken(v),
        ),
      );
      if (aliases.has(token)) {
        return dept.id === ownerDeptId ? null : dept.id;
      }
    }
    return null;
  }

  function parsePlannerSubtaskAssignments(rawText: string): PlannerSubtaskAssignment[] {
    const text = rawText.trim();
    if (!text) return [];

    const candidates: string[] = [];
    const fencedMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    for (const m of fencedMatches) {
      const body = (m[1] ?? "").trim();
      if (body) candidates.push(body);
    }
    candidates.push(text);
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) candidates.push(objectMatch[0]);

    for (const candidate of candidates) {
      let parsed: any;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }
      const rows = Array.isArray(parsed?.assignments) ? parsed.assignments : Array.isArray(parsed) ? parsed : [];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const normalized: PlannerSubtaskAssignment[] = [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const subtaskId = typeof row.subtask_id === "string" ? row.subtask_id.trim() : "";
        if (!subtaskId) continue;
        const targetRaw =
          row.target_department_id ?? row.target_department ?? row.department_id ?? row.department ?? null;
        const reason = typeof row.reason === "string" ? row.reason.trim() : undefined;
        const confidence = typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : undefined;
        normalized.push({
          subtask_id: subtaskId,
          target_department_id: targetRaw == null ? null : String(targetRaw),
          reason,
          confidence,
        });
      }
      if (normalized.length > 0) return normalized;
    }

    return [];
  }

  async function rerouteSubtasksByPlanningLeader(
    taskId: string,
    ownerDeptId: string | null,
    phase: "planned" | "review",
  ): Promise<void> {
    const lockKey = `${phase}:${taskId}`;
    if (plannerSubtaskRoutingInFlight.has(lockKey)) return;
    plannerSubtaskRoutingInFlight.add(lockKey);

    try {
      const task = db
        .prepare(
          "SELECT title, description, project_path, assigned_agent_id, department_id, project_id, workflow_pack_key FROM tasks WHERE id = ?",
        )
        .get(taskId) as
        | {
            title: string;
            description: string | null;
            project_path: string | null;
            assigned_agent_id: string | null;
            department_id: string | null;
            project_id: string | null;
            workflow_pack_key: string | null;
          }
        | undefined;
      if (!task) return;
      const constrainedAgentIds = resolveConstrainedAgentScopeForTask(db as any, {
        project_id: task.project_id,
        workflow_pack_key: task.workflow_pack_key,
        department_id: task.department_id ?? ownerDeptId,
      });
      const planningLeader = findTeamLeader("planning", constrainedAgentIds);
      if (!planningLeader) return;

      const baseDeptId = ownerDeptId ?? task.department_id;
      const lang = resolveLang(task.description ?? task.title);
      const subtasks = db
        .prepare(
          `
      SELECT id, title, description, status, blocked_reason, target_department_id, assigned_agent_id, delegated_task_id
      FROM subtasks
      WHERE task_id = ?
        AND status IN ('pending', 'blocked')
        AND (delegated_task_id IS NULL OR delegated_task_id = '')
      ORDER BY created_at ASC
    `,
        )
        .all(taskId) as Array<{
        id: string;
        title: string;
        description: string | null;
        status: string;
        blocked_reason: string | null;
        target_department_id: string | null;
        assigned_agent_id: string | null;
        delegated_task_id: string | null;
      }>;
      if (subtasks.length === 0) return;

      const deptRows = db.prepare("SELECT id, name, name_ko FROM departments ORDER BY sort_order ASC").all() as Array<{
        id: string;
        name: string;
        name_ko: string;
      }>;
      if (deptRows.length === 0) return;

      const deptGuide = deptRows.map((dept) => `- ${dept.id}: ${dept.name_ko || dept.name} (${dept.name})`).join("\n");
      const subtaskGuide = subtasks
        .map((st, idx) => {
          const compactDesc = (st.description ?? "").replace(/\s+/g, " ").trim();
          const descPart = compactDesc ? ` desc="${compactDesc.slice(0, 220)}"` : "";
          const targetPart = st.target_department_id ? ` current_target=${st.target_department_id}` : "";
          return `${idx + 1}. id=${st.id} title="${st.title}"${descPart}${targetPart}`;
        })
        .join("\n");

      const reroutePrompt = [
        "You are the planning team leader responsible for precise subtask department assignment.",
        "Decide the target department for each subtask.",
        "",
        `Task: ${task.title}`,
        task.description ? `Task description: ${task.description}` : "",
        `Owner department id: ${baseDeptId ?? "unknown"}`,
        `Workflow phase: ${phase}`,
        "",
        "Valid departments:",
        deptGuide,
        "",
        "Subtasks:",
        subtaskGuide,
        "",
        "Return ONLY JSON in this exact shape:",
        '{"assignments":[{"subtask_id":"...","target_department_id":"department_id_or_null","reason":"short reason","confidence":0.0}]}',
        "Rules:",
        "- Include one assignment per listed subtask_id.",
        "- If subtask stays in owner department, set target_department_id to null.",
        "- Do not invent subtask IDs or department IDs.",
        "- confidence must be between 0.0 and 1.0.",
      ]
        .filter(Boolean)
        .join("\n");

      const run = await runAgentOneShot(planningLeader, reroutePrompt, {
        projectPath: resolveProjectPath({
          title: task.title,
          description: task.description,
          project_path: task.project_path,
        }),
        timeoutMs: 180_000,
        rawOutput: true,
        noTools: true,
      });
      const assignments = parsePlannerSubtaskAssignments(run.text);
      if (assignments.length === 0) {
        appendTaskLog(taskId, "system", `Planning reroute skipped: parser found no assignment payload (${phase})`);
        return;
      }

      const subtaskById = new Map(subtasks.map((st) => [st.id, st]));
      const summaryByDept = new Map<string, number>();
      let updated = 0;

      for (const assignment of assignments) {
        const subtask = subtaskById.get(assignment.subtask_id);
        if (!subtask) continue;

        const normalizedTargetDept = normalizePlannerTargetDeptId(
          assignment.target_department_id,
          baseDeptId,
          deptRows,
        );

        let nextStatus = subtask.status;
        let nextBlockedReason = subtask.blocked_reason ?? null;
        let nextAssignee = subtask.assigned_agent_id ?? null;
        if (normalizedTargetDept) {
          const targetDeptName = getDeptName(normalizedTargetDept);
          const targetLeader = findTeamLeader(normalizedTargetDept, constrainedAgentIds);
          nextStatus = "blocked";
          nextBlockedReason = pickL(
            l(
              [`${targetDeptName} 협업 대기`],
              [`Waiting for ${targetDeptName} collaboration`],
              [`${targetDeptName} 協力待ち`],
              [`等待${targetDeptName}协作`],
            ),
            lang,
          );
          if (targetLeader) nextAssignee = targetLeader.id;
        } else {
          if (subtask.status === "blocked") nextStatus = "pending";
          nextBlockedReason = null;
          if (task.assigned_agent_id) nextAssignee = task.assigned_agent_id;
        }

        const targetSame = (subtask.target_department_id ?? null) === normalizedTargetDept;
        const statusSame = subtask.status === nextStatus;
        const blockedSame = (subtask.blocked_reason ?? null) === (nextBlockedReason ?? null);
        const assigneeSame = (subtask.assigned_agent_id ?? null) === (nextAssignee ?? null);
        if (targetSame && statusSame && blockedSame && assigneeSame) continue;

        db.prepare(
          "UPDATE subtasks SET target_department_id = ?, status = ?, blocked_reason = ?, assigned_agent_id = ? WHERE id = ?",
        ).run(normalizedTargetDept, nextStatus, nextBlockedReason, nextAssignee, subtask.id);
        broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtask.id));

        updated++;
        const bucket = normalizedTargetDept ?? baseDeptId ?? "owner";
        summaryByDept.set(bucket, (summaryByDept.get(bucket) ?? 0) + 1);
      }

      if (updated > 0) {
        const summaryText = [...summaryByDept.entries()].map(([deptId, cnt]) => `${deptId}:${cnt}`).join(", ");
        appendTaskLog(taskId, "system", `Planning leader rerouted ${updated} subtasks (${phase}) => ${summaryText}`);
        notifyCeo(
          pickL(
            l(
              [
                `'${task.title}' 서브태스크 분배를 기획팀장이 재판정하여 ${updated}건을 재배치했습니다. (${summaryText})`,
              ],
              [`Planning leader rerouted ${updated} subtasks for '${task.title}'. (${summaryText})`],
              [
                `'${task.title}' のサブタスク配分を企画リーダーが再判定し、${updated}件を再配置しました。（${summaryText}）`,
              ],
              [`规划负责人已重新判定'${task.title}'的子任务分配，并重分配了${updated}项。（${summaryText}）`],
            ),
            lang,
          ),
          taskId,
        );
      }
    } catch (err: any) {
      appendTaskLog(
        taskId,
        "system",
        `Planning reroute failed (${phase}): ${err?.message ? String(err.message) : String(err)}`,
      );
    } finally {
      plannerSubtaskRoutingInFlight.delete(lockKey);
    }
  }

  return {
    analyzeSubtaskDepartment,
    rerouteSubtasksByPlanningLeader,
  };
}
