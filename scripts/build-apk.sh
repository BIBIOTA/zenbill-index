#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ZenBill APK Build Script (Local Gradle Build)
# ============================================================
# Builds Android APK locally using Gradle and uploads to
# GitHub Release. Replaces the previous EAS cloud build.
#
# Flow:
#   1. Pre-flight checks (ANDROID_HOME, gh CLI, auth)
#   2. Parse version from latest git tag (vX.Y.Z)
#   3. Update app.json with version
#   4. expo prebuild --platform android --clean
#   5. Inject signing config into build.gradle
#   6. ./gradlew assembleRelease
#   7. Upload APK to GitHub Release
#   8. Restore app.json
#
# Usage: ./scripts/build-apk.sh
# ============================================================

# Source shell profile to ensure ANDROID_HOME and other env vars are set
# (important when invoked from git hooks where env may be minimal)
if [[ -f "${HOME}/.zshrc" ]]; then
    source "${HOME}/.zshrc" 2>/dev/null || true
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${PROJECT_DIR}/app"
LOG_FILE="${PROJECT_DIR}/deploy.log"
REPO="BIBIOTA/zenbill-index"
API_URL="https://zenapi.bibiota.com/api/v1"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [build-apk] $1"
    echo "$msg"
    echo "$msg" >> "${LOG_FILE}"
}

cleanup() {
    log "Restoring app.json..."
    git -C "${APP_DIR}" checkout -- app.json 2>/dev/null || true
}

# ============================================================
# Phase 1: Pre-flight checks
# ============================================================

log "=== Starting local APK build ==="
log "Git SHA: $(git -C "${PROJECT_DIR}" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

# ANDROID_HOME check with fallback
if [[ -z "${ANDROID_HOME:-}" ]]; then
    if [[ -d "${HOME}/Library/Android/sdk" ]]; then
        export ANDROID_HOME="${HOME}/Library/Android/sdk"
        log "ANDROID_HOME not set, using fallback: ${ANDROID_HOME}"
    else
        log "ERROR: ANDROID_HOME is not set and ~/Library/Android/sdk not found."
        exit 1
    fi
fi
log "ANDROID_HOME: ${ANDROID_HOME}"

# gh CLI check
if ! command -v gh &>/dev/null; then
    log "ERROR: gh CLI not found. Install with: brew install gh"
    exit 1
fi

# gh auth check
if ! gh auth status &>/dev/null; then
    log "ERROR: gh CLI not authenticated. Run: gh auth login"
    exit 1
fi
log "Pre-flight checks passed."

# ============================================================
# Phase 2: Determine version
# ============================================================

cd "${PROJECT_DIR}"

# Try to get version from latest git tag (format: vMAJOR.MINOR.PATCH)
LATEST_TAG=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || true)

if [[ -n "${LATEST_TAG}" ]]; then
    VERSION="${LATEST_TAG#v}"
    # Parse major.minor.patch for versionCode
    IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "${VERSION}"
    VERSION_CODE=$(( V_MAJOR * 10000 + V_MINOR * 100 + V_PATCH ))
    log "Version from git tag: ${VERSION} (code: ${VERSION_CODE}, tag: ${LATEST_TAG})"
else
    # Fallback: read version from app.json and compute versionCode
    VERSION=$(node -e "console.log(require('./app/app.json').expo.version)")
    IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "${VERSION}"
    VERSION_CODE=$(( V_MAJOR * 10000 + V_MINOR * 100 + V_PATCH ))
    LATEST_TAG="v${VERSION}"
    log "No git tag found. Using app.json version: ${VERSION} (code: ${VERSION_CODE})"
fi

APK_NAME="zenbill-v${VERSION}.apk"
log "Will produce: ${APK_NAME}"

# ============================================================
# Phase 3: Update app.json with version
# ============================================================

# Set trap to restore app.json on exit (success or failure)
trap cleanup EXIT

cd "${APP_DIR}"

VERSION="${VERSION}" VERSION_CODE="${VERSION_CODE}" node -e "
const fs = require('fs');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
appJson.expo.version = process.env.VERSION;
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.versionCode = parseInt(process.env.VERSION_CODE, 10);
fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2) + '\n');
console.log('app.json updated: version=' + process.env.VERSION + ', versionCode=' + process.env.VERSION_CODE);
"
log "app.json updated with version ${VERSION} (code: ${VERSION_CODE})"

