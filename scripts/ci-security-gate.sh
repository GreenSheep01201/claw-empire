#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${CI_SECURITY_LOG_DIR:-logs}"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR" 2>/dev/null || true
LOG_FILE="${CI_SECURITY_LOG_FILE:-${LOG_DIR}/ci-security-gate-${TIMESTAMP_UTC}.log}"
CI_RUN_ID="${CI_SECURITY_RUN_ID:-local-${TIMESTAMP_UTC}}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ci-security-gate.XXXXXX")"
DEPENDENCY_AUDIT_LEVEL="${DEPENDENCY_AUDIT_LEVEL:-high}"
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

echo "== CI Security Gate (SAST / Dependency / Secret) =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] ci_run_id=${CI_RUN_ID}"
echo "[EVIDENCE] log_file=${LOG_FILE}"
echo "[EVIDENCE] git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
echo "[EVIDENCE] git_commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"

for cmd in git rg node pnpm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Missing required command: ${cmd}"
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "Security gate aborted because prerequisites are missing."
  exit 1
fi

echo
echo "== [SAST] Baseline static pattern scan =="
mapfile -t scan_files < <(git ls-files "*.ts" "*.tsx" "*.js" "*.mjs" "*.cjs" "*.sh")
if [ "${#scan_files[@]}" -eq 0 ]; then
  fail "No source files found for SAST baseline scan"
else
  if rg -n -H \
    -e '\beval\s*\(' \
    -e 'new Function\s*\(' \
    -e 'child_process\.(exec|execSync|spawn|spawnSync)\s*\(' \
    -e 'dangerouslySetInnerHTML' \
    "${scan_files[@]}" >"$WORK_DIR/sast-baseline-hits.txt"; then
    fail "SAST baseline found potential risk patterns (review required)"
    cat "$WORK_DIR/sast-baseline-hits.txt"
  else
    pass "SAST baseline scan passed"
  fi
fi

echo
echo "== [Dependency] pnpm audit =="
if pnpm audit --audit-level "$DEPENDENCY_AUDIT_LEVEL" >"$WORK_DIR/dependency-audit.log" 2>&1; then
  pass "Dependency audit passed (level=${DEPENDENCY_AUDIT_LEVEL})"
else
  fail "Dependency audit failed (level=${DEPENDENCY_AUDIT_LEVEL})"
  tail -n 120 "$WORK_DIR/dependency-audit.log" || true
fi

echo
echo "== [Secret] High-confidence secret pattern scan =="
secret_pattern='(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----)'
if git grep -nI -E "$secret_pattern" -- . ':(exclude).env.example' >"$WORK_DIR/secret-hits.txt" 2>/dev/null; then
  fail "Potential secret pattern found in tracked files"
  cat "$WORK_DIR/secret-hits.txt"
else
  pass "Secret scan passed (no high-confidence matches)"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "CI security gate FAILED with ${failures} issue(s)."
  exit 1
fi

echo "CI security gate PASSED."
