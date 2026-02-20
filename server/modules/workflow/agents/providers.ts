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

export function initializeWorkflowAgentProviders(ctx: any): any {
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
  const detectLang = __ctx.detectLang;
  const detectTargetDepartments = __ctx.detectTargetDepartments;
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

  const createSubtaskFromCli = __ctx.createSubtaskFromCli;
  const completeSubtaskFromCli = __ctx.completeSubtaskFromCli;
// ---------------------------------------------------------------------------
// HTTP Agent: direct API calls for copilot/antigravity (no CLI dependency)
// ---------------------------------------------------------------------------
const ANTIGRAVITY_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com",
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
];
const ANTIGRAVITY_DEFAULT_PROJECT = "rising-fact-p41fc";
let copilotTokenCache: { token: string; baseUrl: string; expiresAt: number; sourceHash: string } | null = null;
let antigravityProjectCache: { projectId: string; tokenHash: string } | null = null;
let httpAgentCounter = Date.now() % 1_000_000;
let cachedModels: { data: Record<string, string[]>; loadedAt: number } | null = null;
const MODELS_CACHE_TTL = 60_000;

interface DecryptedOAuthToken {
  id: string | null;
  provider: string;
  source: string | null;
  label: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  email: string | null;
  status?: string;
  priority?: number;
  modelOverride?: string | null;
  failureCount?: number;
  lastError?: string | null;
  lastErrorAt?: number | null;
  lastSuccessAt?: number | null;
}

function oauthProviderPrefix(provider: string): string {
  return provider === "github" ? "Copi" : "Anti";
}

function normalizeOAuthProvider(provider: string): "github" | "google_antigravity" | null {
  if (provider === "github-copilot" || provider === "github" || provider === "copilot") return "github";
  if (provider === "antigravity" || provider === "google_antigravity") return "google_antigravity";
  return null;
}

function getOAuthAccountDisplayName(account: DecryptedOAuthToken): string {
  if (account.label) return account.label;
  if (account.email) return account.email;
  const prefix = oauthProviderPrefix(account.provider);
  return `${prefix}-${(account.id ?? "unknown").slice(0, 6)}`;
}

function getNextOAuthLabel(provider: string): string {
  const normalizedProvider = normalizeOAuthProvider(provider) ?? provider;
  const prefix = oauthProviderPrefix(normalizedProvider);
  const rows = db.prepare(
    "SELECT label FROM oauth_accounts WHERE provider = ?"
  ).all(normalizedProvider) as Array<{ label: string | null }>;
  let maxSeq = 0;
  for (const row of rows) {
    if (!row.label) continue;
    const m = row.label.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  return `${prefix}-${maxSeq + 1}`;
}

function getOAuthAutoSwapEnabled(): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'oauthAutoSwap'").get() as { value: string } | undefined;
  if (!row) return true;
  const v = String(row.value).toLowerCase().trim();
  return !(v === "false" || v === "0" || v === "off" || v === "no");
}

const oauthDispatchCursor = new Map<string, number>();

function rotateOAuthAccounts(provider: string, accounts: DecryptedOAuthToken[]): DecryptedOAuthToken[] {
  if (accounts.length <= 1) return accounts;
  const current = oauthDispatchCursor.get(provider) ?? -1;
  const next = (current + 1) % accounts.length;
  oauthDispatchCursor.set(provider, next);
  if (next === 0) return accounts;
  return [...accounts.slice(next), ...accounts.slice(0, next)];
}

function prioritizeOAuthAccount(
  accounts: DecryptedOAuthToken[],
  preferredAccountId?: string | null,
): DecryptedOAuthToken[] {
  if (!preferredAccountId || accounts.length <= 1) return accounts;
  const idx = accounts.findIndex((a) => a.id === preferredAccountId);
  if (idx <= 0) return accounts;
  const [picked] = accounts.splice(idx, 1);
  return [picked, ...accounts];
}

