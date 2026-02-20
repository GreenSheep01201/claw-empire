/**
 * Typed interface for the runtime context object assembled in server-main.ts.
 *
 * All module files keep `// @ts-nocheck` — these annotations exist solely for
 * IDE IntelliSense (autocomplete / hover) and have no compile-time effect.
 *
 * Module-level functions are initially typed as `(...args: any[]) => any`;
 * base-context helpers from server-main.ts carry full signatures.
 */

import type { ChildProcess } from "node:child_process";
import type { IncomingMessage } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { Express } from "express";
import type { WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Helper types (mirrors of unexported types in server-main.ts)
// ---------------------------------------------------------------------------

export type MessageInsertInput = {
  senderType: string;
  senderId: string | null;
  receiverType: string;
  receiverId: string | null;
  content: string;
  messageType: string;
  taskId?: string | null;
  idempotencyKey?: string | null;
};

export type StoredMessage = {
  id: string;
  sender_type: string;
  sender_id: string | null;
  receiver_type: string;
  receiver_id: string | null;
  content: string;
  message_type: string;
  task_id: string | null;
  idempotency_key: string | null;
  created_at: number;
};

export type MessageIngressAuditOutcome =
  | "accepted"
  | "duplicate"
  | "idempotency_conflict"
  | "storage_busy"
  | "validation_error";

export type MessageIngressAuditInput = {
  endpoint: "/api/messages" | "/api/announcements" | "/api/directives" | "/api/inbox";
  req: {
    get(name: string): string | undefined;
    ip?: string;
    socket?: { remoteAddress?: string };
  };
  body: Record<string, unknown>;
  idempotencyKey: string | null;
  outcome: MessageIngressAuditOutcome;
  statusCode: number;
  messageId?: string | null;
  detail?: string | null;
};

// ---------------------------------------------------------------------------
// BaseRuntimeContext — properties from the runtimeContext literal
// (server/server-main.ts)
// ---------------------------------------------------------------------------

export interface BaseRuntimeContext {
  app: Express;
  db: DatabaseSync;
  dbPath: string;
  logsDir: string;
  distDir: string;
  isProduction: boolean;

  // Helpers
  nowMs(): number;
  runInTransaction(fn: () => void): void;
  firstQueryValue(value: unknown): string | undefined;

  // Timing constants
  IN_PROGRESS_ORPHAN_GRACE_MS: number;
  IN_PROGRESS_ORPHAN_SWEEP_MS: number;
  SUBTASK_DELEGATION_SWEEP_MS: number;

  // OAuth
  ensureOAuthActiveAccount(provider: string): void;
  getActiveOAuthAccountIds(provider: string): string[];
  setActiveOAuthAccount(provider: string, accountId: string): void;
  setOAuthActiveAccounts(provider: string, accountIds: string[]): void;
  removeActiveOAuthAccount(provider: string, accountId: string): void;

  // Security
  isIncomingMessageAuthenticated(req: IncomingMessage): boolean;
  isIncomingMessageOriginTrusted(req: IncomingMessage): boolean;

  // Error classes (stored as constructors)
  IdempotencyConflictError: { new (key: string): Error & { readonly key: string } };
  StorageBusyError: {
    new (operation: string, attempts: number): Error & {
      readonly operation: string;
      readonly attempts: number;
    };
  };

  // Message idempotency
  insertMessageWithIdempotency(
    input: MessageInsertInput,
  ): Promise<{ message: StoredMessage; created: boolean }>;
  resolveMessageIdempotencyKey(
    req: { get(name: string): string | undefined },
    body: Record<string, unknown>,
    scope: string,
  ): string | null;
  withSqliteBusyRetry<T>(operation: string, fn: () => T): Promise<T>;

  // Audit
  recordMessageIngressAuditOr503(
    res: { status(code: number): { json(payload: unknown): unknown } },
    input: MessageIngressAuditInput,
  ): boolean;
  recordAcceptedIngressAuditOrRollback(
    res: { status(code: number): { json(payload: unknown): unknown } },
    input: Omit<MessageIngressAuditInput, "messageId">,
    messageId: string,
  ): Promise<boolean>;

  // Re-exported library constructors
  WebSocket: typeof import("ws").WebSocket;
  WebSocketServer: typeof import("ws").WebSocketServer;
  express: typeof import("express");

  // Mutable — starts empty, populated by routes
  DEPT_KEYWORDS: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// WorkflowCoreExports — returned from initializeWorkflowPartA
// (server/modules/workflow/core.ts)
// ---------------------------------------------------------------------------

export interface WorkflowCoreExports {
  // Data structures
  wsClients: Set<WebSocket>;
  activeProcesses: Map<string, ChildProcess>;
  stopRequestedTasks: Set<string>;
  stopRequestModeByTask: Map<string, "pause" | "cancel">;
  taskWorktrees: Map<string, { worktreePath: string; branchName: string; projectPath: string }>;
  TASK_RUN_IDLE_TIMEOUT_MS: number;
  TASK_RUN_HARD_TIMEOUT_MS: number;

  // Functions (broadcast has a known signature from ws/hub.ts)
  broadcast(type: string, payload: unknown): void;
  createWorktree: (...args: any[]) => any;
  mergeWorktree: (...args: any[]) => any;
  cleanupWorktree: (...args: any[]) => any;
  rollbackTaskWorktree: (...args: any[]) => any;
  getWorktreeDiffSummary: (...args: any[]) => any;
  hasExplicitWarningFixRequest: (...args: any[]) => any;
  buildTaskExecutionPrompt: (...args: any[]) => any;
  generateProjectContext: (...args: any[]) => any;
  getRecentChanges: (...args: any[]) => any;
  ensureClaudeMd: (...args: any[]) => any;
  buildAgentArgs: (...args: any[]) => any;
  shouldSkipDuplicateCliOutput: (...args: any[]) => any;
  clearCliOutputDedup: (...args: any[]) => any;
  normalizeStreamChunk: (...args: any[]) => any;
  hasStructuredJsonLines: (...args: any[]) => any;
  getRecentConversationContext: (...args: any[]) => any;
  getTaskContinuationContext: (...args: any[]) => any;
  sleepMs(ms: number): Promise<void>;
  randomDelay: (...args: any[]) => any;
  getAgentDisplayName: (...args: any[]) => any;
  chooseSafeReply: (...args: any[]) => any;
  summarizeForMeetingBubble: (...args: any[]) => any;
  hasVisibleDiffSummary: (...args: any[]) => any;
  isDeferrableReviewHold: (...args: any[]) => any;
  classifyMeetingReviewDecision: (...args: any[]) => any;
  wantsReviewRevision: (...args: any[]) => any;
  findLatestTranscriptContentByAgent: (...args: any[]) => any;
  buildMeetingPrompt: (...args: any[]) => any;
  buildDirectReplyPrompt: (...args: any[]) => any;
  buildCliFailureMessage: (...args: any[]) => any;
  runAgentOneShot: (...args: any[]) => any;
}

// ---------------------------------------------------------------------------
// WorkflowAgentExports — returned from initializeWorkflowPartB
// (server/modules/workflow/agents.ts)
// ---------------------------------------------------------------------------

export interface WorkflowAgentExports {
  // Data structures
  httpAgentCounter: number;
  cachedModels: { data: Record<string, string[]>; loadedAt: number } | null;
  MODELS_CACHE_TTL: number;
  cachedCliStatus: { data: any; loadedAt: number } | null;
  CLI_STATUS_TTL: number;
  CLI_TOOLS: any[];

  // Functions
  analyzeSubtaskDepartment: (...args: any[]) => any;
  seedApprovedPlanSubtasks: (...args: any[]) => any;
  seedReviewRevisionSubtasks: (...args: any[]) => any;
  codexThreadToSubtask: (...args: any[]) => any;
  spawnCliAgent: (...args: any[]) => any;
  normalizeOAuthProvider: (...args: any[]) => any;
  getNextOAuthLabel: (...args: any[]) => any;
  getOAuthAccounts: (...args: any[]) => any;
  getPreferredOAuthAccounts: (...args: any[]) => any;
  getDecryptedOAuthToken: (...args: any[]) => any;
  getProviderModelConfig: (...args: any[]) => any;
  refreshGoogleToken: (...args: any[]) => any;
  executeCopilotAgent: (...args: any[]) => any;
  executeAntigravityAgent: (...args: any[]) => any;
  launchHttpAgent: (...args: any[]) => any;
  killPidTree: (...args: any[]) => any;
  isPidAlive: (...args: any[]) => any;
  interruptPidTree: (...args: any[]) => any;
  appendTaskLog: (...args: any[]) => any;
  fetchClaudeUsage: (...args: any[]) => any;
  fetchCodexUsage: (...args: any[]) => any;
  fetchGeminiUsage: (...args: any[]) => any;
  execWithTimeout: (...args: any[]) => any;
  detectAllCli: (...args: any[]) => any;
}

// ---------------------------------------------------------------------------
// WorkflowOrchestrationExports — returned from initializeWorkflowPartC
// (server/modules/workflow/orchestration.ts)
// ---------------------------------------------------------------------------

export interface WorkflowOrchestrationExports {
  // Data structures
  crossDeptNextCallbacks: Map<string, () => void>;
  subtaskDelegationCallbacks: Map<string, () => void>;
  subtaskDelegationDispatchInFlight: Set<string>;
  delegatedTaskToSubtask: Map<string, string>;
  subtaskDelegationCompletionNoticeSent: Set<string>;
  meetingPresenceUntil: Map<string, number>;
  meetingSeatIndexByAgent: Map<string, number>;
  meetingPhaseByAgent: Map<string, "kickoff" | "review">;
  meetingTaskIdByAgent: Map<string, string>;
  meetingReviewDecisionByAgent: Map<string, "reviewing" | "approved" | "hold">;
  taskExecutionSessions: Map<string, any>;

  // Functions
  ensureTaskExecutionSession: (...args: any[]) => any;
  endTaskExecutionSession: (...args: any[]) => any;
  isTaskWorkflowInterrupted: (...args: any[]) => any;
  clearTaskWorkflowState: (...args: any[]) => any;
  startProgressTimer: (...args: any[]) => any;
  stopProgressTimer: (...args: any[]) => any;
  notifyCeo: (...args: any[]) => any;
  isAgentInMeeting: (...args: any[]) => any;
  startTaskExecutionForAgent: (...args: any[]) => any;
  startPlannedApprovalMeeting: (...args: any[]) => any;
  handleTaskRunComplete: (...args: any[]) => any;
  finishReview: (...args: any[]) => any;
}

// ---------------------------------------------------------------------------
// RouteCollabExports — returned from registerRoutesPartB
// (server/modules/routes/collab.ts)
// ---------------------------------------------------------------------------

export interface RouteCollabExports {
  DEPT_KEYWORDS: Record<string, string[]>;
  sendAgentMessage: (...args: any[]) => any;
  getPreferredLanguage: (...args: any[]) => any;
  resolveLang: (...args: any[]) => any;
  detectLang: (...args: any[]) => any;
  l: (...args: any[]) => any;
  pickL: (...args: any[]) => any;
  getRoleLabel: (...args: any[]) => any;
  scheduleAnnouncementReplies: (...args: any[]) => any;
  normalizeTextField: (...args: any[]) => any;
  analyzeDirectivePolicy: (...args: any[]) => any;
  shouldExecuteDirectiveDelegation: (...args: any[]) => any;
  detectTargetDepartments: (...args: any[]) => any;
  detectMentions: (...args: any[]) => any;
  handleMentionDelegation: (...args: any[]) => any;
  findTeamLeader: (...args: any[]) => any;
  getDeptName: (...args: any[]) => any;
  getDeptRoleConstraint: (...args: any[]) => any;
  formatTaskSubtaskProgressSummary: (...args: any[]) => any;
  processSubtaskDelegations: (...args: any[]) => any;
  reconcileCrossDeptSubtasks: (...args: any[]) => any;
  recoverCrossDeptQueueAfterMissingCallback: (...args: any[]) => any;
  resolveProjectPath: (...args: any[]) => any;
  handleReportRequest: (...args: any[]) => any;
  handleTaskDelegation: (...args: any[]) => any;
  scheduleAgentReply: (...args: any[]) => any;
}

// ---------------------------------------------------------------------------
// RouteOpsExports — returned from registerRoutesPartC
// (server/modules/routes/ops.ts)
// ---------------------------------------------------------------------------

export interface RouteOpsExports {
  prettyStreamJson: (...args: any[]) => any;
  refreshCliUsageData: (...args: any[]) => any;
}

// ---------------------------------------------------------------------------
// Composite type — the fully-assembled runtime context
// ---------------------------------------------------------------------------

export type RuntimeContext = BaseRuntimeContext &
  WorkflowCoreExports &
  WorkflowAgentExports &
  WorkflowOrchestrationExports &
  RouteCollabExports &
  RouteOpsExports;
