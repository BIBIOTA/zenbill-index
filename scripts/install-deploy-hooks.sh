#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Install Deploy Hooks
# ============================================================
# Installs pre-push hooks in both backend/ and frontend/ repos
# so that pushing master triggers auto-deploy.
#
# Usage: ./scripts/install-deploy-hooks.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/post-push-deploy.sh"

REPOS=(
    "${PROJECT_DIR}/backend"
    "${PROJECT_DIR}/frontend"
)

for repo in "${REPOS[@]}"; do
    repo_name="$(basename "${repo}")"
    hook_dir="${repo}/.git/hooks"
    hook_file="${hook_dir}/pre-push"

    if [[ ! -d "${repo}/.git" ]]; then
        echo "[skip] ${repo_name}/ is not a git repo"
        continue
    fi

    if [[ -f "${hook_file}" ]]; then
        echo "[skip] ${repo_name}/.git/hooks/pre-push already exists"
        echo "       Remove it first if you want to reinstall."
        continue
    fi

    cat > "${hook_file}" << EOF
#!/usr/bin/env bash
# Auto-deploy hook — installed by install-deploy-hooks.sh
exec "${HOOK_SCRIPT}"
EOF
    chmod +x "${hook_file}"
    echo "[done] Installed pre-push hook for ${repo_name}/"
done

echo ""
echo "Deploy will trigger automatically when you push to master."
echo "Logs: ${PROJECT_DIR}/deploy.log"