function markOAuthAccountFailure(accountId: string, message: string): void {
  db.prepare(`
    UPDATE oauth_accounts
    SET failure_count = COALESCE(failure_count, 0) + 1,
        last_error = ?,
        last_error_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(message.slice(0, 1500), nowMs(), nowMs(), accountId);
}

function markOAuthAccountSuccess(accountId: string): void {
  db.prepare(`
    UPDATE oauth_accounts
    SET failure_count = 0,
        last_error = NULL,
        last_error_at = NULL,
        last_success_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(nowMs(), nowMs(), accountId);
}

function getOAuthAccounts(provider: string, includeDisabled = false): DecryptedOAuthToken[] {
  const normalizedProvider = normalizeOAuthProvider(provider);
  if (!normalizedProvider) return [];
  const rows = db.prepare(`
    SELECT
      id, provider, source, label, email, scope, expires_at,
      access_token_enc, refresh_token_enc, status, priority,
      model_override, failure_count, last_error, last_error_at, last_success_at
    FROM oauth_accounts
    WHERE provider = ?
      ${includeDisabled ? "" : "AND status = 'active'"}
    ORDER BY priority ASC, updated_at DESC
  `).all(normalizedProvider) as Array<{
    id: string;
    provider: string;
    source: string | null;
    label: string | null;
    email: string | null;
    scope: string | null;
    expires_at: number | null;
    access_token_enc: string | null;
    refresh_token_enc: string | null;
    status: string;
    priority: number;
    model_override: string | null;
    failure_count: number;
    last_error: string | null;
    last_error_at: number | null;
    last_success_at: number | null;
  }>;

  const accounts: DecryptedOAuthToken[] = [];
  for (const row of rows) {
    try {
      accounts.push({
        id: row.id,
        provider: row.provider,
        source: row.source,
        label: row.label,
        accessToken: row.access_token_enc ? decryptSecret(row.access_token_enc) : null,
        refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null,
        expiresAt: row.expires_at,
        email: row.email,
        status: row.status,
        priority: row.priority,
        modelOverride: row.model_override,
        failureCount: row.failure_count,
        lastError: row.last_error,
        lastErrorAt: row.last_error_at,
        lastSuccessAt: row.last_success_at,
      });
    } catch {
      // skip undecryptable account
    }
  }
  return accounts;
}

function getPreferredOAuthAccounts(
  provider: string,
  opts: { includeStandby?: boolean } = {},
): DecryptedOAuthToken[] {
  const normalizedProvider = normalizeOAuthProvider(provider);
  if (!normalizedProvider) return [];
  ensureOAuthActiveAccount(normalizedProvider);
  const accounts = getOAuthAccounts(normalizedProvider, false);
  if (accounts.length === 0) return [];
  const activeIds = getActiveOAuthAccountIds(normalizedProvider);
  if (activeIds.length === 0) return accounts;
  const activeSet = new Set(activeIds);
  const selected = accounts.filter((a) => a.id && activeSet.has(a.id));
  if (selected.length === 0) return accounts;
  if (!opts.includeStandby) return selected;
  const standby = accounts.filter((a) => !(a.id && activeSet.has(a.id)));
  return [...selected, ...standby];
}

function getDecryptedOAuthToken(provider: string): DecryptedOAuthToken | null {
  const preferred = getPreferredOAuthAccounts(provider)[0];
  if (preferred) return preferred;

  // Legacy fallback for existing installations before oauth_accounts migration.
  const row = db
    .prepare("SELECT access_token_enc, refresh_token_enc, expires_at, email FROM oauth_credentials WHERE provider = ?")
    .get(provider) as { access_token_enc: string | null; refresh_token_enc: string | null; expires_at: number | null; email: string | null } | undefined;
  if (!row) return null;
  return {
    id: null,
    provider,
    source: "legacy",
    label: null,
    accessToken: row.access_token_enc ? decryptSecret(row.access_token_enc) : null,
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null,
    expiresAt: row.expires_at,
    email: row.email,
  };
}

function getProviderModelConfig(): Record<string, { model: string; subModel?: string; reasoningLevel?: string; subModelReasoningLevel?: string }> {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'providerModelConfig'").get() as { value: string } | undefined;
  return row ? JSON.parse(row.value) : {};
}

async function refreshGoogleToken(credential: DecryptedOAuthToken): Promise<string> {
  const expiresAtMs = credential.expiresAt && credential.expiresAt < 1e12
    ? credential.expiresAt * 1000
    : credential.expiresAt;
  if (credential.accessToken && expiresAtMs && expiresAtMs > Date.now() + 60_000) {
    return credential.accessToken;
  }
  if (!credential.refreshToken) {
    throw new Error("Google OAuth token expired and no refresh_token available");
  }
  const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID ?? BUILTIN_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? BUILTIN_GOOGLE_CLIENT_SECRET;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credential.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token refresh failed (${resp.status}): ${text}`);
  }
  const data = await resp.json() as { access_token: string; expires_in?: number };
  const newExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;
  // Update DB with new access token
  const now = nowMs();
  const accessEnc = encryptSecret(data.access_token);
  if (credential.id) {
    db.prepare(`
      UPDATE oauth_accounts
      SET access_token_enc = ?, expires_at = ?, updated_at = ?, last_success_at = ?, last_error = NULL, last_error_at = NULL
      WHERE id = ?
    `).run(accessEnc, newExpiresAt, now, now, credential.id);
  }
  db.prepare(
    "UPDATE oauth_credentials SET access_token_enc = ?, expires_at = ?, updated_at = ? WHERE provider = 'google_antigravity'"
  ).run(accessEnc, newExpiresAt, now);
  return data.access_token;
}

async function exchangeCopilotToken(githubToken: string): Promise<{ token: string; baseUrl: string; expiresAt: number }> {
  const sourceHash = createHash("sha256").update(githubToken).digest("hex").slice(0, 16);
  if (copilotTokenCache
      && copilotTokenCache.expiresAt > Date.now() + 5 * 60_000
      && copilotTokenCache.sourceHash === sourceHash) {
    return copilotTokenCache;
  }
  const resp = await fetch("https://api.github.com/copilot_internal/v2/token", {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/json",
      "User-Agent": "climpire",
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Copilot token exchange failed (${resp.status}): ${text}`);
  }
  const data = await resp.json() as { token: string; expires_at: number; endpoints?: { api?: string } };
  let baseUrl = "https://api.individual.githubcopilot.com";
  const proxyMatch = data.token.match(/proxy-ep=([^;]+)/);
  if (proxyMatch) {
    baseUrl = `https://${proxyMatch[1].replace(/^proxy\./, "api.")}`;
  }
  if (data.endpoints?.api) {
    baseUrl = data.endpoints.api.replace(/\/$/, "");
  }
  const expiresAt = data.expires_at * 1000;
  copilotTokenCache = { token: data.token, baseUrl, expiresAt, sourceHash };
  return copilotTokenCache;
}

