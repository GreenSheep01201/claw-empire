// @ts-nocheck

import type { RuntimeContext, WorkflowCoreExports } from "../../types/runtime-context.ts";
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
import {
  compactMeetingPromptText,
  formatMeetingTranscriptForPrompt,
  type MeetingTranscriptLine,
} from "./meeting-prompt-utils.ts";

export function initializeWorkflowPartA(ctx: RuntimeContext): WorkflowCoreExports {
  const __ctx: RuntimeContext = ctx;
  const db = __ctx.db;
  const ensureOAuthActiveAccount = __ctx.ensureOAuthActiveAccount;
  const getActiveOAuthAccountIds = __ctx.getActiveOAuthAccountIds;
  const logsDir = __ctx.logsDir;
  const nowMs = __ctx.nowMs;
  const CLI_STATUS_TTL = __ctx.CLI_STATUS_TTL;
  const CLI_TOOLS = __ctx.CLI_TOOLS;
  const MODELS_CACHE_TTL = __ctx.MODELS_CACHE_TTL;
  const analyzeSubtaskDepartment = __ctx.analyzeSubtaskDepartment;
  const appendTaskLog = (...args: any[]) => __ctx.appendTaskLog(...args);
  const cachedCliStatus = __ctx.cachedCliStatus;
  const cachedModels = __ctx.cachedModels;
  const clearTaskWorkflowState = __ctx.clearTaskWorkflowState;
  const crossDeptNextCallbacks = __ctx.crossDeptNextCallbacks;
  const delegatedTaskToSubtask = __ctx.delegatedTaskToSubtask;
  const detectAllCli = __ctx.detectAllCli;
  const endTaskExecutionSession = __ctx.endTaskExecutionSession;
  const ensureTaskExecutionSession = __ctx.ensureTaskExecutionSession;
  const execWithTimeout = __ctx.execWithTimeout;
  const fetchClaudeUsage = __ctx.fetchClaudeUsage;
  const fetchCodexUsage = __ctx.fetchCodexUsage;
  const fetchGeminiUsage = __ctx.fetchGeminiUsage;
  const finishReview = __ctx.finishReview;
  const getDecryptedOAuthToken = __ctx.getDecryptedOAuthToken;
  const getNextOAuthLabel = __ctx.getNextOAuthLabel;
  const getOAuthAccounts = __ctx.getOAuthAccounts;
  const getPreferredOAuthAccounts = __ctx.getPreferredOAuthAccounts;
  const getProviderModelConfig = (...args: any[]) => __ctx.getProviderModelConfig(...args);
  const handleTaskRunComplete = (...args: any[]) => __ctx.handleTaskRunComplete(...args);
  const httpAgentCounter = __ctx.httpAgentCounter;
  const interruptPidTree = __ctx.interruptPidTree;
  const isAgentInMeeting = __ctx.isAgentInMeeting;
  const isPidAlive = __ctx.isPidAlive;
  const isTaskWorkflowInterrupted = __ctx.isTaskWorkflowInterrupted;
  const killPidTree = (...args: any[]) => __ctx.killPidTree(...args);
  const launchHttpAgent = __ctx.launchHttpAgent;
  const meetingPhaseByAgent = __ctx.meetingPhaseByAgent;
  const meetingPresenceUntil = __ctx.meetingPresenceUntil;
  const meetingReviewDecisionByAgent = __ctx.meetingReviewDecisionByAgent;
  const meetingSeatIndexByAgent = __ctx.meetingSeatIndexByAgent;
  const meetingTaskIdByAgent = __ctx.meetingTaskIdByAgent;
  const normalizeOAuthProvider = __ctx.normalizeOAuthProvider;
  const notifyCeo = (...args: any[]) => __ctx.notifyCeo(...args);
  const refreshGoogleToken = __ctx.refreshGoogleToken;
  const seedApprovedPlanSubtasks = __ctx.seedApprovedPlanSubtasks;
  const spawnCliAgent = __ctx.spawnCliAgent;
  const startPlannedApprovalMeeting = __ctx.startPlannedApprovalMeeting;
  const startProgressTimer = __ctx.startProgressTimer;
  const startTaskExecutionForAgent = __ctx.startTaskExecutionForAgent;
  const stopProgressTimer = __ctx.stopProgressTimer;
  const subtaskDelegationCallbacks = __ctx.subtaskDelegationCallbacks;
  const subtaskDelegationCompletionNoticeSent = __ctx.subtaskDelegationCompletionNoticeSent;
  const subtaskDelegationDispatchInFlight = __ctx.subtaskDelegationDispatchInFlight;
  const taskExecutionSessions = __ctx.taskExecutionSessions;
  const findExplicitDepartmentByMention = __ctx.findExplicitDepartmentByMention;
  const plannerSubtaskRoutingInFlight = __ctx.plannerSubtaskRoutingInFlight;
  const normalizeDeptAliasToken = __ctx.normalizeDeptAliasToken;
  const normalizePlannerTargetDeptId = __ctx.normalizePlannerTargetDeptId;
  const parsePlannerSubtaskAssignments = __ctx.parsePlannerSubtaskAssignments;
  const rerouteSubtasksByPlanningLeader = __ctx.rerouteSubtasksByPlanningLeader;
  const createSubtaskFromCli = __ctx.createSubtaskFromCli;
  const completeSubtaskFromCli = __ctx.completeSubtaskFromCli;
  const seedReviewRevisionSubtasks = __ctx.seedReviewRevisionSubtasks;
  const codexThreadToSubtask = __ctx.codexThreadToSubtask;
  const parseAndCreateSubtasks = __ctx.parseAndCreateSubtasks;
  const ANTIGRAVITY_ENDPOINTS = __ctx.ANTIGRAVITY_ENDPOINTS;
  const ANTIGRAVITY_DEFAULT_PROJECT = __ctx.ANTIGRAVITY_DEFAULT_PROJECT;
  const copilotTokenCache = __ctx.copilotTokenCache;
  const antigravityProjectCache = __ctx.antigravityProjectCache;
  const oauthProviderPrefix = __ctx.oauthProviderPrefix;
  const getOAuthAccountDisplayName = __ctx.getOAuthAccountDisplayName;
  const getOAuthAutoSwapEnabled = __ctx.getOAuthAutoSwapEnabled;
  const oauthDispatchCursor = __ctx.oauthDispatchCursor;
  const rotateOAuthAccounts = __ctx.rotateOAuthAccounts;
  const prioritizeOAuthAccount = __ctx.prioritizeOAuthAccount;
  const markOAuthAccountFailure = __ctx.markOAuthAccountFailure;
  const markOAuthAccountSuccess = __ctx.markOAuthAccountSuccess;
  const exchangeCopilotToken = __ctx.exchangeCopilotToken;
  const loadCodeAssistProject = __ctx.loadCodeAssistProject;
  const parseHttpAgentSubtasks = __ctx.parseHttpAgentSubtasks;
  const parseSSEStream = __ctx.parseSSEStream;
  const parseGeminiSSEStream = __ctx.parseGeminiSSEStream;
  const resolveCopilotModel = __ctx.resolveCopilotModel;
  const resolveAntigravityModel = __ctx.resolveAntigravityModel;
  const executeCopilotAgent = (...args: any[]) => __ctx.executeCopilotAgent(...args);
  const executeAntigravityAgent = (...args: any[]) => __ctx.executeAntigravityAgent(...args);
  const executeApiProviderAgent = (...args: any[]) => __ctx.executeApiProviderAgent(...args);
  const jsonHasKey = __ctx.jsonHasKey;
  const fileExistsNonEmpty = __ctx.fileExistsNonEmpty;
  const readClaudeToken = __ctx.readClaudeToken;
  const readCodexTokens = __ctx.readCodexTokens;
  const GEMINI_OAUTH_CLIENT_ID = __ctx.GEMINI_OAUTH_CLIENT_ID;
  const GEMINI_OAUTH_CLIENT_SECRET = __ctx.GEMINI_OAUTH_CLIENT_SECRET;
  const readGeminiCredsFromKeychain = __ctx.readGeminiCredsFromKeychain;
  const readGeminiCredsFromFile = __ctx.readGeminiCredsFromFile;
  const readGeminiCreds = __ctx.readGeminiCreds;
  const freshGeminiToken = __ctx.freshGeminiToken;
  const geminiProjectCache = __ctx.geminiProjectCache;
  const GEMINI_PROJECT_TTL = __ctx.GEMINI_PROJECT_TTL;
  const getGeminiProjectId = __ctx.getGeminiProjectId;
  const detectCliTool = __ctx.detectCliTool;
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
  const DEPT_KEYWORDS = new Proxy({}, { get(_target, prop: string) { return (__ctx.DEPT_KEYWORDS ?? {})[prop]; } });
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
// Track active child processes
// ---------------------------------------------------------------------------
const activeProcesses = new Map<string, ChildProcess>();
const stopRequestedTasks = new Set<string>();
const stopRequestModeByTask = new Map<string, "pause" | "cancel">();

function readTimeoutMsEnv(name: string, fallbackMs: number): number {
  return readNonNegativeIntEnv(name, fallbackMs);
}

const TASK_RUN_IDLE_TIMEOUT_MS = readTimeoutMsEnv("TASK_RUN_IDLE_TIMEOUT_MS", 15 * 60_000);
const TASK_RUN_HARD_TIMEOUT_MS = readTimeoutMsEnv("TASK_RUN_HARD_TIMEOUT_MS", 0);

// ---------------------------------------------------------------------------
// Git Worktree support — agent isolation per task
// ---------------------------------------------------------------------------
const taskWorktrees = new Map<string, {
  worktreePath: string;
  branchName: string;
  projectPath: string; // original project path
}>();

function isGitRepo(dir: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir, stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function createWorktree(projectPath: string, taskId: string, agentName: string): string | null {
  if (!isGitRepo(projectPath)) return null;

  const shortId = taskId.slice(0, 8);
  const branchName = `climpire/${shortId}`;
  const worktreeBase = path.join(projectPath, ".climpire-worktrees");
  const worktreePath = path.join(worktreeBase, shortId);

  try {
    fs.mkdirSync(worktreeBase, { recursive: true });

    // Get current branch/HEAD as base
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectPath, stdio: "pipe", timeout: 5000 }).toString().trim();

    // Create worktree with new branch
    execFileSync("git", ["worktree", "add", worktreePath, "-b", branchName, base], {
      cwd: projectPath,
      stdio: "pipe",
      timeout: 15000,
    });

    taskWorktrees.set(taskId, { worktreePath, branchName, projectPath });
    console.log(`[Claw-Empire] Created worktree for task ${shortId}: ${worktreePath} (branch: ${branchName}, agent: ${agentName})`);
    return worktreePath;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Claw-Empire] Failed to create worktree for task ${shortId}: ${msg}`);
    return null;
  }
}

const DIFF_SUMMARY_NONE = "__DIFF_NONE__";
const DIFF_SUMMARY_ERROR = "__DIFF_ERROR__";

function hasVisibleDiffSummary(summary: string): boolean {
  return Boolean(summary && summary !== DIFF_SUMMARY_NONE && summary !== DIFF_SUMMARY_ERROR);
}

function mergeWorktree(projectPath: string, taskId: string): { success: boolean; message: string; conflicts?: string[] } {
  const info = taskWorktrees.get(taskId);
  if (!info) return { success: false, message: "No worktree found for this task" };
  const taskRow = db.prepare("SELECT title, description FROM tasks WHERE id = ?").get(taskId) as {
    title: string;
    description: string | null;
  } | undefined;
  const lang = resolveLang(taskRow?.description ?? taskRow?.title);

  try {
    // Get current branch name in the original repo
    const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectPath, stdio: "pipe", timeout: 5000,
    }).toString().trim();

    // Check if there are actual changes to merge
    try {
      const diffCheck = execFileSync("git", ["diff", `${currentBranch}...${info.branchName}`, "--stat"], {
        cwd: projectPath, stdio: "pipe", timeout: 10000,
      }).toString().trim();
      if (!diffCheck) {
        return {
          success: true,
          message: pickL(l(
            ["변경사항이 없어 병합이 필요하지 않습니다."],
            ["No changes to merge."],
            ["マージする変更がありません。"],
            ["没有可合并的更改。"],
          ), lang),
        };
      }
    } catch { /* proceed with merge attempt anyway */ }

    // Attempt merge with no-ff
    const mergeMsg = `Merge climpire task ${taskId.slice(0, 8)} (branch ${info.branchName})`;
    execFileSync("git", ["merge", info.branchName, "--no-ff", "-m", mergeMsg], {
      cwd: projectPath, stdio: "pipe", timeout: 30000,
    });

    return {
      success: true,
      message: pickL(l(
        [`병합 완료: ${info.branchName} → ${currentBranch}`],
        [`Merge completed: ${info.branchName} -> ${currentBranch}`],
        [`マージ完了: ${info.branchName} -> ${currentBranch}`],
        [`合并完成: ${info.branchName} -> ${currentBranch}`],
      ), lang),
    };
  } catch (err: unknown) {
    // Detect conflicts by checking git status instead of parsing error messages
    try {
      const unmerged = execFileSync("git", ["diff", "--name-only", "--diff-filter=U"], {
        cwd: projectPath, stdio: "pipe", timeout: 5000,
      }).toString().trim();
      const conflicts = unmerged ? unmerged.split("\n").filter(Boolean) : [];

      if (conflicts.length > 0) {
        // Abort the failed merge
        try { execFileSync("git", ["merge", "--abort"], { cwd: projectPath, stdio: "pipe", timeout: 5000 }); } catch { /* ignore */ }

        return {
          success: false,
          message: pickL(l(
            [`병합 충돌 발생: ${conflicts.length}개 파일에서 충돌이 있습니다. 수동 해결이 필요합니다.`],
            [`Merge conflict: ${conflicts.length} file(s) have conflicts and need manual resolution.`],
            [`マージ競合: ${conflicts.length}件のファイルで競合が発生し、手動解決が必要です。`],
            [`合并冲突：${conflicts.length} 个文件存在冲突，需要手动解决。`],
          ), lang),
          conflicts,
        };
      }
    } catch { /* ignore conflict detection failure */ }

    // Abort any partial merge
    try { execFileSync("git", ["merge", "--abort"], { cwd: projectPath, stdio: "pipe", timeout: 5000 }); } catch { /* ignore */ }

    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: pickL(l(
        [`병합 실패: ${msg}`],
        [`Merge failed: ${msg}`],
        [`マージ失敗: ${msg}`],
        [`合并失败: ${msg}`],
      ), lang),
    };
  }
}

function cleanupWorktree(projectPath: string, taskId: string): void {
  const info = taskWorktrees.get(taskId);
  if (!info) return;

  const shortId = taskId.slice(0, 8);

  try {
    // Remove worktree
    execFileSync("git", ["worktree", "remove", info.worktreePath, "--force"], {
      cwd: projectPath, stdio: "pipe", timeout: 10000,
    });
  } catch {
    // If worktree remove fails, try manual cleanup
    console.warn(`[Claw-Empire] git worktree remove failed for ${shortId}, falling back to manual cleanup`);
    try {
      if (fs.existsSync(info.worktreePath)) {
        fs.rmSync(info.worktreePath, { recursive: true, force: true });
      }
      execFileSync("git", ["worktree", "prune"], { cwd: projectPath, stdio: "pipe", timeout: 5000 });
    } catch { /* ignore */ }
  }

  try {
    // Delete branch
    execFileSync("git", ["branch", "-D", info.branchName], {
      cwd: projectPath, stdio: "pipe", timeout: 5000,
    });
  } catch {
    console.warn(`[Claw-Empire] Failed to delete branch ${info.branchName} — may need manual cleanup`);
  }

  taskWorktrees.delete(taskId);
  console.log(`[Claw-Empire] Cleaned up worktree for task ${shortId}`);
}

function rollbackTaskWorktree(taskId: string, reason: string): boolean {
  const info = taskWorktrees.get(taskId);
  if (!info) return false;

  const diffSummary = getWorktreeDiffSummary(info.projectPath, taskId);
  if (hasVisibleDiffSummary(diffSummary)) {
    appendTaskLog(taskId, "system", `Rollback(${reason}) diff summary:\n${diffSummary}`);
  }

  cleanupWorktree(info.projectPath, taskId);
  appendTaskLog(taskId, "system", `Worktree rollback completed (${reason})`);
  return true;
}

function getWorktreeDiffSummary(projectPath: string, taskId: string): string {
  const info = taskWorktrees.get(taskId);
  if (!info) return "";

  try {
    // Get current branch in original repo
    const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectPath, stdio: "pipe", timeout: 5000,
    }).toString().trim();

    const stat = execFileSync("git", ["diff", `${currentBranch}...${info.branchName}`, "--stat"], {
      cwd: projectPath, stdio: "pipe", timeout: 10000,
    }).toString().trim();

    return stat || DIFF_SUMMARY_NONE;
  } catch {
    return DIFF_SUMMARY_ERROR;
  }
}

const MVP_CODE_REVIEW_POLICY_BASE_LINES = [
  "[MVP Code Review Policy / 코드 리뷰 정책]",
  "- CRITICAL/HIGH: fix immediately / 즉시 수정",
  "- MEDIUM/LOW: warning report only, no code changes / 경고 보고서만, 코드 수정 금지",
];
const EXECUTION_CONTINUITY_POLICY_LINES = [
  "[Execution Continuity / 실행 연속성]",
  "- Continue from the latest state without self-introduction or kickoff narration / 자기소개·착수 멘트 없이 최신 상태에서 바로 이어서 작업",
  "- Reuse prior codebase understanding and read only files needed for this delta / 기존 코드베이스 이해를 재사용하고 이번 변경에 필요한 파일만 확인",
  "- Focus on unresolved checklist items and produce concrete diffs first / 미해결 체크리스트 중심으로 즉시 코드 변경부터 진행",
];

const WARNING_FIX_OVERRIDE_LINE = "- Exception override: User explicitly requested warning-level fixes for this task. You may fix the requested MEDIUM/LOW items / 예외: 이 작업에서 사용자 요청 시 MEDIUM/LOW도 해당 요청 범위 내에서 수정 가능";

function hasExplicitWarningFixRequest(...textParts: Array<string | null | undefined>): boolean {
  const text = textParts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join("\n");
  if (!text) return false;
  if (/\[(ALLOW_WARNING_FIX|WARN_FIX)\]/i.test(text)) return true;

  const requestHint = /\b(please|can you|need to|must|should|fix this|fix these|resolve this|address this|fix requested|warning fix)\b|해줘|해주세요|수정해|수정해야|고쳐|고쳐줘|해결해|반영해|조치해|수정 요청/i;
  if (!requestHint.test(text)) return false;

  const warningFixPair = /\b(fix|resolve|address|patch|remediate|correct)\b[\s\S]{0,60}\b(warning|warnings|medium|low|minor|non-critical|lint)\b|\b(warning|warnings|medium|low|minor|non-critical|lint)\b[\s\S]{0,60}\b(fix|resolve|address|patch|remediate|correct)\b|(?:경고|워닝|미디엄|로우|마이너|사소|비치명|린트)[\s\S]{0,40}(?:수정|고쳐|해결|반영|조치)|(?:수정|고쳐|해결|반영|조치)[\s\S]{0,40}(?:경고|워닝|미디엄|로우|마이너|사소|비치명|린트)/i;
  return warningFixPair.test(text);
}

function buildMvpCodeReviewPolicyBlock(allowWarningFix: boolean): string {
  const lines = [...MVP_CODE_REVIEW_POLICY_BASE_LINES];
  if (allowWarningFix) lines.push(WARNING_FIX_OVERRIDE_LINE);
  return lines.join("\n");
}

function buildTaskExecutionPrompt(
  parts: Array<string | null | undefined>,
  opts: { allowWarningFix?: boolean } = {},
): string {
  return [
    ...parts,
    EXECUTION_CONTINUITY_POLICY_LINES.join("\n"),
    buildMvpCodeReviewPolicyBlock(Boolean(opts.allowWarningFix)),
  ].filter(Boolean).join("\n");
}

type PromptSkillProvider = "claude" | "codex" | "gemini" | "opencode" | "copilot" | "antigravity" | "api";

const SKILL_PROMPT_FETCH_LIMIT = 8;
const SKILL_PROMPT_INLINE_LIMIT = 4;

function isPromptSkillProvider(provider: string): provider is PromptSkillProvider {
  return provider === "claude"
    || provider === "codex"
    || provider === "gemini"
    || provider === "opencode"
    || provider === "copilot"
    || provider === "antigravity"
    || provider === "api";
}

function getPromptSkillProviderDisplayName(provider: string): string {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  if (provider === "opencode") return "OpenCode";
  if (provider === "copilot") return "GitHub Copilot";
  if (provider === "antigravity") return "Antigravity";
  if (provider === "api") return "API Provider";
  return provider || "unknown";
}

function clipPromptSkillLabel(label: string, maxLength = 48): string {
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatPromptSkillTag(repo: string, skillId: string, skillLabel: string): string {
  const fallback = skillId ? `${repo}#${skillId}` : repo;
  const source = skillLabel || fallback;
  const clipped = clipPromptSkillLabel(source);
  return clipped ? `[${clipped}]` : "";
}

