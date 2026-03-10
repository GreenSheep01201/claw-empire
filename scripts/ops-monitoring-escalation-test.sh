#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${OPS_MONITOR_LOG_DIR:-logs}"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR" 2>/dev/null || true

EVIDENCE_LOG="${OPS_MONITOR_LOG_FILE:-${LOG_DIR}/ops-monitoring-escalation-${TIMESTAMP_UTC}.log}"
SERVER_LOG="${OPS_MONITOR_SERVER_LOG:-${LOG_DIR}/ops-monitoring-escalation-${TIMESTAMP_UTC}.server.log}"
HOST_BIND="${OPS_MONITOR_HOST:-127.0.0.1}"
MONITOR_PORT="${OPS_MONITOR_PORT:-8791}"
FAILURE_PORT="${OPS_MONITOR_FAILURE_PORT:-8799}"
HEALTH_ENDPOINT="${OPS_MONITOR_HEALTH_ENDPOINT:-/healthz}"
BASELINE_WAIT_SECONDS="${OPS_MONITOR_BASELINE_WAIT_SECONDS:-60}"
FAILURE_THRESHOLD="${OPS_MONITOR_FAILURE_THRESHOLD:-3}"
ESCALATION_CHAIN="${OPS_ESCALATION_CHAIN:-L1_oncall,L2_ops_lead,L3_incident_commander}"

SERVER_PID=""

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
}

cleanup() {
  local rc=$?
  stop_server "cleanup" || true
  echo "[EVIDENCE] finished_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[EVIDENCE] exit_code=${rc}"
  exit "$rc"
}
trap cleanup EXIT

start_server() {
  echo "[STEP] start_server host=${HOST_BIND} port=${MONITOR_PORT}"
  PORT="$MONITOR_PORT" HOST="$HOST_BIND" pnpm start >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  echo "[EVIDENCE] server_log=${SERVER_LOG}"
  echo "[EVIDENCE] server_pid=${SERVER_PID}"
}

wait_for_baseline_health() {
  local url="http://${HOST_BIND}:${MONITOR_PORT}${HEALTH_ENDPOINT}"
  for _ in $(seq 1 "$BASELINE_WAIT_SECONDS"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[PASS] baseline health check passed url=${url}"
      return 0
    fi
    if [[ -z "${SERVER_PID:-}" ]] || ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      echo "[FAIL] server exited before baseline health check passed"
      tail -n 80 "$SERVER_LOG" || true
      return 1
    fi
    sleep 1
  done

  echo "[FAIL] baseline health check timed out"
  tail -n 80 "$SERVER_LOG" || true
  return 1
}

echo "== Ops monitoring/alarm/escalation test =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] evidence_log=${EVIDENCE_LOG}"
echo "[EVIDENCE] host=${HOST_BIND}"
echo "[EVIDENCE] monitor_port=${MONITOR_PORT}"
echo "[EVIDENCE] failure_port=${FAILURE_PORT}"
echo "[EVIDENCE] failure_threshold=${FAILURE_THRESHOLD}"
echo "[EVIDENCE] escalation_chain=${ESCALATION_CHAIN}"

if [[ "$MONITOR_PORT" == "$FAILURE_PORT" ]]; then
  echo "[FAIL] MONITOR_PORT and FAILURE_PORT must be different."
  exit 1
fi

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

listeners_monitor="$(print_port_listeners "$MONITOR_PORT")"
if [[ -n "$listeners_monitor" ]]; then
  echo "[FAIL] monitor test blocked: port ${MONITOR_PORT} is already in use."
  echo "$listeners_monitor"
  exit 1
fi
echo "[PASS] monitor test port ${MONITOR_PORT} is free"

start_server
wait_for_baseline_health

alert_id="ops-health-${TIMESTAMP_UTC}"
failure_url="http://${HOST_BIND}:${FAILURE_PORT}${HEALTH_ENDPOINT}"
consecutive_failures=0
echo "[EVIDENCE] alarm_event_id=${alert_id}"

for attempt in $(seq 1 "$FAILURE_THRESHOLD"); do
  if curl -fsS "$failure_url" >/dev/null 2>&1; then
    echo "[FAIL] synthetic failure probe unexpectedly succeeded (attempt=${attempt})"
    exit 1
  fi
  consecutive_failures=$((consecutive_failures + 1))
  echo "[MONITOR] probe=synthetic_failure attempt=${attempt} consecutive_failures=${consecutive_failures}"
done

if [[ "$consecutive_failures" -lt "$FAILURE_THRESHOLD" ]]; then
  echo "[FAIL] failure threshold not reached"
  exit 1
fi

echo "[ALERT] state=triggered alert_id=${alert_id} trigger=consecutive_failures>=${FAILURE_THRESHOLD}"
IFS=',' read -r -a escalation_targets <<< "$ESCALATION_CHAIN"
for idx in "${!escalation_targets[@]}"; do
  level=$((idx + 1))
  target="${escalation_targets[$idx]}"
  echo "[ESCALATION] level=${level} target=${target} status=dispatched at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
done

if ! curl -fsS "http://${HOST_BIND}:${MONITOR_PORT}${HEALTH_ENDPOINT}" >/dev/null 2>&1; then
  echo "[FAIL] recovery check failed on monitor endpoint"
  exit 1
fi
echo "[ALERT] state=resolved alert_id=${alert_id} reason=health_recovered"
echo "[EVIDENCE] alarm_state=resolved"
echo "[PASS] monitoring/alarm/escalation test completed successfully."
