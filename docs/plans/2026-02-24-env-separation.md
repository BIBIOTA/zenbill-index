# Environment Separation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split production and development into independent Docker Compose stacks so both can run simultaneously on the same machine without interfering with each other.

**Architecture:** Extract shared infrastructure (PostgreSQL, PGAdmin) into a base `docker-compose.yml`, then create `docker-compose.dev.yml` and `docker-compose.prod.yml` overrides with environment-specific API/Worker containers on different ports (dev: 8090, prod: 8091). Frontend uses Vite dev server on both envs (dev: 5173, prod: 4173). Nginx updated to proxy prod domains to new ports.

**Tech Stack:** Docker Compose, Makefile, Vite, Nginx, Cloudflare Tunnel

---

## Background & Research

Current state:
- Single `backend/docker-compose.yml` has DB + API + Worker all together
- Single `backend/.env` mixes prod URLs (`zenbill.bibiota.com`) with dev values (`localhost`)
- Nginx at `/opt/homebrew/etc/nginx/servers/zenbill.conf` points `zenapi.bibiota.com` → `localhost:8090` and `zenbill.bibiota.com` → static `frontend/dist/`
- Starting/stopping services affects both environments

Target state:
- `docker-compose.yml` = shared DB + PGAdmin only
- `docker-compose.dev.yml` = dev API (8090) + dev Worker
- `docker-compose.prod.yml` = prod API (8091) + prod Worker
- `.env.dev` and `.env.prod` = separate env files
- Nginx updated: `zenapi.bibiota.com` → `localhost:8091`, `zenbill.bibiota.com` → `localhost:4173`
- Makefile shortcuts for both envs

---

### Task 1: Create Base docker-compose.yml (shared infrastructure)

**Why:** Extract PostgreSQL and PGAdmin into a base file that both dev and prod compose files extend.

**Files:**
- Modify: `backend/docker-compose.yml`

**Step 1: Replace docker-compose.yml with base-only services**

Replace the entire file with only DB, PGAdmin, network, and volumes:

```yaml
# Base infrastructure shared by dev and prod environments.
# Usage:
#   Dev:  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
#   Prod: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

services:
  db:
    image: postgres:16-alpine
    container_name: zenbill_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: zenbill_db
      POSTGRES_USER: zenbill
      POSTGRES_PASSWORD: zenbill_dev_password
      PGDATA: /var/lib/postgresql/data/pgdata
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - zenbill_network
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U zenbill -d zenbill_db" ]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: zenbill_pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin
      PGADMIN_CONFIG_SERVER_MODE: 'False'
    ports:
      - "5050:80"
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    networks:
      - zenbill_network
    depends_on:
      - db

networks:
  zenbill_network:
    driver: bridge

volumes:
  postgres_data:
    driver: local
  pgadmin_data:
    driver: local
```

**Step 2: Verify the file is valid YAML**

Run: `cd /Users/yuki/projects/zen-bill/backend && docker compose -f docker-compose.yml config --services`
Expected output:
```
db
pgadmin
```

---

### Task 2: Create docker-compose.dev.yml

**Why:** Dev environment with API on port 8090, dev env vars, and Air hot reload.

**Files:**
- Create: `backend/docker-compose.dev.yml`

**Step 1: Create the dev compose file**

```yaml
# Development environment override.
# Usage: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

services:
  api-dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: zenbill_api_dev
    restart: unless-stopped
    env_file: .env.dev
    ports:
      - "127.0.0.1:8090:8090"
    volumes:
      - .:/app
      - ./sessions:/app/sessions
    networks:
      - zenbill_network
    depends_on:
      db:
        condition: service_healthy
    command: [ "air", "-c", ".air.toml" ]

  worker-dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: zenbill_worker_dev
    restart: unless-stopped
    env_file: .env.dev
    volumes:
      - .:/app
      - ./sessions:/app/sessions
    networks:
      - zenbill_network
    depends_on:
      db:
        condition: service_healthy
    command: [ "air", "-c", ".air.worker.toml" ]
```

**Step 2: Verify combined config**

Run: `cd /Users/yuki/projects/zen-bill/backend && docker compose -f docker-compose.yml -f docker-compose.dev.yml config --services`
Expected output:
```
db
pgadmin
api-dev
worker-dev
```

---

### Task 3: Create docker-compose.prod.yml

**Why:** Prod environment with API on port 8091, prod env vars, and Air hot reload.

**Files:**
- Create: `backend/docker-compose.prod.yml`

**Step 1: Create the prod compose file**

