// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  CLI_OUTPUT_DEDUP_WINDOW_MS,
  readNonNegativeIntEnv,
  REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
  REVIEW_MAX_MEMO_ITEMS_PER_ROUND,
  REVIEW_MAX_REMEDIATION_REQUESTS,
  REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND,
  REVIEW_MAX_REVISION_SIGNALS_PER_ROUND,
  REVIEW_MAX_ROUNDS,
} from "../../db/runtime.ts";
import { BUILTIN_GOOGLE_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_SECRET, decryptSecret, encryptSecret } from "../../oauth/helpers.ts";
import { notifyTaskStatus } from "../../gateway/client.ts";
import { createWsHub } from "../../ws/hub.ts";

import { initializeWorkflowAgentProviders } from "./agents/providers.ts";

export function initializeWorkflowPartB(ctx: any): any {
  const __ctx = ctx as any;
  const db = __ctx.db;
  const ensureOAuthActiveAccount = __ctx.ensureOAuthActiveAccount;
  const getActiveOAuthAccountIds = __ctx.getActiveOAuthAccountIds;
  const logsDir = __ctx.logsDir;
  const nowMs = __ctx.nowMs;
  const activeProcesses = __ctx.activeProcesses;
  const broadcast = __ctx.broadcast;
  const buildCliFailureMessage = __ctx.buildCliFailureMessage;
  const buildDirectReplyPrompt = __ctx.buildDirectReplyPrompt;
  const buildTaskExecutionPrompt = __ctx.buildTaskExecutionPrompt;
  const chooseSafeReply = __ctx.chooseSafeReply;
  const cleanupWorktree = __ctx.cleanupWorktree;
  const clearTaskWorkflowState = __ctx.clearTaskWorkflowState;
  const createWorktree = __ctx.createWorktree;
  const crossDeptNextCallbacks = __ctx.crossDeptNextCallbacks;
  const delegatedTaskToSubtask = __ctx.delegatedTaskToSubtask;
  const endTaskExecutionSession = __ctx.endTaskExecutionSession;
  const ensureClaudeMd = __ctx.ensureClaudeMd;
  const ensureTaskExecutionSession = __ctx.ensureTaskExecutionSession;
  const finishReview = __ctx.finishReview;
  const generateProjectContext = __ctx.generateProjectContext;
  const getAgentDisplayName = __ctx.getAgentDisplayName;
  const getRecentChanges = __ctx.getRecentChanges;
  const getRecentConversationContext = __ctx.getRecentConversationContext;
  const getTaskContinuationContext = __ctx.getTaskContinuationContext;
  const handleTaskRunComplete = (...args: any[]) => __ctx.handleTaskRunComplete(...args);
  const hasExplicitWarningFixRequest = __ctx.hasExplicitWarningFixRequest;
  const hasStructuredJsonLines = __ctx.hasStructuredJsonLines;
  const isAgentInMeeting = __ctx.isAgentInMeeting;
  const isTaskWorkflowInterrupted = __ctx.isTaskWorkflowInterrupted;
  const meetingPhaseByAgent = __ctx.meetingPhaseByAgent;
  const meetingPresenceUntil = __ctx.meetingPresenceUntil;
  const meetingReviewDecisionByAgent = __ctx.meetingReviewDecisionByAgent;
  const meetingSeatIndexByAgent = __ctx.meetingSeatIndexByAgent;
  const meetingTaskIdByAgent = __ctx.meetingTaskIdByAgent;
  const mergeWorktree = __ctx.mergeWorktree;
  const notifyCeo = (...args: any[]) => __ctx.notifyCeo(...args);
  const randomDelay = __ctx.randomDelay;
  const rollbackTaskWorktree = __ctx.rollbackTaskWorktree;
  const runAgentOneShot = __ctx.runAgentOneShot;
  const startPlannedApprovalMeeting = __ctx.startPlannedApprovalMeeting;
  const startProgressTimer = __ctx.startProgressTimer;
  const startTaskExecutionForAgent = __ctx.startTaskExecutionForAgent;
  const stopProgressTimer = __ctx.stopProgressTimer;
  const stopRequestModeByTask = __ctx.stopRequestModeByTask;
  const stopRequestedTasks = __ctx.stopRequestedTasks;
  const subtaskDelegationCallbacks = __ctx.subtaskDelegationCallbacks;
  const subtaskDelegationCompletionNoticeSent = __ctx.subtaskDelegationCompletionNoticeSent;
  const subtaskDelegationDispatchInFlight = __ctx.subtaskDelegationDispatchInFlight;
  const taskExecutionSessions = __ctx.taskExecutionSessions;
  const taskWorktrees = __ctx.taskWorktrees;
  const wsClients = __ctx.wsClients;
  const readTimeoutMsEnv = __ctx.readTimeoutMsEnv;
  const TASK_RUN_IDLE_TIMEOUT_MS = __ctx.TASK_RUN_IDLE_TIMEOUT_MS;
  const TASK_RUN_HARD_TIMEOUT_MS = __ctx.TASK_RUN_HARD_TIMEOUT_MS;
  const isGitRepo = __ctx.isGitRepo;
  const getWorktreeDiffSummary = __ctx.getWorktreeDiffSummary;
  const MVP_CODE_REVIEW_POLICY_BASE_LINES = __ctx.MVP_CODE_REVIEW_POLICY_BASE_LINES;
  const EXECUTION_CONTINUITY_POLICY_LINES = __ctx.EXECUTION_CONTINUITY_POLICY_LINES;
  const WARNING_FIX_OVERRIDE_LINE = __ctx.WARNING_FIX_OVERRIDE_LINE;
  const buildMvpCodeReviewPolicyBlock = __ctx.buildMvpCodeReviewPolicyBlock;
  const CONTEXT_IGNORE_DIRS = __ctx.CONTEXT_IGNORE_DIRS;
  const CONTEXT_IGNORE_FILES = __ctx.CONTEXT_IGNORE_FILES;
  const buildFileTree = __ctx.buildFileTree;
  const detectTechStack = __ctx.detectTechStack;
  const getKeyFiles = __ctx.getKeyFiles;
  const buildProjectContextContent = __ctx.buildProjectContextContent;
  const buildAgentArgs = __ctx.buildAgentArgs;
  const ANSI_ESCAPE_REGEX = __ctx.ANSI_ESCAPE_REGEX;
  const CLI_SPINNER_LINE_REGEX = __ctx.CLI_SPINNER_LINE_REGEX;
  const cliOutputDedupCache = __ctx.cliOutputDedupCache;
  const shouldSkipDuplicateCliOutput = __ctx.shouldSkipDuplicateCliOutput;
  const clearCliOutputDedup = __ctx.clearCliOutputDedup;
  const normalizeStreamChunk = __ctx.normalizeStreamChunk;
  const extractLatestProjectMemoBlock = __ctx.extractLatestProjectMemoBlock;
  const sleepMs = __ctx.sleepMs;
  const localeInstruction = __ctx.localeInstruction;
  const normalizeConversationReply = __ctx.normalizeConversationReply;
  const isInternalWorkNarration = __ctx.isInternalWorkNarration;
  const fallbackTurnReply = __ctx.fallbackTurnReply;
  const summarizeForMeetingBubble = __ctx.summarizeForMeetingBubble;
  const isMvpDeferralSignal = __ctx.isMvpDeferralSignal;
  const isHardBlockSignal = __ctx.isHardBlockSignal;
  const hasApprovalAgreementSignal = __ctx.hasApprovalAgreementSignal;
  const isDeferrableReviewHold = __ctx.isDeferrableReviewHold;
  const classifyMeetingReviewDecision = __ctx.classifyMeetingReviewDecision;
  const wantsReviewRevision = __ctx.wantsReviewRevision;
  const findLatestTranscriptContentByAgent = __ctx.findLatestTranscriptContentByAgent;
  const formatMeetingTranscript = __ctx.formatMeetingTranscript;
  const buildMeetingPrompt = __ctx.buildMeetingPrompt;
  const progressTimers = __ctx.progressTimers;
  const reviewRoundState = __ctx.reviewRoundState;
  const reviewInFlight = __ctx.reviewInFlight;
  const getTaskStatusById = __ctx.getTaskStatusById;
  const getReviewRoundMode = __ctx.getReviewRoundMode;
  const scheduleNextReviewRound = __ctx.scheduleNextReviewRound;
  const getLeadersByDepartmentIds = __ctx.getLeadersByDepartmentIds;
  const getAllActiveTeamLeaders = __ctx.getAllActiveTeamLeaders;
  const getTaskRelatedDepartmentIds = __ctx.getTaskRelatedDepartmentIds;
  const getTaskReviewLeaders = __ctx.getTaskReviewLeaders;
  const beginMeetingMinutes = __ctx.beginMeetingMinutes;
  const appendMeetingMinuteEntry = __ctx.appendMeetingMinuteEntry;
  const finishMeetingMinutes = __ctx.finishMeetingMinutes;
  const normalizeRevisionMemoNote = __ctx.normalizeRevisionMemoNote;
  const reserveReviewRevisionMemoItems = __ctx.reserveReviewRevisionMemoItems;
  const loadRecentReviewRevisionMemoItems = __ctx.loadRecentReviewRevisionMemoItems;
  const collectRevisionMemoItems = __ctx.collectRevisionMemoItems;
  const collectPlannedActionItems = __ctx.collectPlannedActionItems;
  const appendTaskProjectMemo = __ctx.appendTaskProjectMemo;
  const appendTaskReviewFinalMemo = __ctx.appendTaskReviewFinalMemo;
  const markAgentInMeeting = __ctx.markAgentInMeeting;
  const callLeadersToCeoOffice = __ctx.callLeadersToCeoOffice;
  const dismissLeadersFromCeoOffice = __ctx.dismissLeadersFromCeoOffice;
  const emitMeetingSpeech = __ctx.emitMeetingSpeech;
  const startReviewConsensusMeeting = __ctx.startReviewConsensusMeeting;
  const DEPT_KEYWORDS = __ctx.DEPT_KEYWORDS;
  const detectLang = (...args: any[]) => __ctx.detectLang(...args);
  const detectTargetDepartments = (...args: any[]) => __ctx.detectTargetDepartments(...args);
  const findTeamLeader = (...args: any[]) => __ctx.findTeamLeader(...args);
  const formatTaskSubtaskProgressSummary = (...args: any[]) => __ctx.formatTaskSubtaskProgressSummary(...args);
  const getDeptName = (...args: any[]) => __ctx.getDeptName(...args);
  const getDeptRoleConstraint = (...args: any[]) => __ctx.getDeptRoleConstraint(...args);
  const getPreferredLanguage = (...args: any[]) => __ctx.getPreferredLanguage(...args);
  const getRoleLabel = (...args: any[]) => __ctx.getRoleLabel(...args);
  const l = (...args: any[]) => __ctx.l(...args);
  const pickL = (...args: any[]) => __ctx.pickL(...args);
  const prettyStreamJson = (...args: any[]) => __ctx.prettyStreamJson(...args);
  const processSubtaskDelegations = (...args: any[]) => __ctx.processSubtaskDelegations(...args);
  const recoverCrossDeptQueueAfterMissingCallback = (...args: any[]) => __ctx.recoverCrossDeptQueueAfterMissingCallback(...args);
  const refreshCliUsageData = (...args: any[]) => __ctx.refreshCliUsageData(...args);
  const resolveLang = (...args: any[]) => __ctx.resolveLang(...args);
  const resolveProjectPath = (...args: any[]) => __ctx.resolveProjectPath(...args);
  const sendAgentMessage = (...args: any[]) => __ctx.sendAgentMessage(...args);

// ---------------------------------------------------------------------------
// Subtask department detection — re-uses DEPT_KEYWORDS + detectTargetDepartments
// ---------------------------------------------------------------------------
function findExplicitDepartmentByMention(text: string, parentDeptId: string | null): string | null {
  const normalized = text.toLowerCase();
  const deptRows = db.prepare(
    "SELECT id, name, name_ko FROM departments ORDER BY sort_order ASC"
  ).all() as Array<{ id: string; name: string; name_ko: string }>;

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
  const cleaned = subtaskTitle.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
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

interface PlannerSubtaskAssignment {
  subtask_id: string;
  target_department_id: string | null;
  reason?: string;
  confidence?: number;
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
    "null", "none", "owner", "ownerdept", "ownerdepartment", "same", "sameasowner",
    "자체", "내부", "동일부서", "원부서", "없음", "无", "同部门", "同部門",
  ]);
  if (nullAliases.has(token)) return null;

  for (const dept of deptRows) {
    const aliases = new Set<string>([
      dept.id,
      dept.name,
      dept.name_ko,
      dept.name_ko.replace(/팀$/g, ""),
      dept.name.replace(/\s*team$/i, ""),
    ].map((v) => normalizeDeptAliasToken(v)));
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
    const rows = Array.isArray(parsed?.assignments)
      ? parsed.assignments
      : (Array.isArray(parsed) ? parsed : []);
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const normalized: PlannerSubtaskAssignment[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const subtaskId = typeof row.subtask_id === "string" ? row.subtask_id.trim() : "";
      if (!subtaskId) continue;
      const targetRaw = row.target_department_id ?? row.target_department ?? row.department_id ?? row.department ?? null;
      const reason = typeof row.reason === "string" ? row.reason.trim() : undefined;
      const confidence = typeof row.confidence === "number"
        ? Math.max(0, Math.min(1, row.confidence))
        : undefined;
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
    const planningLeader = findTeamLeader("planning");
    if (!planningLeader) return;

    const task = db.prepare(
      "SELECT title, description, project_path, assigned_agent_id, department_id FROM tasks WHERE id = ?"
    ).get(taskId) as {
      title: string;
      description: string | null;
      project_path: string | null;
      assigned_agent_id: string | null;
      department_id: string | null;
    } | undefined;
    if (!task) return;

    const baseDeptId = ownerDeptId ?? task.department_id;
    const lang = resolveLang(task.description ?? task.title);
    const subtasks = db.prepare(`
      SELECT id, title, description, status, blocked_reason, target_department_id, assigned_agent_id, delegated_task_id
      FROM subtasks
      WHERE task_id = ?
        AND status IN ('pending', 'blocked')
        AND (delegated_task_id IS NULL OR delegated_task_id = '')
      ORDER BY created_at ASC
    `).all(taskId) as Array<{
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

    const deptRows = db.prepare(
      "SELECT id, name, name_ko FROM departments ORDER BY sort_order ASC"
    ).all() as Array<{ id: string; name: string; name_ko: string }>;
    if (deptRows.length === 0) return;

    const deptGuide = deptRows
      .map((dept) => `- ${dept.id}: ${dept.name_ko || dept.name} (${dept.name})`)
      .join("\n");
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
      "{\"assignments\":[{\"subtask_id\":\"...\",\"target_department_id\":\"department_id_or_null\",\"reason\":\"short reason\",\"confidence\":0.0}]}",
      "Rules:",
      "- Include one assignment per listed subtask_id.",
      "- If subtask stays in owner department, set target_department_id to null.",
      "- Do not invent subtask IDs or department IDs.",
      "- confidence must be between 0.0 and 1.0.",
    ].filter(Boolean).join("\n");

    const run = await runAgentOneShot(planningLeader, reroutePrompt, {
      projectPath: resolveProjectPath({
        title: task.title,
        description: task.description,
        project_path: task.project_path,
      }),
      timeoutMs: 180_000,
      rawOutput: true,
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
        const targetLeader = findTeamLeader(normalizedTargetDept);
        nextStatus = "blocked";
        nextBlockedReason = pickL(l(
          [`${targetDeptName} 협업 대기`],
          [`Waiting for ${targetDeptName} collaboration`],
          [`${targetDeptName}の協業待ち`],
          [`等待${targetDeptName}协作`],
        ), lang);
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
        "UPDATE subtasks SET target_department_id = ?, status = ?, blocked_reason = ?, assigned_agent_id = ? WHERE id = ?"
      ).run(normalizedTargetDept, nextStatus, nextBlockedReason, nextAssignee, subtask.id);
      broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtask.id));

      updated++;
      const bucket = normalizedTargetDept ?? (baseDeptId ?? "owner");
      summaryByDept.set(bucket, (summaryByDept.get(bucket) ?? 0) + 1);
    }

    if (updated > 0) {
      const summaryText = [...summaryByDept.entries()].map(([deptId, cnt]) => `${deptId}:${cnt}`).join(", ");
      appendTaskLog(taskId, "system", `Planning leader rerouted ${updated} subtasks (${phase}) => ${summaryText}`);
      notifyCeo(pickL(l(
        [`'${task.title}' 서브태스크 분배를 기획팀장이 재판정하여 ${updated}건을 재배치했습니다. (${summaryText})`],
        [`Planning leader rerouted ${updated} subtasks for '${task.title}'. (${summaryText})`],
        [`'${task.title}' のサブタスク配分を企画リーダーが再判定し、${updated}件を再配置しました。（${summaryText}）`],
        [`规划负责人已重新判定'${task.title}'的子任务分配，并重分配了${updated}项。（${summaryText}）`],
      ), lang), taskId);
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

// ---------------------------------------------------------------------------
// SubTask creation/completion helpers (shared across all CLI providers)
// ---------------------------------------------------------------------------
function createSubtaskFromCli(taskId: string, toolUseId: string, title: string): void {
  const subId = randomUUID();
  const parentAgent = db.prepare(
    "SELECT assigned_agent_id FROM tasks WHERE id = ?"
  ).get(taskId) as { assigned_agent_id: string | null } | undefined;

  db.prepare(`
    INSERT INTO subtasks (id, task_id, title, status, assigned_agent_id, cli_tool_use_id, created_at)
    VALUES (?, ?, ?, 'in_progress', ?, ?, ?)
  `).run(subId, taskId, title, parentAgent?.assigned_agent_id ?? null, toolUseId, nowMs());

  // Detect if this subtask belongs to a foreign department
  const parentTaskDept = db.prepare(
    "SELECT department_id FROM tasks WHERE id = ?"
  ).get(taskId) as { department_id: string | null } | undefined;
  const targetDeptId = analyzeSubtaskDepartment(title, parentTaskDept?.department_id ?? null);

  if (targetDeptId) {
    const targetDeptName = getDeptName(targetDeptId);
    const lang = getPreferredLanguage();
    const blockedReason = pickL(l(
      [`${targetDeptName} 협업 대기`],
      [`Waiting for ${targetDeptName} collaboration`],
      [`${targetDeptName}の協業待ち`],
      [`等待${targetDeptName}协作`],
    ), lang);
    db.prepare(
      "UPDATE subtasks SET target_department_id = ?, status = 'blocked', blocked_reason = ? WHERE id = ?"
    ).run(targetDeptId, blockedReason, subId);
  }

  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subId);
  broadcast("subtask_update", subtask);
}

function completeSubtaskFromCli(toolUseId: string): void {
  const existing = db.prepare(
    "SELECT id, status FROM subtasks WHERE cli_tool_use_id = ?"
  ).get(toolUseId) as { id: string; status: string } | undefined;
  if (!existing || existing.status === "done") return;

  db.prepare(
    "UPDATE subtasks SET status = 'done', completed_at = ? WHERE id = ?"
  ).run(nowMs(), existing.id);

  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(existing.id);
  broadcast("subtask_update", subtask);
}

function seedApprovedPlanSubtasks(taskId: string, ownerDeptId: string | null, planningNotes: string[] = []): void {
  const existing = db.prepare(
    "SELECT COUNT(*) as cnt FROM subtasks WHERE task_id = ?"
  ).get(taskId) as { cnt: number };
  if (existing.cnt > 0) return;

  const task = db.prepare(
    "SELECT title, description, assigned_agent_id, department_id FROM tasks WHERE id = ?"
  ).get(taskId) as {
    title: string;
    description: string | null;
    assigned_agent_id: string | null;
    department_id: string | null;
  } | undefined;
  if (!task) return;

  const baseDeptId = ownerDeptId ?? task.department_id;
  const lang = resolveLang(task.description ?? task.title);

  const now = nowMs();
  const baseAssignee = task.assigned_agent_id;
  const uniquePlanNotes: string[] = [];
  const planSeen = new Set<string>();
  for (const note of planningNotes) {
    const normalized = note.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (planSeen.has(key)) continue;
    planSeen.add(key);
    uniquePlanNotes.push(normalized);
    if (uniquePlanNotes.length >= 8) break;
  }

  const items: Array<{
    title: string;
    description: string;
    status: "pending" | "blocked";
    assignedAgentId: string | null;
    blockedReason: string | null;
    targetDepartmentId: string | null;
  }> = [
    {
      title: pickL(l(
        ["Planned 상세 실행 계획 확정"],
        ["Finalize detailed execution plan from planned meeting"],
        ["Planned会議の詳細実行計画を確定"],
        ["确定 Planned 会议的详细执行计划"],
      ), lang),
      description: pickL(l(
        [`Planned 회의 기준으로 상세 작업 순서/산출물 기준을 확정합니다. (${task.title})`],
        [`Finalize detailed task sequence and deliverable criteria from the planned meeting. (${task.title})`],
        [`Planned会議を基準に、詳細な作業順序と成果物基準を確定します。(${task.title})`],
        [`基于 Planned 会议，确定详细任务顺序与交付物标准。（${task.title}）`],
      ), lang),
      status: "pending",
      assignedAgentId: baseAssignee,
      blockedReason: null,
      targetDepartmentId: null,
    },
  ];
  const noteDetectedDeptSet = new Set<string>();

  for (const note of uniquePlanNotes) {
    const detail = note.replace(/^[\s\-*0-9.)]+/, "").trim();
    if (!detail) continue;
    const afterColon = detail.includes(":") ? detail.split(":").slice(1).join(":").trim() : detail;
    const titleCore = (afterColon || detail).slice(0, 56).trim();
    const clippedTitle = titleCore.length > 54 ? `${titleCore.slice(0, 53).trimEnd()}…` : titleCore;
    const targetDeptId = analyzeSubtaskDepartment(detail, baseDeptId);
    const targetDeptName = targetDeptId ? getDeptName(targetDeptId) : "";
    const targetLeader = targetDeptId ? findTeamLeader(targetDeptId) : null;
    if (targetDeptId && targetDeptId !== baseDeptId) {
      noteDetectedDeptSet.add(targetDeptId);
    }

    items.push({
      title: pickL(l(
        [`[보완계획] ${clippedTitle || "추가 보완 항목"}`],
        [`[Plan Item] ${clippedTitle || "Additional improvement item"}`],
        [`[補完計画] ${clippedTitle || "追加補完項目"}`],
        [`[计划项] ${clippedTitle || "补充改进事项"}`],
      ), lang),
      description: pickL(l(
        [`Planned 회의 보완점을 실행 계획으로 반영합니다: ${detail}`],
        [`Convert this planned-meeting improvement note into an executable task: ${detail}`],
        [`Planned会議の補完項目を実行計画へ反映します: ${detail}`],
        [`将 Planned 会议补充项转为可执行任务：${detail}`],
      ), lang),
      status: targetDeptId ? "blocked" : "pending",
      assignedAgentId: targetDeptId ? (targetLeader?.id ?? null) : baseAssignee,
      blockedReason: targetDeptId
        ? pickL(l(
          [`${targetDeptName} 협업 대기`],
          [`Waiting for ${targetDeptName} collaboration`],
          [`${targetDeptName}の協業待ち`],
          [`等待${targetDeptName}协作`],
        ), lang)
        : null,
      targetDepartmentId: targetDeptId,
    });
  }

  const relatedDepts = [...noteDetectedDeptSet];
  for (const deptId of relatedDepts) {
    const deptName = getDeptName(deptId);
    const crossLeader = findTeamLeader(deptId);
    items.push({
      title: pickL(l(
        [`[협업] ${deptName} 결과물 작성`],
        [`[Collaboration] Produce ${deptName} deliverable`],
        [`[協業] ${deptName}成果物を作成`],
        [`[协作] 编写${deptName}交付物`],
      ), lang),
      description: pickL(l(
        [`Planned 회의 기준 ${deptName} 담당 결과물을 작성/공유합니다.`],
        [`Create and share the ${deptName}-owned deliverable based on the planned meeting.`],
        [`Planned会議を基準に、${deptName}担当の成果物を作成・共有します。`],
        [`基于 Planned 会议，完成并共享${deptName}负责的交付物。`],
      ), lang),
      status: "blocked",
      assignedAgentId: crossLeader?.id ?? null,
      blockedReason: pickL(l(
        [`${deptName} 협업 대기`],
        [`Waiting for ${deptName} collaboration`],
        [`${deptName}の協業待ち`],
        [`等待${deptName}协作`],
      ), lang),
      targetDepartmentId: deptId,
    });
  }

  items.push({
    title: pickL(l(
      ["부서 산출물 통합 및 최종 정리"],
      ["Consolidate department deliverables and finalize package"],
      ["部門成果物の統合と最終整理"],
      ["整合部门交付物并完成最终整理"],
    ), lang),
    description: pickL(l(
      ["유관부서 산출물을 취합해 단일 결과물로 통합하고 Review 제출본을 준비합니다."],
      ["Collect related-department outputs, merge into one package, and prepare the review submission."],
      ["関連部門の成果物を集約して単一成果物へ統合し、レビュー提出版を準備します。"],
      ["汇总相关部门产出，整合为单一成果，并准备 Review 提交版本。"],
    ), lang),
    status: "pending",
    assignedAgentId: baseAssignee,
    blockedReason: null,
    targetDepartmentId: null,
  });

  for (const st of items) {
    const sid = randomUUID();
    db.prepare(`
      INSERT INTO subtasks (id, task_id, title, description, status, assigned_agent_id, blocked_reason, target_department_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sid,
      taskId,
      st.title,
      st.description,
      st.status,
      st.assignedAgentId,
      st.blockedReason,
      st.targetDepartmentId,
      now,
    );
    broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sid));
  }

  appendTaskLog(
    taskId,
    "system",
    `Planned meeting seeded ${items.length} subtasks (plan-notes: ${uniquePlanNotes.length}, cross-dept: ${relatedDepts.length})`,
  );
  notifyCeo(pickL(l(
    [`'${task.title}' Planned 회의 결과 기준 SubTask ${items.length}건을 생성하고 담당자/유관부서 협업을 배정했습니다.`],
    [`Created ${items.length} subtasks from the planned-meeting output for '${task.title}' and assigned owners/cross-department collaboration.`],
    [`'${task.title}' のPlanned会議結果を基準に SubTask を${items.length}件作成し、担当者と関連部門協業を割り当てました。`],
    [`已基于'${task.title}'的 Planned 会议结果创建${items.length}个 SubTask，并分配负责人及跨部门协作。`],
  ), lang), taskId);

  void rerouteSubtasksByPlanningLeader(taskId, baseDeptId, "planned");
}

function seedReviewRevisionSubtasks(taskId: string, ownerDeptId: string | null, revisionNotes: string[] = []): number {
  const task = db.prepare(
    "SELECT title, description, assigned_agent_id, department_id FROM tasks WHERE id = ?"
  ).get(taskId) as {
    title: string;
    description: string | null;
    assigned_agent_id: string | null;
    department_id: string | null;
  } | undefined;
  if (!task) return 0;

  const baseDeptId = ownerDeptId ?? task.department_id;
  const baseAssignee = task.assigned_agent_id;
  const lang = resolveLang(task.description ?? task.title);
  const now = nowMs();
  const uniqueNotes: string[] = [];
  const seen = new Set<string>();
  for (const note of revisionNotes) {
    const cleaned = note.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueNotes.push(cleaned);
    if (uniqueNotes.length >= 8) break;
  }

  const items: Array<{
    title: string;
    description: string;
    status: "pending" | "blocked";
    assignedAgentId: string | null;
    blockedReason: string | null;
    targetDepartmentId: string | null;
  }> = [];

  for (const note of uniqueNotes) {
    const detail = note.replace(/^[\s\-*0-9.)]+/, "").trim();
    if (!detail) continue;
    const afterColon = detail.includes(":") ? detail.split(":").slice(1).join(":").trim() : detail;
    const titleCore = (afterColon || detail).slice(0, 56).trim();
    const clippedTitle = titleCore.length > 54 ? `${titleCore.slice(0, 53).trimEnd()}…` : titleCore;
    const targetDeptId = analyzeSubtaskDepartment(detail, baseDeptId);
    const targetDeptName = targetDeptId ? getDeptName(targetDeptId) : "";
    const targetLeader = targetDeptId ? findTeamLeader(targetDeptId) : null;

    items.push({
      title: pickL(l(
        [`[검토보완] ${clippedTitle || "추가 보완 항목"}`],
        [`[Review Revision] ${clippedTitle || "Additional revision item"}`],
        [`[レビュー補完] ${clippedTitle || "追加補完項目"}`],
        [`[评审整改] ${clippedTitle || "补充整改事项"}`],
      ), lang),
      description: pickL(l(
        [`Review 회의 보완 요청을 반영합니다: ${detail}`],
        [`Apply the review-meeting revision request: ${detail}`],
        [`Review会議で要請された補完項目を反映します: ${detail}`],
        [`落实 Review 会议提出的整改项：${detail}`],
      ), lang),
      status: targetDeptId ? "blocked" : "pending",
      assignedAgentId: targetDeptId ? (targetLeader?.id ?? null) : baseAssignee,
      blockedReason: targetDeptId
        ? pickL(l(
          [`${targetDeptName} 협업 대기`],
          [`Waiting for ${targetDeptName} collaboration`],
          [`${targetDeptName}の協業待ち`],
          [`等待${targetDeptName}协作`],
        ), lang)
        : null,
      targetDepartmentId: targetDeptId,
    });
  }

  items.push({
    title: pickL(l(
      ["[검토보완] 반영 결과 통합 및 재검토 제출"],
      ["[Review Revision] Consolidate updates and resubmit for review"],
      ["[レビュー補完] 反映結果を統合し再レビュー提出"],
      ["[评审整改] 整合更新并重新提交评审"],
    ), lang),
    description: pickL(l(
      ["보완 반영 결과를 취합해 재검토 제출본을 정리합니다."],
      ["Collect revision outputs and prepare the re-review submission package."],
      ["補完反映の成果を集約し、再レビュー提出版を整えます。"],
      ["汇总整改结果并整理重新评审提交包。"],
    ), lang),
    status: "pending",
    assignedAgentId: baseAssignee,
    blockedReason: null,
    targetDepartmentId: null,
  });

  const hasOpenSubtask = db.prepare(
    "SELECT 1 FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done' LIMIT 1"
  );
  const insertSubtask = db.prepare(`
    INSERT INTO subtasks (id, task_id, title, description, status, assigned_agent_id, blocked_reason, target_department_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let created = 0;
  for (const st of items) {
    const exists = hasOpenSubtask.get(taskId, st.title) as { 1: number } | undefined;
    if (exists) continue;
    const sid = randomUUID();
    insertSubtask.run(
      sid,
      taskId,
      st.title,
      st.description,
      st.status,
      st.assignedAgentId,
      st.blockedReason,
      st.targetDepartmentId,
      now,
    );
    created++;
    broadcast("subtask_update", db.prepare("SELECT * FROM subtasks WHERE id = ?").get(sid));
  }

  if (created > 0) {
    void rerouteSubtasksByPlanningLeader(taskId, baseDeptId, "review");
  }

  return created;
}

// ---------------------------------------------------------------------------
// SubTask parsing from CLI stream-json output
// ---------------------------------------------------------------------------

// Codex multi-agent: map thread_id → cli_tool_use_id (item.id from spawn_agent)
const codexThreadToSubtask = new Map<string, string>();

function parseAndCreateSubtasks(taskId: string, data: string): void {
  try {
    const lines = data.split("\n").filter(Boolean);
    for (const line of lines) {
      let j: Record<string, unknown>;
      try { j = JSON.parse(line); } catch { continue; }

      // Detect sub-agent spawn: tool_use with tool === "Task" (Claude Code)
      if (j.type === "tool_use" && j.tool === "Task") {
        const toolUseId = (j.id as string) || `sub-${Date.now()}`;
        // Check for duplicate
        const existing = db.prepare(
          "SELECT id FROM subtasks WHERE cli_tool_use_id = ?"
        ).get(toolUseId) as { id: string } | undefined;
        if (existing) continue;

        const input = j.input as Record<string, unknown> | undefined;
        const title = (input?.description as string) ||
                      (input?.prompt as string)?.slice(0, 100) ||
                      "Sub-task";

        createSubtaskFromCli(taskId, toolUseId, title);
      }

      // Detect sub-agent completion: tool_result with tool === "Task" (Claude Code)
      if (j.type === "tool_result" && j.tool === "Task") {
        const toolUseId = j.id as string;
        if (!toolUseId) continue;
        completeSubtaskFromCli(toolUseId);
      }

      // ----- Codex multi-agent: spawn_agent / close_agent -----

      // Codex: spawn_agent started → create subtask
      if (j.type === "item.started") {
        const item = j.item as Record<string, unknown> | undefined;
        if (item?.type === "collab_tool_call" && item?.tool === "spawn_agent") {
          const itemId = (item.id as string) || `codex-spawn-${Date.now()}`;
          const existing = db.prepare(
            "SELECT id FROM subtasks WHERE cli_tool_use_id = ?"
          ).get(itemId) as { id: string } | undefined;
          if (!existing) {
            const prompt = (item.prompt as string) || "Sub-agent";
            const title = prompt.split("\n")[0].replace(/^Task:\s*/, "").slice(0, 100);
            createSubtaskFromCli(taskId, itemId, title);
          }
        }
      }

      // Codex: spawn_agent completed → save thread_id mapping
      // Codex: close_agent completed → complete subtask via thread_id
      if (j.type === "item.completed") {
        const item = j.item as Record<string, unknown> | undefined;
        if (item?.type === "collab_tool_call") {
          if (item.tool === "spawn_agent") {
            const itemId = item.id as string;
            const threadIds = (item.receiver_thread_ids as string[]) || [];
            if (itemId && threadIds[0]) {
              codexThreadToSubtask.set(threadIds[0], itemId);
            }
          } else if (item.tool === "close_agent") {
            const threadIds = (item.receiver_thread_ids as string[]) || [];
            for (const tid of threadIds) {
              const origItemId = codexThreadToSubtask.get(tid);
              if (origItemId) {
                completeSubtaskFromCli(origItemId);
                codexThreadToSubtask.delete(tid);
              }
            }
          }
        }
      }

      // ----- Gemini: plan-based subtask detection from message -----

      if (j.type === "message" && j.content) {
        const content = j.content as string;
        // Detect plan output: {"subtasks": [...]}
        const planMatch = content.match(/\{"subtasks"\s*:\s*\[.*?\]\}/s);
        if (planMatch) {
          try {
            const plan = JSON.parse(planMatch[0]) as { subtasks: { title: string }[] };
            for (const st of plan.subtasks) {
              const stId = `gemini-plan-${st.title.slice(0, 30).replace(/\s/g, "-")}-${Date.now()}`;
              const existing = db.prepare(
                "SELECT id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done'"
              ).get(taskId, st.title) as { id: string } | undefined;
              if (!existing) {
                createSubtaskFromCli(taskId, stId, st.title);
              }
            }
          } catch { /* ignore malformed JSON */ }
        }
        // Detect completion report: {"subtask_done": "..."}
        const doneMatch = content.match(/\{"subtask_done"\s*:\s*"(.+?)"\}/);
        if (doneMatch) {
          const doneTitle = doneMatch[1];
          const sub = db.prepare(
            "SELECT cli_tool_use_id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done' LIMIT 1"
          ).get(taskId, doneTitle) as { cli_tool_use_id: string } | undefined;
          if (sub) completeSubtaskFromCli(sub.cli_tool_use_id);
        }
      }
    }
  } catch {
    // Not JSON or not parseable - ignore
  }
}

function createSafeLogStreamOps(logStream: any): {
  safeWrite: (text: string) => boolean;
  safeEnd: (onDone?: () => void) => void;
  isClosed: () => boolean;
} {
  let ended = false;
  const isClosed = () => ended || Boolean(logStream?.destroyed || logStream?.writableEnded || logStream?.closed);
  const safeWrite = (text: string): boolean => {
    if (!text || isClosed()) return false;
    try {
      logStream.write(text);
      return true;
    } catch {
      ended = true;
      return false;
    }
  };
  const safeEnd = (onDone?: () => void): void => {
    if (isClosed()) {
      ended = true;
      onDone?.();
      return;
    }
    ended = true;
    try {
      logStream.end(() => onDone?.());
    } catch {
      onDone?.();
    }
  };
  return { safeWrite, safeEnd, isClosed };
}

function spawnCliAgent(
  taskId: string,
  provider: string,
  prompt: string,
  projectPath: string,
  logPath: string,
  model?: string,
  reasoningLevel?: string,
): ChildProcess {
  clearCliOutputDedup(taskId);
  // Save prompt for debugging
  const promptPath = path.join(logsDir, `${taskId}.prompt.txt`);
  fs.writeFileSync(promptPath, prompt, "utf8");

  const args = buildAgentArgs(provider, model, reasoningLevel);
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);

  // Remove CLAUDECODE env var to prevent "nested session" detection
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  delete cleanEnv.CLAUDE_CODE;
  cleanEnv.NO_COLOR = "1";
  cleanEnv.FORCE_COLOR = "0";
  cleanEnv.CI = "1";
  if (!cleanEnv.TERM) cleanEnv.TERM = "dumb";

  const child = spawn(args[0], args.slice(1), {
    cwd: projectPath,
    env: cleanEnv,
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  let finished = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;
  let stdoutListener: ((chunk: Buffer) => void) | null = null;
  let stderrListener: ((chunk: Buffer) => void) | null = null;
  const detachOutputListeners = () => {
    if (stdoutListener) {
      child.stdout?.off("data", stdoutListener);
      stdoutListener = null;
    }
    if (stderrListener) {
      child.stderr?.off("data", stderrListener);
      stderrListener = null;
    }
  };
  const clearRunTimers = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (hardTimer) {
      clearTimeout(hardTimer);
      hardTimer = null;
    }
  };
  const triggerTimeout = (kind: "idle" | "hard") => {
    if (finished) return;
    finished = true;
    clearRunTimers();
    const timeoutMs = kind === "idle" ? TASK_RUN_IDLE_TIMEOUT_MS : TASK_RUN_HARD_TIMEOUT_MS;
    const reason = kind === "idle"
      ? `no output for ${Math.round(timeoutMs / 1000)}s`
      : `exceeded max runtime ${Math.round(timeoutMs / 1000)}s`;
    const msg = `[Claw-Empire] RUN TIMEOUT (${reason})`;
    safeWrite(`\n${msg}\n`);
    appendTaskLog(taskId, "error", msg);
    try {
      if (child.pid && child.pid > 0) {
        killPidTree(child.pid);
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // ignore kill race
    }
  };
  const touchIdleTimer = () => {
    if (finished || TASK_RUN_IDLE_TIMEOUT_MS <= 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => triggerTimeout("idle"), TASK_RUN_IDLE_TIMEOUT_MS);
  };

  touchIdleTimer();
  if (TASK_RUN_HARD_TIMEOUT_MS > 0) {
    hardTimer = setTimeout(() => triggerTimeout("hard"), TASK_RUN_HARD_TIMEOUT_MS);
  }

  activeProcesses.set(taskId, child);

  child.on("error", (err) => {
    finished = true;
    clearRunTimers();
    detachOutputListeners();
    console.error(`[Claw-Empire] spawn error for ${provider} (task ${taskId}): ${err.message}`);
    safeWrite(`\n[Claw-Empire] SPAWN ERROR: ${err.message}\n`);
    safeEnd();
    activeProcesses.delete(taskId);
    appendTaskLog(taskId, "error", `Agent spawn failed: ${err.message}`);
  });

  // Deliver prompt via stdin (cross-platform safe)
  child.stdin?.write(prompt);
  child.stdin?.end();

  // Pipe agent output to log file AND broadcast via WebSocket
  stdoutListener = (chunk: Buffer) => {
    touchIdleTimer();
    const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
    if (!text) return;
    if (shouldSkipDuplicateCliOutput(taskId, "stdout", text)) return;
    safeWrite(text);
    broadcast("cli_output", { task_id: taskId, stream: "stdout", data: text });
    parseAndCreateSubtasks(taskId, text);
  };
  stderrListener = (chunk: Buffer) => {
    touchIdleTimer();
    const text = normalizeStreamChunk(chunk, { dropCliNoise: true });
    if (!text) return;
    if (shouldSkipDuplicateCliOutput(taskId, "stderr", text)) return;
    safeWrite(text);
    broadcast("cli_output", { task_id: taskId, stream: "stderr", data: text });
  };
  child.stdout?.on("data", stdoutListener);
  child.stderr?.on("data", stderrListener);

  child.on("close", () => {
    finished = true;
    clearRunTimers();
    detachOutputListeners();
    safeEnd();
    try { fs.unlinkSync(promptPath); } catch { /* ignore */ }
  });

  if (process.platform !== "win32") child.unref();

  return child;
}

const workflowAgentProviders = initializeWorkflowAgentProviders(Object.assign(
  Object.create(__ctx),
  {
    createSubtaskFromCli,
    completeSubtaskFromCli,
  },
));
const {
  httpAgentCounter,
  cachedModels,
  MODELS_CACHE_TTL,
  normalizeOAuthProvider,
  getNextOAuthLabel,
  getOAuthAccounts,
  getPreferredOAuthAccounts,
  getDecryptedOAuthToken,
  getProviderModelConfig,
  refreshGoogleToken,
  executeCopilotAgent,
  executeAntigravityAgent,
  launchHttpAgent,
  killPidTree,
  isPidAlive,
  interruptPidTree,
  appendTaskLog,
  cachedCliStatus,
  CLI_STATUS_TTL,
  fetchClaudeUsage,
  fetchCodexUsage,
  fetchGeminiUsage,
  CLI_TOOLS,
  execWithTimeout,
  detectAllCli,
} = workflowAgentProviders;

  return {
    analyzeSubtaskDepartment,
    seedApprovedPlanSubtasks,
    seedReviewRevisionSubtasks,
    codexThreadToSubtask,
    spawnCliAgent,
    httpAgentCounter,
    cachedModels,
    MODELS_CACHE_TTL,
    normalizeOAuthProvider,
    getNextOAuthLabel,
    getOAuthAccounts,
    getPreferredOAuthAccounts,
    getDecryptedOAuthToken,
    getProviderModelConfig,
    refreshGoogleToken,
    executeCopilotAgent,
    executeAntigravityAgent,
    launchHttpAgent,
    killPidTree,
    isPidAlive,
    interruptPidTree,
    appendTaskLog,
    cachedCliStatus,
    CLI_STATUS_TTL,
    fetchClaudeUsage,
    fetchCodexUsage,
    fetchGeminiUsage,
    CLI_TOOLS,
    execWithTimeout,
    detectAllCli,
  };
}
