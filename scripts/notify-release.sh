#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
set -euo pipefail

# ============================================================
# ZenBill: re-send the release webhook for an existing release
# ============================================================
# Use when build-apk.sh Phase 9 logged "release webhook failed".
# Downloads the APK from the GitHub Release, computes its sha256,
# recomputes the app content hash from the current working tree
# (may have drifted since the build; only affects the next
# skip-check — see design.md D7), and POSTs to the backend.
# The backend is idempotent: an already-recorded version returns 200.
#
# Usage:
#   scripts/notify-release.sh v1.0.57
#
# Env: see scripts/lib/release-webhook.sh
#   (ZENBILL_RELEASE_API_BASE, ZENBILL_RELEASE_WEBHOOK_SECRET, ZENBILL_RELEASE_ENV_FILE)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${PROJECT_DIR}/app"
REPO="BIBIOTA/zenbill-index"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [notify-release] $1"
}

# shellcheck source=lib/app-content-hash.sh
source "${SCRIPT_DIR}/lib/app-content-hash.sh"
# shellcheck source=lib/release-webhook.sh
source "${SCRIPT_DIR}/lib/release-webhook.sh"

TAG="${1:-}"
if [[ ! "${TAG}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "Usage: $0 vMAJOR.MINOR.PATCH" >&2
    exit 64
fi
V_MAJOR=$((10#${BASH_REMATCH[1]}))
V_MINOR=$((10#${BASH_REMATCH[2]}))
V_PATCH=$((10#${BASH_REMATCH[3]}))
VERSION="${V_MAJOR}.${V_MINOR}.${V_PATCH}"
VERSION_CODE=$(( V_MAJOR * 10000 + V_MINOR * 100 + V_PATCH ))
APK_NAME="zenbill-v${VERSION}.apk"
APK_URL="https://github.com/${REPO}/releases/download/${TAG}/${APK_NAME}"

if ! release_load_secret; then
    log "ERROR: ZENBILL_RELEASE_WEBHOOK_SECRET not set (env or ${ZENBILL_RELEASE_ENV_FILE:-${HOME}/.config/zenbill/release.env})."
    exit 1
fi

if ! command -v gh &>/dev/null; then
    log "ERROR: gh CLI not found."
    exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zenbill-notify.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

log "Downloading ${APK_NAME} from ${REPO} release ${TAG}..."
if ! gh release download "${TAG}" --repo "${REPO}" --pattern "${APK_NAME}" --dir "${TMP_DIR}"; then
    log "ERROR: failed to download ${APK_NAME} from release ${TAG}."
    exit 1
fi

APK_SHA256="$(shasum -a 256 < "${TMP_DIR}/${APK_NAME}")"
APK_SHA256="${APK_SHA256%% *}"
APP_CONTENT_HASH="$(app_content_hash "${PROJECT_DIR}")"
APP_GIT_SHA="$(git -C "${APP_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"

log "version=${VERSION} version_code=${VERSION_CODE}"
log "apk_sha256=${APK_SHA256}"
log "content_hash=${APP_CONTENT_HASH} (recomputed from current tree)"
log "app_git_sha=${APP_GIT_SHA}"

if release_notify "${VERSION}" "${VERSION_CODE}" "${APK_URL}" "${APK_SHA256}" \
    "${APP_CONTENT_HASH}" "${APP_GIT_SHA}"; then
    log "Done."
else
    log "ERROR: release webhook failed for ${TAG}."
    exit 1
fi
