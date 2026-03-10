#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${OPS_HEALTH_ROLLBACK_LOG_DIR:-logs}"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR" 2>/dev/null || true

EVIDENCE_LOG="${OPS_HEALTH_ROLLBACK_LOG_FILE:-${LOG_DIR}/ops-health-rollback-${TIMESTAMP_UTC}.log}"
SERVER_LOG_PREFIX="${OPS_HEALTH_ROLLBACK_SERVER_LOG_PREFIX:-${LOG_DIR}/ops-health-rollback-${TIMESTAMP_UTC}}"
HOST_BIND="${OPS_HEALTH_ROLLBACK_HOST:-127.0.0.1}"
ONBOARD_PORT="${OPS_HEALTH_ROLLBACK_PORT:-8791}"
HEALTH_ENDPOINT="${OPS_HEALTH_ENDPOINT:-/healthz}"
HEALTH_WAIT_SECONDS="${OPS_HEALTH_WAIT_SECONDS:-60}"
ROLLBACK_OWNER="${OPS_ROLLBACK_OWNER:-atlas}"
read -r -a PRECHECK_PORTS <<< "${OPS_PRECHECK_PORTS:-8790 8800}"

SERVER_PID=""
SERVER_LOG_CURRENT=""
FAULT_INJECTION_EPOCH=""
ROLLBACK_RECOVERY_EPOCH=""

exec > >(tee -a "$EVIDENCE_LOG") 2>&1

print_port_listeners() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  ss -ltnp "( sport = :$port )" 2>/dev/null | sed '1d' || true
}

stop_server() {
  local reason="$1"
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "[STEP] stop_server reason=${reason} pid=${SERVER_PID}"
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  SERVER_PID=""
  if [[ "$reason" == "fault_injection" ]]; then
    FAULT_INJECTION_EPOCH="$(date -u +%s)"
    echo "[EVIDENCE] fault_injection_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  fi
}

cleanup() {
  local rc=$?
  stop_server "cleanup" || true
  local finished_at_utc
  finished_at_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[EVIDENCE] owner=${ROLLBACK_OWNER}"
  if [[ -n "${FAULT_INJECTION_EPOCH:-}" && -n "${ROLLBACK_RECOVERY_EPOCH:-}" ]]; then
    local rto_seconds=$((ROLLBACK_RECOVERY_EPOCH - FAULT_INJECTION_EPOCH))
    if [[ "$rto_seconds" -lt 0 ]]; then
      rto_seconds=0
    fi
    echo "[EVIDENCE] rto_seconds=${rto_seconds}"
  else
    echo "[EVIDENCE] rto_seconds=unknown"
  fi
  echo "[EVIDENCE] finished_at_utc=${finished_at_utc}"
  echo "[EVIDENCE] exit_code=${rc}"
  exit "$rc"
}
trap cleanup EXIT

start_server() {
  local phase="$1"
  local server_log="${SERVER_LOG_PREFIX}.${phase}.server.log"
  echo "[STEP] start_server phase=${phase} host=${HOST_BIND} port=${ONBOARD_PORT}"
  PORT="$ONBOARD_PORT" HOST="$HOST_BIND" pnpm start >"$server_log" 2>&1 &
  SERVER_PID=$!
  SERVER_LOG_CURRENT="$server_log"
  echo "[EVIDENCE] server_log_${phase}=${server_log}"
  echo "[EVIDENCE] server_pid_${phase}=${SERVER_PID}"
}

wait_for_health() {
  local phase="$1"
  local wait_seconds="$2"
  local url="http://${HOST_BIND}:${ONBOARD_PORT}${HEALTH_ENDPOINT}"
  for _ in $(seq 1 "$wait_seconds"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[PASS] health_check phase=${phase} url=${url}"
      if [[ "$phase" == "rollback" ]]; then
        ROLLBACK_RECOVERY_EPOCH="$(date -u +%s)"
        echo "[EVIDENCE] rollback_recovered_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      fi
      return 0
    fi
    if [[ -z "${SERVER_PID:-}" ]] || ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      echo "[FAIL] server exited before health check passed (phase=${phase})"
      tail -n 80 "$SERVER_LOG_CURRENT" || true
      return 1
    fi
    sleep 1
  done

  echo "[FAIL] health check timed out (phase=${phase}, timeout=${wait_seconds}s)"
  tail -n 80 "$SERVER_LOG_CURRENT" || true
  return 1
}

echo "== Ops predeploy healthcheck + rollback rehearsal =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] evidence_log=${EVIDENCE_LOG}"
echo "[EVIDENCE] host=${HOST_BIND}"
echo "[EVIDENCE] onboard_port=${ONBOARD_PORT}"
echo "[EVIDENCE] precheck_ports=${PRECHECK_PORTS[*]}"
echo "[EVIDENCE] health_endpoint=${HEALTH_ENDPOINT}"
echo "[EVIDENCE] owner=${ROLLBACK_OWNER}"

for cmd in node pnpm curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: ${cmd}"
    exit 1
  fi
done

if ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
  echo "[FAIL] Missing port inspection tool: install lsof or ss"
  exit 1
fi

for port in "${PRECHECK_PORTS[@]}"; do
  listeners="$(print_port_listeners "$port")"
  if [[ -n "$listeners" ]]; then
    echo "[FAIL] Precheck blocked: port ${port} is already in use."
    echo "$listeners"
    exit 1
  fi
  echo "[PASS] precheck port ${port} is free"
done

listeners_onboard="$(print_port_listeners "$ONBOARD_PORT")"
if [[ -n "$listeners_onboard" ]]; then
  echo "[FAIL] rehearsal blocked: onboard port ${ONBOARD_PORT} is already in use."
  echo "$listeners_onboard"
  exit 1
fi
echo "[PASS] rehearsal port ${ONBOARD_PORT} is free"

start_server "candidate"
wait_for_health "candidate" "$HEALTH_WAIT_SECONDS"

stop_server "fault_injection"
if curl -fsS "http://${HOST_BIND}:${ONBOARD_PORT}${HEALTH_ENDPOINT}" >/dev/null 2>&1; then
  echo "[FAIL] outage simulation failed: endpoint still healthy after stop"
  exit 1
fi
echo "[PASS] outage simulation confirmed (health endpoint unavailable)"

start_server "rollback"
wait_for_health "rollback" "$HEALTH_WAIT_SECONDS"

echo "[PASS] rollback rehearsal completed successfully."
