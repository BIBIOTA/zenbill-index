# Dev/Prod 環境分離 + 自動化部署設計

## 目標

將 ZenBill 的開發與正式環境完全分離：獨立的資料庫、production-grade Docker images、以及 git push 觸發的自動化部署流程。

## 現狀

- Dev/Prod compose files 已存在，但共用同一個 `zenbill_db` database
- Prod services 仍使用 `Dockerfile.dev`（hot reload with Air）
- 無 production Dockerfile（無 multi-stage build）
- 無 git hooks（只有 `.sample` 文件）
- Dev: API 8090 / Frontend 5173，Prod: API 8091 / Frontend 4173

## 設計

### 1. Database 分離

**同一個 PostgreSQL 容器，兩個 database：**

| Database | 用途 | 連線來源 |
|----------|------|---------|
| `zenbill_dev` | 開發測試 | api-dev, worker-dev |
| `zenbill_prod` | 正式環境 | api-prod, worker-prod |

**初始化流程：**
- 提供 `scripts/init-dual-db.sh` 一次性腳本
- 從現有 `zenbill_db` 執行 `pg_dump` 匯出
- 建立 `zenbill_dev` 和 `zenbill_prod`
- 將 dump 匯入兩邊，確保初始資料一致
- 之後各自獨立運作

**PostgreSQL init script：**
- 放置於 `backend/docker/init-databases.sql`
- 掛載到 `/docker-entrypoint-initdb.d/`
- 自動建立兩個 database（僅首次初始化時執行）

### 2. Production Docker Images

#### Backend — `backend/Dockerfile.prod`

Multi-stage build：

```
Stage 1 (builder): golang:1.25-bookworm
  - 安裝 CGO 依賴 (tesseract, leptonica, opencv)
  - 安裝 Playwright browsers
  - go mod download
  - go build → /app/api, /app/worker, /app/migrate

Stage 2 (runtime): debian:bookworm-slim
  - 只安裝 runtime libraries (libtesseract, libleptonica, libopencv)
  - 複製 compiled binaries from builder
  - 複製 Playwright browsers from builder
  - Image size: ~2GB → ~500MB
```

產出三個 binary：`api`、`worker`、`migrate`。

#### Frontend — `frontend/Dockerfile.prod`

Multi-stage build：

```
Stage 1 (builder): node:22-alpine
  - npm ci
  - npm run build → /app/dist

Stage 2 (runtime): nginx:alpine
  - 複製 dist/ 到 /usr/share/nginx/html
  - 自訂 nginx.conf（SPA routing、API proxy）
  - Image size: ~30MB
```

### 3. Docker Compose 架構

維持現有三檔案結構：

```
docker-compose.yml          ← base (db + pgadmin + network)
docker-compose.dev.yml      ← dev override (Dockerfile.dev, zenbill_dev)
docker-compose.prod.yml     ← prod override (Dockerfile.prod, zenbill_prod)
```

**Base (`docker-compose.yml`) 變更：**
- DB 新增 init script 掛載，建立兩個 database
- 移除硬編碼的 `POSTGRES_DB`，改用 init script

**Dev (`docker-compose.dev.yml`) 變更：**
- `.env.dev` 中 `ZENBILL_DB_NAME=zenbill_dev`

**Prod (`docker-compose.prod.yml`) 變更：**
- 使用 `Dockerfile.prod` 而非 `Dockerfile.dev`
- `.env.prod` 中 `ZENBILL_DB_NAME=zenbill_prod`
- 移除 volume mounts（使用 compiled binary）
- 移除 Air hot reload command

**Port 分配（維持現有）：**

| Service | Dev | Prod |
|---------|-----|------|
| API | 8090 | 8091 |
| Frontend | 5173 | 4173 |
| PostgreSQL | 5432 | 5432 (shared) |
| pgAdmin | 5050 | 5050 (shared) |

### 4. Git Hook 自動部署

#### 架構

```
Bare repo:    /Users/yuki/repos/zen-bill.git
Work tree:    /Users/yuki/projects/zen-bill (既有)

Remote 設定:  git remote add prod /Users/yuki/repos/zen-bill.git

部署流程:     git push prod master
                   ↓
              post-receive hook 觸發
                   ↓
              build → migrate → deploy
```

#### `post-receive` Hook 流程

```bash
1. 檢查是否 push 到 refs/heads/master
2. cd /Users/yuki/projects/zen-bill
3. git pull (從 bare repo 取得最新 code)
4. cd backend
5. docker compose -f docker-compose.yml -f docker-compose.prod.yml build
6. docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api-prod /app/migrate
7. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
8. Health check (curl API endpoint)
9. 輸出部署結果
```

**失敗處理：**
- Build 失敗 → 中止，不影響現有服務
- Migration 失敗 → 中止，不重啟服務
- Health check 失敗 → 輸出警告 log

#### 使用方式

```bash
# 一次性設定
git remote add prod /Users/yuki/repos/zen-bill.git

# 日常部署
git push prod master
```

### 5. Migration 策略

- Prod: 部署腳本中自動執行 `migrate` binary on `zenbill_prod`
- Dev: container 啟動時自動執行 migration on `zenbill_dev`
- Migration 失敗則中止部署，不重啟服務

### 6. 檔案清單

**新增：**
- `backend/Dockerfile.prod` — production multi-stage build
- `frontend/Dockerfile.prod` — frontend production build + nginx
- `frontend/nginx.conf` — nginx 設定（SPA routing）
- `backend/docker/init-databases.sql` — PostgreSQL 初始化腳本
- `scripts/init-dual-db.sh` — 一次性資料遷移腳本
- `scripts/deploy.sh` — 部署腳本（供 hook 呼叫）
- `/Users/yuki/repos/zen-bill.git/hooks/post-receive` — git hook

**修改：**
- `backend/docker-compose.yml` — 新增 init script 掛載
- `backend/docker-compose.prod.yml` — 使用 Dockerfile.prod
- `backend/.env.dev` — `ZENBILL_DB_NAME=zenbill_dev`
- `backend/.env.prod` — `ZENBILL_DB_NAME=zenbill_prod`