```yaml
# Production environment override.
# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

services:
  api-prod:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: zenbill_api_prod
    restart: unless-stopped
    env_file: .env.prod
    ports:
      - "127.0.0.1:8091:8091"
    volumes:
      - .:/app
      - ./sessions:/app/sessions
    networks:
      - zenbill_network
    depends_on:
      db:
        condition: service_healthy
    command: [ "air", "-c", ".air.toml" ]

  worker-prod:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: zenbill_worker_prod
    restart: unless-stopped
    env_file: .env.prod
    volumes:
      - .:/app
      - ./sessions:/app/sessions
    networks:
      - zenbill_network
    depends_on:
      db:
        condition: service_healthy
    command: [ "air", "-c", ".air.worker.toml" ]
```

**Step 2: Verify combined config**

Run: `cd /Users/yuki/projects/zen-bill/backend && docker compose -f docker-compose.yml -f docker-compose.prod.yml config --services`
Expected output:
```
db
pgadmin
api-prod
worker-prod
```

---

### Task 4: Create .env.dev and .env.prod

**Why:** Separate environment variables so dev and prod don't share config.

**Files:**
- Create: `backend/.env.dev` (from current `.env`, with dev-specific values)
- Create: `backend/.env.prod` (from current `.env`, with prod-specific values)
- Modify: `backend/.gitignore` (ensure `.env.dev` and `.env.prod` are ignored)

**Step 1: Create .env.dev**

Copy the current `.env` file and set dev-specific values:

```bash
# ZenBill Development Environment
# Used by: docker compose -f docker-compose.yml -f docker-compose.dev.yml

# Application
ZENBILL_APP_ENV=development
ZENBILL_APP_DEBUG=true
ZENBILL_APP_PORT=8090

# Database (Docker internal hostname)
ZENBILL_DB_HOST=db
ZENBILL_DB_PORT=5432
ZENBILL_DB_USER=zenbill
ZENBILL_DB_PASSWORD=zenbill_dev_password
ZENBILL_DB_NAME=zenbill_db
ZENBILL_DB_SSLMODE=disable

# Logging
ZENBILL_LOGGER_LEVEL=debug
ZENBILL_LOGGER_FORMAT=json
ZENBILL_LOGGER_OUTPUT_PATH=stdout
ZENBILL_LOGGER_ADD_SOURCE=true

# E-Invoice Platform
ZENBILL_EINVOICE_PHONE_BARCODE=0917923382
ZENBILL_EINVOICE_VERIFICATION_CODE=REDACTED_VERIFICATION_CODE
ZENBILL_EINVOICE_PHONE=0917923382
ZENBILL_EINVOICE_VERIFY_CODE=REDACTED_VERIFICATION_CODE

# Cron Schedule
ZENBILL_CRON_INVOICE_SYNC="0 2 * * *"

# Authentication - DEV URLs
ZENBILL_AUTH_JWT_SECRET=REDACTED_JWT_SECRET
ZENBILL_AUTH_FRONTEND_CALLBACK_URL=http://localhost:5173/auth/callback
ZENBILL_AUTH_API_BASE_URL=http://localhost:8090

# SMTP
ZENBILL_SMTP_HOST=smtp.gmail.com
ZENBILL_SMTP_PORT=587
ZENBILL_SMTP_USERNAME=yukiotataitien@gmail.com
ZENBILL_SMTP_PASSWORD="REDACTED_SMTP_PASSWORD"
ZENBILL_SMTP_FROM=noreply@zenbill.dev

# Credential Encryption
ZENBILL_CREDENTIAL_ENCRYPTION_KEY=REDACTED_ENCRYPTION_KEY
ZENBILL_CREDENTIAL_KEY_ID=v1

# Worker
ZENBILL_WORKER_SYNC_SCHEDULE="0 3 * * *"
ZENBILL_WORKER_AUTOPAY_SCHEDULE="0 10 * * *"
ZENBILL_WORKER_SYNC_DAYS_BACK=7

# Scraper
ZENBILL_SCRAPER_HEADLESS=true
ZENBILL_SCRAPER_TIMEOUT=60s
ZENBILL_SCRAPER_SESSION_DIR=./sessions

# CORS - DEV
ZENBILL_CORS_ALLOWED_ORIGINS=http://localhost:5173
```

**Step 2: Create .env.prod**

Same base, but with production-specific values:

