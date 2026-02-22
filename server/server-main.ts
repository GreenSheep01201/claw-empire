import express from "express";
import path from "path";
import fs from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { BaseRuntimeContext, RuntimeContext } from "./types/runtime-context.ts";

import {
  DIST_DIR,
  IS_PRODUCTION,
} from "./config/runtime.ts";
import {
  IN_PROGRESS_ORPHAN_GRACE_MS,
  IN_PROGRESS_ORPHAN_SWEEP_MS,
  SQLITE_BUSY_RETRY_BASE_DELAY_MS,
  SQLITE_BUSY_RETRY_JITTER_MS,
  SQLITE_BUSY_RETRY_MAX_ATTEMPTS,
  SQLITE_BUSY_RETRY_MAX_DELAY_MS,
  SUBTASK_DELEGATION_SWEEP_MS,
  initializeDatabaseRuntime,
} from "./db/runtime.ts";
import {
  installSecurityMiddleware,
  isIncomingMessageAuthenticated,
  isIncomingMessageOriginTrusted,
} from "./security/auth.ts";
import {
  assertRuntimeFunctionsResolved,
  createDeferredRuntimeProxy,
} from "./modules/deferred-runtime.ts";
import { ROUTE_RUNTIME_HELPER_KEYS } from "./modules/runtime-helper-keys.ts";
import { startLifecycle } from "./modules/lifecycle.ts";
import { registerApiRoutes } from "./modules/routes.ts";
import { initializeWorkflow } from "./modules/workflow.ts";

const app = express();
installSecurityMiddleware(app);

const { dbPath, db, logsDir } = initializeDatabaseRuntime();
const distDir = DIST_DIR;
const isProduction = IS_PRODUCTION;

function runInTransaction(fn: () => void): void {
  if (db.isTransaction) {
    fn();
    return;
  }
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function nowMs(): number {
  return Date.now();
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string");
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

const securityAuditLogPath = path.join(logsDir, "security-audit.ndjson");
const securityAuditFallbackLogPath = path.join(logsDir, "security-audit-fallback.ndjson");
const SECURITY_AUDIT_CHAIN_SEED =
  process.env.SECURITY_AUDIT_CHAIN_SEED?.trim() || "claw-empire-security-audit-v1";
const SECURITY_AUDIT_CHAIN_KEY = process.env.SECURITY_AUDIT_CHAIN_KEY ?? "";

type MessageIngressAuditOutcome =
  | "accepted"
  | "duplicate"
  | "idempotency_conflict"
  | "storage_busy"
  | "validation_error";

type AuditRequestLike = {
  get(name: string): string | undefined;
  ip?: string;
  socket?: { remoteAddress?: string };
};

type MessageIngressAuditInput = {
  endpoint: "/api/messages" | "/api/announcements" | "/api/directives" | "/api/inbox";
  req: AuditRequestLike;
  body: Record<string, unknown>;
  idempotencyKey: string | null;
  outcome: MessageIngressAuditOutcome;
  statusCode: number;
  messageId?: string | null;
  detail?: string | null;
};

export type TaskCreationAuditInput = {
  taskId: string;
  taskTitle: string;
  taskStatus?: string | null;
  departmentId?: string | null;
  assignedAgentId?: string | null;
  sourceTaskId?: string | null;
  taskType?: string | null;
  projectPath?: string | null;
  trigger: string;
  triggerDetail?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  req?: AuditRequestLike | null;
  body?: Record<string, unknown> | null;
};

type MessageIngressAuditEntry = {
  id: string;
  created_at: number;
  endpoint: string;
  method: "POST";
  status_code: number;
  outcome: MessageIngressAuditOutcome;
  idempotency_key: string | null;
  request_id: string | null;
  message_id: string | null;
  payload_hash: string;
  request_ip: string | null;
  user_agent: string | null;
  detail: string | null;
  prev_hash: string;
  chain_hash: string;
};

class SecurityAuditLogWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityAuditLogWriteError";
  }
}

function canonicalizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeAuditValue(item));
  }
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      out[key] = canonicalizeAuditValue(src[key]);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.length > 8_000) {
    return `${value.slice(0, 8_000)}...[truncated:${value.length}]`;
  }
  return value;
}

function stableAuditJson(value: unknown): string {
  try {
    return JSON.stringify(canonicalizeAuditValue(value));
  } catch {
    return JSON.stringify(String(value));
  }
}