function queryPromptSkillsByProvider(provider: PromptSkillProvider, limit: number): Array<{
  repo: string;
  skill_id: string;
  skill_label: string;
  learned_at: number;
}> {
  return db.prepare(`
    SELECT
      repo,
      skill_id,
      skill_label,
      MAX(COALESCE(run_completed_at, updated_at, created_at)) AS learned_at
    FROM skill_learning_history
    WHERE status = 'succeeded' AND provider = ?
    GROUP BY repo, skill_id, skill_label
    ORDER BY learned_at DESC
    LIMIT ?
  `).all(provider, limit) as Array<{
    repo: string;
    skill_id: string;
    skill_label: string;
    learned_at: number;
  }>;
}

function queryPromptSkillsGlobal(limit: number): Array<{
  repo: string;
  skill_id: string;
  skill_label: string;
  learned_at: number;
}> {
  return db.prepare(`
    SELECT
      repo,
      skill_id,
      skill_label,
      MAX(COALESCE(run_completed_at, updated_at, created_at)) AS learned_at
    FROM skill_learning_history
    WHERE status = 'succeeded'
    GROUP BY repo, skill_id, skill_label
    ORDER BY learned_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    repo: string;
    skill_id: string;
    skill_label: string;
    learned_at: number;
  }>;
}

function formatPromptSkillTagLine(rows: Array<{ repo: string; skill_id: string; skill_label: string }>): string {
  const tags = rows
    .map((row) => formatPromptSkillTag(row.repo, row.skill_id, row.skill_label))
    .filter(Boolean);
  if (tags.length === 0) return "[none]";
  const inlineCount = Math.min(tags.length, SKILL_PROMPT_INLINE_LIMIT);
  const inline = tags.slice(0, inlineCount).join("");
  const overflow = tags.length - inlineCount;
  return overflow > 0 ? `${inline}[+${overflow} more]` : inline;
}

function buildAvailableSkillsPromptBlock(provider: string): string {
  const providerDisplay = getPromptSkillProviderDisplayName(provider);
  try {
    const providerKey = isPromptSkillProvider(provider) ? provider : null;
    const providerSkills = providerKey ? queryPromptSkillsByProvider(providerKey, SKILL_PROMPT_FETCH_LIMIT) : [];
    if (providerSkills.length > 0) {
      return [
        `[Available Skills][provider=${providerDisplay}]${formatPromptSkillTagLine(providerSkills)}`,
        "[Skills Rule] Use provider-matched skills first when relevant.",
      ].join("\n");
    }

    const fallbackSkills = queryPromptSkillsGlobal(SKILL_PROMPT_FETCH_LIMIT);
    if (fallbackSkills.length > 0) {
      return [
        `[Available Skills][provider=${providerDisplay}][fallback=global]${formatPromptSkillTagLine(fallbackSkills)}`,
        "[Skills Rule] No provider-specific history yet. Use global learned skills when relevant.",
      ].join("\n");
    }

    return [
      `[Available Skills][provider=${providerDisplay}][none]`,
      "[Skills Rule] No learned skills recorded yet.",
    ].join("\n");
  } catch {
    return `[Available Skills][provider=${providerDisplay}][unavailable]`;
  }
}

// ---------------------------------------------------------------------------
// Project context generation (token-saving: static analysis, cached by git HEAD)
// ---------------------------------------------------------------------------

const CONTEXT_IGNORE_DIRS = new Set([
  "node_modules", "dist", "build", ".next", ".nuxt", "out", "__pycache__",
  ".git", ".climpire-worktrees", ".climpire", "vendor", ".venv", "venv",
  "coverage", ".cache", ".turbo", ".parcel-cache", "target", "bin", "obj",
]);

const CONTEXT_IGNORE_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
  ".DS_Store", "Thumbs.db",
]);

function buildFileTree(dir: string, prefix = "", depth = 0, maxDepth = 4): string[] {
  if (depth >= maxDepth) return [`${prefix}...`];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries = entries
    .filter(e => !e.isSymbolicLink())
    .filter(e => !e.name.startsWith(".") || e.name === ".env.example")
    .filter(e => !CONTEXT_IGNORE_DIRS.has(e.name) && !CONTEXT_IGNORE_FILES.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    if (e.isDirectory()) {
      lines.push(`${prefix}${connector}${e.name}/`);
      lines.push(...buildFileTree(path.join(dir, e.name), prefix + childPrefix, depth + 1, maxDepth));
    } else {
      lines.push(`${prefix}${connector}${e.name}`);
    }
  }
  return lines;
}

function detectTechStack(projectPath: string): string[] {
  const stack: string[] = [];
  try {
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const sv = (v: unknown) => String(v ?? "").replace(/[\n\r]/g, "").slice(0, 20);
      if (allDeps.react) stack.push(`React ${sv(allDeps.react)}`);
      if (allDeps.next) stack.push(`Next.js ${sv(allDeps.next)}`);
      if (allDeps.vue) stack.push(`Vue ${sv(allDeps.vue)}`);
      if (allDeps.svelte) stack.push("Svelte");
      if (allDeps.express) stack.push("Express");
      if (allDeps.fastify) stack.push("Fastify");
      if (allDeps.typescript) stack.push("TypeScript");
      if (allDeps.tailwindcss) stack.push("Tailwind CSS");
      if (allDeps.vite) stack.push("Vite");
      if (allDeps.webpack) stack.push("Webpack");
      if (allDeps.prisma || allDeps["@prisma/client"]) stack.push("Prisma");
      if (allDeps.drizzle) stack.push("Drizzle");
      const runtime = pkg.engines?.node ? `Node.js ${sv(pkg.engines.node)}` : "Node.js";
      if (!stack.some(s => s.startsWith("Node"))) stack.unshift(runtime);
    }
  } catch { /* ignore parse errors */ }
  try { if (fs.existsSync(path.join(projectPath, "requirements.txt"))) stack.push("Python"); } catch {}
  try { if (fs.existsSync(path.join(projectPath, "go.mod"))) stack.push("Go"); } catch {}
  try { if (fs.existsSync(path.join(projectPath, "Cargo.toml"))) stack.push("Rust"); } catch {}
  try { if (fs.existsSync(path.join(projectPath, "pom.xml"))) stack.push("Java (Maven)"); } catch {}
  try { if (fs.existsSync(path.join(projectPath, "build.gradle")) || fs.existsSync(path.join(projectPath, "build.gradle.kts"))) stack.push("Java (Gradle)"); } catch {}
  return stack;
}

function getKeyFiles(projectPath: string): string[] {
  const keyPatterns = [
    "package.json", "tsconfig.json", "vite.config.ts", "vite.config.js",
    "next.config.js", "next.config.ts", "webpack.config.js",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".env.example", "Makefile", "CMakeLists.txt",
  ];
  const result: string[] = [];

  // Key config files
  for (const p of keyPatterns) {
    const fullPath = path.join(projectPath, p);
    try {
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        result.push(`${p} (${stat.size} bytes)`);
      }
    } catch {}
  }

  // Key source directories - count files
  const srcDirs = ["src", "server", "app", "lib", "pages", "components", "api"];
  for (const d of srcDirs) {
    const dirPath = path.join(projectPath, d);
    try {
      if (fs.statSync(dirPath).isDirectory()) {
        let count = 0;
        const countFiles = (dir: string, depth = 0) => {
          if (depth > 10) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            if (CONTEXT_IGNORE_DIRS.has(e.name) || e.isSymbolicLink()) continue;
            if (e.isDirectory()) countFiles(path.join(dir, e.name), depth + 1);
            else count++;
          }
        };
        countFiles(dirPath);
        result.push(`${d}/ (${count} files)`);
      }
    } catch {}
  }

  return result;
}

function generateProjectContext(projectPath: string): string {
  const climpireDir = path.join(projectPath, ".climpire");
  const contextPath = path.join(climpireDir, "project-context.md");
  const metaPath = path.join(climpireDir, "project-context.meta");

  // Cache check: compare git HEAD
  if (isGitRepo(projectPath)) {
    try {
      const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: projectPath, stdio: "pipe", timeout: 5000,
      }).toString().trim();

      if (fs.existsSync(metaPath) && fs.existsSync(contextPath)) {
        const cachedHead = fs.readFileSync(metaPath, "utf8").trim();
        if (cachedHead === currentHead) {
          return fs.readFileSync(contextPath, "utf8");
        }
      }

      // Generate fresh context
      const content = buildProjectContextContent(projectPath);

      // Write cache
      fs.mkdirSync(climpireDir, { recursive: true });
      fs.writeFileSync(contextPath, content, "utf8");
      fs.writeFileSync(metaPath, currentHead, "utf8");
      console.log(`[Claw-Empire] Generated project context: ${contextPath}`);
      return content;
    } catch (err) {
      console.warn(`[Claw-Empire] Failed to generate project context: ${err}`);
    }
  }

  // Non-git project: TTL-based caching (5 minutes)
  try {
    if (fs.existsSync(contextPath)) {
      const stat = fs.statSync(contextPath);
      if (Date.now() - stat.mtimeMs < 5 * 60 * 1000) {
        return fs.readFileSync(contextPath, "utf8");
      }
    }
    const content = buildProjectContextContent(projectPath);
    fs.mkdirSync(climpireDir, { recursive: true });
    fs.writeFileSync(contextPath, content, "utf8");
    return content;
  } catch {
    return "";
  }
}

function buildProjectContextContent(projectPath: string): string {
  const sections: string[] = [];
  const projectName = path.basename(projectPath);

  sections.push(`# Project: ${projectName}\n`);

  // Tech stack
  const techStack = detectTechStack(projectPath);
  if (techStack.length) {
    sections.push(`## Tech Stack\n${techStack.join(", ")}\n`);
  }

  // File tree
  const tree = buildFileTree(projectPath);
  if (tree.length) {
    sections.push(`## File Structure\n\`\`\`\n${tree.join("\n")}\n\`\`\`\n`);
  }

  // Key files
  const keyFiles = getKeyFiles(projectPath);
  if (keyFiles.length) {
    sections.push(`## Key Files\n${keyFiles.map(f => `- ${f}`).join("\n")}\n`);
  }

  // README excerpt
  for (const readmeName of ["README.md", "readme.md", "README.rst"]) {
    const readmePath = path.join(projectPath, readmeName);
    try {
      if (fs.existsSync(readmePath)) {
        const lines = fs.readFileSync(readmePath, "utf8").split("\n").slice(0, 20);
        sections.push(`## README (first 20 lines)\n${lines.join("\n")}\n`);
        break;
      }
    } catch {}
  }

  return sections.join("\n");
}

function getRecentChanges(projectPath: string, taskId: string): string {
  const parts: string[] = [];

  // 1. Recent commits (git log --oneline -10)
  if (isGitRepo(projectPath)) {
    try {
      const log = execFileSync("git", ["log", "--oneline", "-10"], {
        cwd: projectPath, stdio: "pipe", timeout: 5000,
      }).toString().trim();
      if (log) parts.push(`### Recent Commits\n${log}`);
    } catch {}

    // 2. Active worktree branch diff stats
    try {
      const worktreeList = execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd: projectPath, stdio: "pipe", timeout: 5000,
      }).toString().trim();

      const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: projectPath, stdio: "pipe", timeout: 5000,
      }).toString().trim();

      const worktreeLines: string[] = [];
      const blocks = worktreeList.split("\n\n");
      for (const block of blocks) {
        const branchMatch = block.match(/branch refs\/heads\/(climpire\/[^\s]+)/);
        if (branchMatch) {
          const branch = branchMatch[1];
          try {
            const stat = execFileSync("git", ["diff", `${currentBranch}...${branch}`, "--stat", "--stat-width=60"], {
              cwd: projectPath, stdio: "pipe", timeout: 5000,
            }).toString().trim();
            if (stat) worktreeLines.push(`  ${branch}:\n${stat}`);
          } catch {}
        }
      }
      if (worktreeLines.length) {
        parts.push(`### Active Worktree Changes (other agents)\n${worktreeLines.join("\n")}`);
      }
    } catch {}
  }

  // 3. Recently completed tasks for this project
  try {
    const recentTasks = db.prepare(`
      SELECT t.id, t.title, a.name AS agent_name, t.updated_at FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.project_path = ? AND t.status = 'done' AND t.id != ?
      ORDER BY t.updated_at DESC LIMIT 3
    `).all(projectPath, taskId) as Array<{
      id: string; title: string; agent_name: string | null; updated_at: number;
    }>;

    if (recentTasks.length) {
      const taskLines = recentTasks.map(t => `- ${t.title} (by ${t.agent_name || "unknown"})`);
      parts.push(`### Recently Completed Tasks\n${taskLines.join("\n")}`);
    }
  } catch {}

  if (!parts.length) return "";
  return parts.join("\n\n");
}