async function loadCodeAssistProject(accessToken: string, signal?: AbortSignal): Promise<string> {
  const tokenHash = createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
  if (antigravityProjectCache && antigravityProjectCache.tokenHash === tokenHash) {
    return antigravityProjectCache.projectId;
  }
  for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
    try {
      const resp = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "google-api-nodejs-client/9.15.1",
          "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
          "Client-Metadata": JSON.stringify({ ideType: "ANTIGRAVITY", platform: process.platform === "win32" ? "WINDOWS" : "MACOS", pluginType: "GEMINI" }),
        },
        body: JSON.stringify({
          metadata: { ideType: "ANTIGRAVITY", platform: process.platform === "win32" ? "WINDOWS" : "MACOS", pluginType: "GEMINI" },
        }),
        signal,
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      const proj = data?.cloudaicompanionProject?.id ?? data?.cloudaicompanionProject;
      if (typeof proj === "string" && proj) {
        antigravityProjectCache = { projectId: proj, tokenHash };
        return proj;
      }
    } catch { /* try next endpoint */ }
  }
  antigravityProjectCache = { projectId: ANTIGRAVITY_DEFAULT_PROJECT, tokenHash };
  return ANTIGRAVITY_DEFAULT_PROJECT;
}

// ---------------------------------------------------------------------------
// HTTP agent subtask detection (plain-text accumulator for plan JSON patterns)
// ---------------------------------------------------------------------------
function parseHttpAgentSubtasks(taskId: string, textChunk: string, accum: { buf: string }): void {
  accum.buf += textChunk;
  // Only scan when we see a closing brace (potential JSON end)
  if (!accum.buf.includes("}")) return;

  // Detect plan: {"subtasks": [...]}
  const planMatch = accum.buf.match(/\{"subtasks"\s*:\s*\[.*?\]\}/s);
  if (planMatch) {
    try {
      const plan = JSON.parse(planMatch[0]) as { subtasks: { title: string }[] };
      for (const st of plan.subtasks) {
        const stId = `http-plan-${st.title.slice(0, 30).replace(/\s/g, "-")}-${Date.now()}`;
        const existing = db.prepare(
          "SELECT id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done'"
        ).get(taskId, st.title) as { id: string } | undefined;
        if (!existing) {
          createSubtaskFromCli(taskId, stId, st.title);
        }
      }
    } catch { /* ignore malformed JSON */ }
    // Remove matched portion to avoid re-detection
    accum.buf = accum.buf.slice(accum.buf.indexOf(planMatch[0]) + planMatch[0].length);
  }

  // Detect completion: {"subtask_done": "..."}
  const doneMatch = accum.buf.match(/\{"subtask_done"\s*:\s*"(.+?)"\}/);
  if (doneMatch) {
    const doneTitle = doneMatch[1];
    const sub = db.prepare(
      "SELECT cli_tool_use_id FROM subtasks WHERE task_id = ? AND title = ? AND status != 'done' LIMIT 1"
    ).get(taskId, doneTitle) as { cli_tool_use_id: string } | undefined;
    if (sub) completeSubtaskFromCli(sub.cli_tool_use_id);
    accum.buf = accum.buf.slice(accum.buf.indexOf(doneMatch[0]) + doneMatch[0].length);
  }

  // Prevent unbounded growth: keep only last 2KB
  if (accum.buf.length > 2048) {
    accum.buf = accum.buf.slice(-1024);
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

// Parse OpenAI-compatible SSE stream (for Copilot)
async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  safeWrite: (text: string) => boolean,
  taskId?: string,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  const subtaskAccum = { buf: "" };

  const processLine = (trimmed: string) => {
    if (!trimmed || trimmed.startsWith(":")) return;
    if (!trimmed.startsWith("data: ")) return;
    if (trimmed === "data: [DONE]") return;
    try {
      const data = JSON.parse(trimmed.slice(6));
      const delta = data.choices?.[0]?.delta;
      if (delta?.content) {
        const text = normalizeStreamChunk(delta.content);
        if (!text) return;
        safeWrite(text);
        if (taskId) {
          broadcast("cli_output", { task_id: taskId, stream: "stdout", data: text });
          parseHttpAgentSubtasks(taskId, text, subtaskAccum);
        }
      }
    } catch { /* ignore */ }
  };

  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    if (signal.aborted) break;
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) processLine(line.trim());
  }
  if (buffer.trim()) processLine(buffer.trim());
}

// Parse Gemini/Antigravity SSE stream
async function parseGeminiSSEStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  safeWrite: (text: string) => boolean,
  taskId?: string,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  const subtaskAccum = { buf: "" };

  const processLine = (trimmed: string) => {
    if (!trimmed || trimmed.startsWith(":")) return;
    if (!trimmed.startsWith("data: ")) return;
    try {
      const data = JSON.parse(trimmed.slice(6));
      const candidates = data.response?.candidates ?? data.candidates;
      if (Array.isArray(candidates)) {
        for (const candidate of candidates) {
          const parts = candidate?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part.text) {
                const text = normalizeStreamChunk(part.text);
                if (!text) continue;
                safeWrite(text);
                if (taskId) {
                  broadcast("cli_output", { task_id: taskId, stream: "stdout", data: text });
                  parseHttpAgentSubtasks(taskId, text, subtaskAccum);
                }
              }
            }
          }
        }
      }
    } catch { /* ignore */ }
  };

  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    if (signal.aborted) break;
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) processLine(line.trim());
  }
  if (buffer.trim()) processLine(buffer.trim());
}

