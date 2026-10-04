#!/usr/bin/env bash
# ============================================================
# ZenBill APP content hash (design.md D2)
# ============================================================
# APP_CONTENT_HASH = sha256( LC_ALL=C sorted lines "<path>  <sha256(file)>" )
# Inputs:
#   - app/            : `git -C app ls-files -co --exclude-standard`
#                       (app/ is its own git repo), minus android/ ios/ node_modules/
#   - packages/shared : root repo `git ls-files -co --exclude-standard -- packages/shared`,
#                       minus node_modules
#   - pnpm-lock.yaml
# Paths in the manifest are relative to the project root (e.g. "app/lib/x.ts").
# Listed-but-missing files (deleted, not yet staged) and non-regular files are skipped.
#
# Usage:
#   source scripts/lib/app-content-hash.sh; app_content_hash [PROJECT_DIR]
#   scripts/lib/app-content-hash.sh [PROJECT_DIR]              # prints the hash
#   scripts/lib/app-content-hash.sh --manifest [PROJECT_DIR]   # prints the per-file manifest
# Only macOS built-ins (git, shasum, sort) are required.
# ============================================================

# Print "<relpath>  <sha256>" for every input file, sorted with LC_ALL=C.
app_content_manifest() {
    local root="${1:-}"
    if [[ -z "${root}" ]]; then
        root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    fi
    if [[ ! -d "${root}/app" ]]; then
        echo "app_content_hash: ${root}/app not found" >&2
        return 1
    fi

    local list
    list="$(mktemp "${TMPDIR:-/tmp}/zenbill-hash-list.XXXXXX")" || return 1

    # NUL-separated so names with spaces / CJK / quotes survive (-z disables quoting).
    if ! {
        git -C "${root}/app" ls-files -z -co --exclude-standard | while IFS= read -r -d '' p; do
            case "${p}" in
                android/*|ios/*|node_modules/*|*/node_modules/*) continue ;;
            esac
            printf 'app/%s\0' "${p}"
        done
        git -C "${root}" ls-files -z -co --exclude-standard -- packages/shared | while IFS= read -r -d '' p; do
            case "${p}" in
                */node_modules/*) continue ;;
            esac
            printf '%s\0' "${p}"
        done
        printf '%s\0' "pnpm-lock.yaml"
    } > "${list}"; then
        rm -f "${list}"
        echo "app_content_hash: git ls-files failed" >&2
        return 1
    fi

    local p sha
    while IFS= read -r -d '' p; do
        # Skip deleted-but-still-listed files, directories (e.g. nested repos), sockets, etc.
        [[ -f "${root}/${p}" ]] || continue
        # Read via stdin so shasum never escapes/quotes unusual file names.
        sha="$(shasum -a 256 < "${root}/${p}")" || exit 1  # exits the pipeline subshell only
        printf '%s  %s\n' "${p}" "${sha%% *}"
    done < "${list}" | LC_ALL=C sort -u
    local rc=${PIPESTATUS[0]}
    rm -f "${list}"
    return "${rc}"
}

# Print the 64-hex content hash.
app_content_hash() {
    local manifest
    manifest="$(app_content_manifest "$@")" || return 1
    if [[ -z "${manifest}" ]]; then
        echo "app_content_hash: empty manifest" >&2
        return 1
    fi
    local h
    h="$(printf '%s\n' "${manifest}" | shasum -a 256)" || return 1
    printf '%s\n' "${h%% *}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    set -euo pipefail
    if [[ "${1:-}" == "--manifest" ]]; then
        shift
        app_content_manifest "$@"
    else
        app_content_hash "$@"
    fi
fi
