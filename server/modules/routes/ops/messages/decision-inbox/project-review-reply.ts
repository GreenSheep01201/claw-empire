import { randomUUID } from "node:crypto";
import type { ProjectReviewReplyInput, ProjectReviewTaskChoice } from "./types.ts";

type ReviewStartBlockedTask = {
  id: string;
  title: string;
  reason: string;
  detail: string;
};

function classifyReviewHoldReason(message: string): string {
  if (message.includes("video artifact gate blocked approval")) return "video_artifact_missing";
  if (message.includes("VIDEO_FINAL_RENDER")) return "unfinished_subtasks";
  if (message.includes("unfinished subtasks")) return "unfinished_subtasks";
  if (message.includes("collaboration children")) return "collaboration_children_pending";
  return "review_gate_hold";
}

function buildVideoFinalRenderRequestDescription(taskTitle: string): string {
  return [
    "[VIDEO_FINAL_RENDER]",
    `上位業務: ${taskTitle}`,
    "すべての文書/協業成果物を集約して、最終紹介映像を1回レンダリングしてください。",
    "最終レンダリングエンジンは必ずRemotionのみを使用してください。Python(moviepy/Pillow)ベースのレンダリングは禁止されています。",
    "成果物パスルール(project_department_final.mp4)を遵守し、結果ファイルのパス/容量の検証を報告してください。",
    "",
    "[QUALITY]",
    "- 目標時間55〜65秒、8〜12ショット以上で構成",
    "- 冒頭2〜4秒はブランド/マスコットのキービジュアルイントロ",
    "- 静止シーン3秒超禁止、ショットごとのモーション(カメラ/テキスト/レイアウト)を分離",
    "- 字幕/テキストのセーフエリア(左右8%、上下10%)を遵守",
    "- 結果報告に秒単位のシーンタイムラインと品質チェックリストを含める",
  ].join("\n");
}