function resolveCopilotModel(rawModel: string): string {
  return rawModel.includes("/") ? rawModel.split("/").pop()! : rawModel;
}

function resolveAntigravityModel(rawModel: string): string {
  let model = rawModel;
  if (model.includes("antigravity-")) {
    model = model.slice(model.indexOf("antigravity-") + "antigravity-".length);
  } else if (model.includes("/")) {
    model = model.split("/").pop()!;
  }
  return model;
}

async function executeCopilotAgent(
  prompt: string,
  projectPath: string,
  logStream: fs.WriteStream,
  signal: AbortSignal,
  taskId?: string,
  preferredAccountId?: string | null,
  safeWriteOverride?: (text: string) => boolean,
): Promise<void> {
  const safeWrite = safeWriteOverride ?? createSafeLogStreamOps(logStream).safeWrite;
  const modelConfig = getProviderModelConfig();
  const defaultRawModel = modelConfig.copilot?.model || "github-copilot/gpt-4o";
  const autoSwap = getOAuthAutoSwapEnabled();
  const preferred = getPreferredOAuthAccounts("github").filter((a) => Boolean(a.accessToken));
  const baseAccounts = prioritizeOAuthAccount(preferred, preferredAccountId);
  const hasPinnedAccount = Boolean(preferredAccountId) && baseAccounts.some((a) => a.id === preferredAccountId);
  const accounts = hasPinnedAccount ? baseAccounts : rotateOAuthAccounts("github", baseAccounts);
  if (accounts.length === 0) {
    throw new Error("No GitHub OAuth token found. Connect GitHub Copilot first.");
  }

  const maxAttempts = autoSwap ? accounts.length : Math.min(accounts.length, 1);
  let lastError: Error | null = null;

  for (let i = 0; i < maxAttempts; i += 1) {
    const account = accounts[i];
    if (!account.accessToken) continue;
    const accountName = getOAuthAccountDisplayName(account);
    const rawModel = account.modelOverride || defaultRawModel;
    const model = resolveCopilotModel(rawModel);

    const header = `[copilot] Account: ${accountName}${account.modelOverride ? ` (model override: ${rawModel})` : ""}\n`;
    safeWrite(header);
    if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: header });

    try {
      safeWrite("[copilot] Exchanging Copilot token...\n");
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: "[copilot] Exchanging Copilot token...\n" });
      const { token, baseUrl } = await exchangeCopilotToken(account.accessToken);
      safeWrite(`[copilot] Model: ${model}, Base: ${baseUrl}\n---\n`);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: `[copilot] Model: ${model}, Base: ${baseUrl}\n---\n` });

      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Editor-Version": "climpire/1.0.0",
          "Copilot-Integration-Id": "vscode-chat",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `You are a coding assistant. Project path: ${projectPath}` },
            { role: "user", content: prompt },
          ],
          stream: true,
        }),
        signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Copilot API error (${resp.status}): ${text}`);
      }

      await parseSSEStream(resp.body!, signal, safeWrite, taskId);
      markOAuthAccountSuccess(account.id!);
      if (i > 0 && autoSwap && account.id) {
        setActiveOAuthAccount("github", account.id);
        const swapMsg = `[copilot] Promoted account in active pool: ${accountName}\n`;
        safeWrite(swapMsg);
        if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: swapMsg });
      }
      safeWrite(`\n---\n[copilot] Done.\n`);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: "\n---\n[copilot] Done.\n" });
      return;
    } catch (err: any) {
      if (signal.aborted || err?.name === "AbortError") throw err;
      const msg = err?.message ? String(err.message) : String(err);
      markOAuthAccountFailure(account.id!, msg);
      const failMsg = `[copilot] Account ${accountName} failed: ${msg}\n`;
      safeWrite(failMsg);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: failMsg });
      lastError = err instanceof Error ? err : new Error(msg);
      if (autoSwap && i + 1 < maxAttempts) {
        const nextName = getOAuthAccountDisplayName(accounts[i + 1]);
        const swapMsg = `[copilot] Trying fallback account: ${nextName}\n`;
        safeWrite(swapMsg);
        if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: swapMsg });
      }
    }
  }

  throw lastError ?? new Error("No runnable GitHub Copilot account available.");
}

async function executeAntigravityAgent(
  prompt: string,
  logStream: fs.WriteStream,
  signal: AbortSignal,
  taskId?: string,
  preferredAccountId?: string | null,
  safeWriteOverride?: (text: string) => boolean,
): Promise<void> {
  const safeWrite = safeWriteOverride ?? createSafeLogStreamOps(logStream).safeWrite;
  const modelConfig = getProviderModelConfig();
  const defaultRawModel = modelConfig.antigravity?.model || "google/antigravity-gemini-2.5-pro";
  const autoSwap = getOAuthAutoSwapEnabled();
  const preferred = getPreferredOAuthAccounts("google_antigravity")
    .filter((a) => Boolean(a.accessToken || a.refreshToken));
  const baseAccounts = prioritizeOAuthAccount(preferred, preferredAccountId);
  const hasPinnedAccount = Boolean(preferredAccountId) && baseAccounts.some((a) => a.id === preferredAccountId);
  const accounts = hasPinnedAccount ? baseAccounts : rotateOAuthAccounts("google_antigravity", baseAccounts);
  if (accounts.length === 0) {
    throw new Error("No Google OAuth token found. Connect Antigravity first.");
  }

  const maxAttempts = autoSwap ? accounts.length : Math.min(accounts.length, 1);
  let lastError: Error | null = null;

  for (let i = 0; i < maxAttempts; i += 1) {
    const account = accounts[i];
    const accountName = getOAuthAccountDisplayName(account);
    const rawModel = account.modelOverride || defaultRawModel;
    const model = resolveAntigravityModel(rawModel);

    const header = `[antigravity] Account: ${accountName}${account.modelOverride ? ` (model override: ${rawModel})` : ""}\n`;
    safeWrite(header);
    if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: header });

    try {
      safeWrite(`[antigravity] Refreshing token...\n`);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: "[antigravity] Refreshing token...\n" });
      const accessToken = await refreshGoogleToken(account);

      safeWrite(`[antigravity] Discovering project...\n`);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: "[antigravity] Discovering project...\n" });
      const projectId = await loadCodeAssistProject(accessToken, signal);
      safeWrite(`[antigravity] Model: ${model}, Project: ${projectId}\n---\n`);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: `[antigravity] Model: ${model}, Project: ${projectId}\n---\n` });

      const baseEndpoint = ANTIGRAVITY_ENDPOINTS[0];
      const url = `${baseEndpoint}/v1internal:streamGenerateContent?alt=sse`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": `antigravity/1.15.8 ${process.platform === "darwin" ? "darwin/arm64" : "linux/amd64"}`,
          "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
          "Client-Metadata": JSON.stringify({ ideType: "ANTIGRAVITY", platform: process.platform === "win32" ? "WINDOWS" : "MACOS", pluginType: "GEMINI" }),
        },
        body: JSON.stringify({
          project: projectId,
          model,
          requestType: "agent",
          userAgent: "antigravity",
          requestId: `agent-${randomUUID()}`,
          request: {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          },
        }),
        signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Antigravity API error (${resp.status}): ${text}`);
      }

      await parseGeminiSSEStream(resp.body!, signal, safeWrite, taskId);
      markOAuthAccountSuccess(account.id!);
      if (i > 0 && autoSwap && account.id) {
        setActiveOAuthAccount("google_antigravity", account.id);
        const swapMsg = `[antigravity] Promoted account in active pool: ${accountName}\n`;
        safeWrite(swapMsg);
        if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: swapMsg });
      }
      safeWrite(`\n---\n[antigravity] Done.\n`);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: "\n---\n[antigravity] Done.\n" });
      return;
    } catch (err: any) {
      if (signal.aborted || err?.name === "AbortError") throw err;
      const msg = err?.message ? String(err.message) : String(err);
      markOAuthAccountFailure(account.id!, msg);
      const failMsg = `[antigravity] Account ${accountName} failed: ${msg}\n`;
      safeWrite(failMsg);
      if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: failMsg });
      lastError = err instanceof Error ? err : new Error(msg);
      if (autoSwap && i + 1 < maxAttempts) {
        const nextName = getOAuthAccountDisplayName(accounts[i + 1]);
        const swapMsg = `[antigravity] Trying fallback account: ${nextName}\n`;
        safeWrite(swapMsg);
        if (taskId) broadcast("cli_output", { task_id: taskId, stream: "stderr", data: swapMsg });
      }
    }
  }

  throw lastError ?? new Error("No runnable Antigravity account available.");
}

