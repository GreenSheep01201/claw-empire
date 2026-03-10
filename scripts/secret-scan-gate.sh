#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${SECRET_SCAN_LOG_DIR:-logs}"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR" 2>/dev/null || true
LOG_FILE="${SECRET_SCAN_LOG_FILE:-${LOG_DIR}/secret-scan-gate-${TIMESTAMP_UTC}.log}"
CI_RUN_ID="${SECRET_SCAN_CI_RUN_ID:-local-${TIMESTAMP_UTC}}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/secret-scan-gate.XXXXXX")"
failures=0

cleanup() {
  local rc=$?
  echo "[EVIDENCE] finished_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[EVIDENCE] exit_code=${rc}"
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

exec > >(tee -a "$LOG_FILE") 2>&1

pass() { printf '[PASS] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1"; failures=$((failures + 1)); }

echo "== Secret leak gate (tracked files) =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] ci_run_id=${CI_RUN_ID}"
echo "[EVIDENCE] log_file=${LOG_FILE}"
echo "[EVIDENCE] git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
echo "[EVIDENCE] git_commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"

for cmd in git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Missing required command: ${cmd}"
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "Secret scan gate aborted because prerequisites are missing."
  exit 1
fi

secret_pattern='(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----)'
if git grep -nI -E "$secret_pattern" -- . ':(exclude).env.example' >"$WORK_DIR/secret-hits.txt" 2>/dev/null; then
  fail "Potential secret pattern found in tracked files"
  cat "$WORK_DIR/secret-hits.txt"
  echo "[EVIDENCE] secret_hits=$(wc -l < "$WORK_DIR/secret-hits.txt" | tr -d ' ')"
else
  pass "Secret scan passed (no high-confidence matches)"
  echo "[EVIDENCE] secret_hits=0"
fi

if [ "$failures" -gt 0 ]; then
  echo "Secret scan gate FAILED with ${failures} issue(s)."
  exit 1
fi

echo "Secret scan gate PASSED."