# ============================================================
# Phase 4: Expo prebuild
# ============================================================

log "Running expo prebuild (clean)..."
if EXPO_PUBLIC_API_BASE_URL="${API_URL}" npx expo prebuild --platform android --clean 2>&1 | tee -a "${LOG_FILE}"; then
    log "Expo prebuild completed."
else
    log "ERROR: Expo prebuild failed."
    exit 1
fi

# ============================================================
# Phase 5: Inject signing config into build.gradle
# ============================================================

GRADLE_FILE="${APP_DIR}/android/app/build.gradle"

if [[ ! -f "${GRADLE_FILE}" ]]; then
    log "ERROR: build.gradle not found at ${GRADLE_FILE}"
    exit 1
fi

log "Injecting signing config into build.gradle..."

node -e "
const fs = require('fs');
let content = fs.readFileSync('${GRADLE_FILE}', 'utf8');

// Add signingConfigs block before buildTypes (with hasProperty guard)
const signingConfig = \`
    signingConfigs {
        release {
            if (project.hasProperty('ZENBILL_RELEASE_STORE_FILE')) {
                storeFile file(project.property('ZENBILL_RELEASE_STORE_FILE'))
                storePassword project.property('ZENBILL_RELEASE_STORE_PASSWORD')
                keyAlias project.property('ZENBILL_RELEASE_KEY_ALIAS')
                keyPassword project.property('ZENBILL_RELEASE_KEY_PASSWORD')
            }
        }
    }
\`;

// Insert signingConfigs before buildTypes
content = content.replace(
    /(\s+)(buildTypes\s*\{)/,
    signingConfig + '\n\$1\$2'
);

// Add signingConfig reference inside release buildType
content = content.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{)/,
    '\$1\n            signingConfig signingConfigs.release'
);

fs.writeFileSync('${GRADLE_FILE}', content);
console.log('Signing config injected successfully.');
"

log "Signing config injected."

# ============================================================
# Phase 6: Gradle build
# ============================================================

cd "${APP_DIR}/android"

log "Running Gradle assembleRelease..."
if ./gradlew assembleRelease 2>&1 | tee -a "${LOG_FILE}"; then
    log "Gradle build completed."
else
    log "ERROR: Gradle assembleRelease failed."
    exit 1
fi

# ============================================================
# Phase 7: Copy and rename APK
# ============================================================

APK_SOURCE="${APP_DIR}/android/app/build/outputs/apk/release/app-release.apk"

if [[ ! -f "${APK_SOURCE}" ]]; then
    log "ERROR: APK not found at ${APK_SOURCE}"
    exit 1
fi

APK_DEST="${PROJECT_DIR}/${APK_NAME}"
cp "${APK_SOURCE}" "${APK_DEST}"
log "APK copied to: ${APK_DEST}"

# ============================================================
# Phase 8: Upload to GitHub Release
# ============================================================

cd "${PROJECT_DIR}"

log "Uploading ${APK_NAME} to GitHub Release ${LATEST_TAG}..."

# Check if release already exists for this tag
if gh release view "${LATEST_TAG}" --repo "${REPO}" &>/dev/null; then
    # Release exists: upload (overwrite if APK already attached)
    log "Release ${LATEST_TAG} exists. Uploading APK with --clobber..."
    if gh release upload "${LATEST_TAG}" "${APK_DEST}" --repo "${REPO}" --clobber 2>&1 | tee -a "${LOG_FILE}"; then
        log "APK uploaded to existing release ${LATEST_TAG}."
    else
        log "ERROR: Failed to upload APK to release."
        exit 1
    fi
else
    # Create new release with APK
    log "Creating new release ${LATEST_TAG}..."
    if gh release create "${LATEST_TAG}" "${APK_DEST}" \
        --repo "${REPO}" \
        --title "ZenBill ${LATEST_TAG}" \
        --notes "ZenBill ${VERSION} release" \
        2>&1 | tee -a "${LOG_FILE}"; then
        log "Release ${LATEST_TAG} created with APK."
    else
        log "ERROR: Failed to create release."
        exit 1
    fi
fi

# Clean up the copied APK from project root
rm -f "${APK_DEST}"
log "Cleaned up ${APK_DEST}"

log "=== APK build and upload complete ==="
log "Version: ${VERSION}"
log "Tag: ${LATEST_TAG}"
log "Release: https://github.com/${REPO}/releases/tag/${LATEST_TAG}"
