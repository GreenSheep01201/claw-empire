#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

umask 077
mkdir -p logs
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_LOG="${ONBOARD_VERIFY_LOG:-logs/onboard-verify-${TIMESTAMP}.log}"
SERVER_LOG="${EVIDENCE_LOG%.log}.server.log"
ONBOARD_PORT=8791
PRECHECK_PORTS=(8790 8800)

exec > >(tee -a "$EVIDENCE_LOG") 2>&1

echo "== Claw-Empire onboard verification =="
echo "started_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "evidence_log=${EVIDENCE_LOG}"
echo "server_log=${SERVER_LOG}"
echo "onboard_port=${ONBOARD_PORT}"
echo "precheck_ports=${PRECHECK_PORTS[*]}"

for cmd in node pnpm curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: $cmd"
    exit 1
  fi
done

if ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
  echo "[FAIL] Missing port inspection tool: install lsof or ss"
  exit 1
fi

print_port_listeners() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  ss -ltnp "( sport = :$port )" 2>/dev/null | sed '1d' || true
}

for port in "${PRECHECK_PORTS[@]}"; do
  listeners="$(print_port_listeners "$port")"
  if [[ -n "$listeners" ]]; then
    echo "[FAIL] Precheck blocked: port ${port} is already in use."
    echo "$listeners"
    exit 1
  fi
  echo "[PASS] Precheck clear: port ${port} is free."
done

listeners_8791="$(print_port_listeners "$ONBOARD_PORT")"
if [[ -n "$listeners_8791" ]]; then
  echo "[FAIL] Onboard verification port ${ONBOARD_PORT} is already in use."
  echo "$listeners_8791"
  exit 1
fi
echo "[PASS] Onboard verification port ${ONBOARD_PORT} is free."

cleanup() {
  local rc=$?
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  echo "finished_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "exit_code=${rc}"
  exit "$rc"
}
trap cleanup EXIT

echo "Starting API server on 127.0.0.1:${ONBOARD_PORT} ..."
PORT="$ONBOARD_PORT" HOST="127.0.0.1" pnpm start >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${ONBOARD_PORT}/healthz" >/dev/null 2>&1; then
    echo "[PASS] Health check succeeded on port ${ONBOARD_PORT}."
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "[FAIL] API process exited before health check succeeded."
    tail -n 80 "$SERVER_LOG" || true
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${ONBOARD_PORT}/healthz" >/dev/null 2>&1; then
  echo "[FAIL] Health check timed out on port ${ONBOARD_PORT}."
  tail -n 80 "$SERVER_LOG" || true
  exit 1
fi

echo "Running security audit verification..."
pnpm run audit:verify

echo "[PASS] Onboard verification completed successfully."
