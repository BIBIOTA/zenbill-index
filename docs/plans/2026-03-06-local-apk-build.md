# Local APK Build + GitHub Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace EAS cloud build with local Gradle build, auto-upload APK to GitHub Release on push to master.

**Architecture:** `expo prebuild` generates native Android project, Gradle builds signed APK, `gh` CLI uploads to GitHub Release. Version driven by git tags. Triggered by existing pre-push hook.

**Tech Stack:** Expo SDK 55, Gradle, Android SDK 36.1, gh CLI, bash

---

### Task 1: Setup Keystore for APK Signing

**Files:**
- Create: `app/android/keystores/` (directory, gitignored)
- Modify: `app/.gitignore` (already ignores `*.jks`, verify `keystores/` covered)

**Step 1: Generate a release keystore**

Run:
```bash
mkdir -p /Users/yuki/projects/zen-bill/app/android/keystores
keytool -genkeypair -v \
  -storetype JKS \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass zenbill2026 \
  -keypass zenbill2026 \
  -alias zenbill-release \
  -keystore /Users/yuki/projects/zen-bill/app/android/keystores/release.keystore \
  -dname "CN=ZenBill, OU=Dev, O=ZenBill, L=Taipei, ST=Taiwan, C=TW"
```
Expected: `release.keystore` created at `app/android/keystores/release.keystore`

**Step 2: Configure Gradle signing properties**

Append to `~/.gradle/gradle.properties` (create if not exists):
```properties
ZENBILL_RELEASE_STORE_FILE=keystores/release.keystore
ZENBILL_RELEASE_STORE_PASSWORD=zenbill2026
ZENBILL_RELEASE_KEY_ALIAS=zenbill-release
ZENBILL_RELEASE_KEY_PASSWORD=zenbill2026
```

**Step 3: Verify keystore is gitignored**

Run: `cd /Users/yuki/projects/zen-bill && git check-ignore app/android/keystores/release.keystore`
Expected: path is printed (ignored). The existing `app/.gitignore` has `/android` which covers it.

**Step 4: Commit** (nothing to commit yet — keystore is gitignored, gradle.properties is in ~)

---

### Task 2: Setup ANDROID_SDK_ROOT Environment Variable

**Files:**
- No project files modified (user shell config only)

**Step 1: Verify ANDROID_HOME works in current shell**

Run: `source ~/.zshrc && echo $ANDROID_HOME`
Expected: `/Users/yuki/Library/Android/sdk`

Note: `~/.zshrc` already has `export ANDROID_HOME=$HOME/Library/Android/sdk`. Some tools prefer `ANDROID_SDK_ROOT`. If Gradle complains, add `export ANDROID_SDK_ROOT=$ANDROID_HOME` to `~/.zshrc`. This is a fallback — try without it first.

---

### Task 3: Rewrite build-apk.sh for Local Gradle Build

**Files:**
- Modify: `scripts/build-apk.sh` (full rewrite)

**Step 1: Write the new build-apk.sh**

