#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${OPS_DASHBOARD_LOG_DIR:-logs}"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR" 2>/dev/null || true

EVIDENCE_LOG="${OPS_DASHBOARD_EVIDENCE_LOG:-${LOG_DIR}/ops-dashboard-capture-${TIMESTAMP_UTC}.log}"
SERVER_LOG="${OPS_DASHBOARD_SERVER_LOG:-${LOG_DIR}/ops-dashboard-capture-${TIMESTAMP_UTC}.server.log}"
BASELINE_CAPTURE="${OPS_DASHBOARD_BASELINE_CAPTURE:-${LOG_DIR}/ops-dashboard-capture-baseline-${TIMESTAMP_UTC}.txt}"
POST_CAPTURE="${OPS_DASHBOARD_POST_CAPTURE:-${LOG_DIR}/ops-dashboard-capture-post-${TIMESTAMP_UTC}.txt}"
HOST_BIND="${OPS_DASHBOARD_HOST:-127.0.0.1}"
CAPTURE_PORT="${OPS_DASHBOARD_PORT:-8797}"
HEALTH_ENDPOINT="${OPS_DASHBOARD_HEALTH_ENDPOINT:-/healthz}"
SAMPLE_COUNT="${OPS_DASHBOARD_SAMPLE_COUNT:-20}"
WINDOW_LABEL="${OPS_DASHBOARD_WINDOW_LABEL:-30m}"
DELAY_SECONDS="${OPS_DASHBOARD_DELAY_SECONDS:-1800}"

SERVER_PID=""
HEALTH_URL="http://${HOST_BIND}:${CAPTURE_PORT}${HEALTH_ENDPOINT}"

exec > >(tee -a "$EVIDENCE_LOG") 2>&1

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

wait_for_health() {
  for _ in $(seq 1 60); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      echo "[PASS] health check passed url=${HEALTH_URL}"
      return 0
    fi
    if [[ -z "${SERVER_PID:-}" ]] || ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      echo "[FAIL] server exited before health check passed"
      tail -n 80 "$SERVER_LOG" || true
      return 1
    fi
    sleep 1
  done

  echo "[FAIL] health check timed out"
  tail -n 80 "$SERVER_LOG" || true
  return 1
}

capture_snapshot() {
  local phase="$1"
  local outfile="$2"
  local captured_at_utc
  captured_at_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  local samples
  samples="$(for _ in $(seq 1 "$SAMPLE_COUNT"); do
    curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' "$HEALTH_URL"
  done)"

  local error_count
  error_count="$(printf '%s\n' "$samples" | awk '$1 != 200 {c++} END {print c+0}')"

  local error_rate
  error_rate="$(awk -v e="$error_count" -v t="$SAMPLE_COUNT" 'BEGIN { if (t == 0) { print "0.0000" } else { printf "%.4f", (e/t) } }')"

  local p95_ms
  p95_ms="$(printf '%s\n' "$samples" | awk '{print $2*1000}' | sort -n | awk -v n="$SAMPLE_COUNT" '
    BEGIN { idx=int((0.95*n)+0.999999); if (idx < 1) idx = 1 }
    { a[NR]=$1 }
    END {
      if (NR == 0) {
        print "0.00"
      } else {
        if (idx > NR) idx = NR
        printf "%.2f", a[idx]
      }
    }'
  )"

  local cpu_pct rss_kb
  read -r cpu_pct rss_kb <<< "$(ps -p "$SERVER_PID" -o %cpu=,rss= | awk 'NR==1 {print $1, $2}')"
  local memory_mb
  memory_mb="$(awk -v kb="$rss_kb" 'BEGIN { printf "%.2f", kb/1024 }')"

  {
    echo "phase=${phase}"
    echo "captured_at_utc=${captured_at_utc}"
    echo "metric_window=${WINDOW_LABEL}"
    echo "sample_count=${SAMPLE_COUNT}"
    echo "error_rate=${error_rate}"
    echo "latency_p95_ms=${p95_ms}"
    echo "resource_cpu_pct=${cpu_pct}"
    echo "resource_memory_mb=${memory_mb}"
    echo "health_endpoint=${HEALTH_URL}"
    echo "dashboard_capture_type=text-export"
  } > "$outfile"

  echo "[EVIDENCE] ${phase}_capture=${outfile}"
}

echo "== Ops dashboard baseline/post comparison capture =="
echo "[EVIDENCE] started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[EVIDENCE] evidence_log=${EVIDENCE_LOG}"
echo "[EVIDENCE] server_log=${SERVER_LOG}"
echo "[EVIDENCE] host=${HOST_BIND}"
echo "[EVIDENCE] capture_port=${CAPTURE_PORT}"
echo "[EVIDENCE] metric_window=${WINDOW_LABEL}"
echo "[EVIDENCE] delay_seconds=${DELAY_SECONDS}"
echo "[EVIDENCE] sample_count=${SAMPLE_COUNT}"

for cmd in node pnpm curl awk sort ps; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: ${cmd}"
    exit 1
  fi
done

if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$CAPTURE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[FAIL] capture blocked: port ${CAPTURE_PORT} is already in use."
    lsof -nP -iTCP:"$CAPTURE_PORT" -sTCP:LISTEN || true
    exit 1
  fi
fi

echo "[STEP] start_server host=${HOST_BIND} port=${CAPTURE_PORT}"
PORT="$CAPTURE_PORT" HOST="$HOST_BIND" pnpm start >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "[EVIDENCE] server_pid=${SERVER_PID}"

wait_for_health
capture_snapshot "predeploy_baseline" "$BASELINE_CAPTURE"

if [[ "$DELAY_SECONDS" -gt 0 ]]; then
  echo "[STEP] waiting_for_post_window seconds=${DELAY_SECONDS}"
  sleep "$DELAY_SECONDS"
fi

capture_snapshot "postdeploy_compare" "$POST_CAPTURE"
echo "[PASS] dashboard baseline/post capture completed."
