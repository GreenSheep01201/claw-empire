// @ts-nocheck

import type { RuntimeContext } from "../../types/runtime-context.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { INBOX_WEBHOOK_SECRET, PKG_VERSION } from "../../config/runtime.ts";
import { notifyTaskStatus, gatewayHttpInvoke } from "../../gateway/client.ts";
import { BUILTIN_GITHUB_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_ID, BUILTIN_GOOGLE_CLIENT_SECRET, OAUTH_BASE_URL, OAUTH_ENCRYPTION_SECRET, OAUTH_STATE_TTL_MS, appendOAuthQuery, b64url, pkceVerifier, sanitizeOAuthRedirect, encryptSecret, decryptSecret } from "../../oauth/helpers.ts";
import { safeSecretEquals } from "../../security/auth.ts";

export function registerRoutesPartA(ctx: RuntimeContext): Record<string, never> {
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
  let httpAgentCounter = __ctx.httpAgentCounter;
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
  const prettyStreamJson = __ctx.prettyStreamJson;
  const processSubtaskDelegations = __ctx.processSubtaskDelegations;
  const recoverCrossDeptQueueAfterMissingCallback = __ctx.recoverCrossDeptQueueAfterMissingCallback;
  const refreshCliUsageData = __ctx.refreshCliUsageData;
  const resolveLang = __ctx.resolveLang;
  const resolveProjectPath = __ctx.resolveProjectPath;
  const sendAgentMessage = __ctx.sendAgentMessage;
  const reconcileCrossDeptSubtasks = __ctx.reconcileCrossDeptSubtasks;
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
  const consumeOAuthState = __ctx.consumeOAuthState;
  const upsertOAuthCredential = __ctx.upsertOAuthCredential;
  const startGitHubOAuth = __ctx.startGitHubOAuth;
  const startGoogleAntigravityOAuth = __ctx.startGoogleAntigravityOAuth;
  const handleGitHubCallback = __ctx.handleGitHubCallback;
  const handleGoogleAntigravityCallback = __ctx.handleGoogleAntigravityCallback;
  const buildOAuthStatus = __ctx.buildOAuthStatus;
  const fetchOpenCodeModels = __ctx.fetchOpenCodeModels;
  const cachedCliModels = __ctx.cachedCliModels;
  const readCodexModelsCache = __ctx.readCodexModelsCache;
  const fetchGeminiModels = __ctx.fetchGeminiModels;
  const toModelInfo = __ctx.toModelInfo;
  const cachedSkills = __ctx.cachedSkills;
  const SKILLS_CACHE_TTL = __ctx.SKILLS_CACHE_TTL;
  const fetchSkillsFromSite = __ctx.fetchSkillsFromSite;
  const readCliUsageFromDb = __ctx.readCliUsageFromDb;

// ===========================================================================
// API ENDPOINTS
// ===========================================================================

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
const buildHealthPayload = () => ({
  ok: true,
  version: PKG_VERSION,
  app: "Claw-Empire",
  dbPath,
});

app.get("/health", (_req, res) => res.json(buildHealthPayload()));
app.get("/healthz", (_req, res) => res.json(buildHealthPayload()));
app.get("/api/health", (_req, res) => res.json(buildHealthPayload()));

// ---------------------------------------------------------------------------
// Gateway Channel Messaging
// ---------------------------------------------------------------------------
app.get("/api/gateway/targets", async (_req, res) => {
  try {
    const result = await gatewayHttpInvoke({
      tool: "sessions_list", action: "json",
      args: { limit: 100, activeMinutes: 60 * 24 * 7, messageLimit: 0 },
    });
    const sessions = Array.isArray(result?.details?.sessions) ? result.details.sessions : [];
    const targets = sessions
      .filter((s: any) => s?.deliveryContext?.channel && s?.deliveryContext?.to)
      .map((s: any) => ({
        sessionKey: s.key,
        displayName: s.displayName || `${s.deliveryContext.channel}:${s.deliveryContext.to}`,
        channel: s.deliveryContext.channel,
        to: s.deliveryContext.to,
      }));
    res.json({ ok: true, targets });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.post("/api/gateway/send", async (req, res) => {
  try {
    const { sessionKey, text } = req.body ?? {};
    if (!sessionKey || !text?.trim()) {
      return res.status(400).json({ ok: false, error: "sessionKey and text required" });
    }
    const result = await gatewayHttpInvoke({
      tool: "sessions_list", action: "json",
      args: { limit: 200, activeMinutes: 60 * 24 * 30, messageLimit: 0 },
    });
    const sessions = Array.isArray(result?.details?.sessions) ? result.details.sessions : [];
    const session = sessions.find((s: any) => s?.key === sessionKey);
    if (!session?.deliveryContext?.channel || !session?.deliveryContext?.to) {
      return res.status(404).json({ ok: false, error: "session not found or no delivery target" });
    }
    await gatewayHttpInvoke({
      tool: "message", action: "send",
      args: { channel: session.deliveryContext.channel, target: session.deliveryContext.to, message: text.trim() },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
app.get("/api/departments", (_req, res) => {
  const departments = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM agents a WHERE a.department_id = d.id) AS agent_count
    FROM departments d
    ORDER BY d.sort_order ASC
  `).all();
  res.json({ departments });
});

app.get("/api/departments/:id", (req, res) => {
  const id = String(req.params.id);
  const department = db.prepare("SELECT * FROM departments WHERE id = ?").get(id);
  if (!department) return res.status(404).json({ error: "not_found" });

  const agents = db.prepare("SELECT * FROM agents WHERE department_id = ? ORDER BY role, name").all(id);
  res.json({ department, agents });
});

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
app.get("/api/agents", (_req, res) => {
  const agents = db.prepare(`
    SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
    FROM agents a
    LEFT JOIN departments d ON a.department_id = d.id
    ORDER BY a.department_id, a.role, a.name
  `).all();
  res.json({ agents });
});

app.get("/api/meeting-presence", (_req, res) => {
  const now = nowMs();
  const presence: Array<{
    agent_id: string;
    seat_index: number;
    phase: "kickoff" | "review";
    task_id: string | null;
    decision: MeetingReviewDecision | null;
    until: number;
  }> = [];

  for (const [agentId, until] of meetingPresenceUntil.entries()) {
    if (until < now) {
      meetingPresenceUntil.delete(agentId);
      meetingSeatIndexByAgent.delete(agentId);
      meetingPhaseByAgent.delete(agentId);
      meetingTaskIdByAgent.delete(agentId);
      meetingReviewDecisionByAgent.delete(agentId);
      continue;
    }
    const phase = meetingPhaseByAgent.get(agentId) ?? "kickoff";
    presence.push({
      agent_id: agentId,
      seat_index: meetingSeatIndexByAgent.get(agentId) ?? 0,
      phase,
      task_id: meetingTaskIdByAgent.get(agentId) ?? null,
      decision: phase === "review" ? (meetingReviewDecisionByAgent.get(agentId) ?? "reviewing") : null,
      until,
    });
  }

  presence.sort((a, b) => a.seat_index - b.seat_index);
  res.json({ presence });
});

app.get("/api/agents/:id", (req, res) => {
  const id = String(req.params.id);
  const agent = db.prepare(`
    SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.color AS department_color
    FROM agents a
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE a.id = ?
  `).get(id);
  if (!agent) return res.status(404).json({ error: "not_found" });

  // Include recent tasks
  const recentTasks = db.prepare(
    "SELECT * FROM tasks WHERE assigned_agent_id = ? ORDER BY updated_at DESC LIMIT 10"
  ).all(id);

  res.json({ agent, recent_tasks: recentTasks });
});

app.patch("/api/agents/:id", (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: "not_found" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const nextProviderRaw = ("cli_provider" in body ? body.cli_provider : existing.cli_provider) as string | null | undefined;
  const nextProvider = nextProviderRaw ?? "claude";
  const nextOAuthProvider = nextProvider === "copilot"
    ? "github"
    : nextProvider === "antigravity"
    ? "google_antigravity"
    : null;

  if (!nextOAuthProvider && !("oauth_account_id" in body) && ("cli_provider" in body)) {
    // Auto-clear pinned OAuth account when switching to non-OAuth provider.
    body.oauth_account_id = null;
  }

  if ("oauth_account_id" in body) {
    if (body.oauth_account_id === "" || typeof body.oauth_account_id === "undefined") {
      body.oauth_account_id = null;
    }
    if (body.oauth_account_id !== null && typeof body.oauth_account_id !== "string") {
      return res.status(400).json({ error: "invalid_oauth_account_id" });
    }
    if (body.oauth_account_id && !nextOAuthProvider) {
      return res.status(400).json({ error: "oauth_account_requires_oauth_provider" });
    }
    if (body.oauth_account_id && nextOAuthProvider) {
      const oauthAccount = db.prepare(
        "SELECT id, status FROM oauth_accounts WHERE id = ? AND provider = ?"
      ).get(body.oauth_account_id, nextOAuthProvider) as { id: string; status: "active" | "disabled" } | undefined;
      if (!oauthAccount) {
        return res.status(400).json({ error: "oauth_account_not_found_for_provider" });
      }
      if (oauthAccount.status !== "active") {
        return res.status(400).json({ error: "oauth_account_disabled" });
      }
    }
  }

  const allowedFields = [
    "name", "name_ko", "department_id", "role", "cli_provider",
    "oauth_account_id", "avatar_emoji", "personality", "status", "current_task_id",
  ];

  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "no_fields_to_update" });
  }

  params.push(id);
  db.prepare(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));

  const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  broadcast("agent_status", updated);
  res.json({ ok: true, agent: updated });
});

app.post("/api/agents/:id/spawn", (req, res) => {
  const id = String(req.params.id);
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as {
    id: string;
    name: string;
    cli_provider: string | null;
    oauth_account_id: string | null;
    current_task_id: string | null;
    status: string;
  } | undefined;
  if (!agent) return res.status(404).json({ error: "not_found" });

  const provider = agent.cli_provider || "claude";
  if (!["claude", "codex", "gemini", "opencode", "copilot", "antigravity"].includes(provider)) {
    return res.status(400).json({ error: "unsupported_provider", provider });
  }

  const taskId = agent.current_task_id;
  if (!taskId) {
    return res.status(400).json({ error: "no_task_assigned", message: "Assign a task to this agent first." });
  }

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as {
    id: string;
    title: string;
    description: string | null;
    project_path: string | null;
  } | undefined;
  if (!task) {
    return res.status(400).json({ error: "task_not_found" });
  }
  const taskLang = resolveLang(task.description ?? task.title);

  const projectPath = task.project_path || process.cwd();
  const logPath = path.join(logsDir, `${taskId}.log`);
  const executionSession = ensureTaskExecutionSession(taskId, agent.id, provider);

  const prompt = buildTaskExecutionPrompt([
    `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
    "This session is scoped to this task only.",
    `[Task] ${task.title}`,
    task.description ? `\n${task.description}` : "",
    pickL(l(
      ["위 작업을 충분히 완수하세요."],
      ["Please complete the task above thoroughly."],
      ["上記タスクを丁寧に完了してください。"],
      ["请完整地完成上述任务。"],
    ), taskLang),
  ], {
    allowWarningFix: hasExplicitWarningFixRequest(task.title, task.description),
  });

  appendTaskLog(taskId, "system", `RUN start (agent=${agent.name}, provider=${provider})`);

  const spawnModelConfig = getProviderModelConfig();
  const spawnModel = spawnModelConfig[provider]?.model || undefined;
  const spawnReasoningLevel = spawnModelConfig[provider]?.reasoningLevel || undefined;

  if (provider === "copilot" || provider === "antigravity") {
    const controller = new AbortController();
    const fakePid = -(++httpAgentCounter);
    // Update agent status before launching
    db.prepare("UPDATE agents SET status = 'working' WHERE id = ?").run(id);
    db.prepare("UPDATE tasks SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?")
      .run(nowMs(), nowMs(), taskId);
    const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    broadcast("agent_status", updatedAgent);
    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
    notifyTaskStatus(taskId, task.title, "in_progress", taskLang);
    launchHttpAgent(taskId, provider, prompt, projectPath, logPath, controller, fakePid, agent.oauth_account_id ?? null);
    return res.json({ ok: true, pid: fakePid, logPath, cwd: projectPath });
  }

  const child = spawnCliAgent(taskId, provider, prompt, projectPath, logPath, spawnModel, spawnReasoningLevel);

  child.on("close", (code) => {
    handleTaskRunComplete(taskId, code ?? 1);
  });

  // Update agent status
  db.prepare("UPDATE agents SET status = 'working' WHERE id = ?").run(id);
  db.prepare("UPDATE tasks SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?")
    .run(nowMs(), nowMs(), taskId);

  const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  broadcast("agent_status", updatedAgent);
  broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
  notifyTaskStatus(taskId, task.title, "in_progress", taskLang);

  res.json({ ok: true, pid: child.pid ?? null, logPath, cwd: projectPath });
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
app.get("/api/tasks", (req, res) => {
  reconcileCrossDeptSubtasks();
  const statusFilter = firstQueryValue(req.query.status);
  const deptFilter = firstQueryValue(req.query.department_id);
  const agentFilter = firstQueryValue(req.query.agent_id);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (statusFilter) {
    conditions.push("t.status = ?");
    params.push(statusFilter);
  }
  if (deptFilter) {
    conditions.push("t.department_id = ?");
    params.push(deptFilter);
  }
  if (agentFilter) {
    conditions.push("t.assigned_agent_id = ?");
    params.push(agentFilter);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const subtaskTotalExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id)
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
  const subtaskDoneExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done')
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND c.status = 'done'
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;

  const tasks = db.prepare(`
    SELECT t.*,
      a.name AS agent_name,
      a.avatar_emoji AS agent_avatar,
      d.name AS department_name,
      d.icon AS department_icon,
      ${subtaskTotalExpr} AS subtask_total,
      ${subtaskDoneExpr} AS subtask_done
    FROM tasks t
    LEFT JOIN agents a ON t.assigned_agent_id = a.id
    LEFT JOIN departments d ON t.department_id = d.id
    ${where}
    ORDER BY t.priority DESC, t.updated_at DESC
  `).all(...(params as SQLInputValue[]));

  res.json({ tasks });
});

app.post("/api/tasks", (req, res) => {
  const body = req.body ?? {};
  const id = randomUUID();
  const t = nowMs();

  const title = body.title;
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title_required" });
  }

  db.prepare(`
    INSERT INTO tasks (id, title, description, department_id, assigned_agent_id, status, priority, task_type, project_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    body.description ?? null,
    body.department_id ?? null,
    body.assigned_agent_id ?? null,
    body.status ?? "inbox",
    body.priority ?? 0,
    body.task_type ?? "general",
    body.project_path ?? null,
    t,
    t,
  );

  appendTaskLog(id, "system", `Task created: ${title}`);

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  broadcast("task_update", task);
  res.json({ id, task });
});

app.get("/api/tasks/:id", (req, res) => {
  const id = String(req.params.id);
  reconcileCrossDeptSubtasks(id);
  const subtaskTotalExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id)
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
  const subtaskDoneExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done')
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND c.status = 'done'
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
  const task = db.prepare(`
    SELECT t.*,
      a.name AS agent_name,
      a.avatar_emoji AS agent_avatar,
      a.cli_provider AS agent_provider,
      d.name AS department_name,
      d.icon AS department_icon,
      ${subtaskTotalExpr} AS subtask_total,
      ${subtaskDoneExpr} AS subtask_done
    FROM tasks t
    LEFT JOIN agents a ON t.assigned_agent_id = a.id
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE t.id = ?
  `).get(id);
  if (!task) return res.status(404).json({ error: "not_found" });

  const logs = db.prepare(
    "SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC LIMIT 200"
  ).all(id);

  const subtasks = db.prepare(
    "SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at"
  ).all(id);

  res.json({ task, logs, subtasks });
});

app.get("/api/tasks/:id/meeting-minutes", (req, res) => {
  const id = String(req.params.id);
  const task = db.prepare("SELECT id, source_task_id FROM tasks WHERE id = ?").get(id) as { id: string; source_task_id: string | null } | undefined;
  if (!task) return res.status(404).json({ error: "not_found" });

  // Include meeting minutes from the source (original) task if this is a collaboration task
  const taskIds = [id];
  if (task.source_task_id) taskIds.push(task.source_task_id);

  const meetings = db.prepare(
    `SELECT * FROM meeting_minutes WHERE task_id IN (${taskIds.map(() => '?').join(',')}) ORDER BY started_at DESC, round DESC`
  ).all(...taskIds) as unknown as MeetingMinutesRow[];

  const data = meetings.map((meeting) => {
    const entries = db.prepare(
      "SELECT * FROM meeting_minute_entries WHERE meeting_id = ? ORDER BY seq ASC, id ASC"
    ).all(meeting.id) as unknown as MeetingMinuteEntryRow[];
    return { ...meeting, entries };
  });

  res.json({ meetings: data });
});

app.patch("/api/tasks/:id", (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const body = req.body ?? {};
  const allowedFields = [
    "title", "description", "department_id", "assigned_agent_id",
    "status", "priority", "task_type", "project_path", "result",
  ];

  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [nowMs()];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  // Handle completed_at for status changes
  if (body.status === "done" && !("completed_at" in body)) {
    updates.push("completed_at = ?");
    params.push(nowMs());
  }
  if (body.status === "in_progress" && !("started_at" in body)) {
    updates.push("started_at = ?");
    params.push(nowMs());
  }

  params.push(id);
  db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));

  const nextStatus = typeof body.status === "string" ? body.status : null;
  if (nextStatus && (nextStatus === "cancelled" || nextStatus === "pending" || nextStatus === "done" || nextStatus === "inbox")) {
    clearTaskWorkflowState(id);
    if (nextStatus === "done" || nextStatus === "cancelled") {
      endTaskExecutionSession(id, `task_status_${nextStatus}`);
    }
  }

  appendTaskLog(id, "system", `Task updated: ${Object.keys(body).join(", ")}`);

  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  broadcast("task_update", updated);
  res.json({ ok: true, task: updated });
});

app.delete("/api/tasks/:id", (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as {
    assigned_agent_id: string | null;
  } | undefined;
  if (!existing) return res.status(404).json({ error: "not_found" });

  endTaskExecutionSession(id, "task_deleted");
  clearTaskWorkflowState(id);

  // Kill any running process
  const activeChild = activeProcesses.get(id);
  if (activeChild?.pid) {
    stopRequestedTasks.add(id);
    if (activeChild.pid < 0) {
      activeChild.kill();
    } else {
      killPidTree(activeChild.pid);
    }
    activeProcesses.delete(id);
  }

  // Reset agent if assigned
  if (existing.assigned_agent_id) {
    db.prepare(
      "UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ? AND current_task_id = ?"
    ).run(existing.assigned_agent_id, id);
  }

  db.prepare("DELETE FROM task_logs WHERE task_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE task_id = ?").run(id);
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

  // Clean up log files
  for (const suffix of [".log", ".prompt.txt"]) {
    const filePath = path.join(logsDir, `${id}${suffix}`);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  broadcast("task_update", { id, deleted: true });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// SubTask endpoints
// ---------------------------------------------------------------------------

// GET /api/subtasks?active=1 — active subtasks for in_progress tasks
app.get("/api/subtasks", (req, res) => {
  const active = firstQueryValue(req.query.active);
  let subtasks;
  if (active === "1") {
    subtasks = db.prepare(`
      SELECT s.* FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE t.status IN ('planned', 'collaborating', 'in_progress', 'review')
      ORDER BY s.created_at
    `).all();
  } else {
    subtasks = db.prepare("SELECT * FROM subtasks ORDER BY created_at").all();
  }
  res.json({ subtasks });
});

// POST /api/tasks/:id/subtasks — create subtask manually
app.post("/api/tasks/:id/subtasks", (req, res) => {
  const taskId = String(req.params.id);
  const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(taskId);
  if (!task) return res.status(404).json({ error: "task_not_found" });

  const body = req.body ?? {};
  if (!body.title || typeof body.title !== "string") {
    return res.status(400).json({ error: "title_required" });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO subtasks (id, task_id, title, description, status, assigned_agent_id, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, taskId, body.title, body.description ?? null, body.assigned_agent_id ?? null, nowMs());

  // Detect foreign department for manual subtask creation too
  const parentTaskDept = db.prepare(
    "SELECT department_id FROM tasks WHERE id = ?"
  ).get(taskId) as { department_id: string | null } | undefined;
  const targetDeptId = analyzeSubtaskDepartment(body.title, parentTaskDept?.department_id ?? null);
  if (targetDeptId) {
    const targetDeptName = getDeptName(targetDeptId);
    db.prepare(
      "UPDATE subtasks SET target_department_id = ?, status = 'blocked', blocked_reason = ? WHERE id = ?"
    ).run(targetDeptId, `${targetDeptName} 협업 대기`, id);
  }

  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id);
  broadcast("subtask_update", subtask);
  res.json(subtask);
});

// PATCH /api/subtasks/:id — update subtask
app.patch("/api/subtasks/:id", (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: "not_found" });

  const body = req.body ?? {};
  const allowedFields = ["title", "description", "status", "assigned_agent_id", "blocked_reason", "target_department_id", "delegated_task_id"];
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  // Auto-set completed_at when transitioning to done
  if (body.status === "done" && existing.status !== "done") {
    updates.push("completed_at = ?");
    params.push(nowMs());
  }

  if (updates.length === 0) return res.status(400).json({ error: "no_fields" });

  params.push(id);
  db.prepare(`UPDATE subtasks SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));

  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id);
  broadcast("subtask_update", subtask);
  res.json(subtask);
});

app.post("/api/tasks/:id/assign", (req, res) => {
  const id = String(req.params.id);
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as {
    id: string;
    assigned_agent_id: string | null;
    title: string;
  } | undefined;
  if (!task) return res.status(404).json({ error: "not_found" });

  const agentId = req.body?.agent_id;
  if (!agentId || typeof agentId !== "string") {
    return res.status(400).json({ error: "agent_id_required" });
  }

  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as {
    id: string;
    name: string;
    department_id: string | null;
  } | undefined;
  if (!agent) return res.status(404).json({ error: "agent_not_found" });

  const t = nowMs();

  // Unassign previous agent if different
  if (task.assigned_agent_id && task.assigned_agent_id !== agentId) {
    db.prepare(
      "UPDATE agents SET current_task_id = NULL WHERE id = ? AND current_task_id = ?"
    ).run(task.assigned_agent_id, id);
  }

  // Update task
  db.prepare(
    "UPDATE tasks SET assigned_agent_id = ?, department_id = COALESCE(department_id, ?), status = CASE WHEN status = 'inbox' THEN 'planned' ELSE status END, updated_at = ? WHERE id = ?"
  ).run(agentId, agent.department_id, t, id);

  // Update agent
  db.prepare("UPDATE agents SET current_task_id = ? WHERE id = ?").run(id, agentId);

  appendTaskLog(id, "system", `Assigned to agent: ${agent.name}`);

  // Create assignment message
  const msgId = randomUUID();
  db.prepare(
    `INSERT INTO messages (id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, created_at)
     VALUES (?, 'ceo', NULL, 'agent', ?, ?, 'task_assign', ?, ?)`
  ).run(msgId, agentId, `New task assigned: ${task.title}`, id, t);

  const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);

  broadcast("task_update", updatedTask);
  broadcast("agent_status", updatedAgent);
  broadcast("new_message", {
    id: msgId,
    sender_type: "ceo",
    receiver_type: "agent",
    receiver_id: agentId,
    content: `New task assigned: ${task.title}`,
    message_type: "task_assign",
    task_id: id,
    created_at: t,
  });

  // B4: Notify CEO about assignment via team leader
  const leader = findTeamLeader(agent.department_id);
  if (leader) {
    const lang = resolveLang(task.title);
    const agentRow = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
    const agentName = agentRow ? getAgentDisplayName(agentRow, lang) : agent.name;
    const leaderName = getAgentDisplayName(leader, lang);
    sendAgentMessage(
      leader,
      pickL(l(
        [`${leaderName}이(가) ${agentName}에게 '${task.title}' 업무를 할당했습니다.`],
        [`${leaderName} assigned '${task.title}' to ${agentName}.`],
        [`${leaderName}が '${task.title}' を${agentName}に割り当てました。`],
        [`${leaderName} 已将 '${task.title}' 分配给 ${agentName}。`],
      ), lang),
      "status_update",
      "all",
      null,
      id,
    );
  }

  res.json({ ok: true, task: updatedTask, agent: updatedAgent });
});

app.post("/api/tasks/:id/run", (req, res) => {
  const id = String(req.params.id);
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as {
    id: string;
    title: string;
    description: string | null;
    assigned_agent_id: string | null;
    project_path: string | null;
    status: string;
  } | undefined;
  if (!task) return res.status(404).json({ error: "not_found" });
  const taskLang = resolveLang(task.description ?? task.title);

  if (task.status === "in_progress" || task.status === "collaborating") {
    return res.status(400).json({ error: "already_running" });
  }
  if (activeProcesses.has(id)) {
    return res.status(409).json({
      error: "process_still_active",
      message: "Previous run is still stopping. Please retry after a moment.",
    });
  }

  // Get the agent (or use provided agent_id)
  const agentId = task.assigned_agent_id || (req.body?.agent_id as string | undefined);
  if (!agentId) {
    return res.status(400).json({ error: "no_agent_assigned", message: "Assign an agent before running." });
  }

  const agent = db.prepare(`
    SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko
    FROM agents a LEFT JOIN departments d ON a.department_id = d.id
    WHERE a.id = ?
  `).get(agentId) as {
    id: string;
    name: string;
    name_ko: string | null;
    role: string;
    cli_provider: string | null;
    oauth_account_id: string | null;
    personality: string | null;
    department_id: string | null;
    department_name: string | null;
    department_name_ko: string | null;
  } | undefined;
  if (!agent) return res.status(400).json({ error: "agent_not_found" });

  // Guard: agent already working on another task
  const agentBusy = activeProcesses.has(
    (db.prepare("SELECT current_task_id FROM agents WHERE id = ? AND status = 'working'").get(agentId) as { current_task_id: string | null } | undefined)?.current_task_id ?? ""
  );
  if (agentBusy) {
    return res.status(400).json({ error: "agent_busy", message: `${agent.name} is already working on another task.` });
  }

  const provider = agent.cli_provider || "claude";
  if (!["claude", "codex", "gemini", "opencode", "copilot", "antigravity"].includes(provider)) {
    return res.status(400).json({ error: "unsupported_provider", provider });
  }
  const executionSession = ensureTaskExecutionSession(id, agentId, provider);

  const projectPath = resolveProjectPath(task) || (req.body?.project_path as string | undefined) || process.cwd();
  const logPath = path.join(logsDir, `${id}.log`);

  // Try to create a Git worktree for agent isolation
  const worktreePath = createWorktree(projectPath, id, agent.name);
  const agentCwd = worktreePath || projectPath;

  if (worktreePath) {
    appendTaskLog(id, "system", `Git worktree created: ${worktreePath} (branch: climpire/${id.slice(0, 8)})`);
  }

  // Generate project context (cached by git HEAD) and recent changes
  const projectContext = generateProjectContext(projectPath);
  const recentChanges = getRecentChanges(projectPath, id);

  // For Claude provider: ensure CLAUDE.md exists in worktree
  if (worktreePath && provider === "claude") {
    ensureClaudeMd(projectPath, worktreePath);
  }

  // Build rich prompt with agent context + conversation history + role constraint
  const roleLabel = { team_leader: "Team Leader", senior: "Senior", junior: "Junior", intern: "Intern" }[agent.role] || agent.role;
  const deptConstraint = agent.department_id ? getDeptRoleConstraint(agent.department_id, agent.department_name || agent.department_id) : "";
  const conversationCtx = getRecentConversationContext(agentId);
  const continuationCtx = getTaskContinuationContext(id);
  const continuationInstruction = continuationCtx
    ? pickL(l(
      ["연속 실행: 동일 소유 컨텍스트를 유지하고, 불필요한 파일 재탐색 없이 미해결 항목만 반영하세요."],
      ["Continuation run: keep the same ownership context, avoid re-reading unrelated files, and apply only unresolved deltas."],
      ["継続実行: 同一オーナーシップを維持し、不要な再探索を避けて未解決差分のみ反映してください。"],
      ["连续执行：保持同一责任上下文，避免重复阅读无关文件，仅处理未解决差异。"],
    ), taskLang)
    : pickL(l(
      ["반복적인 착수 멘트 없이 바로 실행하세요."],
      ["Execute directly without repeated kickoff narration."],
      ["繰り返しの開始ナレーションなしで直ちに実行してください。"],
      ["无需重复开场说明，直接执行。"],
    ), taskLang);
  const projectStructureBlock = continuationCtx
    ? ""
    : (projectContext
      ? `[Project Structure]\n${projectContext.length > 4000 ? projectContext.slice(0, 4000) + "\n... (truncated)" : projectContext}`
      : "");
  // Non-CLI or non-multi-agent providers: instruct agent to output subtask plan as JSON
  const needsPlanInstruction = provider === "gemini" || provider === "copilot" || provider === "antigravity";
  const subtaskInstruction = needsPlanInstruction
    ? `\n\n${pickL(l(
      [`[작업 계획 출력 규칙]
작업을 시작하기 전에 아래 JSON 형식으로 계획을 출력하세요:
\`\`\`json
{"subtasks": [{"title": "서브태스크 제목1"}, {"title": "서브태스크 제목2"}]}
\`\`\`
각 서브태스크를 완료할 때마다 아래 형식으로 보고하세요:
\`\`\`json
{"subtask_done": "완료된 서브태스크 제목"}
\`\`\``],
      [`[Task Plan Output Rules]
Before starting work, print a plan in the JSON format below:
\`\`\`json
{"subtasks": [{"title": "Subtask title 1"}, {"title": "Subtask title 2"}]}
\`\`\`
Whenever you complete a subtask, report it in this format:
\`\`\`json
{"subtask_done": "Completed subtask title"}
\`\`\``],
      [`[作業計画の出力ルール]
作業開始前に、次の JSON 形式で計画を出力してください:
\`\`\`json
{"subtasks": [{"title": "サブタスク1"}, {"title": "サブタスク2"}]}
\`\`\`
各サブタスクを完了するたびに、次の形式で報告してください:
\`\`\`json
{"subtask_done": "完了したサブタスク"}
\`\`\``],
      [`[任务计划输出规则]
开始工作前，请按下述 JSON 格式输出计划:
\`\`\`json
{"subtasks": [{"title": "子任务1"}, {"title": "子任务2"}]}
\`\`\`
每完成一个子任务，请按下述格式汇报:
\`\`\`json
{"subtask_done": "已完成的子任务"}
\`\`\``],
    ), taskLang)}\n`
    : "";

  // Resolve model config for this provider
  const modelConfig = getProviderModelConfig();
  const mainModel = modelConfig[provider]?.model || undefined;
  const subModel = modelConfig[provider]?.subModel || undefined;
  const mainReasoningLevel = modelConfig[provider]?.reasoningLevel || undefined;

  // Sub-agent model hint (best-effort via prompt for claude/codex)
  const subReasoningLevel = modelConfig[provider]?.subModelReasoningLevel || undefined;
  const subModelHint = subModel && (provider === "claude" || provider === "codex")
    ? `\n[Sub-agent model preference] When spawning sub-agents (Task tool), prefer using model: ${subModel}${subReasoningLevel ? ` with reasoning effort: ${subReasoningLevel}` : ""}`
    : "";
  const runInstruction = pickL(l(
    ["위 작업을 충분히 완수하세요. 위 대화 맥락과 프로젝트 구조를 참고해도 좋지만, 프로젝트 구조 탐색에 시간을 쓰지 마세요. 필요한 구조는 이미 제공되었습니다."],
    ["Please complete the task above thoroughly. Use the continuation brief, conversation context, and project structure above if relevant. Do NOT spend time exploring the project structure again unless required by unresolved checklist items."],
    ["上記タスクを丁寧に完了してください。必要に応じて継続要約・会話コンテキスト・プロジェクト構成を参照できますが、未解決チェックリストに必要な場合を除き、構成探索に時間を使わないでください。"],
    ["请完整地完成上述任务。可按需参考连续执行摘要、会话上下文和项目结构，但除非未解决清单确有需要，不要再次花时间探索项目结构。"],
  ), taskLang);

  const prompt = buildTaskExecutionPrompt([
    `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
    "This session is task-scoped. Keep continuity for this task only and do not cross-contaminate context from other projects.",
    projectStructureBlock,
    recentChanges ? `[Recent Changes]\n${recentChanges}` : "",
    `[Task] ${task.title}`,
    task.description ? `\n${task.description}` : "",
    continuationCtx,
    conversationCtx,
    `\n---`,
    `Agent: ${agent.name} (${roleLabel}, ${agent.department_name || "Unassigned"})`,
    agent.personality ? `Personality: ${agent.personality}` : "",
    deptConstraint,
    worktreePath ? `NOTE: You are working in an isolated Git worktree branch (climpire/${id.slice(0, 8)}). Commit your changes normally.` : "",
    subtaskInstruction,
    subModelHint,
    continuationInstruction,
    runInstruction,
  ], {
    allowWarningFix: hasExplicitWarningFixRequest(task.title, task.description),
  });

  appendTaskLog(id, "system", `RUN start (agent=${agent.name}, provider=${provider})`);

  // HTTP agent for copilot/antigravity
  if (provider === "copilot" || provider === "antigravity") {
    const controller = new AbortController();
    const fakePid = -(++httpAgentCounter);

    const t = nowMs();
    db.prepare(
      "UPDATE tasks SET status = 'in_progress', assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?"
    ).run(agentId, t, t, id);
    db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
    broadcast("task_update", updatedTask);
    broadcast("agent_status", updatedAgent);
    notifyTaskStatus(id, task.title, "in_progress", taskLang);

    const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
    const worktreeNote = worktreePath
      ? pickL(l(
        [` (격리 브랜치: climpire/${id.slice(0, 8)})`],
        [` (isolated branch: climpire/${id.slice(0, 8)})`],
        [` (分離ブランチ: climpire/${id.slice(0, 8)})`],
        [`（隔离分支: climpire/${id.slice(0, 8)}）`],
      ), taskLang)
      : "";
    notifyCeo(pickL(l(
      [`${assigneeName}가 '${task.title}' 작업을 시작했습니다.${worktreeNote}`],
      [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
      [`${assigneeName}が '${task.title}' の作業を開始しました。${worktreeNote}`],
      [`${assigneeName} 已开始处理 '${task.title}'。${worktreeNote}`],
    ), taskLang), id);

    const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as { department_id: string | null } | undefined;
    startProgressTimer(id, task.title, taskRow?.department_id ?? null);

    launchHttpAgent(id, provider, prompt, agentCwd, logPath, controller, fakePid, agent.oauth_account_id ?? null);
    return res.json({ ok: true, pid: fakePid, logPath, cwd: agentCwd, worktree: !!worktreePath });
  }

  const child = spawnCliAgent(id, provider, prompt, agentCwd, logPath, mainModel, mainReasoningLevel);

  child.on("close", (code) => {
    handleTaskRunComplete(id, code ?? 1);
  });

  const t = nowMs();

  // Update task status
  db.prepare(
    "UPDATE tasks SET status = 'in_progress', assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?"
  ).run(agentId, t, t, id);

  // Update agent status
  db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

  const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
  broadcast("task_update", updatedTask);
  broadcast("agent_status", updatedAgent);
  notifyTaskStatus(id, task.title, "in_progress", taskLang);

  // B4: Notify CEO that task started
  const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
  const worktreeNote = worktreePath
    ? pickL(l(
      [` (격리 브랜치: climpire/${id.slice(0, 8)})`],
      [` (isolated branch: climpire/${id.slice(0, 8)})`],
      [` (分離ブランチ: climpire/${id.slice(0, 8)})`],
      [`（隔离分支: climpire/${id.slice(0, 8)}）`],
    ), taskLang)
    : "";
  notifyCeo(pickL(l(
    [`${assigneeName}가 '${task.title}' 작업을 시작했습니다.${worktreeNote}`],
    [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
    [`${assigneeName}が '${task.title}' の作業を開始しました。${worktreeNote}`],
    [`${assigneeName} 已开始处理 '${task.title}'。${worktreeNote}`],
  ), taskLang), id);

  // B2: Start progress report timer for long-running tasks
  const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as { department_id: string | null } | undefined;
  startProgressTimer(id, task.title, taskRow?.department_id ?? null);

  res.json({ ok: true, pid: child.pid ?? null, logPath, cwd: agentCwd, worktree: !!worktreePath });
});