```bash
# ZenBill Production Environment
# Used by: docker compose -f docker-compose.yml -f docker-compose.prod.yml

# Application
ZENBILL_APP_ENV=production
ZENBILL_APP_DEBUG=false
ZENBILL_APP_PORT=8091

# Database (Docker internal hostname)
ZENBILL_DB_HOST=db
ZENBILL_DB_PORT=5432
ZENBILL_DB_USER=zenbill
ZENBILL_DB_PASSWORD=zenbill_dev_password
ZENBILL_DB_NAME=zenbill_db
ZENBILL_DB_SSLMODE=disable

# Logging
ZENBILL_LOGGER_LEVEL=info
ZENBILL_LOGGER_FORMAT=json
ZENBILL_LOGGER_OUTPUT_PATH=stdout
ZENBILL_LOGGER_ADD_SOURCE=false

# E-Invoice Platform
ZENBILL_EINVOICE_PHONE_BARCODE=0917923382
ZENBILL_EINVOICE_VERIFICATION_CODE=REDACTED_VERIFICATION_CODE
ZENBILL_EINVOICE_PHONE=0917923382
ZENBILL_EINVOICE_VERIFY_CODE=REDACTED_VERIFICATION_CODE

# Cron Schedule
ZENBILL_CRON_INVOICE_SYNC="0 2 * * *"

# Authentication - PROD URLs
ZENBILL_AUTH_JWT_SECRET=REDACTED_JWT_SECRET
ZENBILL_AUTH_FRONTEND_CALLBACK_URL=https://zenbill.bibiota.com/auth/callback
ZENBILL_AUTH_API_BASE_URL=https://zenapi.bibiota.com

# SMTP
ZENBILL_SMTP_HOST=smtp.gmail.com
ZENBILL_SMTP_PORT=587
ZENBILL_SMTP_USERNAME=yukiotataitien@gmail.com
ZENBILL_SMTP_PASSWORD="REDACTED_SMTP_PASSWORD"
ZENBILL_SMTP_FROM=noreply@zenbill.dev

# Credential Encryption
ZENBILL_CREDENTIAL_ENCRYPTION_KEY=REDACTED_ENCRYPTION_KEY
ZENBILL_CREDENTIAL_KEY_ID=v1

# Worker
ZENBILL_WORKER_SYNC_SCHEDULE="0 3 * * *"
ZENBILL_WORKER_AUTOPAY_SCHEDULE="0 10 * * *"
ZENBILL_WORKER_SYNC_DAYS_BACK=7

# Scraper
ZENBILL_SCRAPER_HEADLESS=true
ZENBILL_SCRAPER_TIMEOUT=60s
ZENBILL_SCRAPER_SESSION_DIR=./sessions

# CORS - PROD
ZENBILL_CORS_ALLOWED_ORIGINS=https://zenbill.bibiota.com
```

**Step 3: Ensure .env.dev and .env.prod are in .gitignore**

Check `backend/.gitignore` — if it already has `.env`, the new files with `.env.*` pattern may not be covered. Add explicit entries if needed:

```
.env
.env.dev
.env.prod
```

**Step 4: Commit**

```bash
git add backend/.env.dev backend/.env.prod backend/.gitignore
git commit -m "chore: create separate .env.dev and .env.prod for environment separation"
```

Note: `.env.dev` and `.env.prod` contain secrets. If `.gitignore` excludes them, create `.env.dev.example` and `.env.prod.example` with placeholder values instead, and commit those.

---

### Task 5: Update Makefile with dev/prod commands

**Why:** Provide short `make dev` / `make prod` commands instead of long `docker compose -f ... -f ...` invocations.

**Files:**
- Modify: `backend/Makefile`

**Step 1: Replace the Makefile**

Replace the existing Makefile with updated targets. Keep all existing non-docker targets unchanged, replace docker targets:

