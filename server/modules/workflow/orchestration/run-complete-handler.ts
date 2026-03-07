import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  discoverVideoArtifact,
  resolveVideoArtifactRelativeCandidates,
  resolveVideoArtifactSpecForTask,
} from "../packs/video-artifact.ts";
import { evaluateRemotionOnlyGateFromLogFiles } from "../packs/video-render-engine-gate.ts";
import { applyPatchesFromLog } from "../core/patch-applicator.ts";

type CreateRunCompleteHandlerDeps = Record<string, any>;

export function createRunCompleteHandler(deps: CreateRunCompleteHandlerDeps) {
  const {
    activeProcesses,
    stopProgressTimer,
    db,
    stopRequestedTasks,
    stopRequestModeByTask,
    appendTaskLog,
    clearTaskWorkflowState,
    codexThreadToSubtask,
    nowMs,
    logsDir,
    broadcast,
    processSubtaskDelegations,
    taskWorktrees,
    cleanupWorktree,
    findTeamLeader,
    getAgentDisplayName,
    pickL,
    l,
    notifyCeo,
    sendAgentMessage,
    resolveLang,
    formatTaskSubtaskProgressSummary,
    crossDeptNextCallbacks,
    recoverCrossDeptQueueAfterMissingCallback,
    subtaskDelegationCallbacks,
    finishReview,
    reconcileDelegatedSubtasksAfterRun,
    completeTaskWithoutReview,
    isReportDesignCheckpointTask,
    extractReportDesignParentTaskId,
    resumeReportAfterDesignCheckpoint,
    isPresentationReportTask,
    readReportFlowValue,
    startReportDesignCheckpoint,
    upsertReportFlowValue,
    isReportRequestTask,
    notifyTaskStatus,
    prettyStreamJson,
    getWorktreeDiffSummary,
    hasVisibleDiffSummary,
  } = deps;

  function handleTaskRunComplete(taskId: string, exitCode: number): void {
    activeProcesses.delete(taskId);
    stopProgressTimer(taskId);

    // Get latest task snapshot early for stop/delete race handling.
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
      | {
          assigned_agent_id: string | null;
          department_id: string | null;
          title: string;
          description: string | null;
          status: string;
          task_type: string | null;
          workflow_pack_key: string | null;
          project_id: string | null;
          project_path: string | null;
          source_task_id: string | null;
        }
      | undefined;
    const stopRequested = stopRequestedTasks.has(taskId);
    const stopMode = stopRequestModeByTask.get(taskId);
    stopRequestedTasks.delete(taskId);
    stopRequestModeByTask.delete(taskId);

    // If task was stopped/deleted or no longer in-progress, ignore late close events.
    if (!task || stopRequested || task.status !== "in_progress") {
      if (task) {
        appendTaskLog(
          taskId,
          "system",
          `RUN completion ignored (status=${task.status}, exit=${exitCode}, stop_requested=${stopRequested ? "yes" : "no"}, stop_mode=${stopMode ?? "none"})`,
        );
      }
      const keepWorkflowForResume = stopRequested && stopMode === "pause";
      if (!keepWorkflowForResume) {
        clearTaskWorkflowState(taskId);
      }
      return;
    }

    // Clean up Codex thread→subtask mappings for this task's subtasks
    for (const [tid, itemId] of codexThreadToSubtask) {
      const row = db.prepare("SELECT id FROM subtasks WHERE cli_tool_use_id = ? AND task_id = ?").get(itemId, taskId);
      if (row) codexThreadToSubtask.delete(tid);
    }

    const logPath = path.join(logsDir, `${taskId}.log`);
    const t = nowMs();
    let finalExitCode = exitCode;
    let rawLog: string | null = null;
    let result: string | null = null;
    try {
      if (fs.existsSync(logPath)) {
        rawLog = fs.readFileSync(logPath, "utf8");
        result = rawLog.slice(-2000);
      }
    } catch {
      /* ignore */
    }

    // Apply Copilot agent patches (*** Start Patch … *** End Patch) to worktree
    if (rawLog) {
      const wtPatch = taskWorktrees.get(taskId) as { worktreePath?: string } | undefined;
      if (wtPatch?.worktreePath) {
        try {
          // Determine if this is an HTTP-only agent (copilot/antigravity/api).
          // CLI agents (claude/codex/gemini) write files via bash directly — no patch blocks needed.
          const agentRow = task.assigned_agent_id
            ? (db.prepare("SELECT cli_provider FROM agents WHERE id = ?").get(task.assigned_agent_id) as { cli_provider?: string } | undefined)
            : undefined;
          const agentProvider = agentRow?.cli_provider ?? "copilot";
          const isHttpAgent = ["copilot", "antigravity", "api"].includes(agentProvider);

          const committed = applyPatchesFromLog(rawLog, wtPatch.worktreePath, task.title);
          if (committed) {
            appendTaskLog(taskId, "system", "Patch blocks applied and committed to worktree.");
          } else if (isHttpAgent) {
            // ── CODE VERIFICATION CHECK (HTTP agents only) ──
            // HTTP agents MUST use *** Start Patch to write files. If they didn't, requeue.
            const hasCodeContent =
              /```[\w]*\n[\s\S]{100,}?\n```/m.test(rawLog) || // markdown code block 100+ chars
              /\bfunction\b|\bclass\b|\bconst\b|\bimport\b|\bexport\b/.test(rawLog); // code keywords

            const hasPatchAttempt = /\*\*\*\s*(Start|Begin|Add|Update)\s+(Patch|File)/i.test(rawLog);

            if (hasCodeContent && !hasPatchAttempt) {
              appendTaskLog(
                taskId,
                "system",
                "⚠️ CODE-WITHOUT-PATCH DETECTED: Agent described code but did not use *** Start Patch / *** End Patch format. No files were written to the worktree. Task result is text-only — files were NOT created. The agent must re-run using the required patch block format.",
              );
              // ── AUTO-REQUEUE for dev department HTTP-agent tasks ──
              if (task.department_id === "dev") {
                db.prepare("UPDATE tasks SET status='todo', result=NULL WHERE id=?").run(taskId);
                appendTaskLog(
                  taskId,
                  "system",
                  "🔁 AUTO-RETRY: devタスクにコードがコミットされなかったため自動差し戻し。スタッフは *** Start Patch 形式でコードを書いて再実行します。",
                );
                return; // skip normal done transition
              }
            } else if (hasCodeContent && hasPatchAttempt) {
              appendTaskLog(
                taskId,
                "system",
                "⚠️ PATCH-PARSE-FAILED: Patch block detected but could not be applied. Check patch format syntax.",
              );
              // Also requeue dev tasks when patch parsing failed
              if (task.department_id === "dev") {
                db.prepare("UPDATE tasks SET status='todo', result=NULL WHERE id=?").run(taskId);
                appendTaskLog(
                  taskId,
                  "system",
                  "🔁 AUTO-RETRY: パッチブロックの解析に失敗したため自動差し戻し。形式を確認して再実行します。",
                );
                return;
              }
            }
          }
        } catch (patchErr: unknown) {
          const msg = patchErr instanceof Error ? patchErr.message : String(patchErr);
          appendTaskLog(taskId, "system", `Patch application warning: ${msg}`);
        }
      }
    }

    // ── COMPONENT TASK CHECKER ──
    // If this is a [コンポーネント] task, verify the file exists and runs tsc.
    // On success: auto-generate a [ドキュメント] subtask.
    // On failure: auto-generate a [デバッグ] subtask and requeue.
    if (task.title?.startsWith("[コンポーネント]") && task.project_path) {
      (async () => {
        try {
          const { buildDocumentTaskPayload, buildDebugTaskPayload } = await import("../core/task-templates.ts");
          // Extract file path from title: "[コンポーネント] FileName.tsx - description"
          const fileMatch = task.title.match(/\[コンポーネント\]\s+([\w/\-.]+\.(tsx?|jsx?))/);
          // Also check description for "ファイル: `path`"
          const descMatch = task.description?.match(/ファイル:\s*`([^`]+)`/);
          const relFilePath = descMatch?.[1] ?? fileMatch?.[1] ?? null;
          const projectPath = task.project_path ?? "";

          // Check worktree path first (agent writes files there), then fall back to project path
          const wtInfo = taskWorktrees.get(taskId) as { worktreePath?: string } | undefined;
          const checkRoot = wtInfo?.worktreePath ?? projectPath;

          if (relFilePath && projectPath) {
            const absFilePath = path.join(checkRoot, relFilePath);
            const fileExists = fs.existsSync(absFilePath);

            if (!fileExists) {
              appendTaskLog(taskId, "system", `⚠️ COMPONENT CHECK: ファイル ${relFilePath} が存在しません。デバッグタスクを生成します。`);
              const debugPayload = buildDebugTaskPayload(relFilePath, projectPath, `ファイルが作成されていない: ${absFilePath}`, taskId);
              const newId = crypto.randomUUID();
              const nowMs = Date.now();
              db.prepare(
                `INSERT INTO tasks (id, title, description, department_id, task_type, project_path, source_task_id, priority, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?)`,
              ).run(newId, debugPayload.title, debugPayload.description, debugPayload.department_id, debugPayload.task_type, debugPayload.project_path, taskId, debugPayload.priority ?? 20, nowMs, nowMs);
            } else {
              // Run tsc check if tsconfig exists (in worktree)
              let tscError = "";
              const clientTsconfigPath = path.join(checkRoot, "client", "tsconfig.json");
              const tscRoot = fs.existsSync(clientTsconfigPath) ? path.join(checkRoot, "client") : checkRoot;

              if (fs.existsSync(path.join(tscRoot, "tsconfig.json"))) {
                try {
                  execFileSync("npx", ["tsc", "--noEmit", "--skipLibCheck"], { cwd: tscRoot as string, stdio: "pipe", timeout: 30000 });
                  appendTaskLog(taskId, "system", `✅ COMPONENT CHECK: ${relFilePath} 存在確認OK、TypeScriptエラーなし。ドキュメントタスクを生成します。`);
                } catch (tscErr: any) {
                  tscError = tscErr.stdout?.toString() ?? tscErr.stderr?.toString() ?? String(tscErr);
                  appendTaskLog(taskId, "system", `⚠️ COMPONENT CHECK: TypeScriptエラー検出。デバッグタスクを生成します。`);
                }
              } else {
                appendTaskLog(taskId, "system", `✅ COMPONENT CHECK: ${relFilePath} 存在確認OK。ドキュメントタスクを生成します。`);
              }

              if (tscError) {
                const debugPayload = buildDebugTaskPayload(relFilePath, projectPath, tscError, taskId);
                const newId = crypto.randomUUID();
                const nowMs = Date.now();
                db.prepare(
                  `INSERT INTO tasks (id, title, description, department_id, task_type, project_path, source_task_id, priority, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?)`,
                ).run(newId, debugPayload.title, debugPayload.description, debugPayload.department_id, debugPayload.task_type, debugPayload.project_path, taskId, debugPayload.priority ?? 20, nowMs, nowMs);
              } else {
                // Success — generate document task
                const docPayload = buildDocumentTaskPayload(relFilePath, projectPath, taskId);
                const newId = crypto.randomUUID();
                const nowMs = Date.now();
                db.prepare(
                  `INSERT INTO tasks (id, title, description, department_id, task_type, project_path, source_task_id, priority, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?)`,
                ).run(newId, docPayload.title, docPayload.description, docPayload.department_id, docPayload.task_type, docPayload.project_path, taskId, docPayload.priority ?? 5, nowMs, nowMs);
              }
            }
          }
        } catch (compCheckErr: unknown) {
          const msg = compCheckErr instanceof Error ? compCheckErr.message : String(compCheckErr);
          appendTaskLog(taskId, "system", `Component check error: ${msg}`);
        }
      })().catch(() => {});
    }
    const isVideoPreprodTask = task.workflow_pack_key === "video_preprod";
    const isVideoFinalRenderTask = isVideoPreprodTask && /\[VIDEO_FINAL_RENDER\]/i.test(task.title);
    const probeVideoArtifact = () => {
      const videoArtifactSpec = resolveVideoArtifactSpecForTask(db as any, {
        project_id: task.project_id,
        project_path: task.project_path,
        department_id: task.department_id,
        workflow_pack_key: task.workflow_pack_key,
      });
      const candidateRelativePaths = resolveVideoArtifactRelativeCandidates(videoArtifactSpec);
      const wtInfo = taskWorktrees.get(taskId) as { worktreePath?: string; projectPath?: string } | undefined;
      const outputRoot = task.project_path || wtInfo?.projectPath || process.cwd();
      const projectCandidates = candidateRelativePaths.map((relative) => path.join(outputRoot, relative));

      let videoArtifactReady = false;
      if (wtInfo?.worktreePath) {
        const worktreeCandidates = candidateRelativePaths.map((relative) => path.join(wtInfo.worktreePath!, relative));
        let sourceVideo: string | null = null;
        for (const candidate of worktreeCandidates) {
          if (!fs.existsSync(candidate)) continue;
          try {
            if (fs.statSync(candidate).size > 0) {
              sourceVideo = candidate;
              break;
            }
          } catch {
            // Ignore stat errors and continue searching candidates.
          }
        }

        // Fallback: discover any .mp4 in worktree's video_output/ or out/ dirs
        if (!sourceVideo) {
          sourceVideo = discoverVideoArtifact(wtInfo.worktreePath!);
          if (sourceVideo) {
            appendTaskLog(taskId, "system", `Video artifact discovered via directory scan in worktree: ${sourceVideo}`);
          }
        }

        if (sourceVideo) {
          try {
            const destVideo = path.join(outputRoot, videoArtifactSpec.relativePath);
            fs.mkdirSync(path.dirname(destVideo), { recursive: true });
            fs.copyFileSync(sourceVideo, destVideo);
            const size = fs.statSync(destVideo).size;
            if (size > 0) {
              videoArtifactReady = true;
              appendTaskLog(
                taskId,
                "system",
                `Video artifact synchronized: ${destVideo} (${size} bytes, source=${sourceVideo})`,
              );
            } else {
              appendTaskLog(taskId, "system", `Video artifact sync failed: rendered file is empty (${destVideo})`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            appendTaskLog(taskId, "system", `Video artifact sync failed: ${msg}`);
          }
        } else {
          appendTaskLog(
            taskId,
            "system",
            `Video artifact not found in worktree (checked: ${worktreeCandidates.join(", ")})`,
          );
        }
      }

      if (!videoArtifactReady) {
        for (const projectVideo of projectCandidates) {
          if (!fs.existsSync(projectVideo)) continue;
          try {
            const size = fs.statSync(projectVideo).size;
            if (size > 0) {
              videoArtifactReady = true;
              appendTaskLog(
                taskId,
                "system",
                `Video artifact verified at project path: ${projectVideo} (${size} bytes)`,
              );
              break;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            appendTaskLog(taskId, "system", `Video artifact verification failed: ${msg}`);
          }
        }
      }

      // Final fallback: discover any .mp4 in project root's video_output/ or out/ dirs
      if (!videoArtifactReady) {
        const discovered = discoverVideoArtifact(outputRoot);
        if (discovered) {
          videoArtifactReady = true;
          appendTaskLog(
            taskId,
            "system",
            `Video artifact discovered via directory scan at project root: ${discovered}`,
          );
        }
      }

      return {
        videoArtifactReady,
        videoArtifactSpec,
        projectCandidates,
      };
    };
    if (finalExitCode !== 0 && isVideoFinalRenderTask) {
      const remotionGate = evaluateRemotionOnlyGateFromLogFiles({ logsDir, taskIds: [taskId] });
      const artifactProbe = probeVideoArtifact();
      if (remotionGate.passed && artifactProbe.videoArtifactReady) {
        appendTaskLog(
          taskId,
          "system",
          "Final render recovery: detected valid Remotion output despite non-zero exit; continuing as success.",
        );
        finalExitCode = 0;
      } else {
        appendTaskLog(
          taskId,
          "system",
          `Final render recovery skipped: remotion_ok=${remotionGate.passed ? "yes" : "no"}, artifact_ok=${artifactProbe.videoArtifactReady ? "yes" : "no"}`,
        );
      }
    }
    if (finalExitCode === 0 && isVideoFinalRenderTask) {
      const remotionGate = evaluateRemotionOnlyGateFromLogFiles({ logsDir, taskIds: [taskId] });
      if (!remotionGate.passed) {
        finalExitCode = 86;
        appendTaskLog(
          taskId,
          "system",
          `Video render engine gate failed: Remotion evidence required for [VIDEO_FINAL_RENDER]. checked_tasks=${remotionGate.checkedTaskIds.join(", ") || taskId}, remotion_tasks=${remotionGate.remotionEvidenceTaskIds.join(", ") || "none"}, forbidden_tasks=${remotionGate.forbiddenEngineTaskIds.join(", ") || "none"}`,
        );
      } else {
        appendTaskLog(
          taskId,
          "system",
          `Video render engine gate passed: Remotion evidence detected (${remotionGate.remotionEvidenceTaskIds.join(", ")})`,
        );
      }
    }

    const logKind = finalExitCode === 0 ? "completed" : "failed";
    appendTaskLog(taskId, "system", `RUN ${logKind} (exit code: ${finalExitCode})`);

    if (result) {
      db.prepare("UPDATE tasks SET result = ? WHERE id = ?").run(result, taskId);
    }

    // Auto-complete own-department subtasks on CLI success; foreign ones get delegated
    if (finalExitCode === 0) {
      const pendingSubtasks = db
        .prepare(
          "SELECT id, target_department_id FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled')",
        )
        .all(taskId) as Array<{ id: string; target_department_id: string | null }>;
      if (pendingSubtasks.length > 0) {
        const now = nowMs();
        for (const sub of pendingSubtasks) {
          // Only auto-complete subtasks without a foreign department target
          if (!sub.target_department_id) {
            db.prepare("UPDATE subtasks SET status = 'done', completed_at = ? WHERE id = ?").run(now, sub.id);
            const updated = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sub.id);
            broadcast("subtask_update", updated);
          }
        }
      }
      // Trigger delegation for foreign-department subtasks
      processSubtaskDelegations(taskId);
    }

    // Update agent status back to idle
    if (task?.assigned_agent_id) {
      db.prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?").run(task.assigned_agent_id);

      if (finalExitCode === 0) {
        db.prepare(
          "UPDATE agents SET stats_tasks_done = stats_tasks_done + 1, stats_xp = stats_xp + 10 WHERE id = ?",
        ).run(task.assigned_agent_id);
      }

      const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(task.assigned_agent_id) as
        | Record<string, unknown>
        | undefined;
      broadcast("agent_status", agent);
    }

    if (finalExitCode === 0 && task) {
      if (isVideoPreprodTask) {
        const rootVideoTask = !task.source_task_id;
        const shouldCheckArtifactNow = rootVideoTask || isVideoFinalRenderTask;
        let deferArtifactGate = false;
        if (rootVideoTask && !isVideoFinalRenderTask) {
          const openSubtasksRow = db
            .prepare("SELECT COUNT(*) AS cnt FROM subtasks WHERE task_id = ? AND status NOT IN ('done', 'cancelled')")
            .get(taskId) as { cnt?: number } | undefined;
          const openChildTasksRow = db
            .prepare(
              `
              SELECT COUNT(*) AS cnt
              FROM tasks
              WHERE source_task_id = ?
                AND status NOT IN ('done', 'cancelled')
            `,
            )
            .get(taskId) as { cnt?: number } | undefined;
          const openSubtasks = Number(openSubtasksRow?.cnt ?? 0);
          const openChildTasks = Number(openChildTasksRow?.cnt ?? 0);
          deferArtifactGate = openSubtasks > 0 || openChildTasks > 0;
          if (deferArtifactGate) {
            appendTaskLog(
              taskId,
              "system",
              `Video sequencing notice: documentation/collaboration still in progress. Artifact gate deferred until review stage (open_subtasks=${openSubtasks}, open_collab_tasks=${openChildTasks})`,
            );
            notifyCeo(
              pickL(
                l(
                  [
                    `'${task.title}' 는 문서화/협업 정리가 남아 있어 영상 품질 게이트를 Review 단계에서 이어서 확인합니다. (미완료 subtask ${openSubtasks}건, 협업 task ${openChildTasks}건)`,
                  ],
                  [
                    `'${task.title}' still has documentation/collaboration work pending, so video quality gating will continue in Review stage. (open subtasks: ${openSubtasks}, open collaboration tasks: ${openChildTasks})`,
                  ],
                  [
                    `'${task.title}' は文書化/協業の整理が残っているため、動画品質ゲートは Review 段階で継続確認します。（未完了 subtask: ${openSubtasks}件、協業 task: ${openChildTasks}件）`,
                  ],
                  [
                    `'${task.title}' 仍有文档与协作收口工作，视频质量门禁将转入 Review 阶段继续检查。（未完成 subtask：${openSubtasks}，协作 task：${openChildTasks}）`,
                  ],
                ),
                resolveLang(task.description ?? task.title),
              ),
              taskId,
            );
          }
        }

        if (shouldCheckArtifactNow && !deferArtifactGate) {
          const artifactProbe = probeVideoArtifact();
          if (!artifactProbe.videoArtifactReady) {
            if (isVideoFinalRenderTask) {
              finalExitCode = 87;
              appendTaskLog(
                taskId,
                "system",
                `Video artifact gate failed: [VIDEO_FINAL_RENDER] output missing/empty. checked=${artifactProbe.projectCandidates.join(", ")}`,
              );
              notifyCeo(
                pickL(
                  l(
                    [
                      `'${task.title}' 의 최종 렌더 산출물이 확인되지 않아 실행을 실패 처리했습니다. Remotion으로 출력 파일을 생성한 뒤 다시 실행해 주세요.`,
                    ],
                    [
                      `Marked '${task.title}' as failed because final render output is missing/empty. Generate the file with Remotion and retry.`,
                    ],
                    [
                      `'${task.title}' の最終レンダー成果物が未確認のため失敗処理しました。Remotion で出力を生成後に再実行してください。`,
                    ],
                    [`'${task.title}' 最终渲染产物缺失/为空，已判定本次执行失败。请用 Remotion 重新生成后再执行。`],
                  ),
                  resolveLang(task.description ?? task.title),
                ),
                taskId,
              );
            } else {
              appendTaskLog(
                taskId,
                "system",
                `Video artifact gate notice: missing/empty render output. Review stage will require artifact verification. checked=${artifactProbe.projectCandidates.join(", ")}`,
              );
              notifyCeo(
                pickL(
                  l(
                    [
                      `'${task.title}' 영상 산출물이 아직 확인되지 않았습니다. 검토 단계에서 \`${artifactProbe.videoArtifactSpec.relativePath}\` (또는 legacy \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`) 확인 후 승인해야 합니다.`,
                    ],
                    [
                      `Video artifact for '${task.title}' is not verified yet. In review stage, approval requires \`${artifactProbe.videoArtifactSpec.relativePath}\` (or legacy \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`).`,
                    ],
                    [
                      `'${task.title}' の動画成果物はまだ未確認です。レビュー段階で \`${artifactProbe.videoArtifactSpec.relativePath}\`（または legacy \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`）確認後に承認してください。`,
                    ],
                    [
                      `任务 '${task.title}' 的视频产物尚未验证。请在 Review 阶段确认 \`${artifactProbe.videoArtifactSpec.relativePath}\`（或兼容路径 \`${artifactProbe.videoArtifactSpec.legacyRelativePath}\`）后再审批。`,
                    ],
                  ),
                  resolveLang(task.description ?? task.title),
                ),
                taskId,
              );
            }
          }
        }
      }

      if (isReportDesignCheckpointTask(task)) {
        const parentTaskId = extractReportDesignParentTaskId(task);
        completeTaskWithoutReview(
          {
            id: taskId,
            title: task.title,
            description: task.description,
            department_id: task.department_id,
            source_task_id: task.source_task_id,
            assigned_agent_id: task.assigned_agent_id,
          },
          "Status → done (report design checkpoint completed; review meeting skipped)",
        );
        if (parentTaskId) {
          resumeReportAfterDesignCheckpoint(parentTaskId, taskId);
        }
        return;
      }

      if (isPresentationReportTask(task)) {
        const designReview = (readReportFlowValue(task.description, "design_review") ?? "pending").toLowerCase();
        if (designReview !== "done") {
          const started = startReportDesignCheckpoint({
            id: taskId,
            title: task.title,
            description: task.description,
            project_id: task.project_id,
            project_path: task.project_path,
            assigned_agent_id: task.assigned_agent_id,
          });
          if (started) return;
          const fallbackDesc = upsertReportFlowValue(
            upsertReportFlowValue(task.description, "design_review", "skipped"),
            "final_regen",
            "ready",
          );
          db.prepare("UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?").run(
            fallbackDesc,
            nowMs(),
            taskId,
          );
        }

        completeTaskWithoutReview(
          {
            id: taskId,
            title: task.title,
            description: task.description,
            department_id: task.department_id,
            source_task_id: task.source_task_id,
            assigned_agent_id: task.assigned_agent_id,
          },
          "Status → done (report workflow: final PPT regenerated; second design confirmation skipped)",
        );
        return;
      }

      if (isReportRequestTask(task)) {
        completeTaskWithoutReview(
          {
            id: taskId,
            title: task.title,
            description: task.description,
            department_id: task.department_id,
            source_task_id: task.source_task_id,
            assigned_agent_id: task.assigned_agent_id,
          },
          "Status → done (report workflow: review meeting skipped for documentation/report task)",
        );
        return;
      }
    }

    if (finalExitCode === 0) {
      // ── SUCCESS: Move to 'review' for team leader check ──
      db.prepare("UPDATE tasks SET status = 'review', updated_at = ? WHERE id = ?").run(t, taskId);

      appendTaskLog(taskId, "system", "Status → review (team leader review pending)");

      // ── Auto-save implementation summary as meeting record ───────────
      try {
        const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
        const summaryMatch = logContent.match(/## 実装サマリー[\s\S]{0,1000}/);
        const patchFiles = [...logContent.matchAll(/\*\*\* Add File: ([^\n]+)/g)].map(m => m[1]);
        const summaryText = [
          summaryMatch ? summaryMatch[0].trim() : "",
          patchFiles.length > 0 ? `\n## 作成ファイル一覧\n${patchFiles.map(f => `- ${f}`).join("\n")}` : "",
        ].filter(Boolean).join("\n\n") || "（実装サマリーなし）";
        const meetingId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, title, status, started_at, completed_at, created_at)
           VALUES (?, ?, 'implementation_done', 1, ?, 'completed', ?, ?, ?)`,
        ).run(meetingId, taskId, `実装完了: ${task?.title ?? taskId}`, t, t, t);
        db.prepare(
          `INSERT INTO meeting_minute_entries
           (meeting_id, seq, speaker_agent_id, speaker_name, department_name, role_label, message_type, content, created_at)
           VALUES (?, 1, ?, ?, '開発チーム', '担当', 'summary', ?, ?)`,
        ).run(meetingId, task?.assigned_agent_id ?? "", task?.assigned_agent_id ?? "", summaryText, t);
        appendTaskLog(taskId, "system", `📄 implementation summary saved: ${meetingId.slice(0, 8)}`);
      } catch (summErr: unknown) {
        appendTaskLog(taskId, "system", `summary save error: ${summErr instanceof Error ? summErr.message : String(summErr)}`);
      }
      // ─────────────────────────────────────────────────────────────────

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      broadcast("task_update", updatedTask);
      if (task) notifyTaskStatus(taskId, task.title, "review", resolveLang(task.description ?? task.title));

      // Collaboration child tasks should wait in review until parent consolidation meeting.
      // Queue continuation is still triggered so sequential delegation does not stall.
      if (task?.source_task_id) {
        reconcileDelegatedSubtasksAfterRun(taskId, 0);
        const sourceLang = resolveLang(task.description ?? task.title);
        appendTaskLog(
          taskId,
          "system",
          "Status → review (delegated collaboration task waiting for parent consolidation)",
        );
        notifyCeo(
          pickL(
            l(
              [
                `'${task.title}' 협업 하위 태스크가 Review 대기 상태로 전환되었습니다. 상위 업무의 전체 취합 회의에서 일괄 검토/머지합니다.`,
              ],
              [
                `'${task.title}' collaboration child task is now waiting in Review. It will be consolidated in the parent task's single review/merge meeting.`,
              ],
              [
                `'${task.title}' の協業子タスクはReview待機に入りました。上位タスクの一括レビュー/マージ会議で統合処理します。`,
              ],
              [`'${task.title}' 协作子任务已进入 Review 等待。将在上级任务的一次性评审/合并会议中统一处理。`],
            ),
            sourceLang,
          ),
          taskId,
        );

        const nextDelay = 800 + Math.random() * 600;
        const nextCallback = crossDeptNextCallbacks.get(taskId);
        if (nextCallback) {
          crossDeptNextCallbacks.delete(taskId);
          setTimeout(nextCallback, nextDelay);
        } else {
          recoverCrossDeptQueueAfterMissingCallback(taskId);
        }
        const subtaskNext = subtaskDelegationCallbacks.get(taskId);
        if (subtaskNext) {
          subtaskDelegationCallbacks.delete(taskId);
          setTimeout(subtaskNext, nextDelay);
        }
        return;
      }

      // Notify: task entering review
      if (task) {
        const lang = resolveLang(task.description ?? task.title);
        const leader = findTeamLeader(task.department_id);
        const leaderName = leader
          ? getAgentDisplayName(leader, lang)
          : pickL(l(["팀장"], ["Team Lead"], ["チームリーダー"], ["组长"]), lang);
        notifyCeo(
          pickL(
            l(
              [`${leaderName}이(가) '${task.title}' 결과를 검토 중입니다.`],
              [`${leaderName} is reviewing the result for '${task.title}'.`],
              [`${leaderName}が '${task.title}' の成果をレビュー中です。`],
              [`${leaderName} 正在审核 '${task.title}' 的结果。`],
            ),
            lang,
          ),
          taskId,
        );
      }

      // Schedule team leader review message (2-3s delay)
      setTimeout(() => {
        if (!task) return;
        const leader = findTeamLeader(task.department_id);
        if (!leader) {
          // No team leader — auto-approve
          finishReview(taskId, task.title);
          return;
        }

        // Read the task result and pretty-parse it for the report
        let reportBody = "";
        try {
          const logFile = path.join(logsDir, `${taskId}.log`);
          if (fs.existsSync(logFile)) {
            const raw = fs.readFileSync(logFile, "utf8");
            const pretty = prettyStreamJson(raw);
            // Take the last ~500 chars of the pretty output as summary
            reportBody = pretty.length > 500 ? "..." + pretty.slice(-500) : pretty;
          }
        } catch {
          /* ignore */
        }

        // If worktree exists, include diff summary in the report
        const wtInfo = taskWorktrees.get(taskId);
        let diffSummary = "";
        if (wtInfo) {
          diffSummary = getWorktreeDiffSummary(wtInfo.projectPath, taskId);
          if (hasVisibleDiffSummary(diffSummary)) {
            appendTaskLog(taskId, "system", `Worktree diff summary:\n${diffSummary}`);
          }
        }

        // Team leader sends completion report with actual result content + diff
        const reportLang = resolveLang(task.description ?? task.title);
        let reportContent = reportBody
          ? pickL(
              l(
                [`대표님, '${task.title}' 업무 완료 보고드립니다.\n\n📋 결과:\n${reportBody}`],
                [`CEO, reporting completion for '${task.title}'.\n\n📋 Result:\n${reportBody}`],
                [`CEO、'${task.title}' の完了をご報告します。\n\n📋 結果:\n${reportBody}`],
                [`CEO，汇报 '${task.title}' 已完成。\n\n📋 结果:\n${reportBody}`],
              ),
              reportLang,
            )
          : pickL(
              l(
                [`대표님, '${task.title}' 업무 완료 보고드립니다. 작업이 성공적으로 마무리되었습니다.`],
                [`CEO, reporting completion for '${task.title}'. The work has been finished successfully.`],
                [`CEO、'${task.title}' の完了をご報告します。作業は正常に完了しました。`],
                [`CEO，汇报 '${task.title}' 已完成。任务已成功结束。`],
              ),
              reportLang,
            );

        const subtaskProgressLabel = pickL(
          l(
            ["📌 보완/협업 진행 요약"],
            ["📌 Remediation/Collaboration Progress"],
            ["📌 補完/協業 進捗サマリー"],
            ["📌 整改/协作进度摘要"],
          ),
          reportLang,
        );
        const subtaskProgress = formatTaskSubtaskProgressSummary(taskId, reportLang);
        if (subtaskProgress) {
          reportContent += `\n\n${subtaskProgressLabel}\n${subtaskProgress}`;
        }

        if (hasVisibleDiffSummary(diffSummary)) {
          reportContent += pickL(
            l(
              [`\n\n📝 변경사항 (branch: ${wtInfo?.branchName}):\n${diffSummary}`],
              [`\n\n📝 Changes (branch: ${wtInfo?.branchName}):\n${diffSummary}`],
              [`\n\n📝 変更点 (branch: ${wtInfo?.branchName}):\n${diffSummary}`],
              [`\n\n📝 变更内容 (branch: ${wtInfo?.branchName}):\n${diffSummary}`],
            ),
            reportLang,
          );
        }

        sendAgentMessage(leader, reportContent, "report", "all", null, taskId);

        // After another 2-3s: team leader approves → move to done
        setTimeout(() => {
          finishReview(taskId, task.title);
        }, 2500);
      }, 2500);
    } else {
      // ── FAILURE: Reset to inbox, team leader reports failure ──
      db.prepare("UPDATE tasks SET status = 'inbox', updated_at = ? WHERE id = ?").run(t, taskId);

      if (task?.source_task_id) {
        reconcileDelegatedSubtasksAfterRun(taskId, finalExitCode);
      }

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      broadcast("task_update", updatedTask);

      // Clean up worktree on failure — failed work shouldn't persist
      const failWtInfo = taskWorktrees.get(taskId);
      if (failWtInfo) {
        cleanupWorktree(failWtInfo.projectPath, taskId);
        appendTaskLog(taskId, "system", "Worktree cleaned up (task failed)");
      }

      if (task) {
        const leader = findTeamLeader(task.department_id);
        if (leader) {
          setTimeout(() => {
            // Read error output for failure report
            let errorBody = "";
            try {
              const logFile = path.join(logsDir, `${taskId}.log`);
              if (fs.existsSync(logFile)) {
                const raw = fs.readFileSync(logFile, "utf8");
                const pretty = prettyStreamJson(raw);
                errorBody = pretty.length > 300 ? "..." + pretty.slice(-300) : pretty;
              }
            } catch {
              /* ignore */
            }

            const failLang = resolveLang(task.description ?? task.title);
            const failContent = errorBody
              ? pickL(
                  l(
                    [
                      `대표님, '${task.title}' 작업에 문제가 발생했습니다 (종료코드: ${finalExitCode}).\n\n❌ 오류 내용:\n${errorBody}\n\n재배정하거나 업무 내용을 수정한 후 다시 시도해주세요.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}).\n\n❌ Error:\n${errorBody}\n\nPlease reassign the agent or revise the task, then try again.`,
                    ],
                    [
                      `CEO、'${task.title}' の処理中に問題が発生しました (終了コード: ${finalExitCode})。\n\n❌ エラー内容:\n${errorBody}\n\n担当再割り当てまたはタスク内容を修正して再試行してください。`,
                    ],
                    [
                      `CEO，'${task.title}' 执行时发生问题（退出码：${finalExitCode}）。\n\n❌ 错误内容:\n${errorBody}\n\n请重新分配代理或修改任务后重试。`,
                    ],
                  ),
                  failLang,
                )
              : pickL(
                  l(
                    [
                      `대표님, '${task.title}' 작업에 문제가 발생했습니다 (종료코드: ${finalExitCode}). 에이전트를 재배정하거나 업무 내용을 수정한 후 다시 시도해주세요.`,
                    ],
                    [
                      `CEO, '${task.title}' failed with an issue (exit code: ${finalExitCode}). Please reassign the agent or revise the task, then try again.`,
                    ],
                    [
                      `CEO、'${task.title}' の処理中に問題が発生しました (終了コード: ${finalExitCode})。担当再割り当てまたはタスク内容を修正して再試行してください。`,
                    ],
                    [
                      `CEO，'${task.title}' 执行时发生问题（退出码：${finalExitCode}）。请重新分配代理或修改任务后重试。`,
                    ],
                  ),
                  failLang,
                );

            sendAgentMessage(leader, failContent, "report", "all", null, taskId);
          }, 1500);
        }
        const failLang = resolveLang(task.description ?? task.title);
        notifyCeo(
          pickL(
            l(
              [`'${task.title}' 작업 실패 (exit code: ${finalExitCode}).`],
              [`Task '${task.title}' failed (exit code: ${finalExitCode}).`],
              [`'${task.title}' のタスクが失敗しました (exit code: ${finalExitCode})。`],
              [`任务 '${task.title}' 失败（exit code: ${finalExitCode}）。`],
            ),
            failLang,
          ),
          taskId,
        );
      }

      // Even on failure, trigger next cross-dept cooperation so the queue doesn't stall
      const nextCallback = crossDeptNextCallbacks.get(taskId);
      if (nextCallback) {
        crossDeptNextCallbacks.delete(taskId);
        setTimeout(nextCallback, 3000);
      }

      // Even on failure, trigger next subtask delegation so the queue doesn't stall
      const subtaskNext = subtaskDelegationCallbacks.get(taskId);
      if (subtaskNext) {
        subtaskDelegationCallbacks.delete(taskId);
        setTimeout(subtaskNext, 3000);
      }
    }
  }

  return {
    handleTaskRunComplete,
  };
}
