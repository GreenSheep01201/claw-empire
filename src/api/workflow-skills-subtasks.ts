import { del, patch, post, request } from "./core";

import type { MessengerChannelType, SubTask, WorkflowPackKey } from "../types";

// Git Worktree management
export interface TaskDiffResult {
  ok: boolean;
  hasWorktree?: boolean;
  branchName?: string;
  stat?: string;
  diff?: string;
  error?: string;
}

export interface MergeResult {
  ok: boolean;
  message: string;
  conflicts?: string[];
}

export interface WorktreeEntry {
  taskId: string;
  branchName: string;
  worktreePath: string;
  projectPath: string;
}

export async function getTaskDiff(id: string): Promise<TaskDiffResult> {
  return request<TaskDiffResult>(`/api/tasks/${id}/diff`);
}

export async function mergeTask(id: string): Promise<MergeResult> {
  return post(`/api/tasks/${id}/merge`) as Promise<MergeResult>;
}

export async function discardTask(id: string): Promise<{ ok: boolean; message: string }> {
  return post(`/api/tasks/${id}/discard`) as Promise<{ ok: boolean; message: string }>;
}

export async function getWorktrees(): Promise<{ ok: boolean; worktrees: WorktreeEntry[] }> {
  return request<{ ok: boolean; worktrees: WorktreeEntry[] }>("/api/worktrees");
}

// CLI Usage
export interface CliUsageWindow {
  label: string; // "5-hour", "7-day", "Primary", "2.5 Pro", etc.
  utilization: number; // 0.0 – 1.0
  resetsAt: string | null; // ISO 8601
}

export interface CliUsageEntry {
  windows: CliUsageWindow[];
  error: string | null; // "unauthenticated" | "unavailable" | "not_implemented" | null
}

export async function getCliUsage(): Promise<{ ok: boolean; usage: Record<string, CliUsageEntry> }> {
  return request<{ ok: boolean; usage: Record<string, CliUsageEntry> }>("/api/cli-usage");
}

export async function refreshCliUsage(): Promise<{ ok: boolean; usage: Record<string, CliUsageEntry> }> {
  return post("/api/cli-usage/refresh") as Promise<{ ok: boolean; usage: Record<string, CliUsageEntry> }>;
}

// Skills
export interface SkillEntry {
  rank: number;
  name: string;
  skillId: string;
  repo: string;
  installs: number;
}

export async function getSkills(): Promise<SkillEntry[]> {
  const j = await request<{ skills: SkillEntry[] }>("/api/skills");
  return j.skills;
}

export interface SkillDetail {
  title: string;
  description: string;
  whenToUse: string[];
  weeklyInstalls: string;
  firstSeen: string;
  installCommand: string;
  platforms: Array<{ name: string; installs: string }>;
  audits: Array<{ name: string; status: string }>;
}

export async function getSkillDetail(source: string, skillId: string): Promise<SkillDetail | null> {
  const j = await request<{ ok: boolean; detail: SkillDetail | null }>(
    `/api/skills/detail?source=${encodeURIComponent(source)}&skillId=${encodeURIComponent(skillId)}`,
  );
  return j.detail;
}

export type SkillLearnProvider = "claude" | "codex" | "gemini" | "opencode";
export type SkillLearnStatus = "queued" | "running" | "succeeded" | "failed";
export type SkillHistoryProvider = SkillLearnProvider | "copilot" | "antigravity" | "api";

