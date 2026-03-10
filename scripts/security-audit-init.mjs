#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

function modeToOctal(mode) {
  return `0${(mode & 0o777).toString(8)}`;
}

export function resolveSecurityAuditLogPath(inputPath = "") {
  const logsDir = process.env.LOGS_DIR || path.join(process.cwd(), "logs");
  if (inputPath && inputPath.trim()) {
    return path.resolve(inputPath.trim());
  }
  return path.join(logsDir, "security-audit.ndjson");
}

export function ensureSecurityAuditLogFile(inputPath = "") {
  const targetPath = resolveSecurityAuditLogPath(inputPath);
  const targetDir = path.dirname(targetPath);

  fs.mkdirSync(targetDir, { recursive: true, mode: DIR_MODE });
  try {
    fs.chmodSync(targetDir, DIR_MODE);
  } catch {
    // chmod may fail on non-POSIX filesystems.
  }

  // Open in append mode so the file is created if missing without truncating.
  const fd = fs.openSync(targetPath, "a", FILE_MODE);
  fs.closeSync(fd);

  try {
    fs.chmodSync(targetPath, FILE_MODE);
  } catch {
    // chmod may fail on non-POSIX filesystems.
  }

  const dirStats = fs.statSync(targetDir);
  const fileStats = fs.statSync(targetPath);
  return {
    ok: true,
    path: targetPath,
    directory: targetDir,
    directory_mode: modeToOctal(dirStats.mode),
    file_mode: modeToOctal(fileStats.mode),
  };
}

function main() {
  const targetPath = process.argv[2] || "";
  try {
    const summary = ensureSecurityAuditLogFile(targetPath);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: errorMessage,
          path: resolveSecurityAuditLogPath(targetPath),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
