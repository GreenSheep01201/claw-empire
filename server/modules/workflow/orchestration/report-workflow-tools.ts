import path from "node:path";
import { resolveWorkflowPackKeyForTask } from "../packs/task-pack-resolver.ts";

type CreateReportWorkflowToolsDeps = Record<string, any>;

export function createReportWorkflowTools(deps: CreateReportWorkflowToolsDeps) {
  const {
    db,
    broadcast,
    appendTaskLog,
    nowMs,
    resolveLang,
    pickL,
    l,
    sendAgentMessage,
    findTeamLeader,
    getAgentDisplayName,
    setTaskCreationAuditCompletion,
    reviewRoundState,
    reviewInFlight,
    endTaskExecutionSession,
    notifyTaskStatus,
    refreshCliUsageData,
    archivePlanningConsolidatedReport,
    crossDeptNextCallbacks,
    recoverCrossDeptQueueAfterMissingCallback,
    subtaskDelegationCallbacks,
    randomUUID,
    REPORT_DESIGN_TASK_PREFIX,
    REPORT_FLOW_PREFIX,
    extractReportPathByLabel,
    upsertReportFlowValue,
    readReportFlowValue,
    recordTaskCreationAudit,
    startTaskExecutionForAgent,
    getDeptName,
    randomDelay,
    notifyCeo,
  } = deps;

  function pickDesignCheckpointAgent(): any | null {
    const candidates = db
      .prepare(
        `
  SELECT *
  FROM agents
  WHERE department_id = 'design'
    AND COALESCE(cli_provider, '') IN ('claude','codex','gemini','opencode','copilot','antigravity','api')
  ORDER BY
    CASE status
      WHEN 'idle' THEN 0
      WHEN 'break' THEN 1
      WHEN 'working' THEN 2
      WHEN 'offline' THEN 9
      ELSE 8
    END,
    CASE role
      WHEN 'team_leader' THEN 0
      WHEN 'senior' THEN 1
      WHEN 'junior' THEN 2
      WHEN 'intern' THEN 3
      ELSE 4
    END,
    id ASC
`,
      )
      .all() as unknown as any[];
    return candidates[0] ?? null;
  }

  function emitTaskReportEvent(taskId: string): void {
    try {
      const reportTask = db
        .prepare(
          `
    SELECT t.id, t.title, t.description, t.department_id, t.assigned_agent_id,
           t.status, t.project_path, t.created_at, t.completed_at,
           COALESCE(a.name, '') AS agent_name,
           COALESCE(a.name_ko, '') AS agent_name_ko,
           COALESCE(a.role, '') AS agent_role,
           COALESCE(d.name, '') AS dept_name,
           COALESCE(d.name_ko, '') AS dept_name_ko
    FROM tasks t
    LEFT JOIN agents a ON a.id = t.assigned_agent_id
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE t.id = ?
  `,
        )
        .get(taskId) as Record<string, unknown> | undefined;
      const reportLogs = db
        .prepare("SELECT kind, message, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at ASC")
        .all(taskId) as Array<{ kind: string; message: string; created_at: number }>;
      const reportSubtasks = db
        .prepare(
          "SELECT id, title, status, assigned_agent_id, completed_at FROM subtasks WHERE task_id = ? ORDER BY created_at ASC",
        )
        .all(taskId) as Array<Record<string, unknown>>;
      const reportMinutes = db
        .prepare(
          `
    SELECT
      mm.meeting_type,
      mm.round AS round_number,
      COALESCE((
        SELECT group_concat(entry_line, '\n')
        FROM (
          SELECT printf('[%s] %s', COALESCE(e.speaker_name, 'Unknown'), e.content) AS entry_line
          FROM meeting_minute_entries e
          WHERE e.meeting_id = mm.id
          ORDER BY e.seq ASC, e.id ASC
        )
      ), '') AS entries,
      mm.created_at
    FROM meeting_minutes mm
    WHERE mm.task_id = ?
    ORDER BY mm.created_at ASC
  `,
        )
        .all(taskId) as Array<Record<string, unknown>>;
      if (reportTask) {
        broadcast("task_report", {
          task: reportTask,
          logs: reportLogs.slice(-30),
          subtasks: reportSubtasks,
          meeting_minutes: reportMinutes,
        });
      }
    } catch (reportErr) {
      console.error("[Claw-Empire] task_report broadcast error:", reportErr);
    }
  }

  function shouldDeferTaskReportUntilPlanningArchive(task: {
    source_task_id?: string | null;
    department_id?: string | null;
  }): boolean {
    if (task.source_task_id) return false;
    const planningLeader = findTeamLeader("planning") || findTeamLeader(task.department_id ?? "");
    return Boolean(planningLeader);
  }

  function completeTaskWithoutReview(
    task: {
      id: string;
      title: string;
      description: string | null;
      department_id: string | null;
      source_task_id: string | null;
      assigned_agent_id: string | null;
    },
    note: string,
  ): void {
    const t = nowMs();
    const lang = resolveLang(task.description ?? task.title);
    appendTaskLog(task.id, "system", note);
    db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(t, t, task.id);
    setTaskCreationAuditCompletion(task.id, true);
    reviewRoundState.delete(task.id);
    reviewInFlight.delete(task.id);
    endTaskExecutionSession(task.id, "task_done_no_review");

    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id);
    broadcast("task_update", updatedTask);
    notifyTaskStatus(task.id, task.title, "done", lang);

    refreshCliUsageData()
      .then((usage: unknown) => broadcast("cli_usage_update", usage))
      .catch(() => {});
    const deferTaskReport = shouldDeferTaskReportUntilPlanningArchive(task);
    if (deferTaskReport) {
      appendTaskLog(task.id, "system", "Task report popup deferred until planning consolidated archive is ready");
    } else {
      emitTaskReportEvent(task.id);
    }

    const reporter = task.assigned_agent_id
      ? (db.prepare("SELECT * FROM agents WHERE id = ?").get(task.assigned_agent_id) as any | undefined)
      : undefined;
    if (reporter) {
      sendAgentMessage(
        reporter,
        pickL(
          l(
            [`대표님, '${task.title}' 보고 업무를 검토 회의 없이 완료 처리했습니다.`],
            [`CEO, '${task.title}' report work was completed without review meeting.`],
            [`CEO、'${task.title}' の報告業務をレビュー会議なしで完了処理しました。`],
            [`CEO，'${task.title}' 报告任务已在无评审会议情况下完成。`],
          ),
          lang,
        ),
        "report",
        "all",
        null,
        task.id,
      );
    }

    const leader = findTeamLeader(task.department_id);
    const leaderName = leader
      ? getAgentDisplayName(leader, lang)
      : pickL(l(["팀장"], ["Team Lead"], ["チームリーダー"], ["组长"]), lang);
    notifyCeo(
      pickL(
        l(
          [`${leaderName}: '${task.title}' 보고 업무를 검토 회의 없이 마감했습니다.`],
          [`${leaderName}: '${task.title}' report task was closed without review meeting.`],
          [`${leaderName}: '${task.title}' の報告業務をレビュー会議なしでクローズしました。`],
          [`${leaderName}：'${task.title}' 报告任务已无评审会议直接关闭。`],
        ),
        lang,
      ),
      task.id,
    );

    if (!task.source_task_id) {
      void archivePlanningConsolidatedReport(task.id);
    }

    const nextCallback = crossDeptNextCallbacks.get(task.id);
    if (nextCallback) {
      crossDeptNextCallbacks.delete(task.id);
      nextCallback();
    } else {
      recoverCrossDeptQueueAfterMissingCallback(task.id);
    }
    const subtaskNext = subtaskDelegationCallbacks.get(task.id);
    if (subtaskNext) {
      subtaskDelegationCallbacks.delete(task.id);
      subtaskNext();
    }
  }

  function startReportDesignCheckpoint(task: {
    id: string;
    title: string;
    description: string | null;
    project_id?: string | null;
    workflow_pack_key?: string | null;
    project_path: string | null;
    assigned_agent_id: string | null;
  }): boolean {
    const lang = resolveLang(task.description ?? task.title);
    const designAgent = pickDesignCheckpointAgent();
    if (!designAgent) {
      appendTaskLog(task.id, "system", "Report design checkpoint skipped: no design agent available");
      return false;
    }

    const targetPath = extractReportPathByLabel(task.description, "Target file path");
    const htmlSourceEntryPath = extractReportPathByLabel(task.description, "HTML source entry path");
    const htmlSourceDirPath = extractReportPathByLabel(task.description, "HTML source directory");
    const researchPath = extractReportPathByLabel(task.description, "Research notes path");
    const fallbackMdPath = extractReportPathByLabel(task.description, "Fallback markdown path");
    const stampSource =
      targetPath ||
      fallbackMdPath ||
      `docs/reports/${new Date().toISOString().replace(/:/g, "-").slice(0, 16)}-report-deck.pptx`;
    const htmlWorkspaceHint =
      htmlSourceDirPath ||
      (htmlSourceEntryPath ? path.dirname(htmlSourceEntryPath) : "") ||
      stampSource
        .replace(/-report-deck\.pptx$/i, "-slides/")
        .replace(/-report\.md$/i, "-slides/")
        .replace(/\.pptx$/i, "-slides/");
    const designHandoffPath = htmlWorkspaceHint.replace(/\/?$/, "").replace(/-slides$/i, "-design-handoff.md");

    const childTaskId = randomUUID();
    const t = nowMs();
    const designWorkflowPackKey = resolveWorkflowPackKeyForTask({
      db: db as any,
      sourceTaskPackKey: task.workflow_pack_key,
      sourceTaskId: task.id,
      projectId: task.project_id ?? null,
      fallbackPackKey: "report",
    });
    const designDescription = [
      `${REPORT_DESIGN_TASK_PREFIX} parent_task_id=${task.id}`,
      `${REPORT_FLOW_PREFIX} design_task=true`,
      `${REPORT_FLOW_PREFIX} design_checkpoint=single_pass`,
      "This is a report-design checkpoint task.",
      "Goal: review HTML slide sources used for PPT generation and improve visual quality where needed.",
      targetPath ? `Target PPT path: ${targetPath}` : "",
      `HTML workspace hint: ${htmlWorkspaceHint}`,
      htmlSourceEntryPath ? `HTML source entry path: ${htmlSourceEntryPath}` : "",
      researchPath ? `Research notes path: ${researchPath}` : "",
      fallbackMdPath ? `Fallback markdown path: ${fallbackMdPath}` : "",
      `Design handoff note path: ${designHandoffPath}`,
      "",
      "Rules:",
      "- Focus only on design quality and slide readability.",
      "- If HTML slide files exist, edit them directly and document changed files + rationale in handoff note.",
      "- If no HTML source exists, write clear recommendations and conversion guidance in handoff note.",
      "- Do not run final PPT submission; original report assignee will regenerate final PPT after your handoff.",
    ]
      .filter(Boolean)
      .join("\n");

    db.prepare(
      `
  INSERT INTO tasks (id, title, description, department_id, assigned_agent_id, project_id, status, priority, task_type, workflow_pack_key, project_path, source_task_id, created_at, updated_at)
  VALUES (?, ?, ?, 'design', ?, ?, 'planned', 1, 'design', ?, ?, ?, ?, ?)
`,
    ).run(
      childTaskId,
      `[デザイン確認] ${task.title.length > 48 ? `${task.title.slice(0, 45).trimEnd()}...` : task.title}`,
      designDescription,
      designAgent.id,
      task.project_id ?? null,
      designWorkflowPackKey,
      task.project_path ?? null,
      task.id,
      t,
      t,
    );
    recordTaskCreationAudit({
      taskId: childTaskId,
      taskTitle: `[デザイン確認] ${task.title.length > 48 ? `${task.title.slice(0, 45).trimEnd()}...` : task.title}`,
      taskStatus: "planned",
      departmentId: "design",
      assignedAgentId: designAgent.id,
      sourceTaskId: task.id,
      taskType: "design",
      projectPath: task.project_path ?? null,
      trigger: "workflow.report_design_checkpoint",
      triggerDetail: `parent_task=${task.id}`,
      actorType: "agent",
      actorId: designAgent.id,
      actorName: designAgent.name,
      body: {
        parent_task_id: task.id,
        html_workspace_hint: htmlWorkspaceHint,
        design_handoff_path: designHandoffPath,
      },
    });
    if (task.project_id) {
      db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(t, t, task.project_id);
    }

    const parentDescription = upsertReportFlowValue(
      upsertReportFlowValue(
        upsertReportFlowValue(
          upsertReportFlowValue(task.description, "design_review", "in_progress"),
          "final_regen",
          "pending",
        ),
        "html_workspace",
        htmlWorkspaceHint,
      ),
      "design_handoff_note",
      designHandoffPath,
    );
    db.prepare("UPDATE tasks SET status = 'pending', description = ?, updated_at = ? WHERE id = ?").run(
      parentDescription,
      t,
      task.id,
    );

    appendTaskLog(task.id, "system", `Status → pending (design checkpoint in progress by ${designAgent.name})`);
    appendTaskLog(task.id, "system", `Design checkpoint task created: ${childTaskId}`);
    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id));
    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(childTaskId));
    notifyTaskStatus(task.id, task.title, "pending", lang);

    notifyCeo(
      pickL(
        l(
          [
            `[REPORT FLOW] '${task.title}' 디자인 컨펌 1차를 위해 디자인팀(${designAgent.name})에게 HTML 점검 태스크를 위임했습니다.`,
          ],
          [
            `[REPORT FLOW] Delegated one-pass HTML design checkpoint for '${task.title}' to Design (${designAgent.name}).`,
          ],
          [
            `[REPORT FLOW] '${task.title}' の1回目デザイン確認として、Design (${designAgent.name}) にHTML点検タスクを委任しました。`,
          ],
          [`[REPORT FLOW] 已将 '${task.title}' 的一次性 HTML 设计确认任务委派给设计团队（${designAgent.name}）。`],
        ),
        lang,
      ),
      task.id,
    );

    setTimeout(
      () => {
        const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(childTaskId) as
          | { status: string }
          | undefined;
        if (!row || row.status !== "planned") return;
        startTaskExecutionForAgent(childTaskId, designAgent, "design", getDeptName("design"));
      },
      randomDelay(700, 1400),
    );

    return true;
  }

  function resumeReportAfterDesignCheckpoint(parentTaskId: string, triggerTaskId: string): void {
    const parent = db.prepare("SELECT * FROM tasks WHERE id = ?").get(parentTaskId) as
      | {
          id: string;
          title: string;
          description: string | null;
          status: string;
          assigned_agent_id: string | null;
          department_id: string | null;
        }
      | undefined;
    if (!parent) return;
    if (!parent.assigned_agent_id) return;
    if (!["pending", "planned", "collaborating", "review"].includes(parent.status)) return;

    const assignee = db.prepare("SELECT * FROM agents WHERE id = ?").get(parent.assigned_agent_id) as any | undefined;
    if (!assignee) return;
    if (assignee.status === "working" && assignee.current_task_id && assignee.current_task_id !== parent.id) {
      appendTaskLog(
        parent.id,
        "system",
        `Final regeneration delayed: assignee ${assignee.name} is busy on ${assignee.current_task_id}`,
      );
      notifyCeo(
        pickL(
          l(
            [
              `[REPORT FLOW] '${parent.title}' 최종 재생성은 담당자 ${assignee.name}가 현재 다른 작업(${assignee.current_task_id})을 수행 중이라 대기합니다.`,
            ],
            [
              `[REPORT FLOW] Final regeneration for '${parent.title}' is waiting because assignee ${assignee.name} is busy with another task (${assignee.current_task_id}).`,
            ],
            [
              `[REPORT FLOW] '${parent.title}' の最終再生成は、担当者 ${assignee.name} が別タスク(${assignee.current_task_id})を実行中のため待機します。`,
            ],
            [
              `[REPORT FLOW] '${parent.title}' 最终重生成需等待，因负责人 ${assignee.name} 正在处理其他任务（${assignee.current_task_id}）。`,
            ],
          ),
          resolveLang(parent.description ?? parent.title),
        ),
        parent.id,
      );
      return;
    }

    const nextDescription = upsertReportFlowValue(
      upsertReportFlowValue(parent.description, "design_review", "done"),
      "final_regen",
      "ready",
    );
    const htmlWorkspace = readReportFlowValue(nextDescription, "html_workspace");
    const handoffNotePath = readReportFlowValue(nextDescription, "design_handoff_note");
    db.prepare("UPDATE tasks SET description = ?, status = 'planned', updated_at = ? WHERE id = ?").run(
      nextDescription,
      nowMs(),
      parent.id,
    );
    appendTaskLog(
      parent.id,
      "system",
      `Design checkpoint completed by ${triggerTaskId}; final PPT regeneration scheduled${handoffNotePath ? ` (handoff: ${handoffNotePath})` : ""}`,
    );
    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(parent.id));

    const lang = resolveLang(parent.description ?? parent.title);
    notifyCeo(
      pickL(
        l(
          [
            `[REPORT FLOW] 디자인팀 1차 컨펌이 완료되어 '${parent.title}' 최종 PPT 재생성을 시작합니다. 이번 실행 완료 시 2차 컨펌 없이 마감합니다.${htmlWorkspace ? ` HTML 작업 경로: ${htmlWorkspace}.` : ""}${handoffNotePath ? ` 핸드오프 노트: ${handoffNotePath}.` : ""}`,
          ],
          [
            `[REPORT FLOW] Design checkpoint is complete; restarting final PPT regeneration for '${parent.title}'. This run will close without a second design approval.${htmlWorkspace ? ` HTML workspace: ${htmlWorkspace}.` : ""}${handoffNotePath ? ` Handoff note: ${handoffNotePath}.` : ""}`,
          ],
          [
            `[REPORT FLOW] デザイン確認が完了したため、'${parent.title}' の最終PPT再生成を再開します。今回は2次確認なしでクローズします。${htmlWorkspace ? ` HTML作業パス: ${htmlWorkspace}。` : ""}${handoffNotePath ? ` 引き継ぎノート: ${handoffNotePath}。` : ""}`,
          ],
          [
            `[REPORT FLOW] 设计确认已完成，开始重新生成 '${parent.title}' 的最终 PPT。本轮完成后将不再进行二次确认。${htmlWorkspace ? ` HTML 工作路径：${htmlWorkspace}。` : ""}${handoffNotePath ? ` 交接说明：${handoffNotePath}。` : ""}`,
          ],
        ),
        lang,
      ),
      parent.id,
    );

    setTimeout(
      () => {
        const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(parent.id) as
          | { status: string }
          | undefined;
        if (!row || row.status !== "planned") return;
        const deptId = assignee.department_id || parent.department_id || "planning";
        startTaskExecutionForAgent(parent.id, assignee, deptId, getDeptName(deptId));
      },
      randomDelay(700, 1300),
    );
  }

  return {
    pickDesignCheckpointAgent,
    emitTaskReportEvent,
    shouldDeferTaskReportUntilPlanningArchive,
    completeTaskWithoutReview,
    startReportDesignCheckpoint,
    resumeReportAfterDesignCheckpoint,
  };
}
