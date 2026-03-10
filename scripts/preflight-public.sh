#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${PREFLIGHT_EVIDENCE_DIR:-logs}"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR" 2>/dev/null || true
EVIDENCE_LOG="${PREFLIGHT_EVIDENCE_LOG:-${EVIDENCE_DIR}/preflight-evidence-${TIMESTAMP_UTC}.log}"
ENV_FILE="${PREFLIGHT_ENV_FILE:-.env}"
MISSING_ENV_KEY=""
MISSING_ENV_REASON=""

exec > >(tee -a "$EVIDENCE_LOG") 2>&1

failures=0

pass() { printf '[PASS] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1"; failures=$((failures + 1)); }

on_exit() {
  local rc=$?
  echo "[EVIDENCE] finished_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[EVIDENCE] exit_code=${rc}"
  if [ -n "$MISSING_ENV_KEY" ]; then
    echo "[EVIDENCE] missing_env_key=${MISSING_ENV_KEY}"
    echo "[EVIDENCE] missing_env_reason=${MISSING_ENV_REASON}"
  fi
}
trap on_exit EXIT

required_env_vars=(
  "PORT"
  "HOST"
  "OAUTH_ENCRYPTION_SECRET"
  "SESSION_SECRET"
  "DB_PATH"
  "LOGS_DIR"
  "OAUTH_BASE_URL"
  "OAUTH_GITHUB_CLIENT_ID"
  "OAUTH_GITHUB_CLIENT_SECRET"
  "OAUTH_GOOGLE_CLIENT_ID"
  "OAUTH_GOOGLE_CLIENT_SECRET"
  "GEMINI_OAUTH_CLIENT_ID"
  "GEMINI_OAUTH_CLIENT_SECRET"
  "OPENAI_API_KEY"
  "GOOGLE_CLOUD_PROJECT"
  "GOOGLE_CLOUD_PROJECT_ID"
)

read_env_value() {
  local key="$1"
  local env_file="$2"
  awk -v k="$key" '
    BEGIN { found = 0 }
    /^[[:space:]]*#/ { next }
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      if (line !~ ("^" k "[[:space:]]*=")) next
      sub(/^[^=]*=/, "", line)
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      gsub(/^"|"$/, "", line)
      gsub(/^'\''|'\''$/, "", line)
      print line
      found = 1
      exit
    }
    END {
      if (!found) exit 1
    }
  ' "$env_file" 2>/dev/null || true
}

fail_fast_missing_env() {
  local key="$1"
  local reason="$2"
  MISSING_ENV_KEY="$key"
  MISSING_ENV_REASON="$reason"
  echo "[FAIL] Required runtime env invalid: key=${key}, reason=${reason}, file=${ENV_FILE}"
  echo "[EVIDENCE] failed_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[EVIDENCE] failed_check=runtime_env_required"
  exit 1
}

if [ ! -f "$ENV_FILE" ]; then
  MISSING_ENV_KEY="__FILE__"
  MISSING_ENV_REASON="env_file_not_found"
  echo "[FAIL] Required env file not found: ${ENV_FILE}"
  echo "[EVIDENCE] failed_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[EVIDENCE] failed_check=runtime_env_required"
  exit 1
fi

for var in "${required_env_vars[@]}"; do
  value="$(read_env_value "$var" "$ENV_FILE")"
  if [ -z "$value" ]; then
    fail_fast_missing_env "$var" "missing_or_empty"
  fi
  if [ "$value" = "__CHANGE_ME__" ]; then
    fail_fast_missing_env "$var" "placeholder_not_replaced"
  fi
done
pass "${ENV_FILE} contains required runtime values (fail-fast check)"

echo "== Claw-Empire public release preflight =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] evidence_log=${EVIDENCE_LOG}"
echo "[EVIDENCE] env_file=${ENV_FILE}"

for cmd in git rg node pnpm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Missing required command: $cmd"
  fi
done

if [ "$failures" -gt 0 ]; then
  echo
  echo "Preflight aborted due to missing dependencies."
  exit 1
fi

required_ignore_entries=(
  ".env"
  ".env.*"
  "!.env.example"
  "logs/"
  "*.sqlite"
  ".direnv/"
  "*.pem"
  "*.key"
  "*.p12"
  "*.pfx"
  "credentials.json"
  "secrets*.json"
)
for entry in "${required_ignore_entries[@]}"; do
  if ! grep -Fxq "$entry" .gitignore; then
    fail ".gitignore missing required entry: $entry"
  fi
