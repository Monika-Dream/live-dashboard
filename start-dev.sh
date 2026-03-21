#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/sugar/.codex/worktrees/b8ee/live-dashboard"
REAL_ROOT="/Users/sugar/Desktop/live-dashboard"
BACKEND_DIR="${ROOT}/packages/backend"
FRONTEND_DIR="${ROOT}/packages/frontend"
AGENT_DIR="${REAL_ROOT}/agents/macos"
DB_PATH="${REAL_ROOT}/packages/backend/live-dashboard.db"

HASH_SECRET="${HASH_SECRET:-c641699991ef9392cdf812e0c9e38210d6c12e639054f33b2a90ccd3fa21df4e}"
DEVICE_TOKEN_1="${DEVICE_TOKEN_1:-2751776e2888f0c93f6751cd616d23ec:my-mac:My Mac:macos}"

cleanup() {
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" "${AGENT_PID:-}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

cd "${ROOT}"

pkill -f "packages/backend/src/index.ts" 2>/dev/null || true
pkill -f "next dev --turbopack" 2>/dev/null || true
pkill -f "agents/macos/agent.py" 2>/dev/null || true
pkill -f "python3 agent.py" 2>/dev/null || true

if [ -d "${FRONTEND_DIR}/.next" ]; then
  mv "${FRONTEND_DIR}/.next" "${FRONTEND_DIR}/.next.bak.$(date +%s)" 2>/dev/null || true
fi

cd "${BACKEND_DIR}"
HASH_SECRET="${HASH_SECRET}" DEVICE_TOKEN_1="${DEVICE_TOKEN_1}" DB_PATH="${DB_PATH}" bun run src/index.ts &
BACKEND_PID=$!

for _ in $(seq 1 20); do
  sleep 0.5
  if curl -sf http://localhost:3000/api/health >/dev/null; then
    break
  fi
done

cd "${AGENT_DIR}"
python3 agent.py &
AGENT_PID=$!

cd "${FRONTEND_DIR}"
NEXT_PUBLIC_API_BASE="http://localhost:3000" PORT=3001 bun run dev &
FRONTEND_PID=$!

echo "Frontend: http://localhost:3001"
echo "Backend:  http://localhost:3000"
echo "Press Ctrl+C to stop."

wait "${FRONTEND_PID}"
