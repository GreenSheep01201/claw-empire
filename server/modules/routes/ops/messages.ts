// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { INBOX_WEBHOOK_SECRET, PKG_VERSION } from "../../../config/runtime.ts";
import { notifyTaskStatus, gatewayHttpInvoke } from "../../../gateway/client.ts";
import { BUILTIN_GITHUB_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_SECRET, OAUTH_BASE_URL, OAUTH_ENCRYPTION_SECRET, OAUTH_STATE_TTL_MS, appendOAuthQuery, b64url, pkceVerifier, sanitizeOAuthRedirect, encryptSecret, decryptSecret } from "../../../oauth/helpers.ts";
import { safeSecretEquals } from "../../../security/auth.ts";

export function registerOpsMessageRoutes(ctx: any): any {
  const __ctx = ctx as any;
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
  const cachedCliStatus = __ctx.cachedCliStatus;
  const cachedModels = __ctx.cachedModels;
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

// ---------------------------------------------------------------------------
// Messages / Chat
// ---------------------------------------------------------------------------
app.get("/api/messages", (req, res) => {
  const receiverType = firstQueryValue(req.query.receiver_type);
  const receiverId = firstQueryValue(req.query.receiver_id);
  const limitRaw = firstQueryValue(req.query.limit);
  const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 500);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (receiverType && receiverId) {
    // Conversation with a specific agent: show messages TO and FROM that agent
    conditions.push(
      "((receiver_type = ? AND receiver_id = ?) OR (sender_type = 'agent' AND sender_id = ?) OR receiver_type = 'all')"
    );
    params.push(receiverType, receiverId, receiverId);
  } else if (receiverType) {
    conditions.push("receiver_type = ?");
    params.push(receiverType);
  } else if (receiverId) {
    conditions.push("(receiver_id = ? OR receiver_type = 'all')");
    params.push(receiverId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const messages = db.prepare(`
    SELECT m.*,
      a.name AS sender_name,
      a.avatar_emoji AS sender_avatar
    FROM messages m
    LEFT JOIN agents a ON m.sender_type = 'agent' AND m.sender_id = a.id
    ${where}
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(...(params as SQLInputValue[]));

  res.json({ messages: messages.reverse() }); // return in chronological order
});

app.post("/api/messages", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const idempotencyKey = resolveMessageIdempotencyKey(req, body, "api.messages");
  const content = body.content;
  if (!content || typeof content !== "string") {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/messages",
      req,
      body,
      idempotencyKey,
      outcome: "validation_error",
      statusCode: 400,
      detail: "content_required",
    })) return;
    return res.status(400).json({ error: "content_required" });
  }

  const senderType = typeof body.sender_type === "string" ? body.sender_type : "ceo";
  const senderId = typeof body.sender_id === "string" ? body.sender_id : null;
  const receiverType = typeof body.receiver_type === "string" ? body.receiver_type : "all";
  const receiverId = typeof body.receiver_id === "string" ? body.receiver_id : null;
  const messageType = typeof body.message_type === "string" ? body.message_type : "chat";
  const taskId = typeof body.task_id === "string" ? body.task_id : null;

  let storedMessage: StoredMessage;
  let created: boolean;
  try {
    ({ message: storedMessage, created } = await insertMessageWithIdempotency({
      senderType,
      senderId,
      receiverType,
      receiverId,
      content,
      messageType,
      taskId,
      idempotencyKey,
    }));
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/messages",
        req,
        body,
        idempotencyKey,
        outcome: "idempotency_conflict",
        statusCode: 409,
        detail: "payload_mismatch",
      })) return;
      return res.status(409).json({ error: "idempotency_conflict", idempotency_key: err.key });
    }
    if (err instanceof StorageBusyError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/messages",
        req,
        body,
        idempotencyKey,
        outcome: "storage_busy",
        statusCode: 503,
        detail: `operation=${err.operation}, attempts=${err.attempts}`,
      })) return;
      return res.status(503).json({ error: "storage_busy", retryable: true, operation: err.operation });
    }
    throw err;
  }

  const msg = { ...storedMessage };

  if (!created) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/messages",
      req,
      body,
      idempotencyKey,
      outcome: "duplicate",
      statusCode: 200,
      messageId: msg.id,
      detail: "idempotent_replay",
    })) return;
    return res.json({ ok: true, message: msg, duplicate: true });
  }

  if (!(await recordAcceptedIngressAuditOrRollback(
    res,
    {
      endpoint: "/api/messages",
      req,
      body,
      idempotencyKey,
      outcome: "accepted",
      statusCode: 200,
      detail: "created",
    },
    msg.id,
  ))) return;
  broadcast("new_message", msg);

  // Schedule agent auto-reply when CEO messages an agent
  if (senderType === "ceo" && receiverType === "agent" && receiverId) {
    if (messageType === "report") {
      const handled = handleReportRequest(receiverId, content);
      if (!handled) {
        scheduleAgentReply(receiverId, content, messageType);
      }
      return res.json({ ok: true, message: msg });
    }

    scheduleAgentReply(receiverId, content, messageType);

    // Check for @mentions to other departments/agents
    const mentions = detectMentions(content);
    if (mentions.deptIds.length > 0 || mentions.agentIds.length > 0) {
      const senderAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(receiverId) as AgentRow | undefined;
      if (senderAgent) {
        const lang = resolveLang(content);
        const mentionDelay = 4000 + Math.random() * 2000; // After the main delegation starts
        setTimeout(() => {
          // Handle department mentions
          for (const deptId of mentions.deptIds) {
            if (deptId === senderAgent.department_id) continue; // Skip own department
            handleMentionDelegation(senderAgent, deptId, content, lang);
          }
          // Handle agent mentions — find their department and delegate there
          for (const agentId of mentions.agentIds) {
            const mentioned = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
            if (mentioned && mentioned.department_id && mentioned.department_id !== senderAgent.department_id) {
              if (!mentions.deptIds.includes(mentioned.department_id)) {
                handleMentionDelegation(senderAgent, mentioned.department_id, content, lang);
              }
            }
          }
        }, mentionDelay);
      }
    }
  }

  res.json({ ok: true, message: msg });
});

app.post("/api/announcements", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const idempotencyKey = resolveMessageIdempotencyKey(req, body, "api.announcements");
  const content = body.content;
  if (!content || typeof content !== "string") {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/announcements",
      req,
      body,
      idempotencyKey,
      outcome: "validation_error",
      statusCode: 400,
      detail: "content_required",
    })) return;
    return res.status(400).json({ error: "content_required" });
  }

  let storedMessage: StoredMessage;
  let created: boolean;
  try {
    ({ message: storedMessage, created } = await insertMessageWithIdempotency({
      senderType: "ceo",
      senderId: null,
      receiverType: "all",
      receiverId: null,
      content,
      messageType: "announcement",
      idempotencyKey,
    }));
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/announcements",
        req,
        body,
        idempotencyKey,
        outcome: "idempotency_conflict",
        statusCode: 409,
        detail: "payload_mismatch",
      })) return;
      return res.status(409).json({ error: "idempotency_conflict", idempotency_key: err.key });
    }
    if (err instanceof StorageBusyError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/announcements",
        req,
        body,
        idempotencyKey,
        outcome: "storage_busy",
        statusCode: 503,
        detail: `operation=${err.operation}, attempts=${err.attempts}`,
      })) return;
      return res.status(503).json({ error: "storage_busy", retryable: true, operation: err.operation });
    }
    throw err;
  }
  const msg = { ...storedMessage };

  if (!created) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/announcements",
      req,
      body,
      idempotencyKey,
      outcome: "duplicate",
      statusCode: 200,
      messageId: msg.id,
      detail: "idempotent_replay",
    })) return;
    return res.json({ ok: true, message: msg, duplicate: true });
  }

  if (!(await recordAcceptedIngressAuditOrRollback(
    res,
    {
      endpoint: "/api/announcements",
      req,
      body,
      idempotencyKey,
      outcome: "accepted",
      statusCode: 200,
      detail: "created",
    },
    msg.id,
  ))) return;
  broadcast("announcement", msg);

  // Team leaders respond to announcements with staggered delays
  scheduleAnnouncementReplies(content);

  // Check for @mentions in announcements — trigger delegation
  const mentions = detectMentions(content);
  if (mentions.deptIds.length > 0 || mentions.agentIds.length > 0) {
    const mentionDelay = 5000 + Math.random() * 2000;
    setTimeout(() => {
      const processedDepts = new Set<string>();

      for (const deptId of mentions.deptIds) {
        if (processedDepts.has(deptId)) continue;
        processedDepts.add(deptId);
        const leader = findTeamLeader(deptId);
        if (leader) {
          handleTaskDelegation(leader, content, "");
        }
      }

      for (const agentId of mentions.agentIds) {
        const mentioned = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
        if (mentioned?.department_id && !processedDepts.has(mentioned.department_id)) {
          processedDepts.add(mentioned.department_id);
          const leader = findTeamLeader(mentioned.department_id);
          if (leader) {
            handleTaskDelegation(leader, content, "");
          }
        }
      }
    }, mentionDelay);
  }

  res.json({ ok: true, message: msg });
});

// ── Directives (CEO ! command) ──────────────────────────────────────────────
app.post("/api/directives", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const idempotencyKey = resolveMessageIdempotencyKey(req, body, "api.directives");
  const content = body.content;
  if (!content || typeof content !== "string") {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/directives",
      req,
      body,
      idempotencyKey,
      outcome: "validation_error",
      statusCode: 400,
      detail: "content_required",
    })) return;
    return res.status(400).json({ error: "content_required" });
  }

  let storedMessage: StoredMessage;
  let created: boolean;
  try {
    ({ message: storedMessage, created } = await insertMessageWithIdempotency({
      senderType: "ceo",
      senderId: null,
      receiverType: "all",
      receiverId: null,
      content,
      messageType: "directive",
      idempotencyKey,
    }));
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/directives",
        req,
        body,
        idempotencyKey,
        outcome: "idempotency_conflict",
        statusCode: 409,
        detail: "payload_mismatch",
      })) return;
      return res.status(409).json({ error: "idempotency_conflict", idempotency_key: err.key });
    }
    if (err instanceof StorageBusyError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/directives",
        req,
        body,
        idempotencyKey,
        outcome: "storage_busy",
        statusCode: 503,
        detail: `operation=${err.operation}, attempts=${err.attempts}`,
      })) return;
      return res.status(503).json({ error: "storage_busy", retryable: true, operation: err.operation });
    }
    throw err;
  }
  const msg = { ...storedMessage };

  if (!created) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/directives",
      req,
      body,
      idempotencyKey,
      outcome: "duplicate",
      statusCode: 200,
      messageId: msg.id,
      detail: "idempotent_replay",
    })) return;
    return res.json({ ok: true, message: msg, duplicate: true });
  }

  if (!(await recordAcceptedIngressAuditOrRollback(
    res,
    {
      endpoint: "/api/directives",
      req,
      body,
      idempotencyKey,
      outcome: "accepted",
      statusCode: 200,
      detail: "created",
    },
    msg.id,
  ))) return;
  // 2. Broadcast to all
  broadcast("announcement", msg);

  // 3. Team leaders respond
  scheduleAnnouncementReplies(content);
  const directivePolicy = analyzeDirectivePolicy(content);
  const explicitSkip = body.skipPlannedMeeting === true;
  const explicitProjectPath = normalizeTextField(body.project_path);
  const explicitProjectContext = normalizeTextField(body.project_context);
  const shouldDelegate = shouldExecuteDirectiveDelegation(directivePolicy, explicitSkip);
  const delegationOptions: DelegationOptions = {
    skipPlannedMeeting: explicitSkip || directivePolicy.skipPlannedMeeting,
    skipPlanSubtasks: explicitSkip || directivePolicy.skipPlanSubtasks,
    projectPath: explicitProjectPath,
    projectContext: explicitProjectContext,
  };

  if (shouldDelegate) {
    // 4. Auto-delegate to planning team leader
    const planningLeader = findTeamLeader("planning");
    if (planningLeader) {
      const delegationDelay = 3000 + Math.random() * 2000;
      setTimeout(() => {
        handleTaskDelegation(planningLeader, content, "", delegationOptions);
      }, delegationDelay);
    }

    // 5. Additional @mentions trigger delegation to other departments
    const mentions = detectMentions(content);
    if (mentions.deptIds.length > 0 || mentions.agentIds.length > 0) {
      const mentionDelay = 5000 + Math.random() * 2000;
      setTimeout(() => {
        const processedDepts = new Set<string>(["planning"]);

        for (const deptId of mentions.deptIds) {
          if (processedDepts.has(deptId)) continue;
          processedDepts.add(deptId);
          const leader = findTeamLeader(deptId);
          if (leader) {
            handleTaskDelegation(leader, content, "", delegationOptions);
          }
        }

        for (const agentId of mentions.agentIds) {
          const mentioned = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
          if (mentioned?.department_id && !processedDepts.has(mentioned.department_id)) {
            processedDepts.add(mentioned.department_id);
            const leader = findTeamLeader(mentioned.department_id);
            if (leader) {
              handleTaskDelegation(leader, content, "", delegationOptions);
            }
          }
        }
      }, mentionDelay);
    }
  }

  res.json({ ok: true, message: msg });
});

// ── Inbound webhook (Telegram / external) ───────────────────────────────────
app.post("/api/inbox", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const idempotencyKey = resolveMessageIdempotencyKey(req, body, "api.inbox");
  if (!INBOX_WEBHOOK_SECRET) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/inbox",
      req,
      body,
      idempotencyKey,
      outcome: "validation_error",
      statusCode: 503,
      detail: "inbox_webhook_secret_not_configured",
    })) return;
    return res.status(503).json({ error: "inbox_webhook_secret_not_configured" });
  }
  const providedSecret = req.header("x-inbox-secret") ?? "";
  if (!safeSecretEquals(providedSecret, INBOX_WEBHOOK_SECRET)) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/inbox",
      req,
      body,
      idempotencyKey,
      outcome: "validation_error",
      statusCode: 401,
      detail: "invalid_webhook_secret",
    })) return;
    return res.status(401).json({ error: "unauthorized" });
  }

  const text = body.text;
  if (!text || typeof text !== "string" || !text.trim()) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/inbox",
      req,
      body,
      idempotencyKey,
      outcome: "validation_error",
      statusCode: 400,
      detail: "text_required",
    })) return;
    return res.status(400).json({ error: "text_required" });
  }

  const raw = text.trimStart();
  const isDirective = raw.startsWith("$");
  const content = isDirective ? raw.slice(1).trimStart() : raw;
  if (!content) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/inbox",
      req,
      body,
      idempotencyKey,
      outcome: "validation_error",
      statusCode: 400,
      detail: "empty_content",
    })) return;
    return res.status(400).json({ error: "empty_content" });
  }

  const messageType = isDirective ? "directive" : "announcement";
  let storedMessage: StoredMessage;
  let created: boolean;
  try {
    ({ message: storedMessage, created } = await insertMessageWithIdempotency({
      senderType: "ceo",
      senderId: null,
      receiverType: "all",
      receiverId: null,
      content,
      messageType,
      idempotencyKey,
    }));
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/inbox",
        req,
        body,
        idempotencyKey,
        outcome: "idempotency_conflict",
        statusCode: 409,
        detail: "payload_mismatch",
      })) return;
      return res.status(409).json({ error: "idempotency_conflict", idempotency_key: err.key });
    }
    if (err instanceof StorageBusyError) {
      if (!recordMessageIngressAuditOr503(res, {
        endpoint: "/api/inbox",
        req,
        body,
        idempotencyKey,
        outcome: "storage_busy",
        statusCode: 503,
        detail: `operation=${err.operation}, attempts=${err.attempts}`,
      })) return;
      return res.status(503).json({ error: "storage_busy", retryable: true, operation: err.operation });
    }
    throw err;
  }
  const msg = { ...storedMessage };

  if (!created) {
    if (!recordMessageIngressAuditOr503(res, {
      endpoint: "/api/inbox",
      req,
      body,
      idempotencyKey,
      outcome: "duplicate",
      statusCode: 200,
      messageId: msg.id,
      detail: "idempotent_replay",
    })) return;
    return res.json({ ok: true, id: msg.id, directive: isDirective, duplicate: true });
  }

  if (!(await recordAcceptedIngressAuditOrRollback(
    res,
    {
      endpoint: "/api/inbox",
      req,
      body,
      idempotencyKey,
      outcome: "accepted",
      statusCode: 200,
      detail: isDirective ? "created:directive" : "created:announcement",
    },
    msg.id,
  ))) return;
  // Broadcast
  broadcast("announcement", msg);

  // Team leaders respond
  scheduleAnnouncementReplies(content);
  const directivePolicy = isDirective ? analyzeDirectivePolicy(content) : null;
  const inboxExplicitSkip = body.skipPlannedMeeting === true;
  const inboxProjectPath = normalizeTextField(body.project_path);
  const inboxProjectContext = normalizeTextField(body.project_context);
  const shouldDelegateDirective = isDirective && directivePolicy
    ? shouldExecuteDirectiveDelegation(directivePolicy, inboxExplicitSkip)
    : false;
  const directiveDelegationOptions: DelegationOptions = {
    skipPlannedMeeting: inboxExplicitSkip || !!directivePolicy?.skipPlannedMeeting,
    skipPlanSubtasks: inboxExplicitSkip || !!directivePolicy?.skipPlanSubtasks,
    projectPath: inboxProjectPath,
    projectContext: inboxProjectContext,
  };

  if (shouldDelegateDirective) {
    // Auto-delegate to planning team leader
    const planningLeader = findTeamLeader("planning");
    if (planningLeader) {
      const delegationDelay = 3000 + Math.random() * 2000;
      setTimeout(() => {
        handleTaskDelegation(planningLeader, content, "", directiveDelegationOptions);
      }, delegationDelay);
    }
  }

  // Handle @mentions
  const mentions = detectMentions(content);
  const shouldHandleMentions = !isDirective || shouldDelegateDirective;
  if (shouldHandleMentions && (mentions.deptIds.length > 0 || mentions.agentIds.length > 0)) {
    const mentionDelay = 5000 + Math.random() * 2000;
    setTimeout(() => {
      const processedDepts = new Set<string>(isDirective ? ["planning"] : []);

      for (const deptId of mentions.deptIds) {
        if (processedDepts.has(deptId)) continue;
        processedDepts.add(deptId);
        const leader = findTeamLeader(deptId);
        if (leader) {
          handleTaskDelegation(
            leader,
            content,
            "",
            isDirective ? directiveDelegationOptions : {},
          );
        }
      }

      for (const agentId of mentions.agentIds) {
        const mentioned = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
        if (mentioned?.department_id && !processedDepts.has(mentioned.department_id)) {
          processedDepts.add(mentioned.department_id);
          const leader = findTeamLeader(mentioned.department_id);
          if (leader) {
            handleTaskDelegation(
              leader,
              content,
              "",
              isDirective ? directiveDelegationOptions : {},
            );
          }
        }
      }
    }, mentionDelay);
  }

  res.json({ ok: true, id: msg.id, directive: isDirective });
});

// Delete conversation messages
app.delete("/api/messages", (req, res) => {
  const agentId = firstQueryValue(req.query.agent_id);
  const scope = firstQueryValue(req.query.scope) || "conversation"; // "conversation" or "all"

  if (scope === "all") {
    // Delete all messages (announcements + conversations)
    const result = db.prepare("DELETE FROM messages").run();
    broadcast("messages_cleared", { scope: "all" });
    return res.json({ ok: true, deleted: result.changes });
  }

  if (agentId) {
    // Delete messages for a specific agent conversation + announcements shown in that chat
    const result = db.prepare(
      `DELETE FROM messages WHERE
        (sender_type = 'ceo' AND receiver_type = 'agent' AND receiver_id = ?)
        OR (sender_type = 'agent' AND sender_id = ?)
        OR receiver_type = 'all'
        OR message_type = 'announcement'`
    ).run(agentId, agentId);
    broadcast("messages_cleared", { scope: "agent", agent_id: agentId });
    return res.json({ ok: true, deleted: result.changes });
  }

  // Delete only announcements/broadcasts
  const result = db.prepare(
    "DELETE FROM messages WHERE receiver_type = 'all' OR message_type = 'announcement'"
  ).run();
  broadcast("messages_cleared", { scope: "announcements" });
  res.json({ ok: true, deleted: result.changes });
});


  return {};
}
