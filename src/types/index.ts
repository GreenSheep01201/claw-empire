import type { UiLanguage } from "../i18n";

export type { UiLanguage };

// Department
export interface Department {
  id: string;
  name: string;
  name_ko: string;
  name_ja?: string | null;
  name_zh?: string | null;
  icon: string;
  color: string;
  description: string | null;
  prompt: string | null;
  sort_order: number;
  created_at: number;
  agent_count?: number;
}

// Agent roles
export type AgentRole = "team_leader" | "senior" | "junior" | "intern";
export type AgentStatus = "idle" | "working" | "break" | "offline";
export type CliProvider = "claude" | "codex" | "gemini" | "opencode" | "copilot" | "antigravity" | "cursor" | "api";
export type MeetingReviewDecision = "reviewing" | "approved" | "hold";

export interface Agent {
  id: string;
  name: string;
  name_ko: string;
  name_ja?: string | null;
  name_zh?: string | null;
  department_id: string | null;
  department?: Department;
  role: AgentRole;
  cli_provider: CliProvider;
  oauth_account_id?: string | null;
  api_provider_id?: string | null;
  api_model?: string | null;
  cli_model?: string | null;
  cli_reasoning_level?: string | null;
  avatar_emoji: string;
  sprite_number?: number | null;
  personality: string | null;
  status: AgentStatus;
  current_task_id: string | null;
  stats_tasks_done: number;
  stats_xp: number;
  created_at: number;
}

export interface MeetingPresence {
  agent_id: string;
  seat_index: number;
  phase: "kickoff" | "review";
  task_id: string | null;
  decision?: MeetingReviewDecision | null;
  until: number;
}

export interface SubAgent {
  id: string;
  parentAgentId: string;
  task: string;
  status: "working" | "done";
}

export interface CrossDeptDelivery {
  id: string;
  fromAgentId: string;
  toAgentId: string;
}

export interface CeoOfficeCall {
  id: string;
  fromAgentId: string;
  seatIndex: number;
  phase: "kickoff" | "review";
  action?: "arrive" | "speak" | "dismiss";
  line?: string;
  decision?: MeetingReviewDecision;
  taskId?: string;
  instant?: boolean;
  holdUntil?: number;
}

// Task
export type TaskStatus =
  | "inbox"
  | "planned"
  | "collaborating"
  | "in_progress"
  | "review"
  | "done"
  | "pending"
  | "cancelled";
export type TaskType = "general" | "development" | "design" | "analysis" | "presentation" | "documentation";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  assigned_agent_id: string | null;
  assigned_agent?: Agent;
  project_id?: string | null;
  status: TaskStatus;
  priority: number;
  task_type: TaskType;
  project_path: string | null;
  result: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
  source_task_id?: string | null;
  subtask_total?: number;
  subtask_done?: number;
  hidden?: number;
}

export type AssignmentMode = "auto" | "manual";

export interface Project {
  id: string;
  name: string;
  project_path: string;
  core_goal: string;
  assignment_mode: AssignmentMode;
  assigned_agent_ids?: string[];
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
  github_repo?: string | null;
}

export interface TaskLog {
  id: number;
  task_id: string;
  kind: string;
  message: string;
  created_at: number;
}

export interface MeetingMinuteEntry {
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

export interface MeetingMinute {
  id: string;
  task_id: string;
  meeting_type: "planned" | "review";
  round: number;
  title: string;
  status: "in_progress" | "completed" | "revision_requested" | "failed";
  started_at: number;
  completed_at: number | null;
  created_at: number;
  entries: MeetingMinuteEntry[];
}

// Messages
export type SenderType = "ceo" | "agent" | "system";
export type ReceiverType = "agent" | "department" | "all";
export type MessageType = "chat" | "task_assign" | "announcement" | "directive" | "report" | "status_update";

export interface Message {
  id: string;
  sender_type: SenderType;
  sender_id: string | null;
  sender_agent?: Agent;
  receiver_type: ReceiverType;
  receiver_id: string | null;
  content: string;
  message_type: MessageType;
  task_id: string | null;
  created_at: number;
}

// CLI Status
export interface CliToolStatus {
  installed: boolean;
  version: string | null;
  authenticated: boolean;
  authHint: string;
  accountEmail?: string | null;
}

export type CliStatusMap = Record<CliProvider, CliToolStatus>;

// Company Stats (matches server GET /api/stats response)
export interface CompanyStats {
  tasks: {
    total: number;
    done: number;
    in_progress: number;
    inbox: number;
    planned: number;
    collaborating: number;
    review: number;
    cancelled: number;
    completion_rate: number;
  };
  agents: {
    total: number;
    working: number;
    idle: number;
  };
  top_agents: Array<{
    id: string;
    name: string;
    avatar_emoji: string;
    stats_tasks_done: number;
    stats_xp: number;
  }>;
  tasks_by_department: Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
    total_tasks: number;
    done_tasks: number;
  }>;
  recent_activity: Array<Record<string, unknown>>;
}

