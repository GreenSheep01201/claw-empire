#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const runtimeDir = path.resolve(process.cwd(), ".tmp", "e2e-runtime");
const logsDir = path.join(runtimeDir, "logs");
const dbPath = path.join(runtimeDir, "claw-empire.e2e.sqlite");
const rmOptions = { force: true, recursive: true, maxRetries: 10, retryDelay: 100 };
const nonFatalRmErrors = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EMFILE", "ENFILE"]);

function removePathSafely(target, label) {
  if (!fs.existsSync(target)) return;

  try {
    fs.chmodSync(target, 0o666);
  } catch {
    // Ignore chmod failures; rmSync retries can still succeed.
  }

  try {
    fs.rmSync(target, rmOptions);
  } catch (error) {
    if (nonFatalRmErrors.has(error?.code)) {
      console.warn(`[e2e] warn: failed to remove ${label} (${error.code}); continuing`);
      return;
    }
    throw error;
  }
}

fs.mkdirSync(runtimeDir, { recursive: true });

for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${dbPath}${suffix}`;
  removePathSafely(target, path.basename(target));
}

removePathSafely(logsDir, "logs directory");
fs.mkdirSync(logsDir, { recursive: true });

console.log(`[e2e] prepared isolated runtime`);
console.log(`[e2e] DB_PATH=${dbPath}`);
console.log(`[e2e] LOGS_DIR=${logsDir}`);
