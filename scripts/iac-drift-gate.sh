#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${IAC_DRIFT_LOG_DIR:-logs}"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR" 2>/dev/null || true
LOG_FILE="${IAC_DRIFT_LOG_FILE:-${LOG_DIR}/iac-drift-gate-${TIMESTAMP_UTC}.log}"
CI_RUN_ID="${IAC_CI_RUN_ID:-local-${TIMESTAMP_UTC}}"
TERRAFORM_DIR="${IAC_TERRAFORM_DIR:-infra/terraform}"
TERRAFORM_DOCKER_IMAGE="${IAC_TERRAFORM_DOCKER_IMAGE:-hashicorp/terraform:1.10.5}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/iac-drift-gate.XXXXXX")"
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

run_terraform() {
  if command -v terraform >/dev/null 2>&1; then
    terraform "$@"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: terraform (or docker fallback)"
    return 127
  fi

  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -v "$ROOT_DIR:/workspace" \
    -w /workspace \
    "$TERRAFORM_DOCKER_IMAGE" \
    "$@"
}

echo "== Pre-deploy IaC drift gate =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] ci_run_id=${CI_RUN_ID}"
echo "[EVIDENCE] terraform_dir=${TERRAFORM_DIR}"
echo "[EVIDENCE] log_file=${LOG_FILE}"
echo "[EVIDENCE] git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
echo "[EVIDENCE] git_commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"

if [ ! -d "$TERRAFORM_DIR" ]; then
  fail "Terraform directory not found: ${TERRAFORM_DIR}"
fi
if ! compgen -G "${TERRAFORM_DIR}/*.tf" >/dev/null; then
  fail "No .tf files found in ${TERRAFORM_DIR}"
fi
if ! command -v terraform >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
  fail "Missing required runtime: terraform or docker"
fi

if [ "$failures" -gt 0 ]; then
  echo "IaC drift gate aborted because prerequisites are missing."
  exit 1
fi

echo
echo "== terraform init (backend=false) =="
if run_terraform -chdir="$TERRAFORM_DIR" init -backend=false -input=false -no-color; then
  pass "terraform init completed"
else
  fail "terraform init failed"
fi

echo
echo "== terraform plan (expect: exit 0 / no diff) =="
PLAN_LOG="${WORK_DIR}/terraform-plan.log"
set +e
run_terraform -chdir="$TERRAFORM_DIR" plan -detailed-exitcode -input=false -lock=false -refresh=false -no-color >"$PLAN_LOG" 2>&1
plan_rc=$?
set -e
cat "$PLAN_LOG"

echo "[EVIDENCE] terraform_plan_exit_code=${plan_rc}"
if [ "$plan_rc" -eq 0 ]; then
  pass "Terraform plan reports 0 diff"
elif [ "$plan_rc" -eq 2 ]; then
  fail "Terraform drift detected (non-zero diff)"
else
  fail "Terraform plan execution failed"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "IaC drift gate FAILED with ${failures} issue(s)."
  exit 1
fi

echo "IaC drift gate PASSED."
