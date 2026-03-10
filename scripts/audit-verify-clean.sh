#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
evidence_dir="${AUDIT_VERIFY_EVIDENCE_DIR:-logs/audit-verify-clean/${timestamp}}"
mkdir -p "$evidence_dir"

echo "== Security audit verify (clean env x3) =="
echo "Evidence directory: $evidence_dir"

for run in 1 2 3; do
  run_logs_dir="${evidence_dir}/run-${run}/logs"
  run_log_file="${evidence_dir}/run-${run}/audit-verify.log"
  mkdir -p "$run_logs_dir"

  echo "-- Run ${run}/3 --" | tee "$run_log_file"
  LOGS_DIR="$run_logs_dir" pnpm run audit:init 2>&1 | tee -a "$run_log_file"
  init_rc=${PIPESTATUS[0]}
  if [[ "$init_rc" -ne 0 ]]; then
    echo "Run ${run} init failed with exit code ${init_rc}" | tee -a "$run_log_file"
    exit "$init_rc"
  fi

  LOGS_DIR="$run_logs_dir" pnpm run audit:verify -- --allow-empty 2>&1 | tee -a "$run_log_file"
  rc=${PIPESTATUS[0]}
  if [[ "$rc" -ne 0 ]]; then
    echo "Run ${run} failed with exit code ${rc}" | tee -a "$run_log_file"
    exit "$rc"
  fi

  stat -c "dir_mode=%a file_mode=%a path=%n" "$run_logs_dir" "${run_logs_dir}/security-audit.ndjson" \
    | tee -a "$run_log_file"
done

echo "All clean-environment verification runs passed (3/3)."
