import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { Lang } from "../../../types/lang.ts";
import { resolveWorkflowPackKeyForTask } from "../../workflow/packs/task-pack-resolver.ts";
import { ensureVideoPreprodRemotionBestPracticesSkill } from "../../workflow/core/video-skill-bootstrap.ts";
import { resolveConstrainedAgentScopeForTask } from "../core/tasks/execution-run-auto-assign.ts";
import type { AgentRow } from "./direct-chat.ts";
import type { L10n } from "./language-policy.ts";
import type { SubtaskRow } from "./subtask-summary.ts";
import {
  buildCrossLeaderAckMessage,
  buildDelegatedDescription,
  buildDelegatedTitle,
  buildExecutionStartNotice,
  buildOriginRequestMessage,
  buildQueueProgressNotice,
  buildWorktreeCeoNote,
  teamLeadFallbackLabel,
} from "./subtask-delegation-batch-messages.ts";

type ParentTaskRow = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  project_path: string | null;
  department_id: string | null;
  workflow_pack_key?: string | null;
};

interface BatchDeps {
  db: any;
  l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => L10n;
  pickL: (pool: L10n, lang: Lang) => string;
  resolveLang: (text?: string, fallback?: Lang) => Lang;
  getDeptName: (deptId: string, workflowPackKey?: string | null) => string;
  getAgentDisplayName: (agent: AgentRow, lang: string) => string;
  findTeamLeader: (deptId: string | null, candidateAgentIds?: string[] | null) => AgentRow | null;
  findBestSubordinate: (deptId: string, excludeId: string, candidateAgentIds?: string[] | null) => AgentRow | null;
  nowMs: () => number;
  broadcast: (event: string, payload: unknown) => void;
  notifyCeo: (content: string, taskId?: string | null, messageType?: string) => void;
  sendAgentMessage: (
    agent: AgentRow,
    content: string,
    messageType?: string,
    receiverType?: string,
    receiverId?: string | null,
    taskId?: string | null,
  ) => void;
  appendTaskLog: (taskId: string, source: string, message: string) => void;
  recordTaskCreationAudit: (payload: any) => void;
  resolveProjectPath: (taskLike: {
    project_id?: string | null;
    project_path?: string | null;
    description?: string | null;
    title?: string | null;
  }) => string;
  createWorktree: (projectPath: string, taskId: string, agentName: string, baseBranch?: string) => string | null;
  logsDir: string;
  ensureTaskExecutionSession: (
    taskId: string,
    agentId: string,
    provider: string,
  ) => {
    sessionId: string;
    agentId: string;
    provider: string;
  };
  ensureClaudeMd: (projectPath: string, worktreePath: string) => void;
  getProviderModelConfig: () => Record<string, { model?: string; reasoningLevel?: string }>;
  spawnCliAgent: (
    taskId: string,
    provider: string,
    prompt: string,
    cwd: string,
    logFilePath: string,
    model?: string,
    reasoningLevel?: string,
  ) => {
    on: (event: "close", listener: (code: number | null) => void) => void;
  };
  getNextHttpAgentPid: () => number;
  launchApiProviderAgent: (
    taskId: string,
    apiProviderId: string | null,
    apiModel: string | null,
    prompt: string,
    cwd: string,
    logFilePath: string,
    controller: AbortController,
    fakePid: number,
  ) => void;
  launchHttpAgent: (
    taskId: string,
    provider: string,
    prompt: string,
    cwd: string,
    logFilePath: string,
    controller: AbortController,
    fakePid: number,
    oauthAccountId: string | null,
  ) => void;
  startProgressTimer: (taskId: string, taskTitle: string, departmentId: string | null) => void;
  subtaskDelegationCallbacks: Map<string, () => void>;
  delegatedTaskToSubtask: Map<string, string>;
  maybeNotifyAllSubtasksComplete: (parentTaskId: string) => void;
  finalizeDelegatedSubtasks: (delegatedTaskId: string, subtaskIds: string[], exitCode: number) => void;
  buildSubtaskDelegationPrompt: (
    parentTask: ParentTaskRow,
    assignedSubtasks: SubtaskRow[],
    execAgent: AgentRow,
    targetDeptId: string,
    targetDeptName: string,
  ) => string;
}

