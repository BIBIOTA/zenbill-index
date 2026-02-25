# Dev/Prod 環境分離 + 自動化部署 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate ZenBill into isolated dev/prod environments with independent databases, production Docker images, and automated deployment via git push.

**Architecture:** Single PostgreSQL container hosts two databases (`zenbill_dev`, `zenbill_prod`). Dev uses hot-reload Dockerfiles; prod uses multi-stage compiled images. A bare git repo on Mac mini with a `post-receive` hook auto-builds and deploys prod on `git push prod master`.

**Tech Stack:** Docker, Docker Compose, PostgreSQL 16, nginx, multi-stage Dockerfile, git hooks, shell scripts

**Design doc:** `docs/plans/2026-02-25-dev-prod-separation-design.md`

---

### Task 1: PostgreSQL Init Script — Create Dual Databases

**Files:**
- Create: `backend/docker/init-databases.sql`

**Context:** PostgreSQL runs scripts in `/docker-entrypoint-initdb.d/` only on first container init (when data volume is empty). We create both databases and grant the `zenbill` user full access.

**Step 1: Create the SQL init script**

Create `backend/docker/init-databases.sql`:

```sql
-- Create dev and prod databases (runs only on first PostgreSQL init)
-- The default POSTGRES_DB (zenbill_db) is created automatically by the postgres image.
-- We create two additional databases for environment separation.

CREATE DATABASE zenbill_dev;
CREATE DATABASE zenbill_prod;

-- Grant full access to the zenbill user
GRANT ALL PRIVILEGES ON DATABASE zenbill_dev TO zenbill;
GRANT ALL PRIVILEGES ON DATABASE zenbill_prod TO zenbill;
```

**Step 2: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add backend/docker/init-databases.sql
git commit -m "feat: add PostgreSQL init script for dual dev/prod databases"
```

---

### Task 2: Update Base docker-compose.yml — Mount Init Script

**Files:**
- Modify: `backend/docker-compose.yml`

**Context:** Mount the init script into the PostgreSQL container. Keep `POSTGRES_DB: zenbill_db` as the default database (it's needed for healthcheck and backwards compatibility). The init script creates the two additional databases.

**Step 1: Add volume mount for init script**

In `backend/docker-compose.yml`, update the `db` service volumes to include the init script:

```yaml
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/init-databases.sql:/docker-entrypoint-initdb.d/init-databases.sql:ro
```

Also update the healthcheck to use `zenbill_dev` (to verify the new database exists):

```yaml
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U zenbill -d zenbill_dev" ]
      interval: 10s
      timeout: 5s
      retries: 5
```

**Step 2: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add backend/docker-compose.yml
git commit -m "feat: mount PostgreSQL init script in base docker-compose"
```

---

### Task 3: Update .env.dev and .env.prod — Point to Separate Databases

**Files:**
- Modify: `backend/.env.dev` (line 14)
- Modify: `backend/.env.prod` (line 14)

**Step 1: Update .env.dev**

Change line 14 from:
```
ZENBILL_DB_NAME=zenbill_db
```
to:
```
ZENBILL_DB_NAME=zenbill_dev
```

**Step 2: Update .env.prod**

Change line 14 from:
```
ZENBILL_DB_NAME=zenbill_db
```
to:
```
ZENBILL_DB_NAME=zenbill_prod
```

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add backend/.env.dev backend/.env.prod
git commit -m "feat: point dev/prod env files to separate databases"
```

---

### Task 4: Create Data Migration Script

**Files:**
- Create: `scripts/init-dual-db.sh`

**Context:** One-time script to migrate existing data from `zenbill_db` to both `zenbill_dev` and `zenbill_prod`. Run this once after re-creating the PostgreSQL volume.

**Step 1: Create the migration script**

Create `scripts/init-dual-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ZenBill: One-time data migration from zenbill_db → dual DBs
# ============================================================
# Prerequisites:
#   1. PostgreSQL container running: docker compose -f docker-compose.yml up -d db
#   2. Existing data in zenbill_db
#
# This script:
#   1. Dumps zenbill_db (schema + data)
#   2. Creates zenbill_dev and zenbill_prod if they don't exist
#   3. Restores the dump into both databases
# ============================================================

