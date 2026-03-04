#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ZenBill APK Build Script
# ============================================================
# Triggers EAS Build for Android production APK.
# Can be run standalone or called by post-push-deploy.sh.
#
# Usage: ./scripts/build-apk.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${PROJECT_DIR}/app"
LOG_FILE="${PROJECT_DIR}/deploy.log"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [build-apk] $1"
    echo "$msg"
    echo "$msg" >> "${LOG_FILE}"
}

# Check EAS CLI
if ! command -v eas &> /dev/null; then
    log "ERROR: eas-cli not found. Install with: npm install -g eas-cli"
    exit 1
fi

# Check logged in
if ! eas whoami &> /dev/null; then
    log "ERROR: Not logged in to EAS. Run: eas login"
    exit 1
fi

cd "${APP_DIR}"

log "Starting EAS Build (Android production)..."
log "Git SHA: $(git -C "${PROJECT_DIR}" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

if eas build --platform android --profile production --non-interactive 2>&1 | tee -a "${LOG_FILE}"; then
    log "EAS Build submitted successfully. Check Expo Dashboard for download link."
else
    log "ERROR: EAS Build failed."
    exit 1
fi
