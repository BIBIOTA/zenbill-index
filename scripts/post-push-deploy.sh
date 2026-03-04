#!/usr/bin/env bash
# ============================================================
# ZenBill Auto-Deploy Hook
# ============================================================
# Called by pre-push git hook. Checks if pushing to master,
# then triggers deploy.sh and build-apk.sh in the background.
#
# Usage: Called from .git/hooks/pre-push (not directly)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"
BUILD_APK_SCRIPT="${SCRIPT_DIR}/build-apk.sh"
LOCK_FILE="/tmp/zenbill-deploying.lock"
LOG_FILE="${PROJECT_DIR}/deploy.log"

# pre-push hook receives lines on stdin: <local ref> <local sha> <remote ref> <remote sha>
# Check if any line is pushing to master
PUSHING_MASTER=false
while read -r local_ref local_sha remote_ref remote_sha; do
    if [[ "${remote_ref}" == "refs/heads/master" ]]; then
        PUSHING_MASTER=true
        break
    fi
done

if [[ "${PUSHING_MASTER}" != "true" ]]; then
    exit 0
fi

# Prevent concurrent deploys with lock file
if [[ -f "${LOCK_FILE}" ]]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "${LOCK_FILE}" 2>/dev/null || echo 0) ))
    if [[ ${lock_age} -lt 300 ]]; then
        echo "[deploy-hook] Deploy already in progress (lock age: ${lock_age}s). Skipping."
        exit 0
    fi
    echo "[deploy-hook] Stale lock file (${lock_age}s old). Removing."
    rm -f "${LOCK_FILE}"
fi

echo "[deploy-hook] Detected push to master. Triggering deploy + APK build in background..."
echo "[deploy-hook] Logs: ${LOG_FILE}"

# Background deploy: create lock, run deploy, remove lock
(
    touch "${LOCK_FILE}"
    "${DEPLOY_SCRIPT}"
    "${BUILD_APK_SCRIPT}" || echo "[deploy-hook] APK build failed (non-blocking)"
    rm -f "${LOCK_FILE}"
) >> "${LOG_FILE}" 2>&1 &

# Let push continue immediately
exit 0
