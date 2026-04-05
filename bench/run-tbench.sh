#!/usr/bin/env bash
#
# Run Terminal-Bench 2.0 with kairos installed agent.
#
# Usage:
#   ./bench/run-tbench.sh                    # run full benchmark
#   ./bench/run-tbench.sh --n-tasks 5        # run first 5 tasks
#   ./bench/run-tbench.sh --dry-run          # just print the command
#
# Required env vars:
#   KAIROS_API_KEY    - LLM API key
#   KAIROS_BASE_URL   - LLM API base URL (OpenAI-compatible)
#   KAIROS_MODEL      - LLM model name
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── LLM config ────────────────────────────────────────────────────────────────
export KAIROS_API_KEY="${KAIROS_API_KEY:?Set KAIROS_API_KEY before running}"
export KAIROS_BASE_URL="${KAIROS_BASE_URL:-https://api.anthropic.com/v1}"
export KAIROS_MODEL="${KAIROS_MODEL:-claude-opus-4-6}"
export KAIROS_USER_AGENT="${KAIROS_USER_AGENT:-}"

# ── Harbor config ─────────────────────────────────────────────────────────────
DATASET="terminal-bench/terminal-bench-2"
AGENT_PATH="bench.kairos_agent:KairosAgent"
JOBS_DIR="${REPO_DIR}/bench/jobs"
N_CONCURRENT="${N_CONCURRENT:-4}"
TIMEOUT_MULT="${TIMEOUT_MULT:-3.0}"

# ── Parse args ────────────────────────────────────────────────────────────────
DRY_RUN=false
EXTRA_ARGS=()
for arg in "$@"; do
    if [[ "$arg" == "--dry-run" ]]; then
        DRY_RUN=true
    else
        EXTRA_ARGS+=("$arg")
    fi
done

# ── Pre-flight checks ────────────────────────────────────────────────────────
check() {
    if ! command -v "$1" &>/dev/null; then
        echo "ERROR: $1 not found. $2" >&2
        exit 1
    fi
}

check harbor "Install with: uv tool install harbor"
check docker "Docker is required for Harbor environments."

echo "[pre-flight] checking LLM..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${KAIROS_BASE_URL}/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${KAIROS_API_KEY}" \
    -H "x-api-key: ${KAIROS_API_KEY}" \
    ${KAIROS_USER_AGENT:+-H "User-Agent: ${KAIROS_USER_AGENT}"} \
    -d '{"model":"'"${KAIROS_MODEL}"'","messages":[{"role":"user","content":"hi"}],"max_tokens":5}' \
    --max-time 15 2>/dev/null || echo "000")
echo "[pre-flight] LLM HTTP $HTTP_CODE"

# ── Build command ─────────────────────────────────────────────────────────────
CMD=(
    harbor run
    -d "$DATASET"
    --agent-import-path "$AGENT_PATH"
    -n "$N_CONCURRENT"
    -o "$JOBS_DIR"
    -y
    --timeout-multiplier "$TIMEOUT_MULT"
    --override-memory-mb 2048
    --ae "KAIROS_API_KEY=${KAIROS_API_KEY}"
    --ae "KAIROS_BASE_URL=${KAIROS_BASE_URL}"
    --ae "KAIROS_MODEL=${KAIROS_MODEL}"
    --ae "KAIROS_USER_AGENT=${KAIROS_USER_AGENT}"
    "${EXTRA_ARGS[@]}"
)

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Terminal-Bench 2.0  ×  Kairos + Logos (Installed Agent)"
echo "  Model:   ${KAIROS_MODEL}"
echo "  API:     ${KAIROS_BASE_URL}"
echo "  Jobs:    ${JOBS_DIR}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Command:"
echo "  ${CMD[*]}"
echo ""

if $DRY_RUN; then
    echo "[dry-run] exiting."
    exit 0
fi

# ── Run ───────────────────────────────────────────────────────────────────────
cd "$REPO_DIR"
mkdir -p "$JOBS_DIR"

exec "${CMD[@]}"