```makefile
.PHONY: help build run-api run-worker test test-integration lint dev dev-down dev-logs prod prod-down prod-logs frontend-dev frontend-prod docker-up docker-build migrate clean tidy db-backup db-restore db-backup-install

# CGO 設定（用於 Tesseract OCR 與 OpenCV）
export CGO_CPPFLAGS=-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include -I/opt/homebrew/opt/opencv/include
export CGO_LDFLAGS=-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib -L/opt/homebrew/opt/opencv/lib

# Docker Compose 指令簡寫
DC_DEV  = docker compose -f docker-compose.yml -f docker-compose.dev.yml
DC_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml

# 預設目標
help:
	@echo "ZenBill Backend - 可用指令："
	@echo ""
	@echo "  === 環境管理 ==="
	@echo "  make dev              - 啟動開發環境 (DB + API:8090 + Worker)"
	@echo "  make dev-down         - 停止開發環境"
	@echo "  make dev-logs         - 查看開發環境日誌"
	@echo "  make prod             - 啟動正式環境 (DB + API:8091 + Worker)"
	@echo "  make prod-down        - 停止正式環境"
	@echo "  make prod-logs        - 查看正式環境日誌"
	@echo ""
	@echo "  === 前端 ==="
	@echo "  make frontend-dev     - 啟動前端開發 (port 5173)"
	@echo "  make frontend-prod    - 啟動前端正式 (port 4173)"
	@echo ""
	@echo "  === 基礎建設 ==="
	@echo "  make docker-up        - 僅啟動資料庫服務"
	@echo "  make docker-build     - 建構 Docker Image"
	@echo ""
	@echo "  === 開發工具 ==="
	@echo "  make build            - 編譯所有程式"
	@echo "  make run-api          - 本機啟動 API Server"
	@echo "  make run-worker       - 本機啟動 Worker"
	@echo "  make test             - 執行單元測試"
	@echo "  make test-integration - 執行整合測試"
	@echo "  make lint             - 執行程式碼檢查"
	@echo "  make migrate          - 執行資料庫遷移"
	@echo "  make clean            - 清除編譯快取"
	@echo "  make tidy             - 整理依賴"
	@echo ""
	@echo "  === 資料庫 ==="
	@echo "  make db-backup        - 手動執行資料庫備份"
	@echo "  make db-restore       - 從備份還原資料庫"
	@echo "  make db-backup-install - 安裝每日自動備份排程"

# === 開發環境 ===
dev:
	@echo "🐳 啟動開發環境..."
	@$(DC_DEV) up -d
	@echo "✅ 開發環境啟動完成！"
	@echo "   📋 API Server: http://localhost:8090"
	@echo "   📋 Health Check: http://localhost:8090/health"
	@echo "   📋 pgAdmin: http://localhost:5050"
	@echo "   💡 修改程式碼後會自動重新編譯"

dev-down:
	@echo "🐳 停止開發環境..."
	@$(DC_DEV) down

dev-logs:
	@$(DC_DEV) logs -f api-dev worker-dev

# === 正式環境 ===
prod:
	@echo "🐳 啟動正式環境..."
	@$(DC_PROD) up -d
	@echo "✅ 正式環境啟動完成！"
	@echo "   📋 API Server: http://localhost:8091"
	@echo "   📋 Health Check: http://localhost:8091/health"
	@echo "   📋 Frontend: https://zenbill.bibiota.com"
	@echo "   💡 修改程式碼後會自動重新編譯"

prod-down:
	@echo "🐳 停止正式環境..."
	@$(DC_PROD) down

prod-logs:
	@$(DC_PROD) logs -f api-prod worker-prod

# === 前端 ===
frontend-dev:
	@echo "🚀 啟動前端開發環境 (port 5173)..."
	@cd ../frontend && npm run dev

frontend-prod:
	@echo "🚀 啟動前端正式環境 (port 4173)..."
	@cd ../frontend && VITE_API_BASE_URL=https://zenapi.bibiota.com npx vite --port 4173

# === 基礎建設 ===
docker-up:
	@echo "🐳 啟動資料庫服務..."
	@docker compose up -d db pgadmin
	@echo "⏳ 等待資料庫啟動..."
	@sleep 3
	@echo "✅ PostgreSQL: localhost:5432"
	@echo "✅ pgAdmin: http://localhost:5050"

docker-build:
	@echo "🐳 建構 Docker Image..."
	@$(DC_DEV) build
	@$(DC_PROD) build

# === 開發工具 (unchanged) ===
build:
	@echo "編譯 ZenBill..."
	@go build -o bin/api ./cmd/api
	@go build -o bin/worker ./cmd/worker
	@go build -o bin/migrate ./cmd/migrate
	@echo "✅ 編譯完成！執行檔位於 bin/ 目錄"

run-api:
	@echo "🚀 啟動 API Server..."
	@go run ./cmd/api/main.go

run-worker:
	@echo "🚀 啟動 Worker..."
	@go run ./cmd/worker/main.go

test:
	@echo "🧪 執行單元測試..."
	@go test ./... -v -cover

test-integration:
	@echo "🧪 執行整合測試..."
	@echo "⚠️  確保 PostgreSQL 已啟動（make docker-up）"
	@ZENBILL_DB_PASSWORD=zenbill_dev_password go test -tags=integration -v ./internal/usecase ./internal/repository

lint:
	@echo "🔍 執行程式碼檢查..."
	@golangci-lint run

migrate:
	@echo "📊 執行資料庫遷移..."
	@go run ./cmd/migrate/main.go

clean:
	@echo "🧹 清除編譯快取..."
	@go clean -cache
	@rm -rf bin/ tmp/
	@echo "✅ 清除完成"

tidy:
	@echo "📦 整理 Go 模組依賴..."
	@go mod tidy
	@echo "✅ 依賴整理完成"

# === 資料庫 ===
db-backup:
	@scripts/db-backup.sh

db-restore:
	@scripts/db-restore.sh

db-backup-install:
	@scripts/install-backup-schedule.sh
```

