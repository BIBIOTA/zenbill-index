#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ZenBill Production Deploy Script
# ============================================================
# Usage: ./scripts/deploy.sh
#
# Steps:
#   1. Build production Docker images
#   2. Run database migration on zenbill_prod
#   3. Restart production services
#   4. Health check
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${PROJECT_DIR}/backend"
COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
LOG_FILE="${PROJECT_DIR}/deploy.log"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "${LOG_FILE}"
}

cd "${BACKEND_DIR}"

log "=== ZenBill Production Deploy ==="
log "Project: ${PROJECT_DIR}"
log "Git SHA: $(git -C "${PROJECT_DIR}" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

# Step 1: Build
log "[1/4] Building production images..."
if ! ${COMPOSE_CMD} build 2>&1 | tee -a "${LOG_FILE}"; then
    log "ERROR: Build failed. Aborting deploy."
    exit 1
fi

# Step 2: Migrate
log "[2/4] Running database migration on zenbill_prod..."
if ! ${COMPOSE_CMD} run --rm api-prod /app/migrate 2>&1 | tee -a "${LOG_FILE}"; then
    log "ERROR: Migration failed. Aborting deploy — services NOT restarted."
    exit 1
fi

# Step 3: Restart services
log "[3/4] Restarting production services..."
${COMPOSE_CMD} up -d 2>&1 | tee -a "${LOG_FILE}"

# Step 4: Health check (wait up to 30 seconds)
log "[4/4] Health check..."
MAX_RETRIES=6
RETRY_INTERVAL=5
for i in $(seq 1 ${MAX_RETRIES}); do
    if curl -sf http://127.0.0.1:8091/health > /dev/null 2>&1; then
        log "Health check passed."
        log "=== Deploy complete ==="
        exit 0
    fi
    log "  Waiting for API... (${i}/${MAX_RETRIES})"
    sleep ${RETRY_INTERVAL}
done

log "WARNING: Health check failed after $((MAX_RETRIES * RETRY_INTERVAL))s. Services may still be starting."
log "  Check: ${COMPOSE_CMD} logs api-prod"
log "=== Deploy finished with warnings ==="
exit 0