function launchHttpAgent(
  taskId: string,
  agent: "copilot" | "antigravity",
  prompt: string,
  projectPath: string,
  logPath: string,
  controller: AbortController,
  fakePid: number,
  preferredOAuthAccountId?: string | null,
): void {
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);

  const promptPath = path.join(logsDir, `${taskId}.prompt.txt`);
  fs.writeFileSync(promptPath, prompt, "utf8");

  // Register mock ChildProcess so stop logic works uniformly
  const mockProc = {
    pid: fakePid,
    kill: () => { controller.abort(); return true; },
  } as unknown as ChildProcess;
  activeProcesses.set(taskId, mockProc);

  const runTask = (async () => {
    let exitCode = 0;
    try {
      if (agent === "copilot") {
        await executeCopilotAgent(
          prompt,
          projectPath,
          logStream,
          controller.signal,
          taskId,
          preferredOAuthAccountId ?? null,
          safeWrite,
        );
      } else {
        await executeAntigravityAgent(
          prompt,
          logStream,
          controller.signal,
          taskId,
          preferredOAuthAccountId ?? null,
          safeWrite,
        );
      }
    } catch (err: any) {
      exitCode = 1;
      if (err.name !== "AbortError") {
        const msg = normalizeStreamChunk(`[${agent}] Error: ${err.message}\n`);
        safeWrite(msg);
        broadcast("cli_output", { task_id: taskId, stream: "stderr", data: msg });
        console.error(`[Claw-Empire] HTTP agent error (${agent}, task ${taskId}): ${err.message}`);
      } else {
        const msg = normalizeStreamChunk(`[${agent}] Aborted by user\n`);
        safeWrite(msg);
        broadcast("cli_output", { task_id: taskId, stream: "stderr", data: msg });
      }
    } finally {
      await new Promise<void>((resolve) => safeEnd(resolve));
      try { fs.unlinkSync(promptPath); } catch { /* ignore */ }
      handleTaskRunComplete(taskId, exitCode);
    }
  })();

  runTask.catch(() => {});
}