**Step 2: Verify Makefile syntax**

Run: `cd /Users/yuki/projects/zen-bill/backend && make help`
Expected: Help text displays without errors.

**Step 3: Commit**

```bash
git add backend/Makefile
git commit -m "chore: update Makefile with dev/prod environment commands"
```

---

### Task 6: Update Nginx config for prod ports

**Why:** Nginx currently proxies `zenapi.bibiota.com` to port 8090 (dev) and serves static files for `zenbill.bibiota.com`. After separation, prod API runs on 8091 and prod frontend is a Vite dev server on 4173.

**Files:**
- Modify: `/opt/homebrew/etc/nginx/servers/zenbill.conf`

**Step 1: Update Nginx config**

```nginx
# ZenBill Frontend (Production) - Vite dev server
server {
    listen 8888;
    server_name zenbill.bibiota.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket support for Vite HMR
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# ZenBill API (Production)
server {
    listen 8888;
    server_name zenapi.bibiota.com;

    location / {
        proxy_pass http://127.0.0.1:8091;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

Key changes:
- `zenbill.bibiota.com`: Changed from static file serving (`root .../dist`) to proxy to Vite dev server (`proxy_pass http://127.0.0.1:4173`). Added WebSocket headers for Vite HMR.
- `zenapi.bibiota.com`: Changed `proxy_pass` from port 8090 to 8091.

**Step 2: Test and reload Nginx**

Run: `nginx -t && brew services restart nginx`
Expected: `nginx: configuration file ... test is successful`

---

### Task 7: Stop old containers and start new environments

**Why:** The old `zenbill_api` and `zenbill_worker` containers from the original docker-compose.yml need to be stopped before starting the new separate environments.

**Files:** None (runtime operations only)

**Step 1: Stop old containers**

```bash
cd /Users/yuki/projects/zen-bill/backend
docker stop zenbill_api zenbill_worker 2>/dev/null || true
docker rm zenbill_api zenbill_worker 2>/dev/null || true
```

**Step 2: Start dev environment**

```bash
make dev
```

Expected: `zenbill_postgres`, `zenbill_pgadmin`, `zenbill_api_dev`, `zenbill_worker_dev` all running.

**Step 3: Start prod environment**

```bash
make prod
```

Expected: `zenbill_api_prod`, `zenbill_worker_prod` also running (DB and PGAdmin already up from dev).

**Step 4: Verify both APIs respond**

```bash
curl -s http://localhost:8090/health | jq .
curl -s http://localhost:8091/health | jq .
```

Expected: Both return `{"status":"ok"}` with different `env` values.

**Step 5: Start both frontends (in separate terminals)**

Terminal 1:
```bash
make frontend-dev
```
Expected: Vite dev server on `http://localhost:5173`

Terminal 2:
```bash
make frontend-prod
```
Expected: Vite dev server on `http://localhost:4173`

**Step 6: Verify CORS for each environment**

```bash
# Dev CORS
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8090/api/v1/auth/login \
  -H "Content-Type: application/json" -H "Origin: http://localhost:5173" \
  -d '{"email":"test@example.com"}'
# Expected: 200

# Prod CORS
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" -H "Origin: https://zenbill.bibiota.com" \
  -d '{"email":"test@example.com"}'
# Expected: 200
```

**Step 7: Commit all changes**

```bash
cd /Users/yuki/projects/zen-bill
git add backend/docker-compose.yml backend/docker-compose.dev.yml backend/docker-compose.prod.yml backend/Makefile
git commit -m "feat: separate dev and prod Docker Compose environments

- Base docker-compose.yml: shared DB + PGAdmin
- docker-compose.dev.yml: dev API (8090) + dev Worker
- docker-compose.prod.yml: prod API (8091) + prod Worker
- Makefile: make dev / make prod shortcuts
- Nginx: updated to proxy prod domains to new ports"
```