// SubTask
export type SubTaskStatus = "pending" | "in_progress" | "done" | "blocked";

export interface SubTask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  status: SubTaskStatus;
  assigned_agent_id: string | null;
  blocked_reason: string | null;
  cli_tool_use_id: string | null;
  target_department_id?: string | null;
  delegated_task_id?: string | null;
  created_at: number;
  completed_at: number | null;
}

// WebSocket Events
export type WSEventType =
  | "task_update"
  | "agent_status"
  | "agent_created"
  | "agent_deleted"
  | "departments_changed"
  | "new_message"
  | "announcement"
  | "cli_output"
  | "cli_usage_update"
  | "subtask_update"
  | "cross_dept_delivery"
  | "ceo_office_call"
  | "chat_stream"
  | "task_report"
  | "connected";

export interface WSEvent {
  type: WSEventType;
  payload: unknown;
}

// CLI Model info (rich model data from providers like Codex)
export interface ReasoningLevelOption {
  effort: string; // "low" | "medium" | "high" | "xhigh"
  description: string;
}

export interface CliModelInfo {
  slug: string;
  displayName?: string;
  description?: string;
  reasoningLevels?: ReasoningLevelOption[];
  defaultReasoningLevel?: string;
}

export type CliModelsResponse = Record<string, CliModelInfo[]>;

// Settings
export interface ProviderModelConfig {
  model: string;
  subModel?: string; // 서브 에이전트(알바생) 모델 (claude, codex만 해당)
  reasoningLevel?: string; // Codex: "low"|"medium"|"high"|"xhigh"
  subModelReasoningLevel?: string; // 알바생 추론 레벨 (codex만 해당)
}

export interface RoomTheme {
  floor1: number;
  floor2: number;
  wall: number;
  accent: number;
}

export const MESSENGER_CHANNELS = [
  "telegram",
  "whatsapp",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;

export type MessengerChannelType = (typeof MESSENGER_CHANNELS)[number];

export interface MessengerSessionConfig {
  id: string;
  name: string;
  targetId: string;
  enabled: boolean;
  agentId?: string;
}

export interface MessengerChannelConfig {
  token: string;
  sessions: MessengerSessionConfig[];
  receiveEnabled?: boolean;
}

export type MessengerChannelsConfig = Record<MessengerChannelType, MessengerChannelConfig>;

export interface CompanySettings {
  companyName: string;
  ceoName: string;
  autoAssign: boolean;
  autoUpdateEnabled: boolean;
  autoUpdateNoticePending?: boolean;
  oauthAutoSwap?: boolean;
  theme: "dark" | "light";
  language: UiLanguage;
  defaultProvider: CliProvider;
  providerModelConfig?: Record<string, ProviderModelConfig>;
  roomThemes?: Record<string, RoomTheme>;
  messengerChannels?: MessengerChannelsConfig;
}

export const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "Claw-Empire",
  ceoName: "CEO",
  autoAssign: true,
  autoUpdateEnabled: false,
  autoUpdateNoticePending: false,
  oauthAutoSwap: true,
  theme: "dark",
  language: "en",
  defaultProvider: "claude",
  providerModelConfig: {
    claude: { model: "claude-opus-4-6", subModel: "claude-sonnet-4-6" },
    codex: {
      model: "gpt-5.3-codex",
      reasoningLevel: "xhigh",
      subModel: "gpt-5.3-codex",
      subModelReasoningLevel: "high",
    },
    gemini: { model: "gemini-3-pro-preview" },
    opencode: { model: "github-copilot/claude-sonnet-4.6" },
    copilot: { model: "github-copilot/claude-sonnet-4.6" },
    antigravity: { model: "google/antigravity-gemini-3-pro" },
  },
  messengerChannels: {
    telegram: { token: "", sessions: [], receiveEnabled: true },
    whatsapp: { token: "", sessions: [], receiveEnabled: false },
    discord: { token: "", sessions: [], receiveEnabled: false },
    googlechat: { token: "", sessions: [], receiveEnabled: false },
    slack: { token: "", sessions: [], receiveEnabled: false },
    signal: { token: "", sessions: [], receiveEnabled: false },
    imessage: { token: "", sessions: [], receiveEnabled: false },
  },
};