function normalizeAuditText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...[truncated:${trimmed.length}]`;
}

function resolveAuditRequestId(
  req: { get(name: string): string | undefined },
  body: Record<string, unknown>,
): string | null {
  const candidates: unknown[] = [
    body.request_id,
    body.requestId,
    req.get("x-request-id"),
    req.get("x-correlation-id"),
    req.get("traceparent"),
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed.length <= 200 ? trimmed : trimmed.slice(0, 200);
  }
  return null;
}

function resolveAuditRequestIp(req: AuditRequestLike): string | null {
  const forwarded = req.get("x-forwarded-for");
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  if (typeof req.ip === "string" && req.ip.trim()) {
    return req.ip.trim().slice(0, 128);
  }
  if (typeof req.socket?.remoteAddress === "string" && req.socket.remoteAddress.trim()) {
    return req.socket.remoteAddress.trim().slice(0, 128);
  }
  return null;
}

function computeAuditChainHash(
  prevHash: string,
  entry: Omit<MessageIngressAuditEntry, "prev_hash" | "chain_hash">,
): string {
  const hasher = createHash("sha256");
  hasher.update(SECURITY_AUDIT_CHAIN_SEED, "utf8");
  hasher.update("|", "utf8");
  hasher.update(prevHash, "utf8");
  hasher.update("|", "utf8");
  if (SECURITY_AUDIT_CHAIN_KEY) {
    hasher.update(SECURITY_AUDIT_CHAIN_KEY, "utf8");
    hasher.update("|", "utf8");
  }
  hasher.update(stableAuditJson(entry), "utf8");
  return hasher.digest("hex");
}

function loadSecurityAuditPrevHash(): string {
  try {
    if (!fs.existsSync(securityAuditLogPath)) return "GENESIS";
    const raw = fs.readFileSync(securityAuditLogPath, "utf8").trim();
    if (!raw) return "GENESIS";
    const lines = raw.split(/\r?\n/);
    for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
      const line = lines[idx]?.trim();
      if (!line) continue;
      const parsed = JSON.parse(line) as { chain_hash?: unknown };
      if (typeof parsed.chain_hash === "string" && parsed.chain_hash.trim()) {
        return parsed.chain_hash.trim();
      }
    }
  } catch (err) {
    console.warn(`[Claw-Empire] security audit chain bootstrap failed: ${String(err)}`);
  }
  return "GENESIS";
}

let securityAuditPrevHash = loadSecurityAuditPrevHash();

function appendSecurityAuditFallbackLog(payload: unknown): boolean {
  const line = `${stableAuditJson(payload)}\n`;
  try {
    fs.appendFileSync(securityAuditFallbackLogPath, line, { encoding: "utf8", mode: 0o600 });
    return true;
  } catch (fallbackErr) {
    try {
      process.stderr.write(`[Claw-Empire] security audit fallback append failed: ${String(fallbackErr)}\n${line}`);
      // Fail closed when neither primary nor fallback file append succeeds.
      return false;
    } catch {
      return false;
    }
  }
}

function appendSecurityAuditLog(entry: Omit<MessageIngressAuditEntry, "prev_hash" | "chain_hash">): void {
  const prevHash = securityAuditPrevHash;
  const chainHash = computeAuditChainHash(prevHash, entry);
  const line = JSON.stringify({ ...entry, prev_hash: prevHash, chain_hash: chainHash });
  try {
    fs.appendFileSync(securityAuditLogPath, `${line}\n`, { encoding: "utf8", mode: 0o600 });
    securityAuditPrevHash = chainHash;
  } catch (err) {
    const fallbackOk = appendSecurityAuditFallbackLog({
      ...entry,
      prev_hash: prevHash,
      chain_hash: chainHash,
      fallback_reason: String(err),
      fallback_created_at: nowMs(),
    });
    const fallbackStatus = fallbackOk ? "fallback_saved" : "fallback_failed";
    throw new SecurityAuditLogWriteError(
      `security audit append failed (${fallbackStatus}): ${String(err)}`,
    );
  }
}

function recordMessageIngressAudit(input: MessageIngressAuditInput): void {
  const payloadHash = createHash("sha256")
    .update(stableAuditJson(input.body), "utf8")
    .digest("hex");
  const entry: Omit<MessageIngressAuditEntry, "prev_hash" | "chain_hash"> = {
    id: randomUUID(),
    created_at: nowMs(),
    endpoint: input.endpoint,
    method: "POST",
    status_code: input.statusCode,
    outcome: input.outcome,
    idempotency_key: input.idempotencyKey,
    request_id: resolveAuditRequestId(input.req, input.body),
    message_id: input.messageId ?? null,
    payload_hash: payloadHash,
    request_ip: resolveAuditRequestIp(input.req),
    user_agent: normalizeAuditText(input.req.get("user-agent"), 200),
    detail: normalizeAuditText(input.detail),
  };
  appendSecurityAuditLog(entry);
}

function recordMessageIngressAuditOr503(
  res: { status(code: number): { json(payload: unknown): unknown } },
  input: MessageIngressAuditInput,
): boolean {
  try {
    recordMessageIngressAudit(input);
    return true;
  } catch (err) {
    console.error(`[Claw-Empire] security audit unavailable: ${String(err)}`);
    res.status(503).json({ error: "audit_log_unavailable", retryable: true });
    return false;
  }
}

async function rollbackMessageInsertAfterAuditFailure(messageId: string): Promise<void> {
  await withSqliteBusyRetry("messages.audit_rollback", () => {
    db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
  });
}

async function recordAcceptedIngressAuditOrRollback(
  res: { status(code: number): { json(payload: unknown): unknown } },
  input: Omit<MessageIngressAuditInput, "messageId">,
  messageId: string,
): Promise<boolean> {
  if (recordMessageIngressAuditOr503(res, { ...input, messageId })) return true;
  try {
    await rollbackMessageInsertAfterAuditFailure(messageId);
  } catch (rollbackErr) {
    console.error(
      `[Claw-Empire] rollback after audit failure failed: message_id=${messageId}, `
      + `${String(rollbackErr)}`,
    );
  }
  return false;
}

function recordTaskCreationAudit(input: TaskCreationAuditInput): void {
  try {
    const body = (input.body && typeof input.body === "object")
      ? input.body
      : null;
    const payloadForHash: Record<string, unknown> = {
      trigger: input.trigger,
      trigger_detail: input.triggerDetail ?? null,
      actor_type: input.actorType ?? null,
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? null,
      body,
    };
    const payloadJson = stableAuditJson(payloadForHash);
    const payloadHash = createHash("sha256")
      .update(payloadJson, "utf8")
      .digest("hex");

    const requestId = input.req ? resolveAuditRequestId(input.req, body ?? {}) : null;
    const requestIp = input.req ? resolveAuditRequestIp(input.req) : null;
    const userAgent = input.req ? normalizeAuditText(input.req.get("user-agent"), 200) : null;

    db.prepare(`
      INSERT INTO task_creation_audits (
        id, task_id, task_title, task_status, department_id, assigned_agent_id, source_task_id,
        task_type, project_path, trigger, trigger_detail, actor_type, actor_id, actor_name,
        request_id, request_ip, user_agent, payload_hash, payload_preview, completed, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.taskId,
      normalizeAuditText(input.taskTitle, 500),
      normalizeAuditText(input.taskStatus ?? null, 64),
      normalizeAuditText(input.departmentId ?? null, 100),
      normalizeAuditText(input.assignedAgentId ?? null, 100),
      normalizeAuditText(input.sourceTaskId ?? null, 100),
      normalizeAuditText(input.taskType ?? null, 100),
      normalizeAuditText(input.projectPath ?? null, 500),
      normalizeAuditText(input.trigger, 120),
      normalizeAuditText(input.triggerDetail ?? null, 500),
      normalizeAuditText(input.actorType ?? null, 64),
      normalizeAuditText(input.actorId ?? null, 100),
      normalizeAuditText(input.actorName ?? null, 200),
      requestId,
      requestIp,
      userAgent,
      payloadHash,
      normalizeAuditText(payloadJson, 4000),
      0,
      nowMs(),
    );
  } catch (err) {
    console.warn(`[Claw-Empire] task creation audit failed: ${String(err)}`);
  }
}

function setTaskCreationAuditCompletion(taskId: string, completed: boolean): void {
  try {
    db.prepare(
      "UPDATE task_creation_audits SET completed = ? WHERE task_id = ?"
    ).run(completed ? 1 : 0, taskId);
  } catch (err) {
    console.warn(`[Claw-Empire] task creation audit completion update failed: ${String(err)}`);
  }
}

