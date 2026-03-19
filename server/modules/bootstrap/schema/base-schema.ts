import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec">;

export function applyBaseSchema(db: DbLike): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  name_ja TEXT NOT NULL DEFAULT '',
  name_zh TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  sort_order INTEGER NOT NULL DEFAULT 99,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS office_pack_departments (
  workflow_pack_key TEXT NOT NULL,
  department_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  name_ja TEXT NOT NULL DEFAULT '',
  name_zh TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  sort_order INTEGER NOT NULL DEFAULT 99,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  PRIMARY KEY (workflow_pack_key, department_id)
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ko TEXT NOT NULL DEFAULT '',
  name_ja TEXT NOT NULL DEFAULT '',
  name_zh TEXT NOT NULL DEFAULT '',
  department_id TEXT REFERENCES departments(id),
  workflow_pack_key TEXT NOT NULL DEFAULT 'development',
  role TEXT NOT NULL CHECK(role IN ('team_leader','senior','junior','intern')),
  acts_as_planning_leader INTEGER NOT NULL DEFAULT 0 CHECK(acts_as_planning_leader IN (0,1)),
  cli_provider TEXT CHECK(cli_provider IN ('claude','codex','gemini','opencode','kimi','copilot','antigravity','api')),
  oauth_account_id TEXT,
  api_provider_id TEXT,
  api_model TEXT,
  cli_model TEXT,
  cli_reasoning_level TEXT,
  avatar_emoji TEXT NOT NULL DEFAULT '🤖',
  sprite_number INTEGER,
  personality TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','working','break','offline')),
  current_task_id TEXT,
  stats_tasks_done INTEGER DEFAULT 0,
  stats_xp INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  core_goal TEXT NOT NULL,
  default_pack_key TEXT NOT NULL DEFAULT 'development',
  last_used_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS workflow_packs (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  input_schema_json TEXT NOT NULL,
  prompt_preset_json TEXT NOT NULL,
  qa_rules_json TEXT NOT NULL,
  output_template_json TEXT NOT NULL,
  routing_keywords_json TEXT NOT NULL,
  cost_profile_json TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department_id TEXT REFERENCES departments(id),
  assigned_agent_id TEXT REFERENCES agents(id),
  project_id TEXT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'inbox' CHECK(status IN ('inbox','planned','collaborating','in_progress','review','done','cancelled','pending')),
  priority INTEGER DEFAULT 0,
  task_type TEXT DEFAULT 'general' CHECK(task_type IN ('general','development','design','analysis','presentation','documentation')),
  workflow_pack_key TEXT NOT NULL DEFAULT 'development',
  workflow_meta_json TEXT,
  output_format TEXT,
  project_path TEXT,
  result TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS task_creation_audits (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_title TEXT,
  task_status TEXT,
  department_id TEXT,
  assigned_agent_id TEXT,
  source_task_id TEXT,
  task_type TEXT,
  project_path TEXT,
  trigger TEXT NOT NULL,
  trigger_detail TEXT,
  actor_type TEXT,
  actor_id TEXT,
  actor_name TEXT,
  request_id TEXT,
  request_ip TEXT,
  user_agent TEXT,
  payload_hash TEXT,
  payload_preview TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('ceo','agent','system')),
  sender_id TEXT,
  receiver_type TEXT NOT NULL CHECK(receiver_type IN ('agent','department','all')),
  receiver_id TEXT,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat' CHECK(message_type IN ('chat','task_assign','announcement','directive','report','status_update')),
  task_id TEXT REFERENCES tasks(id),
  idempotency_key TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS task_interrupt_injections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  actor_token_hash TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS meeting_minutes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  meeting_type TEXT NOT NULL CHECK(meeting_type IN ('planned','review')),
  round INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','revision_requested','failed')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS meeting_minute_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL REFERENCES meeting_minutes(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  speaker_agent_id TEXT REFERENCES agents(id),
  speaker_name TEXT NOT NULL,
  department_name TEXT,
  role_label TEXT,
  message_type TEXT NOT NULL DEFAULT 'chat',
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS review_revision_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  normalized_note TEXT NOT NULL,
  raw_note TEXT NOT NULL,
  first_round INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  UNIQUE(task_id, normalized_note)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_credentials (
  provider TEXT PRIMARY KEY,
  source TEXT,
  encrypted_data TEXT NOT NULL,
  email TEXT,
  scope TEXT,
  expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('github','google_antigravity')),
  source TEXT,
  label TEXT,
  email TEXT,
  scope TEXT,
  expires_at INTEGER,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  priority INTEGER NOT NULL DEFAULT 100,
  model_override TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at INTEGER,
  last_success_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS oauth_active_accounts (
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES oauth_accounts(id) ON DELETE CASCADE,
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  PRIMARY KEY (provider, account_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  verifier_enc TEXT NOT NULL,
  redirect_to TEXT
);

CREATE TABLE IF NOT EXISTS cli_usage_cache (
  provider TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','in_progress','done','blocked')),
  assigned_agent_id TEXT REFERENCES agents(id),
  blocked_reason TEXT,
  cli_tool_use_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS task_report_archives (
  id TEXT PRIMARY KEY,
  root_task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  generated_by_agent_id TEXT REFERENCES agents(id),
  summary_markdown TEXT NOT NULL,
  source_snapshot_json TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS project_review_decision_states (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting'
    CHECK(status IN ('collecting','ready','failed')),
  planner_summary TEXT,
  planner_agent_id TEXT REFERENCES agents(id),
  planner_agent_name TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS project_review_decision_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_hash TEXT,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('planning_summary','representative_pick','followup_request','start_review_meeting')),
  summary TEXT NOT NULL,
  selected_options_json TEXT,
  note TEXT,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  meeting_id TEXT REFERENCES meeting_minutes(id) ON DELETE SET NULL,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS review_round_decision_states (
  meeting_id TEXT PRIMARY KEY REFERENCES meeting_minutes(id) ON DELETE CASCADE,
  snapshot_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting'
    CHECK(status IN ('collecting','ready','failed')),
  planner_summary TEXT,
  planner_agent_id TEXT REFERENCES agents(id),
  planner_agent_name TEXT,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS skill_learning_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex','gemini','opencode','kimi','copilot','antigravity','api')),
  repo TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
  command TEXT NOT NULL,
  error TEXT,
  run_started_at INTEGER,
  run_completed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  UNIQUE(job_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_report_archives_root ON task_report_archives(root_task_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_review_decision_states_updated
  ON project_review_decision_states(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_review_decision_events_project
  ON project_review_decision_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_round_decision_states_updated
  ON review_round_decision_states(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_dept ON tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_recent ON projects(last_used_at DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_creation_audits_task ON task_creation_audits(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_creation_audits_trigger ON task_creation_audits(trigger, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_interrupt_injections_task
  ON task_interrupt_injections(task_id, session_id, consumed_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_type, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_task ON meeting_minutes(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_minute_entries_meeting ON meeting_minute_entries(meeting_id, seq ASC);
CREATE INDEX IF NOT EXISTS idx_review_revision_history_task ON review_revision_history(task_id, first_round DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider, status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_active_accounts_provider ON oauth_active_accounts(provider, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_learning_history_provider_status_updated
  ON skill_learning_history(provider, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_learning_history_skill_lookup
  ON skill_learning_history(provider, repo, skill_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS api_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai' CHECK(type IN ('openai','anthropic','google','ollama','openrouter','together','groq','cerebras','novita','custom')),
  base_url TEXT NOT NULL,
  api_key_enc TEXT,
  preset_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  models_cache TEXT,
  models_cached_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);
`);
}
