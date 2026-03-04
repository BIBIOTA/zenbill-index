# Push Master Auto-Build APK Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically trigger an EAS Build (Android APK) when pushing to master, with the production API URL baked in.

**Architecture:** A standalone `scripts/build-apk.sh` script runs `eas build` for Android production. The existing `post-push-deploy.sh` hook calls it alongside `deploy.sh`. The `eas.json` production profile injects the production API URL as an env var.

**Tech Stack:** Bash, EAS CLI, Expo

---

### Task 1: Configure production API URL in eas.json

**Files:**
- Modify: `app/eas.json`

**Step 1: Update eas.json production profile**

Add the `env` block to the `production` build profile so EAS Build injects the production API URL:

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://zenapi.bibiota.com/api/v1"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

**Why this works:** `app/lib/init.ts:5` reads `process.env.EXPO_PUBLIC_API_BASE_URL`. EAS Build sets env vars from the profile's `env` block during the cloud build. The `localhost → 10.0.2.2` replacement in `init.ts:7` won't fire because the production URL doesn't contain "localhost".

**Step 2: Verify dev still works**

Run: `cd app && grep EXPO_PUBLIC .env.development`
Expected: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8090/api/v1` (unchanged)

**Step 3: Commit**

```bash
git add app/eas.json
git commit -m "feat(app): add production API URL to eas.json build profile"
```

---

### Task 2: Create build-apk.sh script

**Files:**
- Create: `scripts/build-apk.sh`

**Step 1: Write the script**

```bash
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
```

**Step 2: Make it executable**

Run: `chmod +x scripts/build-apk.sh`

**Step 3: Verify syntax**

Run: `bash -n scripts/build-apk.sh`
Expected: No output (no syntax errors)

**Step 4: Commit**

```bash
git add scripts/build-apk.sh
git commit -m "feat: add standalone APK build script using EAS Build"
```

---

### Task 3: Integrate build-apk.sh into post-push-deploy.sh

**Files:**
- Modify: `scripts/post-push-deploy.sh`

**Step 1: Add BUILD_APK_SCRIPT variable and call it**

The full updated file should be:

```bash
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

# Background deploy: create lock, run deploy + APK build, remove lock
(
    touch "${LOCK_FILE}"
    "${DEPLOY_SCRIPT}"
    "${BUILD_APK_SCRIPT}" || echo "[deploy-hook] APK build failed (non-blocking)"
    rm -f "${LOCK_FILE}"
) >> "${LOG_FILE}" 2>&1 &

# Let push continue immediately
exit 0
```

**Key change:** The APK build uses `|| echo ...` so that a build failure doesn't prevent the lock file cleanup. Backend deploy is the critical path; APK build is best-effort.

**Step 2: Verify syntax**

Run: `bash -n scripts/post-push-deploy.sh`
Expected: No output (no syntax errors)

**Step 3: Commit**

```bash
git add scripts/post-push-deploy.sh
git commit -m "feat: trigger APK build alongside backend deploy on push to master"
```

---

### Task 4: Update install-deploy-hooks.sh for monorepo root

**Files:**
- Modify: `scripts/install-deploy-hooks.sh`

**Step 1: Add monorepo root to REPOS array**

Change the REPOS array from:

```bash
REPOS=(
    "${PROJECT_DIR}/backend"
    "${PROJECT_DIR}/frontend"
)
```

To:

```bash
REPOS=(
    "${PROJECT_DIR}"
    "${PROJECT_DIR}/backend"
    "${PROJECT_DIR}/frontend"
)
```

**Step 2: Verify syntax**

Run: `bash -n scripts/install-deploy-hooks.sh`
Expected: No output

**Step 3: Commit**

```bash
git add scripts/install-deploy-hooks.sh
git commit -m "feat: install deploy hook on monorepo root for push-to-master detection"
```

---

### Task 5: Install hook and verify end-to-end

**Step 1: Install the hook**

Run: `./scripts/install-deploy-hooks.sh`
Expected: `[done] Installed pre-push hook for zen-bill/` (root repo)

**Step 2: Verify hook is installed**

Run: `cat .git/hooks/pre-push`
Expected: Shows the hook script that exec's `post-push-deploy.sh`

**Step 3: Dry-run test (optional)**

To test without actually pushing, verify the script chain manually:

```bash
# Test build-apk.sh finds eas CLI
which eas

# Test build-apk.sh syntax
bash -n scripts/build-apk.sh

# Test post-push-deploy.sh syntax
bash -n scripts/post-push-deploy.sh
```

**Step 4: Final commit with all changes**

If any files weren't committed in prior tasks:

```bash
git status
# Verify everything is committed
```