Replace entire contents of `scripts/build-apk.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ZenBill Local APK Build + GitHub Release
# ============================================================
# Builds Android APK locally via Gradle, uploads to GitHub Release.
# Version is driven by git tags (e.g., v1.0.3).
#
# Prerequisites:
#   - Android SDK (ANDROID_HOME set)
#   - JDK 21+
#   - gh CLI (logged in)
#   - Keystore at app/android/keystores/release.keystore
#   - Signing config in ~/.gradle/gradle.properties
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

# --- Pre-flight checks ---

if [[ -z "${ANDROID_HOME:-}" ]]; then
    # Try common macOS path
    if [[ -d "$HOME/Library/Android/sdk" ]]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
    else
        log "ERROR: ANDROID_HOME not set and Android SDK not found"
        exit 1
    fi
fi

if ! command -v gh &> /dev/null; then
    log "ERROR: gh CLI not found. Install with: brew install gh"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    log "ERROR: Not logged in to GitHub CLI. Run: gh auth login"
    exit 1
fi

# --- Version from git tag ---

cd "${PROJECT_DIR}"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo '')"

if [[ "${TAG}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    MAJOR="${BASH_REMATCH[1]}"
    MINOR="${BASH_REMATCH[2]}"
    PATCH="${BASH_REMATCH[3]}"
    VERSION_NAME="${MAJOR}.${MINOR}.${PATCH}"
    VERSION_CODE=$(( MAJOR * 10000 + MINOR * 100 + PATCH ))
else
    log "WARN: No valid semver tag found (got: '${TAG}'). Using app.json defaults."
    VERSION_NAME=""
    VERSION_CODE=""
fi

log "Starting local APK build..."
log "Git SHA: ${GIT_SHA}"
log "Version: ${VERSION_NAME:-default} (code: ${VERSION_CODE:-default})"

# --- Update app.json version if tag exists ---

cd "${APP_DIR}"

if [[ -n "${VERSION_NAME}" ]]; then
    # Use node to update app.json version fields
    node -e "
const fs = require('fs');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
appJson.expo.version = '${VERSION_NAME}';
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.versionCode = ${VERSION_CODE};
fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2) + '\n');
console.log('Updated app.json: version=${VERSION_NAME}, versionCode=${VERSION_CODE}');
"
fi

# --- Expo Prebuild ---

log "Running expo prebuild..."
EXPO_PUBLIC_API_BASE_URL="https://zenapi.bibiota.com/api/v1" \
    npx expo prebuild --platform android --clean 2>&1 | tee -a "${LOG_FILE}"

# --- Inject signing config into build.gradle ---

BUILD_GRADLE="${APP_DIR}/android/app/build.gradle"
if ! grep -q "ZENBILL_RELEASE_STORE_FILE" "${BUILD_GRADLE}" 2>/dev/null; then
    log "Injecting signing config into build.gradle..."
    node -e "
const fs = require('fs');
let gradle = fs.readFileSync('${BUILD_GRADLE}', 'utf8');

const signingBlock = \`
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
gradle = gradle.replace(
    /(\s+buildTypes\s*\{)/,
    signingBlock + '\n\$1'
);

// Add signingConfig to release buildType
gradle = gradle.replace(
    /(buildTypes\s*\{[\\s\\S]*?release\s*\{)/,
    '\$1\n            signingConfig signingConfigs.release'
);

fs.writeFileSync('${BUILD_GRADLE}', gradle);
console.log('Signing config injected into build.gradle');
"
fi

# --- Gradle Build ---

log "Running Gradle assembleRelease..."
cd "${APP_DIR}/android"
./gradlew assembleRelease 2>&1 | tee -a "${LOG_FILE}"

# --- Find APK ---

APK_PATH="${APP_DIR}/android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "${APK_PATH}" ]]; then
    log "ERROR: APK not found at ${APK_PATH}"
    exit 1
fi

APK_SIZE=$(du -h "${APK_PATH}" | cut -f1)
log "APK built successfully: ${APK_PATH} (${APK_SIZE})"

# --- Upload to GitHub Release ---

cd "${PROJECT_DIR}"
RELEASE_TAG="v${VERSION_NAME:-0.0.0-${GIT_SHA}}"
RELEASE_TITLE="ZenBill ${RELEASE_TAG}"
RELEASE_NOTES="ZenBill ${RELEASE_TAG}
Git SHA: ${GIT_SHA}
Build: $(date '+%Y-%m-%d %H:%M:%S')"

# Rename APK with version
NAMED_APK="${APP_DIR}/android/app/build/outputs/apk/release/zenbill-${RELEASE_TAG}.apk"
cp "${APK_PATH}" "${NAMED_APK}"

if gh release view "${RELEASE_TAG}" &> /dev/null; then
    log "Release ${RELEASE_TAG} exists. Uploading APK as additional asset..."
    gh release upload "${RELEASE_TAG}" "${NAMED_APK}" --clobber 2>&1 | tee -a "${LOG_FILE}"
else
    log "Creating release ${RELEASE_TAG}..."
    gh release create "${RELEASE_TAG}" "${NAMED_APK}" \
        --title "${RELEASE_TITLE}" \
        --notes "${RELEASE_NOTES}" 2>&1 | tee -a "${LOG_FILE}"
fi

log "APK uploaded to GitHub Release: ${RELEASE_TAG}"
log "Done!"
```