function killPidTree(pid: number): void {
  if (pid <= 0) return;

  if (process.platform === "win32") {
    // Use synchronous taskkill so stop/delete reflects real termination attempt.
    try {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 8000 });
    } catch { /* ignore */ }
    return;
  }

  const signalTree = (sig: NodeJS.Signals) => {
    try { process.kill(-pid, sig); } catch { /* ignore */ }
    try { process.kill(pid, sig); } catch { /* ignore */ }
  };
  const isAlive = () => isPidAlive(pid);

  // 1) Graceful stop first
  signalTree("SIGTERM");
  // 2) Escalate if process ignores SIGTERM
  setTimeout(() => {
    if (isAlive()) signalTree("SIGKILL");
  }, 1200);
}

function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function interruptPidTree(pid: number): void {
  if (pid <= 0) return;

  if (process.platform === "win32") {
    // Windows has no reliable SIGINT tree semantics for spawned shells.
    // Try non-force taskkill first, then force if it survives.
    try { execFileSync("taskkill", ["/pid", String(pid), "/T"], { stdio: "ignore", timeout: 8000 }); } catch { /* ignore */ }
    setTimeout(() => {
      if (isPidAlive(pid)) {
        try { execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 8000 }); } catch { /* ignore */ }
      }
    }, 1200);
    return;
  }

  const signalTree = (sig: NodeJS.Signals) => {
    try { process.kill(-pid, sig); } catch { /* ignore */ }
    try { process.kill(pid, sig); } catch { /* ignore */ }
  };

  // SIGINT ~= terminal break (Ctrl+C / ESC-like interruption semantics)
  signalTree("SIGINT");
  setTimeout(() => {
    if (isPidAlive(pid)) signalTree("SIGTERM");
  }, 1200);
  setTimeout(() => {
    if (isPidAlive(pid)) signalTree("SIGKILL");
  }, 2600);
}

// ---------------------------------------------------------------------------
// Task log helpers
// ---------------------------------------------------------------------------
function appendTaskLog(taskId: string, kind: string, message: string): void {
  const t = nowMs();
  db.prepare(
    "INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, ?, ?, ?)"
  ).run(taskId, kind, message, t);
}

// ---------------------------------------------------------------------------
// CLI Detection (ported from claw-kanban)
// ---------------------------------------------------------------------------
interface CliToolStatus {
  installed: boolean;
  version: string | null;
  authenticated: boolean;
  authHint: string;
}

type CliStatusResult = Record<string, CliToolStatus>;

let cachedCliStatus: { data: CliStatusResult; loadedAt: number } | null = null;
const CLI_STATUS_TTL = 30_000;

interface CliToolDef {
  name: string;
  authHint: string;
  checkAuth: () => boolean;
}

function jsonHasKey(filePath: string, key: string): boolean {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const j = JSON.parse(raw);
    return j != null && typeof j === "object" && key in j && j[key] != null;
  } catch {
    return false;
  }
}

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 2;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CLI Usage Types
// ---------------------------------------------------------------------------
interface CliUsageWindow {
  label: string;
  utilization: number;
  resetsAt: string | null;
}