app.post("/api/tasks/:id/stop", (req, res) => {
  const id = String(req.params.id);
  // mode=pause → pending (can resume), mode=cancel or default → cancelled
  const mode = String(req.body?.mode ?? req.query.mode ?? "cancel");
  const targetStatus = mode === "pause" ? "pending" : "cancelled";

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as {
    id: string;
    title: string;
    assigned_agent_id: string | null;
    department_id: string | null;
  } | undefined;
  if (!task) return res.status(404).json({ error: "not_found" });
  const lang = resolveLang(task.title);

  stopProgressTimer(id);

  const activeChild = activeProcesses.get(id);
  if (!activeChild?.pid) {
    // No active process; just update status
    if (targetStatus !== "pending") {
      clearTaskWorkflowState(id);
      endTaskExecutionSession(id, `stop_${targetStatus}`);
    }
    db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(targetStatus, nowMs(), id);
    const shouldRollback = targetStatus !== "pending";
    const rolledBack = shouldRollback
      ? rollbackTaskWorktree(id, `stop_${targetStatus}_no_active_process`)
      : false;
    if (task.assigned_agent_id) {
      db.prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?").run(task.assigned_agent_id);
    }
    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    broadcast("task_update", updatedTask);
    if (targetStatus === "pending") {
      notifyCeo(pickL(l(
        [`'${task.title}' 작업이 보류 상태로 전환되었습니다. 세션은 유지되며 재개 시 이어서 진행됩니다.${rolledBack ? " 코드 변경분은 git rollback 처리되었습니다." : ""}`],
        [`'${task.title}' was moved to pending. The session is preserved and will continue on resume.${rolledBack ? " Code changes were rolled back via git." : ""}`],
        [`'${task.title}' は保留状態に変更されました。セッションは維持され、再開時に継続します。${rolledBack ? " コード変更は git でロールバックされました。" : ""}`],
        [`'${task.title}' 已转为待处理状态。会话会被保留，恢复后将继续执行。${rolledBack ? " 代码变更已通过 git 回滚。" : ""}`],
      ), lang), id);
    } else {
      notifyCeo(pickL(l(
        [`'${task.title}' 작업이 취소되었습니다.${rolledBack ? " 코드 변경분은 git rollback 처리되었습니다." : ""}`],
        [`'${task.title}' was cancelled.${rolledBack ? " Code changes were rolled back via git." : ""}`],
        [`'${task.title}' はキャンセルされました。${rolledBack ? " コード変更は git でロールバックされました。" : ""}`],
        [`'${task.title}' 已取消。${rolledBack ? " 代码变更已通过 git 回滚。" : ""}`],
      ), lang), id);
    }
    return res.json({
      ok: true,
      stopped: false,
      status: targetStatus,
      rolled_back: rolledBack,
      message: "No active process found.",
    });
  }

  // For HTTP agents (negative PID), call kill() which triggers AbortController
  // For CLI agents (positive PID), use OS-level process kill
  stopRequestedTasks.add(id);
  stopRequestModeByTask.set(id, targetStatus === "pending" ? "pause" : "cancel");
  if (targetStatus === "pending") {
    if (activeChild.pid < 0) {
      activeChild.kill();
    } else {
      interruptPidTree(activeChild.pid);
    }
  } else {
    if (activeChild.pid < 0) {
      activeChild.kill();
    } else {
      killPidTree(activeChild.pid);
    }
  }

  const actionLabel = targetStatus === "pending" ? "PAUSE_BREAK" : "STOP";
  appendTaskLog(
    id,
    "system",
    targetStatus === "pending"
      ? `${actionLabel} sent to pid ${activeChild.pid} (graceful interrupt, session_kept=true)`
      : `${actionLabel} sent to pid ${activeChild.pid}`,
  );

  const shouldRollback = targetStatus !== "pending";
  const rolledBack = shouldRollback ? rollbackTaskWorktree(id, `stop_${targetStatus}`) : false;

  const t = nowMs();
  db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(targetStatus, t, id);
  if (targetStatus !== "pending") {
    clearTaskWorkflowState(id);
    endTaskExecutionSession(id, `stop_${targetStatus}`);
  }

  if (task.assigned_agent_id) {
    db.prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?").run(task.assigned_agent_id);
    const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(task.assigned_agent_id);
    broadcast("agent_status", updatedAgent);
  }

  const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  broadcast("task_update", updatedTask);

  // CEO notification
  if (targetStatus === "pending") {
    notifyCeo(pickL(l(
      [`'${task.title}' 작업이 보류 상태로 전환되었습니다. 인터럽트(SIGINT)로 브레이크를 걸었고 세션은 유지됩니다.${rolledBack ? " 코드 변경분은 git rollback 처리되었습니다." : ""}`],
      [`'${task.title}' was moved to pending. A graceful interrupt (SIGINT) was sent and the session is preserved.${rolledBack ? " Code changes were rolled back via git." : ""}`],
      [`'${task.title}' は保留状態に変更されました。SIGINT による中断を送り、セッションは維持されます。${rolledBack ? " コード変更は git でロールバックされました。" : ""}`],
      [`'${task.title}' 已转为待处理状态。已发送 SIGINT 中断，且会话将被保留。${rolledBack ? " 代码变更已通过 git 回滚。" : ""}`],
    ), lang), id);
  } else {
    notifyCeo(pickL(l(
      [`'${task.title}' 작업이 취소되었습니다.${rolledBack ? " 코드 변경분은 git rollback 처리되었습니다." : ""}`],
      [`'${task.title}' was cancelled.${rolledBack ? " Code changes were rolled back via git." : ""}`],
      [`'${task.title}' はキャンセルされました。${rolledBack ? " コード変更は git でロールバックされました。" : ""}`],
      [`'${task.title}' 已取消。${rolledBack ? " 代码变更已通过 git 回滚。" : ""}`],
    ), lang), id);
  }

  res.json({ ok: true, stopped: true, status: targetStatus, pid: activeChild.pid, rolled_back: rolledBack });
});