CONTAINER="zenbill_postgres"
DB_USER="zenbill"
SOURCE_DB="zenbill_db"
TARGET_DBS=("zenbill_dev" "zenbill_prod")
DUMP_FILE="/tmp/zenbill_dump.sql"

echo "=== ZenBill Dual Database Migration ==="
echo ""

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: Container '${CONTAINER}' is not running."
    echo "Start it with: cd backend && docker compose -f docker-compose.yml up -d db"
    exit 1
fi

# Dump source database
echo "[1/4] Dumping ${SOURCE_DB}..."
docker exec "${CONTAINER}" pg_dump -U "${DB_USER}" -d "${SOURCE_DB}" --clean --if-exists > "${DUMP_FILE}"
echo "  Dump saved to ${DUMP_FILE} ($(wc -c < "${DUMP_FILE}" | tr -d ' ') bytes)"

for TARGET_DB in "${TARGET_DBS[@]}"; do
    echo ""
    echo "[2/4] Creating database ${TARGET_DB} (if not exists)..."
    docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -tc \
        "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'" | grep -q 1 || \
        docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -c \
        "CREATE DATABASE ${TARGET_DB} OWNER ${DB_USER};"
    echo "  Database ${TARGET_DB} ready."

    echo "[3/4] Restoring dump into ${TARGET_DB}..."
    docker exec -i "${CONTAINER}" psql -U "${DB_USER}" -d "${TARGET_DB}" < "${DUMP_FILE}"
    echo "  Restored into ${TARGET_DB}."
done

echo ""
echo "[4/4] Verifying..."
for TARGET_DB in "${TARGET_DBS[@]}"; do
    TABLE_COUNT=$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${TARGET_DB}" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
    echo "  ${TARGET_DB}: ${TABLE_COUNT} tables"
done

# Cleanup
rm -f "${DUMP_FILE}"

echo ""
echo "=== Migration complete ==="
echo "Dev services → zenbill_dev"
echo "Prod services → zenbill_prod"
```

**Step 2: Make executable**

```bash
chmod +x scripts/init-dual-db.sh
```

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add scripts/init-dual-db.sh
git commit -m "feat: add one-time dual database migration script"
```

---

### Task 5: Create Backend Production Dockerfile

**Files:**
- Create: `backend/Dockerfile.prod`

**Context:** Multi-stage build. Stage 1 compiles Go binaries with CGO (tesseract, opencv, playwright). Stage 2 is a slim runtime with only shared libraries. Produces `api`, `worker`, and `migrate` binaries.

**Step 1: Create Dockerfile.prod**

Create `backend/Dockerfile.prod`:

