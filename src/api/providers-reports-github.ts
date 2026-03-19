import { del, post, put, request } from "./core";

// API Providers (direct API key-based LLM access)
export type ApiProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "openrouter"
  | "together"
  | "groq"
  | "cerebras"
  | "novita"
  | "custom";

export interface ApiProvider {
  id: string;
  name: string;
  type: ApiProviderType;
  base_url: string;
  preset_key: string | null;
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

export interface ApiProviderOfficialPreset {
  label: string;
  description: string;
  type: Extract<ApiProviderType, "openai" | "anthropic">;
  base_url: string;
  docs_url: string;
  api_key_hint: string;
  api_key_placeholder: string;
  fallback_models: string[];
  required_api_key_prefix?: string;
}

export async function getApiProviders(): Promise<ApiProvider[]> {
  const j = await request<{ ok: boolean; providers: ApiProvider[] }>("/api/api-providers");
  return j.providers;
}

export async function createApiProvider(input: {
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_key?: string;
  preset_key?: string | null;
}): Promise<{ ok: boolean; id: string }> {
  return post("/api/api-providers", input) as Promise<{ ok: boolean; id: string }>;
}

export async function updateApiProvider(
  id: string,
  patch_data: {
    name?: string;
    type?: ApiProviderType;
    base_url?: string;
    api_key?: string;
    enabled?: boolean;
    preset_key?: string | null;
  },
): Promise<{ ok: boolean }> {
  return put(`/api/api-providers/${id}`, patch_data) as Promise<{ ok: boolean }>;
}

export async function deleteApiProvider(id: string): Promise<{ ok: boolean }> {
  return del(`/api/api-providers/${id}`) as Promise<{ ok: boolean }>;
}

export async function testApiProvider(
  id: string,
): Promise<{ ok: boolean; model_count?: number; models?: string[]; error?: string; status?: number }> {
  return post(`/api/api-providers/${id}/test`) as Promise<{
    ok: boolean;
    model_count?: number;
    models?: string[];
    error?: string;
    status?: number;
  }>;
}

export async function getApiProviderModels(
  id: string,
  refresh = false,
): Promise<{ ok: boolean; models: string[]; cached?: boolean; stale?: boolean }> {
  const qs = refresh ? "?refresh=true" : "";
  return request<{ ok: boolean; models: string[]; cached?: boolean; stale?: boolean }>(
    `/api/api-providers/${id}/models${qs}`,
  );
}

export async function getApiProviderPresets(): Promise<{
  presets: Record<ApiProviderType, ApiProviderPreset>;
  official_presets: Record<string, ApiProviderOfficialPreset>;
}> {
  const j = await request<{
    ok: boolean;
    presets: Record<ApiProviderType, ApiProviderPreset>;
    official_presets: Record<string, ApiProviderOfficialPreset>;
  }>("/api/api-providers/presets");
  return {
    presets: j.presets,
    official_presets: j.official_presets ?? {},
  };
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
  source: "task_result" | "report_message" | "file" | string;
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
  const j = await request<{ ok: boolean; agents: ActiveAgentInfo[] }>("/api/agents/active");
  return j.agents;
}

export interface CliProcessInfo {
  pid: number;
  ppid: number | null;
  provider: "claude" | "codex" | "gemini" | "opencode" | "kimi" | "node" | "python";
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
  const j = await request<{ ok: boolean; processes: CliProcessInfo[] }>("/api/agents/cli-processes");
  return j.processes ?? [];
}

export async function killCliProcess(
  pid: number,
): Promise<{ ok: boolean; pid: number; tracked_task_id: string | null }> {
  return del(`/api/agents/cli-processes/${encodeURIComponent(String(pid))}`) as Promise<{
    ok: boolean;
    pid: number;
    tracked_task_id: string | null;
  }>;
}

export async function getTaskReports(): Promise<TaskReportSummary[]> {
  const j = await request<{ ok: boolean; reports: TaskReportSummary[] }>("/api/task-reports");
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
  return request(`/api/task-reports/${taskId}/archive`, { method: "POST" });
}

// ---------- GitHub Import ----------

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  html_url: string;
  clone_url: string;
}

export interface GitHubBranch {
  name: string;
  sha: string;
  is_default: boolean;
}

export interface GitHubStatus {
  connected: boolean;
  has_repo_scope: boolean;
  email?: string | null;
  account_id?: string;
}

export interface CloneStatus {
  clone_id: string;
  status: string;
  progress: number;
  error?: string;
  targetPath: string;
  repoFullName: string;
}

export async function getGitHubStatus(): Promise<GitHubStatus> {
  return request<GitHubStatus>("/api/github/status");
}

export async function getGitHubRepos(params?: {
  q?: string;
  page?: number;
  per_page?: number;
}): Promise<{ repos: GitHubRepo[] }> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const q = qs.toString();
  return request<{ repos: GitHubRepo[] }>(`/api/github/repos${q ? "?" + q : ""}`);
}

export async function getGitHubBranches(
  owner: string,
  repo: string,
  pat?: string,
): Promise<{ remote_branches: GitHubBranch[]; default_branch: string | null }> {
  const extra: RequestInit = {};
  if (pat) extra.headers = { "X-GitHub-PAT": pat };
  return request<{ remote_branches: GitHubBranch[]; default_branch: string | null }>(
    `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    extra,
  );
}

export async function cloneGitHubRepo(input: {
  owner: string;
  repo: string;
  branch?: string;
  target_path?: string;
  pat?: string;
}): Promise<{ clone_id: string | null; already_exists?: boolean; target_path: string }> {
  const { pat, ...body } = input;
  return request<{ clone_id: string | null; already_exists?: boolean; target_path: string }>("/api/github/clone", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(pat ? { "X-GitHub-PAT": pat } : {}) },
  });
}

export async function getCloneStatus(cloneId: string): Promise<CloneStatus> {
  return request<CloneStatus>(`/api/github/clone/${cloneId}`);
}

export async function getProjectBranches(
  projectId: string,
): Promise<{ branches: string[]; current_branch: string | null }> {
  return request<{ branches: string[]; current_branch: string | null }>(`/api/projects/${projectId}/branches`);
}