export function handleProjectReviewDecisionReply(input: ProjectReviewReplyInput): boolean {
  const { req, res, currentItem, selectedOption, optionNumber, deps } = input;
  if (currentItem.kind !== "project_review_ready") return false;

  const {
    db,
    appendTaskLog,
    nowMs,
    normalizeTextField,
    getPreferredLanguage,
    pickL,
    l,
    broadcast,
    finishReview,
    getProjectReviewDecisionState,
    recordProjectReviewDecisionEvent,
    getProjectReviewTaskChoices,
    openSupplementRound,
    processSubtaskDelegations,
    PROJECT_REVIEW_TASK_SELECTED_LOG_PREFIX,
  } = deps;

  const projectId = currentItem.project_id;
  if (!projectId) {
    res.status(400).json({ error: "project_id_required" });
    return true;
  }
  const selectedAction = selectedOption.action;
  const decisionSnapshotHash = getProjectReviewDecisionState(projectId)?.snapshot_hash ?? null;

  if (selectedAction === "keep_waiting") {
    res.json({
      ok: true,
      resolved: false,
      kind: "project_review_ready",
      action: "keep_waiting",
    });
    return true;
  }

  if (selectedAction.startsWith("approve_task_review:")) {
    const selectedTaskId = selectedAction.slice("approve_task_review:".length).trim();
    if (!selectedTaskId) {
      res.status(400).json({ error: "task_id_required" });
      return true;
    }
    const targetTask = db
      .prepare(
        `
        SELECT id, title
        FROM tasks
        WHERE id = ?
          AND project_id = ?
          AND status = 'review'
          AND source_task_id IS NULL
      `,
      )
      .get(selectedTaskId, projectId) as { id: string; title: string } | undefined;
    if (!targetTask) {
      res.status(404).json({ error: "project_review_task_not_found" });
      return true;
    }

    appendTaskLog(
      targetTask.id,
      "system",
      `${PROJECT_REVIEW_TASK_SELECTED_LOG_PREFIX} (project_id=${projectId}, option=${optionNumber})`,
    );
    recordProjectReviewDecisionEvent({
      project_id: projectId,
      snapshot_hash: decisionSnapshotHash,
      event_type: "representative_pick",
      summary: `代表選択: ${targetTask.title}`,
      selected_options_json: JSON.stringify([
        {
          number: optionNumber,
          action: selectedAction,
          label: selectedOption.label || targetTask.title,
          task_id: targetTask.id,
        },
      ]),
      task_id: targetTask.id,
    });
    const remaining = getProjectReviewTaskChoices(projectId).filter(
      (task: ProjectReviewTaskChoice) => !task.selected,
    ).length;
    res.json({
      ok: true,
      resolved: false,
      kind: "project_review_ready",
      action: "approve_task_review",
      task_id: targetTask.id,
      pending_task_choices: remaining,
    });
    return true;
  }

  if (selectedAction === "add_followup_request") {
    const note = normalizeTextField(req.body?.note);
    if (!note) {
      res.status(400).json({ error: "followup_note_required" });
      return true;
    }
    const lang = getPreferredLanguage();
    const followupTitlePrefix = pickL(
      l(["[의사결정 추가요청]"], ["[Decision Follow-up]"], ["[意思決定追加要請]"], ["[决策追加请求]"]),
      lang,
    );
    const targetTaskIdInput = normalizeTextField(req.body?.target_task_id);
    const targetTask = targetTaskIdInput
      ? (db
          .prepare(
            `
            SELECT id, title, status, assigned_agent_id, department_id
            FROM tasks
            WHERE id = ?
              AND project_id = ?
              AND status = 'review'
              AND source_task_id IS NULL
          `,
          )
          .get(targetTaskIdInput, projectId) as
          | {
              id: string;
              title: string;
              status: string;
              assigned_agent_id: string | null;
              department_id: string | null;
            }
          | undefined)
      : undefined;
    const fallbackTargetTask = db
      .prepare(
        `
        SELECT id, title, status, assigned_agent_id, department_id
        FROM tasks
        WHERE project_id = ?
          AND status = 'review'
          AND source_task_id IS NULL
        ORDER BY updated_at ASC, created_at ASC
        LIMIT 1
      `,
      )
      .get(projectId) as
      | {
          id: string;
          title: string;
          status: string;
          assigned_agent_id: string | null;
          department_id: string | null;
        }
      | undefined;
    const resolvedTarget = targetTask ?? fallbackTargetTask;
    if (!resolvedTarget) {
      res.status(404).json({ error: "project_review_task_not_found" });
      return true;
    }

    const subtaskId = randomUUID();
    const createdAt = nowMs();
    const noteCompact = note.replace(/\s+/g, " ").trim();
    const noteTitle = noteCompact.length > 72 ? `${noteCompact.slice(0, 69).trimEnd()}...` : noteCompact;
    const title = `${followupTitlePrefix} ${noteTitle}`;
    db.prepare(
      `
        INSERT INTO subtasks (id, task_id, title, description, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `,
    ).run(subtaskId, resolvedTarget.id, title, note, createdAt);

    appendTaskLog(resolvedTarget.id, "system", `Decision inbox follow-up request added: ${note}`);
    recordProjectReviewDecisionEvent({
      project_id: projectId,
      snapshot_hash: decisionSnapshotHash,
      event_type: "followup_request",
      summary: selectedOption.label || "追加要請を入力",
      selected_options_json: JSON.stringify([
        {
          number: optionNumber,
          action: selectedAction,
          label: selectedOption.label || "add_followup_request",
          task_id: resolvedTarget.id,
        },
      ]),
      note,
      task_id: resolvedTarget.id,
    });
    const insertedSubtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId);
    broadcast("subtask_update", insertedSubtask);

    const supplement = openSupplementRound(
      resolvedTarget.id,
      resolvedTarget.assigned_agent_id,
      resolvedTarget.department_id,
      "Decision inbox",
    );

    res.json({
      ok: true,
      resolved: false,
      kind: "project_review_ready",
      action: "add_followup_request",
      task_id: resolvedTarget.id,
      subtask_id: subtaskId,
      supplement_round_started: supplement.started,
      supplement_round_reason: supplement.reason,
    });
    return true;
  }

  if (selectedAction === "start_project_review") {
    const reviewTaskChoices = getProjectReviewTaskChoices(projectId);
    const requiresRepresentativeSelection = reviewTaskChoices.length > 1;
    const pendingChoices = requiresRepresentativeSelection
      ? reviewTaskChoices.filter((task: ProjectReviewTaskChoice) => !task.selected)
      : [];
    if (requiresRepresentativeSelection && pendingChoices.length > 0) {
      res.status(409).json({
        error: "project_task_options_pending",
        pending_task_choices: pendingChoices.map((task: ProjectReviewTaskChoice) => ({
          id: task.id,
          title: task.title,
        })),
      });
      return true;
    }

    const readiness = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN status NOT IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS active_total,
          SUM(CASE WHEN status NOT IN ('done', 'cancelled') AND status = 'review' THEN 1 ELSE 0 END) AS active_review
        FROM tasks
        WHERE project_id = ?
      `,
      )
      .get(projectId) as { active_total: number | null; active_review: number | null } | undefined;
    const activeTotal = readiness?.active_total ?? 0;
    const activeReview = readiness?.active_review ?? 0;
    if (!(activeTotal > 0 && activeTotal === activeReview)) {
      res.status(409).json({
        error: "project_not_ready_for_review_meeting",
        active_total: activeTotal,
        active_review: activeReview,
      });
      return true;
    }

    const reviewTasks = db
      .prepare(
        `
        SELECT id, title, workflow_pack_key, assigned_agent_id, department_id
        FROM tasks
        WHERE project_id = ?
          AND status = 'review'
          AND source_task_id IS NULL
        ORDER BY updated_at ASC
      `,
      )
      .all(projectId) as Array<{
      id: string;
      title: string;
      workflow_pack_key: string | null;
      assigned_agent_id: string | null;
      department_id: string | null;
    }>;

    const blockedTasks: ReviewStartBlockedTask[] = [];
    const startedTaskIds: string[] = [];
    for (const task of reviewTasks) {
      const beforeLog = db
        .prepare("SELECT COALESCE(MAX(created_at), 0) AS max_created_at FROM task_logs WHERE task_id = ?")
        .get(task.id) as { max_created_at?: number } | undefined;
      const baselineLogTs = Number(beforeLog?.max_created_at ?? 0);
      appendTaskLog(task.id, "system", "Decision inbox: project-level review meeting approved by CEO");
      finishReview(task.id, task.title, {
        bypassProjectDecisionGate: true,
        trigger: "decision_inbox",
      });

      const afterTask = db.prepare("SELECT status FROM tasks WHERE id = ?").get(task.id) as
        | { status?: string }
        | undefined;
      if (afterTask?.status !== "review") {
        startedTaskIds.push(task.id);
        continue;
      }
      const holdLog = db
        .prepare(
          `
          SELECT message
          FROM task_logs
          WHERE task_id = ?
            AND kind = 'system'
            AND created_at >= ?
            AND message LIKE 'Review hold:%'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        )
        .get(task.id, baselineLogTs) as { message?: string | null } | undefined;
      const holdMessage = String(holdLog?.message ?? "").trim();
      if (!holdMessage) {
        // Consensus meeting starts asynchronously; keep as started unless a hold signal is emitted.
        startedTaskIds.push(task.id);
        continue;
      }
      blockedTasks.push({
        id: task.id,
        title: task.title,
        reason: classifyReviewHoldReason(holdMessage),
        detail: holdMessage,
      });
    }

    if (blockedTasks.length > 0) {
      for (const blocked of blockedTasks) {
        if (blocked.reason !== "video_artifact_missing" && blocked.reason !== "unfinished_subtasks") continue;
        const taskRow = reviewTasks.find((task) => task.id === blocked.id);
        if (!taskRow || taskRow.workflow_pack_key !== "video_preprod") continue;
        const existingRenderSubtask = db
          .prepare(
            `
            SELECT id
                 , status
            FROM subtasks
            WHERE task_id = ?
              AND title LIKE '%[VIDEO_FINAL_RENDER]%'
            ORDER BY created_at DESC
            LIMIT 1
          `,
          )
          .get(taskRow.id) as { id?: string; status?: string } | undefined;
        if (existingRenderSubtask?.id) {
          appendTaskLog(
            taskRow.id,
            "system",
            `Decision inbox: skipped final render subtask auto-create (existing id=${existingRenderSubtask.id}, status=${existingRenderSubtask.status ?? "unknown"})`,
          );
          continue;
        }

        const subtaskId = randomUUID();
        const createdAt = nowMs();
        const renderTitle = "[VIDEO_FINAL_RENDER] 最終映像レンダリング";
        const renderDescription = buildVideoFinalRenderRequestDescription(taskRow.title);
        db.prepare(
          `
            INSERT INTO subtasks (id, task_id, title, description, status, target_department_id, created_at)
            VALUES (?, ?, ?, ?, 'pending', 'dev', ?)
          `,
        ).run(subtaskId, taskRow.id, renderTitle, renderDescription, createdAt);
        appendTaskLog(taskRow.id, "system", "Decision inbox: auto-created final render subtask (target=dev)");
        const insertedSubtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId);
        broadcast("subtask_update", insertedSubtask);
        processSubtaskDelegations?.(taskRow.id, { includeRender: true });
      }

      const blockedSummary = `チームリーダー会議の開始を保留 (${blockedTasks.length}件): ${blockedTasks.map((task) => task.title).join(", ")}`;
      recordProjectReviewDecisionEvent({
        project_id: projectId,
        snapshot_hash: decisionSnapshotHash,
        event_type: "start_review_meeting_blocked",
        summary: blockedSummary,
        selected_options_json: JSON.stringify([
          {
            number: optionNumber,
            action: selectedAction,
            label: selectedOption.label || "start_project_review",
            task_count: reviewTasks.length,
            blocked_count: blockedTasks.length,
          },
        ]),
        note: blockedTasks.map((task) => `${task.title}: ${task.detail}`).join("\n"),
      });
      res.json({
        ok: true,
        resolved: false,
        kind: "project_review_ready",
        action: "start_project_review_blocked",
        started_task_ids: startedTaskIds,
        blocked_tasks: blockedTasks,
      });
      return true;
    }

    recordProjectReviewDecisionEvent({
      project_id: projectId,
      snapshot_hash: decisionSnapshotHash,
      event_type: "start_review_meeting",
      summary: selectedOption.label || "チームリーダー会議を進行",
      selected_options_json: JSON.stringify([
        {
          number: optionNumber,
          action: selectedAction,
          label: selectedOption.label || "start_project_review",
          task_count: reviewTasks.length,
        },
      ]),
    });

    res.json({
      ok: true,
      resolved: true,
      kind: "project_review_ready",
      action: "start_project_review",
      started_task_ids: startedTaskIds,
    });
    return true;
  }

  res.status(400).json({ error: "unsupported_project_action", action: selectedAction });
  return true;
}
