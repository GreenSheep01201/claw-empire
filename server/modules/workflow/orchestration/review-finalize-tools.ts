import fs from "node:fs";
import path from "node:path";
import {
  discoverVideoArtifact,
  resolveVideoArtifactRelativeCandidates,
  resolveVideoArtifactSpecForTask,
} from "../packs/video-artifact.ts";
import { evaluateRemotionOnlyGateFromLogFiles } from "../packs/video-render-engine-gate.ts";
import { readYoloModeEnabled } from "../../routes/ops/messages/decision-inbox/yolo-mode.ts";
import { reconcileVideoRenderDelegationState } from "./video-render-delegation-state.ts";

type CreateReviewFinalizeToolsDeps = Record<string, any>;

function requiresHermesWorkspaceRelease(workflowMetaJson: unknown): boolean {
  if (typeof workflowMetaJson !== "string" || !workflowMetaJson.trim()) return false;
  try {
    const root = JSON.parse(workflowMetaJson) as { hermes_execution?: { contract?: unknown } };
    return (
      root.hermes_execution?.contract === "hermes-claw-execution/v1" ||
      root.hermes_execution?.contract === "hermes-claw-execution/v2"
    );
  } catch {
    return false;
  }
}

export function createReviewFinalizeTools(deps: CreateReviewFinalizeToolsDeps) {
  const {
    db,
    nowMs,
    logsDir,
    broadcast,
    appendTaskLog,
    getPreferredLanguage,
    pickL,
    l,
    resolveLang,
    getProjectReviewGateSnapshot,
    projectReviewGateNotifiedAt,
    notifyCeo,
    taskWorktrees,
    mergeToDevAndCreatePR,
    mergeWorktree,
    cleanupWorktree,
    findTeamLeader,
    getAgentDisplayName,
    setTaskCreationAuditCompletion,
    endTaskExecutionSession,
    notifyTaskStatus,
    refreshCliUsageData,
    shouldDeferTaskReportUntilPlanningArchive,
    emitTaskReportEvent,
    formatTaskSubtaskProgressSummary,
    reviewRoundState,
    reviewInFlight,
    archivePlanningConsolidatedReport,
    crossDeptNextCallbacks,
    recoverCrossDeptQueueAfterMissingCallback,
    subtaskDelegationCallbacks,
    startReviewConsensusMeeting,
    processSubtaskDelegations,
  } = deps;

  function reconcileDelegatedSubtasksAfterRun(taskId: string, exitCode: number): void {
    const linked = db
      .prepare(
        `
  SELECT id, task_id
  FROM subtasks
  WHERE delegated_task_id = ?
    AND status NOT IN ('done', 'cancelled')
`,
      )
      .all(taskId) as Array<{ id: string; task_id: string }>;
    if (linked.length <= 0) return;

    const touchedParents = new Set<string>();
    for (const sub of linked) {
      if (sub.task_id) touchedParents.add(sub.task_id);
    }

    if (exitCode === 0) {
      const doneAt = nowMs();
      for (const sub of linked) {
        db.prepare("UPDATE subtasks SET status = 'done', completed_at = ?, blocked_reason = NULL WHERE id = ?").run(
          doneAt,
          sub.id,
        );
        broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sub.id));
      }
      appendTaskLog(taskId, "system", `Delegated subtask sync: marked ${linked.length} linked subtask(s) as done`);

      for (const parentTaskId of touchedParents) {
        const parent = db.prepare("SELECT id, title, status FROM tasks WHERE id = ?").get(parentTaskId) as
          | {
              id: string;
              title: string;
              status: string;
            }
          | undefined;
        if (!parent) continue;
        const remaining = db
          .prepare("SELECT COUNT(*) AS cnt FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled')")
          .get(parentTaskId) as { cnt: number } | undefined;
        if ((remaining?.cnt ?? 0) === 0 && parent.status === "review") {
          appendTaskLog(
            parentTaskId,
            "system",
            "All delegated subtasks completed after resume; retrying review completion",
          );
          const yolo = readYoloModeEnabled(db);
          setTimeout(
            () =>
              finishReview(parentTaskId, parent.title, {
                bypassProjectDecisionGate: yolo,
                trigger: "delegated_subtask_completion",
              }),
            1200,
          );
        }
      }
      return;
    }

    const lang = getPreferredLanguage();
    const blockedReason = pickL(
      l(["위임 작업 실패"], ["Delegated task failed"], ["委任タスク失敗"], ["委派任务失败"]),
      lang,
    );
    for (const sub of linked) {
      db.prepare("UPDATE subtasks SET status = 'blocked', blocked_reason = ?, completed_at = NULL WHERE id = ?").run(
        blockedReason,
        sub.id,
      );
      broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sub.id));
    }
    appendTaskLog(taskId, "system", `Delegated subtask sync: marked ${linked.length} linked subtask(s) as blocked`);
  }

  // Move a reviewed task to 'done'
  function finishReview(
    taskId: string,
    taskTitle: string,
    options?: { bypassProjectDecisionGate?: boolean; trigger?: string },
  ): void {
    const lang = resolveLang(taskTitle);
    const currentTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
      | {
          status: string;
          department_id: string | null;
          source_task_id: string | null;
          project_id: string | null;
          workflow_pack_key: string | null;
          project_path: string | null;
          workflow_meta_json?: string | null;
        }
      | undefined;
    if (!currentTask || currentTask.status !== "review") return; // Already moved or cancelled

    if (requiresHermesWorkspaceRelease(currentTask.workflow_meta_json)) {
      appendTaskLog(taskId, "system", "Review hold: waiting for Hermes result storage and workspace release receipt");
      return;
    }

    if (!options?.bypassProjectDecisionGate && !currentTask.source_task_id && currentTask.project_id) {
      const gateSnapshot = getProjectReviewGateSnapshot(currentTask.project_id);
      appendTaskLog(
        taskId,
        "system",
        `Review gate: waiting for project-level decision (${gateSnapshot.activeReview}/${gateSnapshot.activeTotal} active tasks in review)`,
      );
      if (gateSnapshot.ready) {
        const now = nowMs();
        const lastNotified = projectReviewGateNotifiedAt.get(currentTask.project_id) ?? 0;
        if (now - lastNotified > 30_000) {
          projectReviewGateNotifiedAt.set(currentTask.project_id, now);
          const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(currentTask.project_id) as
            | { name: string | null }
            | undefined;
          const projectName = (project?.name || currentTask.project_id).trim();
          notifyCeo(
            pickL(
              l(
                [
                  `[CEO OFFICE] 프로젝트 '${projectName}'의 활성 항목 ${gateSnapshot.activeTotal}건이 모두 Review 상태입니다. 의사결정 인박스에서 승인하면 팀장 회의를 시작합니다.`,
                ],
                [
                  `[CEO OFFICE] Project '${projectName}' now has all ${gateSnapshot.activeTotal} active tasks in Review. Approve from Decision Inbox to start team-lead review meetings.`,
                ],
                [
                  `[CEO OFFICE] プロジェクト'${projectName}'のアクティブタスク${gateSnapshot.activeTotal}件がすべてReviewに到達しました。Decision Inboxで承認するとチームリーダー会議を開始します。`,
                ],
                [
                  `[CEO OFFICE] 项目'${projectName}'的 ${gateSnapshot.activeTotal} 个活跃任务已全部进入 Review。请在 Decision Inbox 批准后启动组长评审会议。`,
                ],
              ),
              lang,
            ),
            taskId,
          );
        }
      } else {
        projectReviewGateNotifiedAt.delete(currentTask.project_id);
      }
      return;
    }
    if (options?.bypassProjectDecisionGate && currentTask.project_id) {
      projectReviewGateNotifiedAt.delete(currentTask.project_id);
      appendTaskLog(taskId, "system", `Review gate bypassed (trigger=${options.trigger ?? "manual"})`);
    }

    const healed = db
      .prepare(
        `
  UPDATE subtasks
  SET status = 'done',
      completed_at = COALESCE(completed_at, ?),
      blocked_reason = NULL
  WHERE task_id = ?
    AND status = 'blocked'
    AND delegated_task_id IS NOT NULL
    AND delegated_task_id != ''
    AND EXISTS (
      SELECT 1
      FROM tasks dt
      WHERE dt.id = subtasks.delegated_task_id
        AND dt.status IN ('review', 'done')
    )
`,
      )
      .run(nowMs(), taskId) as { changes?: number } | undefined;
    if ((healed?.changes ?? 0) > 0) {
      appendTaskLog(
        taskId,
        "system",
        `Review gate auto-heal: recovered ${healed?.changes ?? 0} blocked delegated subtask(s) after successful resume`,
      );
    }

    let remainingSubtaskCount = (
      db
        .prepare("SELECT COUNT(*) as cnt FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled')")
        .get(taskId) as { cnt: number }
    ).cnt;
    if (remainingSubtaskCount > 0) {
      // Check if only VIDEO_FINAL_RENDER subtask(s) remain — trigger delegation instead of blocking forever
      let pendingRender = db
        .prepare(
          "SELECT * FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled') AND title LIKE '%[VIDEO_FINAL_RENDER]%'",
        )
        .all(taskId) as Array<{ id: string; status: string; delegated_task_id: string | null }>;
      let nonRenderRemaining = remainingSubtaskCount - pendingRender.length;

      if (nonRenderRemaining === 0 && pendingRender.length > 0) {
        const repair = reconcileVideoRenderDelegationState({ db, nowMs, broadcast }, pendingRender);
        if (repair.staleResetCount > 0 || repair.recoveredDoneCount > 0) {
          appendTaskLog(
            taskId,
            "system",
            `Review hold repair: VIDEO_FINAL_RENDER delegation reconciled (stale_reset=${repair.staleResetCount}, recovered_done=${repair.recoveredDoneCount})`,
          );
          remainingSubtaskCount = (
            db
              .prepare("SELECT COUNT(*) as cnt FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled')")
              .get(taskId) as { cnt: number }
          ).cnt;
          pendingRender = db
            .prepare(
              "SELECT * FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled') AND title LIKE '%[VIDEO_FINAL_RENDER]%'",
            )
            .all(taskId) as Array<{ id: string; status: string; delegated_task_id: string | null }>;
          nonRenderRemaining = remainingSubtaskCount - pendingRender.length;
        }
      }

      if (nonRenderRemaining === 0 && pendingRender.length > 0) {
        const undelegated = pendingRender.filter((s) => !String(s.delegated_task_id ?? "").trim());
        if (undelegated.length > 0) {
          // Unblock and delegate render subtasks
          for (const sub of undelegated) {
            if (sub.status === "blocked") {
              db.prepare("UPDATE subtasks SET status = 'pending', blocked_reason = NULL WHERE id = ?").run(sub.id);
              broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sub.id));
            }
          }
          appendTaskLog(
            taskId,
            "system",
            "Review hold: only VIDEO_FINAL_RENDER remains — unblocking and triggering delegation.",
          );
          processSubtaskDelegations(taskId, { includeRender: true });
        } else {
          appendTaskLog(taskId, "system", `Review hold: VIDEO_FINAL_RENDER already delegated, waiting for completion.`);
        }
        return;
      }

      notifyCeo(
        pickL(
          l(
            [`'${taskTitle}' 는 아직 ${remainingSubtaskCount}개 서브태스크가 남아 있어 Review 단계에서 대기합니다.`],
            [`'${taskTitle}' is waiting in Review because ${remainingSubtaskCount} subtasks are still unfinished.`],
            [`'${taskTitle}' は未完了サブタスクが${remainingSubtaskCount}件あるため、Reviewで待機しています。`],
            [`'${taskTitle}' 仍有 ${remainingSubtaskCount} 个 SubTask 未完成，当前在 Review 阶段等待。`],
          ),
          lang,
        ),
        taskId,
      );
      appendTaskLog(taskId, "system", `Review hold: waiting for ${remainingSubtaskCount} unfinished subtasks`);
      return;
    }

    // Parent task must wait until all collaboration children reached review(done) checkpoint.
    if (!currentTask.source_task_id) {
      const childProgress = db
        .prepare(
          `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review_cnt,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_cnt
    FROM tasks
    WHERE source_task_id = ?
  `,
        )
        .get(taskId) as { total: number; review_cnt: number | null; done_cnt: number | null } | undefined;
      const childTotal = childProgress?.total ?? 0;
      const childReview = childProgress?.review_cnt ?? 0;
      const childDone = childProgress?.done_cnt ?? 0;
      const childReady = childReview + childDone;
      if (childTotal > 0 && childReady < childTotal) {
        const waiting = childTotal - childReady;
        notifyCeo(
          pickL(
            l(
              [`'${taskTitle}' 는 협업 하위 태스크 ${waiting}건이 아직 Review 진입 전이라 전체 팀장회의를 대기합니다.`],
              [
                `'${taskTitle}' is waiting for ${waiting} collaboration child task(s) to reach review before the single team-lead meeting starts.`,
              ],
              [
                `'${taskTitle}' は協業子タスク${waiting}件がまだReview未到達のため、全体チームリーダー会議を待機しています。`,
              ],
              [`'${taskTitle}' 仍有 ${waiting} 个协作子任务尚未进入 Review，当前等待后再开启一次团队负责人会议。`],
            ),
            lang,
          ),
          taskId,
        );
        appendTaskLog(
          taskId,
          "system",
          `Review hold: waiting for collaboration children to reach review (${childReady}/${childTotal})`,
        );
        return;
      }
    }

    if (currentTask.workflow_pack_key === "video_preprod" && !currentTask.source_task_id) {
      const wtInfo = taskWorktrees.get(taskId) as
        | { worktreePath?: string; projectPath?: string; branchName?: string }
        | undefined;
      const outputRoot = currentTask.project_path || wtInfo?.projectPath || process.cwd();
      const videoArtifactSpec = resolveVideoArtifactSpecForTask(db as any, {
        project_id: currentTask.project_id,
        project_path: currentTask.project_path,
        department_id: currentTask.department_id,
        workflow_pack_key: currentTask.workflow_pack_key,
      });
      const candidateRelativePaths = resolveVideoArtifactRelativeCandidates(videoArtifactSpec);
      const candidatePaths = [
        ...candidateRelativePaths.map((relative) =>
          wtInfo?.worktreePath ? path.join(wtInfo.worktreePath, relative) : null,
        ),
        ...candidateRelativePaths.map((relative) => (outputRoot ? path.join(outputRoot, relative) : null)),
      ].filter((entry): entry is string => Boolean(entry));

      let verifiedPath: string | null = null;
      let verifiedSize = 0;
      for (const candidate of candidatePaths) {
        if (!fs.existsSync(candidate)) continue;
        try {
          const stat = fs.statSync(candidate);
          if (stat.size > 0) {
            verifiedPath = candidate;
            verifiedSize = stat.size;
            break;
          }
        } catch {
          // best effort
        }
      }

      // Fallback: discover any .mp4 in video_output/ or out/ directories
      if (!verifiedPath) {
        const searchRoots = [wtInfo?.worktreePath, outputRoot].filter(Boolean) as string[];
        for (const root of searchRoots) {
          const discovered = discoverVideoArtifact(root);
          if (discovered) {
            try {
              const stat = fs.statSync(discovered);
              if (stat.size > 0) {
                verifiedPath = discovered;
                verifiedSize = stat.size;
                appendTaskLog(
                  taskId,
                  "system",
                  `Review gate: video artifact discovered via directory scan: ${discovered} (${stat.size} bytes)`,
                );
                break;
              }
            } catch {
              // best effort
            }
          }
        }
      }

      if (!verifiedPath) {
        appendTaskLog(
          taskId,
          "system",
          `Review hold: video artifact gate blocked approval (missing/empty video file). checked=${candidatePaths.join(", ")}`,
        );
        notifyCeo(
          pickL(
            l(
              [
                `'${taskTitle}' 는 영상 산출물(\`${videoArtifactSpec.relativePath}\`)이 확인되지 않아 팀장회의 승인/머지가 보류되었습니다. 렌더 결과를 확인한 뒤 다시 승인해 주세요.`,
              ],
              [
                `'${taskTitle}' approval/merge is on hold because \`${videoArtifactSpec.relativePath}\` is not verified. Verify rendered output first, then approve again.`,
              ],
              [
                `'${taskTitle}' は \`${videoArtifactSpec.relativePath}\` 未確認のため承認/マージが保留されました。レンダー結果確認後に再承認してください。`,
              ],
              [
                `'${taskTitle}' 因 \`${videoArtifactSpec.relativePath}\` 未验证，审批/合并已暂停。请先确认渲染结果后再审批。`,
              ],
            ),
            lang,
          ),
          taskId,
        );
        return;
      }

      appendTaskLog(
        taskId,
        "system",
        `Review gate: video artifact verified for approval (${verifiedPath}, ${verifiedSize} bytes)`,
      );

      const remotionEvidenceTaskIds = new Set<string>([taskId]);
      try {
        const renderDelegatedRows = db
          .prepare(
            `
              SELECT delegated_task_id
              FROM subtasks
              WHERE task_id = ?
                AND title LIKE '%[VIDEO_FINAL_RENDER]%'
                AND delegated_task_id IS NOT NULL
                AND TRIM(delegated_task_id) != ''
            `,
          )
          .all(taskId) as Array<{ delegated_task_id: string | null }>;
        for (const row of renderDelegatedRows) {
          const id = String(row?.delegated_task_id ?? "").trim();
          if (id) remotionEvidenceTaskIds.add(id);
        }
      } catch {
        // best effort
      }
      try {
        const childRows = db
          .prepare(
            `
              SELECT id
              FROM tasks
              WHERE source_task_id = ?
                AND status IN ('in_progress', 'review', 'done')
            `,
          )
          .all(taskId) as Array<{ id: string }>;
        for (const row of childRows) {
          const id = String(row?.id ?? "").trim();
          if (id) remotionEvidenceTaskIds.add(id);
        }
      } catch {
        // best effort
      }

      const remotionGate = evaluateRemotionOnlyGateFromLogFiles({
        logsDir: String(logsDir ?? process.cwd()),
        taskIds: [...remotionEvidenceTaskIds],
      });
      if (!remotionGate.passed) {
        appendTaskLog(
          taskId,
          "system",
          `Review hold: video artifact gate blocked approval (remotion evidence missing/invalid). checked_tasks=${remotionGate.checkedTaskIds.join(", ")}, remotion_tasks=${remotionGate.remotionEvidenceTaskIds.join(", ") || "none"}, forbidden_tasks=${remotionGate.forbiddenEngineTaskIds.join(", ") || "none"}`,
        );
        notifyCeo(
          pickL(
            l(
              [
                `'${taskTitle}' 는 Remotion 렌더 실행 증빙이 확인되지 않아 승인/머지가 보류되었습니다. [VIDEO_FINAL_RENDER]는 Remotion으로 다시 렌더 후 승인해 주세요.`,
              ],
              [
                `'${taskTitle}' approval/merge is on hold because Remotion render evidence was not verified. Re-render [VIDEO_FINAL_RENDER] with Remotion, then approve again.`,
              ],
              [
                `'${taskTitle}' は Remotion レンダー実行の証跡が確認できないため承認/マージを保留しました。[VIDEO_FINAL_RENDER] を Remotion で再レンダー後に再承認してください。`,
              ],
              [
                `'${taskTitle}' 因未验证到 Remotion 渲染证据，审批/合并已暂停。请使用 Remotion 重新渲染 [VIDEO_FINAL_RENDER] 后再审批。`,
              ],
            ),
            lang,
          ),
          taskId,
        );
        return;
      }

      appendTaskLog(
        taskId,
        "system",
        `Review gate: remotion runtime evidence verified (${remotionGate.remotionEvidenceTaskIds.join(", ")})`,
      );
    }

    const finalizeApprovedReview = () => {
      const t = nowMs();
      const latestTask = db.prepare("SELECT status, department_id FROM tasks WHERE id = ?").get(taskId) as
        | { status: string; department_id: string | null }
        | undefined;
      if (!latestTask || latestTask.status !== "review") return;

      // If task has a worktree, merge the branch back before marking done
      const wtInfo = taskWorktrees.get(taskId);
      let mergeNote = "";
      if (wtInfo) {
        // Check if this is a GitHub project → merge to dev + PR flow
        const projectRow = currentTask.project_id
          ? (db.prepare("SELECT github_repo FROM projects WHERE id = ?").get(currentTask.project_id) as
              | { github_repo: string | null }
              | undefined)
          : undefined;
        const githubRepo = projectRow?.github_repo;

        const mergeResult = githubRepo
          ? mergeToDevAndCreatePR(wtInfo.projectPath, taskId, githubRepo)
          : mergeWorktree(wtInfo.projectPath, taskId);

        if (mergeResult.success) {
          appendTaskLog(taskId, "system", `Git merge completed: ${mergeResult.message}`);
          cleanupWorktree(wtInfo.projectPath, taskId);
          appendTaskLog(taskId, "system", "Worktree cleaned up after successful merge");
          mergeNote = githubRepo
            ? pickL(
                l(
                  [" (dev 병합 + PR 생성)"],
                  [" (merged to dev + PR)"],
                  [" (dev マージ + PR)"],
                  ["（合并到 dev + PR）"],
                ),
                lang,
              )
            : pickL(l([" (병합 완료)"], [" (merged)"], [" (マージ完了)"], ["（已合并）"]), lang);
        } else {
          appendTaskLog(taskId, "system", `Git merge failed: ${mergeResult.message}`);

          const conflictLeader = findTeamLeader(latestTask.department_id);
          const conflictLeaderName = conflictLeader
            ? getAgentDisplayName(conflictLeader, lang)
            : pickL(l(["팀장"], ["Team Lead"], ["チームリーダー"], ["组长"]), lang);
          const conflictFiles = mergeResult.conflicts?.length
            ? pickL(
                l(
                  [`\n충돌 파일: ${mergeResult.conflicts.join(", ")}`],
                  [`\nConflicting files: ${mergeResult.conflicts.join(", ")}`],
                  [`\n競合ファイル: ${mergeResult.conflicts.join(", ")}`],
                  [`\n冲突文件: ${mergeResult.conflicts.join(", ")}`],
                ),
                lang,
              )
            : "";
          notifyCeo(
            pickL(
              l(
                [
                  `${conflictLeaderName}: '${taskTitle}' 병합 중 충돌이 발생했습니다. 수동 해결이 필요합니다.${conflictFiles}\n브랜치: ${wtInfo.branchName}`,
                ],
                [
                  `${conflictLeaderName}: Merge conflict while merging '${taskTitle}'. Manual resolution is required.${conflictFiles}\nBranch: ${wtInfo.branchName}`,
                ],
                [
                  `${conflictLeaderName}: '${taskTitle}' のマージ中に競合が発生しました。手動解決が必要です。${conflictFiles}\nブランチ: ${wtInfo.branchName}`,
                ],
                [
                  `${conflictLeaderName}：合并 '${taskTitle}' 时发生冲突，需要手动解决。${conflictFiles}\n分支: ${wtInfo.branchName}`,
                ],
              ),
              lang,
            ),
            taskId,
          );

          mergeNote = pickL(
            l(
              [" (병합 충돌 - 수동 해결 필요)"],
              [" (merge conflict - manual resolution required)"],
              [" (マージ競合 - 手動解決が必要)"],
              ["（合并冲突 - 需要手动解决）"],
            ),
            lang,
          );
        }
      }

      db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(t, t, taskId);
      setTaskCreationAuditCompletion(taskId, true);

      appendTaskLog(taskId, "system", "Status → done (all leaders approved)");
      endTaskExecutionSession(taskId, "task_done");

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      broadcast("task_update", updatedTask);
      notifyTaskStatus(taskId, taskTitle, "done", lang);

      refreshCliUsageData()
        .then((usage: unknown) => broadcast("cli_usage_update", usage))
        .catch(() => {});
      const deferTaskReport = shouldDeferTaskReportUntilPlanningArchive(currentTask);
      if (deferTaskReport) {
        appendTaskLog(taskId, "system", "Task report popup deferred until planning consolidated archive is ready");
      } else {
        emitTaskReportEvent(taskId);
      }

      const leader = findTeamLeader(latestTask.department_id);
      const leaderName = leader
        ? getAgentDisplayName(leader, lang)
        : pickL(l(["팀장"], ["Team Lead"], ["チームリーダー"], ["组长"]), lang);
      const subtaskProgressSummary = formatTaskSubtaskProgressSummary(taskId, lang);
      const progressSuffix = subtaskProgressSummary
        ? `\n${pickL(l(["보완/협업 완료 현황"], ["Remediation/Collaboration completion"], ["補完/協業 完了状況"], ["整改/协作完成情况"]), lang)}\n${subtaskProgressSummary}`
        : "";
      notifyCeo(
        pickL(
          l(
            [`${leaderName}: '${taskTitle}' 최종 승인 완료 보고드립니다.${mergeNote}${progressSuffix}`],
            [`${leaderName}: Final approval completed for '${taskTitle}'.${mergeNote}${progressSuffix}`],
            [`${leaderName}: '${taskTitle}' の最終承認が完了しました。${mergeNote}${progressSuffix}`],
            [`${leaderName}：'${taskTitle}' 最终审批已完成。${mergeNote}${progressSuffix}`],
          ),
          lang,
        ),
        taskId,
      );

      reviewRoundState.delete(taskId);
      reviewInFlight.delete(taskId);

      // Parent final approval is the merge point for collaboration children in review.
      if (!currentTask.source_task_id) {
        const childRows = db
          .prepare("SELECT id, title FROM tasks WHERE source_task_id = ? AND status = 'review' ORDER BY created_at ASC")
          .all(taskId) as Array<{ id: string; title: string }>;
        if (childRows.length > 0) {
          appendTaskLog(
            taskId,
            "system",
            `Finalization: closing ${childRows.length} collaboration child task(s) after parent review`,
          );
          for (const child of childRows) {
            finishReview(child.id, child.title);
          }
        }
        // Generate and archive one consolidated project report via planning leader model.
        void archivePlanningConsolidatedReport(taskId);
      }

      const nextCallback = crossDeptNextCallbacks.get(taskId);
      if (nextCallback) {
        crossDeptNextCallbacks.delete(taskId);
        nextCallback();
      } else {
        // pause/resume or restart can drop in-memory callback chain; reconstruct from DB when possible
        recoverCrossDeptQueueAfterMissingCallback(taskId);
      }

      const subtaskNext = subtaskDelegationCallbacks.get(taskId);
      if (subtaskNext) {
        subtaskDelegationCallbacks.delete(taskId);
        subtaskNext();
      }
    };

    if (currentTask.source_task_id) {
      appendTaskLog(taskId, "system", "Review consensus skipped for delegated collaboration task");
      finalizeApprovedReview();
      return;
    }

    startReviewConsensusMeeting(taskId, taskTitle, currentTask.department_id, finalizeApprovedReview);
  }

  return {
    reconcileDelegatedSubtasksAfterRun,
    finishReview,
  };
}