```dockerfile
# =====================================================
# ZenBill Backend - Production Dockerfile
# Multi-stage build: compile → slim runtime
# =====================================================

# --- Stage 1: Builder ---
FROM golang:1.25-bookworm AS builder

WORKDIR /app

# Install build-time dependencies (CGO)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    git \
    # Tesseract OCR
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-chi-tra \
    libtesseract-dev \
    libleptonica-dev \
    # OpenCV
    libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

ENV CGO_ENABLED=1
ENV PKG_CONFIG_PATH="/usr/lib/pkgconfig:/usr/share/pkgconfig:/usr/lib/aarch64-linux-gnu/pkgconfig:/usr/lib/x86_64-linux-gnu/pkgconfig"

# Download dependencies (cached layer)
COPY go.mod go.sum ./
RUN go mod download

# Remove incompatible gocv ArUco module
RUN find /go/pkg/mod/gocv.io/x/gocv@* -name "aruco*" -delete 2>/dev/null || true

# Copy source code
COPY . .

# Build all binaries
RUN go build -o /out/api ./cmd/api
RUN go build -o /out/worker ./cmd/worker
RUN go build -o /out/migrate ./cmd/migrate

# Install Playwright browsers
RUN go run github.com/playwright-community/playwright-go/cmd/playwright@latest install chromium
# Capture the browser install path
RUN PLAYWRIGHT_BROWSERS=$(go run github.com/playwright-community/playwright-go/cmd/playwright@latest install --dry-run chromium 2>&1 | grep -oP '/root/.cache/ms-playwright.*' | head -1 || echo "/root/.cache/ms-playwright") && \
    echo "${PLAYWRIGHT_BROWSERS}" > /tmp/pw_path

# --- Stage 2: Runtime ---
FROM debian:bookworm-slim AS runtime

WORKDIR /app

# Install runtime-only libraries (no -dev packages, no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Tesseract runtime
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-chi-tra \
    libtesseract5 \
    libleptonica6 \
    # OpenCV runtime
    libopencv-core406 \
    libopencv-imgproc406 \
    libopencv-imgcodecs406 \
    # Playwright browser dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    # Utilities
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled binaries
COPY --from=builder /out/api /app/api
COPY --from=builder /out/worker /app/worker
COPY --from=builder /out/migrate /app/migrate

# Copy Playwright browsers
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

# Create sessions directory
RUN mkdir -p /app/sessions

# Default command (overridden by docker-compose)
CMD ["/app/api"]
```

**Step 2: Verify the Dockerfile builds (optional quick check)**

```bash
cd /Users/yuki/projects/zen-bill/backend
docker build -f Dockerfile.prod -t zenbill-backend-prod . --progress=plain 2>&1 | tail -5
```

