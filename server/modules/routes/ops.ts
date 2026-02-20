// @ts-nocheck

import type { RuntimeContext, RouteOpsExports } from "../../types/runtime-context.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { INBOX_WEBHOOK_SECRET, PKG_VERSION } from "../../config/runtime.ts";
import { notifyTaskStatus, gatewayHttpInvoke } from "../../gateway/client.ts";
import { BUILTIN_GITHUB_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_SECRET, OAUTH_BASE_URL, OAUTH_ENCRYPTION_SECRET, OAUTH_STATE_TTL_MS, appendOAuthQuery, b64url, pkceVerifier, sanitizeOAuthRedirect, encryptSecret, decryptSecret } from "../../oauth/helpers.ts";
import { safeSecretEquals } from "../../security/auth.ts";

import { registerOpsMessageRoutes } from "./ops/messages.ts";

export function registerRoutesPartC(ctx: RuntimeContext): RouteOpsExports {
  const __ctx: RuntimeContext = ctx;
  const CLI_STATUS_TTL = __ctx.CLI_STATUS_TTL;
  const CLI_TOOLS = __ctx.CLI_TOOLS;
  const MODELS_CACHE_TTL = __ctx.MODELS_CACHE_TTL;
  const IdempotencyConflictError = __ctx.IdempotencyConflictError;
  const StorageBusyError = __ctx.StorageBusyError;
  const activeProcesses = __ctx.activeProcesses;
  const analyzeSubtaskDepartment = __ctx.analyzeSubtaskDepartment;
  const app = __ctx.app;
  const appendTaskLog = __ctx.appendTaskLog;
  const broadcast = __ctx.broadcast;
  const buildCliFailureMessage = __ctx.buildCliFailureMessage;
  const buildDirectReplyPrompt = __ctx.buildDirectReplyPrompt;
  const buildTaskExecutionPrompt = __ctx.buildTaskExecutionPrompt;
  let cachedCliStatus = __ctx.cachedCliStatus;
  let cachedModels = __ctx.cachedModels;
  const chooseSafeReply = __ctx.chooseSafeReply;
  const cleanupWorktree = __ctx.cleanupWorktree;
  const clearTaskWorkflowState = __ctx.clearTaskWorkflowState;
  const createWorktree = __ctx.createWorktree;
  const crossDeptNextCallbacks = __ctx.crossDeptNextCallbacks;
  const db = __ctx.db;
  const dbPath = __ctx.dbPath;
  const delegatedTaskToSubtask = __ctx.delegatedTaskToSubtask;
  const deptCount = __ctx.deptCount;
  const detectAllCli = __ctx.detectAllCli;
  const endTaskExecutionSession = __ctx.endTaskExecutionSession;
  const ensureClaudeMd = __ctx.ensureClaudeMd;
  const ensureOAuthActiveAccount = __ctx.ensureOAuthActiveAccount;
  const ensureTaskExecutionSession = __ctx.ensureTaskExecutionSession;
  const execWithTimeout = __ctx.execWithTimeout;
  const fetchClaudeUsage = __ctx.fetchClaudeUsage;
  const fetchCodexUsage = __ctx.fetchCodexUsage;
  const fetchGeminiUsage = __ctx.fetchGeminiUsage;
  const finishReview = __ctx.finishReview;
  const firstQueryValue = __ctx.firstQueryValue;
  const generateProjectContext = __ctx.generateProjectContext;
  const getActiveOAuthAccountIds = __ctx.getActiveOAuthAccountIds;
  const getAgentDisplayName = __ctx.getAgentDisplayName;
  const getNextOAuthLabel = __ctx.getNextOAuthLabel;
  const getOAuthAccounts = __ctx.getOAuthAccounts;
  const getPreferredOAuthAccounts = __ctx.getPreferredOAuthAccounts;
  const getProviderModelConfig = __ctx.getProviderModelConfig;
  const getRecentChanges = __ctx.getRecentChanges;
  const getRecentConversationContext = __ctx.getRecentConversationContext;
  const getTaskContinuationContext = __ctx.getTaskContinuationContext;
  const handleTaskRunComplete = __ctx.handleTaskRunComplete;
  const hasExplicitWarningFixRequest = __ctx.hasExplicitWarningFixRequest;
  const hasStructuredJsonLines = __ctx.hasStructuredJsonLines;
  const httpAgentCounter = __ctx.httpAgentCounter;
  const insertMessageWithIdempotency = __ctx.insertMessageWithIdempotency;
  const interruptPidTree = __ctx.interruptPidTree;
  const isTaskWorkflowInterrupted = __ctx.isTaskWorkflowInterrupted;
  const killPidTree = __ctx.killPidTree;
  const launchHttpAgent = __ctx.launchHttpAgent;
  const logsDir = __ctx.logsDir;
  const meetingPhaseByAgent = __ctx.meetingPhaseByAgent;
  const meetingPresenceUntil = __ctx.meetingPresenceUntil;
  const meetingReviewDecisionByAgent = __ctx.meetingReviewDecisionByAgent;
  const meetingSeatIndexByAgent = __ctx.meetingSeatIndexByAgent;
  const meetingTaskIdByAgent = __ctx.meetingTaskIdByAgent;
  const mergeWorktree = __ctx.mergeWorktree;
  const normalizeOAuthProvider = __ctx.normalizeOAuthProvider;
  const notifyCeo = __ctx.notifyCeo;
  const nowMs = __ctx.nowMs;
  const randomDelay = __ctx.randomDelay;
  const recordAcceptedIngressAuditOrRollback = __ctx.recordAcceptedIngressAuditOrRollback;
  const recordMessageIngressAuditOr503 = __ctx.recordMessageIngressAuditOr503;
  const refreshGoogleToken = __ctx.refreshGoogleToken;
  const removeActiveOAuthAccount = __ctx.removeActiveOAuthAccount;
  const resolveMessageIdempotencyKey = __ctx.resolveMessageIdempotencyKey;
  const rollbackTaskWorktree = __ctx.rollbackTaskWorktree;
  const runAgentOneShot = __ctx.runAgentOneShot;
  const seedApprovedPlanSubtasks = __ctx.seedApprovedPlanSubtasks;
  const setActiveOAuthAccount = __ctx.setActiveOAuthAccount;
  const setOAuthActiveAccounts = __ctx.setOAuthActiveAccounts;
  const spawnCliAgent = __ctx.spawnCliAgent;
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
  const withSqliteBusyRetry = __ctx.withSqliteBusyRetry;
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
  const processSubtaskDelegations = __ctx.processSubtaskDelegations;
  const recoverCrossDeptQueueAfterMissingCallback = __ctx.recoverCrossDeptQueueAfterMissingCallback;
  const resolveLang = __ctx.resolveLang;
  const resolveProjectPath = __ctx.resolveProjectPath;
  const sendAgentMessage = __ctx.sendAgentMessage;
  const reconcileCrossDeptSubtasks = __ctx.reconcileCrossDeptSubtasks;
  const buildHealthPayload = __ctx.buildHealthPayload;
  const ROLE_PRIORITY = __ctx.ROLE_PRIORITY;
  const ROLE_LABEL = __ctx.ROLE_LABEL;
  const pickRandom = __ctx.pickRandom;
  const SUPPORTED_LANGS = __ctx.SUPPORTED_LANGS;
  const isLang = __ctx.isLang;
  const readSettingString = __ctx.readSettingString;
  const getFlairs = __ctx.getFlairs;
  const ROLE_LABEL_L10N = __ctx.ROLE_LABEL_L10N;
  const classifyIntent = __ctx.classifyIntent;
  const generateChatReply = __ctx.generateChatReply;
  const generateAnnouncementReply = __ctx.generateAnnouncementReply;
  const scheduleAnnouncementReplies = __ctx.scheduleAnnouncementReplies;
  const normalizeTextField = __ctx.normalizeTextField;
  const analyzeDirectivePolicy = __ctx.analyzeDirectivePolicy;
  const shouldExecuteDirectiveDelegation = __ctx.shouldExecuteDirectiveDelegation;
  const detectMentions = __ctx.detectMentions;
  const handleMentionDelegation = __ctx.handleMentionDelegation;
  const findBestSubordinate = __ctx.findBestSubordinate;
  const REMEDIATION_SUBTASK_PREFIXES = __ctx.REMEDIATION_SUBTASK_PREFIXES;
  const COLLABORATION_SUBTASK_PREFIXES = __ctx.COLLABORATION_SUBTASK_PREFIXES;
  const hasAnyPrefix = __ctx.hasAnyPrefix;
  const getTaskSubtaskProgressSummary = __ctx.getTaskSubtaskProgressSummary;
  const groupSubtasksByTargetDepartment = __ctx.groupSubtasksByTargetDepartment;
  const getSubtaskDeptExecutionPriority = __ctx.getSubtaskDeptExecutionPriority;
  const orderSubtaskQueuesByDepartment = __ctx.orderSubtaskQueuesByDepartment;
  const buildSubtaskDelegationPrompt = __ctx.buildSubtaskDelegationPrompt;
  const hasOpenForeignSubtasks = __ctx.hasOpenForeignSubtasks;
  const maybeNotifyAllSubtasksComplete = __ctx.maybeNotifyAllSubtasksComplete;
  const delegateSubtaskBatch = __ctx.delegateSubtaskBatch;
  const finalizeDelegatedSubtasks = __ctx.finalizeDelegatedSubtasks;
  const handleSubtaskDelegationComplete = __ctx.handleSubtaskDelegationComplete;
  const handleSubtaskDelegationBatchComplete = __ctx.handleSubtaskDelegationBatchComplete;
  const deriveSubtaskStateFromDelegatedTask = __ctx.deriveSubtaskStateFromDelegatedTask;
  const pickUnlinkedTargetSubtask = __ctx.pickUnlinkedTargetSubtask;
  const syncSubtaskWithDelegatedTask = __ctx.syncSubtaskWithDelegatedTask;
  const linkCrossDeptTaskToParentSubtask = __ctx.linkCrossDeptTaskToParentSubtask;
  const startCrossDeptCooperation = __ctx.startCrossDeptCooperation;
  const detectProjectPath = __ctx.detectProjectPath;
  const getLatestKnownProjectPath = __ctx.getLatestKnownProjectPath;
  const getDefaultProjectRoot = __ctx.getDefaultProjectRoot;
  const resolveDirectiveProjectPath = __ctx.resolveDirectiveProjectPath;
  const stripReportRequestPrefix = __ctx.stripReportRequestPrefix;
  const detectReportOutputFormat = __ctx.detectReportOutputFormat;
  const pickPlanningReportAssignee = __ctx.pickPlanningReportAssignee;
  const handleReportRequest = __ctx.handleReportRequest;
  const handleTaskDelegation = __ctx.handleTaskDelegation;
  const shouldTreatDirectChatAsTask = __ctx.shouldTreatDirectChatAsTask;
  const createDirectAgentTaskAndRun = __ctx.createDirectAgentTaskAndRun;
  const scheduleAgentReply = __ctx.scheduleAgentReply;

  Object.assign(__ctx, registerOpsMessageRoutes(__ctx));

// ---------------------------------------------------------------------------
// CLI Status
// ---------------------------------------------------------------------------
app.get("/api/cli-status", async (_req, res) => {
  const refresh = _req.query.refresh === "1";
  const now = Date.now();

  if (!refresh && cachedCliStatus && now - cachedCliStatus.loadedAt < CLI_STATUS_TTL) {
    return res.json({ providers: cachedCliStatus.data });
  }

  try {
    const data = await detectAllCli();
    cachedCliStatus = { data, loadedAt: Date.now() };
    res.json({ providers: data });
  } catch (err) {
    res.status(500).json({ error: "cli_detection_failed", message: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
app.get("/api/settings", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  res.json({ settings });
});

app.put("/api/settings", (req, res) => {
  const body = req.body ?? {};

  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  for (const [key, value] of Object.entries(body)) {
    upsert.run(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Stats / Dashboard
// ---------------------------------------------------------------------------
app.get("/api/stats", (_req, res) => {
  const totalTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number }).cnt;
  const doneTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'done'").get() as { cnt: number }).cnt;
  const inProgressTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'in_progress'").get() as { cnt: number }).cnt;
  const inboxTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'inbox'").get() as { cnt: number }).cnt;
  const plannedTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'planned'").get() as { cnt: number }).cnt;
  const reviewTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'review'").get() as { cnt: number }).cnt;
  const cancelledTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'cancelled'").get() as { cnt: number }).cnt;
  const collaboratingTasks = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'collaborating'").get() as { cnt: number }).cnt;

  const totalAgents = (db.prepare("SELECT COUNT(*) as cnt FROM agents").get() as { cnt: number }).cnt;
  const workingAgents = (db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'working'").get() as { cnt: number }).cnt;
  const idleAgents = (db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'idle'").get() as { cnt: number }).cnt;

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Top agents by XP
  const topAgents = db.prepare(
    "SELECT id, name, avatar_emoji, stats_tasks_done, stats_xp FROM agents ORDER BY stats_xp DESC LIMIT 5"
  ).all();

  // Tasks per department
  const tasksByDept = db.prepare(`
    SELECT d.id, d.name, d.icon, d.color,
      COUNT(t.id) AS total_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks
    FROM departments d
    LEFT JOIN tasks t ON t.department_id = d.id
    GROUP BY d.id
    ORDER BY d.name
  `).all();

  // Recent activity (last 20 task logs)
  const recentActivity = db.prepare(`
    SELECT tl.*, t.title AS task_title
    FROM task_logs tl
    LEFT JOIN tasks t ON tl.task_id = t.id
    ORDER BY tl.created_at DESC
    LIMIT 20
  `).all();

  res.json({
    stats: {
      tasks: {
        total: totalTasks,
        done: doneTasks,
        in_progress: inProgressTasks,
        inbox: inboxTasks,
        planned: plannedTasks,
        collaborating: collaboratingTasks,
        review: reviewTasks,
        cancelled: cancelledTasks,
        completion_rate: completionRate,
      },
      agents: {
        total: totalAgents,
        working: workingAgents,
        idle: idleAgents,
      },
      top_agents: topAgents,
      tasks_by_department: tasksByDept,
      recent_activity: recentActivity,
    },
  });
});

// ---------------------------------------------------------------------------
// prettyStreamJson: parse stream-JSON from Claude/Codex/Gemini into readable text
// (ported from claw-kanban)
// ---------------------------------------------------------------------------
function prettyStreamJson(raw: string): string {
  const chunks: string[] = [];
  let sawJson = false;
  const pushMessageChunk = (text: string): void => {
    if (!text) return;
    if (chunks.length > 0 && !chunks[chunks.length - 1].endsWith("\n")) {
      chunks.push("\n");
    }
    chunks.push(text);
    if (!text.endsWith("\n")) {
      chunks.push("\n");
    }
  };

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (!t.startsWith("{")) continue;

    try {
      const j: any = JSON.parse(t);
      sawJson = true;

      // Claude: stream_event
      if (j.type === "stream_event") {
        const ev = j.event;
        if (ev?.type === "content_block_delta" && ev?.delta?.type === "text_delta") {
          chunks.push(String(ev.delta.text ?? ""));
          continue;
        }
        if (ev?.type === "content_block_start" && ev?.content_block?.type === "text" && ev?.content_block?.text) {
          chunks.push(String(ev.content_block.text));
          continue;
        }
        continue;
      }

      // Claude: assistant message (from --print mode)
      if (j.type === "assistant" && j.message?.content) {
        let assistantText = "";
        for (const block of j.message.content) {
          if (block.type === "text" && block.text) {
            assistantText += String(block.text);
          }
        }
        pushMessageChunk(assistantText);
        continue;
      }

      // Claude: result (final output from --print mode)
      if (j.type === "result" && j.result) {
        pushMessageChunk(String(j.result));
        continue;
      }

      // Gemini: message with content
      if (j.type === "message" && j.role === "assistant" && j.content) {
        pushMessageChunk(String(j.content));
        continue;
      }

      // Gemini: tool_use
      // Codex: item.completed (agent text only)
      if (j.type === "item.completed" && j.item) {
        const item = j.item;
        if (item.type === "agent_message" && item.text) {
          pushMessageChunk(String(item.text));
        }
        continue;
      }

      // OpenCode/json-style assistant payload fallback
      if (j.role === "assistant") {
        if (typeof j.content === "string") {
          pushMessageChunk(j.content);
        } else if (Array.isArray(j.content)) {
          const parts: string[] = [];
          for (const part of j.content) {
            if (typeof part === "string") {
              parts.push(part);
            } else if (part && typeof part.text === "string") {
              parts.push(part.text);
            }
          }
          pushMessageChunk(parts.join("\n"));
        }
        continue;
      }

      if (typeof j.text === "string" && (j.type === "assistant_message" || j.type === "output_text")) {
        pushMessageChunk(j.text);
        continue;
      }
    } catch {
      // ignore
    }
  }

  // If log is not structured JSON, return plain text as-is.
  if (!sawJson) {
    return raw.trim();
  }

  const stitched = chunks.join("");
  const normalized = stitched
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return normalized;
}

// ---------------------------------------------------------------------------
// Task terminal log viewer (ported from claw-kanban)
// ---------------------------------------------------------------------------
app.get("/api/tasks/:id/terminal", (req, res) => {
  const id = String(req.params.id);
  const lines = Math.min(Math.max(Number(req.query.lines ?? 200), 20), 4000);
  const pretty = String(req.query.pretty ?? "0") === "1";
  const filePath = path.join(logsDir, `${id}.log`);

  if (!fs.existsSync(filePath)) {
    return res.json({ ok: true, exists: false, path: filePath, text: "" });
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parts = raw.split(/\r?\n/);
  const tail = parts.slice(Math.max(0, parts.length - lines)).join("\n");
  let text = tail;
  if (pretty) {
    const parsed = prettyStreamJson(tail);
    // Keep parsed output for structured JSON logs even if it's currently empty (noise-only chunks).
    text = (parsed.trim() || hasStructuredJsonLines(tail)) ? parsed : tail;
  }

  // Also return task_logs (system events) for interleaved display
  const taskLogs = db.prepare(
    "SELECT id, kind, message, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at ASC"
  ).all(id) as Array<{ id: number; kind: string; message: string; created_at: number }>;

  res.json({ ok: true, exists: true, path: filePath, text, task_logs: taskLogs });
});

// ---------------------------------------------------------------------------
// OAuth web-auth helper functions
// ---------------------------------------------------------------------------
function consumeOAuthState(stateId: string, provider: string): { verifier_enc: string; redirect_to: string | null } | null {
  const row = db.prepare(
    "SELECT provider, verifier_enc, redirect_to, created_at FROM oauth_states WHERE id = ?"
  ).get(stateId) as { provider: string; verifier_enc: string; redirect_to: string | null; created_at: number } | undefined;
  if (!row) return null;
  // Always delete (one-time use)
  db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
  // Check TTL
  if (Date.now() - row.created_at > OAUTH_STATE_TTL_MS) return null;
  // Check provider match
  if (row.provider !== provider) return null;
  return { verifier_enc: row.verifier_enc, redirect_to: row.redirect_to };
}

function upsertOAuthCredential(input: {
  provider: string;
  source: string;
  email: string | null;
  scope: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  label?: string | null;
  model_override?: string | null;
  make_active?: boolean;
}): string {
  const normalizedProvider = normalizeOAuthProvider(input.provider) ?? input.provider;
  const now = nowMs();
  const accessEnc = encryptSecret(input.access_token);
  const refreshEnc = input.refresh_token ? encryptSecret(input.refresh_token) : null;
  const encData = encryptSecret(JSON.stringify({ access_token: input.access_token }));

  db.prepare(`
    INSERT INTO oauth_credentials (provider, source, encrypted_data, email, scope, expires_at, created_at, updated_at, access_token_enc, refresh_token_enc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      source = excluded.source,
      encrypted_data = excluded.encrypted_data,
      email = excluded.email,
      scope = excluded.scope,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc
  `).run(
    normalizedProvider, input.source, encData, input.email, input.scope,
    input.expires_at, now, now, accessEnc, refreshEnc
  );

  let accountId: string | null = null;
  if (input.email) {
    const existing = db.prepare(
      "SELECT id FROM oauth_accounts WHERE provider = ? AND email = ? ORDER BY updated_at DESC LIMIT 1"
    ).get(normalizedProvider, input.email) as { id: string } | undefined;
    if (existing) accountId = existing.id;
  }

  if (!accountId) {
    const nextPriority = (db.prepare(
      "SELECT COALESCE(MAX(priority), 90) + 10 AS p FROM oauth_accounts WHERE provider = ?"
    ).get(normalizedProvider) as { p: number }).p;
    const defaultLabel = getNextOAuthLabel(normalizedProvider);
    accountId = randomUUID();
    db.prepare(`
      INSERT INTO oauth_accounts (
        id, provider, source, label, email, scope, expires_at,
        access_token_enc, refresh_token_enc, status, priority, model_override,
        failure_count, last_error, last_error_at, last_success_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, NULL, NULL, ?, ?, ?)
    `).run(
      accountId,
      normalizedProvider,
      input.source,
      input.label ?? defaultLabel,
      input.email,
      input.scope,
      input.expires_at,
      accessEnc,
      refreshEnc,
      nextPriority,
      input.model_override ?? null,
      now,
      now,
      now,
    );
  } else {
    let resolvedLabel: string | null = input.label ?? null;
    if (!resolvedLabel) {
      const current = db.prepare(
        "SELECT label, email FROM oauth_accounts WHERE id = ?"
      ).get(accountId) as { label: string | null; email: string | null } | undefined;
      if (!current?.label || (current.email && current.label === current.email)) {
        resolvedLabel = getNextOAuthLabel(normalizedProvider);
      }
    }
    db.prepare(`
      UPDATE oauth_accounts
      SET source = ?,
          label = COALESCE(?, label),
          email = ?,
          scope = ?,
          expires_at = ?,
          access_token_enc = ?,
          refresh_token_enc = ?,
          model_override = COALESCE(?, model_override),
          status = 'active',
          updated_at = ?,
          last_success_at = ?,
          failure_count = 0,
          last_error = NULL,
          last_error_at = NULL
      WHERE id = ?
    `).run(
      input.source,
      resolvedLabel,
      input.email,
      input.scope,
      input.expires_at,
      accessEnc,
      refreshEnc,
      input.model_override ?? null,
      now,
      now,
      accountId,
    );
  }

  if (input.make_active !== false && accountId) {
    setActiveOAuthAccount(normalizedProvider, accountId);
  }

  ensureOAuthActiveAccount(normalizedProvider);
  return accountId;
}

function startGitHubOAuth(redirectTo: string | undefined, callbackPath: string): string {
  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID ?? BUILTIN_GITHUB_CLIENT_ID;
  if (!clientId) throw new Error("missing_OAUTH_GITHUB_CLIENT_ID");
  const stateId = randomUUID();
  const safeRedirect = sanitizeOAuthRedirect(redirectTo);
  db.prepare(
    "INSERT INTO oauth_states (id, provider, created_at, verifier_enc, redirect_to) VALUES (?, ?, ?, ?, ?)"
  ).run(stateId, "github", Date.now(), "none", safeRedirect);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${OAUTH_BASE_URL}${callbackPath}`);
  url.searchParams.set("state", stateId);
  url.searchParams.set("scope", "read:user user:email");
  return url.toString();
}

function startGoogleAntigravityOAuth(redirectTo: string | undefined, callbackPath: string): string {
  const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID ?? BUILTIN_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("missing_OAUTH_GOOGLE_CLIENT_ID");
  const stateId = randomUUID();
  const verifier = pkceVerifier();
  const safeRedirect = sanitizeOAuthRedirect(redirectTo);
  const verifierEnc = encryptSecret(verifier);
  db.prepare(
    "INSERT INTO oauth_states (id, provider, created_at, verifier_enc, redirect_to) VALUES (?, ?, ?, ?, ?)"
  ).run(stateId, "google_antigravity", Date.now(), verifierEnc, safeRedirect);

  const challenge = b64url(createHash("sha256").update(verifier, "ascii").digest());

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${OAUTH_BASE_URL}${callbackPath}`);
  url.searchParams.set("scope", [
    "https://www.googleapis.com/auth/cloud-platform",
    "openid", "email", "profile",
  ].join(" "));
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", stateId);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function handleGitHubCallback(code: string, stateId: string, callbackPath: string): Promise<{ redirectTo: string }> {
  const stateRow = consumeOAuthState(stateId, "github");
  if (!stateRow) throw new Error("Invalid or expired state");

  const redirectTo = stateRow.redirect_to || "/";
  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID ?? BUILTIN_GITHUB_CLIENT_ID;
  const clientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET;

  // Exchange code for token (client_secret optional for built-in public app)
  const tokenBody: Record<string, string> = {
    client_id: clientId,
    code,
    redirect_uri: `${OAUTH_BASE_URL}${callbackPath}`,
  };
  if (clientSecret) tokenBody.client_secret = clientSecret;

  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(tokenBody),
    signal: AbortSignal.timeout(10000),
  });
  const tokenData = await tokenResp.json() as { access_token?: string; error?: string; scope?: string };
  if (!tokenData.access_token) throw new Error(tokenData.error || "No access token received");

  // Fetch primary email
  let email: string | null = null;
  try {
    const emailResp = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "climpire", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (emailResp.ok) {
      const emails = await emailResp.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((e) => e.primary && e.verified);
      if (primary) email = primary.email;
    }
  } catch { /* email fetch is best-effort */ }

  upsertOAuthCredential({
    provider: "github",
    source: "web-oauth",
    email,
    scope: tokenData.scope || "read:user,user:email",
    access_token: tokenData.access_token,
    refresh_token: null,
    expires_at: null,
  });

  return { redirectTo: appendOAuthQuery(redirectTo.startsWith("/") ? `${OAUTH_BASE_URL}${redirectTo}` : redirectTo, "oauth", "github-copilot") };
}

async function handleGoogleAntigravityCallback(code: string, stateId: string, callbackPath: string): Promise<{ redirectTo: string }> {
  const stateRow = consumeOAuthState(stateId, "google_antigravity");
  if (!stateRow) throw new Error("Invalid or expired state");

  const redirectTo = stateRow.redirect_to || "/";
  const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID ?? BUILTIN_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? BUILTIN_GOOGLE_CLIENT_SECRET;

  // Decrypt PKCE verifier
  const verifier = decryptSecret(stateRow.verifier_enc);

  // Exchange code for token
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${OAUTH_BASE_URL}${callbackPath}`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const tokenData = await tokenResp.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number;
    error?: string; scope?: string;
  };
  if (!tokenData.access_token) throw new Error(tokenData.error || "No access token received");

  // Fetch user info
  let email: string | null = null;
  try {
    const userResp = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (userResp.ok) {
      const ui = await userResp.json() as { email?: string };
      if (ui?.email) email = ui.email;
    }
  } catch { /* userinfo best-effort */ }

  const expiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null;

  upsertOAuthCredential({
    provider: "google_antigravity",
    source: "web-oauth",
    email,
    scope: tokenData.scope || "openid email profile",
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    expires_at: expiresAt,
  });

  return { redirectTo: appendOAuthQuery(redirectTo.startsWith("/") ? `${OAUTH_BASE_URL}${redirectTo}` : redirectTo, "oauth", "antigravity") };
}

// ---------------------------------------------------------------------------
// OAuth credentials (simplified for Claw-Empire)
// ---------------------------------------------------------------------------
// Helper: build OAuth status with 2 connect providers (github-copilot, antigravity)
async function buildOAuthStatus() {
  const home = os.homedir();

  const detectFileCredential = (provider: "github" | "google_antigravity") => {
    if (provider === "github") {
      try {
        const hostsPath = path.join(home, ".config", "gh", "hosts.yml");
        const raw = fs.readFileSync(hostsPath, "utf8");
        const userMatch = raw.match(/user:\s*(\S+)/);
        if (userMatch) {
          const stat = fs.statSync(hostsPath);
          return {
            detected: true,
            source: "file-detected",
            email: userMatch[1],
            scope: "github.com",
            created_at: stat.birthtimeMs,
            updated_at: stat.mtimeMs,
          };
        }
      } catch {}

      const copilotPaths = [
        path.join(home, ".config", "github-copilot", "hosts.json"),
        path.join(home, ".config", "github-copilot", "apps.json"),
      ];
      for (const cp of copilotPaths) {
        try {
          const raw = JSON.parse(fs.readFileSync(cp, "utf8"));
          if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
            const stat = fs.statSync(cp);
            const firstKey = Object.keys(raw)[0];
            return {
              detected: true,
              source: "file-detected",
              email: raw[firstKey]?.user ?? null,
              scope: "copilot",
              created_at: stat.birthtimeMs,
              updated_at: stat.mtimeMs,
            };
          }
        } catch {}
      }
    } else {
      const agPaths = [
        path.join(home, ".antigravity", "auth.json"),
        path.join(home, ".config", "antigravity", "auth.json"),
        path.join(home, ".config", "antigravity", "credentials.json"),
      ];
      for (const ap of agPaths) {
        try {
          const raw = JSON.parse(fs.readFileSync(ap, "utf8"));
          if (raw && typeof raw === "object") {
            const stat = fs.statSync(ap);
            return {
              detected: true,
              source: "file-detected",
              email: raw.email ?? raw.user ?? null,
              scope: raw.scope ?? null,
              created_at: stat.birthtimeMs,
              updated_at: stat.mtimeMs,
            };
          }
        } catch {}
      }
    }
    return {
      detected: false,
      source: null as string | null,
      email: null as string | null,
      scope: null as string | null,
      created_at: 0,
      updated_at: 0,
    };
  };

  const buildProviderStatus = (internalProvider: "github" | "google_antigravity") => {
    ensureOAuthActiveAccount(internalProvider);
    let activeAccountIds = getActiveOAuthAccountIds(internalProvider);
    let activeSet = new Set(activeAccountIds);

    const rows = db.prepare(`
      SELECT
        id, label, email, source, scope, status, priority, expires_at,
        refresh_token_enc, model_override, failure_count, last_error, last_error_at, last_success_at, created_at, updated_at
      FROM oauth_accounts
      WHERE provider = ?
      ORDER BY priority ASC, updated_at DESC
    `).all(internalProvider) as Array<{
      id: string;
      label: string | null;
      email: string | null;
      source: string | null;
      scope: string | null;
      status: string;
      priority: number;
      expires_at: number | null;
      refresh_token_enc: string | null;
      model_override: string | null;
      failure_count: number;
      last_error: string | null;
      last_error_at: number | null;
      last_success_at: number | null;
      created_at: number;
      updated_at: number;
    }>;

    const decryptedById = new Map(
      getOAuthAccounts(internalProvider, true).map((a) => [a.id as string, a]),
    );
    const accounts = rows.map((row) => {
      const dec = decryptedById.get(row.id);
      const expiresAtMs = row.expires_at && row.expires_at < 1e12 ? row.expires_at * 1000 : row.expires_at;
      const hasRefreshToken = Boolean(dec?.refreshToken);
      const hasFreshAccessToken = Boolean(dec?.accessToken) && (!expiresAtMs || expiresAtMs > Date.now() + 60_000);
      const executionReady = row.status === "active" && (hasFreshAccessToken || hasRefreshToken);
      return {
        id: row.id,
        label: row.label,
        email: row.email,
        source: row.source,
        scope: row.scope,
        status: row.status as "active" | "disabled",
        priority: row.priority,
        expires_at: row.expires_at,
        hasRefreshToken,
        executionReady,
        active: activeSet.has(row.id),
        modelOverride: row.model_override,
        failureCount: row.failure_count,
        lastError: row.last_error,
        lastErrorAt: row.last_error_at,
        lastSuccessAt: row.last_success_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    if (accounts.length > 0) {
      const activeIdsPresent = activeAccountIds.filter((id) => accounts.some((a) => a.id === id && a.status === "active"));
      if (activeIdsPresent.length === 0) {
        const fallback = accounts.find((a) => a.status === "active");
        if (fallback) {
          setActiveOAuthAccount(internalProvider, fallback.id);
          activeAccountIds = getActiveOAuthAccountIds(internalProvider);
        }
      } else if (activeIdsPresent.length !== activeAccountIds.length) {
        setOAuthActiveAccounts(internalProvider, activeIdsPresent);
        activeAccountIds = activeIdsPresent;
      }
    }
    activeSet = new Set(activeAccountIds);
    const activeAccountId = activeAccountIds[0] ?? null;
    const accountsWithActive = accounts.map((a) => ({ ...a, active: activeSet.has(a.id) }));
    const runnable = accountsWithActive.filter((a) => a.executionReady);
    const primary = accountsWithActive.find((a) => a.active) ?? runnable[0] ?? accountsWithActive[0] ?? null;
    const fileDetected = detectFileCredential(internalProvider);
    const detected = accountsWithActive.length > 0 || fileDetected.detected;
    const connected = runnable.length > 0;

    return {
      connected,
      detected,
      executionReady: connected,
      requiresWebOAuth: detected && !connected,
      source: primary?.source ?? fileDetected.source,
      email: primary?.email ?? fileDetected.email,
      scope: primary?.scope ?? fileDetected.scope,
      expires_at: primary?.expires_at ?? null,
      created_at: primary?.created_at ?? fileDetected.created_at,
      updated_at: primary?.updated_at ?? fileDetected.updated_at,
      webConnectable: true,
      hasRefreshToken: primary?.hasRefreshToken ?? false,
      refreshFailed: primary?.lastError ? true : undefined,
      lastRefreshed: primary?.lastSuccessAt ?? null,
      activeAccountId,
      activeAccountIds,
      accounts: accountsWithActive,
    };
  };

  return {
    "github-copilot": buildProviderStatus("github"),
    antigravity: buildProviderStatus("google_antigravity"),
  };
}

app.get("/api/oauth/status", async (_req, res) => {
  try {
    const providers = await buildOAuthStatus();
    res.json({ storageReady: Boolean(OAUTH_ENCRYPTION_SECRET), providers });
  } catch (err) {
    console.error("[oauth] Failed to build OAuth status:", err);
    res.status(500).json({ error: "Failed to build OAuth status" });
  }
});

// GET /api/oauth/start — Begin OAuth flow
app.get("/api/oauth/start", (req, res) => {
  const provider = firstQueryValue(req.query.provider);
  const redirectTo = sanitizeOAuthRedirect(firstQueryValue(req.query.redirect_to));

  try {
    let authorizeUrl: string;
    if (provider === "github-copilot") {
      authorizeUrl = startGitHubOAuth(redirectTo, "/api/oauth/callback/github-copilot");
    } else if (provider === "antigravity") {
      authorizeUrl = startGoogleAntigravityOAuth(redirectTo, "/api/oauth/callback/antigravity");
    } else {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }
    res.redirect(302, authorizeUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/oauth/callback/github-copilot — GitHub OAuth callback (for Copilot)
app.get("/api/oauth/callback/github-copilot", async (req, res) => {
  const code = firstQueryValue(req.query.code);
  const state = firstQueryValue(req.query.state);
  const error = firstQueryValue(req.query.error);

  if (error || !code || !state) {
    const redirectUrl = new URL("/", OAUTH_BASE_URL);
    redirectUrl.searchParams.set("oauth_error", error || "missing_code");
    return res.redirect(redirectUrl.toString());
  }

  try {
    const result = await handleGitHubCallback(code, state, "/api/oauth/callback/github-copilot");
    res.redirect(result.redirectTo);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OAuth] GitHub/Copilot callback error:", msg);
    const redirectUrl = new URL("/", OAUTH_BASE_URL);
    redirectUrl.searchParams.set("oauth_error", msg);
    res.redirect(redirectUrl.toString());
  }
});

// GET /api/oauth/callback/antigravity — Google/Antigravity OAuth callback
app.get("/api/oauth/callback/antigravity", async (req, res) => {
  const code = firstQueryValue(req.query.code);
  const state = firstQueryValue(req.query.state);
  const error = firstQueryValue(req.query.error);

  if (error || !code || !state) {
    const redirectUrl = new URL("/", OAUTH_BASE_URL);
    redirectUrl.searchParams.set("oauth_error", error || "missing_code");
    return res.redirect(redirectUrl.toString());
  }

  try {
    const result = await handleGoogleAntigravityCallback(code, state, "/api/oauth/callback/antigravity");
    res.redirect(result.redirectTo);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OAuth] Antigravity callback error:", msg);
    const redirectUrl = new URL("/", OAUTH_BASE_URL);
    redirectUrl.searchParams.set("oauth_error", msg);
    res.redirect(redirectUrl.toString());
  }
});

// --- GitHub Device Code Flow (no redirect URI needed) ---
app.post("/api/oauth/github-copilot/device-start", async (_req, res) => {
  if (!OAUTH_ENCRYPTION_SECRET) {
    return res.status(400).json({ error: "missing_OAUTH_ENCRYPTION_SECRET" });
  }

  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID ?? BUILTIN_GITHUB_CLIENT_ID;
  try {
    const resp = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, scope: "read:user user:email" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      return res.status(502).json({ error: "github_device_code_failed", status: resp.status });
    }

    const json = await resp.json() as {
      device_code: string; user_code: string; verification_uri: string;
      expires_in: number; interval: number;
    };
    if (!json.device_code || !json.user_code) {
      return res.status(502).json({ error: "github_device_code_invalid" });
    }

    // Encrypt device_code server-side
    const stateId = randomUUID();
    db.prepare(
      "INSERT INTO oauth_states (id, provider, created_at, verifier_enc, redirect_to) VALUES (?, ?, ?, ?, ?)"
    ).run(stateId, "github", nowMs(), encryptSecret(json.device_code), null);

    res.json({
      stateId,
      userCode: json.user_code,
      verificationUri: json.verification_uri,
      expiresIn: json.expires_in,
      interval: json.interval,
    });
  } catch (err) {
    res.status(500).json({ error: "github_device_start_failed", message: String(err) });
  }
});

app.post("/api/oauth/github-copilot/device-poll", async (req, res) => {
  const stateId = (req.body as { stateId?: string })?.stateId;
  if (!stateId || typeof stateId !== "string") {
    return res.status(400).json({ error: "stateId is required" });
  }

  const row = db.prepare(
    "SELECT provider, verifier_enc, redirect_to, created_at FROM oauth_states WHERE id = ? AND provider = ?"
  ).get(stateId, "github") as { provider: string; verifier_enc: string; redirect_to: string | null; created_at: number } | undefined;
  if (!row) {
    return res.status(400).json({ error: "invalid_state", status: "expired" });
  }
  if (nowMs() - row.created_at > OAUTH_STATE_TTL_MS) {
    db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
    return res.json({ status: "expired" });
  }

  let deviceCode: string;
  try {
    deviceCode = decryptSecret(row.verifier_enc);
  } catch {
    return res.status(500).json({ error: "decrypt_failed" });
  }

  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID ?? BUILTIN_GITHUB_CLIENT_ID;
  try {
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return res.status(502).json({ error: "github_poll_failed", status: "error" });
    }

    const json = await resp.json() as Record<string, unknown>;

    if ("access_token" in json && typeof json.access_token === "string") {
      db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
      const accessToken = json.access_token;

      // Fetch user email
      let email: string | null = null;
      try {
        const emailsResp = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "climpire", Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(5000),
        });
        if (emailsResp.ok) {
          const emails = await emailsResp.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
          const primary = emails.find((e) => e.primary && e.verified);
          if (primary) email = primary.email;
        }
      } catch { /* best-effort */ }

      upsertOAuthCredential({
        provider: "github",
        source: "web-oauth",
        email,
        scope: typeof json.scope === "string" ? json.scope : null,
        access_token: accessToken,
        refresh_token: null,
        expires_at: null,
      });

      return res.json({ status: "complete", email });
    }

    const error = typeof json.error === "string" ? json.error : "unknown";
    if (error === "authorization_pending") return res.json({ status: "pending" });
    if (error === "slow_down") return res.json({ status: "slow_down" });
    if (error === "expired_token") {
      db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
      return res.json({ status: "expired" });
    }
    if (error === "access_denied") {
      db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
      return res.json({ status: "denied" });
    }
    return res.json({ status: "error", error });
  } catch (err) {
    return res.status(500).json({ error: "github_poll_error", message: String(err) });
  }
});

// POST /api/oauth/disconnect — Disconnect a provider
app.post("/api/oauth/disconnect", (req, res) => {
  const body = (req.body as { provider?: string; account_id?: string }) ?? {};
  const provider = normalizeOAuthProvider(body.provider ?? "");
  const accountId = body.account_id;
  if (!provider) {
    return res.status(400).json({ error: `Invalid provider: ${provider}` });
  }

  if (accountId) {
    db.prepare("DELETE FROM oauth_accounts WHERE id = ? AND provider = ?").run(accountId, provider);
    ensureOAuthActiveAccount(provider);
    const remaining = (db.prepare(
      "SELECT COUNT(*) as cnt FROM oauth_accounts WHERE provider = ?"
    ).get(provider) as { cnt: number }).cnt;
    if (remaining === 0) {
      db.prepare("DELETE FROM oauth_credentials WHERE provider = ?").run(provider);
      db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
    }
  } else {
    db.prepare("DELETE FROM oauth_accounts WHERE provider = ?").run(provider);
    db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
    db.prepare("DELETE FROM oauth_credentials WHERE provider = ?").run(provider);
  }

  res.json({ ok: true });
});

// POST /api/oauth/refresh — Manually refresh an OAuth token
app.post("/api/oauth/refresh", async (req, res) => {
  const body = (req.body as { provider?: string; account_id?: string }) ?? {};
  const provider = normalizeOAuthProvider(body.provider ?? "");
  if (provider !== "google_antigravity") {
    return res.status(400).json({ error: `Unsupported provider for refresh: ${provider}` });
  }
  let cred: DecryptedOAuthToken | null = null;
  if (body.account_id) {
    cred = getOAuthAccounts(provider, true).find((a) => a.id === body.account_id) ?? null;
  } else {
    cred = getPreferredOAuthAccounts(provider)[0] ?? null;
  }
  if (!cred) {
    return res.status(404).json({ error: "No credential found for google_antigravity" });
  }
  if (!cred.refreshToken) {
    return res.status(400).json({ error: "No refresh token available — re-authentication required" });
  }
  try {
    await refreshGoogleToken(cred);
    const updatedRow = db.prepare(
      "SELECT expires_at, updated_at FROM oauth_accounts WHERE id = ?"
    ).get(cred.id) as { expires_at: number | null; updated_at: number } | undefined;
    console.log("[oauth] Manual refresh: Antigravity token renewed");
    res.json({ ok: true, expires_at: updatedRow?.expires_at ?? null, refreshed_at: Date.now(), account_id: cred.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oauth] Manual refresh failed for Antigravity:", msg);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/oauth/accounts/activate", (req, res) => {
  const body = (req.body as {
    provider?: string;
    account_id?: string;
    mode?: "exclusive" | "add" | "remove" | "toggle";
  }) ?? {};
  const provider = normalizeOAuthProvider(body.provider ?? "");
  const mode = body.mode ?? "exclusive";
  if (!provider || !body.account_id) {
    return res.status(400).json({ error: "provider and account_id are required" });
  }
  const account = db.prepare(
    "SELECT id, status FROM oauth_accounts WHERE id = ? AND provider = ?"
  ).get(body.account_id, provider) as { id: string; status: "active" | "disabled" } | undefined;
  if (!account) {
    return res.status(404).json({ error: "account_not_found" });
  }
  if ((mode === "exclusive" || mode === "add" || mode === "toggle") && account.status !== "active") {
    return res.status(400).json({ error: "account_disabled" });
  }

  if (mode === "exclusive") {
    setOAuthActiveAccounts(provider, [body.account_id]);
  } else if (mode === "add") {
    setActiveOAuthAccount(provider, body.account_id);
  } else if (mode === "remove") {
    removeActiveOAuthAccount(provider, body.account_id);
  } else if (mode === "toggle") {
    const activeIds = new Set(getActiveOAuthAccountIds(provider));
    if (activeIds.has(body.account_id)) {
      removeActiveOAuthAccount(provider, body.account_id);
    } else {
      setActiveOAuthAccount(provider, body.account_id);
    }
  } else {
    return res.status(400).json({ error: "invalid_mode" });
  }

  const activeIdsAfter = getActiveOAuthAccountIds(provider);
  if (activeIdsAfter.length === 0 && (mode === "remove" || mode === "toggle")) {
    const fallback = db.prepare(
      "SELECT id FROM oauth_accounts WHERE provider = ? AND status = 'active' AND id != ? ORDER BY priority ASC, updated_at DESC LIMIT 1"
    ).get(provider, body.account_id) as { id: string } | undefined;
    if (fallback) {
      setActiveOAuthAccount(provider, fallback.id);
    } else {
      ensureOAuthActiveAccount(provider);
    }
  } else {
    ensureOAuthActiveAccount(provider);
  }

  res.json({ ok: true, activeAccountIds: getActiveOAuthAccountIds(provider) });
});

app.put("/api/oauth/accounts/:id", (req, res) => {
  const id = String(req.params.id);
  const body = (req.body as {
    label?: string | null;
    model_override?: string | null;
    priority?: number;
    status?: "active" | "disabled";
  }) ?? {};

  const existing = db.prepare("SELECT id FROM oauth_accounts WHERE id = ?").get(id) as { id: string } | undefined;
  if (!existing) return res.status(404).json({ error: "account_not_found" });

  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [nowMs()];
  if ("label" in body) {
    updates.push("label = ?");
    params.push(body.label ?? null);
  }
  if ("model_override" in body) {
    updates.push("model_override = ?");
    params.push(body.model_override ?? null);
  }
  if (typeof body.priority === "number" && Number.isFinite(body.priority)) {
    updates.push("priority = ?");
    params.push(Math.max(1, Math.round(body.priority)));
  }
  if (body.status === "active" || body.status === "disabled") {
    updates.push("status = ?");
    params.push(body.status);
  }

  params.push(id);
  db.prepare(`UPDATE oauth_accounts SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));
  const providerRow = db.prepare("SELECT provider FROM oauth_accounts WHERE id = ?").get(id) as { provider: string };
  ensureOAuthActiveAccount(providerRow.provider);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// OAuth Provider Model Listing
// ---------------------------------------------------------------------------
async function fetchOpenCodeModels(): Promise<Record<string, string[]>> {
  const grouped: Record<string, string[]> = { opencode: [] };
  try {
    const output = await execWithTimeout("opencode", ["models"], 10_000);
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("/")) continue;
      const slashIdx = trimmed.indexOf("/");
      const provider = trimmed.slice(0, slashIdx);
      if (provider === "github-copilot") {
        if (!grouped.copilot) grouped.copilot = [];
        grouped.copilot.push(trimmed);
      } else if (provider === "google" && trimmed.includes("antigravity")) {
        if (!grouped.antigravity) grouped.antigravity = [];
        grouped.antigravity.push(trimmed);
      } else {
        grouped.opencode.push(trimmed);
      }
    }
  } catch {
    // opencode not available
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// CLI Models — dynamic model lists for CLI providers
// ---------------------------------------------------------------------------
interface CliModelInfoServer {
  slug: string;
  displayName?: string;
  description?: string;
  reasoningLevels?: Array<{ effort: string; description: string }>;
  defaultReasoningLevel?: string;
}

let cachedCliModels: { data: Record<string, CliModelInfoServer[]>; loadedAt: number } | null = null;

/**
 * Read Codex models from ~/.codex/models_cache.json
 * Returns CliModelInfoServer[] with reasoning levels from the cache
 */
function readCodexModelsCache(): CliModelInfoServer[] {
  try {
    const cachePath = path.join(os.homedir(), ".codex", "models_cache.json");
    if (!fs.existsSync(cachePath)) return [];
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const modelsArr: Array<{
      slug?: string;
      display_name?: string;
      description?: string;
      visibility?: string;
      priority?: number;
      supported_reasoning_levels?: Array<{ effort: string; description: string }>;
      default_reasoning_level?: string;
    }> = Array.isArray(raw) ? raw : (raw.models || raw.data || []);

    const listModels = modelsArr
      .filter((m) => m.visibility === "list" && m.slug)
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

    return listModels.map((m) => ({
      slug: m.slug!,
      displayName: m.display_name || m.slug!,
      description: m.description,
      reasoningLevels: m.supported_reasoning_levels && m.supported_reasoning_levels.length > 0
        ? m.supported_reasoning_levels
        : undefined,
      defaultReasoningLevel: m.default_reasoning_level || undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Read Gemini CLI models from defaultModelConfigs.js in the Gemini CLI installation.
 * Falls back to a hardcoded list of known models.
 */
function fetchGeminiModels(): CliModelInfoServer[] {
  const FALLBACK: CliModelInfoServer[] = [
    { slug: "gemini-3-pro-preview", displayName: "Gemini 3 Pro Preview" },
    { slug: "gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview" },
    { slug: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
    { slug: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
    { slug: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash Lite" },
  ];

  try {
    // 1. Find gemini binary
    const geminiPath = execFileSync("which", ["gemini"], {
      stdio: "pipe", timeout: 5000, encoding: "utf8",
    }).trim();
    if (!geminiPath) return FALLBACK;

    // 2. Resolve symlinks to real installation path
    const realPath = fs.realpathSync(geminiPath);

    // 3. Walk up from resolved binary to find gemini-cli-core config
    let dir = path.dirname(realPath);
    let configPath = "";
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(
        dir, "node_modules", "@google", "gemini-cli-core",
        "dist", "src", "config", "defaultModelConfigs.js",
      );
      if (fs.existsSync(candidate)) {
        configPath = candidate;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    if (!configPath) return FALLBACK;

    // 4. Parse the config file for user-facing models (those extending chat-base-*)
    const content = fs.readFileSync(configPath, "utf8");

    // Match config entries: "model-slug": { ... extends: "chat-base-..." ... }
    // We use a broad regex that captures the key and content within braces
    const models: CliModelInfoServer[] = [];
    const entryRegex = /["']([a-z][a-z0-9._-]+)["']\s*:\s*\{([^}]*extends\s*:\s*["']chat-base[^"']*["'][^}]*)\}/g;
    let match;
    while ((match = entryRegex.exec(content)) !== null) {
      const slug = match[1];
      if (slug.startsWith("chat-base")) continue;
      models.push({ slug, displayName: slug });
    }

    return models.length > 0 ? models : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Convert a plain string to CliModelInfoServer */
function toModelInfo(slug: string): CliModelInfoServer {
  return { slug, displayName: slug };
}

app.get("/api/cli-models", async (_req, res) => {
  const now = Date.now();
  if (cachedCliModels && now - cachedCliModels.loadedAt < MODELS_CACHE_TTL) {
    return res.json({ models: cachedCliModels.data });
  }

  const models: Record<string, CliModelInfoServer[]> = {
    claude: [
      "opus", "sonnet", "haiku",
      "claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5",
    ].map(toModelInfo),
    gemini: fetchGeminiModels(),
    opencode: [],
  };

  // Codex: dynamic from ~/.codex/models_cache.json
  const codexModels = readCodexModelsCache();
  models.codex = codexModels.length > 0
    ? codexModels
    : ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-max", "gpt-5.2", "gpt-5.1-codex-mini"].map(toModelInfo);

  // OpenCode: dynamic from `opencode models` CLI
  try {
    const ocModels = await fetchOpenCodeModels();
    const ocList: string[] = [];
    for (const [, modelList] of Object.entries(ocModels)) {
      for (const m of modelList) {
        if (!ocList.includes(m)) ocList.push(m);
      }
    }
    if (ocList.length > 0) models.opencode = ocList.map(toModelInfo);
  } catch {
    // opencode not available — keep empty
  }

  cachedCliModels = { data: models, loadedAt: Date.now() };
  res.json({ models });
});

app.get("/api/oauth/models", async (_req, res) => {
  const now = Date.now();
  if (cachedModels && now - cachedModels.loadedAt < MODELS_CACHE_TTL) {
    return res.json({ models: cachedModels.data });
  }

  try {
    const ocModels = await fetchOpenCodeModels();

    // Merge with fallback antigravity models if empty
    const merged: Record<string, string[]> = { ...ocModels };
    if (!merged.antigravity || merged.antigravity.length === 0) {
      merged.antigravity = [
        "google/antigravity-gemini-3-pro",
        "google/antigravity-gemini-3-flash",
        "google/antigravity-claude-sonnet-4-5",
        "google/antigravity-claude-sonnet-4-5-thinking",
        "google/antigravity-claude-opus-4-5-thinking",
        "google/antigravity-claude-opus-4-6-thinking",
      ];
    }

    cachedModels = { data: merged, loadedAt: Date.now() };
    res.json({ models: merged });
  } catch (err) {
    res.status(500).json({ error: "model_fetch_failed", message: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Skills (skills.sh) cached proxy
// ---------------------------------------------------------------------------

interface SkillEntry {
  rank: number;
  name: string;
  skillId: string;
  repo: string;
  installs: number;
}

let cachedSkills: { data: SkillEntry[]; loadedAt: number } | null = null;
const SKILLS_CACHE_TTL = 3600_000; // 1 hour

async function fetchSkillsFromSite(): Promise<SkillEntry[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const resp = await fetch("https://skills.sh", { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const html = await resp.text();

    // Next.js RSC payload embeds the data with escaped quotes: initialSkills\":[{\"source\":...}]
    // Find the start of the array after "initialSkills"
    const anchor = html.indexOf("initialSkills");
    if (anchor === -1) return [];
    const bracketStart = html.indexOf(":[", anchor);
    if (bracketStart === -1) return [];
    const arrStart = bracketStart + 1; // position of '['

    // Walk to find the matching ']'
    let depth = 0;
    let arrEnd = arrStart;
    for (let i = arrStart; i < html.length; i++) {
      if (html[i] === "[") depth++;
      else if (html[i] === "]") depth--;
      if (depth === 0) { arrEnd = i + 1; break; }
    }

    // Unescape RSC-style escaped quotes: \\" → "
    const raw = html.slice(arrStart, arrEnd).replace(/\\"/g, '"');
    const items: Array<{ source?: string; skillId?: string; name?: string; installs?: number }> = JSON.parse(raw);

    return items.map((obj, i) => ({
      rank: i + 1,
      name: obj.name ?? obj.skillId ?? "",
      skillId: obj.skillId ?? obj.name ?? "",
      repo: obj.source ?? "",
      installs: typeof obj.installs === "number" ? obj.installs : 0,
    }));
  } catch {
    return [];
  }
}

app.get("/api/skills", async (_req, res) => {
  if (cachedSkills && Date.now() - cachedSkills.loadedAt < SKILLS_CACHE_TTL) {
    return res.json({ skills: cachedSkills.data });
  }
  const skills = await fetchSkillsFromSite();
  if (skills.length > 0) {
    cachedSkills = { data: skills, loadedAt: Date.now() };
  }
  res.json({ skills });
});

// ---------------------------------------------------------------------------
// Skill detail (skills.sh detail page) cached proxy
// ---------------------------------------------------------------------------

interface SkillDetail {
  title: string;
  description: string;
  whenToUse: string[];
  weeklyInstalls: string;
  firstSeen: string;
  installCommand: string;
  platforms: Array<{ name: string; installs: string }>;
  audits: Array<{ name: string; status: string }>;
}

const skillDetailCache = new Map<string, { data: SkillDetail; loadedAt: number }>();
const SKILL_DETAIL_CACHE_TTL = 3600_000; // 1 hour

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#([0-9]+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h1|h2|h3|h4|h5|h6|li|tr|div)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractProseContent(html: string): string {
  const strictMatch = html.match(
    /<div class="prose[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div class=" lg:col-span-3">/i
  );
  if (strictMatch?.[1]) return strictMatch[1];

  const proseStart = html.indexOf('<div class="prose');
  if (proseStart === -1) return "";
  const innerStart = html.indexOf(">", proseStart);
  if (innerStart === -1) return "";
  const rightColStart = html.indexOf('<div class=" lg:col-span-3">', innerStart);
  if (rightColStart === -1) return "";

  const chunk = html.slice(innerStart + 1, rightColStart);
  const trimmed = chunk.replace(/\s*<\/div>\s*$/i, "");
  return trimmed.trim();
}

async function fetchSkillDetail(source: string, skillId: string): Promise<SkillDetail | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const url = `https://skills.sh/${source}/${skillId}`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const html = await resp.text();

    const proseContent = extractProseContent(html);
    const titleMatch = proseContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? collapseWhitespace(stripHtml(titleMatch[1])) : "";

    // Pull the first body paragraph from SKILL.md content.
    const afterTitle = titleMatch
      ? proseContent.slice((titleMatch.index ?? 0) + titleMatch[0].length)
      : proseContent;
    const firstParagraphMatch = afterTitle.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

    let description = firstParagraphMatch ? collapseWhitespace(stripHtml(firstParagraphMatch[1])) : "";

    const whenToUse: string[] = [];
    const whenSectionMatch = proseContent.match(
      /<h2[^>]*>\s*When to Use This Skill\s*<\/h2>([\s\S]*?)(?:<h2[^>]*>|$)/i
    );
    if (whenSectionMatch) {
      const listMatch = whenSectionMatch[1].match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
      if (listMatch) {
        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let li: RegExpExecArray | null = null;
        while ((li = liRegex.exec(listMatch[1])) !== null) {
          const item = collapseWhitespace(stripHtml(li[1]));
          if (item) whenToUse.push(item);
        }
      }
    }

    // Fallback description from metadata when SKILL.md content isn't available.
    if (!description) {
      const metaDesc = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/i)
        ?? html.match(/<meta\s+content="([^"]*?)"\s+name="description"/i);
      if (metaDesc) {
        description = collapseWhitespace(decodeHtmlEntities(metaDesc[1]));
      }
    }

    // Extract weekly installs
    let weeklyInstalls = "";
    const weeklyMatch = html.match(/Weekly\s+Installs[\s\S]{0,240}?>([\d,.]+[KkMm]?)<\/div>/i);
    if (weeklyMatch) weeklyInstalls = weeklyMatch[1];

    // Extract first seen date
    let firstSeen = "";
    const firstSeenMatch = html.match(/First\s+[Ss]een[\s\S]{0,240}?>([A-Za-z]{3}\s+\d{1,2},\s+\d{4})<\/div>/i);
    if (firstSeenMatch) firstSeen = firstSeenMatch[1];

    // Extract install command
    let installCommand = "";
    const rscCommand = html.match(/\\"command\\":\\"((?:[^"\\]|\\.)*)\\"/);
    if (rscCommand) {
      installCommand = rscCommand[1]
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\")
        .trim();
    }
    if (!installCommand) {
      const commandMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
      if (commandMatch && commandMatch[1].includes("npx skills add")) {
        const commandText = collapseWhitespace(stripHtml(commandMatch[1])).replace(/^\$\s*/, "");
        if (commandText) installCommand = commandText;
      }
    }
    if (!installCommand) {
      installCommand = `npx skills add https://github.com/${source} --skill ${skillId}`;
    }

    // Extract platform installs (e.g. "opencode: 56.7K")
    const platformMap = new Map<string, string>();
    const platforms: Array<{ name: string; installs: string }> = [];
    const platformRegex = /(claude-code|opencode|codex|gemini-cli|github-copilot|amp)[\s:]+?([\d,.]+[KkMm]?)/gi;
    let pm: RegExpExecArray | null = null;
    while ((pm = platformRegex.exec(html)) !== null) {
      if (!platformMap.has(pm[1])) {
        platformMap.set(pm[1], pm[2]);
      }
    }
    for (const [name, installs] of platformMap.entries()) {
      platforms.push({ name, installs });
    }

    // Extract audit statuses
    const auditMap = new Map<string, string>();
    const audits: Array<{ name: string; status: string }> = [];
    const auditSpanRegex = /<span[^>]*>\s*(Gen Agent Trust Hub|Socket|Snyk)\s*<\/span>\s*<span[^>]*>\s*(Pass|Fail|Warn|Pending)\s*<\/span>/gi;
    let am: RegExpExecArray | null = null;
    while ((am = auditSpanRegex.exec(html)) !== null) {
      if (!auditMap.has(am[1])) {
        auditMap.set(am[1], am[2]);
      }
    }

    const auditFallbackRegex = /(Gen Agent Trust Hub|Socket|Snyk)\s*:\s*(Pass|Fail|Warn|Pending)/gi;
    while ((am = auditFallbackRegex.exec(html)) !== null) {
      if (!auditMap.has(am[1])) {
        auditMap.set(am[1], am[2]);
      }
    }
    for (const [name, status] of auditMap.entries()) {
      audits.push({ name, status });
    }

    return {
      title,
      description,
      whenToUse,
      weeklyInstalls,
      firstSeen,
      installCommand,
      platforms,
      audits,
    };
  } catch {
    return null;
  }
}

app.get("/api/skills/detail", async (req, res) => {
  const source = String(req.query.source ?? "");
  const skillId = String(req.query.skillId ?? "");
  if (!source || !skillId) {
    return res.status(400).json({ error: "source and skillId required" });
  }

  const cacheKey = `${source}/${skillId}`;
  const cached = skillDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < SKILL_DETAIL_CACHE_TTL) {
    return res.json({ ok: true, detail: cached.data });
  }

  const detail = await fetchSkillDetail(source, skillId);
  if (detail) {
    skillDetailCache.set(cacheKey, { data: detail, loadedAt: Date.now() });
    // Evict old entries if cache grows too large
    if (skillDetailCache.size > 200) {
      const oldest = [...skillDetailCache.entries()].sort((a, b) => a[1].loadedAt - b[1].loadedAt);
      for (let i = 0; i < 50; i++) skillDetailCache.delete(oldest[i][0]);
    }
  }
  res.json({ ok: !!detail, detail: detail ?? null });
});

// ---------------------------------------------------------------------------
// Skill learn jobs (background `npx skills add ...`)
// ---------------------------------------------------------------------------

type SkillLearnProvider = "claude" | "codex" | "gemini" | "opencode";
type SkillLearnStatus = "queued" | "running" | "succeeded" | "failed";

interface SkillLearnJob {
  id: string;
  repo: string;
  skillId: string;
  providers: SkillLearnProvider[];
  agents: string[];
  status: SkillLearnStatus;
  command: string;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  exitCode: number | null;
  logTail: string[];
  error: string | null;
}

const SKILL_LEARN_PROVIDER_TO_AGENT: Record<SkillLearnProvider, string> = {
  claude: "claude-code",
  codex: "codex",
  gemini: "gemini-cli",
  opencode: "opencode",
};

const SKILL_LEARN_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const SKILL_LEARN_MAX_LOG_LINES = 120;
const SKILL_LEARN_JOB_TTL_MS = 30 * 60 * 1000;
const SKILL_LEARN_MAX_JOBS = 200;
const skillLearnJobs = new Map<string, SkillLearnJob>();

function normalizeSkillLearnProviders(input: unknown): SkillLearnProvider[] {
  if (!Array.isArray(input)) return [];
  const out: SkillLearnProvider[] = [];
  for (const raw of input) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (
      (value === "claude" || value === "codex" || value === "gemini" || value === "opencode")
      && !out.includes(value as SkillLearnProvider)
    ) {
      out.push(value as SkillLearnProvider);
    }
  }
  return out;
}

function pruneSkillLearnJobs(now = Date.now()): void {
  if (skillLearnJobs.size === 0) return;
  for (const [id, job] of skillLearnJobs.entries()) {
    const end = job.completedAt ?? job.updatedAt;
    const expired = job.status !== "running" && now - end > SKILL_LEARN_JOB_TTL_MS;
    if (expired) skillLearnJobs.delete(id);
  }
  if (skillLearnJobs.size <= SKILL_LEARN_MAX_JOBS) return;
  const oldest = [...skillLearnJobs.values()]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, Math.max(0, skillLearnJobs.size - SKILL_LEARN_MAX_JOBS));
  for (const job of oldest) {
    if (job.status === "running") continue;
    skillLearnJobs.delete(job.id);
  }
}

function appendSkillLearnLogs(job: SkillLearnJob, chunk: string): void {
  for (const rawLine of chunk.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    job.logTail.push(line);
  }
  if (job.logTail.length > SKILL_LEARN_MAX_LOG_LINES) {
    job.logTail.splice(0, job.logTail.length - SKILL_LEARN_MAX_LOG_LINES);
  }
  job.updatedAt = Date.now();
}

function createSkillLearnJob(repo: string, skillId: string, providers: SkillLearnProvider[]): SkillLearnJob {
  const id = randomUUID();
  const agents = providers
    .map((provider) => SKILL_LEARN_PROVIDER_TO_AGENT[provider])
    .filter((value, index, arr) => arr.indexOf(value) === index);
  const args = ["--yes", "skills@latest", "add", repo, "--yes", "--agent", ...agents];
  const job: SkillLearnJob = {
    id,
    repo,
    skillId,
    providers,
    agents,
    status: "queued",
    command: `npx ${args.join(" ")}`,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    updatedAt: Date.now(),
    exitCode: null,
    logTail: [],
    error: null,
  };
  skillLearnJobs.set(id, job);

  setTimeout(() => {
    job.status = "running";
    job.startedAt = Date.now();
    job.updatedAt = job.startedAt;

    const child = spawn("npx", args, {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string | Buffer) => {
      appendSkillLearnLogs(job, String(chunk));
    });
    child.stderr?.on("data", (chunk: string | Buffer) => {
      appendSkillLearnLogs(job, String(chunk));
    });
    child.on("error", (err: Error) => {
      job.status = "failed";
      job.error = err.message || String(err);
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      appendSkillLearnLogs(job, `ERROR: ${job.error}`);
      pruneSkillLearnJobs();
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      job.exitCode = code;
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      if (code === 0) {
        job.status = "succeeded";
      } else {
        job.status = "failed";
        job.error = signal ? `process terminated by ${signal}` : `process exited with code ${String(code)}`;
      }
      pruneSkillLearnJobs();
    });
  }, 0);

  return job;
}

app.post("/api/skills/learn", (req, res) => {
  pruneSkillLearnJobs();
  const repo = String(req.body?.repo ?? "").trim();
  const skillId = String(req.body?.skillId ?? "").trim();
  const providers = normalizeSkillLearnProviders(req.body?.providers);

  if (!repo) {
    return res.status(400).json({ error: "repo required" });
  }
  if (!SKILL_LEARN_REPO_RE.test(repo)) {
    return res.status(400).json({ error: "invalid repo format" });
  }
  if (providers.length === 0) {
    return res.status(400).json({ error: "providers required" });
  }

  const job = createSkillLearnJob(repo, skillId, providers);
  res.status(202).json({ ok: true, job });
});

app.get("/api/skills/learn/:jobId", (req, res) => {
  pruneSkillLearnJobs();
  const jobId = String(req.params.jobId ?? "").trim();
  const job = skillLearnJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "job_not_found" });
  }
  res.json({ ok: true, job });
});

// ---------------------------------------------------------------------------
// Git Worktree management endpoints
// ---------------------------------------------------------------------------

// GET /api/tasks/:id/diff — Get diff for review in UI
app.get("/api/tasks/:id/diff", (req, res) => {
  const id = String(req.params.id);
  const wtInfo = taskWorktrees.get(id);
  if (!wtInfo) {
    return res.json({ ok: true, hasWorktree: false, diff: "", stat: "" });
  }

  try {
    const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: wtInfo.projectPath, stdio: "pipe", timeout: 5000,
    }).toString().trim();

    const stat = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`, "--stat"], {
      cwd: wtInfo.projectPath, stdio: "pipe", timeout: 10000,
    }).toString().trim();

    const diff = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`], {
      cwd: wtInfo.projectPath, stdio: "pipe", timeout: 15000,
    }).toString();

    res.json({
      ok: true,
      hasWorktree: true,
      branchName: wtInfo.branchName,
      stat,
      diff: diff.length > 50000 ? diff.slice(0, 50000) + "\n... (truncated)" : diff,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, error: msg });
  }
});

// POST /api/tasks/:id/merge — Manually trigger merge
app.post("/api/tasks/:id/merge", (req, res) => {
  const id = String(req.params.id);
  const wtInfo = taskWorktrees.get(id);
  if (!wtInfo) {
    return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
  }

  const result = mergeWorktree(wtInfo.projectPath, id);
  const lang = resolveLang();

  if (result.success) {
    cleanupWorktree(wtInfo.projectPath, id);
    appendTaskLog(id, "system", `Manual merge completed: ${result.message}`);
    notifyCeo(pickL(l(
      [`수동 병합 완료: ${result.message}`],
      [`Manual merge completed: ${result.message}`],
      [`手動マージ完了: ${result.message}`],
      [`手动合并完成: ${result.message}`],
    ), lang), id);
  } else {
    appendTaskLog(id, "system", `Manual merge failed: ${result.message}`);
  }

  res.json({ ok: result.success, message: result.message, conflicts: result.conflicts });
});

// POST /api/tasks/:id/discard — Discard worktree changes (abandon branch)
app.post("/api/tasks/:id/discard", (req, res) => {
  const id = String(req.params.id);
  const wtInfo = taskWorktrees.get(id);
  if (!wtInfo) {
    return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
  }

  cleanupWorktree(wtInfo.projectPath, id);
  appendTaskLog(id, "system", "Worktree discarded (changes abandoned)");
  const lang = resolveLang();
  notifyCeo(pickL(l(
    [`작업 브랜치가 폐기되었습니다: climpire/${id.slice(0, 8)}`],
    [`Task branch discarded: climpire/${id.slice(0, 8)}`],
    [`タスクブランチを破棄しました: climpire/${id.slice(0, 8)}`],
    [`任务分支已丢弃: climpire/${id.slice(0, 8)}`],
  ), lang), id);

  res.json({ ok: true, message: "Worktree discarded" });
});

// GET /api/worktrees — List all active worktrees
app.get("/api/worktrees", (_req, res) => {
  const entries: Array<{ taskId: string; branchName: string; worktreePath: string; projectPath: string }> = [];
  for (const [taskId, info] of taskWorktrees) {
    entries.push({ taskId, ...info });
  }
  res.json({ ok: true, worktrees: entries });
});

// ---------------------------------------------------------------------------
// CLI Usage stats (real provider API usage, persisted in SQLite)
// ---------------------------------------------------------------------------

// Read cached usage from SQLite
function readCliUsageFromDb(): Record<string, CliUsageEntry> {
  const rows = db.prepare("SELECT provider, data_json FROM cli_usage_cache").all() as Array<{ provider: string; data_json: string }>;
  const usage: Record<string, CliUsageEntry> = {};
  for (const row of rows) {
    try { usage[row.provider] = JSON.parse(row.data_json); } catch { /* skip corrupt */ }
  }
  return usage;
}

// Fetch real usage from provider APIs and persist to SQLite
async function refreshCliUsageData(): Promise<Record<string, CliUsageEntry>> {
  const providers = ["claude", "codex", "gemini", "copilot", "antigravity"];
  const usage: Record<string, CliUsageEntry> = {};

  const fetchMap: Record<string, () => Promise<CliUsageEntry>> = {
    claude: fetchClaudeUsage,
    codex: fetchCodexUsage,
    gemini: fetchGeminiUsage,
  };

  const fetches = providers.map(async (p) => {
    const tool = CLI_TOOLS.find((t) => t.name === p);
    if (!tool) {
      usage[p] = { windows: [], error: "not_implemented" };
      return;
    }
    if (!tool.checkAuth()) {
      usage[p] = { windows: [], error: "unauthenticated" };
      return;
    }
    const fetcher = fetchMap[p];
    if (fetcher) {
      usage[p] = await fetcher();
    } else {
      usage[p] = { windows: [], error: "not_implemented" };
    }
  });

  await Promise.all(fetches);

  // Persist to SQLite
  const upsert = db.prepare(
    "INSERT INTO cli_usage_cache (provider, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(provider) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at"
  );
  const now = nowMs();
  for (const [p, entry] of Object.entries(usage)) {
    upsert.run(p, JSON.stringify(entry), now);
  }

  return usage;
}

// GET: read from SQLite cache; if empty, fetch and populate first
app.get("/api/cli-usage", async (_req, res) => {
  let usage = readCliUsageFromDb();
  if (Object.keys(usage).length === 0) {
    usage = await refreshCliUsageData();
  }
  res.json({ ok: true, usage });
});

// POST: trigger real API fetches, update SQLite, broadcast to all clients
app.post("/api/cli-usage/refresh", async (_req, res) => {
  try {
    const usage = await refreshCliUsageData();
    broadcast("cli_usage_update", usage);
    res.json({ ok: true, usage });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

  return {
    prettyStreamJson,
    refreshCliUsageData,
  };
}
