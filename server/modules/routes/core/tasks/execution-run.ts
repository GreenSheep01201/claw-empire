import path from "node:path";
import { randomUUID as cryptoRandomUUID } from "node:crypto";
import { notifyTaskStatus } from "../../../../gateway/client.ts";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import type { AgentRow } from "../../shared/types.ts";
import { resolveConstrainedAgentScopeForTask, selectAutoAssignableAgentForTask } from "./execution-run-auto-assign.ts";
import { buildWorkflowPackExecutionGuidance } from "../../../workflow/packs/execution-guidance.ts";
import { resolveVideoArtifactSpecForTask } from "../../../workflow/packs/video-artifact.ts";
import { ensureVideoPreprodRemotionBestPracticesSkill } from "../../../workflow/core/video-skill-bootstrap.ts";
import {
  buildInterruptPromptBlock,
  consumeInterruptPrompts,
  loadPendingInterruptPrompts,
} from "../../../workflow/core/interrupt-injection-tools.ts";

export type TaskRunRouteDeps = Pick<
  RuntimeContext,
  | "app"
  | "db"
  | "activeProcesses"
  | "appendTaskLog"
  | "nowMs"
  | "resolveLang"
  | "ensureTaskExecutionSession"
  | "resolveProjectPath"
  | "logsDir"
  | "createWorktree"
  | "generateProjectContext"
  | "getRecentChanges"
  | "ensureClaudeMd"
  | "getDeptRoleConstraint"
  | "normalizeTextField"
  | "getRecentConversationContext"
  | "getTaskContinuationContext"
  | "pickL"
  | "l"
  | "getProviderModelConfig"
  | "buildTaskExecutionPrompt"
  | "hasExplicitWarningFixRequest"
  | "getNextHttpAgentPid"
  | "broadcast"
  | "getAgentDisplayName"
  | "notifyCeo"
  | "startProgressTimer"
  | "launchApiProviderAgent"
  | "launchHttpAgent"
  | "spawnCliAgent"
  | "handleTaskRunComplete"
  | "buildAvailableSkillsPromptBlock"
>;