// Resume a pending or cancelled task → move back to planned (ready to re-run)
app.post("/api/tasks/:id/resume", (req, res) => {
  const id = String(req.params.id);
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as {
    id: string;
    title: string;
    status: string;
    assigned_agent_id: string | null;
  } | undefined;
  if (!task) return res.status(404).json({ error: "not_found" });
  const lang = resolveLang(task.title);
  if (activeProcesses.has(id)) {
    return res.status(409).json({
      error: "already_running",
      message: "Task process is already active.",
    });
  }

  if (task.status !== "pending" && task.status !== "cancelled") {
    return res.status(400).json({ error: "invalid_status", message: `Cannot resume from '${task.status}'` });
  }

  const wasPaused = task.status === "pending";
  const targetStatus = task.assigned_agent_id ? "planned" : "inbox";
  const t = nowMs();
  db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(targetStatus, t, id);

  appendTaskLog(id, "system", `RESUME: ${task.status} → ${targetStatus}`);

  const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  broadcast("task_update", updatedTask);

  let autoResumed = false;
  const existingSession = taskExecutionSessions.get(id);
  if (wasPaused && task.assigned_agent_id) {
    const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(task.assigned_agent_id) as AgentRow | undefined;
    if (agent && agent.status !== "offline") {
      autoResumed = true;
      const deptId = agent.department_id ?? null;
      const deptName = deptId ? getDeptName(deptId) : "Unassigned";
      appendTaskLog(
        id,
        "system",
        `RESUME auto-run scheduled (session=${existingSession?.sessionId ?? "new"})`,
      );
      setTimeout(() => {
        if (isTaskWorkflowInterrupted(id) || activeProcesses.has(id)) return;
        startTaskExecutionForAgent(id, agent, deptId, deptName);
      }, randomDelay(450, 900));
    }
  }

  if (autoResumed) {
    notifyCeo(pickL(l(
      [`'${task.title}' 작업이 복구되었습니다. (${targetStatus}) 기존 세션을 유지한 채 자동 재개를 시작합니다.`],
      [`'${task.title}' was resumed. (${targetStatus}) Auto-resume is starting with the existing session preserved.`],
      [`'${task.title}' が復旧されました。(${targetStatus}) 既存セッションを保持したまま自動再開します。`],
      [`'${task.title}' 已恢复。(${targetStatus}) 将在保留原会话的情况下自动继续执行。`],
    ), lang), id);
  } else {
    notifyCeo(pickL(l(
      [`'${task.title}' 작업이 복구되었습니다. (${targetStatus})`],
      [`'${task.title}' was resumed. (${targetStatus})`],
      [`'${task.title}' が復旧されました。(${targetStatus})`],
      [`'${task.title}' 已恢复。(${targetStatus})`],
    ), lang), id);
  }

  res.json({ ok: true, status: targetStatus, auto_resumed: autoResumed, session_id: existingSession?.sessionId ?? null });
});

  return {

  };
}
