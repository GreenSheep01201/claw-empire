import type {
  Department, Agent, Task, TaskLog, Message,
  CliStatusMap, CompanyStats, CompanySettings,
  TaskStatus, TaskType, CliProvider, AgentRole,
  MessageType, ReceiverType, SubTask, MeetingMinute,
  MeetingPresence,
  Project,
  CliModelInfo,
  RoomTheme
} from './types';

const rawBaseUrl = (import.meta.env.BASE_URL || '/').trim();
const base = rawBaseUrl === '/' ? '' : rawBaseUrl.replace(/\/+$/, '');
const SESSION_BOOTSTRAP_PATH = '/api/auth/session';
const API_AUTH_TOKEN_SESSION_KEY = 'claw_api_auth_token';
const POST_RETRY_LIMIT = 2;
const POST_TIMEOUT_MS = 12_000;
const POST_BACKOFF_BASE_MS = 250;
const POST_BACKOFF_MAX_MS = 2_000;
let runtimeApiAuthToken: string | undefined;
let sessionBootstrapPromise: Promise<boolean> | null = null;

function normalizeApiAuthToken(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function readStoredApiAuthToken(): string {
  if (runtimeApiAuthToken !== undefined) return runtimeApiAuthToken;
  if (typeof window === 'undefined') {
    runtimeApiAuthToken = '';
    return runtimeApiAuthToken;
  }
  try {
    runtimeApiAuthToken = normalizeApiAuthToken(window.sessionStorage.getItem(API_AUTH_TOKEN_SESSION_KEY));
  } catch {
    runtimeApiAuthToken = '';
  }
  return runtimeApiAuthToken;
}

function writeStoredApiAuthToken(token: string): void {
  runtimeApiAuthToken = token;
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.sessionStorage.setItem(API_AUTH_TOKEN_SESSION_KEY, token);
    } else {
      window.sessionStorage.removeItem(API_AUTH_TOKEN_SESSION_KEY);
    }
  } catch {
    // ignore storage write errors
  }
}

function promptForApiAuthToken(hasExistingToken: boolean): string {
  if (typeof window === 'undefined') return '';
  const promptText = hasExistingToken
    ? 'Stored API token was rejected. Enter a new API token:'
    : 'Enter API token for this server:';
  return normalizeApiAuthToken(window.prompt(promptText));
}