export function registerTaskRunRoute(deps: TaskRunRouteDeps): void {
  const {
    app,
    db,
    activeProcesses,
    appendTaskLog,
    nowMs,
    resolveLang,
    ensureTaskExecutionSession,
    resolveProjectPath,
    logsDir,
    createWorktree,
    generateProjectContext,
    getRecentChanges,
    ensureClaudeMd,
    getDeptRoleConstraint,
    normalizeTextField,
    getRecentConversationContext,
    getTaskContinuationContext,
    pickL,
    l,
    getProviderModelConfig,
    buildTaskExecutionPrompt,
    hasExplicitWarningFixRequest,
    getNextHttpAgentPid,
    broadcast,
    getAgentDisplayName,
    notifyCeo,
    startProgressTimer,
    launchApiProviderAgent,
    launchHttpAgent,
    spawnCliAgent,
    handleTaskRunComplete,
    buildAvailableSkillsPromptBlock,
  } = deps;

  app.post("/api/tasks/:id/run", (req, res) => {
    const id = String(req.params.id);
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | {
          id: string;
          title: string;
          description: string | null;
          assigned_agent_id: string | null;
          department_id: string | null;
          project_id: string | null;
          workflow_pack_key: string | null;
          project_path: string | null;
          status: string;
        }
      | undefined;
    if (!task) return res.status(404).json({ error: "not_found" });
    const taskLang = resolveLang(task.description ?? task.title);

    if (activeProcesses.has(id)) {
      const staleChild = activeProcesses.get(id);
      const stalePid = typeof staleChild?.pid === "number" ? staleChild.pid : null;
      let pidIsAlive = false;
      if (stalePid !== null && stalePid > 0) {
        try {
          process.kill(stalePid, 0);
          pidIsAlive = true;
        } catch {
          pidIsAlive = false;
        }
      }
      if (!pidIsAlive) {
        activeProcesses.delete(id);
        appendTaskLog(id, "system", `Cleaned up stale process handle (pid=${stalePid}) on re-run attempt`);
      }
    }

    if (task.status === "in_progress" || task.status === "collaborating") {
      if (activeProcesses.has(id)) {
        return res.status(400).json({ error: "already_running" });
      }
      const t = nowMs();
      db.prepare("UPDATE tasks SET status = 'pending', updated_at = ? WHERE id = ?").run(t, id);
      task.status = "pending";
      appendTaskLog(id, "system", `Reset stale in_progress status (no active process) for re-run`);
    }

    if (activeProcesses.has(id)) {
      return res.status(409).json({
        error: "process_still_active",
        message: "Previous run is still stopping. Please retry after a moment.",
      });
    }

    let agentId = task.assigned_agent_id || (req.body?.agent_id as string | undefined);
    if (agentId) {
      const constrainedAgentIds = resolveConstrainedAgentScopeForTask(db as any, {
        workflow_pack_key: task.workflow_pack_key,
        department_id: task.department_id,
        project_id: task.project_id,
      });
      if (
        Array.isArray(constrainedAgentIds) &&
        constrainedAgentIds.length > 0 &&
        !constrainedAgentIds.includes(agentId)
      ) {
        appendTaskLog(
          id,
          "system",
          `Assigned agent (${agentId}) is out of scope for workflow pack. Re-selecting by pack rules.`,
        );
        agentId = undefined;
      }
    }
    if (!agentId) {
      const autoSelected = selectAutoAssignableAgentForTask(db as any, {
        workflow_pack_key: task.workflow_pack_key,
        department_id: task.department_id,
        project_id: task.project_id,
      });
      if (autoSelected) {
        agentId = autoSelected.agent.id;
        const assignedAt = nowMs();
        db.prepare(
          "UPDATE tasks SET assigned_agent_id = ?, department_id = COALESCE(department_id, ?), status = CASE WHEN status = 'inbox' THEN 'planned' ELSE status END, updated_at = ? WHERE id = ?",
        ).run(agentId, autoSelected.agent.department_id, assignedAt, id);
        db.prepare("UPDATE agents SET current_task_id = ? WHERE id = ?").run(id, agentId);
        appendTaskLog(
          id,
          "system",
          `Auto-assigned by workflow pack (${autoSelected.packKey}): ${autoSelected.agent.name}`,
        );
      }
    }
    if (!agentId) {
      return res.status(400).json({
        error: "no_agent_assigned",
        message: "Assign an agent before running.",
      });
    }

    let agent:
      | {
          id: string;
          name: string;
          name_ko: string | null;
          role: string;
          cli_provider: string | null;
          oauth_account_id: string | null;
          api_provider_id: string | null;
          api_model: string | null;
          cli_model: string | null;
          cli_reasoning_level: string | null;
          personality: string | null;
          department_id: string | null;
          department_name: string | null;
          department_name_ko: string | null;
          department_prompt: string | null;
        }
      | undefined;
    try {
      agent = db
        .prepare(
          `
      SELECT
        a.*,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.name_ko, d.name_ko) AS department_name_ko,
        COALESCE(opd.prompt, d.prompt) AS department_prompt
      FROM agents a
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = COALESCE(?, 'development')
       AND opd.department_id = a.department_id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `,
        )
        .get(task.workflow_pack_key, agentId) as
        | {
            id: string;
            name: string;
            name_ko: string | null;
            role: string;
            cli_provider: string | null;
            oauth_account_id: string | null;
            api_provider_id: string | null;
            api_model: string | null;
            cli_model: string | null;
            cli_reasoning_level: string | null;
            personality: string | null;
            department_id: string | null;
            department_name: string | null;
            department_name_ko: string | null;
            department_prompt: string | null;
          }
        | undefined;
    } catch {
      agent = db
        .prepare(
          `
      SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.prompt AS department_prompt
      FROM agents a LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `,
        )
        .get(agentId) as
        | {
            id: string;
            name: string;
            name_ko: string | null;
            role: string;
            cli_provider: string | null;
            oauth_account_id: string | null;
            api_provider_id: string | null;
            api_model: string | null;
            cli_model: string | null;
            cli_reasoning_level: string | null;
            personality: string | null;
            department_id: string | null;
            department_name: string | null;
            department_name_ko: string | null;
            department_prompt: string | null;
          }
        | undefined;
    }
    if (!agent) return res.status(400).json({ error: "agent_not_found" });

    const agentBusy = activeProcesses.has(
      (
        db.prepare("SELECT current_task_id FROM agents WHERE id = ? AND status = 'working'").get(agentId) as
          | { current_task_id: string | null }
          | undefined
      )?.current_task_id ?? "",
    );
    if (agentBusy) {
      return res
        .status(400)
        .json({ error: "agent_busy", message: `${agent.name} is already working on another task.` });
    }

    const provider = agent.cli_provider || "claude";
    if (!["claude", "codex", "gemini", "opencode", "copilot", "antigravity", "api"].includes(provider)) {
      return res.status(400).json({ error: "unsupported_provider", provider });
    }
    ensureVideoPreprodRemotionBestPracticesSkill({
      db: db as any,
      nowMs,
      workflowPackKey: task.workflow_pack_key,
      provider,
      taskId: id,
      appendTaskLog,
    });
    const executionSession = ensureTaskExecutionSession(id, agentId, provider);
    const pendingInterruptPrompts = loadPendingInterruptPrompts(db as any, id, executionSession.sessionId);
    const interruptPromptBlock = buildInterruptPromptBlock(pendingInterruptPrompts);

    const projectPath = resolveProjectPath(task) || (req.body?.project_path as string | undefined) || process.cwd();
    const logPath = path.join(logsDir, `${id}.log`);

    const worktreePath = createWorktree(projectPath, id, agent.name);
    if (!worktreePath) {
      appendTaskLog(
        id,
        "error",
        `Execution blocked: isolated worktree creation failed for project path '${projectPath}'`,
      );
      return res.status(409).json({
        error: "worktree_required",
        message: "Isolated worktree creation failed. Task execution was blocked to protect the project root.",
      });
    }
    const agentCwd = worktreePath;

    appendTaskLog(id, "system", `Git worktree created: ${worktreePath} (branch: climpire/${id.slice(0, 8)})`);

    const projectContext = generateProjectContext(projectPath);
    const recentChanges = getRecentChanges(projectPath, id);

    if (provider === "claude") {
      ensureClaudeMd(projectPath, worktreePath);
    }

    const roleLabel =
      { team_leader: "Team Leader", senior: "Senior", junior: "Junior", intern: "Intern" }[agent.role] || agent.role;
    const deptConstraint = agent.department_id
      ? getDeptRoleConstraint(agent.department_id, agent.department_name || agent.department_id)
      : "";
    const departmentPrompt = normalizeTextField(agent.department_prompt);
    const departmentPromptBlock = departmentPrompt ? `[Department Shared Prompt]\n${departmentPrompt}` : "";
    const conversationCtx = getRecentConversationContext(agentId);
    const continuationCtx = getTaskContinuationContext(id);
    const continuationInstruction = continuationCtx
      ? pickL(
          l(
            ["연속 실행: 동일 소유 컨텍스트를 유지하고, 불필요한 파일 재탐색 없이 미해결 항목만 반영하세요."],
            [
              "Continuation run: keep the same ownership context, avoid re-reading unrelated files, and apply only unresolved deltas.",
            ],
            ["継続実行: 同一オーナーシップを維持し、不要な再探索を避けて未解決差分のみ反映してください。"],
            ["连续执行：保持同一责任上下文，避免重复阅读无关文件，仅处理未解决差异。"],
          ),
          taskLang,
        )
      : pickL(
          l(
            ["반복적인 착수 멘트 없이 바로 실행하세요."],
            ["Execute directly without repeated kickoff narration."],
            ["繰り返しの開始ナレーションなしで直ちに実行してください。"],
            ["无需重复开场说明，直接执行。"],
          ),
          taskLang,
        );
    const projectStructureBlock = continuationCtx
      ? ""
      : projectContext
        ? `[Project Structure]\n${projectContext.length > 4000 ? projectContext.slice(0, 4000) + "\n... (truncated)" : projectContext}`
        : "";
    const needsPlanInstruction = provider === "gemini" || provider === "copilot" || provider === "antigravity";
    const subtaskInstruction = needsPlanInstruction
      ? `\n\n${pickL(
          l(
            [
              `[작업 계획 출력 규칙]
작업을 시작하기 전에 아래 JSON 형식으로 계획을 출력하세요:
\`\`\`json
{"subtasks": [{"title": "서브태스크 제목1"}, {"title": "서브태스크 제목2"}]}
\`\`\`
각 서브태스크를 완료할 때마다 아래 형식으로 보고하세요:
\`\`\`json
{"subtask_done": "완료된 서브태스크 제목"}
\`\`\``,
            ],
            [
              `[Task Plan Output Rules]
Before starting work, print a plan in the JSON format below:
\`\`\`json
{"subtasks": [{"title": "Subtask title 1"}, {"title": "Subtask title 2"}]}
\`\`\`
Whenever you complete a subtask, report it in this format:
\`\`\`json
{"subtask_done": "Completed subtask title"}
\`\`\``,
            ],
            [
              `[作業計画の出力ルール]
作業開始前に、次の JSON 形式で計画を出力してください:
\`\`\`json
{"subtasks": [{"title": "サブタスク1"}, {"title": "サブタスク2"}]}
\`\`\`
各サブタスクを完了するたびに、次の形式で報告してください:
\`\`\`json
{"subtask_done": "完了したサブタスク"}
\`\`\``,
            ],
            [
              `[任务计划输出规则]
开始工作前，请按下述 JSON 格式输出计划:
\`\`\`json
{"subtasks": [{"title": "子任务1"}, {"title": "子任务2"}]}
\`\`\`
每完成一个子任务，请按下述格式汇报:
\`\`\`json
{"subtask_done": "已完成的子任务"}
\`\`\``,
            ],
          ),
          taskLang,
        )}\n`
      : "";

    const modelConfig = getProviderModelConfig();
    const mainModel = agent.cli_model || modelConfig[provider]?.model || undefined;
    const subModel = modelConfig[provider]?.subModel || undefined;
    const mainReasoningLevel =
      provider === "codex"
        ? agent.cli_reasoning_level || modelConfig[provider]?.reasoningLevel || undefined
        : modelConfig[provider]?.reasoningLevel || undefined;
    const subReasoningLevel = modelConfig[provider]?.subModelReasoningLevel || undefined;
    const subModelHint =
      subModel && (provider === "claude" || provider === "codex")
        ? `\n[Sub-agent model preference] When spawning sub-agents (Task tool), prefer using model: ${subModel}${subReasoningLevel ? ` with reasoning effort: ${subReasoningLevel}` : ""}`
        : "";
    const runInstruction = pickL(
      l(
        [
          "위 작업을 충분히 완수하세요. 위 대화 맥락과 프로젝트 구조를 참고해도 좋지만, 프로젝트 구조 탐색에 시간을 쓰지 마세요. 필요한 구조는 이미 제공되었습니다.",
        ],
        [
          "Please complete the task above thoroughly. Use the continuation brief, conversation context, and project structure above if relevant. Do NOT spend time exploring the project structure again unless required by unresolved checklist items.",
        ],
        [
          "上記タスクを丁寧に完了してください。必要に応じて継続要約・会話コンテキスト・プロジェクト構成を参照できますが、未解決チェックリストに必要な場合を除き、構成探索に時間を使わないでください。",
        ],
        [
          "请完整地完成上述任务。可按需参考连续执行摘要、会话上下文和项目结构，但除非未解决清单确有需要，不要再次花时间探索项目结构。",
        ],
      ),
      taskLang,
    );
    const videoArtifactSpec =
      task.workflow_pack_key === "video_preprod"
        ? resolveVideoArtifactSpecForTask(db as any, {
            project_id: task.project_id,
            project_path: task.project_path,
            department_id: task.department_id,
            workflow_pack_key: task.workflow_pack_key,
          })
        : null;
    const workflowPackGuidance = buildWorkflowPackExecutionGuidance(task.workflow_pack_key, taskLang, {
      videoArtifactRelativePath: videoArtifactSpec?.relativePath,
    });

    const prompt = buildTaskExecutionPrompt(
      [
        (
          buildAvailableSkillsPromptBlock ||
          ((providerName: string) => `[Available Skills][provider=${providerName || "unknown"}][unavailable]`)
        )(provider),
        `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
        "This session is task-scoped. Keep continuity for this task only and do not cross-contaminate context from other projects.",
        projectStructureBlock,
        recentChanges ? `[Recent Changes]\n${recentChanges}` : "",
        `[Task] ${task.title}`,
        task.description ? `\n${task.description}` : "",
        workflowPackGuidance ? `\n[Workflow Pack Execution Rules]\n${workflowPackGuidance}` : "",
        continuationCtx,
        conversationCtx,
        `\n---`,
        `Agent: ${agent.name} (${roleLabel}, ${agent.department_name || "Unassigned"})`,
        agent.personality ? `Personality: ${agent.personality}` : "",
        deptConstraint,
        departmentPromptBlock,
        `NOTE: You are working in an isolated Git worktree branch (climpire/${id.slice(0, 8)}). Commit your changes normally.`,
        interruptPromptBlock,
        subtaskInstruction,
        subModelHint,
        continuationInstruction,
        runInstruction,
      ],
      {
        allowWarningFix: hasExplicitWarningFixRequest(task.title, task.description),
      },
    );

    if (pendingInterruptPrompts.length > 0) {
      consumeInterruptPrompts(
        db as any,
        pendingInterruptPrompts.map((row) => row.id),
        nowMs(),
      );
      appendTaskLog(
        id,
        "system",
        `INJECT consumed (${pendingInterruptPrompts.length}) for session ${executionSession.sessionId}`,
      );
    }

    appendTaskLog(id, "system", `RUN start (agent=${agent.name}, provider=${provider})`);

    // ── Kickoff meeting record ──────────────────────────────────────────
    {
      const taskRowForKickoff = db.prepare("SELECT title, description FROM tasks WHERE id = ?").get(id) as
        | { title: string; description: string | null }
        | undefined;
      if (taskRowForKickoff) {
        const kMeetingId = cryptoRandomUUID();
        const kT = nowMs();
        const kDeptName = agent.department_name || agent.department_name_ko || "dev";
        const kShortDesc = (taskRowForKickoff.description ?? "").slice(0, 800);
        const kContent = [
          `## タスク: ${taskRowForKickoff.title}`,
          `## 担当: ${agent.name_ko || agent.name} (${kDeptName})`,
          `## 開始時刻: ${new Date(kT).toISOString()}`,
          kShortDesc ? `## 仕様概要:\n${kShortDesc}` : "",
          `## 完了条件: コード生成・ドキュメント作成・gitコミット`,
        ].filter(Boolean).join("\n\n");
        db.prepare(
          `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, title, status, started_at, completed_at, created_at)
           VALUES (?, ?, 'kickoff', 1, ?, 'completed', ?, ?, ?)`,
        ).run(kMeetingId, id, `キックオフ: ${taskRowForKickoff.title}`, kT, kT, kT);
        db.prepare(
          `INSERT INTO meeting_minute_entries
           (meeting_id, seq, speaker_agent_id, speaker_name, department_name, role_label, message_type, content, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'spec', ?, ?)`,
        ).run(kMeetingId, 1, agent.id, agent.name_ko || agent.name, kDeptName, "担当", kContent, kT);
        appendTaskLog(id, "system", `📋 kickoff meeting created: ${kMeetingId.slice(0, 8)}`);
      }
    }
    // ───────────────────────────────────────────────────────────────────

    // ── Auto-set work-phase status based on task title prefix ────────────
    const workPhaseStatusMap: Record<string, string> = {
      "[コンポーネント]": "component_dev",
      "[ドキュメント]": "documenting",
      "[デバッグ]": "debugging",
      "[UI実装]": "ui_work",
      "[API実装]": "api_work",
    };
    const titlePrefix = Object.keys(workPhaseStatusMap).find((p) => task.title?.startsWith(p));
    const targetStatus = titlePrefix ? workPhaseStatusMap[titlePrefix] : "in_progress";
    if (titlePrefix) {
      appendTaskLog(id, "system", `📌 Work phase: ${targetStatus}`);
    }
    // ────────────────────────────────────────────────────────────────────

    if (provider === "api") {
      const controller = new AbortController();
      const fakePid = getNextHttpAgentPid();

      const t = nowMs();
      db.prepare(
        "UPDATE tasks SET status = ?, assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?",
      ).run(targetStatus, agentId, t, t, id);
      db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
      broadcast("task_update", updatedTask);
      broadcast("agent_status", updatedAgent);
      notifyTaskStatus(id, task.title, "in_progress", taskLang);

      const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
      const worktreeNote = pickL(
        l(
          [` (격리 브랜치: climpire/${id.slice(0, 8)})`],
          [` (isolated branch: climpire/${id.slice(0, 8)})`],
          [` (分離ブランチ: climpire/${id.slice(0, 8)})`],
          [`（隔离分支: climpire/${id.slice(0, 8)}）`],
        ),
        taskLang,
      );
      notifyCeo(
        pickL(
          l(
            [`${assigneeName}가 '${task.title}' 작업을 시작했습니다.${worktreeNote}`],
            [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
            [`${assigneeName}が '${task.title}' の作業を開始しました。${worktreeNote}`],
            [`${assigneeName} 已开始处理 '${task.title}'。${worktreeNote}`],
          ),
          taskLang,
        ),
        id,
      );

      const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as
        | { department_id: string | null }
        | undefined;
      startProgressTimer(id, task.title, taskRow?.department_id ?? null);

      launchApiProviderAgent(
        id,
        agent.api_provider_id ?? null,
        agent.api_model ?? null,
        prompt,
        agentCwd,
        logPath,
        controller,
        fakePid,
      );
      return res.json({ ok: true, pid: fakePid, logPath, cwd: agentCwd, worktree: !!worktreePath });
    }

    if (provider === "copilot" || provider === "antigravity") {
      const controller = new AbortController();
      const fakePid = getNextHttpAgentPid();

      const t = nowMs();
      db.prepare(
        "UPDATE tasks SET status = ?, assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?",
      ).run(targetStatus, agentId, t, t, id);
      db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
      broadcast("task_update", updatedTask);
      broadcast("agent_status", updatedAgent);
      notifyTaskStatus(id, task.title, "in_progress", taskLang);

      const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
      const worktreeNote = pickL(
        l(
          [` (격리 브랜치: climpire/${id.slice(0, 8)})`],
          [` (isolated branch: climpire/${id.slice(0, 8)})`],
          [` (分離ブランチ: climpire/${id.slice(0, 8)})`],
          [`（隔离分支: climpire/${id.slice(0, 8)}）`],
        ),
        taskLang,
      );
      notifyCeo(
        pickL(
          l(
            [`${assigneeName}가 '${task.title}' 작업을 시작했습니다.${worktreeNote}`],
            [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
            [`${assigneeName}が '${task.title}' の作業を開始しました。${worktreeNote}`],
            [`${assigneeName} 已开始处理 '${task.title}'。${worktreeNote}`],
          ),
          taskLang,
        ),
        id,
      );

      const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as
        | { department_id: string | null }
        | undefined;
      startProgressTimer(id, task.title, taskRow?.department_id ?? null);

      launchHttpAgent(id, provider, prompt, agentCwd, logPath, controller, fakePid, agent.oauth_account_id ?? null);
      return res.json({ ok: true, pid: fakePid, logPath, cwd: agentCwd, worktree: !!worktreePath });
    }

    const child = spawnCliAgent(id, provider, prompt, agentCwd, logPath, mainModel, mainReasoningLevel);

    child.on("close", (code: number | null) => {
      handleTaskRunComplete(id, code ?? 1);
    });

    const t = nowMs();
    db.prepare(
      "UPDATE tasks SET status = ?, assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?",
    ).run(targetStatus, agentId, t, t, id);
    db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
    broadcast("task_update", updatedTask);
    broadcast("agent_status", updatedAgent);
    notifyTaskStatus(id, task.title, "in_progress", taskLang);

    const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
    const worktreeNote = pickL(
      l(
        [` (격리 브랜치: climpire/${id.slice(0, 8)})`],
        [` (isolated branch: climpire/${id.slice(0, 8)})`],
        [` (分離ブランチ: climpire/${id.slice(0, 8)})`],
        [`（隔离分支: climpire/${id.slice(0, 8)}）`],
      ),
      taskLang,
    );
    notifyCeo(
      pickL(
        l(
          [`${assigneeName}가 '${task.title}' 작업을 시작했습니다.${worktreeNote}`],
          [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
          [`${assigneeName}が '${task.title}' の作業を開始しました。${worktreeNote}`],
          [`${assigneeName} 已开始处理 '${task.title}'。${worktreeNote}`],
        ),
        taskLang,
      ),
      id,
    );

    const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as
      | { department_id: string | null }
      | undefined;
    startProgressTimer(id, task.title, taskRow?.department_id ?? null);

    res.json({ ok: true, pid: child.pid ?? null, logPath, cwd: agentCwd, worktree: !!worktreePath });
  });
}
