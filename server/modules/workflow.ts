// @ts-nocheck

import type { RuntimeContext, WorkflowCoreExports, WorkflowAgentExports, WorkflowOrchestrationExports } from "../types/runtime-context.ts";
import { initializeWorkflowPartA } from "./workflow/core.ts";
import { initializeWorkflowPartB } from "./workflow/agents.ts";
import { initializeWorkflowPartC } from "./workflow/orchestration.ts";
import {
  assertNoUnresolvedDeferredRuntimeFunctions,
  createDeferredRuntimeProxy,
} from "./deferred-runtime.ts";

export function initializeWorkflow(ctx: RuntimeContext): WorkflowCoreExports & WorkflowAgentExports & WorkflowOrchestrationExports {
  const runtime: RuntimeContext = ctx;
  const runtimeProxy = createDeferredRuntimeProxy(runtime);

  runtime.DEPT_KEYWORDS = runtime.DEPT_KEYWORDS ?? {};

  Object.assign(runtime, initializeWorkflowPartA(runtimeProxy));
  Object.assign(runtime, initializeWorkflowPartB(runtimeProxy));
  Object.assign(runtime, initializeWorkflowPartC(runtimeProxy));

  const workflowExports = {
    CLI_STATUS_TTL: runtime.CLI_STATUS_TTL,
    CLI_TOOLS: runtime.CLI_TOOLS,
    MODELS_CACHE_TTL: runtime.MODELS_CACHE_TTL,
    activeProcesses: runtime.activeProcesses,
    analyzeSubtaskDepartment: runtime.analyzeSubtaskDepartment,
    appendTaskLog: runtime.appendTaskLog,
    broadcast: runtime.broadcast,
    buildCliFailureMessage: runtime.buildCliFailureMessage,
    buildDirectReplyPrompt: runtime.buildDirectReplyPrompt,
    buildTaskExecutionPrompt: runtime.buildTaskExecutionPrompt,
    cachedCliStatus: runtime.cachedCliStatus,
    cachedModels: runtime.cachedModels,
    chooseSafeReply: runtime.chooseSafeReply,
    cleanupWorktree: runtime.cleanupWorktree,
    clearTaskWorkflowState: runtime.clearTaskWorkflowState,
    createWorktree: runtime.createWorktree,
    crossDeptNextCallbacks: runtime.crossDeptNextCallbacks,
    delegatedTaskToSubtask: runtime.delegatedTaskToSubtask,
    detectAllCli: runtime.detectAllCli,
    endTaskExecutionSession: runtime.endTaskExecutionSession,
    ensureClaudeMd: runtime.ensureClaudeMd,
    ensureTaskExecutionSession: runtime.ensureTaskExecutionSession,
    execWithTimeout: runtime.execWithTimeout,
    fetchClaudeUsage: runtime.fetchClaudeUsage,
    fetchCodexUsage: runtime.fetchCodexUsage,
    fetchGeminiUsage: runtime.fetchGeminiUsage,
    finishReview: runtime.finishReview,
    generateProjectContext: runtime.generateProjectContext,
    getAgentDisplayName: runtime.getAgentDisplayName,
    getDecryptedOAuthToken: runtime.getDecryptedOAuthToken,
    getNextOAuthLabel: runtime.getNextOAuthLabel,
    getOAuthAccounts: runtime.getOAuthAccounts,
    getPreferredOAuthAccounts: runtime.getPreferredOAuthAccounts,
    getProviderModelConfig: runtime.getProviderModelConfig,
    getRecentChanges: runtime.getRecentChanges,
    getRecentConversationContext: runtime.getRecentConversationContext,
    getTaskContinuationContext: runtime.getTaskContinuationContext,
    handleTaskRunComplete: runtime.handleTaskRunComplete,
    hasExplicitWarningFixRequest: runtime.hasExplicitWarningFixRequest,
    hasStructuredJsonLines: runtime.hasStructuredJsonLines,
    httpAgentCounter: runtime.httpAgentCounter,
    interruptPidTree: runtime.interruptPidTree,
    isAgentInMeeting: runtime.isAgentInMeeting,
    isPidAlive: runtime.isPidAlive,
    isTaskWorkflowInterrupted: runtime.isTaskWorkflowInterrupted,
    killPidTree: runtime.killPidTree,
    launchHttpAgent: runtime.launchHttpAgent,
    meetingPhaseByAgent: runtime.meetingPhaseByAgent,
    meetingPresenceUntil: runtime.meetingPresenceUntil,
    meetingReviewDecisionByAgent: runtime.meetingReviewDecisionByAgent,
    meetingSeatIndexByAgent: runtime.meetingSeatIndexByAgent,
    meetingTaskIdByAgent: runtime.meetingTaskIdByAgent,
    mergeWorktree: runtime.mergeWorktree,
    normalizeOAuthProvider: runtime.normalizeOAuthProvider,
    notifyCeo: runtime.notifyCeo,
    randomDelay: runtime.randomDelay,
    refreshGoogleToken: runtime.refreshGoogleToken,
    rollbackTaskWorktree: runtime.rollbackTaskWorktree,
    runAgentOneShot: runtime.runAgentOneShot,
    seedApprovedPlanSubtasks: runtime.seedApprovedPlanSubtasks,
    spawnCliAgent: runtime.spawnCliAgent,
    startPlannedApprovalMeeting: runtime.startPlannedApprovalMeeting,
    startProgressTimer: runtime.startProgressTimer,
    startTaskExecutionForAgent: runtime.startTaskExecutionForAgent,
    stopProgressTimer: runtime.stopProgressTimer,
    stopRequestModeByTask: runtime.stopRequestModeByTask,
    stopRequestedTasks: runtime.stopRequestedTasks,
    subtaskDelegationCallbacks: runtime.subtaskDelegationCallbacks,
    subtaskDelegationCompletionNoticeSent: runtime.subtaskDelegationCompletionNoticeSent,
    subtaskDelegationDispatchInFlight: runtime.subtaskDelegationDispatchInFlight,
    taskExecutionSessions: runtime.taskExecutionSessions,
    taskWorktrees: runtime.taskWorktrees,
    wsClients: runtime.wsClients,
  };

  assertNoUnresolvedDeferredRuntimeFunctions(workflowExports, "workflow export wiring");
  return workflowExports;
}