Expected: Build should complete (may take a few minutes for first build).

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add backend/Dockerfile.prod
git commit -m "feat: add backend production Dockerfile with multi-stage build"
```

---

### Task 6: Create Frontend Production Dockerfile + nginx Config

**Files:**
- Create: `frontend/Dockerfile.prod`
- Create: `frontend/nginx.conf`

**Context:** Multi-stage build: npm build → nginx serving static files. Nginx handles SPA routing (fallback to index.html) and API proxying.

**Step 1: Create nginx.conf**

Create `frontend/nginx.conf`:

```nginx
server {
    listen 4173;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing: try file, then directory, then fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check
    location /healthz {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
```

**Step 2: Create Dockerfile.prod**

Create `frontend/Dockerfile.prod`:

```dockerfile
# =====================================================
# ZenBill Frontend - Production Dockerfile
# Multi-stage build: npm build → nginx static serving
# =====================================================

# --- Stage 1: Builder ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time env vars (baked into the bundle)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# --- Stage 2: Runtime ---
FROM nginx:alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 4173

CMD ["nginx", "-g", "daemon off;"]
```

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add frontend/Dockerfile.prod frontend/nginx.conf
git commit -m "feat: add frontend production Dockerfile with nginx"
```

---

### Task 7: Update docker-compose.prod.yml — Use Production Images

**Files:**
- Modify: `backend/docker-compose.prod.yml`

**Context:** Replace `Dockerfile.dev` with `Dockerfile.prod`, remove volume mounts (code is baked into image), use compiled binary commands instead of Air hot-reload.

**Step 1: Rewrite docker-compose.prod.yml**

Replace entire content of `backend/docker-compose.prod.yml` with:

```yaml
# Production environment override.
# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

services:
  api-prod:
    build:
      context: .
      dockerfile: Dockerfile.prod
    container_name: zenbill_api_prod
    restart: unless-stopped
    env_file: .env.prod
    ports:
      - "127.0.0.1:8091:8091"
    volumes:
      - prod_sessions:/app/sessions
    networks:
      - zenbill_network
    depends_on:
      db:
        condition: service_healthy
    command: ["/app/api"]

  worker-prod:
    build:
      context: .
      dockerfile: Dockerfile.prod
    container_name: zenbill_worker_prod
    restart: unless-stopped
    env_file: .env.prod
    volumes:
      - prod_sessions:/app/sessions
    networks:
      - zenbill_network
    depends_on:
      db:
        condition: service_healthy
    command: ["/app/worker"]

  frontend-prod:
    build:
      context: ../frontend
      dockerfile: Dockerfile.prod
      args:
        VITE_API_BASE_URL: https://zenapi.bibiota.com
    container_name: zenbill_frontend_prod
    restart: unless-stopped
    ports:
      - "127.0.0.1:4173:4173"
    networks:
      - zenbill_network

volumes:
  prod_sessions:
    driver: local
```

**Step 2: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add backend/docker-compose.prod.yml
git commit -m "feat: update prod compose to use production Dockerfiles"
```

---

### Task 8: Create Deploy Script

**Files:**
- Create: `scripts/deploy.sh`

**Context:** Standalone deploy script that builds prod images, runs migration, and restarts services. Called by the git hook but also runnable manually.

**Step 1: Create deploy script**

Create `scripts/deploy.sh`:

```bash
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
```

**Step 2: Make executable**

```bash
chmod +x scripts/deploy.sh
```

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add scripts/deploy.sh
git commit -m "feat: add production deploy script"
```

---

### Task 9: Set Up Bare Git Repo + post-receive Hook

**Files:**
- Create: `/Users/yuki/repos/zen-bill.git` (bare repo)
- Create: `/Users/yuki/repos/zen-bill.git/hooks/post-receive`

**Context:** A bare git repo acts as a deployment target. When code is pushed to `master`, the `post-receive` hook pulls the latest code into the working directory and runs the deploy script.

**Step 1: Create the bare repo**

```bash
mkdir -p /Users/yuki/repos
git init --bare /Users/yuki/repos/zen-bill.git
```

**Step 2: Create the post-receive hook**

Create `/Users/yuki/repos/zen-bill.git/hooks/post-receive`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ZenBill post-receive hook
# Triggers production deploy when master branch is updated
# ============================================================

WORK_DIR="/Users/yuki/projects/zen-bill"
DEPLOY_SCRIPT="${WORK_DIR}/scripts/deploy.sh"

while read oldrev newrev refname; do
    BRANCH=$(echo "${refname}" | sed 's|refs/heads/||')

    if [ "${BRANCH}" != "master" ]; then
        echo "Received push to ${BRANCH} — skipping deploy (only master triggers deploy)."
        continue
    fi

    echo "============================================"
    echo "Received push to master: ${oldrev:0:7} → ${newrev:0:7}"
    echo "============================================"

    # Pull latest code into working directory
    echo "Pulling latest code..."
    cd "${WORK_DIR}"
    git fetch origin master 2>/dev/null || true
    git reset --hard "${newrev}"

    # Update submodules if any
    git submodule update --init --recursive 2>/dev/null || true

    # Run deploy
    echo "Starting deploy..."
    if bash "${DEPLOY_SCRIPT}"; then
        echo "============================================"
        echo "Deploy successful!"
        echo "============================================"
    else
        echo "============================================"
        echo "Deploy FAILED. Check logs: ${WORK_DIR}/deploy.log"
        echo "============================================"
        exit 1
    fi
done
```

**Step 3: Make hook executable**

```bash
chmod +x /Users/yuki/repos/zen-bill.git/hooks/post-receive
```

**Step 4: Add the prod remote to the working repo**

```bash
cd /Users/yuki/projects/zen-bill
git remote add prod /Users/yuki/repos/zen-bill.git
```

**Step 5: Verify setup**

```bash
git remote -v
```

Expected output should include:
```
prod	/Users/yuki/repos/zen-bill.git (fetch)
prod	/Users/yuki/repos/zen-bill.git (push)
```

**Note:** This task involves files outside the git repo so no commit is needed for the bare repo itself. The deploy script was already committed in Task 8.

---

### Task 10: Test the Full Pipeline — Database Separation

**Context:** Verify database separation works end-to-end. This requires re-creating the PostgreSQL volume.

**Step 1: Stop all services and remove old volume**

```bash
cd /Users/yuki/projects/zen-bill/backend
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker volume rm backend_postgres_data 2>/dev/null || true
```

**Step 2: Start the database with init script**

```bash
docker compose -f docker-compose.yml up -d db
```

**Step 3: Wait for healthy and verify databases exist**

```bash
sleep 5
docker exec zenbill_postgres psql -U zenbill -d postgres -c "\l"
```

Expected: Should list `zenbill_db`, `zenbill_dev`, and `zenbill_prod`.

**Step 4: Run the data migration script**

```bash
cd /Users/yuki/projects/zen-bill
bash scripts/init-dual-db.sh
```

Expected: Script dumps `zenbill_db` and restores into both `zenbill_dev` and `zenbill_prod`, reports table counts.

**Step 5: Start dev services and verify connectivity**

```bash
cd /Users/yuki/projects/zen-bill/backend
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Verify dev API connects to `zenbill_dev`:
```bash
curl -sf http://127.0.0.1:8090/health
```

Expected: 200 OK or healthy response.

---

### Task 11: Test the Full Pipeline — Production Build + Deploy

**Context:** Verify production images build and deploy correctly.

**Step 1: Build and start prod services**

```bash
cd /Users/yuki/projects/zen-bill/backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api-prod /app/migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Step 2: Verify prod services**

```bash
# Backend API
curl -sf http://127.0.0.1:8091/health

# Frontend (nginx)
curl -sf http://127.0.0.1:4173/healthz
```

Expected: Both return 200 OK.

**Step 3: Verify database isolation**

```bash
# Check dev has its own data
docker exec zenbill_postgres psql -U zenbill -d zenbill_dev -c "SELECT count(*) FROM users;"
# Check prod has its own data
docker exec zenbill_postgres psql -U zenbill -d zenbill_prod -c "SELECT count(*) FROM users;"
```

Both should return the same count (since we migrated from the same source).

---

### Task 12: Test the Full Pipeline — Git Hook Deploy

**Context:** End-to-end test of `git push prod master` triggering auto-deploy.

**Step 1: Push to prod remote**

```bash
cd /Users/yuki/projects/zen-bill
git push prod master
```

Expected: The post-receive hook fires, runs `scripts/deploy.sh`, builds images, migrates, restarts services, and health check passes.

**Step 2: Verify services are running**

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Expected: `zenbill_api_prod`, `zenbill_worker_prod`, `zenbill_frontend_prod` all show "Up".

**Step 3: Final commit (add deploy.log to .gitignore)**

Check if `deploy.log` needs to be gitignored:

```bash
echo "deploy.log" >> /Users/yuki/projects/zen-bill/.gitignore
git add .gitignore
git commit -m "chore: gitignore deploy.log"
```

---

## Summary of All Files

**New files (7):**
| File | Purpose |
|------|---------|
| `backend/docker/init-databases.sql` | PostgreSQL init: creates zenbill_dev + zenbill_prod |
| `backend/Dockerfile.prod` | Backend multi-stage production build |
| `frontend/Dockerfile.prod` | Frontend multi-stage production build |
| `frontend/nginx.conf` | nginx config for SPA + health check |
| `scripts/init-dual-db.sh` | One-time data migration script |
| `scripts/deploy.sh` | Production deploy script |
| `(bare repo) hooks/post-receive` | Git hook for auto-deploy on push |

**Modified files (4):**
| File | Change |
|------|--------|
| `backend/docker-compose.yml` | Mount init script, update healthcheck |
| `backend/docker-compose.prod.yml` | Use Dockerfile.prod, compiled binaries, no volumes |
| `backend/.env.dev` | `ZENBILL_DB_NAME=zenbill_dev` |
| `backend/.env.prod` | `ZENBILL_DB_NAME=zenbill_prod` |