done
if [ "$failures" -eq 0 ]; then
  pass ".gitignore contains required public-release entries"
fi

blocked_tracked=(
  ".env"
  ".env.local"
  ".env.production"
  "claw-empire.sqlite"
  "claw-empire.sqlite-shm"
  "claw-empire.sqlite-wal"
)
for path in "${blocked_tracked[@]}"; do
  if git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    fail "Sensitive runtime file is tracked: $path"
  fi
done

tracked_env_files="$(git ls-files | rg '^\.env($|\.)' | rg -v '^\.env\.example$' || true)"
if [ -n "$tracked_env_files" ]; then
  fail ".env runtime files are tracked (must remain local-only)"
  printf '%s\n' "$tracked_env_files"
else
  pass "No .env runtime files are tracked"
fi

tracked_key_files="$(git ls-files | rg '(^|/)(id_rsa|id_ed25519)$|\.(pem|key|p12|pfx|cer|crt)$|(^|/)credentials\.json$|(^|/)secrets[^/]*\.json$' || true)"
if [ -n "$tracked_key_files" ]; then
  fail "Credential/key files are tracked"
  printf '%s\n' "$tracked_key_files"
else
  pass "No credential/key files are tracked"
fi

if git ls-files | rg -q '^logs/'; then
  fail "logs/ contains tracked files"
else
  pass "No runtime logs are tracked"
fi

secret_pattern='(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----)'

working_tree_hits="$(mktemp)"
if git grep -nI -E "$secret_pattern" -- . ':(exclude).env.example' >"$working_tree_hits" 2>/dev/null; then
  fail "Potential secret pattern found in tracked working tree files"
  cat "$working_tree_hits"
else
  pass "No high-confidence secret patterns in tracked working tree files"
fi
rm -f "$working_tree_hits"

history_hits="$(mktemp)"
while IFS= read -r rev; do
  git grep -nI -E "$secret_pattern" "$rev" -- . ':(exclude).env.example' >>"$history_hits" 2>/dev/null || true
done < <(git rev-list --all)

if [ -s "$history_hits" ]; then
  fail "Potential secret pattern found in git history"
  cat "$history_hits"
else
  pass "No high-confidence secret patterns in git history"
fi
rm -f "$history_hits"

missing_env_vars=()
for var in "${required_env_vars[@]}"; do
  if ! rg -q "^[# ]*${var}=" .env.example; then
    missing_env_vars+=("$var")
  fi
done

if [ "${#missing_env_vars[@]}" -gt 0 ]; then
  fail ".env.example missing variables: ${missing_env_vars[*]}"
else
  pass ".env.example covers required runtime variables"
fi

env_placeholder="__CHANGE_ME__"
placeholder_vars=(
  "OAUTH_ENCRYPTION_SECRET"
  "SESSION_SECRET"
  "OAUTH_GITHUB_CLIENT_ID"
  "OAUTH_GITHUB_CLIENT_SECRET"
  "OAUTH_GOOGLE_CLIENT_ID"
  "OAUTH_GOOGLE_CLIENT_SECRET"
  "GEMINI_OAUTH_CLIENT_ID"
  "GEMINI_OAUTH_CLIENT_SECRET"
  "OPENAI_API_KEY"
  "GOOGLE_CLOUD_PROJECT"
  "GOOGLE_CLOUD_PROJECT_ID"
)
placeholder_mismatches=()
for var in "${placeholder_vars[@]}"; do
  if ! rg -q "^[# ]*${var}=\"${env_placeholder}\"$" .env.example; then
    placeholder_mismatches+=("$var")
  fi
done

if [ "${#placeholder_mismatches[@]}" -gt 0 ]; then
  fail ".env.example placeholder format mismatch (expected \"${env_placeholder}\"): ${placeholder_mismatches[*]}"
else
  pass ".env.example uses a consistent placeholder format for key variables"
fi

if pnpm run build >/tmp/climpire-preflight-build.log 2>&1; then
  pass "Build succeeded"
else
  fail "Build failed (see /tmp/climpire-preflight-build.log)"
  tail -n 80 /tmp/climpire-preflight-build.log || true
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "Preflight FAILED with $failures issue(s)."
  exit 1
fi

echo "Preflight PASSED. Repository is ready for final human review before public release."