export function createSubtaskDelegationBatch(deps: BatchDeps) {
  const {
    db,
    l,
    pickL,
    resolveLang,
    getDeptName,
    getAgentDisplayName,
    findTeamLeader,
    findBestSubordinate,
    nowMs,
    broadcast,
    notifyCeo,
    sendAgentMessage,
    appendTaskLog,
    recordTaskCreationAudit,
    resolveProjectPath,
    createWorktree,
    logsDir,
    ensureTaskExecutionSession,
    ensureClaudeMd,
    getProviderModelConfig,
    spawnCliAgent,
    getNextHttpAgentPid,
    launchApiProviderAgent,
    launchHttpAgent,
    startProgressTimer,
    subtaskDelegationCallbacks,
    delegatedTaskToSubtask,
    maybeNotifyAllSubtasksComplete,
    finalizeDelegatedSubtasks,
    buildSubtaskDelegationPrompt,
  } = deps;

  function getConstrainedAgentIds(parentTask: ParentTaskRow, targetDeptId: string | null): string[] | null {
    return resolveConstrainedAgentScopeForTask(db as any, {
      workflow_pack_key: parentTask.workflow_pack_key ?? null,
      department_id: targetDeptId ?? parentTask.department_id ?? null,
      project_id: parentTask.project_id,
    });
  }

  function pickManualPoolAgent(
    candidateAgentIds: string[],
    preferredDeptId?: string | null,
    excludeIds: string[] = [],
  ): AgentRow | null {
    const candidateIds = [
      ...new Set(candidateAgentIds.map((id) => String(id || "").trim()).filter((id) => id.length > 0)),
    ];
    if (candidateIds.length === 0) return null;

    const excludedIds = [...new Set(excludeIds.map((id) => String(id || "").trim()).filter((id) => id.length > 0))];
    const idPlaceholders = candidateIds.map(() => "?").join(",");
    const params: unknown[] = [...candidateIds];

    const deptClause = preferredDeptId ? "AND department_id = ?" : "";
    if (preferredDeptId) params.push(preferredDeptId);

    const excludeClause = excludedIds.length > 0 ? `AND id NOT IN (${excludedIds.map(() => "?").join(",")})` : "";
    if (excludedIds.length > 0) params.push(...excludedIds);

    const agents = db
      .prepare(
        `SELECT * FROM agents WHERE id IN (${idPlaceholders}) ${deptClause} ${excludeClause} ORDER BY
         CASE status WHEN 'idle' THEN 0 WHEN 'break' THEN 1 WHEN 'working' THEN 2 ELSE 3 END,
         CASE role WHEN 'senior' THEN 0 WHEN 'junior' THEN 1 WHEN 'intern' THEN 2 WHEN 'team_leader' THEN 3 ELSE 4 END`,
      )
      .all(...params) as unknown as AgentRow[];
    return agents[0] ?? null;
  }

  function delegateSubtaskBatch(
    subtasks: SubtaskRow[],
    queueIndex: number,
    queueTotal: number,
    parentTask: ParentTaskRow,
    onBatchDone?: () => void,
  ): void {
    const lang = resolveLang(parentTask.description ?? parentTask.title);
    if (subtasks.length === 0) {
      onBatchDone?.();
      return;
    }

    const targetDeptId = subtasks[0].target_department_id!;
    const targetDeptName = getDeptName(targetDeptId, parentTask.workflow_pack_key ?? null);
    const subtaskIds = subtasks.map((st) => st.id);
    const firstTitle = subtasks[0].title;
    const batchTitle = subtasks.length > 1 ? `${firstTitle} +${subtasks.length - 1}` : firstTitle;
    const projectCandidateAgentIds = getConstrainedAgentIds(parentTask, targetDeptId);
    const manualScoped = Array.isArray(projectCandidateAgentIds);

    const crossLeader = findTeamLeader(targetDeptId, projectCandidateAgentIds);
    if (!crossLeader) {
      const doneAt = nowMs();
      for (const sid of subtaskIds) {
        db.prepare("UPDATE subtasks SET status = 'done', completed_at = ?, blocked_reason = NULL WHERE id = ?").run(
          doneAt,
          sid,
        );
        broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sid));
      }
      maybeNotifyAllSubtasksComplete(parentTask.id);
      onBatchDone?.();
      return;
    }

    const originLeader = findTeamLeader(parentTask.department_id, projectCandidateAgentIds);
    const crossSub = manualScoped
      ? findBestSubordinate(targetDeptId, crossLeader.id, projectCandidateAgentIds)
      : findBestSubordinate(targetDeptId, crossLeader.id);
    const crossLeaderAllowed = !manualScoped || projectCandidateAgentIds.includes(crossLeader.id);
    const manualPoolFallback =
      manualScoped && projectCandidateAgentIds.length > 0
        ? pickManualPoolAgent(projectCandidateAgentIds, targetDeptId, originLeader ? [originLeader.id] : []) ||
          pickManualPoolAgent(projectCandidateAgentIds, null, originLeader ? [originLeader.id] : []) ||
          pickManualPoolAgent(projectCandidateAgentIds, targetDeptId) ||
          pickManualPoolAgent(projectCandidateAgentIds, null)
        : null;
    const crossCoordinator = crossLeaderAllowed ? crossLeader : (crossSub ?? manualPoolFallback ?? crossLeader);
    const originLeaderName = originLeader
      ? getAgentDisplayName(originLeader, lang)
      : teamLeadFallbackLabel({ l, pickL }, lang);
    const crossCoordinatorName = getAgentDisplayName(crossCoordinator, lang);

    if (queueTotal > 1) {
      notifyCeo(
        buildQueueProgressNotice({
          l,
          pickL,
          lang,
          targetDeptName,
          queueIndex,
          queueTotal,
          itemCount: subtasks.length,
        }),
        parentTask.id,
      );
    }

    if (originLeader) {
      sendAgentMessage(
        originLeader,
        buildOriginRequestMessage({
          l,
          pickL,
          lang,
          crossLeaderName: crossCoordinatorName,
          parentTitle: parentTask.title,
          itemCount: subtasks.length,
          batchTitle,
        }),
        "chat",
        "agent",
        crossCoordinator.id === originLeader.id ? null : crossCoordinator.id,
        parentTask.id,
      );
    }

    broadcast("cross_dept_delivery", {
      from_agent_id: originLeader?.id || null,
      to_agent_id: crossCoordinator.id,
      task_title: batchTitle,
    });

    const ackDelay = 1500 + Math.random() * 1000;
    setTimeout(() => {
      const latestParent = db.prepare("SELECT status FROM tasks WHERE id = ?").get(parentTask.id) as
        | { status?: string }
        | undefined;
      const parentStatus = String(latestParent?.status ?? "").trim();
      if (!latestParent || !["planned", "pending", "in_progress", "review"].includes(parentStatus)) {
        appendTaskLog(
          parentTask.id,
          "system",
          `Subtask delegation batch skipped: parent task is not active anymore (status=${parentStatus || "missing"})`,
        );
        onBatchDone?.();
        return;
      }

      const crossSubAtRun = manualScoped
        ? findBestSubordinate(targetDeptId, crossLeader.id, projectCandidateAgentIds)
        : findBestSubordinate(targetDeptId, crossLeader.id);
      const manualPoolFallbackAtRun =
        manualScoped && projectCandidateAgentIds.length > 0
          ? pickManualPoolAgent(projectCandidateAgentIds, targetDeptId, originLeader ? [originLeader.id] : []) ||
            pickManualPoolAgent(projectCandidateAgentIds, null, originLeader ? [originLeader.id] : []) ||
            pickManualPoolAgent(projectCandidateAgentIds, targetDeptId) ||
            pickManualPoolAgent(projectCandidateAgentIds, null)
          : null;
      const execAgent =
        crossSubAtRun ??
        (crossLeaderAllowed ? crossLeader : manualPoolFallbackAtRun) ??
        crossCoordinator ??
        crossLeader;
      const execName = getAgentDisplayName(execAgent, lang);

      sendAgentMessage(
        crossCoordinator,
        buildCrossLeaderAckMessage({
          l,
          pickL,
          lang,
          hasSubordinate: execAgent.id !== crossCoordinator.id,
          originLeaderName,
          itemCount: subtasks.length,
          batchTitle,
          execName,
        }),
        "chat",
        "agent",
        null,
        parentTask.id,
      );

      const delegatedTaskId = randomUUID();
      const ct = nowMs();
      const delegatedTitle = buildDelegatedTitle({ l, pickL }, lang, subtasks.length, batchTitle);
      const delegatedChecklist = subtasks.map((st, idx) => `${idx + 1}. ${st.title}`).join("\n");
      const delegatedDescription = buildDelegatedDescription({
        l,
        pickL,
        lang,
        sourceDeptName: getDeptName(parentTask.department_id ?? "", parentTask.workflow_pack_key ?? null),
        parentSummary: parentTask.description || parentTask.title,
        delegatedChecklist,
      });
      const delegatedWorkflowPackKey = resolveWorkflowPackKeyForTask({
        db: db as any,
        sourceTaskPackKey: parentTask.workflow_pack_key,
        sourceTaskId: parentTask.id,
        projectId: parentTask.project_id,
      });
      db.prepare(
        `
    INSERT INTO tasks (id, title, description, department_id, project_id, status, priority, task_type, workflow_pack_key, project_path, source_task_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'planned', 1, 'general', ?, ?, ?, ?, ?)
  `,
      ).run(
        delegatedTaskId,
        delegatedTitle,
        delegatedDescription,
        targetDeptId,
        parentTask.project_id ?? null,
        delegatedWorkflowPackKey,
        parentTask.project_path ?? resolveProjectPath(parentTask) ?? null,
        parentTask.id,
        ct,
        ct,
      );
      recordTaskCreationAudit({
        taskId: delegatedTaskId,
        taskTitle: delegatedTitle,
        taskStatus: "planned",
        departmentId: targetDeptId,
        sourceTaskId: parentTask.id,
        taskType: "general",
        projectPath: parentTask.project_path ?? null,
        trigger: "workflow.subtask_batch_delegation",
        triggerDetail: `parent_task=${parentTask.id}; subtasks=${subtasks.length}; target_dept=${targetDeptId}`,
        actorType: "agent",
        actorId: crossCoordinator.id,
        actorName: crossCoordinator.name,
        body: {
          parent_task_id: parentTask.id,
          subtask_ids: subtaskIds,
          target_department_id: targetDeptId,
        },
      });
      if (parentTask.project_id) {
        db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(
          ct,
          ct,
          parentTask.project_id,
        );
      }
      appendTaskLog(delegatedTaskId, "system", `Subtask delegation from '${parentTask.title}' → ${targetDeptName}`);
      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(delegatedTaskId));

      const ct2 = nowMs();
      db.prepare(
        "UPDATE tasks SET assigned_agent_id = ?, status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?",
      ).run(execAgent.id, ct2, ct2, delegatedTaskId);
      db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(
        delegatedTaskId,
        execAgent.id,
      );
      appendTaskLog(delegatedTaskId, "system", `${crossCoordinatorName} → ${execName}`);

      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(delegatedTaskId));
      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(execAgent.id));

      for (const sid of subtaskIds) {
        db.prepare(
          "UPDATE subtasks SET delegated_task_id = ?, status = 'in_progress', blocked_reason = NULL WHERE id = ?",
        ).run(delegatedTaskId, sid);
        broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sid));
      }
      delegatedTaskToSubtask.set(delegatedTaskId, subtaskIds[0]);
      if (onBatchDone) {
        subtaskDelegationCallbacks.set(delegatedTaskId, onBatchDone);
      }
      const failDelegatedLaunch = (error: unknown, stage: string) => {
        const message = error instanceof Error ? error.message : String(error);
        appendTaskLog(delegatedTaskId, "error", `Delegated launch failed (${stage}): ${message}`);
        try {
          finalizeDelegatedSubtasks(delegatedTaskId, subtaskIds, 1);
        } catch {
          const doneAt = nowMs();
          for (const sid of subtaskIds) {
            db.prepare("UPDATE subtasks SET status = 'blocked', blocked_reason = ? WHERE id = ?").run(
              "Delegated task failed",
              sid,
            );
            broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sid));
          }
          db.prepare("UPDATE tasks SET status = 'inbox', updated_at = ? WHERE id = ?").run(doneAt, delegatedTaskId);
          const pending = subtaskDelegationCallbacks.get(delegatedTaskId);
          subtaskDelegationCallbacks.delete(delegatedTaskId);
          delegatedTaskToSubtask.delete(delegatedTaskId);
          if (pending) pending();
        }
      };

      const execProvider = execAgent.cli_provider || "claude";
      if (["claude", "codex", "gemini", "opencode", "copilot", "antigravity", "api"].includes(execProvider)) {
        let delegatedProcessStarted = false;
        try {
          const projPath = resolveProjectPath({
            project_id: parentTask.project_id,
            project_path: parentTask.project_path,
            description: parentTask.description,
            title: parentTask.title,
          });
          const worktreePath = createWorktree(projPath, delegatedTaskId, execAgent.name);
          if (!worktreePath) {
            failDelegatedLaunch(
              new Error(`worktree_required: isolated worktree creation failed for '${projPath}'`),
              "worktree_required",
            );
            return;
          }
          const agentCwd = worktreePath;
          appendTaskLog(
            delegatedTaskId,
            "system",
            `Git worktree created: ${worktreePath} (branch: climpire/${delegatedTaskId.slice(0, 8)})`,
          );
          const logFilePath = path.join(logsDir, `${delegatedTaskId}.log`);
          ensureVideoPreprodRemotionBestPracticesSkill({
            db: db as any,
            nowMs,
            workflowPackKey: parentTask.workflow_pack_key ?? null,
            provider: execProvider,
            taskId: delegatedTaskId,
            appendTaskLog,
          });
          const spawnPrompt = buildSubtaskDelegationPrompt(
            parentTask,
            subtasks,
            execAgent,
            targetDeptId,
            targetDeptName,
          );
          const executionSession = ensureTaskExecutionSession(delegatedTaskId, execAgent.id, execProvider);
          const worktreeNote = `\nNOTE: You are working in an isolated Git worktree branch (climpire/${delegatedTaskId.slice(0, 8)}). Commit your changes normally.`;

          // Build sibling worktree reference block so agents can read prior departments' work
          let siblingWorktreeBlock = "";
          try {
            const siblingRows = db
              .prepare(
                "SELECT s.title, s.target_department_id, s.delegated_task_id FROM subtasks s WHERE s.task_id = ? AND s.status = 'done' AND s.delegated_task_id IS NOT NULL AND s.delegated_task_id != ?",
              )
              .all(parentTask.id, delegatedTaskId) as Array<{
              title: string;
              target_department_id: string | null;
              delegated_task_id: string;
            }>;
            const validSiblings: string[] = [];
            for (const sib of siblingRows) {
              const shortId = sib.delegated_task_id.slice(0, 8);
              const wtPath = path.join(projPath, ".climpire-worktrees", shortId);
              if (fs.existsSync(wtPath)) {
                const deptLabel = sib.target_department_id
                  ? getDeptName(sib.target_department_id, parentTask.workflow_pack_key)
                  : "unknown";
                validSiblings.push(`- [${deptLabel}] ${wtPath}`);
              }
            }
            if (validSiblings.length > 0) {
              siblingWorktreeBlock = [
                "",
                "[Prior Department Deliverables]",
                "The following directories contain completed work from other departments on this project.",
                "You MUST read and reference these files to ensure consistency with prior deliverables.",
                "These are READ-ONLY references — do NOT modify files in these paths.",
                ...validSiblings,
              ].join("\n");
            }
          } catch {
            // best effort — do not block delegation on sibling lookup failure
          }

          const sessionPrompt = [
            `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
            "Task-scoped session: keep continuity only within this delegated task.",
            spawnPrompt,
            worktreeNote,
            siblingWorktreeBlock,
          ].join("\n");

          if (execProvider === "claude") {
            ensureClaudeMd(projPath, worktreePath);
          }

          appendTaskLog(delegatedTaskId, "system", `RUN start (agent=${execAgent.name}, provider=${execProvider})`);

          const wrapCallbackForHttpProvider = () => {
            const originalCallback = subtaskDelegationCallbacks.get(delegatedTaskId);
            subtaskDelegationCallbacks.set(delegatedTaskId, () => {
              // Finalize subtask statuses based on delegated task exit result
              const finishedTask = db.prepare("SELECT status FROM tasks WHERE id = ?").get(delegatedTaskId) as
                | { status: string }
                | undefined;
              if (!finishedTask || finishedTask.status === "cancelled" || finishedTask.status === "pending") {
                delegatedTaskToSubtask.delete(delegatedTaskId);
                appendTaskLog(
                  delegatedTaskId,
                  "system",
                  `Delegated batch callback skipped (status=${finishedTask?.status ?? "missing"})`,
                );
                if (originalCallback) originalCallback();
                return;
              }
              const succeeded = finishedTask?.status === "done" || finishedTask?.status === "review";
              const doneAt = nowMs();
              for (const sid of subtaskIds) {
                if (succeeded) {
                  db.prepare(
                    "UPDATE subtasks SET status = 'done', completed_at = ?, blocked_reason = NULL WHERE id = ?",
                  ).run(doneAt, sid);
                } else {
                  db.prepare("UPDATE subtasks SET status = 'blocked', blocked_reason = ? WHERE id = ?").run(
                    "Delegated task failed",
                    sid,
                  );
                }
                broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sid));
              }
              delegatedTaskToSubtask.delete(delegatedTaskId);
              if (succeeded) {
                const touchedParents = new Set<string>();
                for (const sid of subtaskIds) {
                  const sub = db.prepare("SELECT task_id FROM subtasks WHERE id = ?").get(sid) as
                    | { task_id: string }
                    | undefined;
                  if (sub?.task_id) touchedParents.add(sub.task_id);
                }
                for (const pid of touchedParents) maybeNotifyAllSubtasksComplete(pid);
              }
              if (originalCallback) originalCallback();
            });
          };

          if (execProvider === "api") {
            try {
              wrapCallbackForHttpProvider();
              const controller = new AbortController();
              const fakePid = getNextHttpAgentPid();
              launchApiProviderAgent(
                delegatedTaskId,
                execAgent.api_provider_id ?? null,
                execAgent.api_model ?? null,
                sessionPrompt,
                agentCwd,
                logFilePath,
                controller,
                fakePid,
              );
              delegatedProcessStarted = true;
            } catch (error) {
              failDelegatedLaunch(error, "api_provider_bootstrap");
              return;
            }
          } else if (execProvider === "copilot" || execProvider === "antigravity") {
            try {
              wrapCallbackForHttpProvider();
              const controller = new AbortController();
              const fakePid = getNextHttpAgentPid();
              launchHttpAgent(
                delegatedTaskId,
                execProvider,
                sessionPrompt,
                agentCwd,
                logFilePath,
                controller,
                fakePid,
                execAgent.oauth_account_id ?? null,
              );
              delegatedProcessStarted = true;
            } catch (error) {
              failDelegatedLaunch(error, "http_provider_bootstrap");
              return;
            }
          } else {
            const delegateModelConfig = getProviderModelConfig();
            const delegateModel = execAgent.cli_model || delegateModelConfig[execProvider]?.model || undefined;
            const delegateReasoningLevel =
              execProvider === "codex"
                ? execAgent.cli_reasoning_level || delegateModelConfig[execProvider]?.reasoningLevel || undefined
                : delegateModelConfig[execProvider]?.reasoningLevel || undefined;
            let child: {
              on: (event: "close", listener: (code: number | null) => void) => void;
            } | null = null;
            try {
              child = spawnCliAgent(
                delegatedTaskId,
                execProvider,
                sessionPrompt,
                agentCwd,
                logFilePath,
                delegateModel,
                delegateReasoningLevel,
              );
            } catch (error) {
              failDelegatedLaunch(error, "cli_spawn");
              return;
            }
            if (!child) {
              failDelegatedLaunch("spawn returned no child process", "cli_spawn_empty");
              return;
            }
            child.on("close", (code: number | null) => {
              finalizeDelegatedSubtasks(delegatedTaskId, subtaskIds, code ?? 1);
            });
            delegatedProcessStarted = true;
          }

          const worktreeCeoNote = buildWorktreeCeoNote({ l, pickL }, lang, delegatedTaskId, Boolean(worktreePath));
          notifyCeo(
            buildExecutionStartNotice({
              l,
              pickL,
              lang,
              targetDeptName,
              execName,
              itemCount: subtasks.length,
              worktreeCeoNote,
            }),
            delegatedTaskId,
          );
          startProgressTimer(delegatedTaskId, delegatedTitle, targetDeptId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (delegatedProcessStarted) {
            appendTaskLog(delegatedTaskId, "system", `Delegated post-launch warning: ${message}`);
          } else {
            failDelegatedLaunch(error, "delegated_bootstrap");
          }
          return;
        }
      } else {
        onBatchDone?.();
      }
    }, ackDelay);
  }

  return { delegateSubtaskBatch };
}
