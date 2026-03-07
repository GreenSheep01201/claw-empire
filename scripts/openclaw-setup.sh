#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Claw-Empire one-click setup (macOS/Linux)

Usage:
  bash scripts/openclaw-setup.sh [--agents-path PATH] [--port PORT] [--openclaw-config PATH] [--start]

Options:
  --agents-path PATH       Custom AGENTS.md path for pnpm setup
  --port PORT              Override PORT in .env and AGENTS template injection
  --openclaw-config PATH   Path to openclaw.json (default: ~/.openclaw/openclaw.json when present)
  --start                  Start pnpm dev:local after setup
EOF
}

expand_path() {
  local input="$1"
  case "$input" in
    "~") printf '%s\n' "${HOME}" ;;
    "~/"*) printf '%s\n' "${HOME}/${input#~/}" ;;
    *) printf '%s\n' "$input" ;;
  esac
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

AGENTS_PATH=""
PORT=""
OPENCLAW_CONFIG=""
START_AFTER_SETUP="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agents-path)
      [[ $# -ge 2 ]] || { echo "Missing value for --agents-path" >&2; exit 1; }
      AGENTS_PATH="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || { echo "Missing value for --port" >&2; exit 1; }
      PORT="$2"
      shift 2
      ;;
    --openclaw-config)
      [[ $# -ge 2 ]] || { echo "Missing value for --openclaw-config" >&2; exit 1; }
      OPENCLAW_CONFIG="$2"
      shift 2
      ;;
    --start)
      START_AFTER_SETUP="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f package.json || ! -f scripts/setup.mjs ]]; then
  echo "Run this script from the Claw-Empire repository." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required. Install from https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "Node.js 22+ is required. Current: $(node -v)" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if ! command -v corepack >/dev/null 2>&1; then
    echo "pnpm is required. Install via: npm install -g pnpm" >&2
    exit 1
  fi
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@latest --activate >/dev/null 2>&1
fi

echo "[Claw-Empire] Installing dependencies..."
pnpm install

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[Claw-Empire] Created .env from .env.example"
fi

if [[ -z "${OPENCLAW_CONFIG}" ]]; then
  DEFAULT_OPENCLAW_CONFIG="$(expand_path "~/.openclaw/openclaw.json")"
  if [[ -f "${DEFAULT_OPENCLAW_CONFIG}" ]]; then
    OPENCLAW_CONFIG="${DEFAULT_OPENCLAW_CONFIG}"
  fi
else
  OPENCLAW_CONFIG="$(expand_path "${OPENCLAW_CONFIG}")"
  if [[ ! -f "${OPENCLAW_CONFIG}" ]]; then
    echo "[Claw-Empire] Warning: OPENCLAW config not found at ${OPENCLAW_CONFIG}. Keeping path for later."
  fi
fi

if [[ -n "${PORT}" ]]; then
  export CLAW_SETUP_PORT="${PORT}"
else
  unset CLAW_SETUP_PORT || true
fi

if [[ -n "${OPENCLAW_CONFIG}" ]]; then
  export CLAW_SETUP_OPENCLAW="${OPENCLAW_CONFIG}"
else
  unset CLAW_SETUP_OPENCLAW || true
fi

node <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");

const envPath = ".env";
let content = fs.readFileSync(envPath, "utf8");

function upsert(key, value) {
  const line = `${key}=${value}`;
  const active = new RegExp(`^${key}\\s*=.*$`, "m");
  const commented = new RegExp(`^#\\s*${key}\\s*=.*$`, "m");
  if (active.test(content)) {
    content = content.replace(active, line);
    return;
  }
  if (commented.test(content)) {
    content = content.replace(commented, line);
    return;
  }
  if (!content.endsWith("\n")) content += "\n";
  content += `${line}\n`;
}

function read(key) {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

const currentSecret = read("OAUTH_ENCRYPTION_SECRET");
if (!currentSecret || currentSecret === "__CHANGE_ME__") {
  const generated = crypto.randomBytes(32).toString("hex");
  upsert("OAUTH_ENCRYPTION_SECRET", `"${generated}"`);
  console.log("[Claw-Empire] Generated OAUTH_ENCRYPTION_SECRET");
}

const currentInboxSecret = read("INBOX_WEBHOOK_SECRET");
if (!currentInboxSecret || currentInboxSecret === "__CHANGE_ME__") {
  const generatedInbox = crypto.randomBytes(32).toString("hex");
  upsert("INBOX_WEBHOOK_SECRET", `"${generatedInbox}"`);
  console.log("[Claw-Empire] Generated INBOX_WEBHOOK_SECRET");
}

const port = process.env.CLAW_SETUP_PORT?.trim();
if (port) {
  upsert("PORT", port);
  console.log(`[Claw-Empire] Set PORT=${port}`);
}

const openclaw = process.env.CLAW_SETUP_OPENCLAW?.trim();
if (openclaw) {
  const normalized = openclaw.replace(/\\/g, "/");
  upsert("OPENCLAW_CONFIG", `"${normalized}"`);
  console.log(`[Claw-Empire] Set OPENCLAW_CONFIG=${normalized}`);
}

fs.writeFileSync(envPath, content, "utf8");
NODE

unset CLAW_SETUP_PORT || true
unset CLAW_SETUP_OPENCLAW || true

PORT_TO_USE="${PORT}"
if [[ -z "${PORT_TO_USE}" ]]; then
  PORT_TO_USE="$(awk -F= '/^[[:space:]]*PORT[[:space:]]*=/{gsub(/["'"'"'[:space:]]/, "", $2); print $2; exit}' .env || true)"
fi
if [[ -z "${PORT_TO_USE}" ]]; then
  PORT_TO_USE="8790"
fi

SETUP_ARGS=(--port "${PORT_TO_USE}")
if [[ -n "${AGENTS_PATH}" ]]; then
  SETUP_ARGS+=(--agents-path "${AGENTS_PATH}")
fi

echo "[Claw-Empire] Installing AGENTS.md orchestration rules..."
pnpm setup -- "${SETUP_ARGS[@]}"

echo
echo "[Claw-Empire] Setup complete."
echo "Frontend: http://127.0.0.1:8800"
echo "API:      http://127.0.0.1:${PORT_TO_USE}/healthz"

if [[ "${START_AFTER_SETUP}" == "1" ]]; then
  echo "[Claw-Empire] Starting development server..."
  exec pnpm dev:local
fi

echo "Run 'pnpm dev:local' to start."