function ensureClaudeMd(projectPath: string, worktreePath: string): void {
  // Don't touch projects that already have CLAUDE.md
  if (fs.existsSync(path.join(projectPath, "CLAUDE.md"))) return;

  const climpireDir = path.join(projectPath, ".climpire");
  const claudeMdSrc = path.join(climpireDir, "CLAUDE.md");
  const claudeMdDst = path.join(worktreePath, "CLAUDE.md");

  // Generate abbreviated CLAUDE.md if not cached
  if (!fs.existsSync(claudeMdSrc)) {
    const techStack = detectTechStack(projectPath);
    const keyFiles = getKeyFiles(projectPath);
    const projectName = path.basename(projectPath);

    const content = [
      `# ${projectName}`,
      "",
      techStack.length ? `**Stack:** ${techStack.join(", ")}` : "",
      "",
      keyFiles.length ? `**Key files:** ${keyFiles.slice(0, 10).join(", ")}` : "",
      "",
      "This file was auto-generated by Claw Empire to provide project context.",
    ].filter(Boolean).join("\n");

    fs.mkdirSync(climpireDir, { recursive: true });
    fs.writeFileSync(claudeMdSrc, content, "utf8");
    console.log(`[Claw-Empire] Generated CLAUDE.md: ${claudeMdSrc}`);
  }

  // Copy to worktree root
  try {
    fs.copyFileSync(claudeMdSrc, claudeMdDst);
  } catch (err) {
    console.warn(`[Claw-Empire] Failed to copy CLAUDE.md to worktree: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// WebSocket setup
// ---------------------------------------------------------------------------
const { wsClients, broadcast } = createWsHub(nowMs);

// ---------------------------------------------------------------------------
// CLI spawn helpers (ported from claw-kanban)
// ---------------------------------------------------------------------------
function buildAgentArgs(provider: string, model?: string, reasoningLevel?: string): string[] {
  switch (provider) {
    case "codex": {
      const args = ["codex", "--enable", "multi_agent"];
      if (model) args.push("-m", model);
      if (reasoningLevel) args.push("-c", `model_reasoning_effort="${reasoningLevel}"`);
      args.push("--yolo", "exec", "--json");
      return args;
    }
    case "claude": {
      const args = [
        "claude",
        "--dangerously-skip-permissions",
        "--print",
        "--verbose",
        "--output-format=stream-json",
        "--include-partial-messages",
        "--max-turns", "200",
      ];
      if (model) args.push("--model", model);
      return args;
    }
    case "gemini": {
      const args = ["gemini"];
      if (model) args.push("-m", model);
      args.push("--yolo", "--output-format=stream-json");
      return args;
    }
    case "opencode": {
      const args = ["opencode", "run"];
      if (model) args.push("-m", model);
      args.push("--format", "json");
      return args;
    }
    case "copilot":
    case "antigravity":
      throw new Error(`${provider} uses HTTP agent (not CLI spawn)`);
    default:
      throw new Error(`unsupported CLI provider: ${provider}`);
  }
}

const ANSI_ESCAPE_REGEX = /\u001b(?:\[[0-?]*[ -/]*[@-~]|][^\u0007]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
const CLI_SPINNER_LINE_REGEX = /^[\s.·•◦○●◌◍◐◓◑◒◉◎|/\\\-⠁-⣿]+$/u;
type CliOutputStream = "stdout" | "stderr";
const cliOutputDedupCache = new Map<string, { normalized: string; ts: number }>();

function shouldSkipDuplicateCliOutput(taskId: string, stream: CliOutputStream, text: string): boolean {
  if (CLI_OUTPUT_DEDUP_WINDOW_MS <= 0) return false;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  const key = `${taskId}:${stream}`;
  const now = nowMs();
  const prev = cliOutputDedupCache.get(key);
  if (prev && prev.normalized === normalized && (now - prev.ts) <= CLI_OUTPUT_DEDUP_WINDOW_MS) {
    cliOutputDedupCache.set(key, { normalized, ts: now });
    return true;
  }
  cliOutputDedupCache.set(key, { normalized, ts: now });
  return false;
}

function clearCliOutputDedup(taskId: string): void {
  const prefix = `${taskId}:`;
  for (const key of cliOutputDedupCache.keys()) {
    if (key.startsWith(prefix)) cliOutputDedupCache.delete(key);
  }
}

function normalizeStreamChunk(
  raw: Buffer | string,
  opts: { dropCliNoise?: boolean } = {},
): string {
  const { dropCliNoise = false } = opts;
  const input = typeof raw === "string" ? raw : raw.toString("utf8");
  const normalized = input
    .replace(ANSI_ESCAPE_REGEX, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  if (!dropCliNoise) return normalized;

  return normalized
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^reading prompt from stdin\.{0,3}$/i.test(trimmed)) return false;
      if (CLI_SPINNER_LINE_REGEX.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function hasStructuredJsonLines(raw: string): boolean {
  return raw.split(/\r?\n/).some((line) => line.trim().startsWith("{"));
}

/** Fetch recent conversation context for an agent to include in spawn prompt */
function getRecentConversationContext(agentId: string, limit = 10): string {
  const msgs = db.prepare(`
    SELECT sender_type, sender_id, content, message_type, created_at
    FROM messages
    WHERE (
      (sender_type = 'ceo' AND receiver_type = 'agent' AND receiver_id = ?)
      OR (sender_type = 'agent' AND sender_id = ?)
      OR (receiver_type = 'all')
    )
    ORDER BY created_at DESC
    LIMIT ?
  `).all(agentId, agentId, limit) as Array<{
    sender_type: string;
    sender_id: string | null;
    content: string;
    message_type: string;
    created_at: number;
  }>;

  if (msgs.length === 0) return "";

  const lines = msgs.reverse().map((m) => {
    const role = m.sender_type === "ceo" ? "CEO" : "Agent";
    const type = m.message_type !== "chat" ? ` [${m.message_type}]` : "";
    return `${role}${type}: ${m.content}`;
  });

  return `\n\n--- Recent conversation context ---\n${lines.join("\n")}\n--- End context ---`;
}

function extractLatestProjectMemoBlock(description: string, maxChars = 1600): string {
  if (!description) return "";
  const marker = "[PROJECT MEMO]";
  const idx = description.lastIndexOf(marker);
  if (idx < 0) return "";
  const block = description.slice(idx)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!block) return "";
  return block.length > maxChars ? `...${block.slice(-maxChars)}` : block;
}

function getTaskContinuationContext(taskId: string): string {
  const runCountRow = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM task_logs
    WHERE task_id = ?
      AND kind = 'system'
      AND message LIKE 'RUN start%'
  `).get(taskId) as { cnt: number } | undefined;
  if ((runCountRow?.cnt ?? 0) === 0) return "";

  const taskRow = db.prepare(
    "SELECT description, result FROM tasks WHERE id = ?"
  ).get(taskId) as { description: string | null; result: string | null } | undefined;

  const latestRunSummary = db.prepare(`
    SELECT message
    FROM task_logs
    WHERE task_id = ?
      AND kind = 'system'
      AND (message LIKE 'RUN completed%' OR message LIKE 'RUN failed%')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as { message: string } | undefined;

  const reviewNotes = db.prepare(`
    SELECT raw_note
    FROM review_revision_history
    WHERE task_id = ?
    ORDER BY first_round DESC, id DESC
    LIMIT 6
  `).all(taskId) as Array<{ raw_note: string }>;

  const latestMeetingNotes = db.prepare(`
    SELECT e.speaker_name, e.content
    FROM meeting_minute_entries e
    JOIN meeting_minutes m ON m.id = e.meeting_id
    WHERE m.task_id = ?
      AND m.meeting_type = 'review'
    ORDER BY m.started_at DESC, m.created_at DESC, e.seq DESC
    LIMIT 4
  `).all(taskId) as Array<{ speaker_name: string; content: string }>;

  const unresolvedLines = reviewNotes
    .map((row) => row.raw_note.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6);

  const meetingLines = latestMeetingNotes
    .map((row) => {
      const clipped = summarizeForMeetingBubble(row.content, 140);
      if (!clipped) return "";
      return `${row.speaker_name}: ${clipped}`;
    })
    .filter(Boolean)
    .reverse()
    .slice(0, 4);

  const memoBlock = extractLatestProjectMemoBlock(taskRow?.description ?? "", 900);
  const normalizedResult = normalizeStreamChunk(taskRow?.result ?? "", { dropCliNoise: true }).trim();
  const resultTail = normalizedResult.length > 900
    ? `...${normalizedResult.slice(-900)}`
    : normalizedResult;

  const lines: string[] = [];
  if (latestRunSummary?.message) lines.push(`Last run: ${latestRunSummary.message}`);
  if (unresolvedLines.length > 0) {
    lines.push("Unresolved checklist:");
    lines.push(...unresolvedLines.map((line) => `- ${line}`));
  }
  if (meetingLines.length > 0) {
    lines.push("Latest review meeting highlights:");
    lines.push(...meetingLines.map((line) => `- ${line}`));
  }
  if (memoBlock) {
    lines.push("Latest project memo excerpt:");
    lines.push(memoBlock);
  }
  if (resultTail) {
    lines.push("Previous run output tail:");
    lines.push(resultTail);
  }
  if (lines.length === 0) return "";

  return `\n\n--- Continuation brief (same owner, same task) ---\n${lines.join("\n")}\n--- End continuation brief ---`;
}

interface MeetingTranscriptEntry {
  speaker_agent_id?: string;
  speaker: string;
  department: string;
  role: string;
  content: string;
}

interface OneShotRunOptions {
  projectPath?: string;
  timeoutMs?: number;
  streamTaskId?: string | null;
  rawOutput?: boolean;
}

interface OneShotRunResult {
  text: string;
  error?: string;
}

interface MeetingPromptOptions {
  meetingType: "planned" | "review";
  round: number;
  taskTitle: string;
  taskDescription: string | null;
  transcript: MeetingTranscriptEntry[];
  turnObjective: string;
  stanceHint?: string;
  lang: string;
}

type Lang = "ko" | "en" | "ja" | "zh";

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
}

function getAgentDisplayName(agent: AgentRow, lang: string): string {
  return lang === "ko" ? (agent.name_ko || agent.name) : agent.name;
}

function localeInstruction(lang: string): string {
  switch (lang) {
    case "ja":
      return "Respond in Japanese.";
    case "zh":
      return "Respond in Chinese.";
    case "en":
      return "Respond in English.";
    case "ko":
    default:
      return "Respond in Korean.";
  }
}

function normalizeConversationReply(
  raw: string,
  maxChars = 420,
  opts: { maxSentences?: number } = {},
): string {
  if (!raw.trim()) return "";
  const parsed = prettyStreamJson(raw);
  let text = parsed.trim() ? parsed : raw;
  text = text
    .replace(/^\[(init|usage|mcp|thread)\][^\n]*$/gim, "")
    .replace(/^\[reasoning\]\s*/gim, "")
    .replace(/\[(tool|result|output|spawn_agent|agent_done|one-shot-error)[^\]]*\]/gi, " ")
    .replace(/^\[(copilot|antigravity)\][^\n]*$/gim, "")
    .replace(/\b(Crafting|Formulating|Composing|Thinking|Analyzing)\b[^.!?。！？]{0,80}\b(message|reply)\s*/gi, "")
    .replace(/\b(I need to|Let me|I'll|I will|First, I'?ll)\b[^.!?。！？]{0,140}\b(analy[sz]e|examin|inspect|check|review|look at)\b[^.!?。！？]*[.!?。！？]?/gi, " ")
    .replace(/\b(current codebase|relevant files|quickly examine|let me quickly|analyze the current project)\b[^.!?。！？]*[.!?。！？]?/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/(?:^|\s)(find|ls|rg|grep|cat|head|tail|sed|awk|npm|pnpm|yarn|node|git|cd|pwd)\s+[^\n]+/gi, " ")
    .replace(/---+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  // Collapse outputs like "A B A B A B" (same sentence cycle repeated by model stream quirks).
  text = collapseRepeatedSentenceCycles(text);

  const sentenceLimit = typeof opts.maxSentences === "number"
    ? Math.max(0, Math.floor(opts.maxSentences))
    : 2;
  if (sentenceLimit !== 0) {
    const sentenceParts = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const uniqueParts: string[] = [];
    for (const part of sentenceParts) {
      if (!uniqueParts.includes(part)) uniqueParts.push(part);
      if (uniqueParts.length >= sentenceLimit) break;
    }
    if (uniqueParts.length > 0) {
      text = uniqueParts.join(" ");
    }
  }

  if (text.length > maxChars) {
    return `${text.slice(0, maxChars - 1).trimEnd()}…`;
  }
  return text;
}

function collapseRepeatedSentenceCycles(text: string): string {
  const sentences = text
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length < 4) return text;

  const total = sentences.length;
  for (let cycleLen = 1; cycleLen <= Math.floor(total / 2); cycleLen += 1) {
    if (total % cycleLen !== 0) continue;
    const repeatCount = total / cycleLen;
    if (repeatCount < 2) continue;

    const pattern = sentences.slice(0, cycleLen);
    let repeated = true;
    for (let i = cycleLen; i < total; i += 1) {
      if (sentences[i] !== pattern[i % cycleLen]) {
        repeated = false;
        break;
      }
    }
    if (!repeated) continue;

    const collapsed = pattern.join(" ").trim();
    if (collapsed.length >= 24) return collapsed;
  }
  return text;
}

function isInternalWorkNarration(text: string): boolean {
  return /\b(I need to|Let me|I'll|I will|analy[sz]e|examin|inspect|check files|run command|current codebase|relevant files)\b/i.test(text);
}

type ReplyKind = "opening" | "feedback" | "summary" | "approval" | "direct";

function fallbackTurnReply(kind: ReplyKind, lang: string, agent?: AgentRow): string {
  const name = agent ? getAgentDisplayName(agent, lang) : "";
  switch (kind) {
    case "opening":
      if (lang === "en") return `${name}: Kickoff noted. Please share concise feedback in order.`;
      if (lang === "ja") return `${name}: キックオフを開始します。順番に簡潔なフィードバックを共有してください。`;
      if (lang === "zh") return `${name}: 现在开始会议，请各位按顺序简要反馈。`;
      return `${name}: 킥오프 회의를 시작합니다. 순서대로 핵심 피드백을 간단히 공유해주세요.`;
    case "feedback":
      if (lang === "en") return `${name}: We have identified key gaps and a top-priority validation item before execution.`;
      if (lang === "ja") return `${name}: 着手前の補完項目と最優先の検証課題を確認しました。`;
      if (lang === "zh") return `${name}: 已确认执行前的补充项与最高优先验证课题。`;
      return `${name}: 착수 전 보완 항목과 최우선 검증 과제를 확인했습니다.`;
    case "summary":
      if (lang === "en") return `${name}: I will consolidate all leader feedback and proceed with the agreed next step.`;
      if (lang === "ja") return `${name}: 各チームリーダーの意見を統合し、合意した次のステップへ進めます。`;
      if (lang === "zh") return `${name}: 我将汇总各负责人意见，并按约定进入下一步。`;
      return `${name}: 각 팀장 의견을 취합해 합의된 다음 단계로 진행하겠습니다.`;
    case "approval":
      if (lang === "en") return `${name}: Decision noted. We will proceed according to the current meeting conclusion.`;
      if (lang === "ja") return `${name}: 本会議の結論に従って進行します。`;
      if (lang === "zh") return `${name}: 已确认决策，将按本轮会议结论执行。`;
      return `${name}: 본 회의 결론에 따라 진행하겠습니다.`;
    case "direct":
    default:
      if (lang === "en") return `${name}: Acknowledged. Proceeding with the requested direction.`;
      if (lang === "ja") return `${name}: 承知しました。ご指示の方向で進めます。`;
      if (lang === "zh") return `${name}: 收到，将按您的指示推进。`;
      return `${name}: 확인했습니다. 요청하신 방향으로 진행하겠습니다.`;
  }
}

function chooseSafeReply(
  run: OneShotRunResult,
  lang: string,
  kind: ReplyKind,
  agent?: AgentRow,
): string {
  // Direct 1:1 chat replies should preserve longer answers for the chat UI.
  const maxReplyChars = kind === "direct" ? 12000 : 2000;
  const cleaned = normalizeConversationReply(run.text || "", maxReplyChars, { maxSentences: 0 });
  if (!cleaned) return fallbackTurnReply(kind, lang, agent);
  if (/timeout after|CLI 응답 생성에 실패|response failed|one-shot-error/i.test(cleaned)) {
    return fallbackTurnReply(kind, lang, agent);
  }
  if (isInternalWorkNarration(cleaned)) {
    return fallbackTurnReply(kind, lang, agent);
  }
  if ((lang === "ko" || lang === "ja" || lang === "zh") && detectLang(cleaned) === "en" && cleaned.length > 20) {
    return fallbackTurnReply(kind, lang, agent);
  }
  return cleaned;
}

const MEETING_BUBBLE_EMPTY = {
  ko: ["의견 공유드립니다."],
  en: ["Sharing thoughts shortly."],
  ja: ["ご意見を共有します。"],
  zh: ["稍后分享意见。"],
};

// 320 chars is the minimum viable task context (roughly one short paragraph).
const MEETING_PROMPT_TASK_CONTEXT_MAX_CHARS = Math.max(
  320,
  readNonNegativeIntEnv("MEETING_PROMPT_TASK_CONTEXT_MAX_CHARS", 1200),
);
// Keep at least 4 turns so stance changes can still be inferred.
const MEETING_TRANSCRIPT_MAX_TURNS = Math.max(
  4,
  readNonNegativeIntEnv("MEETING_TRANSCRIPT_MAX_TURNS", 12),
);
// 72 chars keeps one concise sentence with role/speaker metadata still readable.
const MEETING_TRANSCRIPT_LINE_MAX_CHARS = Math.max(
  72,
  readNonNegativeIntEnv("MEETING_TRANSCRIPT_LINE_MAX_CHARS", 180),
);
// 720 chars ensures transcript block remains useful while controlling token drift.
const MEETING_TRANSCRIPT_TOTAL_MAX_CHARS = Math.max(
  720,
  readNonNegativeIntEnv("MEETING_TRANSCRIPT_TOTAL_MAX_CHARS", 2400),
);

function compactForMeetingPrompt(text: string, maxChars: number): string {
  return compactMeetingPromptText(text, maxChars);
}

function summarizeForMeetingBubble(text: string, maxChars = 96, lang: Lang = getPreferredLanguage()): string {
  const cleaned = normalizeConversationReply(text, maxChars + 24)
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return pickL(MEETING_BUBBLE_EMPTY, lang);
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 1).trimEnd()}…`;
}

function isMvpDeferralSignal(text: string): boolean {
  return /mvp|범위\s*초과|실환경|프로덕션|production|post[-\s]?merge|post[-\s]?release|안정화\s*단계|stabilization|모니터링|monitoring|sla|체크리스트|checklist|문서화|runbook|후속\s*(개선|처리|모니터링)|defer|deferred|later\s*phase|다음\s*단계|배포\s*후/i
    .test(text);
}

function isHardBlockSignal(text: string): boolean {
  return /최종\s*승인\s*불가|배포\s*불가|절대\s*불가|중단|즉시\s*중단|반려|cannot\s+(approve|ship|release)|must\s+fix\s+before|hard\s+blocker|critical\s+blocker|p0|data\s+loss|security\s+incident|integrity\s+broken|audit\s*fail|build\s*fail|무결성\s*(훼손|깨짐)|데이터\s*손실|보안\s*사고|치명/i
    .test(text);
}

function hasApprovalAgreementSignal(text: string): boolean {
  return /승인|approve|approved|동의|agree|agreed|lgtm|go\s+ahead|merge\s+approve|병합\s*승인|전환\s*동의|조건부\s*승인/i
    .test(text);
}

function isDeferrableReviewHold(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  if (!isMvpDeferralSignal(cleaned)) return false;
  if (isHardBlockSignal(cleaned)) return false;
  return true;
}

function classifyMeetingReviewDecision(text: string): MeetingReviewDecision {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "reviewing";
  const hasApprovalAgreement = hasApprovalAgreementSignal(cleaned);
  const hasMvpDeferral = isMvpDeferralSignal(cleaned);
  const hasHardBlock = isHardBlockSignal(cleaned);
  const hasApprovalSignal = /(승인|통과|문제없|진행.?가능|배포.?가능|approve|approved|lgtm|ship\s+it|go\s+ahead|承認|批准|通过|可发布)/i
    .test(cleaned);
  const hasNoRiskSignal = /(리스크\s*(없|없음|없습니다|없는|없이)|위험\s*(없|없음|없습니다|없는|없이)|문제\s*없|이슈\s*없|no\s+risk|without\s+risk|risk[-\s]?free|no\s+issue|no\s+blocker|リスク(は)?(ありません|なし|無し)|問題ありません|无风险|没有风险|無風險|无问题)/i
    .test(cleaned);
  const hasConditionalOrHoldSignal = /(조건부|보완|수정|보류|리스크|미흡|미완|추가.?필요|재검토|중단|불가|hold|revise|revision|changes?\s+requested|required|pending|risk|block|missing|incomplete|not\s+ready|保留|修正|风险|补充|未完成|暂缓|差し戻し)/i
    .test(cleaned);

  // "No risk / no issue + approval" should not be downgraded to hold.
  if (hasApprovalSignal && hasNoRiskSignal) return "approved";
  if ((hasApprovalAgreement || hasApprovalSignal) && hasMvpDeferral && !hasHardBlock) return "approved";
  if (hasConditionalOrHoldSignal) {
    if ((hasApprovalAgreement || hasApprovalSignal) && hasMvpDeferral && !hasHardBlock) return "approved";
    return "hold";
  }
  if (hasApprovalSignal || hasNoRiskSignal || hasApprovalAgreement) return "approved";
  return "reviewing";
}

function wantsReviewRevision(content: string): boolean {
  return classifyMeetingReviewDecision(content) === "hold";
}

function findLatestTranscriptContentByAgent(
  transcript: MeetingTranscriptEntry[],
  agentId: string,
): string {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const row = transcript[i];
    if (row.speaker_agent_id === agentId) {
      return row.content;
    }
  }
  return "";
}

function compactTaskDescriptionForMeeting(taskDescription: string | null): string {
  if (!taskDescription) return "";
  const marker = "[PROJECT MEMO]";
  const markerIdx = taskDescription.indexOf(marker);
  const base = markerIdx >= 0 ? taskDescription.slice(0, markerIdx) : taskDescription;
  return compactForMeetingPrompt(base, MEETING_PROMPT_TASK_CONTEXT_MAX_CHARS);
}

function formatMeetingTranscript(
  transcript: MeetingTranscriptEntry[],
  lang: Lang = getPreferredLanguage(),
): string {
  const lines: MeetingTranscriptLine[] = transcript.map((row) => ({
    speaker: row.speaker,
    department: row.department,
    role: row.role,
    content: row.content,
  }));

  return formatMeetingTranscriptForPrompt(lines, {
    maxTurns: MEETING_TRANSCRIPT_MAX_TURNS,
    maxLineChars: MEETING_TRANSCRIPT_LINE_MAX_CHARS,
    maxTotalChars: MEETING_TRANSCRIPT_TOTAL_MAX_CHARS,
    summarize: (text, maxChars) => summarizeForMeetingBubble(text, maxChars, lang),
  });
}

function buildMeetingPrompt(agent: AgentRow, opts: MeetingPromptOptions): string {
  const deptName = getDeptName(agent.department_id ?? "");
  const role = getRoleLabel(agent.role, opts.lang as Lang);
  const deptConstraint = agent.department_id ? getDeptRoleConstraint(agent.department_id, deptName) : "";
  const recentCtx = getRecentConversationContext(agent.id, 8);
  const meetingLabel = opts.meetingType === "planned" ? "Planned Approval" : "Review Consensus";
  const compactTaskContext = compactTaskDescriptionForMeeting(opts.taskDescription);
  return [
    `[CEO OFFICE ${meetingLabel}]`,
    `Task: ${opts.taskTitle}`,
    compactTaskContext ? `Task context: ${compactTaskContext}` : "",
    `Round: ${opts.round}`,
    `You are ${getAgentDisplayName(agent, opts.lang)} (${deptName} ${role}).`,
    deptConstraint,
    localeInstruction(opts.lang),
    "Output rules:",
    "- Return one natural chat message only (no JSON, no markdown).",
    "- Keep it concise: 1-3 sentences.",
    "- Make your stance explicit and actionable.",
    opts.stanceHint ? `Required stance: ${opts.stanceHint}` : "",
    `Current turn objective: ${opts.turnObjective}`,
    "",
    "[Meeting transcript so far]",
    formatMeetingTranscript(opts.transcript, opts.lang as Lang),
    recentCtx,
  ].filter(Boolean).join("\n");
}

function buildDirectReplyPrompt(agent: AgentRow, ceoMessage: string, messageType: string): { prompt: string; lang: string } {
  const lang = resolveLang(ceoMessage);
  const deptName = getDeptName(agent.department_id ?? "");
  const role = getRoleLabel(agent.role, lang);
  const deptConstraint = agent.department_id ? getDeptRoleConstraint(agent.department_id, deptName) : "";
  const recentCtx = getRecentConversationContext(agent.id, 12);
  const typeHint = messageType === "report"
    ? "CEO requested a report update."
    : messageType === "task_assign"
      ? "CEO assigned a task. Confirm understanding and concrete next step."
      : "CEO sent a direct chat message.";
  const prompt = [
    "[CEO 1:1 Conversation]",
    `You are ${getAgentDisplayName(agent, lang)} (${deptName} ${role}).`,
    deptConstraint,
    localeInstruction(lang),
    "Output rules:",
    "- Return one direct response message only (no JSON, no markdown).",
    "- Keep it concise and practical (1-3 sentences).",
    `Message type: ${messageType}`,
    `Conversation intent: ${typeHint}`,
    "",
    `CEO message: ${ceoMessage}`,
    recentCtx,
  ].filter(Boolean).join("\n");
  return { prompt, lang };
}

function buildCliFailureMessage(agent: AgentRow, lang: string, error?: string): string {
  const name = getAgentDisplayName(agent, lang);
  if (lang === "en") return `${name}: CLI response failed (${error || "unknown error"}).`;
  if (lang === "ja") return `${name}: CLI応答の生成に失敗しました（${error || "不明なエラー"}）。`;
  if (lang === "zh") return `${name}: CLI回复生成失败（${error || "未知错误"}）。`;
  return `${name}: CLI 응답 생성에 실패했습니다 (${error || "알 수 없는 오류"}).`;
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

async function runAgentOneShot(
  agent: AgentRow,
  prompt: string,
  opts: OneShotRunOptions = {},
): Promise<OneShotRunResult> {
  const provider = agent.cli_provider || "claude";
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const projectPath = opts.projectPath || process.cwd();
  const streamTaskId = opts.streamTaskId ?? null;
  const runId = `meeting-${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logPath = path.join(logsDir, `${runId}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);
  let rawOutput = "";
  let exitCode = 0;
  let activeChild: any = null;
  let activeStdoutListener: ((chunk: Buffer) => void) | null = null;
  let activeStderrListener: ((chunk: Buffer) => void) | null = null;
  let activeErrorListener: ((err: Error) => void) | null = null;
  let activeCloseListener: ((code: number | null) => void) | null = null;
  const detachChildListeners = () => {
    const child = activeChild;
    if (!child) return;
    if (activeStdoutListener) {
      child.stdout?.off("data", activeStdoutListener);
      activeStdoutListener = null;
    }
    if (activeStderrListener) {
      child.stderr?.off("data", activeStderrListener);
      activeStderrListener = null;
    }
    if (activeErrorListener) {
      child.off("error", activeErrorListener);
      activeErrorListener = null;
    }
    if (activeCloseListener) {
      child.off("close", activeCloseListener);
      activeCloseListener = null;
    }
    activeChild = null;
  };

  const onChunk = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
    const text = normalizeStreamChunk(chunk, {
      dropCliNoise: provider !== "copilot" && provider !== "antigravity" && provider !== "api",
    });
    if (!text) return;
    rawOutput += text;
    safeWrite(text);
    if (streamTaskId) {
      broadcast("cli_output", { task_id: streamTaskId, stream, data: text });
    }
  };

  try {
    if (provider === "api") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await executeApiProviderAgent(
          prompt,
          projectPath,
          logStream,
          controller.signal,
          streamTaskId ?? undefined,
          (agent as any).api_provider_id ?? null,
          (agent as any).api_model ?? null,
          (text: string) => {
            rawOutput += text;
            return safeWrite(text);
          },
        );
      } finally {
        clearTimeout(timeout);
      }
      // logStream fallback
      if (!rawOutput.trim() && fs.existsSync(logPath)) {
        rawOutput = fs.readFileSync(logPath, "utf8");
      }
    } else if (provider === "copilot" || provider === "antigravity") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const oauthWrite = (text: string) => {
        rawOutput += text;
        return safeWrite(text);
      };
      try {
        if (provider === "copilot") {
          await executeCopilotAgent(
            prompt,
            projectPath,
            logStream,
            controller.signal,
            streamTaskId ?? undefined,
            agent.oauth_account_id ?? null,
            oauthWrite,
          );
        } else {
          await executeAntigravityAgent(
            prompt,
            logStream,
            controller.signal,
            streamTaskId ?? undefined,
            agent.oauth_account_id ?? null,
            oauthWrite,
          );
        }
      } finally {
        clearTimeout(timeout);
      }
      if (!rawOutput.trim() && fs.existsSync(logPath)) {
        rawOutput = fs.readFileSync(logPath, "utf8");
      }
    } else {
      const modelConfig = getProviderModelConfig();
      const model = modelConfig[provider]?.model || undefined;
      const reasoningLevel = modelConfig[provider]?.reasoningLevel || undefined;
      const args = buildAgentArgs(provider, model, reasoningLevel);

      await new Promise<void>((resolve, reject) => {
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
          detached: false,
          windowsHide: true,
        });
        activeChild = child;
        let settled = false;
        const settle = (callback: () => void) => {
          if (settled) return;
          settled = true;
          detachChildListeners();
          callback();
        };

        const timeout = setTimeout(() => {
          const pid = child.pid ?? 0;
          detachChildListeners();
          if (pid > 0) killPidTree(pid);
          settle(() => reject(new Error(`timeout after ${timeoutMs}ms`)));
        }, timeoutMs);

        activeErrorListener = (err: Error) => {
          clearTimeout(timeout);
          settle(() => reject(err));
        };
        activeStdoutListener = (chunk: Buffer) => onChunk(chunk, "stdout");
        activeStderrListener = (chunk: Buffer) => onChunk(chunk, "stderr");
        activeCloseListener = (code: number | null) => {
          clearTimeout(timeout);
          exitCode = code ?? 1;
          settle(() => resolve());
        };
        child.on("error", activeErrorListener);
        child.stdout?.on("data", activeStdoutListener);
        child.stderr?.on("data", activeStderrListener);
        child.on("close", activeCloseListener);

        child.stdin?.write(prompt);
        child.stdin?.end();
      });
    }
  } catch (err: any) {
    const message = err?.message ? String(err.message) : String(err);
    onChunk(`\n[one-shot-error] ${message}\n`, "stderr");
    if (opts.rawOutput) {
      const raw = rawOutput.trim();
      if (raw) return { text: raw, error: message };
      const pretty = prettyStreamJson(rawOutput).trim();
      if (pretty) return { text: pretty, error: message };
      return { text: "", error: message };
    }
    const partial = normalizeConversationReply(rawOutput, 320);
    if (partial) return { text: partial, error: message };
    const pretty = prettyStreamJson(rawOutput);
    const roughSource = (pretty.trim() || hasStructuredJsonLines(rawOutput)) ? pretty : rawOutput;
    const rough = roughSource
      .replace(/\s+/g, " ")
      .trim();
    if (rough) {
      const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
      return { text: clipped, error: message };
    }
    return { text: "", error: message };
  } finally {
    detachChildListeners();
    await new Promise<void>((resolve) => safeEnd(resolve));
  }

  if (exitCode !== 0 && !rawOutput.trim()) {
    return { text: "", error: `${provider} exited with code ${exitCode}` };
  }

  if (opts.rawOutput) {
    const pretty = prettyStreamJson(rawOutput).trim();
    const raw = rawOutput.trim();
    return { text: pretty || raw };
  }

  const normalized = normalizeConversationReply(rawOutput);
  if (normalized) return { text: normalized };

  const pretty = prettyStreamJson(rawOutput);
  const roughSource = (pretty.trim() || hasStructuredJsonLines(rawOutput)) ? pretty : rawOutput;
  const rough = roughSource
    .replace(/\s+/g, " ")
    .trim();
  if (rough) {
    const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
    return { text: clipped };
  }

  const lang = getPreferredLanguage();
  if (lang === "en") return { text: "Acknowledged. Continuing to the next step." };
  if (lang === "ja") return { text: "確認しました。次のステップへ進みます。" };
  if (lang === "zh") return { text: "已确认，继续进入下一步。" };
  return { text: "확인했습니다. 다음 단계로 진행하겠습니다." };
}

  return {
    wsClients,
    broadcast,
    activeProcesses,
    stopRequestedTasks,
    stopRequestModeByTask,
    TASK_RUN_IDLE_TIMEOUT_MS,
    TASK_RUN_HARD_TIMEOUT_MS,
    taskWorktrees,
    createWorktree,
    mergeWorktree,
    cleanupWorktree,
    rollbackTaskWorktree,
    getWorktreeDiffSummary,
    hasExplicitWarningFixRequest,
    buildTaskExecutionPrompt,
    buildAvailableSkillsPromptBlock,
    generateProjectContext,
    getRecentChanges,
    ensureClaudeMd,
    buildAgentArgs,
    shouldSkipDuplicateCliOutput,
    clearCliOutputDedup,
    normalizeStreamChunk,
    hasStructuredJsonLines,
    getRecentConversationContext,
    getTaskContinuationContext,
    sleepMs,
    randomDelay,
    getAgentDisplayName,
    chooseSafeReply,
    summarizeForMeetingBubble,
    hasVisibleDiffSummary,
    isDeferrableReviewHold,
    classifyMeetingReviewDecision,
    wantsReviewRevision,
    findLatestTranscriptContentByAgent,
    buildMeetingPrompt,
    buildDirectReplyPrompt,
    buildCliFailureMessage,
    runAgentOneShot,
  };
}