const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

type StoredMessage = {
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

type MessageInsertInput = {
  senderType: string;
  senderId: string | null;
  receiverType: string;
  receiverId: string | null;
  content: string;
  messageType: string;
  taskId?: string | null;
  idempotencyKey?: string | null;
};

class IdempotencyConflictError extends Error {
  constructor(public readonly key: string) {
    super("idempotency_conflict");
    this.name = "IdempotencyConflictError";
  }
}

function isSameMessagePayload(existing: StoredMessage, input: MessageInsertInput, taskId: string | null): boolean {
  return (
    existing.sender_type === input.senderType
    && existing.sender_id === input.senderId
    && existing.receiver_type === input.receiverType
    && existing.receiver_id === input.receiverId
    && existing.content === input.content
    && existing.message_type === input.messageType
    && existing.task_id === taskId
  );
}

function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= IDEMPOTENCY_KEY_MAX_LENGTH) return trimmed;
  return `sha256:${createHash("sha256").update(trimmed, "utf8").digest("hex")}`;
}

function resolveMessageIdempotencyKey(
  req: { get(name: string): string | undefined },
  body: Record<string, unknown>,
  scope: string,
): string | null {
  const normalizedScope = scope.trim().toLowerCase() || "api.messages";
  const candidates: unknown[] = [
    body.idempotency_key,
    body.idempotencyKey,
    body.request_id,
    body.requestId,
    req.get("x-idempotency-key"),
    req.get("idempotency-key"),
    req.get("x-request-id"),
  ];
  for (const candidate of candidates) {
    const key = normalizeIdempotencyKey(candidate);
    if (key) {
      const digest = createHash("sha256").update(`${normalizedScope}:${key}`, "utf8").digest("hex");
      return `${normalizedScope}:${digest}`;
    }
  }
  return null;
}

function findMessageByIdempotencyKey(idempotencyKey: string): StoredMessage | null {
  const row = db.prepare(`
    SELECT id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, idempotency_key, created_at
    FROM messages
    WHERE idempotency_key = ?
    LIMIT 1
  `).get(idempotencyKey) as StoredMessage | undefined;
  return row ?? null;
}

function isIdempotencyUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  if (!message.includes("unique constraint failed")) return false;
  return message.includes("messages.idempotency_key") || message.includes("idx_messages_idempotency_key");
}

class StorageBusyError extends Error {
  constructor(
    public readonly operation: string,
    public readonly attempts: number,
  ) {
    super("storage_busy");
    this.name = "StorageBusyError";
  }
}

function isSqliteBusyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return true;
  const message = err.message.toLowerCase();
  return (
    message.includes("sqlite_busy")
    || message.includes("sqlite_locked")
    || message.includes("database is locked")
    || message.includes("database is busy")
  );
}

function sqliteBusyBackoffDelayMs(attempt: number): number {
  const expo = SQLITE_BUSY_RETRY_BASE_DELAY_MS * (2 ** attempt);
  const capped = Math.min(expo, SQLITE_BUSY_RETRY_MAX_DELAY_MS);
  if (SQLITE_BUSY_RETRY_JITTER_MS <= 0) return Math.floor(capped);
  const jitter = Math.floor(Math.random() * (SQLITE_BUSY_RETRY_JITTER_MS + 1));
  return Math.floor(capped + jitter);
}

async function withSqliteBusyRetry<T>(operation: string, fn: () => T): Promise<T> {
  for (let attempt = 0; attempt <= SQLITE_BUSY_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const result = fn();
      if (attempt > 0) {
        console.warn(`[Claw-Empire] SQLite busy recovered: op=${operation}, retries=${attempt}`);
      }
      return result;
    } catch (err) {
      if (!isSqliteBusyError(err)) throw err;
      if (attempt >= SQLITE_BUSY_RETRY_MAX_ATTEMPTS) {
        throw new StorageBusyError(operation, attempt + 1);
      }
      const waitMs = sqliteBusyBackoffDelayMs(attempt);
      console.warn(
        `[Claw-Empire] SQLite busy: op=${operation}, attempt=${attempt + 1}/${SQLITE_BUSY_RETRY_MAX_ATTEMPTS + 1}, `
        + `retry_in=${waitMs}ms`,
      );
      if (waitMs > 0) await sleepMs(waitMs);
    }
  }

  throw new StorageBusyError(operation, SQLITE_BUSY_RETRY_MAX_ATTEMPTS + 1);
}

