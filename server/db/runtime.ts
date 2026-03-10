import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DEFAULT_DB_PATH, LEGACY_DB_PATH } from "../config/runtime.ts";

export function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export const SQLITE_BUSY_TIMEOUT_MS = readNonNegativeIntEnv("SQLITE_BUSY_TIMEOUT_MS", 5000);
export const SQLITE_BUSY_RETRY_MAX_ATTEMPTS = Math.min(readNonNegativeIntEnv("SQLITE_BUSY_RETRY_MAX_ATTEMPTS", 4), 20);
export const SQLITE_BUSY_RETRY_BASE_DELAY_MS = readNonNegativeIntEnv("SQLITE_BUSY_RETRY_BASE_DELAY_MS", 40);
export const SQLITE_BUSY_RETRY_MAX_DELAY_MS = Math.max(
  SQLITE_BUSY_RETRY_BASE_DELAY_MS,
  readNonNegativeIntEnv("SQLITE_BUSY_RETRY_MAX_DELAY_MS", 400),
);
export const SQLITE_BUSY_RETRY_JITTER_MS = readNonNegativeIntEnv("SQLITE_BUSY_RETRY_JITTER_MS", 20);
export const REVIEW_FINAL_DECISION_ROUND = 3;
export const REVIEW_MAX_ROUNDS = Math.max(
  REVIEW_FINAL_DECISION_ROUND,
  Math.min(readNonNegativeIntEnv("REVIEW_MAX_ROUNDS", REVIEW_FINAL_DECISION_ROUND), 6),
);
export const REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND = Math.max(
  1,
  Math.min(readNonNegativeIntEnv("REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND", 2), 10),
);
export const REVIEW_MAX_REVISION_SIGNALS_PER_ROUND = Math.max(
  REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND,
  Math.min(readNonNegativeIntEnv("REVIEW_MAX_REVISION_SIGNALS_PER_ROUND", 6), 30),
);
export const REVIEW_MAX_MEMO_ITEMS_PER_DEPT = Math.max(
  1,
  Math.min(readNonNegativeIntEnv("REVIEW_MAX_MEMO_ITEMS_PER_DEPT", 2), 8),
);
export const REVIEW_MAX_MEMO_ITEMS_PER_ROUND = Math.max(
  REVIEW_MAX_MEMO_ITEMS_PER_DEPT,
  Math.min(readNonNegativeIntEnv("REVIEW_MAX_MEMO_ITEMS_PER_ROUND", 8), 24),
);
export const REVIEW_MAX_REMEDIATION_REQUESTS = 1;
export const IN_PROGRESS_ORPHAN_GRACE_MS = Math.max(
  30_000,
  readNonNegativeIntEnv("IN_PROGRESS_ORPHAN_GRACE_MS", 600_000),
);
export const IN_PROGRESS_ORPHAN_SWEEP_MS = Math.max(
  10_000,
  readNonNegativeIntEnv("IN_PROGRESS_ORPHAN_SWEEP_MS", 30_000),
);
export const SUBTASK_DELEGATION_SWEEP_MS = Math.max(
  5_000,
  readNonNegativeIntEnv("SUBTASK_DELEGATION_SWEEP_MS", 15_000),
);
export const CLI_OUTPUT_DEDUP_WINDOW_MS = Math.max(
  0,
  readNonNegativeIntEnv("CLI_OUTPUT_DEDUP_WINDOW_MS", 1500),
);

export function initializeDatabaseRuntime(): {
  dbPath: string;
  db: DatabaseSync;
  logsDir: string;
} {
  if (!process.env.DB_PATH && !fs.existsSync(DEFAULT_DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
    fs.renameSync(LEGACY_DB_PATH, DEFAULT_DB_PATH);
    for (const suffix of ["-wal", "-shm"]) {
      const src = LEGACY_DB_PATH + suffix;
      if (fs.existsSync(src)) fs.renameSync(src, DEFAULT_DB_PATH + suffix);
    }
    console.log("[Claw-Empire] Migrated database: climpire.sqlite -> claw-empire.sqlite");
  }

  const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  db.exec("PRAGMA foreign_keys = ON");
  console.log(
    `[Claw-Empire] SQLite write resilience: busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}ms, `
    + `retries=${SQLITE_BUSY_RETRY_MAX_ATTEMPTS}, `
    + `backoff=${SQLITE_BUSY_RETRY_BASE_DELAY_MS}-${SQLITE_BUSY_RETRY_MAX_DELAY_MS}ms, `
    + `jitter<=${SQLITE_BUSY_RETRY_JITTER_MS}ms`,
  );
  console.log(
    `[Claw-Empire] Review guardrails: max_rounds=${REVIEW_MAX_ROUNDS}, `
    + `final_round=${REVIEW_FINAL_DECISION_ROUND}, `
    + `remediation_requests=${REVIEW_MAX_REMEDIATION_REQUESTS}/task, `
    + `hold_cap=${REVIEW_MAX_REVISION_SIGNALS_PER_ROUND}/round, `
    + `hold_cap_per_dept=${REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND}, `
    + `memo_cap=${REVIEW_MAX_MEMO_ITEMS_PER_ROUND}/round, `
    + `memo_cap_per_dept=${REVIEW_MAX_MEMO_ITEMS_PER_DEPT}`,
  );
  console.log(
    `[Claw-Empire] In-progress watchdog: grace=${IN_PROGRESS_ORPHAN_GRACE_MS}ms, `
    + `sweep=${IN_PROGRESS_ORPHAN_SWEEP_MS}ms`,
  );
  console.log(
    `[Claw-Empire] Subtask delegation sweep: interval=${SUBTASK_DELEGATION_SWEEP_MS}ms`,
  );

  const logsDir = process.env.LOGS_DIR ?? path.join(process.cwd(), "logs");
  const securityAuditLogPath = path.join(logsDir, "security-audit.ndjson");
  const securityAuditFallbackLogPath = path.join(logsDir, "security-audit-fallback.ndjson");
  try {
    fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(logsDir, 0o700);
    } catch {
      // chmod may fail on non-POSIX filesystems.
    }

    for (const filePath of [securityAuditLogPath, securityAuditFallbackLogPath]) {
      const fd = fs.openSync(filePath, "a", 0o600);
      fs.closeSync(fd);
      try {
        fs.chmodSync(filePath, 0o600);
      } catch {
        // chmod may fail on non-POSIX filesystems.
      }
    }
  } catch {
    // ignore
  }

  return { dbPath, db, logsDir };
}