**Step 2: Make it executable**

Run: `chmod +x /Users/yuki/projects/zen-bill/scripts/build-apk.sh`

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add scripts/build-apk.sh
git commit -m "feat: rewrite build-apk.sh for local Gradle build + GitHub Release

Replace EAS cloud build with local expo prebuild + Gradle assembleRelease.
APK auto-uploads to GitHub Release with version from git tag.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Update eas.json

**Files:**
- Modify: `app/eas.json`

**Step 1: Change appVersionSource to local**

Change `app/eas.json` to remove `appVersionSource: "remote"` (version now managed by git tags + app.json):

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
      "android": {
        "buildType": "apk"
      },
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

**Step 2: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/eas.json
git commit -m "chore: remove appVersionSource remote from eas.json

Version now managed locally via git tags.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Smoke Test — Full Local Build

**Step 1: Create a test git tag**

Run:
```bash
cd /Users/yuki/projects/zen-bill
git tag v1.0.0
```

**Step 2: Run build-apk.sh manually**

Run:
```bash
cd /Users/yuki/projects/zen-bill
source ~/.zshrc && ./scripts/build-apk.sh
```

Expected output (key lines):
```
[build-apk] Version: 1.0.0 (code: 10000)
[build-apk] Running expo prebuild...
[build-apk] Running Gradle assembleRelease...
[build-apk] APK built successfully: .../app-release.apk (XX MB)
[build-apk] Creating release v1.0.0...
[build-apk] APK uploaded to GitHub Release: v1.0.0
[build-apk] Done!
```

**Step 3: Verify on GitHub**

Run: `gh release view v1.0.0`
Expected: Release exists with `zenbill-v1.0.0.apk` as asset.

**Step 4: If build fails — troubleshoot**

Common issues:
- `ANDROID_HOME not set` → Run `source ~/.zshrc` first, or add `export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk` to script
- `SDK not found` → Run `sdkmanager --install "platforms;android-35"` (Expo may need a different API level than 36.1)
- `signing config` → Check `~/.gradle/gradle.properties` has the 4 ZENBILL_RELEASE_* keys
- `gh release create` fails → Check `gh auth status`, ensure repo has push access

---

### Task 6: Restore app.json After Build (Cleanup)

The build script modifies `app.json` to inject version from git tag. This is fine since the android/ directory is gitignored, but `app.json` changes would show as dirty.

**Files:**
- Modify: `scripts/build-apk.sh`

**Step 1: Add app.json restore to build script**

Add after the GitHub Release upload section (before the final "Done!" log), insert:

```bash
# --- Restore app.json ---
cd "${PROJECT_DIR}"
git checkout -- app/app.json 2>/dev/null || true
```

**Step 2: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add scripts/build-apk.sh
git commit -m "fix: restore app.json after local APK build

Prevents version injection from leaving dirty git state.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: End-to-End Test via Push Hook

**Step 1: Create a new version tag and push**

```bash
cd /Users/yuki/projects/zen-bill
git tag v1.0.1
git push github master --tags
```

Expected: Pre-push hook triggers `post-push-deploy.sh`, which runs `deploy.sh` then `build-apk.sh` in background. Check `deploy.log` for progress.

**Step 2: Monitor build log**

Run: `tail -f /Users/yuki/projects/zen-bill/deploy.log`

Expected: See build-apk log lines ending with "Done!"

**Step 3: Verify GitHub Release**

Run: `gh release view v1.0.1`
Expected: Release with `zenbill-v1.0.1.apk` asset.

---

## Summary

| Task | Description | Estimated |
|------|-------------|-----------|
| 1 | Setup keystore + signing config | 5 min |
| 2 | Verify ANDROID_SDK_ROOT | 1 min |
| 3 | Rewrite build-apk.sh | 5 min |
| 4 | Update eas.json | 2 min |
| 5 | Smoke test full build | 5-10 min |
| 6 | Add app.json restore | 2 min |
| 7 | E2E test via push hook | 5 min |
