#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/image-vuln-gate.sh <image-ref-or-image-tar>"
  echo "Example: bash scripts/image-vuln-gate.sh ghcr.io/acme/claw-empire:latest"
  echo "Example: bash scripts/image-vuln-gate.sh logs/candidate-image.tar"
  exit 1
fi

SCAN_TARGET="$1"
IMAGE_REF="${IMAGE_VULN_IMAGE_REF:-$SCAN_TARGET}"
MAX_CRITICAL="${IMAGE_VULN_MAX_CRITICAL:-0}"
MAX_HIGH="${IMAGE_VULN_MAX_HIGH:-0}"
REPORT_DIR="${IMAGE_VULN_REPORT_DIR:-logs}"
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${IMAGE_VULN_LOG_FILE:-${REPORT_DIR}/image-vuln-gate-${TIMESTAMP_UTC}.log}"
REPORT_FILE="${IMAGE_VULN_REPORT_FILE:-${REPORT_DIR}/trivy-image-report-${TIMESTAMP_UTC}.json}"
SBOM_FILE="${IMAGE_VULN_SBOM_FILE:-${REPORT_DIR}/trivy-image-sbom-${TIMESTAMP_UTC}.cdx.json}"
CI_RUN_ID="${IMAGE_VULN_CI_RUN_ID:-local-${TIMESTAMP_UTC}}"
TRIVY_DOCKER_IMAGE="${TRIVY_DOCKER_IMAGE:-aquasec/trivy:0.57.1}"
TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR:-${REPORT_DIR}/.trivy-cache}"

if [[ "$TRIVY_CACHE_DIR" != /* ]]; then
  TRIVY_CACHE_DIR="${ROOT_DIR}/${TRIVY_CACHE_DIR}"
fi

command -v node >/dev/null 2>&1 || {
  echo "[FAIL] Missing required command: node"
  exit 1
}

scan_args=(image)
if [ -f "$SCAN_TARGET" ]; then
  scan_args+=(--input "$SCAN_TARGET")
else
  scan_args+=("$SCAN_TARGET")
fi

umask 077
mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR" 2>/dev/null || true
mkdir -p "$TRIVY_CACHE_DIR"
chmod 700 "$TRIVY_CACHE_DIR" 2>/dev/null || true

cleanup() {
  local rc=$?
  echo "[EVIDENCE] finished_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[EVIDENCE] exit_code=${rc}"
}
trap cleanup EXIT

exec > >(tee -a "$LOG_FILE") 2>&1

run_trivy() {
  if command -v trivy >/dev/null 2>&1; then
    trivy "$@"
    return
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: trivy (or docker fallback)"
    exit 1
  fi

  local -a docker_args=(
    run --rm
    --user "$(id -u):$(id -g)"
    -e HOME=/tmp
    -v "$ROOT_DIR:/workspace"
    -w /workspace
    -v "$TRIVY_CACHE_DIR:/tmp/trivy-cache"
    -e TRIVY_CACHE_DIR=/tmp/trivy-cache
  )
  if [ -S /var/run/docker.sock ]; then
    docker_args+=(-v /var/run/docker.sock:/var/run/docker.sock)
  fi
  docker "${docker_args[@]}" "$TRIVY_DOCKER_IMAGE" "$@"
}

echo "== Pre-deploy image vulnerability scan =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] ci_run_id=${CI_RUN_ID}"
echo "[EVIDENCE] image_ref=${IMAGE_REF}"
echo "[EVIDENCE] scan_target=${SCAN_TARGET}"
echo "[EVIDENCE] log_file=${LOG_FILE}"
echo "[EVIDENCE] report_file=${REPORT_FILE}"
echo "[EVIDENCE] sbom_file=${SBOM_FILE}"
echo "[EVIDENCE] threshold_critical=${MAX_CRITICAL}"
echo "[EVIDENCE] threshold_high=${MAX_HIGH}"

run_trivy "${scan_args[@]}" \
  --scanners vuln \
  --severity CRITICAL,HIGH,MEDIUM,LOW \
  --ignore-unfixed \
  --format json \
  --output "$REPORT_FILE" \
  >/dev/null

run_trivy "${scan_args[@]}" \
  --format cyclonedx \
  --output "$SBOM_FILE" \
  >/dev/null

IMAGE_VULN_MAX_CRITICAL="$MAX_CRITICAL" \
IMAGE_VULN_MAX_HIGH="$MAX_HIGH" \
node scripts/enforce-image-vuln-threshold.mjs "$REPORT_FILE" "$IMAGE_REF" "$SBOM_FILE"

echo "[PASS] Image vulnerability gate passed."