export function setApiAuthToken(token?: string | null): void {
  writeStoredApiAuthToken(normalizeApiAuthToken(token));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeIdempotencyKey(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError';
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function backoffDelayMs(attempt: number): number {
  const exponential = Math.min(POST_BACKOFF_BASE_MS * (2 ** attempt), POST_BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * 120);
  return exponential + jitter;
}

async function postWithIdempotency<T>(
  url: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
  canRetryAuth = true,
): Promise<T> {
  const payload = { ...body, idempotency_key: idempotencyKey };
  const baseHeaders: HeadersInit = {
    'content-type': 'application/json',
    'x-idempotency-key': idempotencyKey,
  };

  for (let attempt = 0; attempt <= POST_RETRY_LIMIT; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);

    try {
      const headers = withAuthHeaders(baseHeaders);
      const r = await fetch(`${base}${url}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'same-origin',
      });
      if (r.status === 401 && canRetryAuth && url !== SESSION_BOOTSTRAP_PATH) {
        await bootstrapSession();
        return postWithIdempotency<T>(url, body, idempotencyKey, false);
      }
      if (r.ok) {
        return r.json();
      }

      const responseBody = await r.json().catch(() => null);
      const errMsg = responseBody?.error ?? responseBody?.message ?? `Request failed: ${r.status}`;
      if (attempt < POST_RETRY_LIMIT && shouldRetryStatus(r.status)) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      throw new Error(errMsg);
    } catch (err) {
      const retryableNetworkError = err instanceof TypeError || isAbortError(err);
      if (attempt < POST_RETRY_LIMIT && retryableNetworkError) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('unreachable_retry_loop');
}

function extractMessageId(payload: unknown): string {
  const maybePayload = payload as {
    id?: unknown;
    message?: { id?: unknown };
  } | null;
  if (maybePayload && typeof maybePayload.id === 'string' && maybePayload.id) {
    return maybePayload.id;
  }
  if (maybePayload?.message && typeof maybePayload.message.id === 'string' && maybePayload.message.id) {
    return maybePayload.message.id;
  }
  throw new Error('message_id_missing');
}

function withAuthHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const runtimeToken = readStoredApiAuthToken();
  if (runtimeToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${runtimeToken}`);
  }
  return headers;
}

async function doBootstrapSession(promptOnUnauthorized: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${base}${SESSION_BOOTSTRAP_PATH}`, {
      method: 'GET',
      headers: withAuthHeaders(),
      credentials: 'same-origin',
    });
    if (response.ok) return true;
    if (response.status === 401 && promptOnUnauthorized) {
      const nextToken = promptForApiAuthToken(Boolean(readStoredApiAuthToken()));
      if (nextToken) {
        writeStoredApiAuthToken(nextToken);
        return doBootstrapSession(false);
      }
    }
  } catch {
    // ignore bootstrap failures; main request will surface any errors
  }
  return false;
}

export async function bootstrapSession(options?: { promptOnUnauthorized?: boolean }): Promise<boolean> {
  const promptOnUnauthorized = options?.promptOnUnauthorized ?? true;
  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = doBootstrapSession(promptOnUnauthorized).finally(() => {
      sessionBootstrapPromise = null;
    });
  }
  return sessionBootstrapPromise;
}

async function request<T>(url: string, init?: RequestInit, canRetryAuth = true): Promise<T> {
  const headers = withAuthHeaders(init?.headers);
  const r = await fetch(`${base}${url}`, {
    credentials: 'same-origin',
    ...init,
    headers,
  });
  if (r.status === 401 && canRetryAuth && url !== SESSION_BOOTSTRAP_PATH) {
    await bootstrapSession();
    return request<T>(url, init, false);
  }
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.error ?? body?.message ?? `Request failed: ${r.status}`);
  }
  return r.json();
}

function post(url: string, body?: unknown) {
  return request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function patch(url: string, body: unknown) {
  return request(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function put(url: string, body: unknown) {
  return request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(url: string) {
  return request(url, { method: 'DELETE' });
}

// Departments
export async function getDepartments(): Promise<Department[]> {
  const j = await request<{ departments: Department[] }>('/api/departments');
  return j.departments;
}

export async function getDepartment(id: string): Promise<{ department: Department; agents: Agent[] }> {
  return request(`/api/departments/${id}`);
}

// Agents
export async function getAgents(): Promise<Agent[]> {
  const j = await request<{ agents: Agent[] }>('/api/agents');
  return j.agents;
}

export async function getAgent(id: string): Promise<Agent> {
  const j = await request<{ agent: Agent }>(`/api/agents/${id}`);
  return j.agent;
}

export async function getMeetingPresence(): Promise<MeetingPresence[]> {
  const j = await request<{ presence: MeetingPresence[] }>('/api/meeting-presence');
  return j.presence;
}

export async function updateAgent(
  id: string,
  data: Partial<Pick<Agent, 'status' | 'current_task_id' | 'department_id' | 'role' | 'cli_provider' | 'oauth_account_id' | 'api_provider_id' | 'api_model' | 'personality'>>,
): Promise<void> {
  await patch(`/api/agents/${id}`, data);
}

// Tasks
export async function getTasks(filters?: { status?: TaskStatus; department_id?: string; agent_id?: string }): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.department_id) params.set('department_id', filters.department_id);
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  const q = params.toString();
  const j = await request<{ tasks: Task[] }>(`/api/tasks${q ? '?' + q : ''}`);
  return j.tasks;
}

export async function getTask(id: string): Promise<{ task: Task; logs: TaskLog[]; subtasks: SubTask[] }> {
  return request(`/api/tasks/${id}`);
}

export async function createTask(input: {
  title: string;
  description?: string;
  department_id?: string;
  task_type?: TaskType;
  priority?: number;
  project_id?: string;
  project_path?: string;
  assigned_agent_id?: string;
}): Promise<string> {
  const j = await post('/api/tasks', input) as { id: string };
  return j.id;
}

export async function updateTask(id: string, data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'task_type' | 'department_id' | 'project_id' | 'project_path'>>): Promise<void> {
  await patch(`/api/tasks/${id}`, data);
}

export async function deleteTask(id: string): Promise<void> {
  await del(`/api/tasks/${id}`);
}

export async function assignTask(id: string, agentId: string): Promise<void> {
  await post(`/api/tasks/${id}/assign`, { agent_id: agentId });
}

export async function runTask(id: string): Promise<void> {
  await post(`/api/tasks/${id}/run`);
}

export async function stopTask(id: string): Promise<void> {
  await post(`/api/tasks/${id}/stop`, { mode: 'cancel' });
}

export async function pauseTask(id: string): Promise<void> {
  await post(`/api/tasks/${id}/stop`, { mode: 'pause' });
}

export async function resumeTask(id: string): Promise<void> {
  await post(`/api/tasks/${id}/resume`);
}

// Projects
export interface ProjectTaskHistoryItem {
  id: string;
  title: string;
  status: string;
  task_type: string;
  priority: number;
  source_task_id?: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  assigned_agent_id: string | null;
  assigned_agent_name: string;
  assigned_agent_name_ko: string;
}

export interface ProjectReportHistoryItem {
  id: string;
  title: string;
  completed_at: number | null;
  created_at: number;
  assigned_agent_id: string | null;
  agent_name: string;
  agent_name_ko: string;
  dept_name: string;
  dept_name_ko: string;
}

export interface ProjectDetailResponse {
  project: Project;
  tasks: ProjectTaskHistoryItem[];
  reports: ProjectReportHistoryItem[];
}

export async function getProjects(params?: {
  page?: number;
  page_size?: number;
  search?: string;
}): Promise<{
  projects: Project[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.page_size) sp.set('page_size', String(params.page_size));
  if (params?.search) sp.set('search', params.search);
  const q = sp.toString();
  return request(`/api/projects${q ? `?${q}` : ''}`);
}

export async function createProject(input: {
  name: string;
  project_path: string;
  core_goal: string;
}): Promise<Project> {
  const j = await post('/api/projects', input) as { ok: boolean; project: Project };
  return j.project;
}

export async function updateProject(
  id: string,
  patchData: Partial<Pick<Project, 'name' | 'project_path' | 'core_goal'>>,
): Promise<Project> {
  const j = await patch(`/api/projects/${id}`, patchData) as { ok: boolean; project: Project };
  return j.project;
}

export async function deleteProject(id: string): Promise<void> {
  await del(`/api/projects/${id}`);
}

export async function getProjectDetail(id: string): Promise<ProjectDetailResponse> {
  return request(`/api/projects/${id}`);
}

// Messages
export async function getMessages(params: { receiver_type?: ReceiverType; receiver_id?: string; limit?: number }): Promise<Message[]> {
  const sp = new URLSearchParams();
  if (params.receiver_type) sp.set('receiver_type', params.receiver_type);
  if (params.receiver_id) sp.set('receiver_id', params.receiver_id);
  if (params.limit) sp.set('limit', String(params.limit));
  const q = sp.toString();
  const j = await request<{ messages: Message[] }>(`/api/messages${q ? '?' + q : ''}`);
  return j.messages;
}

export async function sendMessage(input: {
  receiver_type: ReceiverType;
  receiver_id?: string;
  content: string;
  message_type?: MessageType;
  task_id?: string;
  project_id?: string;
  project_path?: string;
  project_context?: string;
}): Promise<string> {
  const idempotencyKey = makeIdempotencyKey('ceo-message');
  const j = await postWithIdempotency<{ id?: string; message?: { id?: string } }>(
    '/api/messages',
    { sender_type: 'ceo', ...input },
    idempotencyKey,
  );
  return extractMessageId(j);
}

export async function sendAnnouncement(content: string): Promise<string> {
  const idempotencyKey = makeIdempotencyKey('ceo-announcement');
  const j = await postWithIdempotency<{ id?: string; message?: { id?: string } }>(
    '/api/announcements',
    { content },
    idempotencyKey,
  );
  return extractMessageId(j);
}

export async function sendDirective(content: string): Promise<string> {
  const idempotencyKey = makeIdempotencyKey('ceo-directive');
  const j = await postWithIdempotency<{ id?: string; message?: { id?: string } }>(
    '/api/directives',
    { content },
    idempotencyKey,
  );
  return extractMessageId(j);
}

export async function sendDirectiveWithProject(input: {
  content: string;
  project_id?: string;
  project_path?: string;
  project_context?: string;
}): Promise<string> {
  const idempotencyKey = makeIdempotencyKey('ceo-directive');
  const j = await postWithIdempotency<{ id?: string; message?: { id?: string } }>(
    '/api/directives',
    input,
    idempotencyKey,
  );
  return extractMessageId(j);
}

export async function clearMessages(agentId?: string): Promise<void> {
  const params = new URLSearchParams();
  if (agentId) {
    params.set('agent_id', agentId);
  } else {
    params.set('scope', 'announcements');
  }
  await del(`/api/messages?${params.toString()}`);
}

export type TerminalProgressHint = {
  phase: 'use' | 'ok' | 'error';
  tool: string;
  summary: string;
  file_path: string | null;
};

export type TerminalProgressHintsPayload = {
  current_file: string | null;
  hints: TerminalProgressHint[];
  ok_items: string[];
};

// Terminal
export async function getTerminal(id: string, lines?: number, pretty?: boolean, logLimit?: number): Promise<{
  ok: boolean;
  exists: boolean;
  path: string;
  text: string;
  task_logs?: Array<{ id: number; kind: string; message: string; created_at: number }>;
  progress_hints?: TerminalProgressHintsPayload | null;
}> {
  const params = new URLSearchParams();
  if (lines) params.set('lines', String(lines));
  if (pretty) params.set('pretty', '1');
  if (logLimit) params.set('log_limit', String(logLimit));
  const q = params.toString();
  return request(`/api/tasks/${id}/terminal${q ? '?' + q : ''}`);
}

export async function getTaskMeetingMinutes(id: string): Promise<MeetingMinute[]> {
  const j = await request<{ meetings: MeetingMinute[] }>(`/api/tasks/${id}/meeting-minutes`);
  return j.meetings;
}

// CLI Status
export async function getCliStatus(refresh?: boolean): Promise<CliStatusMap> {
  const q = refresh ? '?refresh=1' : '';
  const j = await request<{ providers: CliStatusMap }>(`/api/cli-status${q}`);
  return j.providers;
}

// Stats
export async function getStats(): Promise<CompanyStats> {
  const j = await request<{ stats: CompanyStats }>('/api/stats');
  return j.stats;
}

// Settings
export async function getSettings(): Promise<CompanySettings> {
  const j = await request<{ settings: CompanySettings }>('/api/settings');
  return j.settings;
}

export async function saveSettings(settings: CompanySettings): Promise<void> {
  await put('/api/settings', settings);
}

export async function saveSettingsPatch(patch: Record<string, unknown>): Promise<void> {
  await put('/api/settings', patch);
}

export async function saveRoomThemes(roomThemes: Record<string, RoomTheme>): Promise<void> {
  await put('/api/settings', { roomThemes });
}

export interface UpdateStatus {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  checked_at: number;
  enabled: boolean;
  repo: string;
  error: string | null;
}

export async function getUpdateStatus(refresh?: boolean): Promise<UpdateStatus> {
  const q = refresh ? '?refresh=1' : '';
  const j = await request<UpdateStatus & { ok?: boolean }>(`/api/update-status${q}`);
  const { ok: _ok, ...status } = j;
  return status;
}

export async function setAutoUpdateEnabled(enabled: boolean): Promise<void> {
  await post("/api/update-auto-config", { enabled });
}

// OAuth
export interface OAuthAccountInfo {
  id: string;
  label: string | null;
  email: string | null;
  source: string | null;
  scope: string | null;
  status: "active" | "disabled";
  priority: number;
  expires_at: number | null;
  hasRefreshToken: boolean;
  executionReady: boolean;
  active: boolean;
  modelOverride?: string | null;
  failureCount?: number;
  lastError?: string | null;
  lastErrorAt?: number | null;
  lastSuccessAt?: number | null;
  created_at: number;
  updated_at: number;
}

export interface OAuthProviderStatus {
  connected: boolean;
  detected?: boolean;
  executionReady?: boolean;
  requiresWebOAuth?: boolean;
  source: string | null;
  email: string | null;
  scope: string | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
  webConnectable: boolean;
  hasRefreshToken?: boolean;
  refreshFailed?: boolean;
  lastRefreshed?: number | null;
  activeAccountId?: string | null;
  activeAccountIds?: string[];
  accounts?: OAuthAccountInfo[];
}

export type OAuthConnectProvider = "github-copilot" | "antigravity";

export interface OAuthStatus {
  storageReady: boolean;
  providers: Record<string, OAuthProviderStatus>;
}

export async function getOAuthStatus(): Promise<OAuthStatus> {
  return request<OAuthStatus>('/api/oauth/status');
}

export function getOAuthStartUrl(provider: OAuthConnectProvider, redirectTo: string): string {
  const params = new URLSearchParams({ provider, redirect_to: redirectTo });
  return `/api/oauth/start?${params.toString()}`;
}

export async function disconnectOAuth(provider: OAuthConnectProvider): Promise<void> {
  await post('/api/oauth/disconnect', { provider });
}

export interface OAuthRefreshResult {
  ok: boolean;
  expires_at: number | null;
  refreshed_at: number;
}

export async function refreshOAuthToken(provider: OAuthConnectProvider): Promise<OAuthRefreshResult> {
  return post('/api/oauth/refresh', { provider }) as Promise<OAuthRefreshResult>;
}

export async function activateOAuthAccount(
  provider: OAuthConnectProvider,
  accountId: string,
  mode: "exclusive" | "add" | "remove" | "toggle" = "exclusive",
): Promise<{ ok: boolean; activeAccountIds?: string[] }> {
  return post('/api/oauth/accounts/activate', { provider, account_id: accountId, mode }) as Promise<{ ok: boolean; activeAccountIds?: string[] }>;
}

export async function updateOAuthAccount(
  accountId: string,
  patch: { label?: string | null; model_override?: string | null; priority?: number; status?: "active" | "disabled" },
): Promise<{ ok: boolean }> {
  return put(`/api/oauth/accounts/${accountId}`, patch) as Promise<{ ok: boolean }>;
}

export async function deleteOAuthAccount(
  provider: OAuthConnectProvider,
  accountId: string,
): Promise<{ ok: boolean }> {
  return post('/api/oauth/disconnect', { provider, account_id: accountId }) as Promise<{ ok: boolean }>;
}

// GitHub Device Code Flow
export interface DeviceCodeStart {
  stateId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DevicePollResult {
  status: "pending" | "complete" | "slow_down" | "expired" | "denied" | "error";
  email?: string | null;
  error?: string;
}

export async function startGitHubDeviceFlow(): Promise<DeviceCodeStart> {
  return post('/api/oauth/github-copilot/device-start') as Promise<DeviceCodeStart>;
}

export async function pollGitHubDevice(stateId: string): Promise<DevicePollResult> {
  return post('/api/oauth/github-copilot/device-poll', { stateId }) as Promise<DevicePollResult>;
}

// OAuth Models
export async function getOAuthModels(refresh = false): Promise<Record<string, string[]>> {
  const qs = refresh ? '?refresh=true' : '';
  const j = await request<{ models: Record<string, string[]> }>(`/api/oauth/models${qs}`);
  return j.models;
}

// CLI Models (for CLI provider model selection)
export async function getCliModels(refresh = false): Promise<Record<string, CliModelInfo[]>> {
  const qs = refresh ? '?refresh=true' : '';
  const j = await request<{ models: Record<string, CliModelInfo[]> }>(`/api/cli-models${qs}`);
  return j.models;
}

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
  return request<{ ok: boolean; worktrees: WorktreeEntry[] }>('/api/worktrees');
}

// CLI Usage
export interface CliUsageWindow {
  label: string;           // "5-hour", "7-day", "Primary", "2.5 Pro", etc.
  utilization: number;     // 0.0 – 1.0
  resetsAt: string | null; // ISO 8601
}

export interface CliUsageEntry {
  windows: CliUsageWindow[];
  error: string | null;    // "unauthenticated" | "unavailable" | "not_implemented" | null
}

export async function getCliUsage(): Promise<{ ok: boolean; usage: Record<string, CliUsageEntry> }> {
  return request<{ ok: boolean; usage: Record<string, CliUsageEntry> }>('/api/cli-usage');
}

export async function refreshCliUsage(): Promise<{ ok: boolean; usage: Record<string, CliUsageEntry> }> {
  return post('/api/cli-usage/refresh') as Promise<{ ok: boolean; usage: Record<string, CliUsageEntry> }>;
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
  const j = await request<{ skills: SkillEntry[] }>('/api/skills');
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
    `/api/skills/detail?source=${encodeURIComponent(source)}&skillId=${encodeURIComponent(skillId)}`
  );
  return j.detail;
}

export type SkillLearnProvider = 'claude' | 'codex' | 'gemini' | 'opencode';
export type SkillLearnStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type SkillHistoryProvider = SkillLearnProvider | 'copilot' | 'antigravity' | 'api';

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
  const j = await post('/api/skills/learn', input) as { ok: boolean; job: SkillLearnJob };
  return j.job;
}

export async function getSkillLearningJob(jobId: string): Promise<SkillLearnJob> {
  const j = await request<{ ok: boolean; job: SkillLearnJob }>(
    `/api/skills/learn/${encodeURIComponent(jobId)}`
  );
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

export async function getSkillLearningHistory(input: {
  provider?: SkillHistoryProvider;
  status?: SkillLearnStatus;
  limit?: number;
} = {}): Promise<{ history: SkillLearningHistoryEntry[]; retentionDays: number }> {
  const params = new URLSearchParams();
  if (input.provider) params.set("provider", input.provider);
  if (input.status) params.set("status", input.status);
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  const qs = params.toString();
  const j = await request<{ ok: boolean; history: SkillLearningHistoryEntry[]; retention_days: number }>(
    `/api/skills/history${qs ? `?${qs}` : ""}`
  );
  return { history: j.history ?? [], retentionDays: Number(j.retention_days ?? 0) };
}

export async function getAvailableLearnedSkills(input: {
  provider?: SkillHistoryProvider;
  limit?: number;
} = {}): Promise<LearnedSkillEntry[]> {
  const params = new URLSearchParams();
  if (input.provider) params.set("provider", input.provider);
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  const qs = params.toString();
  const j = await request<{ ok: boolean; skills: LearnedSkillEntry[] }>(
    `/api/skills/available${qs ? `?${qs}` : ""}`
  );
  return j.skills ?? [];
}

export async function unlearnSkill(input: {
  provider: SkillHistoryProvider;
  repo: string;
  skillId?: string;
}): Promise<{
  ok: boolean;
  provider: SkillHistoryProvider;
  repo: string;
  skill_id: string;
  removed: number;
}> {
  return post('/api/skills/unlearn', input) as Promise<{
    ok: boolean;
    provider: SkillHistoryProvider;
    repo: string;
    skill_id: string;
    removed: number;
  }>;
}

// Gateway Channel Messaging
export type GatewayTarget = {
  sessionKey: string;
  displayName: string;
  channel: string;
  to: string;
};

export async function getGatewayTargets(): Promise<GatewayTarget[]> {
  try {
    const data = await request<{ targets?: GatewayTarget[] }>('/api/gateway/targets');
    return data?.targets ?? [];
  } catch {
    return [];
  }
}

export async function sendGatewayMessage(sessionKey: string, text: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/gateway/send', { sessionKey, text }) as Promise<{ ok: boolean; error?: string }>;
}

// SubTasks
export async function getActiveSubtasks(): Promise<SubTask[]> {
  const j = await request<{ subtasks: SubTask[] }>('/api/subtasks?active=1');
  return j.subtasks;
}

export async function createSubtask(taskId: string, input: {
  title: string;
  description?: string;
  assigned_agent_id?: string;
}): Promise<SubTask> {
  return post(`/api/tasks/${taskId}/subtasks`, input) as Promise<SubTask>;
}

export async function updateSubtask(id: string, data: Partial<Pick<SubTask, 'title' | 'description' | 'status' | 'assigned_agent_id' | 'blocked_reason'>>): Promise<SubTask> {
  return patch(`/api/subtasks/${id}`, data) as Promise<SubTask>;
}

// API Providers (direct API key-based LLM access)
export type ApiProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'openrouter' | 'together' | 'groq' | 'cerebras' | 'custom';

export interface ApiProvider {
  id: string;
  name: string;
  type: ApiProviderType;
  base_url: string;
  has_api_key: boolean;
  enabled: boolean;
  models_cache: string[];
  models_cached_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ApiProviderPreset {
  base_url: string;
  models_path: string;
  auth_header: string;
}

export async function getApiProviders(): Promise<ApiProvider[]> {
  const j = await request<{ ok: boolean; providers: ApiProvider[] }>('/api/api-providers');
  return j.providers;
}

export async function createApiProvider(input: {
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_key?: string;
}): Promise<{ ok: boolean; id: string }> {
  return post('/api/api-providers', input) as Promise<{ ok: boolean; id: string }>;
}

export async function updateApiProvider(id: string, patch_data: {
  name?: string;
  type?: ApiProviderType;
  base_url?: string;
  api_key?: string;
  enabled?: boolean;
}): Promise<{ ok: boolean }> {
  return put(`/api/api-providers/${id}`, patch_data) as Promise<{ ok: boolean }>;
}

export async function deleteApiProvider(id: string): Promise<{ ok: boolean }> {
  return del(`/api/api-providers/${id}`) as Promise<{ ok: boolean }>;
}

export async function testApiProvider(id: string): Promise<{ ok: boolean; model_count?: number; models?: string[]; error?: string; status?: number }> {
  return post(`/api/api-providers/${id}/test`) as Promise<{ ok: boolean; model_count?: number; models?: string[]; error?: string; status?: number }>;
}

export async function getApiProviderModels(id: string, refresh = false): Promise<{ ok: boolean; models: string[]; cached?: boolean; stale?: boolean }> {
  const qs = refresh ? '?refresh=true' : '';
  return request<{ ok: boolean; models: string[]; cached?: boolean; stale?: boolean }>(`/api/api-providers/${id}/models${qs}`);
}

export async function getApiProviderPresets(): Promise<Record<string, ApiProviderPreset>> {
  const j = await request<{ ok: boolean; presets: Record<string, ApiProviderPreset> }>('/api/api-providers/presets');
  return j.presets;
}

// ── Task Reports ─────────────────────────────────────────────────────────────
export interface TaskReportSummary {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  assigned_agent_id: string | null;
  status: string;
  project_id?: string | null;
  project_path: string | null;
  source_task_id?: string | null;
  created_at: number;
  completed_at: number | null;
  agent_name: string;
  agent_name_ko: string;
  agent_role: string;
  dept_name: string;
  dept_name_ko: string;
  project_name?: string;
}

export interface TaskReportDocument {
  id: string;
  title: string;
  source: 'task_result' | 'report_message' | 'file' | string;
  path: string | null;
  mime: string | null;
  size_bytes: number | null;
  updated_at: number | null;
  truncated: boolean;
  text_preview: string;
  content: string;
}

export interface TaskReportTeamSection {
  id: string;
  task_id: string;
  source_task_id: string | null;
  title: string;
  status: string;
  department_id: string | null;
  department_name: string;
  department_name_ko: string;
  agent_id: string | null;
  agent_name: string;
  agent_name_ko: string;
  agent_role: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  summary: string;
  logs: Array<{ kind: string; message: string; created_at: number }>;
  meeting_minutes: Array<{
    meeting_type: string;
    round_number: number;
    entries: string;
    created_at: number;
  }>;
  documents: TaskReportDocument[];
  linked_subtasks: Array<{
    id: string;
    title: string;
    status: string;
    assigned_agent_id: string | null;
    target_department_id: string | null;
    delegated_task_id: string | null;
    completed_at: number | null;
    agent_name: string;
    agent_name_ko: string;
    target_dept_name: string;
    target_dept_name_ko: string;
  }>;
}

export interface TaskReportDetail {
  ok?: boolean;
  requested_task_id?: string;
  project?: {
    root_task_id: string;
    project_id?: string | null;
    project_name: string;
    project_path: string | null;
    core_goal?: string | null;
  };
  task: TaskReportSummary;
  logs: Array<{ kind: string; message: string; created_at: number }>;
  subtasks: Array<{
    id: string;
    title: string;
    status: string;
    assigned_agent_id: string | null;
    target_department_id?: string | null;
    delegated_task_id?: string | null;
    completed_at: number | null;
    agent_name: string;
    agent_name_ko: string;
    target_dept_name?: string;
    target_dept_name_ko?: string;
  }>;
  meeting_minutes: Array<{
    meeting_type: string;
    round_number: number;
    entries: string;
    created_at: number;
  }>;
  planning_summary?: {
    title: string;
    content: string;
    source_task_id: string;
    source_agent_name: string;
    source_department_name: string;
    generated_at: number;
    documents: TaskReportDocument[];
  };
  team_reports?: TaskReportTeamSection[];
}

// ── Active Agents ────────────────────────────────────────────────────────────
export interface ActiveAgentInfo {
  id: string;
  name: string;
  name_ko: string;
  avatar_emoji: string;
  role: string;
  status: string;
  current_task_id: string | null;
  department_id: string | null;
  cli_provider: string;
  dept_name: string;
  dept_name_ko: string;
  task_id: string | null;
  task_title: string | null;
  task_status: string | null;
  task_started_at: number | null;
  has_active_process: boolean;
  session_opened_at: number | null;
  last_activity_at: number | null;
  idle_seconds: number | null;
}

export async function getActiveAgents(): Promise<ActiveAgentInfo[]> {
  const j = await request<{ ok: boolean; agents: ActiveAgentInfo[] }>('/api/agents/active');
  return j.agents;
}

export interface CliProcessInfo {
  pid: number;
  ppid: number | null;
  provider: 'claude' | 'codex' | 'gemini' | 'opencode' | 'node' | 'python';
  executable: string;
  command: string;
  is_tracked: boolean;
  is_idle: boolean;
  idle_reason: string | null;
  task_id: string | null;
  task_title: string | null;
  task_status: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_name_ko: string | null;
  agent_status: string | null;
  session_opened_at: number | null;
  last_activity_at: number | null;
  idle_seconds: number | null;
}

export async function getCliProcesses(): Promise<CliProcessInfo[]> {
  const j = await request<{ ok: boolean; processes: CliProcessInfo[] }>('/api/agents/cli-processes');
  return j.processes ?? [];
}

export async function killCliProcess(pid: number): Promise<{ ok: boolean; pid: number; tracked_task_id: string | null }> {
  return del(`/api/agents/cli-processes/${encodeURIComponent(String(pid))}`) as Promise<{
    ok: boolean;
    pid: number;
    tracked_task_id: string | null;
  }>;
}

export async function getTaskReports(): Promise<TaskReportSummary[]> {
  const j = await request<{ ok: boolean; reports: TaskReportSummary[] }>('/api/task-reports');
  return j.reports;
}

export async function getTaskReportDetail(taskId: string): Promise<TaskReportDetail> {
  return request<TaskReportDetail>(`/api/task-reports/${taskId}`);
}

export async function archiveTaskReport(taskId: string): Promise<{
  ok: boolean;
  root_task_id: string;
  generated_by_agent_id: string | null;
  updated_at: number;
}> {
  return request(`/api/task-reports/${taskId}/archive`, { method: 'POST' });
}
