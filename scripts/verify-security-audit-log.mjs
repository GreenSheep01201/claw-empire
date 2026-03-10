#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveSecurityAuditLogPath } from "./security-audit-init.mjs";

const CHAIN_SEED =
  (process.env.SECURITY_AUDIT_CHAIN_SEED || "").trim() || "claw-empire-security-audit-v1";
const CHAIN_KEY = process.env.SECURITY_AUDIT_CHAIN_KEY || "";
const args = process.argv.slice(2);
const normalizedArgs = args.filter((arg) => arg !== "--");
const allowEmpty =
  normalizedArgs.includes("--allow-empty") || process.env.SECURITY_AUDIT_ALLOW_EMPTY === "1";
const targetArg = normalizedArgs.find((arg) => arg !== "--allow-empty") ?? "";
const targetPath = resolveSecurityAuditLogPath(targetArg);

function canonicalizeAuditValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeAuditValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalizeAuditValue(value[key]);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.length > 8_000) {
    return `${value.slice(0, 8_000)}...[truncated:${value.length}]`;
  }
  return value;
}

function stableAuditJson(value) {
  try {
    return JSON.stringify(canonicalizeAuditValue(value));
  } catch {
    return JSON.stringify(String(value));
  }
}

function computeChainHash(prevHash, entry) {
  const hasher = createHash("sha256");
  hasher.update(CHAIN_SEED, "utf8");
  hasher.update("|", "utf8");
  hasher.update(prevHash, "utf8");
  hasher.update("|", "utf8");
  if (CHAIN_KEY) {
    hasher.update(CHAIN_KEY, "utf8");
    hasher.update("|", "utf8");
  }
  hasher.update(stableAuditJson(entry), "utf8");
  return hasher.digest("hex");
}

if (!fs.existsSync(targetPath)) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        path: targetPath,
        error: "log_file_not_found",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const raw = fs.readFileSync(targetPath, "utf8");
const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

const summary = {
  ok: true,
  path: targetPath,
  total_lines: lines.length,
  verified_lines: 0,
  invalid_json: 0,
  invalid_shape: 0,
  invalid_prev_hash: 0,
  invalid_chain_hash: 0,
  empty_log: false,
  allow_empty: allowEmpty,
  by_endpoint: {},
  by_outcome: {},
  first_created_at: null,
  last_created_at: null,
};

if (lines.length === 0) {
  summary.empty_log = true;
  if (!allowEmpty) {
    summary.ok = false;
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }
}

let expectedPrevHash = "GENESIS";

for (const line of lines) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    summary.invalid_json += 1;
    summary.ok = false;
    continue;
  }

  if (!parsed || typeof parsed !== "object") {
    summary.invalid_shape += 1;
    summary.ok = false;
    continue;
  }

  const prevHash = typeof parsed.prev_hash === "string" ? parsed.prev_hash : null;
  const chainHash = typeof parsed.chain_hash === "string" ? parsed.chain_hash : null;
  if (!prevHash || !chainHash) {
    summary.invalid_shape += 1;
    summary.ok = false;
    continue;
  }

  if (prevHash !== expectedPrevHash) {
    summary.invalid_prev_hash += 1;
    summary.ok = false;
  }

  const entry = { ...parsed };
  delete entry.prev_hash;
  delete entry.chain_hash;
  const expectedChainHash = computeChainHash(expectedPrevHash, entry);
  if (chainHash !== expectedChainHash) {
    summary.invalid_chain_hash += 1;
    summary.ok = false;
  }

  if (prevHash === expectedPrevHash && chainHash === expectedChainHash) {
    expectedPrevHash = chainHash;
    summary.verified_lines += 1;
  }

  const endpoint = typeof parsed.endpoint === "string" ? parsed.endpoint : "unknown";
  summary.by_endpoint[endpoint] = (summary.by_endpoint[endpoint] || 0) + 1;

  const outcome = typeof parsed.outcome === "string" ? parsed.outcome : "unknown";
  summary.by_outcome[outcome] = (summary.by_outcome[outcome] || 0) + 1;

  const createdAt = Number(parsed.created_at);
  if (Number.isFinite(createdAt)) {
    if (summary.first_created_at == null || createdAt < summary.first_created_at) {
      summary.first_created_at = createdAt;
    }
    if (summary.last_created_at == null || createdAt > summary.last_created_at) {
      summary.last_created_at = createdAt;
    }
  }
}

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