function insertMessageWithIdempotencyOnce(input: MessageInsertInput): { message: StoredMessage; created: boolean } {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const taskId = input.taskId ?? null;
  if (idempotencyKey) {
    const existing = findMessageByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (!isSameMessagePayload(existing, input, taskId)) {
        throw new IdempotencyConflictError(idempotencyKey);
      }
      return { message: existing, created: false };
    }
  }

  const id = randomUUID();
  const createdAt = nowMs();
  try {
    db.prepare(`
      INSERT INTO messages (
        id, sender_type, sender_id, receiver_type, receiver_id,
        content, message_type, task_id, idempotency_key, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.senderType,
      input.senderId,
      input.receiverType,
      input.receiverId,
      input.content,
      input.messageType,
      taskId,
      idempotencyKey,
      createdAt,
    );
  } catch (err) {
    if (idempotencyKey && isIdempotencyUniqueViolation(err)) {
      const existing = findMessageByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (!isSameMessagePayload(existing, input, taskId)) {
          throw new IdempotencyConflictError(idempotencyKey);
        }
        return { message: existing, created: false };
      }
    }
    throw err;
  }

  return {
    message: {
      id,
      sender_type: input.senderType,
      sender_id: input.senderId,
      receiver_type: input.receiverType,
      receiver_id: input.receiverId,
      content: input.content,
      message_type: input.messageType,
      task_id: taskId,
      idempotency_key: idempotencyKey,
      created_at: createdAt,
    },
    created: true,
  };
}

async function insertMessageWithIdempotency(input: MessageInsertInput): Promise<{ message: StoredMessage; created: boolean }> {
  return withSqliteBusyRetry("messages.insert", () => insertMessageWithIdempotencyOnce(input));
}

// ---------------------------------------------------------------------------
// Schema creation
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 99,
  created_at INTEGER DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  department_id TEXT REFERENCES departments(id),
  role TEXT NOT NULL CHECK(role IN ('team_leader','senior','junior','intern')),
  cli_provider TEXT CHECK(cli_provider IN ('claude','codex','gemini','opencode','copilot','antigravity','api')),
  oauth_account_id TEXT,
  api_provider_id TEXT,
  api_model TEXT,
  avatar_emoji TEXT NOT NULL DEFAULT '🤖',
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
  last_used_at INTEGER,
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

CREATE TABLE IF NOT EXISTS skill_learning_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex','gemini','opencode','copilot','antigravity','api')),
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
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_dept ON tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_recent ON projects(last_used_at DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_creation_audits_task ON task_creation_audits(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_creation_audits_trigger ON task_creation_audits(trigger, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id, created_at DESC);
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
  type TEXT NOT NULL DEFAULT 'openai' CHECK(type IN ('openai','anthropic','google','ollama','openrouter','together','groq','cerebras','custom')),
  base_url TEXT NOT NULL,
  api_key_enc TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  models_cache TEXT,
  models_cached_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);
`);

// Add columns to oauth_credentials for web-oauth tokens (safe to run repeatedly)
try { db.exec("ALTER TABLE oauth_credentials ADD COLUMN access_token_enc TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_credentials ADD COLUMN refresh_token_enc TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE agents ADD COLUMN oauth_account_id TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE agents ADD COLUMN api_provider_id TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE agents ADD COLUMN api_model TEXT"); } catch { /* already exists */ }
// 기존 DB의 cli_provider CHECK 제약 확장 (SQLite는 ALTER CHECK 미지원이므로 새 행만 해당)
try {
  const hasApiCheck = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'").get() as any)?.sql?.includes("'api'");
  if (!hasApiCheck) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_ko TEXT NOT NULL,
        department_id TEXT REFERENCES departments(id),
        role TEXT NOT NULL CHECK(role IN ('team_leader','senior','junior','intern')),
        cli_provider TEXT CHECK(cli_provider IN ('claude','codex','gemini','opencode','copilot','antigravity','api')),
        oauth_account_id TEXT,
        api_provider_id TEXT,
        api_model TEXT,
        avatar_emoji TEXT NOT NULL DEFAULT '🤖',
        personality TEXT,
        status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','working','break','offline')),
        current_task_id TEXT,
        stats_tasks_done INTEGER DEFAULT 0,
        stats_xp INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()*1000)
      );
      INSERT INTO agents_new SELECT id, name, name_ko, department_id, role, cli_provider, oauth_account_id, NULL, NULL, avatar_emoji, personality, status, current_task_id, stats_tasks_done, stats_xp, created_at FROM agents;
      DROP TABLE agents;
      ALTER TABLE agents_new RENAME TO agents;
    `);
  }
} catch { /* migration already done or not needed */ }
// api_providers CHECK 제약 확장: cerebras 추가
try {
  const apiProvSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='api_providers'").get() as any)?.sql ?? "";
  if (apiProvSql && !apiProvSql.includes("'cerebras'")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_providers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'openai' CHECK(type IN ('openai','anthropic','google','ollama','openrouter','together','groq','cerebras','custom')),
        base_url TEXT NOT NULL,
        api_key_enc TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        models_cache TEXT,
        models_cached_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()*1000),
        updated_at INTEGER DEFAULT (unixepoch()*1000)
      );
      INSERT INTO api_providers_new SELECT * FROM api_providers;
      DROP TABLE api_providers;
      ALTER TABLE api_providers_new RENAME TO api_providers;
    `);
  }
} catch { /* migration already done or not needed */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN label TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN model_override TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN priority INTEGER NOT NULL DEFAULT 100"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN last_error TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN last_error_at INTEGER"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE oauth_accounts ADD COLUMN last_success_at INTEGER"); } catch { /* already exists */ }

function migrateOAuthActiveAccountsTable(): void {
  const cols = db.prepare("PRAGMA table_info(oauth_active_accounts)").all() as Array<{
    name: string;
    pk: number;
  }>;
  if (cols.length === 0) return;
  const providerPk = cols.find((c) => c.name === "provider")?.pk ?? 0;
  const accountPk = cols.find((c) => c.name === "account_id")?.pk ?? 0;
  const hasCompositePk = providerPk === 1 && accountPk === 2;
  if (hasCompositePk) return;

  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE oauth_active_accounts RENAME TO oauth_active_accounts_legacy");
    db.exec(`
      CREATE TABLE oauth_active_accounts (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES oauth_accounts(id) ON DELETE CASCADE,
        updated_at INTEGER DEFAULT (unixepoch()*1000),
        PRIMARY KEY (provider, account_id)
      )
    `);
    db.exec(`
      INSERT OR IGNORE INTO oauth_active_accounts (provider, account_id, updated_at)
      SELECT provider, account_id, COALESCE(updated_at, unixepoch() * 1000)
      FROM oauth_active_accounts_legacy
      WHERE provider IS NOT NULL AND account_id IS NOT NULL
    `);
    db.exec("DROP TABLE oauth_active_accounts_legacy");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

migrateOAuthActiveAccountsTable();

function getActiveOAuthAccountIds(provider: string): string[] {
  return (db.prepare(`
    SELECT oa.account_id
    FROM oauth_active_accounts oa
    JOIN oauth_accounts a ON a.id = oa.account_id
    WHERE oa.provider = ?
      AND a.provider = ?
      AND a.status = 'active'
    ORDER BY oa.updated_at DESC, a.priority ASC, a.updated_at DESC
  `).all(provider, provider) as Array<{ account_id: string }>).map((r) => r.account_id);
}

function setActiveOAuthAccount(provider: string, accountId: string): void {
  db.prepare(`
    INSERT INTO oauth_active_accounts (provider, account_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(provider, account_id) DO UPDATE SET
      updated_at = excluded.updated_at
  `).run(provider, accountId, nowMs());
}

function removeActiveOAuthAccount(provider: string, accountId: string): void {
  db.prepare(
    "DELETE FROM oauth_active_accounts WHERE provider = ? AND account_id = ?"
  ).run(provider, accountId);
}

function setOAuthActiveAccounts(provider: string, accountIds: string[]): void {
  const cleaned = Array.from(new Set(accountIds.filter(Boolean)));
  runInTransaction(() => {
    db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
    if (cleaned.length === 0) return;
    const stmt = db.prepare(`
      INSERT INTO oauth_active_accounts (provider, account_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(provider, account_id) DO UPDATE SET
        updated_at = excluded.updated_at
    `);
    let stamp = nowMs();
    for (const id of cleaned) {
      stmt.run(provider, id, stamp);
      stamp += 1;
    }
  });
}

function oauthProviderPrefix(provider: string): string {
  return provider === "github" ? "Copi" : "Anti";
}

function normalizeOAuthProvider(provider: string): "github" | "google_antigravity" | null {
  if (provider === "github-copilot" || provider === "github" || provider === "copilot") return "github";
  if (provider === "antigravity" || provider === "google_antigravity") return "google_antigravity";
  return null;
}

function getNextOAuthLabel(provider: string): string {
  const normalizedProvider = normalizeOAuthProvider(provider) ?? provider;
  const prefix = oauthProviderPrefix(normalizedProvider);
  const rows = db.prepare(
    "SELECT label FROM oauth_accounts WHERE provider = ?"
  ).all(normalizedProvider) as Array<{ label: string | null }>;
  let maxSeq = 0;
  for (const row of rows) {
    if (!row.label) continue;
    const m = row.label.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  return `${prefix}-${maxSeq + 1}`;
}

function ensureOAuthActiveAccount(provider: string): void {
  db.prepare(`
    DELETE FROM oauth_active_accounts
    WHERE provider = ?
      AND account_id NOT IN (
        SELECT id FROM oauth_accounts WHERE provider = ? AND status = 'active'
      )
  `).run(provider, provider);

  const activeIds = getActiveOAuthAccountIds(provider);
  if (activeIds.length > 0) return;

  const fallback = db.prepare(
    "SELECT id FROM oauth_accounts WHERE provider = ? AND status = 'active' ORDER BY priority ASC, updated_at DESC LIMIT 1"
  ).get(provider) as { id: string } | undefined;
  if (!fallback) {
    db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
    return;
  }
  setActiveOAuthAccount(provider, fallback.id);
}

function migrateLegacyOAuthCredentialsToAccounts(): void {
  const legacyRows = db.prepare(`
    SELECT provider, source, email, scope, expires_at, access_token_enc, refresh_token_enc, created_at, updated_at
    FROM oauth_credentials
    WHERE provider IN ('github','google_antigravity')
  `).all() as Array<{
    provider: string;
    source: string | null;
    email: string | null;
    scope: string | null;
    expires_at: number | null;
    access_token_enc: string | null;
    refresh_token_enc: string | null;
    created_at: number;
    updated_at: number;
  }>;

  for (const row of legacyRows) {
    const hasAccounts = db.prepare(
      "SELECT COUNT(*) as cnt FROM oauth_accounts WHERE provider = ?"
    ).get(row.provider) as { cnt: number };
    if (hasAccounts.cnt > 0) continue;
    if (!row.access_token_enc && !row.refresh_token_enc) continue;
    const id = randomUUID();
    const label = getNextOAuthLabel(row.provider);
    db.prepare(`
      INSERT INTO oauth_accounts (
        id, provider, source, label, email, scope, expires_at,
        access_token_enc, refresh_token_enc, status, priority,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 100, ?, ?)
    `).run(
      id,
      row.provider,
      row.source,
      label,
      row.email,
      row.scope,
      row.expires_at,
      row.access_token_enc,
      row.refresh_token_enc,
      row.created_at || nowMs(),
      row.updated_at || nowMs(),
    );
  }

  ensureOAuthActiveAccount("github");
  ensureOAuthActiveAccount("google_antigravity");
}
migrateLegacyOAuthCredentialsToAccounts();

// Subtask cross-department delegation columns
try { db.exec("ALTER TABLE subtasks ADD COLUMN target_department_id TEXT"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE subtasks ADD COLUMN delegated_task_id TEXT"); } catch { /* already exists */ }

// Cross-department collaboration: link collaboration task back to original task
try { db.exec("ALTER TABLE tasks ADD COLUMN source_task_id TEXT"); } catch { /* already exists */ }
try {
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  const hasProjectId = taskCols.some((c) => c.name === "project_id");
  if (!hasProjectId) {
    try {
      db.exec("ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id)");
    } catch {
      // Fallback for legacy SQLite builds that reject REFERENCES on ADD COLUMN.
      db.exec("ALTER TABLE tasks ADD COLUMN project_id TEXT");
    }
  }
} catch { /* table missing during migration window */ }
try { db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, updated_at DESC)"); } catch { /* project_id not ready yet */ }
// Task creation audit completion flag
try { db.exec("ALTER TABLE task_creation_audits ADD COLUMN completed INTEGER NOT NULL DEFAULT 0"); } catch { /* already exists */ }
try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_task_creation_audits_completed ON task_creation_audits(completed, created_at DESC)");
} catch { /* table missing or migration in progress */ }

// Migrate messages CHECK constraint to include 'directive'
function migrateMessagesDirectiveType(): void {
  const row = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'
  `).get() as { sql?: string } | undefined;
  const ddl = (row?.sql ?? "").toLowerCase();
  if (ddl.includes("'directive'")) return;

  console.log("[Claw-Empire] Migrating messages.message_type CHECK to include 'directive'");
  const oldTable = "messages_directive_migration_old";
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN");
    try {
      db.exec(`ALTER TABLE messages RENAME TO ${oldTable}`);
      const oldCols = db.prepare(`PRAGMA table_info(${oldTable})`).all() as Array<{ name: string }>;
      const hasIdempotencyKey = oldCols.some((c) => c.name === "idempotency_key");
      const idempotencyExpr = hasIdempotencyKey ? "idempotency_key" : "NULL";
      db.exec(`
        CREATE TABLE messages (
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
      `);
      db.exec(`
        INSERT INTO messages (id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, idempotency_key, created_at)
        SELECT id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, ${idempotencyExpr}, created_at
        FROM ${oldTable};
      `);
      db.exec(`DROP TABLE ${oldTable}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      // Restore original table if migration failed
      try { db.exec(`ALTER TABLE ${oldTable} RENAME TO messages`); } catch { /* */ }
      throw e;
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
  // Recreate index
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_type, receiver_id, created_at DESC)");
}
migrateMessagesDirectiveType();

function migrateLegacyTasksStatusSchema(): void {
  const row = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'tasks'
  `).get() as { sql?: string } | undefined;
  const ddl = (row?.sql ?? "").toLowerCase();
  if (ddl.includes("'collaborating'") && ddl.includes("'pending'")) return;

  console.log("[Claw-Empire] Migrating legacy tasks.status CHECK constraint");
  const newTable = "tasks_status_migration_new";
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN");
    try {
      db.exec(`DROP TABLE IF EXISTS ${newTable}`);
      db.exec(`
        CREATE TABLE ${newTable} (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          department_id TEXT REFERENCES departments(id),
          assigned_agent_id TEXT REFERENCES agents(id),
          project_id TEXT REFERENCES projects(id),
          status TEXT NOT NULL DEFAULT 'inbox'
            CHECK(status IN ('inbox','planned','collaborating','in_progress','review','done','cancelled','pending')),
          priority INTEGER DEFAULT 0,
          task_type TEXT DEFAULT 'general'
            CHECK(task_type IN ('general','development','design','analysis','presentation','documentation')),
          project_path TEXT,
          result TEXT,
          started_at INTEGER,
          completed_at INTEGER,
          created_at INTEGER DEFAULT (unixepoch()*1000),
          updated_at INTEGER DEFAULT (unixepoch()*1000),
          source_task_id TEXT
        );
      `);

      const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
      const hasSourceTaskId = cols.some((c) => c.name === "source_task_id");
      const hasProjectId = cols.some((c) => c.name === "project_id");
      const sourceTaskIdExpr = hasSourceTaskId ? "source_task_id" : "NULL AS source_task_id";
      const projectIdExpr = hasProjectId ? "project_id" : "NULL AS project_id";
      db.exec(`
        INSERT INTO ${newTable} (
          id, title, description, department_id, assigned_agent_id,
          project_id, status, priority, task_type, project_path, result,
          started_at, completed_at, created_at, updated_at, source_task_id
        )
        SELECT
          id, title, description, department_id, assigned_agent_id,
          ${projectIdExpr},
          CASE
            WHEN status IN ('inbox','planned','collaborating','in_progress','review','done','cancelled','pending')
              THEN status
            ELSE 'inbox'
          END,
          priority, task_type, project_path, result,
          started_at, completed_at, created_at, updated_at, ${sourceTaskIdExpr}
        FROM tasks;
      `);

      db.exec("DROP TABLE tasks");
      db.exec(`ALTER TABLE ${newTable} RENAME TO tasks`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at DESC)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_dept ON tasks(department_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, updated_at DESC)");
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
migrateLegacyTasksStatusSchema();

function repairLegacyTaskForeignKeys(): void {
  const refCount = (db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM sqlite_master
    WHERE type = 'table' AND sql LIKE '%tasks_legacy_status_migration%'
  `).get() as { cnt: number }).cnt;
  if (refCount === 0) return;

  console.log("[Claw-Empire] Repairing legacy foreign keys to tasks_legacy_status_migration");
  const messagesOld = "messages_fkfix_old";
  const taskLogsOld = "task_logs_fkfix_old";
  const subtasksOld = "subtasks_fkfix_old";
  const meetingMinutesOld = "meeting_minutes_fkfix_old";
  const meetingEntriesOld = "meeting_minute_entries_fkfix_old";

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN");
    try {
      db.exec(`ALTER TABLE messages RENAME TO ${messagesOld}`);
      const legacyMessageCols = db.prepare(`PRAGMA table_info(${messagesOld})`).all() as Array<{ name: string }>;
      const hasLegacyIdempotencyKey = legacyMessageCols.some((c) => c.name === "idempotency_key");
      const legacyIdempotencyExpr = hasLegacyIdempotencyKey ? "idempotency_key" : "NULL";
      db.exec(`
        CREATE TABLE messages (
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
      `);
      db.exec(`
        INSERT INTO messages (id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, idempotency_key, created_at)
        SELECT id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, ${legacyIdempotencyExpr}, created_at
        FROM ${messagesOld};
      `);

      db.exec(`ALTER TABLE task_logs RENAME TO ${taskLogsOld}`);
      db.exec(`
        CREATE TABLE task_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT REFERENCES tasks(id),
          kind TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()*1000)
        );
      `);
      db.exec(`
        INSERT INTO task_logs (id, task_id, kind, message, created_at)
        SELECT id, task_id, kind, message, created_at
        FROM ${taskLogsOld};
      `);

      db.exec(`ALTER TABLE subtasks RENAME TO ${subtasksOld}`);
      db.exec(`
        CREATE TABLE subtasks (
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
          completed_at INTEGER,
          target_department_id TEXT,
          delegated_task_id TEXT
        );
      `);
      const subtasksCols = db.prepare(`PRAGMA table_info(${subtasksOld})`).all() as Array<{ name: string }>;
      const hasTargetDept = subtasksCols.some((c) => c.name === "target_department_id");
      const hasDelegatedTask = subtasksCols.some((c) => c.name === "delegated_task_id");
      db.exec(`
        INSERT INTO subtasks (
          id, task_id, title, description, status, assigned_agent_id,
          blocked_reason, cli_tool_use_id, created_at, completed_at,
          target_department_id, delegated_task_id
        )
        SELECT
          id, task_id, title, description, status, assigned_agent_id,
          blocked_reason, cli_tool_use_id, created_at, completed_at,
          ${hasTargetDept ? "target_department_id" : "NULL"},
          ${hasDelegatedTask ? "delegated_task_id" : "NULL"}
        FROM ${subtasksOld};
      `);

      db.exec(`ALTER TABLE meeting_minute_entries RENAME TO ${meetingEntriesOld}`);
      db.exec(`ALTER TABLE meeting_minutes RENAME TO ${meetingMinutesOld}`);
      db.exec(`
        CREATE TABLE meeting_minutes (
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
      `);
      db.exec(`
        INSERT INTO meeting_minutes (
          id, task_id, meeting_type, round, title, status, started_at, completed_at, created_at
        )
        SELECT
          id, task_id, meeting_type, round, title, status, started_at, completed_at, created_at
        FROM ${meetingMinutesOld};
      `);

      db.exec(`
        CREATE TABLE meeting_minute_entries (
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
      `);
      db.exec(`
        INSERT INTO meeting_minute_entries (
          id, meeting_id, seq, speaker_agent_id, speaker_name,
          department_name, role_label, message_type, content, created_at
        )
        SELECT
          id, meeting_id, seq, speaker_agent_id, speaker_name,
          department_name, role_label, message_type, content, created_at
        FROM ${meetingEntriesOld};
      `);

      db.exec(`DROP TABLE ${messagesOld}`);
      db.exec(`DROP TABLE ${taskLogsOld}`);
      db.exec(`DROP TABLE ${subtasksOld}`);
      db.exec(`DROP TABLE ${meetingEntriesOld}`);
      db.exec(`DROP TABLE ${meetingMinutesOld}`);

      db.exec("CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id, created_at DESC)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_type, receiver_id, created_at DESC)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_meeting_minutes_task ON meeting_minutes(task_id, started_at DESC)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_meeting_minute_entries_meeting ON meeting_minute_entries(meeting_id, seq ASC)");

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
repairLegacyTaskForeignKeys();

function ensureMessagesIdempotencySchema(): void {
  try { db.exec("ALTER TABLE messages ADD COLUMN idempotency_key TEXT"); } catch { /* already exists */ }

  db.prepare(`
    UPDATE messages
    SET idempotency_key = NULL
    WHERE idempotency_key IS NOT NULL
      AND TRIM(idempotency_key) = ''
  `).run();

  const duplicateKeys = db.prepare(`
    SELECT idempotency_key
    FROM messages
    WHERE idempotency_key IS NOT NULL
    GROUP BY idempotency_key
    HAVING COUNT(*) > 1
  `).all() as Array<{ idempotency_key: string }>;

  for (const row of duplicateKeys) {
    const keep = db.prepare(`
      SELECT id
      FROM messages
      WHERE idempotency_key = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `).get(row.idempotency_key) as { id: string } | undefined;
    if (!keep) continue;
    db.prepare(`
      UPDATE messages
      SET idempotency_key = NULL
      WHERE idempotency_key = ?
        AND id != ?
    `).run(row.idempotency_key, keep.id);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idempotency_key
    ON messages(idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `);
}
ensureMessagesIdempotencySchema();

// ---------------------------------------------------------------------------
// Seed default data
// ---------------------------------------------------------------------------
const deptCount = (db.prepare("SELECT COUNT(*) as cnt FROM departments").get() as { cnt: number }).cnt;

if (deptCount === 0) {
  const insertDept = db.prepare(
    "INSERT INTO departments (id, name, name_ko, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );
  // Workflow order: 기획 → 개발 → 디자인 → QA → 인프라보안 → 운영
  insertDept.run("planning",  "Planning",    "기획팀",     "📊", "#f59e0b", 1);
  insertDept.run("dev",       "Development", "개발팀",     "💻", "#3b82f6", 2);
  insertDept.run("design",    "Design",      "디자인팀",   "🎨", "#8b5cf6", 3);
  insertDept.run("qa",        "QA/QC",       "품질관리팀", "🔍", "#ef4444", 4);
  insertDept.run("devsecops", "DevSecOps",   "인프라보안팀","🛡️", "#f97316", 5);
  insertDept.run("operations","Operations",  "운영팀",     "⚙️", "#10b981", 6);
  console.log("[Claw-Empire] Seeded default departments");
}

const agentCount = (db.prepare("SELECT COUNT(*) as cnt FROM agents").get() as { cnt: number }).cnt;

if (agentCount === 0) {
  const insertAgent = db.prepare(
    `INSERT INTO agents (id, name, name_ko, department_id, role, cli_provider, avatar_emoji, personality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // Development (3)
  insertAgent.run(randomUUID(), "Aria",  "아리아", "dev",        "team_leader", "claude",   "👩‍💻", "꼼꼼한 시니어 개발자");
  insertAgent.run(randomUUID(), "Bolt",  "볼트",   "dev",        "senior",      "codex",    "⚡",   "빠른 코딩 전문가");
  insertAgent.run(randomUUID(), "Nova",  "노바",   "dev",        "junior",      "copilot",  "🌟",   "창의적인 주니어");
  // Design (2)
  insertAgent.run(randomUUID(), "Pixel", "픽셀",   "design",     "team_leader", "claude",   "🎨",   "디자인 리더");
  insertAgent.run(randomUUID(), "Luna",  "루나",   "design",     "junior",      "gemini",   "🌙",   "감성적인 UI 디자이너");
  // Planning (2)
  insertAgent.run(randomUUID(), "Sage",  "세이지", "planning",   "team_leader", "codex",    "🧠",   "전략 분석가");
  insertAgent.run(randomUUID(), "Clio",  "클리오", "planning",   "senior",      "claude",   "📝",   "데이터 기반 기획자");
  // Operations (2)
  insertAgent.run(randomUUID(), "Atlas", "아틀라스","operations", "team_leader", "claude",   "🗺️",  "운영의 달인");
  insertAgent.run(randomUUID(), "Turbo", "터보",   "operations", "senior",      "codex",    "🚀",   "자동화 전문가");
  // QA/QC (2)
  insertAgent.run(randomUUID(), "Hawk",  "호크",   "qa",         "team_leader", "claude",   "🦅",   "날카로운 품질 감시자");
  insertAgent.run(randomUUID(), "Lint",  "린트",   "qa",         "senior",      "codex",    "🔬",   "꼼꼼한 테스트 전문가");
  // DevSecOps (2)
  insertAgent.run(randomUUID(), "Vault", "볼트S",  "devsecops",  "team_leader", "claude",   "🛡️",  "보안 아키텍트");
  insertAgent.run(randomUUID(), "Pipe",  "파이프", "devsecops",  "senior",      "codex",    "🔧",   "CI/CD 파이프라인 전문가");
  console.log("[Claw-Empire] Seeded default agents");
}

// Seed default settings if none exist
{
  const defaultRoomThemes = {
    ceoOffice:  { accent: 0xa77d0c, floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243 },
    planning:   { accent: 0xd4a85a, floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871 },
    dev:        { accent: 0x5a9fd4, floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7 },
    design:     { accent: 0x9a6fc4, floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad },
    qa:         { accent: 0xd46a6a, floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979 },
    devsecops:  { accent: 0xd4885a, floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871 },
    operations: { accent: 0x5ac48a, floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89 },
    breakRoom:  { accent: 0xf0c878, floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83 },
  };

  const settingsCount = (db.prepare("SELECT COUNT(*) as c FROM settings").get() as { c: number }).c;
  const isLegacySettingsInstall = settingsCount > 0;
  if (settingsCount === 0) {
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("companyName", "Claw-Empire");
    insertSetting.run("ceoName", "CEO");
    insertSetting.run("autoAssign", "true");
    insertSetting.run("autoUpdateEnabled", "false");
    insertSetting.run("autoUpdateNoticePending", "false");
    insertSetting.run("oauthAutoSwap", "true");
    insertSetting.run("language", "en");
    insertSetting.run("defaultProvider", "claude");
    insertSetting.run("providerModelConfig", JSON.stringify({
      claude:      { model: "claude-opus-4-6", subModel: "claude-sonnet-4-6" },
      codex:       { model: "gpt-5.3-codex", reasoningLevel: "xhigh", subModel: "gpt-5.3-codex", subModelReasoningLevel: "high" },
      gemini:      { model: "gemini-3-pro-preview" },
      opencode:    { model: "github-copilot/claude-sonnet-4.6" },
      copilot:     { model: "github-copilot/claude-sonnet-4.6" },
      antigravity: { model: "google/antigravity-gemini-3-pro" },
    }));
    insertSetting.run("roomThemes", JSON.stringify(defaultRoomThemes));
    console.log("[Claw-Empire] Seeded default settings");
  }

  const hasLanguageSetting = db
    .prepare("SELECT 1 FROM settings WHERE key = 'language' LIMIT 1")
    .get() as { 1: number } | undefined;
  if (!hasLanguageSetting) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("language", "en");
  }

  const hasOAuthAutoSwapSetting = db
    .prepare("SELECT 1 FROM settings WHERE key = 'oauthAutoSwap' LIMIT 1")
    .get() as { 1: number } | undefined;
  if (!hasOAuthAutoSwapSetting) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("oauthAutoSwap", "true");
  }

  const hasAutoUpdateEnabledSetting = db
    .prepare("SELECT 1 FROM settings WHERE key = 'autoUpdateEnabled' LIMIT 1")
    .get() as { 1: number } | undefined;
  if (!hasAutoUpdateEnabledSetting) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("autoUpdateEnabled", "false");
  }

  const hasAutoUpdateNoticePendingSetting = db
    .prepare("SELECT 1 FROM settings WHERE key = 'autoUpdateNoticePending' LIMIT 1")
    .get() as { 1: number } | undefined;
  if (!hasAutoUpdateNoticePendingSetting) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("autoUpdateNoticePending", isLegacySettingsInstall ? "true" : "false");
  }

  const hasRoomThemesSetting = db
    .prepare("SELECT 1 FROM settings WHERE key = 'roomThemes' LIMIT 1")
    .get() as { 1: number } | undefined;
  if (!hasRoomThemesSetting) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("roomThemes", JSON.stringify(defaultRoomThemes));
  }
}

// Migrate: add sort_order column & set correct ordering for existing DBs
{
  try { db.exec("ALTER TABLE departments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 99"); } catch { /* already exists */ }

  const DEPT_ORDER: Record<string, number> = { planning: 1, dev: 2, design: 3, qa: 4, devsecops: 5, operations: 6 };
  const updateOrder = db.prepare("UPDATE departments SET sort_order = ? WHERE id = ?");
  for (const [id, order] of Object.entries(DEPT_ORDER)) {
    updateOrder.run(order, id);
  }

  const insertDeptIfMissing = db.prepare(
    "INSERT OR IGNORE INTO departments (id, name, name_ko, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );
  insertDeptIfMissing.run("qa", "QA/QC", "품질관리팀", "🔍", "#ef4444", 4);
  insertDeptIfMissing.run("devsecops", "DevSecOps", "인프라보안팀", "🛡️", "#f97316", 5);

  const insertAgentIfMissing = db.prepare(
    `INSERT OR IGNORE INTO agents (id, name, name_ko, department_id, role, cli_provider, avatar_emoji, personality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Check which agents exist by name to avoid duplicates
  const existingNames = new Set(
    (db.prepare("SELECT name FROM agents").all() as { name: string }[]).map((r) => r.name)
  );

  const newAgents: [string, string, string, string, string, string, string][] = [
    // [name, name_ko, dept, role, provider, emoji, personality]
    ["Luna",  "루나",   "design",     "junior",      "gemini",   "🌙",  "감성적인 UI 디자이너"],
    ["Clio",  "클리오", "planning",   "senior",      "claude",   "📝",  "데이터 기반 기획자"],
    ["Turbo", "터보",   "operations", "senior",      "codex",    "🚀",  "자동화 전문가"],
    ["Hawk",  "호크",   "qa",         "team_leader", "claude",   "🦅",  "날카로운 품질 감시자"],
    ["Lint",  "린트",   "qa",         "senior",      "opencode", "🔬",  "꼼꼼한 테스트 전문가"],
    ["Vault", "볼트S",  "devsecops",  "team_leader", "claude",   "🛡️", "보안 아키텍트"],
    ["Pipe",  "파이프", "devsecops",  "senior",      "codex",    "🔧",  "CI/CD 파이프라인 전문가"],
  ];

  let added = 0;
  for (const [name, nameKo, dept, role, provider, emoji, personality] of newAgents) {
    if (!existingNames.has(name)) {
      insertAgentIfMissing.run(randomUUID(), name, nameKo, dept, role, provider, emoji, personality);
      added++;
    }
  }
  if (added > 0) console.log(`[Claw-Empire] Added ${added} new agents`);
}

function readSettingString(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: unknown } | undefined;
  if (!row || typeof row.value !== "string") return undefined;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === "string" ? parsed : row.value;
  } catch {
    return row.value;
  }
}

const runtimeContext: Record<string, any> & BaseRuntimeContext = {
  app,
  db,
  dbPath,
  logsDir,
  distDir,
  isProduction,
  nowMs,
  runInTransaction,
  firstQueryValue,
  readSettingString,

  IN_PROGRESS_ORPHAN_GRACE_MS,
  IN_PROGRESS_ORPHAN_SWEEP_MS,
  SUBTASK_DELEGATION_SWEEP_MS,

  ensureOAuthActiveAccount,
  getActiveOAuthAccountIds,
  setActiveOAuthAccount,
  setOAuthActiveAccounts,
  removeActiveOAuthAccount,
  isIncomingMessageAuthenticated,
  isIncomingMessageOriginTrusted,

  IdempotencyConflictError,
  StorageBusyError,
  insertMessageWithIdempotency,
  resolveMessageIdempotencyKey,
  withSqliteBusyRetry,
  recordMessageIngressAuditOr503,
  recordAcceptedIngressAuditOrRollback,
  recordTaskCreationAudit,
  setTaskCreationAuditCompletion,

  WebSocket,
  WebSocketServer,
  express,

  DEPT_KEYWORDS: {},
};

const runtimeProxy = createDeferredRuntimeProxy(runtimeContext);

Object.assign(runtimeContext, initializeWorkflow(runtimeProxy as RuntimeContext));
Object.assign(runtimeContext, registerApiRoutes(runtimeContext as RuntimeContext));

assertRuntimeFunctionsResolved(runtimeContext, ROUTE_RUNTIME_HELPER_KEYS, "route helper wiring");

startLifecycle(runtimeContext as RuntimeContext);
