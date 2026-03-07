import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Lang } from "../../../../types/lang.ts";
import { resolveWorkflowPackKeyForTask } from "../../../workflow/packs/task-pack-resolver.ts";
import type { AgentRow } from "./types.ts";

type ReportOutputFormat = "ppt" | "md";
type ReportRoutingDeps = any;
type ReportPptToolAvailability = {
  available: boolean;
  missingPaths: string[];
};

const REPORT_CLAUDE_PRIORITY_DEPTS = ["planning", "dev", "design", "qa", "operations"] as const;
const REPORT_PPT_TOOL_REPO = "https://github.com/GreenSheep01201/ppt_team_agent";
const REPORT_PPT_TOOL_DIR = "tools/ppt_team_agent";
const REPORT_PPT_DESIGN_SKILL = `${REPORT_PPT_TOOL_DIR}/.claude/skills/design-skill/SKILL.md`;
const REPORT_PPT_PPTX_SKILL = `${REPORT_PPT_TOOL_DIR}/.claude/skills/pptx-skill/SKILL.md`;
const REPORT_PPT_HTML2PPTX_SCRIPT = `${REPORT_PPT_TOOL_DIR}/.claude/skills/pptx-skill/scripts/html2pptx.js`;
const REPORT_PPT_RESEARCH_AGENT_GUIDE = `${REPORT_PPT_TOOL_DIR}/.claude/agents/research-agent.md`;
const REPORT_PPT_ORGANIZER_AGENT_GUIDE = `${REPORT_PPT_TOOL_DIR}/.claude/agents/organizer-agent.md`;
const REPORT_PLAYWRIGHT_MCP_REPO = "https://github.com/microsoft/playwright-mcp.git";
const REPORT_PLAYWRIGHT_MCP_DIR = "tools/playwright-mcp";
const REPORT_PPT_REQUIRED_PATHS = [
  REPORT_PPT_TOOL_DIR,
  REPORT_PPT_DESIGN_SKILL,
  REPORT_PPT_PPTX_SKILL,
  REPORT_PPT_HTML2PPTX_SCRIPT,
];

const REPORT_DEPT_PRIORITY: Record<string, number> = {
  planning: 0,
  dev: 1,
  design: 2,
  qa: 3,
  operations: 4,
};

const REPORT_DEPT_LABELS: Record<string, string> = {
  planning: "Planning",
  dev: "Development",
  design: "Design",
  qa: "QA",
  operations: "Operations",
};

const REPORT_STATUS_PRIORITY: Record<string, number> = {
  idle: 0,
  break: 1,
  working: 2,
  offline: 3,
};

const REPORT_ROLE_PRIORITY: Record<string, number> = {
  team_leader: 0,
  senior: 1,
  junior: 2,
  intern: 3,
};

