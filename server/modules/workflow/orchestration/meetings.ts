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
} from "../../../db/runtime.ts";
import { BUILTIN_GOOGLE_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_SECRET, decryptSecret, encryptSecret } from "../../../oauth/helpers.ts";
import { notifyTaskStatus } from "../../../gateway/client.ts";
import { createWsHub } from "../../../ws/hub.ts";

export function initializeWorkflowMeetingTools(ctx: any): any {
  const __ctx = ctx as any;
  const db = __ctx.db;
  const ensureOAuthActiveAccount = __ctx.ensureOAuthActiveAccount;
  const getActiveOAuthAccountIds = __ctx.getActiveOAuthAccountIds;
  const logsDir = __ctx.logsDir;
  const nowMs = __ctx.nowMs;
  const CLI_STATUS_TTL = __ctx.CLI_STATUS_TTL;
  const CLI_TOOLS = __ctx.CLI_TOOLS;
  const MODELS_CACHE_TTL = __ctx.MODELS_CACHE_TTL;
  const activeProcesses = __ctx.activeProcesses;
  const analyzeSubtaskDepartment = __ctx.analyzeSubtaskDepartment;
  const appendTaskLog = __ctx.appendTaskLog;
  const broadcast = __ctx.broadcast;
  const buildCliFailureMessage = __ctx.buildCliFailureMessage;
  const buildDirectReplyPrompt = __ctx.buildDirectReplyPrompt;
  const buildTaskExecutionPrompt = __ctx.buildTaskExecutionPrompt;
  const cachedCliStatus = __ctx.cachedCliStatus;
  const cachedModels = __ctx.cachedModels;
  const chooseSafeReply = __ctx.chooseSafeReply;
  const cleanupWorktree = __ctx.cleanupWorktree;
  const createWorktree = __ctx.createWorktree;
  const detectAllCli = __ctx.detectAllCli;
  const ensureClaudeMd = __ctx.ensureClaudeMd;
  const execWithTimeout = __ctx.execWithTimeout;
  const fetchClaudeUsage = __ctx.fetchClaudeUsage;
  const fetchCodexUsage = __ctx.fetchCodexUsage;
  const fetchGeminiUsage = __ctx.fetchGeminiUsage;
  const generateProjectContext = __ctx.generateProjectContext;
  const getAgentDisplayName = __ctx.getAgentDisplayName;
  const getDecryptedOAuthToken = __ctx.getDecryptedOAuthToken;
  const getNextOAuthLabel = __ctx.getNextOAuthLabel;
  const getOAuthAccounts = __ctx.getOAuthAccounts;
  const getPreferredOAuthAccounts = __ctx.getPreferredOAuthAccounts;
  const getProviderModelConfig = __ctx.getProviderModelConfig;
  const getRecentChanges = __ctx.getRecentChanges;
  const getRecentConversationContext = __ctx.getRecentConversationContext;
  const getTaskContinuationContext = __ctx.getTaskContinuationContext;
  const hasExplicitWarningFixRequest = __ctx.hasExplicitWarningFixRequest;
  const hasStructuredJsonLines = __ctx.hasStructuredJsonLines;
  const httpAgentCounter = __ctx.httpAgentCounter;
  const interruptPidTree = __ctx.interruptPidTree;
  const isPidAlive = __ctx.isPidAlive;
  const isTaskWorkflowInterrupted = __ctx.isTaskWorkflowInterrupted;
  const killPidTree = __ctx.killPidTree;
  const launchHttpAgent = __ctx.launchHttpAgent;
  const mergeWorktree = __ctx.mergeWorktree;
  const normalizeOAuthProvider = __ctx.normalizeOAuthProvider;
  const randomDelay = __ctx.randomDelay;
  const refreshGoogleToken = __ctx.refreshGoogleToken;
  const rollbackTaskWorktree = __ctx.rollbackTaskWorktree;
  const runAgentOneShot = __ctx.runAgentOneShot;
  const clearTaskWorkflowState = __ctx.clearTaskWorkflowState;
  const seedApprovedPlanSubtasks = __ctx.seedApprovedPlanSubtasks;
  const spawnCliAgent = __ctx.spawnCliAgent;
  const stopRequestModeByTask = __ctx.stopRequestModeByTask;
  const stopRequestedTasks = __ctx.stopRequestedTasks;
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
  const executeCopilotAgent = __ctx.executeCopilotAgent;
  const executeAntigravityAgent = __ctx.executeAntigravityAgent;
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
  const DEPT_KEYWORDS = __ctx.DEPT_KEYWORDS;
  const detectLang = __ctx.detectLang;
  const detectTargetDepartments = typeof __ctx.detectTargetDepartments === "function"
    ? __ctx.detectTargetDepartments
    : (_text: string) => [];
  const findTeamLeader = __ctx.findTeamLeader;
  const formatTaskSubtaskProgressSummary = __ctx.formatTaskSubtaskProgressSummary;
  const getDeptName = __ctx.getDeptName;
  const getDeptRoleConstraint = __ctx.getDeptRoleConstraint;
  const getPreferredLanguage = __ctx.getPreferredLanguage;
  const getRoleLabel = __ctx.getRoleLabel;
  const l = __ctx.l;
  const pickL = __ctx.pickL;
  const prettyStreamJson = __ctx.prettyStreamJson;
  const processSubtaskDelegations = __ctx.processSubtaskDelegations;
  const recoverCrossDeptQueueAfterMissingCallback = __ctx.recoverCrossDeptQueueAfterMissingCallback;
  const refreshCliUsageData = __ctx.refreshCliUsageData;
  const resolveLang = __ctx.resolveLang;
  const resolveProjectPath = __ctx.resolveProjectPath;
  const sendAgentMessage = __ctx.sendAgentMessage;

  const progressTimers = __ctx.progressTimers;
  const reviewRoundState = __ctx.reviewRoundState;
  const reviewInFlight = __ctx.reviewInFlight;
  const meetingPresenceUntil = __ctx.meetingPresenceUntil;
  const meetingSeatIndexByAgent = __ctx.meetingSeatIndexByAgent;
  const meetingPhaseByAgent = __ctx.meetingPhaseByAgent;
  const meetingTaskIdByAgent = __ctx.meetingTaskIdByAgent;
  const meetingReviewDecisionByAgent = __ctx.meetingReviewDecisionByAgent;
  const getTaskStatusById = __ctx.getTaskStatusById;
  const getReviewRoundMode = __ctx.getReviewRoundMode;
  const scheduleNextReviewRound = __ctx.scheduleNextReviewRound;
  const startProgressTimer = __ctx.startProgressTimer;
  const stopProgressTimer = __ctx.stopProgressTimer;
  const notifyCeo = __ctx.notifyCeo;
function getLeadersByDepartmentIds(deptIds: string[]): AgentRow[] {
  const out: AgentRow[] = [];
  const seen = new Set<string>();
  for (const deptId of deptIds) {
    if (!deptId) continue;
    const leader = findTeamLeader(deptId);
    if (!leader || seen.has(leader.id)) continue;
    out.push(leader);
    seen.add(leader.id);
  }
  return out;
}

function getAllActiveTeamLeaders(): AgentRow[] {
  return db.prepare(`
    SELECT a.*
    FROM agents a
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE a.role = 'team_leader' AND a.status != 'offline'
    ORDER BY d.sort_order ASC, a.name ASC
  `).all() as unknown as AgentRow[];
}

function getTaskRelatedDepartmentIds(taskId: string, fallbackDeptId: string | null): string[] {
  const task = db.prepare(
    "SELECT title, description, department_id FROM tasks WHERE id = ?"
  ).get(taskId) as { title: string; description: string | null; department_id: string | null } | undefined;

  const deptSet = new Set<string>();
  if (fallbackDeptId) deptSet.add(fallbackDeptId);
  if (task?.department_id) deptSet.add(task.department_id);

  const subtaskDepts = db.prepare(
    "SELECT DISTINCT target_department_id FROM subtasks WHERE task_id = ? AND target_department_id IS NOT NULL"
  ).all(taskId) as Array<{ target_department_id: string | null }>;
  for (const row of subtaskDepts) {
    if (row.target_department_id) deptSet.add(row.target_department_id);
  }

  const sourceText = `${task?.title ?? ""} ${task?.description ?? ""}`;
  for (const deptId of detectTargetDepartments(sourceText)) {
    deptSet.add(deptId);
  }

  return [...deptSet];
}

function getTaskReviewLeaders(
  taskId: string,
  fallbackDeptId: string | null,
  opts?: { minLeaders?: number; includePlanning?: boolean; fallbackAll?: boolean },
): AgentRow[] {
  const deptIds = getTaskRelatedDepartmentIds(taskId, fallbackDeptId);
  const leaders = getLeadersByDepartmentIds(deptIds);
  const includePlanning = opts?.includePlanning ?? true;
  const minLeaders = opts?.minLeaders ?? 2;
  const fallbackAll = opts?.fallbackAll ?? true;

  const seen = new Set(leaders.map((l) => l.id));
  if (includePlanning) {
    const planningLeader = findTeamLeader("planning");
    if (planningLeader && !seen.has(planningLeader.id)) {
      leaders.unshift(planningLeader);
      seen.add(planningLeader.id);
    }
  }

  // If related departments are not detectable, expand to all team leaders
  // so approval is based on real multi-party communication.
  if (fallbackAll && leaders.length < minLeaders) {
    for (const leader of getAllActiveTeamLeaders()) {
      if (seen.has(leader.id)) continue;
      leaders.push(leader);
      seen.add(leader.id);
    }
  }

  return leaders;
}

interface MeetingMinutesRow {
  id: string;
  task_id: string;
  meeting_type: "planned" | "review";
  round: number;
  title: string;
  status: "in_progress" | "completed" | "revision_requested" | "failed";
  started_at: number;
  completed_at: number | null;
  created_at: number;
}

interface MeetingMinuteEntryRow {
  id: number;
  meeting_id: string;
  seq: number;
  speaker_agent_id: string | null;
  speaker_name: string;
  department_name: string | null;
  role_label: string | null;
  message_type: string;
  content: string;
  created_at: number;
}

function beginMeetingMinutes(
  taskId: string,
  meetingType: "planned" | "review",
  round: number,
  title: string,
): string {
  const meetingId = randomUUID();
  const t = nowMs();
  db.prepare(`
    INSERT INTO meeting_minutes (id, task_id, meeting_type, round, title, status, started_at, created_at)
    VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?)
  `).run(meetingId, taskId, meetingType, round, title, t, t);
  return meetingId;
}

function appendMeetingMinuteEntry(
  meetingId: string,
  seq: number,
  agent: AgentRow,
  lang: string,
  messageType: string,
  content: string,
): void {
  const deptName = getDeptName(agent.department_id ?? "");
  const roleLabel = getRoleLabel(agent.role, lang as Lang);
  db.prepare(`
    INSERT INTO meeting_minute_entries
      (meeting_id, seq, speaker_agent_id, speaker_name, department_name, role_label, message_type, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    meetingId,
    seq,
    agent.id,
    getAgentDisplayName(agent, lang),
    deptName || null,
    roleLabel || null,
    messageType,
    content,
    nowMs(),
  );
}

function finishMeetingMinutes(
  meetingId: string,
  status: "completed" | "revision_requested" | "failed",
): void {
  db.prepare(
    "UPDATE meeting_minutes SET status = ?, completed_at = ? WHERE id = ?"
  ).run(status, nowMs(), meetingId);
}

function normalizeRevisionMemoNote(note: string): string {
  const trimmed = note
    .replace(/\s+/g, " ")
    .replace(/^[\s\-*0-9.)]+/, "")
    .trim()
    .toLowerCase();
  const withoutPrefix = trimmed.replace(/^[^:]{1,80}:\s*/, "");
  const normalized = withoutPrefix
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || withoutPrefix || trimmed;
}

function reserveReviewRevisionMemoItems(
  taskId: string,
  round: number,
  memoItems: string[],
): { freshItems: string[]; duplicateCount: number } {
  if (memoItems.length === 0) return { freshItems: [], duplicateCount: 0 };
  const now = nowMs();
  const freshItems: string[] = [];
  let duplicateCount = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO review_revision_history
      (task_id, normalized_note, raw_note, first_round, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const raw of memoItems) {
    const note = raw.replace(/\s+/g, " ").trim();
    if (!note) continue;
    const normalized = normalizeRevisionMemoNote(note);
    if (!normalized) continue;
    const result = insert.run(taskId, normalized, note, round, now) as { changes?: number } | undefined;
    if ((result?.changes ?? 0) > 0) {
      freshItems.push(note);
    } else {
      duplicateCount += 1;
    }
  }
  return { freshItems, duplicateCount };
}

function loadRecentReviewRevisionMemoItems(taskId: string, maxItems = 4): string[] {
  const rows = db.prepare(`
    SELECT raw_note
    FROM review_revision_history
    WHERE task_id = ?
    ORDER BY first_round DESC, id DESC
    LIMIT ?
  `).all(taskId, maxItems) as Array<{ raw_note: string }>;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const note = row.raw_note.replace(/\s+/g, " ").trim();
    if (!note) continue;
    const key = note.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

function collectRevisionMemoItems(
  transcript: MeetingTranscriptEntry[],
  maxItems = REVIEW_MAX_MEMO_ITEMS_PER_ROUND,
  maxPerDepartment = REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const perDept = new Map<string, number>();
  const isIssue = (text: string) => (
    /보완|보류|리스크|미첨부|미구축|미완료|불가|부족|0%|hold|revise|revision|required|pending|risk|block|missing|not attached|incomplete|保留|修正|补充|未完成|未附|风险/i
  ).test(text);

  for (const row of transcript) {
    const base = row.content.replace(/\s+/g, " ").trim();
    if (!base || !isIssue(base)) continue;
    const deptKey = row.department.replace(/\s+/g, " ").trim().toLowerCase() || "unknown";
    const deptCount = perDept.get(deptKey) ?? 0;
    if (deptCount >= maxPerDepartment) continue;
    const note = `${row.department} ${row.speaker}: ${base}`;
    const normalized = normalizeRevisionMemoNote(note);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    perDept.set(deptKey, deptCount + 1);
    out.push(note.length > 220 ? `${note.slice(0, 219).trimEnd()}…` : note);
    if (out.length >= maxItems) break;
  }
  return out;
}

function collectPlannedActionItems(transcript: MeetingTranscriptEntry[], maxItems = 10): string[] {
  const riskFirst = collectRevisionMemoItems(transcript, maxItems);
  if (riskFirst.length > 0) return riskFirst;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of transcript) {
    const base = row.content.replace(/\s+/g, " ").trim();
    if (!base || base.length < 8) continue;
    const note = `${row.department} ${row.speaker}: ${base}`;
    const normalized = note.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(note.length > 220 ? `${note.slice(0, 219).trimEnd()}…` : note);
    if (out.length >= maxItems) break;
  }
  return out;
}

function appendTaskProjectMemo(
  taskId: string,
  phase: "planned" | "review",
  round: number,
  notes: string[],
  lang: string,
): void {
  const current = db.prepare("SELECT description, title FROM tasks WHERE id = ?").get(taskId) as {
    description: string | null;
    title: string;
  } | undefined;
  if (!current) return;

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const phaseLabel = phase === "planned" ? "Planned Kickoff" : "Review";
  const header = lang === "en"
    ? `[PROJECT MEMO] ${phaseLabel} round ${round} unresolved improvement items (${stamp})`
    : lang === "ja"
      ? `[PROJECT MEMO] ${phaseLabel} ラウンド ${round} 未解決の補完項目 (${stamp})`
      : lang === "zh"
        ? `[PROJECT MEMO] ${phaseLabel} 第 ${round} 轮未解决改进项 (${stamp})`
        : `[PROJECT MEMO] ${phaseLabel} 라운드 ${round} 미해결 보완 항목 (${stamp})`;
  const fallbackLine = lang === "en"
    ? "- No explicit issue line captured; follow-up verification is still required."
    : lang === "ja"
      ? "- 明示的な課題行は抽出되지ませんでしたが、後続検証は継続が必要です。"
      : lang === "zh"
        ? "- 未捕获到明确问题行，但后续验证仍需继续。"
        : "- 명시적 이슈 문장을 추출하지 못했지만 후속 검증은 계속 필요합니다.";
  const body = notes.length > 0
    ? notes.map((note) => `- ${note}`).join("\n")
    : fallbackLine;

  const block = `${header}\n${body}`;
  const existing = current.description ?? "";
  const next = existing ? `${existing}\n\n${block}` : block;
  const trimmed = next.length > 18_000 ? next.slice(next.length - 18_000) : next;

  db.prepare("UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?")
    .run(trimmed, nowMs(), taskId);
  appendTaskLog(taskId, "system", `Project memo appended (${phase} round ${round}, items=${notes.length})`);
  broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
}

function appendTaskReviewFinalMemo(
  taskId: string,
  round: number,
  transcript: MeetingTranscriptEntry[],
  lang: string,
  hasResidualRisk: boolean,
): void {
  const current = db.prepare("SELECT description FROM tasks WHERE id = ?").get(taskId) as {
    description: string | null;
  } | undefined;
  if (!current) return;

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const header = lang === "en"
    ? `[PROJECT MEMO] Review round ${round} final package (${stamp})`
    : lang === "ja"
      ? `[PROJECT MEMO] Review ラウンド ${round} 最終パッケージ (${stamp})`
      : lang === "zh"
        ? `[PROJECT MEMO] Review 第 ${round} 轮最终输出包 (${stamp})`
        : `[PROJECT MEMO] Review 라운드 ${round} 최종 결과 패키지 (${stamp})`;
  const decisionLine = hasResidualRisk
    ? pickL(l(
      ["잔여 리스크를 문서화한 조건부 최종 승인으로 종료합니다."],
      ["Finalized with conditional approval and documented residual risks."],
      ["残余リスクを文書化した条件付き最終承認で締結します。"],
      ["以记录剩余风险的条件性最终批准完成收口。"],
    ), lang as Lang)
    : pickL(l(
      ["전원 승인 기준으로 최종 승인 및 머지 준비를 완료했습니다."],
      ["Final approval completed based on full leader alignment and merge readiness."],
      ["全リーダー承認に基づき最終承認とマージ準備を完了しました。"],
      ["已基于全体负责人一致意见完成最终批准与合并准备。"],
    ), lang as Lang);

  const evidence: string[] = [];
  const seen = new Set<string>();
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const row = transcript[i];
    const clipped = summarizeForMeetingBubble(row.content, 140, lang as Lang);
    if (!clipped) continue;
    const line = `${row.department} ${row.speaker}: ${clipped}`;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(line);
    if (evidence.length >= 6) break;
  }

  const bodyLines = [decisionLine, ...evidence];
  const block = `${header}\n${bodyLines.map((line) => `- ${line}`).join("\n")}`;
  const existing = current.description ?? "";
  const next = existing ? `${existing}\n\n${block}` : block;
  const trimmed = next.length > 18_000 ? next.slice(next.length - 18_000) : next;

  db.prepare("UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?")
    .run(trimmed, nowMs(), taskId);
  appendTaskLog(
    taskId,
    "system",
    `Project memo appended (review round ${round}, final package, residual_risk=${hasResidualRisk ? "yes" : "no"})`,
  );
  broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
}

function markAgentInMeeting(
  agentId: string,
  holdMs = 90_000,
  seatIndex?: number,
  phase?: "kickoff" | "review",
  taskId?: string,
): void {
  meetingPresenceUntil.set(agentId, nowMs() + holdMs);
  if (typeof seatIndex === "number") {
    meetingSeatIndexByAgent.set(agentId, seatIndex);
  }
  if (phase) {
    meetingPhaseByAgent.set(agentId, phase);
    if (phase === "review") {
      meetingReviewDecisionByAgent.set(agentId, "reviewing");
    } else {
      meetingReviewDecisionByAgent.delete(agentId);
    }
  }
  if (taskId) {
    meetingTaskIdByAgent.set(agentId, taskId);
  }
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
  if (row?.status === "break") {
    db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?").run(agentId);
    const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
    broadcast("agent_status", updated);
  }
}

function isAgentInMeeting(agentId: string): boolean {
  const until = meetingPresenceUntil.get(agentId);
  if (!until) return false;
  if (until < nowMs()) {
    meetingPresenceUntil.delete(agentId);
    meetingSeatIndexByAgent.delete(agentId);
    meetingPhaseByAgent.delete(agentId);
    meetingTaskIdByAgent.delete(agentId);
    meetingReviewDecisionByAgent.delete(agentId);
    return false;
  }
  return true;
}

function callLeadersToCeoOffice(taskId: string, leaders: AgentRow[], phase: "kickoff" | "review"): void {
  leaders.slice(0, 6).forEach((leader, seatIndex) => {
    markAgentInMeeting(leader.id, 600_000, seatIndex, phase, taskId);
    broadcast("ceo_office_call", {
      from_agent_id: leader.id,
      seat_index: seatIndex,
      phase,
      task_id: taskId,
      action: "arrive",
      decision: phase === "review"
        ? (meetingReviewDecisionByAgent.get(leader.id) ?? "reviewing")
        : undefined,
    });
  });
}

function dismissLeadersFromCeoOffice(taskId: string, leaders: AgentRow[]): void {
  leaders.slice(0, 6).forEach((leader) => {
    meetingPresenceUntil.delete(leader.id);
    meetingSeatIndexByAgent.delete(leader.id);
    meetingPhaseByAgent.delete(leader.id);
    meetingTaskIdByAgent.delete(leader.id);
    meetingReviewDecisionByAgent.delete(leader.id);
    broadcast("ceo_office_call", {
      from_agent_id: leader.id,
      task_id: taskId,
      action: "dismiss",
    });
  });
}

function emitMeetingSpeech(
  agentId: string,
  seatIndex: number,
  phase: "kickoff" | "review",
  taskId: string,
  line: string,
  lang?: string,
): void {
  const preview = summarizeForMeetingBubble(line, 96, (lang as Lang | undefined));
  const decision = phase === "review" ? classifyMeetingReviewDecision(preview) : undefined;
  if (decision) {
    meetingReviewDecisionByAgent.set(agentId, decision);
  } else {
    meetingReviewDecisionByAgent.delete(agentId);
  }
  broadcast("ceo_office_call", {
    from_agent_id: agentId,
    seat_index: seatIndex,
    phase,
    task_id: taskId,
    action: "speak",
    line: preview,
    decision,
  });
}

function startReviewConsensusMeeting(
  taskId: string,
  taskTitle: string,
  departmentId: string | null,
  onApproved: () => void,
): void {
  if (reviewInFlight.has(taskId)) return;
  reviewInFlight.add(taskId);

  void (async () => {
    let meetingId: string | null = null;
    const leaders = getTaskReviewLeaders(taskId, departmentId);
    if (leaders.length === 0) {
      reviewInFlight.delete(taskId);
      onApproved();
      return;
    }
    try {
      const latestMeeting = db.prepare(`
        SELECT id, round, status
        FROM meeting_minutes
        WHERE task_id = ?
          AND meeting_type = 'review'
        ORDER BY started_at DESC, created_at DESC
        LIMIT 1
      `).get(taskId) as { id: string; round: number; status: string } | undefined;
      const resumeMeeting = latestMeeting?.status === "in_progress";
      const round = resumeMeeting ? (latestMeeting?.round ?? 1) : ((latestMeeting?.round ?? 0) + 1);
      reviewRoundState.set(taskId, round);
      if (!resumeMeeting && round > REVIEW_MAX_ROUNDS) {
        const cappedLang = resolveLang(taskTitle);
        appendTaskLog(
          taskId,
          "system",
          `Review round ${round} exceeds max_rounds=${REVIEW_MAX_ROUNDS}; forcing final decision`,
        );
        notifyCeo(pickL(l(
          [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드가 최대치(${REVIEW_MAX_ROUNDS})를 초과해 추가 보완은 중단하고 최종 승인 판단으로 전환합니다.`],
          [`[CEO OFFICE] '${taskTitle}' exceeded max review rounds (${REVIEW_MAX_ROUNDS}). Additional revision rounds are closed and we are moving to final approval decision.`],
          [`[CEO OFFICE] '${taskTitle}' はレビュー上限(${REVIEW_MAX_ROUNDS}回)を超えたため、追加補完を停止して最終承認判断へ移行します。`],
          [`[CEO OFFICE] '${taskTitle}' 的评审轮次已超过上限（${REVIEW_MAX_ROUNDS}）。现停止追加整改并转入最终审批判断。`],
        ), cappedLang), taskId);
        reviewRoundState.delete(taskId);
        reviewInFlight.delete(taskId);
        onApproved();
        return;
      }

      const roundMode = getReviewRoundMode(round);
      const isRound1Remediation = roundMode === "parallel_remediation";
      const isRound2Merge = roundMode === "merge_synthesis";
      const isFinalDecisionRound = roundMode === "final_decision";

      const planningLeader = leaders.find((l) => l.department_id === "planning") ?? leaders[0];
      const otherLeaders = leaders.filter((l) => l.id !== planningLeader.id);
      let needsRevision = false;
      let reviseOwner: AgentRow | null = null;
      const seatIndexByAgent = new Map(leaders.slice(0, 6).map((leader, idx) => [leader.id, idx]));

      const taskCtx = db.prepare(
        "SELECT description, project_path FROM tasks WHERE id = ?"
      ).get(taskId) as { description: string | null; project_path: string | null } | undefined;
      const taskDescription = taskCtx?.description ?? null;
      const projectPath = resolveProjectPath({
        title: taskTitle,
        description: taskDescription,
        project_path: taskCtx?.project_path ?? null,
      });
      const lang = resolveLang(taskDescription ?? taskTitle);
      const transcript: MeetingTranscriptEntry[] = [];
      const oneShotOptions = { projectPath, timeoutMs: 35_000 };
      meetingId = resumeMeeting
        ? (latestMeeting?.id ?? null)
        : beginMeetingMinutes(taskId, "review", round, taskTitle);
      let minuteSeq = 1;
      if (meetingId) {
        const seqRow = db.prepare(
          "SELECT COALESCE(MAX(seq), 0) AS max_seq FROM meeting_minute_entries WHERE meeting_id = ?"
        ).get(meetingId) as { max_seq: number } | undefined;
        minuteSeq = (seqRow?.max_seq ?? 0) + 1;
      }
      const abortIfInactive = (): boolean => {
        if (!isTaskWorkflowInterrupted(taskId)) return false;
        const status = getTaskStatusById(taskId);
        if (meetingId) finishMeetingMinutes(meetingId, "failed");
        dismissLeadersFromCeoOffice(taskId, leaders);
        clearTaskWorkflowState(taskId);
        if (status) {
          appendTaskLog(taskId, "system", `Review meeting aborted due to task state change (${status})`);
        }
        return true;
      };

      const pushTranscript = (leader: AgentRow, content: string) => {
        transcript.push({
          speaker_agent_id: leader.id,
          speaker: getAgentDisplayName(leader, lang),
          department: getDeptName(leader.department_id ?? ""),
          role: getRoleLabel(leader.role, lang as Lang),
          content,
        });
      };
      const speak = (leader: AgentRow, messageType: string, receiverType: string, receiverId: string | null, content: string) => {
        if (isTaskWorkflowInterrupted(taskId)) return;
        sendAgentMessage(leader, content, messageType, receiverType, receiverId, taskId);
        const seatIndex = seatIndexByAgent.get(leader.id) ?? 0;
        emitMeetingSpeech(leader.id, seatIndex, "review", taskId, content, lang);
        pushTranscript(leader, content);
        if (meetingId) {
          appendMeetingMinuteEntry(meetingId, minuteSeq++, leader, lang, messageType, content);
        }
      };

      if (abortIfInactive()) return;
      callLeadersToCeoOffice(taskId, leaders, "review");
      const resumeNotice = isRound2Merge
        ? l(
          [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 재개. 라운드1 보완 결과 취합/머지 판단을 이어갑니다.`],
          [`[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing consolidation and merge-readiness judgment from round 1 remediation.`],
          [`[CEO OFFICE] '${taskTitle}' レビューラウンド${round}を再開。ラウンド1補完結果の集約とマージ可否判断を続行します。`],
          [`[CEO OFFICE] 已恢复'${taskTitle}'第${round}轮 Review，继续汇总第1轮整改结果并判断合并准备度。`],
        )
        : isFinalDecisionRound
          ? l(
            [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 재개. 추가 보완 없이 최종 승인과 문서 확정을 진행합니다.`],
            [`[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Final approval and documentation will be completed without additional remediation.`],
            [`[CEO OFFICE] '${taskTitle}' レビューラウンド${round}を再開。追加補完なしで最終承認と文書確定を進めます。`],
            [`[CEO OFFICE] 已恢复'${taskTitle}'第${round}轮 Review，将在不新增整改的前提下完成最终审批与文档确认。`],
          )
          : l(
            [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 재개. 팀장 의견 수집 및 상호 승인 재진행합니다.`],
            [`[CEO OFFICE] '${taskTitle}' review round ${round} resumed. Continuing team-lead feedback and mutual approvals.`],
            [`[CEO OFFICE] '${taskTitle}' レビューラウンド${round}を再開しました。チームリーダー意見収集と相互承認を続行します。`],
            [`[CEO OFFICE] 已恢复'${taskTitle}'第${round}轮 Review，继续收集团队负责人意见与相互审批。`],
          );
      const startNotice = isRound2Merge
        ? l(
          [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 시작. 라운드1 보완 작업 결과를 팀장회의에서 취합하고 머지 판단을 진행합니다.`],
          [`[CEO OFFICE] '${taskTitle}' review round ${round} started. Team leads are consolidating round 1 remediation outputs and making merge-readiness decisions.`],
          [`[CEO OFFICE] '${taskTitle}' レビューラウンド${round}開始。ラウンド1補完結果をチームリーダー会議で集約し、マージ可否を判断します。`],
          [`[CEO OFFICE] 已开始'${taskTitle}'第${round}轮 Review，团队负责人将汇总第1轮整改结果并进行合并判断。`],
        )
        : isFinalDecisionRound
          ? l(
            [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 시작. 추가 보완 없이 최종 승인 결과와 문서 패키지를 확정합니다.`],
            [`[CEO OFFICE] '${taskTitle}' review round ${round} started. Final approval and documentation package will be finalized without additional remediation.`],
            [`[CEO OFFICE] '${taskTitle}' レビューラウンド${round}開始。追加補完なしで最終承認結果と文書パッケージを確定します。`],
            [`[CEO OFFICE] 已开始'${taskTitle}'第${round}轮 Review，在不新增整改的前提下确定最终审批结果与文档包。`],
          )
          : l(
            [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 시작. 팀장 의견 수집 및 상호 승인 진행합니다.`],
            [`[CEO OFFICE] '${taskTitle}' review round ${round} started. Collecting team-lead feedback and mutual approvals.`],
            [`[CEO OFFICE] '${taskTitle}' レビューラウンド${round}を開始しました。チームリーダー意見収集と相互承認を進めます。`],
            [`[CEO OFFICE] 已开始'${taskTitle}'第${round}轮 Review，正在收集团队负责人意见并进行相互审批。`],
          );
      notifyCeo(pickL(resumeMeeting ? resumeNotice : startNotice, lang), taskId);

      const openingPrompt = buildMeetingPrompt(planningLeader, {
        meetingType: "review",
        round,
        taskTitle,
        taskDescription,
        transcript,
        turnObjective: isRound2Merge
          ? "Kick off round 2 merge-synthesis discussion and ask each leader to verify consolidated remediation output."
          : isFinalDecisionRound
            ? "Kick off round 3 final decision discussion and confirm that no additional remediation round will be opened."
            : "Kick off round 1 review discussion and ask each leader for all required remediation items in one pass.",
        stanceHint: isRound2Merge
          ? "Focus on consolidation and merge readiness. Convert concerns into documented residual risks instead of new subtasks."
          : isFinalDecisionRound
            ? "Finalize approval decision and documentation package. Do not ask for new remediation subtasks."
            : "Capture every remediation requirement now so execution can proceed in parallel once.",
        lang,
      });
      const openingRun = await runAgentOneShot(planningLeader, openingPrompt, oneShotOptions);
      if (abortIfInactive()) return;
      const openingText = chooseSafeReply(openingRun, lang, "opening", planningLeader);
      speak(planningLeader, "chat", "all", null, openingText);
      await sleepMs(randomDelay(720, 1300));
      if (abortIfInactive()) return;

      for (const leader of otherLeaders) {
        if (abortIfInactive()) return;
        const feedbackPrompt = buildMeetingPrompt(leader, {
          meetingType: "review",
          round,
          taskTitle,
          taskDescription,
          transcript,
          turnObjective: isRound2Merge
            ? "Validate merged remediation output and state whether it is ready for final-round sign-off."
            : isFinalDecisionRound
              ? "Provide final approval opinion with documentation-ready rationale."
              : "Provide concise review feedback and list all revision requirements that must be addressed in round 1.",
          stanceHint: isRound2Merge
            ? "Do not ask for a new remediation round; if concerns remain, describe residual risks for final documentation."
            : isFinalDecisionRound
              ? "No additional remediation is allowed in this final round. Choose final approve or approve-with-residual-risk."
              : "If revision is needed, explicitly state what must be fixed before approval.",
          lang,
        });
        const feedbackRun = await runAgentOneShot(leader, feedbackPrompt, oneShotOptions);
        if (abortIfInactive()) return;
        const feedbackText = chooseSafeReply(feedbackRun, lang, "feedback", leader);
        speak(leader, "chat", "agent", planningLeader.id, feedbackText);
        if (wantsReviewRevision(feedbackText)) {
          needsRevision = true;
          if (!reviseOwner) reviseOwner = leader;
        }
        await sleepMs(randomDelay(650, 1180));
        if (abortIfInactive()) return;
      }

      if (otherLeaders.length === 0) {
        if (abortIfInactive()) return;
        const soloPrompt = buildMeetingPrompt(planningLeader, {
          meetingType: "review",
          round,
          taskTitle,
          taskDescription,
          transcript,
          turnObjective: isRound2Merge
            ? "As the only reviewer, decide whether round 1 remediation is fully consolidated and merge-ready."
            : isFinalDecisionRound
              ? "As the only reviewer, publish the final approval conclusion and documentation note."
              : "As the only reviewer, provide your single-party review conclusion with complete remediation checklist.",
          stanceHint: isFinalDecisionRound
            ? "No further remediation round is allowed. Conclude with final decision and documented residual risks if any."
            : "Summarize risks, dependencies, and confidence level in one concise message.",
          lang,
        });
        const soloRun = await runAgentOneShot(planningLeader, soloPrompt, oneShotOptions);
        if (abortIfInactive()) return;
        const soloText = chooseSafeReply(soloRun, lang, "feedback", planningLeader);
        speak(planningLeader, "chat", "all", null, soloText);
        await sleepMs(randomDelay(620, 980));
        if (abortIfInactive()) return;
      }

      const summaryPrompt = buildMeetingPrompt(planningLeader, {
        meetingType: "review",
        round,
        taskTitle,
        taskDescription,
        transcript,
        turnObjective: isRound2Merge
          ? "Synthesize round 2 consolidation, clarify merge readiness, and announce move to final decision round."
          : isFinalDecisionRound
            ? "Synthesize final review outcome and publish final documentation/approval direction."
            : (needsRevision
              ? "Synthesize feedback and announce concrete remediation subtasks and execution handoff."
              : "Synthesize feedback and request final all-leader approval."),
        stanceHint: isRound2Merge
          ? "No new remediation subtasks in round 2. Convert concerns into documented residual-risk notes."
          : isFinalDecisionRound
            ? "Finalize now. Additional remediation rounds are not allowed."
            : (needsRevision
              ? "State that remediation starts immediately and review will restart only after remediation is completed."
              : "State that the final review package is ready for immediate approval."),
        lang,
      });
      const summaryRun = await runAgentOneShot(planningLeader, summaryPrompt, oneShotOptions);
      if (abortIfInactive()) return;
      const summaryText = chooseSafeReply(summaryRun, lang, "summary", planningLeader);
      speak(planningLeader, "report", "all", null, summaryText);
      await sleepMs(randomDelay(680, 1120));
      if (abortIfInactive()) return;

      for (const leader of leaders) {
        if (abortIfInactive()) return;
        const isReviseOwner = reviseOwner?.id === leader.id;
        const approvalPrompt = buildMeetingPrompt(leader, {
          meetingType: "review",
          round,
          taskTitle,
          taskDescription,
          transcript,
          turnObjective: isRound2Merge
            ? "State whether this consolidated package is ready to proceed into final decision round."
            : isFinalDecisionRound
              ? "State your final approval decision and documentation conclusion for this task."
              : "State your final approval decision for this review round.",
          stanceHint: isRound2Merge
            ? "If concerns remain, record residual risk only. Do not request a new remediation subtask round."
            : isFinalDecisionRound
              ? "This is the final round. Additional remediation is not allowed; conclude with approve or approve-with-documented-risk."
              : (!needsRevision
                ? "Approve the current review package if ready; otherwise hold approval with concrete revision items."
                : (isReviseOwner
                  ? "Hold approval until your requested revision is reflected."
                  : "Agree with conditional approval pending revision reflection.")),
          lang,
        });
        const approvalRun = await runAgentOneShot(leader, approvalPrompt, oneShotOptions);
        if (abortIfInactive()) return;
        const approvalText = chooseSafeReply(approvalRun, lang, "approval", leader);
        speak(leader, "status_update", "all", null, approvalText);
        if (wantsReviewRevision(approvalText)) {
          needsRevision = true;
          if (!reviseOwner) reviseOwner = leader;
        }
        await sleepMs(randomDelay(420, 860));
        if (abortIfInactive()) return;
      }

      // Final review result should follow each leader's last approval statement,
      // not stale "needs revision" flags from earlier feedback turns.
      const finalHoldLeaders: AgentRow[] = [];
      const deferredMonitoringLeaders: AgentRow[] = [];
      const deferredMonitoringNotes: string[] = [];
      const finalHoldDeptCount = new Map<string, number>();
      for (const leader of leaders) {
        if (meetingReviewDecisionByAgent.get(leader.id) !== "hold") continue;
        const latestDecisionLine = findLatestTranscriptContentByAgent(transcript, leader.id);
        if (isDeferrableReviewHold(latestDecisionLine)) {
          const clipped = summarizeForMeetingBubble(latestDecisionLine, 160, lang as Lang);
          deferredMonitoringLeaders.push(leader);
          deferredMonitoringNotes.push(
            `${getDeptName(leader.department_id ?? "")} ${getAgentDisplayName(leader, lang)}: ${clipped}`,
          );
          appendTaskLog(
            taskId,
            "system",
            `Review round ${round}: converted deferrable hold to post-merge monitoring (${leader.id})`,
          );
          continue;
        }
        if (finalHoldLeaders.length >= REVIEW_MAX_REVISION_SIGNALS_PER_ROUND) {
          appendTaskLog(
            taskId,
            "system",
            `Review round ${round}: hold signal ignored (round cap ${REVIEW_MAX_REVISION_SIGNALS_PER_ROUND})`,
          );
          continue;
        }
        const deptKey = leader.department_id ?? `agent:${leader.id}`;
        const deptCount = finalHoldDeptCount.get(deptKey) ?? 0;
        if (deptCount >= REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND) {
          appendTaskLog(
            taskId,
            "system",
            `Review round ${round}: hold signal ignored for dept ${deptKey} (dept cap ${REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND})`,
          );
          continue;
        }
        finalHoldDeptCount.set(deptKey, deptCount + 1);
        finalHoldLeaders.push(leader);
      }
      needsRevision = finalHoldLeaders.length > 0;
      if (needsRevision && !reviseOwner) {
        reviseOwner = finalHoldLeaders[0] ?? null;
      }
      if (!needsRevision && deferredMonitoringNotes.length > 0) {
        appendTaskProjectMemo(taskId, "review", round, deferredMonitoringNotes, lang);
        appendTaskLog(
          taskId,
          "system",
          `Review round ${round}: deferred ${deferredMonitoringLeaders.length} hold opinions to SLA monitoring checklist`,
        );
      }

      await sleepMs(randomDelay(540, 920));
      if (abortIfInactive()) return;

      if (needsRevision) {
        const rawMemoItems = collectRevisionMemoItems(
          transcript,
          REVIEW_MAX_MEMO_ITEMS_PER_ROUND,
          REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
        );
        const { freshItems, duplicateCount } = reserveReviewRevisionMemoItems(taskId, round, rawMemoItems);
        const hasFreshMemoItems = freshItems.length > 0;
        const fallbackMemoItem = pickL(l(
          ["리뷰 보완 요청이 감지되었습니다. 합의된 품질 기준과 증빙을 기준으로 잔여 리스크를 문서화하고 최종 결정이 필요합니다."],
          ["A review hold signal was detected. Document residual risks against agreed quality gates and move to a final decision."],
          ["レビュー保留シグナルを検知しました。合意した品質基準に対する残余リスクを文書化し、最終判断へ進めてください。"],
          ["检测到评审保留信号。请基于既定质量门槛记录剩余风险，并进入最终决策。"],
        ), lang);
        const memoItemsForAction = hasFreshMemoItems ? freshItems : [fallbackMemoItem];
        const recentMemoItems = hasFreshMemoItems ? [] : loadRecentReviewRevisionMemoItems(taskId, 4);
        const memoItemsForProject = hasFreshMemoItems
          ? freshItems
          : (recentMemoItems.length > 0 ? recentMemoItems : memoItemsForAction);
        appendTaskProjectMemo(taskId, "review", round, memoItemsForProject, lang);

        appendTaskLog(
          taskId,
          "system",
          `Review consensus round ${round}: revision requested `
          + `(mode=${roundMode}, new_items=${freshItems.length}, duplicates=${duplicateCount})`,
        );

        const remediationRequestCountRow = db.prepare(`
          SELECT COUNT(*) AS cnt
          FROM meeting_minutes
          WHERE task_id = ?
            AND meeting_type = 'review'
            AND status = 'revision_requested'
        `).get(taskId) as { cnt: number } | undefined;
        const remediationRequestCount = remediationRequestCountRow?.cnt ?? 0;
        const remediationLimitReached = remediationRequestCount >= REVIEW_MAX_REMEDIATION_REQUESTS;

        if (isRound1Remediation && !remediationLimitReached) {
          const revisionSubtaskCount = seedReviewRevisionSubtasks(taskId, departmentId, memoItemsForAction);
          appendTaskLog(
            taskId,
            "system",
            `Review consensus round ${round}: revision subtasks queued for parallel remediation (${revisionSubtaskCount})`,
          );
          // Start cross-department revision execution immediately.
          // Without this, foreign remediation subtasks can remain blocked until the owner run completes.
          processSubtaskDelegations(taskId);
          notifyCeo(pickL(l(
            [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round}는 조건부/보류 판정입니다. 보완 SubTask ${revisionSubtaskCount}건을 한번에 생성해 병렬 반영으로 전환합니다.`],
            [`[CEO OFFICE] Review round ${round} for '${taskTitle}' is hold/conditional. Created ${revisionSubtaskCount} revision subtasks at once and switching to parallel remediation.`],
            [`[CEO OFFICE] '${taskTitle}' のレビューラウンド${round}は保留/条件付き承認です。補完SubTaskを${revisionSubtaskCount}件一括生成し、並列反映へ移行します。`],
            [`[CEO OFFICE] '${taskTitle}' 第${round}轮 Review 判定为保留/条件批准。已一次性创建 ${revisionSubtaskCount} 个整改 SubTask，并切换为并行整改。`],
          ), lang), taskId);

          if (meetingId) finishMeetingMinutes(meetingId, "revision_requested");
          dismissLeadersFromCeoOffice(taskId, leaders);
          reviewRoundState.delete(taskId);
          reviewInFlight.delete(taskId);

          const latestTask = db.prepare(
            "SELECT assigned_agent_id, department_id FROM tasks WHERE id = ?"
          ).get(taskId) as { assigned_agent_id: string | null; department_id: string | null } | undefined;
          const assignedAgent = latestTask?.assigned_agent_id
            ? (db.prepare("SELECT * FROM agents WHERE id = ?").get(latestTask.assigned_agent_id) as AgentRow | undefined)
            : undefined;
          const fallbackLeader = findTeamLeader(latestTask?.department_id ?? departmentId);
          const execAgent = assignedAgent ?? fallbackLeader;

          if (!execAgent || activeProcesses.has(taskId)) {
            appendTaskLog(taskId, "system", `Review remediation queued; waiting for executor run (task=${taskId})`);
            notifyCeo(pickL(l(
              [`'${taskTitle}' 보완 SubTask가 생성되었습니다. 동일 담당 세션으로 반영 후 라운드2 취합 회의로 진행합니다.`],
              [`Revision subtasks for '${taskTitle}' were created. The same owner session will resume remediation and proceed to round 2 consolidation.`],
              [`'${taskTitle}' の補完SubTaskを作成しました。同一担当セッションで反映後、ラウンド2の集約会議へ進みます。`],
              [`已为 '${taskTitle}' 创建整改 SubTask。将由同一负责人会话继续整改，并进入第2轮汇总会议。`],
            ), lang), taskId);
            return;
          }

          const provider = execAgent.cli_provider || "claude";
          if (!["claude", "codex", "gemini", "opencode"].includes(provider)) {
            appendTaskLog(taskId, "system", `Review remediation queued; provider '${provider}' requires manual run restart`);
            notifyCeo(pickL(l(
              [`'${taskTitle}' 보완 SubTask를 생성했습니다. 현재 담당 CLI(${provider})는 자동 재실행 경로가 없어 수동 Run 후 라운드2를 진행합니다.`],
              [`Revision subtasks were created for '${taskTitle}'. This CLI (${provider}) requires manual run restart before round 2 consolidation.`],
              [`'${taskTitle}' の補完SubTaskを作成しました。現在のCLI(${provider})は自動再実行に未対応のため、手動Run後にラウンド2へ進みます。`],
              [`已为 '${taskTitle}' 创建整改 SubTask。当前 CLI（${provider}）不支持自动重跑，请手动 Run 后进入第2轮汇总。`],
            ), lang), taskId);
            return;
          }

          const execDeptId = execAgent.department_id ?? latestTask?.department_id ?? departmentId;
          const execDeptName = execDeptId ? getDeptName(execDeptId) : "Unassigned";
          startTaskExecutionForAgent(taskId, execAgent, execDeptId, execDeptName);
          return;
        }

        if (isRound1Remediation && remediationLimitReached) {
          appendTaskLog(
            taskId,
            "system",
            `Review consensus round ${round}: remediation request cap reached (${REVIEW_MAX_REMEDIATION_REQUESTS}/task), skipping additional remediation`,
          );
          notifyCeo(pickL(l(
            [`[CEO OFFICE] '${taskTitle}' 보완 요청은 태스크당 최대 ${REVIEW_MAX_REMEDIATION_REQUESTS}회 정책에 따라 추가 보완 생성 없이 최종 판단 단계로 전환합니다.`],
            [`[CEO OFFICE] '${taskTitle}' reached the remediation-request cap (${REVIEW_MAX_REMEDIATION_REQUESTS} per task). Skipping additional remediation and moving to final decision.`],
            [`[CEO OFFICE] '${taskTitle}' はタスク当たり補完要請上限（${REVIEW_MAX_REMEDIATION_REQUESTS}回）に到達したため、追加補完を作成せず最終判断へ移行します。`],
            [`[CEO OFFICE] '${taskTitle}' 已达到每个任务最多 ${REVIEW_MAX_REMEDIATION_REQUESTS} 次整改请求上限，不再新增整改，转入最终判断。`],
          ), lang), taskId);
        }

        const forceReason = isRound2Merge
          ? "round2_no_more_remediation_allowed"
          : `round${round}_finalization`;
        appendTaskLog(
          taskId,
          "system",
          `Review consensus round ${round}: forcing finalization with documented residual risk (${forceReason})`,
        );

        if (isRound2Merge) {
          notifyCeo(pickL(l(
            [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 취합 회의에서 잔여 리스크를 문서화했습니다. 추가 보완 없이 라운드 3 최종 승인 회의로 전환합니다.`],
            [`[CEO OFFICE] In review round ${round} for '${taskTitle}', residual risks were documented during consolidation. Moving to round 3 final approval without additional remediation.`],
            [`[CEO OFFICE] '${taskTitle}' のレビューラウンド${round}集約会議で残余リスクを文書化しました。追加補完なしでラウンド3最終承認へ移行します。`],
            [`[CEO OFFICE] '${taskTitle}' 第${round}轮评审汇总会已完成剩余风险文档化。将不新增整改，直接转入第3轮最终审批。`],
          ), lang), taskId);
          if (meetingId) finishMeetingMinutes(meetingId, "completed");
          dismissLeadersFromCeoOffice(taskId, leaders);
          reviewRoundState.delete(taskId);
          reviewInFlight.delete(taskId);
          scheduleNextReviewRound(taskId, taskTitle, round, lang);
          return;
        }

        appendTaskReviewFinalMemo(taskId, round, transcript, lang, true);
        notifyCeo(pickL(l(
          [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round}에서 잔여 리스크를 최종 문서에 반영했습니다. 추가 보완 없이 최종 승인 판단으로 종료합니다.`],
          [`[CEO OFFICE] In review round ${round} for '${taskTitle}', residual risks were embedded in the final document package. Closing with final approval decision and no further remediation.`],
          [`[CEO OFFICE] '${taskTitle}' のレビューラウンド${round}で残余リスクを最終文書へ反映しました。追加補完なしで最終承認判断を完了します。`],
          [`[CEO OFFICE] '${taskTitle}' 第${round}轮评审已将剩余风险写入最终文档包，在不新增整改的前提下完成最终审批判断。`],
        ), lang), taskId);
        if (meetingId) finishMeetingMinutes(meetingId, "completed");
        dismissLeadersFromCeoOffice(taskId, leaders);
        reviewRoundState.delete(taskId);
        reviewInFlight.delete(taskId);
        onApproved();
        return;
      }

      if (deferredMonitoringLeaders.length > 0) {
        notifyCeo(pickL(l(
          [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round}에서 ${deferredMonitoringLeaders.length}개 보류 의견이 'MVP 범위 외 항목의 SLA 모니터링 전환'으로 분류되어 코드 병합 후 후속 체크리스트로 이관합니다.`],
          [`[CEO OFFICE] In review round ${round} for '${taskTitle}', ${deferredMonitoringLeaders.length} hold opinions were classified as MVP-out-of-scope and moved to post-merge SLA monitoring checklist.`],
          [`[CEO OFFICE] '${taskTitle}' のレビューラウンド${round}では、保留意見${deferredMonitoringLeaders.length}件を「MVP範囲外のSLA監視項目」へ振替し、コード統合後のチェックリストで追跡します。`],
          [`[CEO OFFICE] '${taskTitle}' 第${round}轮 Review 中，有 ${deferredMonitoringLeaders.length} 条保留意见被判定为 MVP 范围外事项，已转入合并后的 SLA 监控清单跟踪。`],
        ), lang), taskId);
      }

      if (isRound2Merge) {
        appendTaskLog(taskId, "system", `Review consensus round ${round}: merge consolidation complete`);
        notifyCeo(pickL(l(
          [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 ${round} 취합/머지 검토가 완료되었습니다. 라운드 3 최종 승인 회의로 전환합니다.`],
          [`[CEO OFFICE] Review round ${round} consolidation/merge review for '${taskTitle}' is complete. Moving to round 3 final approval.`],
          [`[CEO OFFICE] '${taskTitle}' のレビューラウンド${round}集約/マージ確認が完了しました。ラウンド3最終承認へ移行します。`],
          [`[CEO OFFICE] '${taskTitle}' 第${round}轮评审汇总/合并审查已完成，现转入第3轮最终审批。`],
        ), lang), taskId);
        if (meetingId) finishMeetingMinutes(meetingId, "completed");
        dismissLeadersFromCeoOffice(taskId, leaders);
        reviewRoundState.delete(taskId);
        reviewInFlight.delete(taskId);
        scheduleNextReviewRound(taskId, taskTitle, round, lang);
        return;
      }

      appendTaskLog(taskId, "system", `Review consensus round ${round}: all leaders approved`);
      if (isFinalDecisionRound) {
        appendTaskReviewFinalMemo(taskId, round, transcript, lang, deferredMonitoringLeaders.length > 0);
      }
      notifyCeo(pickL(l(
        [`[CEO OFFICE] '${taskTitle}' 전원 Approved 완료. Done 단계로 진행합니다.`],
        [`[CEO OFFICE] '${taskTitle}' is approved by all leaders. Proceeding to Done.`],
        [`[CEO OFFICE] '${taskTitle}' は全リーダー承認済みです。Doneへ進みます。`],
        [`[CEO OFFICE] '${taskTitle}'已获全体负责人批准，进入 Done 阶段。`],
      ), lang), taskId);
      if (meetingId) finishMeetingMinutes(meetingId, "completed");
      dismissLeadersFromCeoOffice(taskId, leaders);
      reviewRoundState.delete(taskId);
      reviewInFlight.delete(taskId);
      onApproved();
    } catch (err: any) {
      if (isTaskWorkflowInterrupted(taskId)) {
        if (meetingId) finishMeetingMinutes(meetingId, "failed");
        dismissLeadersFromCeoOffice(taskId, leaders);
        clearTaskWorkflowState(taskId);
        return;
      }
      const msg = err?.message ? String(err.message) : String(err);
      appendTaskLog(taskId, "error", `Review consensus meeting error: ${msg}`);
      const errLang = resolveLang(taskTitle);
      notifyCeo(pickL(l(
        [`[CEO OFFICE] '${taskTitle}' 리뷰 라운드 처리 중 오류가 발생했습니다: ${msg}`],
        [`[CEO OFFICE] Error while processing review round for '${taskTitle}': ${msg}`],
        [`[CEO OFFICE] '${taskTitle}' のレビューラウンド処理中にエラーが発生しました: ${msg}`],
        [`[CEO OFFICE] 处理'${taskTitle}'评审轮次时发生错误：${msg}`],
      ), errLang), taskId);
      if (meetingId) finishMeetingMinutes(meetingId, "failed");
      dismissLeadersFromCeoOffice(taskId, leaders);
      reviewInFlight.delete(taskId);
    }
  })();
}


  return {
    getLeadersByDepartmentIds,
    getAllActiveTeamLeaders,
    getTaskRelatedDepartmentIds,
    getTaskReviewLeaders,
    beginMeetingMinutes,
    appendMeetingMinuteEntry,
    finishMeetingMinutes,
    normalizeRevisionMemoNote,
    reserveReviewRevisionMemoItems,
    loadRecentReviewRevisionMemoItems,
    collectRevisionMemoItems,
    collectPlannedActionItems,
    appendTaskProjectMemo,
    appendTaskReviewFinalMemo,
    markAgentInMeeting,
    isAgentInMeeting,
    callLeadersToCeoOffice,
    dismissLeadersFromCeoOffice,
    emitMeetingSpeech,
    startReviewConsensusMeeting,
  };
}
