#!/usr/bin/env bash
# ============================================================
# ZenBill release webhook helpers (design.md D2 / D4 / D7)
# ============================================================
# Source this file; it defines functions only (no side effects).
#
# Env:
#   ZENBILL_RELEASE_API_BASE        default http://127.0.0.1:8091/api/v1
#   ZENBILL_RELEASE_WEBHOOK_SECRET  X-Release-Secret value (never commit it)
#   ZENBILL_RELEASE_ENV_FILE        file sourced when the secret is unset,
#                                   default ~/.config/zenbill/release.env
#   ZENBILL_RELEASE_RETRY_DELAY     seconds between webhook attempts (default 5)
#
# Callers may define `log` beforehand; otherwise messages go to stderr.
# ============================================================

: "${ZENBILL_RELEASE_API_BASE:=http://127.0.0.1:8091/api/v1}"

_rw_log() {
    if declare -F log >/dev/null; then
        log "$1"
    else
        echo "[release-webhook] $1" >&2
    fi
}

# Run a tiny JSON helper with python3 (macOS built-in), falling back to node.
#   _rw_json get <field>        : stdin = API response; prints .data.<field> ("" if absent)
#   _rw_json payload k v k v .. : prints a JSON object; version_code is emitted as a number
_rw_json() {
    local py='
import json, sys
mode = sys.argv[1]
if mode == "get":
    try:
        d = json.load(sys.stdin)
    except Exception:
        sys.exit(1)
    data = d.get("data") if isinstance(d, dict) else None
    v = data.get(sys.argv[2]) if isinstance(data, dict) else None
    print("" if v is None else v)
else:
    a = sys.argv[2:]
    o = {}
    for k, v in zip(a[0::2], a[1::2]):
        o[k] = int(v) if k == "version_code" else v
    print(json.dumps(o))
'
    local js='
const [mode, ...a] = process.argv.slice(1);
if (mode === "get") {
  let s = ""; process.stdin.on("data", c => s += c).on("end", () => {
    let d; try { d = JSON.parse(s); } catch { process.exit(1); }
    const v = d && d.data && typeof d.data === "object" ? d.data[a[0]] : undefined;
    console.log(v == null ? "" : String(v));
  });
} else {
  const o = {};
  for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i] === "version_code" ? Number(a[i + 1]) : a[i + 1];
  console.log(JSON.stringify(o));
}
'
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "${py}" "$@"
    elif command -v node >/dev/null 2>&1; then
        node -e "${js}" "$@"
    else
        _rw_log "ERROR: neither python3 nor node found for JSON handling"
        return 1
    fi
}

# Source the local env file if the secret is not already in the environment.
release_load_secret() {
    if [[ -n "${ZENBILL_RELEASE_WEBHOOK_SECRET:-}" ]]; then
        return 0
    fi
    local f="${ZENBILL_RELEASE_ENV_FILE:-${HOME}/.config/zenbill/release.env}"
    if [[ -r "${f}" ]]; then
        set -a
        # shellcheck disable=SC1090
        source "${f}"
        set +a
    fi
    [[ -n "${ZENBILL_RELEASE_WEBHOOK_SECRET:-}" ]]
}

# Print the content_hash of the latest published release.
# Returns non-zero (and prints nothing) on network error, 404, or bad JSON.
release_fetch_latest_hash() {
    local body
    body="$(curl -sf --max-time 10 "${ZENBILL_RELEASE_API_BASE%/}/app/latest-version" 2>/dev/null)" || return 1
    local h
    h="$(printf '%s' "${body}" | _rw_json get content_hash)" || return 1
    [[ -n "${h}" ]] || return 1
    printf '%s\n' "${h}"
}

# Decide whether a build is needed. Returns 0 = build, 1 = skip (unchanged).
#   release_should_build <current_content_hash>
release_should_build() {
    local current="$1" latest
    if ! latest="$(release_fetch_latest_hash)"; then
        _rw_log "Latest version lookup failed or no release yet (${ZENBILL_RELEASE_API_BASE%/}/app/latest-version); building anyway."
        return 0
    fi
    if [[ "${latest}" == "${current}" ]]; then
        return 1
    fi
    _rw_log "App content changed (latest ${latest:0:12}…, now ${current:0:12}…)."
    return 0
}

# POST the release to the backend once. Prints the HTTP status code ("000" on network error).
#   release_post_once <json_payload>
release_post_once() {
    local payload="$1" code secret
    # Pass the header through a curl config on stdin so the secret never shows up in `ps`.
    secret="${ZENBILL_RELEASE_WEBHOOK_SECRET//\\/\\\\}"
    secret="${secret//\"/\\\"}"
    code="$(printf 'header = "X-Release-Secret: %s"\n' "${secret}" \
        | curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
            -K - \
            -X POST \
            -H 'Content-Type: application/json' \
            --data-binary "${payload}" \
            "${ZENBILL_RELEASE_API_BASE%/}/internal/app-releases" 2>/dev/null)" || true
    printf '%s\n' "${code:-000}"
}

# Notify the backend of a new release (3 attempts, ZENBILL_RELEASE_RETRY_DELAY apart).
#   release_notify <version> <version_code> <apk_url> <apk_sha256> <content_hash> <app_git_sha>
# Returns 0 on 201/200, 2 when the secret is missing (skipped), 1 on failure.
release_notify() {
    local version="$1" version_code="$2" apk_url="$3" apk_sha="$4" content_hash="$5" git_sha="$6"

    if ! release_load_secret; then
        _rw_log "WARN: ZENBILL_RELEASE_WEBHOOK_SECRET not set (env or ${ZENBILL_RELEASE_ENV_FILE:-${HOME}/.config/zenbill/release.env}); skipping release webhook."
        return 2
    fi

    local payload
    payload="$(_rw_json payload \
        version "${version}" version_code "${version_code}" apk_url "${apk_url}" \
        apk_sha256 "${apk_sha}" content_hash "${content_hash}" app_git_sha "${git_sha}")" || return 1

    local attempt code delay="${ZENBILL_RELEASE_RETRY_DELAY:-5}"
    for attempt in 1 2 3; do
        code="$(release_post_once "${payload}")"
        case "${code}" in
            201) _rw_log "Release webhook: v${version} (code ${version_code}) recorded (201)."; return 0 ;;
            200) _rw_log "Release webhook: v${version} (code ${version_code}) already recorded (200)."; return 0 ;;
        esac
        case "${code}" in
            400|401|404)
                # Not transient: bad payload / wrong secret / webhook disabled on the backend.
                _rw_log "Release webhook rejected (HTTP ${code}); not retrying."
                return 1 ;;
        esac
        _rw_log "Release webhook attempt ${attempt}/3 failed (HTTP ${code})."
        if [[ "${attempt}" -lt 3 ]]; then
            sleep "${delay}"
        fi
    done
    return 1
}