export function createReportRoutingTools(deps: ReportRoutingDeps) {
  const {
    db,
    nowMs,
    randomDelay,
    resolveLang,
    detectProjectPath,
    normalizeTextField,
    recordTaskCreationAudit,
    appendTaskLog,
    getAgentDisplayName,
    sendAgentMessage,
    notifyCeo,
    l,
    pickL,
    broadcast,
    isTaskWorkflowInterrupted,
    startTaskExecutionForAgent,
  } = deps;

  function stripReportRequestPrefix(content: string): string {
    return content.replace(/^\s*\[(보고 요청|Report Request|レポート依頼|报告请求)\]\s*/i, "").trim();
  }

  function detectReportOutputFormat(requestText: string): ReportOutputFormat {
    const text = requestText.toLowerCase();
    const explicitMd =
      /(?:^|\s)(md|markdown)(?:\s|$)|마크다운|markdown 보고서|text report|텍스트 보고서|plain text|문서만|文档|テキスト/.test(
        text,
      );
    if (explicitMd) return "md";
    return "ppt";
  }

  function sortReportCandidates(candidates: AgentRow[]): AgentRow[] {
    return [...candidates].sort((a, b) => {
      const ad = REPORT_DEPT_PRIORITY[a.department_id || ""] ?? 99;
      const bd = REPORT_DEPT_PRIORITY[b.department_id || ""] ?? 99;
      if (ad !== bd) return ad - bd;

      const as = REPORT_STATUS_PRIORITY[a.status || ""] ?? 99;
      const bs = REPORT_STATUS_PRIORITY[b.status || ""] ?? 99;
      if (as !== bs) return as - bs;

      const ar = REPORT_ROLE_PRIORITY[a.role || ""] ?? 99;
      const br = REPORT_ROLE_PRIORITY[b.role || ""] ?? 99;
      if (ar !== br) return ar - br;

      return a.name.localeCompare(b.name);
    });
  }

  function fetchAgentById(agentId: string | null): AgentRow | null {
    if (!agentId) return null;
    return db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as unknown as AgentRow | null;
  }

  function fetchClaudePriorityCandidates(): AgentRow[] {
    const placeholders = REPORT_CLAUDE_PRIORITY_DEPTS.map(() => "?").join(",");
    return sortReportCandidates(
      db
        .prepare(
          `
      SELECT * FROM agents
      WHERE status != 'offline'
        AND cli_provider = 'claude'
        AND department_id IN (${placeholders})
    `,
        )
        .all(...REPORT_CLAUDE_PRIORITY_DEPTS) as unknown as AgentRow[],
    );
  }

  function fetchFallbackCandidates(): AgentRow[] {
    return sortReportCandidates(
      db
        .prepare(
          `
      SELECT * FROM agents
      WHERE status != 'offline'
    `,
        )
        .all() as unknown as AgentRow[],
    );
  }

  function pickTopRecommendationsByDept(candidates: AgentRow[]): AgentRow[] {
    const used = new Set<string>();
    const out: AgentRow[] = [];
    for (const agent of candidates) {
      const deptId = String(agent.department_id || "");
      if (!Object.prototype.hasOwnProperty.call(REPORT_DEPT_PRIORITY, deptId)) continue;
      if (used.has(deptId)) continue;
      used.add(deptId);
      out.push(agent);
    }
    return out;
  }

  function formatRecommendationList(candidates: AgentRow[]): string {
    if (candidates.length === 0) return "none";
    return candidates
      .map((agent, idx) => {
        const deptId = String(agent.department_id || "");
        const dept = REPORT_DEPT_LABELS[deptId] || deptId || "Unknown";
        return `${idx + 1}. ${dept}:${agent.name}`;
      })
      .join(" / ");
  }

  function resolveReportAssignee(targetAgentId: string | null): {
    requestedAgent: AgentRow | null;
    assignee: AgentRow | null;
    claudeRecommendations: AgentRow[];
    reroutedToClaude: boolean;
    claudeUnavailable: boolean;
  } {
    const requestedAgent = fetchAgentById(targetAgentId);
    const claudeCandidates = fetchClaudePriorityCandidates();
    const claudeRecommendations = pickTopRecommendationsByDept(claudeCandidates);

    if (claudeCandidates.length > 0) {
      if (requestedAgent && requestedAgent.status !== "offline" && requestedAgent.cli_provider === "claude") {
        return {
          requestedAgent,
          assignee: requestedAgent,
          claudeRecommendations,
          reroutedToClaude: false,
          claudeUnavailable: false,
        };
      }
      return {
        requestedAgent,
        assignee: claudeRecommendations[0] ?? claudeCandidates[0] ?? null,
        claudeRecommendations,
        reroutedToClaude: Boolean(requestedAgent && requestedAgent.cli_provider !== "claude"),
        claudeUnavailable: false,
      };
    }

    const fallbackCandidates = fetchFallbackCandidates();
    const fallbackAssignee =
      requestedAgent && requestedAgent.status !== "offline" ? requestedAgent : (fallbackCandidates[0] ?? null);

    return {
      requestedAgent,
      assignee: fallbackAssignee,
      claudeRecommendations: [],
      reroutedToClaude: false,
      claudeUnavailable: true,
    };
  }

  function pickPlanningReportAssignee(preferredAgentId: string | null): AgentRow | null {
    return resolveReportAssignee(preferredAgentId).assignee;
  }

  function detectReportPptToolAvailability(): ReportPptToolAvailability {
    const missingPaths = REPORT_PPT_REQUIRED_PATHS.filter((path) => !existsSync(path));
    return {
      available: missingPaths.length === 0,
      missingPaths,
    };
  }

  function handleReportRequest(targetAgentId: string, ceoMessage: string): boolean {
    const routing = resolveReportAssignee(targetAgentId);
    const reportAssignee = routing.assignee;
    if (!reportAssignee) return false;

    const lang = resolveLang(ceoMessage);
    const cleanRequest = stripReportRequestPrefix(ceoMessage) || ceoMessage.trim();
    const outputFormat = detectReportOutputFormat(cleanRequest);
    const outputLabel = outputFormat === "ppt" ? "PPT" : "MD";
    const outputExt = outputFormat === "ppt" ? "pptx" : "md";
    const taskType = outputFormat === "ppt" ? "presentation" : "documentation";
    const t = nowMs();
    const taskId = randomUUID();
    const assigneeDeptId = reportAssignee.department_id || "planning";
    const assigneeDeptName = REPORT_DEPT_LABELS[assigneeDeptId] || assigneeDeptId || "Planning";
    const requestPreview = cleanRequest.length > 64 ? `${cleanRequest.slice(0, 61).trimEnd()}...` : cleanRequest;
    const taskTitle =
      outputFormat === "ppt" ? `報告資料(PPT)作成: ${requestPreview}` : `報告書(MD)作成: ${requestPreview}`;
    const detectedPath = detectProjectPath(cleanRequest);
    const fileStamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 16);
    const outputPath =
      outputFormat === "ppt"
        ? `docs/reports/${fileStamp}-report-deck.${outputExt}`
        : `docs/reports/${fileStamp}-report.${outputExt}`;
    const htmlSourceDirPath = outputFormat === "ppt" ? `docs/reports/${fileStamp}-report-slides` : "";
    const htmlSourceEntryPath = outputFormat === "ppt" ? `${htmlSourceDirPath}/index.html` : "";
    const researchNotesPath = `docs/reports/${fileStamp}-research-notes.md`;
    const fallbackMdPath = `docs/reports/${fileStamp}-report-fallback.md`;
    let linkedProjectId: string | null = null;
    let linkedProjectPath: string | null = detectedPath ?? null;
    if (detectedPath) {
      const projectByPath = db
        .prepare(
          `
      SELECT id, project_path
      FROM projects
      WHERE project_path = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `,
        )
        .get(detectedPath) as { id: string; project_path: string } | undefined;
      if (projectByPath) {
        linkedProjectId = projectByPath.id;
        linkedProjectPath = projectByPath.project_path;
      }
    }
    if (!linkedProjectId && routing.requestedAgent?.current_task_id) {
      const currentProject = db
        .prepare(
          `
      SELECT t.project_id, p.project_path
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
      LIMIT 1
    `,
        )
        .get(routing.requestedAgent.current_task_id) as
        | {
            project_id: string | null;
            project_path: string | null;
          }
        | undefined;
      linkedProjectId = normalizeTextField(currentProject?.project_id);
      if (!linkedProjectPath) linkedProjectPath = normalizeTextField(currentProject?.project_path);
    }
    const workflowPackKey = resolveWorkflowPackKeyForTask({
      db: db as any,
      projectId: linkedProjectId,
      fallbackPackKey: "report",
    });
    const recommendationText = formatRecommendationList(routing.claudeRecommendations);
    const pptToolAvailability = outputFormat === "ppt" ? detectReportPptToolAvailability() : null;
    const pptAvailabilityLabel = !pptToolAvailability
      ? "not_applicable"
      : pptToolAvailability.available
        ? "available"
        : "unavailable";
    const missingPptPaths =
      outputFormat === "ppt" && pptToolAvailability && !pptToolAvailability.available
        ? pptToolAvailability.missingPaths.join(", ")
        : "";

    const description = [
      `[REPORT REQUEST] ${cleanRequest}`,
      "[REPORT FLOW] review_meeting=skip_for_report",
      outputFormat === "ppt" ? "[REPORT FLOW] design_review=pending" : "[REPORT FLOW] design_review=not_required",
      outputFormat === "ppt" ? "[REPORT FLOW] final_regen=pending" : "[REPORT FLOW] final_regen=not_required",
      "",
      `Primary output format: ${outputLabel}`,
      `Target file path: ${outputPath}`,
      outputFormat === "ppt" ? `HTML source directory: ${htmlSourceDirPath}` : "",
      outputFormat === "ppt" ? `HTML source entry path: ${htmlSourceEntryPath}` : "",
      `Research notes path: ${researchNotesPath}`,
      outputFormat === "ppt" ? `Fallback markdown path: ${fallbackMdPath}` : "",
      outputFormat === "ppt" ? `PPT Team availability at dispatch: ${pptAvailabilityLabel}` : "",
      outputFormat === "ppt" && missingPptPaths ? `Missing PPT Team paths: ${missingPptPaths}` : "",
      "Tool preset: web-search + playwright-mcp + ppt_team_agent",
      "",
      "Default Tooling (must apply):",
      "- Web search: research the requested topic first and include source URLs + access date for major claims.",
      `- Browser MCP tool: playwright-mcp (${REPORT_PLAYWRIGHT_MCP_REPO})`,
      `- Local browser MCP workspace: ${REPORT_PLAYWRIGHT_MCP_DIR}`,
      `- PPT generation tool (required for PPT output when available): ${REPORT_PPT_TOOL_REPO}`,
      `- Local tool workspace: ${REPORT_PPT_TOOL_DIR}`,
      outputFormat === "ppt"
        ? `- [PPT SKILL MANDATE] Read and apply design skill guide first: ${REPORT_PPT_DESIGN_SKILL}`
        : "",
      outputFormat === "ppt" ? `- [PPT SKILL MANDATE] Follow pptx workflow guide: ${REPORT_PPT_PPTX_SKILL}` : "",
      outputFormat === "ppt"
        ? `- [PPT SKILL MANDATE] Use html->pptx conversion workflow/script: ${REPORT_PPT_HTML2PPTX_SCRIPT}`
        : "",
      outputFormat === "ppt"
        ? `- [PPT SKILL MANDATE] Use research/organizer agent guides for quality bar: ${REPORT_PPT_RESEARCH_AGENT_GUIDE}, ${REPORT_PPT_ORGANIZER_AGENT_GUIDE}`
        : "",
      `- This repository tracks both tools as pinned git submodules at ${REPORT_PLAYWRIGHT_MCP_DIR} and ${REPORT_PPT_TOOL_DIR}; do not auto-clone from runtime.`,
      `- If submodule content is missing: git submodule update --init --recursive ${REPORT_PLAYWRIGHT_MCP_DIR} ${REPORT_PPT_TOOL_DIR}`,
      "Rules:",
      "- This is a report/documentation request only; do not execute implementation work.",
      "- Follow sequence: research -> evidence notes -> output artifact.",
      outputFormat === "ppt"
        ? "- For PPT workflow, generate and maintain editable HTML slide sources first (do not skip HTML intermediate artifacts)."
        : "",
      outputFormat === "ppt"
        ? `- For PPT output, do not skip ${REPORT_PPT_TOOL_DIR} skill workflow; apply design-skill and pptx-skill guidance before final deck generation.`
        : "",
      outputFormat === "ppt" ? "- [PPT EXECUTION POLICY] Use PPT Team workflow first." : "",
      outputFormat === "ppt"
        ? "- [PPT EXECUTION POLICY] `python-pptx` is forbidden while PPT Team workflow is available."
        : "",
      outputFormat === "ppt"
        ? "- [PPT EXECUTION POLICY] `python-pptx` is allowed only when PPT Team is unavailable (missing/broken tool paths) or PPT Team commands hard-fail after one retry."
        : "",
      outputFormat === "ppt"
        ? "- [PPT EXECUTION POLICY] If `python-pptx` fallback is used, include failed PPT Team command(s), retry result, and root-cause summary in the report notes."
        : "",
      outputFormat === "ppt" && pptToolAvailability?.available
        ? "- [PPT EXECUTION POLICY] Runtime precheck: PPT Team paths are present. Do not switch to `python-pptx` unless PPT Team execution fails during this run."
        : "",
      outputFormat === "ppt" && pptToolAvailability && !pptToolAvailability.available
        ? "- [PPT EXECUTION POLICY] Runtime precheck: PPT Team paths are missing. You may use `python-pptx` as emergency fallback, then document missing paths and recovery command usage."
        : "",
      outputFormat === "ppt"
        ? "- Final PPT must be regenerated from the HTML sources after the design checkpoint handoff."
        : "",
      outputFormat === "ppt"
        ? "- [DELIVERABLES] Produce both outputs in this run: (1) editable HTML slide source bundle and (2) final .pptx deck."
        : "",
      outputFormat === "ppt" ? `- [DELIVERABLES] HTML source entry must exist at: ${htmlSourceEntryPath}` : "",
      outputFormat === "ppt" ? `- [DELIVERABLES] PPTX artifact must exist at: ${outputPath}` : "",
      outputFormat === "ppt"
        ? `- [DELIVERABLES] Include file evidence for both outputs in your report message (example: \`ls -lh ${htmlSourceEntryPath} ${outputPath}\`).`
        : "",
      outputFormat === "ppt"
        ? "- Deliver .pptx first via PPT Team. If PPT Team is unavailable/hard-fails, try `python-pptx` only as emergency fallback. If .pptx is still impossible, submit markdown fallback with failure reason and manual conversion guidance."
        : "- Create a complete markdown report with structured headings and evidence.",
      routing.claudeUnavailable
        ? "- Claude Code assignee is unavailable in the priority departments. You must attempt PPT creation yourself first; fallback to markdown only when PPT generation fails."
        : "- Claude Code priority routing is enabled for PPT reliability.",
      "- Include executive summary, key findings, quantitative evidence, risks, and next actions.",
    ].join("\n");

    db.prepare(
      `
    INSERT INTO tasks (id, title, description, department_id, assigned_agent_id, project_id, status, priority, task_type, workflow_pack_key, project_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'planned', 1, ?, ?, ?, ?, ?)
  `,
    ).run(
      taskId,
      taskTitle,
      description,
      assigneeDeptId,
      reportAssignee.id,
      linkedProjectId,
      taskType,
      workflowPackKey,
      linkedProjectPath,
      t,
      t,
    );
    recordTaskCreationAudit({
      taskId,
      taskTitle,
      taskStatus: "planned",
      departmentId: assigneeDeptId,
      assignedAgentId: reportAssignee.id,
      taskType,
      projectPath: linkedProjectPath,
      trigger: "workflow.report_request",
      triggerDetail: `format=${outputFormat}; assignee=${reportAssignee.name}`,
      actorType: "agent",
      actorId: reportAssignee.id,
      actorName: reportAssignee.name,
      body: {
        clean_request: cleanRequest,
        output_format: outputFormat,
        output_path: outputPath,
        html_source_dir_path: htmlSourceDirPath || null,
        html_source_entry_path: htmlSourceEntryPath || null,
        research_notes_path: researchNotesPath,
        fallback_md_path: fallbackMdPath,
      },
    });
    if (linkedProjectId) {
      db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(t, t, linkedProjectId);
    }

    db.prepare("UPDATE agents SET current_task_id = ? WHERE id = ?").run(taskId, reportAssignee.id);
    appendTaskLog(taskId, "system", `Report request received via chat: ${cleanRequest}`);
    appendTaskLog(
      taskId,
      "system",
      `Report routing: assignee=${reportAssignee.name} provider=${reportAssignee.cli_provider || "unknown"} format=${outputLabel}`,
    );
    if (routing.reroutedToClaude && routing.requestedAgent) {
      appendTaskLog(
        taskId,
        "system",
        `Claude Code recommendation applied (requested=${routing.requestedAgent.name}/${routing.requestedAgent.cli_provider || "unknown"}): ${recommendationText}`,
      );
    }
    if (routing.claudeUnavailable) {
      appendTaskLog(
        taskId,
        "system",
        "No Claude Code candidate found in priority departments; fallback assignment used.",
      );
    }
    if (outputFormat === "ppt") {
      appendTaskLog(
        taskId,
        "system",
        `PPT Team availability precheck: ${pptAvailabilityLabel}${missingPptPaths ? ` (missing: ${missingPptPaths})` : ""}`,
      );
      appendTaskLog(taskId, "system", `Report deliverables: html=${htmlSourceEntryPath}, pptx=${outputPath}`);
    }
    if (detectedPath) {
      appendTaskLog(taskId, "system", `Project path detected: ${detectedPath}`);
    }

    const assigneeName = getAgentDisplayName(reportAssignee, lang);
    const providerLabel = reportAssignee.cli_provider || "claude";
    sendAgentMessage(
      reportAssignee,
      pickL(
        l(
          [`${assigneeName}입니다. 보고 요청을 접수했습니다. ${outputLabel} 형식으로 작성해 제출하겠습니다.`],
          [`${assigneeName} here. Report request received. I'll deliver it in ${outputLabel} format.`],
          [`${assigneeName}です。レポート依頼を受領しました。${outputLabel}形式で作成して提出します。`],
          [`${assigneeName}收到报告请求，将按${outputLabel}格式完成并提交。`],
        ),
        lang,
      ),
      "report",
      "all",
      null,
      taskId,
    );

    notifyCeo(
      pickL(
        l(
          [
            `[REPORT ROUTING] '${taskTitle}' 요청을 ${assigneeName}(${providerLabel})에게 배정했습니다. 출력 형식: ${outputLabel}`,
          ],
          [
            `[REPORT ROUTING] Assigned '${taskTitle}' to ${assigneeName} (${providerLabel}). Output format: ${outputLabel}`,
          ],
          [
            `[REPORT ROUTING] '${taskTitle}' を ${assigneeName} (${providerLabel}) に割り当てました。出力形式: ${outputLabel}`,
          ],
          [`[REPORT ROUTING] 已将'${taskTitle}'分配给${assigneeName}（${providerLabel}）。输出格式：${outputLabel}`],
        ),
        lang,
      ),
      taskId,
    );
    if (routing.reroutedToClaude && routing.requestedAgent) {
      const requestedName = getAgentDisplayName(routing.requestedAgent, lang);
      notifyCeo(
        pickL(
          l(
            [
              `[CLAUDE RECOMMENDATION] 요청 대상 ${requestedName}(${routing.requestedAgent.cli_provider || "unknown"})는 Claude Code가 아니어서 Claude Code 우선 라우팅을 적용했습니다. 우선순위 추천: ${recommendationText}`,
            ],
            [
              `[CLAUDE RECOMMENDATION] Requested agent ${requestedName} (${routing.requestedAgent.cli_provider || "unknown"}) is not on Claude Code, so Claude-priority routing was applied. Priority recommendations: ${recommendationText}`,
            ],
            [
              `[CLAUDE RECOMMENDATION] 依頼先 ${requestedName}（${routing.requestedAgent.cli_provider || "unknown"}）は Claude Code ではないため、Claude 優先ルーティングを適用しました。優先候補: ${recommendationText}`,
            ],
            [
              `[CLAUDE RECOMMENDATION] 请求目标 ${requestedName}（${routing.requestedAgent.cli_provider || "unknown"}）不是 Claude Code，已启用 Claude 优先路由。优先推荐：${recommendationText}`,
            ],
          ),
          lang,
        ),
        taskId,
      );
    }
    if (routing.claudeUnavailable) {
      notifyCeo(
        pickL(
          l(
            [
              "[CLAUDE RECOMMENDATION] 우선순위 부서(기획>개발>디자인>QA>운영)에서 Claude Code 에이전트를 찾지 못해 현재 담당자가 PPT를 우선 시도하고, 실패 시 MD로 대체하도록 지시했습니다.",
            ],
            [
              "[CLAUDE RECOMMENDATION] No Claude Code agent was found in priority departments (Planning>Development>Design>QA>Operations). The current assignee was instructed to attempt PPT first, then fallback to MD on failure.",
            ],
            [
              "[CLAUDE RECOMMENDATION] 優先部門（企画>開発>デザイン>QA>運用）に Claude Code エージェントがいないため、現担当者にPPT優先・失敗時MD代替を指示しました。",
            ],
            [
              "[CLAUDE RECOMMENDATION] 在优先部门（企划>开发>设计>QA>运营）中未找到 Claude Code 代理，已要求当前负责人先尝试 PPT，失败时改为 MD。",
            ],
          ),
          lang,
        ),
        taskId,
      );
    }

    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
    broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(reportAssignee.id));

    setTimeout(
      () => {
        if (isTaskWorkflowInterrupted(taskId)) return;
        startTaskExecutionForAgent(taskId, reportAssignee, assigneeDeptId, assigneeDeptName);
      },
      randomDelay(900, 1600),
    );

    return true;
  }

  return {
    stripReportRequestPrefix,
    detectReportOutputFormat,
    pickPlanningReportAssignee,
    handleReportRequest,
  };
}
