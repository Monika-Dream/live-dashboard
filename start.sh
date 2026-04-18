#!/usr/bin/env bash
# Live Dashboard -- yi-jian qi-dong (macOS ben-di kai-fa)
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[ OK ]${RESET} $*"; }
die()     { echo -e "${RED}[ERR ]${RESET} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Homebrew bin path (not loaded in non-login shells)
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

echo -e "\n${BOLD}Live Dashboard -- Ben-Di Qi-Dong${RESET}\n"

# ---- Check deps ----
info "Checking deps..."
command -v bun     &>/dev/null || die "bun not found: https://bun.sh"
command -v python3 &>/dev/null || die "python3 not found"
PYTHON=python3

# ---- Generate .env if missing ----
ENV_FILE="packages/backend/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  info "First run -- generating config..."
  TOKEN=$(openssl rand -hex 16)
  HASH_SECRET=$(openssl rand -hex 32)
  DEVICE_ID="my-mac"
  DEVICE_NAME="My Mac"

  printf '# token:device_id:device_name:platform\nDEVICE_TOKEN_1=%s:%s:%s:macos\n\n# HMAC key\nHASH_SECRET=%s\n' \
    "${TOKEN}" "${DEVICE_ID}" "${DEVICE_NAME}" "${HASH_SECRET}" > "${ENV_FILE}"

  success "Generated ${ENV_FILE} (token: ${TOKEN})"
else
  success "${ENV_FILE} exists, skipping"
fi

# ---- Read token for agent config ----
TOKEN=$(grep '^DEVICE_TOKEN_1=' "${ENV_FILE}" | head -1 | cut -d= -f2 | cut -d: -f1)
[[ -z "${TOKEN}" ]] && die "Cannot read DEVICE_TOKEN_1 from ${ENV_FILE}"

# ---- Generate agent config.json if missing ----
AGENT_CONFIG="agents/macos/config.json"
if [[ ! -f "${AGENT_CONFIG}" ]]; then
  printf '{\n  "server_url": "http://localhost:3000",\n  "token": "%s",\n  "interval_seconds": 5,\n  "heartbeat_seconds": 60\n}\n' \
    "${TOKEN}" > "${AGENT_CONFIG}"
  success "Generated ${AGENT_CONFIG}"
else
  success "${AGENT_CONFIG} exists, skipping"
fi

# ---- Install backend deps ----
info "Installing backend deps..."
(cd packages/backend && bun install 2>&1 | tail -3)
success "Backend deps ready"

# ---- Install frontend deps ----
info "Installing frontend deps..."
(cd packages/frontend && bun install 2>&1 | tail -3)
success "Frontend deps ready"

# ---- Build frontend if needed ----
PUBLIC_DIR="packages/backend/public"
if [[ ! -d "${PUBLIC_DIR}" ]] || [[ -z "$(ls -A "${PUBLIC_DIR}" 2>/dev/null)" ]]; then
  info "Building frontend (first time, ~1 min)..."
  (cd packages/frontend && bun run build 2>&1 | tail -5)
  mkdir -p "${PUBLIC_DIR}"
  cp -r packages/frontend/out/. "${PUBLIC_DIR}/"
  success "Frontend built"
else
  success "Frontend already built, skipping"
fi

# ---- Install Python deps (venv) ----
info "Checking Python deps..."
VENV_DIR="agents/macos/.venv"
if [[ ! -d "${VENV_DIR}" ]]; then
  info "Creating Python venv..."
  ${PYTHON} -m venv "${VENV_DIR}"
fi
PYTHON="${VENV_DIR}/bin/python"
if ! "${PYTHON}" -c "import psutil, requests" &>/dev/null; then
  info "Installing psutil / requests..."
  "${PYTHON}" -m pip install -q -r agents/macos/requirements.txt
fi
success "Python deps ready"

# ---- Start backend ----
echo ""
info "Starting backend..."
(cd packages/backend && bun run src/index.ts) &
BACKEND_PID=$!

for i in $(seq 1 20); do
  sleep 0.5
  if curl -sf http://localhost:3000/api/health &>/dev/null; then
    success "Backend ready --> http://localhost:3000"
    break
  fi
  if [[ ${i} -eq 20 ]]; then
    die "Backend failed to start"
  fi
done

# ---- Start macOS Agent ----
info "Starting macOS Agent..."
echo -e "${YELLOW}[HINT]${RESET} First run may prompt Accessibility permission -- allow in System Settings"
${PYTHON} agents/macos/agent.py &
AGENT_PID=$!
success "Agent started (PID: ${AGENT_PID})"

# ---- Open browser ----
sleep 1
open "http://localhost:3000" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}All started!${RESET}"
echo -e "  Dashboard --> ${BLUE}http://localhost:3000${RESET}"
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop\n"

# ---- Graceful shutdown ----
cleanup() {
  echo ""
  info "Shutting down..."
  kill "${BACKEND_PID}" 2>/dev/null || true
  kill "${AGENT_PID}"   2>/dev/null || true
  wait "${BACKEND_PID}" "${AGENT_PID}" 2>/dev/null || true
  success "Stopped"
  exit 0
}
trap cleanup INT TERM

wait "${BACKEND_PID}"