interface CliUsageEntry {
  windows: CliUsageWindow[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Credential Readers
// ---------------------------------------------------------------------------
function readClaudeToken(): string | null {
  // macOS Keychain first (primary on macOS)
  if (process.platform === "darwin") {
    try {
      const raw = execFileSync("security", [
        "find-generic-password", "-s", "Claude Code-credentials", "-w",
      ], { timeout: 3000 }).toString().trim();
      const j = JSON.parse(raw);
      if (j?.claudeAiOauth?.accessToken) return j.claudeAiOauth.accessToken;
    } catch { /* ignore */ }
  }
  // Fallback: file on disk
  const home = os.homedir();
  try {
    const credsPath = path.join(home, ".claude", ".credentials.json");
    if (fs.existsSync(credsPath)) {
      const j = JSON.parse(fs.readFileSync(credsPath, "utf8"));
      if (j?.claudeAiOauth?.accessToken) return j.claudeAiOauth.accessToken;
    }
  } catch { /* ignore */ }
  return null;
}

function readCodexTokens(): { access_token: string; account_id: string } | null {
  try {
    const authPath = path.join(os.homedir(), ".codex", "auth.json");
    const j = JSON.parse(fs.readFileSync(authPath, "utf8"));
    if (j?.tokens?.access_token && j?.tokens?.account_id) {
      return { access_token: j.tokens.access_token, account_id: j.tokens.account_id };
    }
  } catch { /* ignore */ }
  return null;
}

// Gemini OAuth refresh credentials must come from env in public deployments.
const GEMINI_OAUTH_CLIENT_ID =
  process.env.GEMINI_OAUTH_CLIENT_ID ?? process.env.OAUTH_GOOGLE_CLIENT_ID ?? "";
const GEMINI_OAUTH_CLIENT_SECRET =
  process.env.GEMINI_OAUTH_CLIENT_SECRET ?? process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "";

interface GeminiCreds {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  source: "keychain" | "file";
}

function readGeminiCredsFromKeychain(): GeminiCreds | null {
  if (process.platform !== "darwin") return null;
  try {
    const raw = execFileSync("security", [
      "find-generic-password", "-s", "gemini-cli-oauth", "-a", "main-account", "-w",
    ], { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (!stored?.token?.accessToken) return null;
    return {
      access_token: stored.token.accessToken,
      refresh_token: stored.token.refreshToken ?? "",
      expiry_date: stored.token.expiresAt ?? 0,
      source: "keychain",
    };
  } catch { return null; }
}

function readGeminiCredsFromFile(): GeminiCreds | null {
  try {
    const p = path.join(os.homedir(), ".gemini", "oauth_creds.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (j?.access_token) {
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token ?? "",
        expiry_date: j.expiry_date ?? 0,
        source: "file",
      };
    }
  } catch { /* ignore */ }
  return null;
}

function readGeminiCreds(): GeminiCreds | null {
  // macOS Keychain first, then file fallback
  return readGeminiCredsFromKeychain() ?? readGeminiCredsFromFile();
}

async function freshGeminiToken(): Promise<string | null> {
  const creds = readGeminiCreds();
  if (!creds) return null;
  // If not expired (5-minute buffer), reuse
  if (creds.expiry_date > Date.now() + 300_000) return creds.access_token;
  // Cannot refresh without refresh_token
  if (!creds.refresh_token) return creds.access_token; // try existing token anyway
  // Public repo safety: no embedded secrets, so refresh requires explicit env config.
  if (!GEMINI_OAUTH_CLIENT_ID || !GEMINI_OAUTH_CLIENT_SECRET) return null;
  // Refresh using Gemini CLI's public OAuth client credentials
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GEMINI_OAUTH_CLIENT_ID,
        client_secret: GEMINI_OAUTH_CLIENT_SECRET,
        refresh_token: creds.refresh_token,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return creds.access_token; // fall back to existing token
    const data = await resp.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
    if (!data.access_token) return creds.access_token;
    // Persist refreshed token back to file (only if source was file)
    if (creds.source === "file") {
      try {
        const p = path.join(os.homedir(), ".gemini", "oauth_creds.json");
        const raw = JSON.parse(fs.readFileSync(p, "utf8"));
        raw.access_token = data.access_token;
        if (data.refresh_token) raw.refresh_token = data.refresh_token;
        raw.expiry_date = Date.now() + (data.expires_in ?? 3600) * 1000;
        fs.writeFileSync(p, JSON.stringify(raw, null, 2), { mode: 0o600 });
      } catch { /* ignore write failure */ }
    }
    return data.access_token;
  } catch { return creds.access_token; } // fall back to existing token on network error
}

// ---------------------------------------------------------------------------
// Provider Fetch Functions
// ---------------------------------------------------------------------------

// Claude: utilization is already 0-100 (percentage), NOT a fraction
async function fetchClaudeUsage(): Promise<CliUsageEntry> {
  const token = readClaudeToken();
  if (!token) return { windows: [], error: "unauthenticated" };
  try {
    const resp = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { windows: [], error: `http_${resp.status}` };
    const data = await resp.json() as Record<string, { utilization?: number; resets_at?: string } | null>;
    const windows: CliUsageWindow[] = [];
    const labelMap: Record<string, string> = {
      five_hour: "5-hour",
      seven_day: "7-day",
      seven_day_sonnet: "7-day Sonnet",
      seven_day_opus: "7-day Opus",
    };
    for (const [key, label] of Object.entries(labelMap)) {
      const entry = data[key];
      if (entry) {
        windows.push({
          label,
          utilization: Math.round(entry.utilization ?? 0) / 100, // API returns 0-100, normalize to 0-1
          resetsAt: entry.resets_at ?? null,
        });
      }
    }
    return { windows, error: null };
  } catch {
    return { windows: [], error: "unavailable" };
  }
}

// Codex: uses primary_window/secondary_window with used_percent (0-100), reset_at is Unix seconds
async function fetchCodexUsage(): Promise<CliUsageEntry> {
  const tokens = readCodexTokens();
  if (!tokens) return { windows: [], error: "unauthenticated" };
  try {
    const resp = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "ChatGPT-Account-Id": tokens.account_id,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { windows: [], error: `http_${resp.status}` };
    const data = await resp.json() as {
      rate_limit?: {
        primary_window?: { used_percent?: number; reset_at?: number };
        secondary_window?: { used_percent?: number; reset_at?: number };
      };
    };
    const windows: CliUsageWindow[] = [];
    if (data.rate_limit?.primary_window) {
      const pw = data.rate_limit.primary_window;
      windows.push({
        label: "5-hour",
        utilization: (pw.used_percent ?? 0) / 100,
        resetsAt: pw.reset_at ? new Date(pw.reset_at * 1000).toISOString() : null,
      });
    }
    if (data.rate_limit?.secondary_window) {
      const sw = data.rate_limit.secondary_window;
      windows.push({
        label: "7-day",
        utilization: (sw.used_percent ?? 0) / 100,
        resetsAt: sw.reset_at ? new Date(sw.reset_at * 1000).toISOString() : null,
      });
    }
    return { windows, error: null };
  } catch {
    return { windows: [], error: "unavailable" };
  }
}

// Gemini: requires project ID from loadCodeAssist, then POST retrieveUserQuota
let geminiProjectCache: { id: string; fetchedAt: number } | null = null;
const GEMINI_PROJECT_TTL = 300_000; // 5 minutes

async function getGeminiProjectId(token: string): Promise<string | null> {
  // 1. Environment variable (CI / custom setups)
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (envProject) return envProject;

  // 2. Gemini CLI settings file
  try {
    const settingsPath = path.join(os.homedir(), ".gemini", "settings.json");
    const j = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (j?.cloudaicompanionProject) return j.cloudaicompanionProject;
  } catch { /* ignore */ }

  // 3. In-memory cache with TTL
  if (geminiProjectCache && Date.now() - geminiProjectCache.fetchedAt < GEMINI_PROJECT_TTL) {
    return geminiProjectCache.id;
  }

  // 4. Fetch via loadCodeAssist API (discovers project for the authenticated user)
  try {
    const resp = await fetch("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: { ideType: "GEMINI_CLI", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { cloudaicompanionProject?: string };
    if (data.cloudaicompanionProject) {
      geminiProjectCache = { id: data.cloudaicompanionProject, fetchedAt: Date.now() };
      return geminiProjectCache.id;
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchGeminiUsage(): Promise<CliUsageEntry> {
  const token = await freshGeminiToken();
  if (!token) return { windows: [], error: "unauthenticated" };

  const projectId = await getGeminiProjectId(token);
  if (!projectId) return { windows: [], error: "unavailable" };

  try {
    const resp = await fetch("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ project: projectId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { windows: [], error: `http_${resp.status}` };
    const data = await resp.json() as {
      buckets?: Array<{ modelId?: string; remainingFraction?: number; resetTime?: string }>;
    };
    const windows: CliUsageWindow[] = [];
    if (data.buckets) {
      for (const b of data.buckets) {
        // Skip _vertex duplicates
        if (b.modelId?.endsWith("_vertex")) continue;
        windows.push({
          label: b.modelId ?? "Quota",
          utilization: Math.round((1 - (b.remainingFraction ?? 1)) * 100) / 100,
          resetsAt: b.resetTime ?? null,
        });
      }
    }
    return { windows, error: null };
  } catch {
    return { windows: [], error: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// CLI Tool Definitions
// ---------------------------------------------------------------------------

const CLI_TOOLS: CliToolDef[] = [
  {
    name: "claude",
    authHint: "Run: claude login",
    checkAuth: () => {
      const home = os.homedir();
      if (jsonHasKey(path.join(home, ".claude.json"), "oauthAccount")) return true;
      return fileExistsNonEmpty(path.join(home, ".claude", "auth.json"));
    },
  },
  {
    name: "codex",
    authHint: "Run: codex auth login",
    checkAuth: () => {
      const authPath = path.join(os.homedir(), ".codex", "auth.json");
      if (jsonHasKey(authPath, "OPENAI_API_KEY") || jsonHasKey(authPath, "tokens")) return true;
      if (process.env.OPENAI_API_KEY) return true;
      return false;
    },
  },
  {
    name: "gemini",
    authHint: "Run: gemini auth login",
    checkAuth: () => {
      // macOS Keychain
      if (readGeminiCredsFromKeychain()) return true;
      // File-based credentials
      if (jsonHasKey(path.join(os.homedir(), ".gemini", "oauth_creds.json"), "access_token")) return true;
      // Windows gcloud ADC fallback
      const appData = process.env.APPDATA;
      if (appData && jsonHasKey(path.join(appData, "gcloud", "application_default_credentials.json"), "client_id")) return true;
      return false;
    },
  },
  {
    name: "opencode",
    authHint: "Run: opencode auth",
    checkAuth: () => {
      const home = os.homedir();
      if (fileExistsNonEmpty(path.join(home, ".local", "share", "opencode", "auth.json"))) return true;
      const xdgData = process.env.XDG_DATA_HOME;
      if (xdgData && fileExistsNonEmpty(path.join(xdgData, "opencode", "auth.json"))) return true;
      if (process.platform === "darwin") {
        if (fileExistsNonEmpty(path.join(home, "Library", "Application Support", "opencode", "auth.json"))) return true;
      }
      return false;
    },
  },
];

function execWithTimeout(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
    child.unref?.();
  });
}

async function detectCliTool(tool: CliToolDef): Promise<CliToolStatus> {
  const whichCmd = process.platform === "win32" ? "where" : "which";
  try {
    await execWithTimeout(whichCmd, [tool.name], 3000);
  } catch {
    return { installed: false, version: null, authenticated: false, authHint: tool.authHint };
  }

  let version: string | null = null;
  try {
    version = await execWithTimeout(tool.name, ["--version"], 3000);
    if (version.includes("\n")) version = version.split("\n")[0].trim();
  } catch { /* binary found but --version failed */ }

  const authenticated = tool.checkAuth();
  return { installed: true, version, authenticated, authHint: tool.authHint };
}

async function detectAllCli(): Promise<CliStatusResult> {
  const results = await Promise.all(CLI_TOOLS.map((t) => detectCliTool(t)));
  const out: CliStatusResult = {};
  for (let i = 0; i < CLI_TOOLS.length; i++) {
    out[CLI_TOOLS[i].name] = results[i];
  }
  return out;
}


  return {
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