export interface SkillLearnJob {
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

export async function startSkillLearning(input: {
  repo: string;
  skillId?: string;
  providers: SkillLearnProvider[];
}): Promise<SkillLearnJob> {
  const j = (await post("/api/skills/learn", input)) as { ok: boolean; job: SkillLearnJob };
  return j.job;
}

export async function getSkillLearningJob(jobId: string): Promise<SkillLearnJob> {
  const j = await request<{ ok: boolean; job: SkillLearnJob }>(`/api/skills/learn/${encodeURIComponent(jobId)}`);
  return j.job;
}

export interface SkillLearningHistoryEntry {
  id: string;
  job_id: string;
  provider: SkillHistoryProvider;
  repo: string;
  skill_id: string;
  skill_label: string;
  status: SkillLearnStatus;
  command: string;
  error: string | null;
  run_started_at: number | null;
  run_completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface LearnedSkillEntry {
  provider: SkillHistoryProvider;
  repo: string;
  skill_id: string;
  skill_label: string;
  learned_at: number;
}

export async function getSkillLearningHistory(
  input: {
    provider?: SkillHistoryProvider;
    status?: SkillLearnStatus;
    limit?: number;
  } = {},
): Promise<{ history: SkillLearningHistoryEntry[]; retentionDays: number }> {
  const params = new URLSearchParams();
  if (input.provider) params.set("provider", input.provider);
  if (input.status) params.set("status", input.status);
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  const qs = params.toString();
  const j = await request<{ ok: boolean; history: SkillLearningHistoryEntry[]; retention_days: number }>(
    `/api/skills/history${qs ? `?${qs}` : ""}`,
  );
  return { history: j.history ?? [], retentionDays: Number(j.retention_days ?? 0) };
}

export async function getAvailableLearnedSkills(
  input: {
    provider?: SkillHistoryProvider;
    limit?: number;
  } = {},
): Promise<LearnedSkillEntry[]> {
  const params = new URLSearchParams();
  if (input.provider) params.set("provider", input.provider);
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  const qs = params.toString();
  const j = await request<{ ok: boolean; skills: LearnedSkillEntry[] }>(`/api/skills/available${qs ? `?${qs}` : ""}`);
  return j.skills ?? [];
}

export async function unlearnSkill(input: { provider: SkillHistoryProvider; repo: string; skillId?: string }): Promise<{
  ok: boolean;
  provider: SkillHistoryProvider;
  repo: string;
  skill_id: string;
  removed: number;
}> {
  return post("/api/skills/unlearn", input) as Promise<{
    ok: boolean;
    provider: SkillHistoryProvider;
    repo: string;
    skill_id: string;
    removed: number;
  }>;
}

// Custom Skills
export interface CustomSkillEntry {
  skillName: string;
  providers: string[];
  createdAt: number;
  contentLength: number;
}

export async function uploadCustomSkill(input: {
  skillName: string;
  content: string;
  providers: SkillLearnProvider[];
}): Promise<{
  ok: boolean;
  skillName: string;
  providers: SkillLearnProvider[];
  jobId: string;
}> {
  return post<{
    ok: boolean;
    skillName: string;
    providers: SkillLearnProvider[];
    jobId: string;
  }>("/api/skills/custom", input);
}

export async function getCustomSkills(): Promise<CustomSkillEntry[]> {
  const j = await request<{ ok: boolean; skills: CustomSkillEntry[] }>("/api/skills/custom");
  return j.skills ?? [];
}

export async function deleteCustomSkill(skillName: string): Promise<{ ok: boolean }> {
  return del(`/api/skills/custom/${encodeURIComponent(skillName)}`) as Promise<{ ok: boolean }>;
}

export interface WorkflowPackConfig {
  key: WorkflowPackKey;
  name: string;
  enabled: boolean;
  input_schema: unknown;
  prompt_preset: unknown;
  qa_rules: unknown;
  output_template: unknown;
  routing_keywords: unknown;
  cost_profile: unknown;
  created_at?: number;
  updated_at?: number;
}

export interface WorkflowRoutePreviewResult {
  packKey: WorkflowPackKey;
  confidence: number;
  reason: string;
  candidates: Array<{ packKey: WorkflowPackKey; confidence: number; reason: string }>;
  requiresConfirmation: boolean;
}

export async function getWorkflowPacks(): Promise<{ packs: WorkflowPackConfig[]; source?: string }> {
  return request<{ packs: WorkflowPackConfig[]; source?: string }>("/api/workflow-packs");
}

export async function updateWorkflowPack(
  key: WorkflowPackKey,
  input: Partial<Omit<WorkflowPackConfig, "key" | "created_at" | "updated_at">>,
): Promise<{ ok: boolean; pack: WorkflowPackConfig }> {
  return request<{ ok: boolean; pack: WorkflowPackConfig }>(`/api/workflow-packs/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function previewWorkflowRoute(input: {
  text: string;
  workflow_pack_key?: WorkflowPackKey;
  session_key?: string;
  project_id?: string;
}): Promise<WorkflowRoutePreviewResult> {
  return post("/api/workflow/route", input) as Promise<WorkflowRoutePreviewResult>;
}

export type MessengerRuntimeSession = {
  sessionKey: string;
  channel: MessengerChannelType;
  targetId: string;
  enabled: boolean;
  displayName: string;
};

export type TelegramReceiverStatus = {
  running: boolean;
  configured: boolean;
  receiveEnabled: boolean;
  enabled: boolean;
  allowedChatCount: number;
  nextOffset: number;
  lastPollAt: number | null;
  lastForwardAt: number | null;
  lastUpdateId: number | null;
  lastError: string | null;
};

export type DiscordReceiverStatus = {
  running: boolean;
  configured: boolean;
  enabled: boolean;
  routeCount: number;
  nextCursorCount: number;
  lastPollAt: number | null;
  lastForwardAt: number | null;
  lastMessageId: string | null;
  lastError: string | null;
};

export type DiscordDiscoverableChannel = {
  id: string;
  name: string;
  guildId: string;
  guildName: string;
  type: number;
};

export async function getMessengerRuntimeSessions(): Promise<MessengerRuntimeSession[]> {
  const data = await request<{ sessions?: MessengerRuntimeSession[] }>("/api/messenger/sessions");
  return data.sessions ?? [];
}

export async function getTelegramReceiverStatus(): Promise<TelegramReceiverStatus> {
  const data = await request<{ status?: TelegramReceiverStatus }>("/api/messenger/receiver/telegram");
  return (
    data.status ?? {
      running: false,
      configured: false,
      receiveEnabled: false,
      enabled: false,
      allowedChatCount: 0,
      nextOffset: 0,
      lastPollAt: null,
      lastForwardAt: null,
      lastUpdateId: null,
      lastError: "status_unavailable",
    }
  );
}

export async function getDiscordReceiverStatus(): Promise<DiscordReceiverStatus> {
  const data = await request<{ status?: DiscordReceiverStatus }>("/api/messenger/receiver/discord");
  return (
    data.status ?? {
      running: false,
      configured: false,
      enabled: false,
      routeCount: 0,
      nextCursorCount: 0,
      lastPollAt: null,
      lastForwardAt: null,
      lastMessageId: null,
      lastError: "status_unavailable",
    }
  );
}

export async function listDiscordChannelsByToken(token: string): Promise<DiscordDiscoverableChannel[]> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return [];
  }
  const data = await post<{ channels?: DiscordDiscoverableChannel[] }>("/api/messenger/discord/channels", {
    token: normalizedToken,
  });
  return data.channels ?? [];
}

export async function sendMessengerRuntimeMessage(input: {
  text: string;
  sessionKey?: string;
  channel?: MessengerChannelType;
  targetId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  return post("/api/messenger/send", input) as Promise<{ ok: boolean; error?: string }>;
}

// SubTasks
export async function getActiveSubtasks(): Promise<SubTask[]> {
  const j = await request<{ subtasks: SubTask[] }>("/api/subtasks?active=1");
  return j.subtasks;
}

export async function createSubtask(
  taskId: string,
  input: {
    title: string;
    description?: string;
    assigned_agent_id?: string;
  },
): Promise<SubTask> {
  return post(`/api/tasks/${taskId}/subtasks`, input) as Promise<SubTask>;
}

export async function updateSubtask(
  id: string,
  data: Partial<Pick<SubTask, "title" | "description" | "status" | "assigned_agent_id" | "blocked_reason">>,
): Promise<SubTask> {
  return patch(`/api/subtasks/${id}`, data) as Promise<SubTask>;
}
