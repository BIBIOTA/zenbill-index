# Frontend Dockerization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Containerize both dev and prod frontend (Vite + React) so `make dev` / `make prod` starts all services including frontend.

**Architecture:** Single `frontend/Dockerfile.dev` based on `node:22-alpine`, shared by dev and prod. Volume-mount source code for HMR. Named volume for `node_modules` to avoid macOS/Linux binary mismatch. Dev proxy target updated to use Docker internal network hostname.

**Tech Stack:** Docker, Vite 7, Node 22, nginx (existing)

---

### Task 1: Create frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile.dev`

**Step 1: Create the Dockerfile**

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Source code will be volume-mounted at runtime
# This COPY is only for the initial build context (npm ci needs package.json)
# At runtime, the volume mount overrides /app but the named volume preserves /app/node_modules

EXPOSE 5173 4173

CMD ["npx", "vite", "--host"]
```

**Step 2: Verify it builds**

Run: `cd /Users/yuki/projects/zen-bill && docker build -f frontend/Dockerfile.dev frontend/ -t zenbill-frontend-dev`

Expected: Successful build, image created.

**Step 3: Commit**

```bash
git add frontend/Dockerfile.dev
git commit -m "feat: add frontend Dockerfile for dev/prod containerization"
```

---

### Task 2: Update vite.config.ts for Docker network

The dev frontend's `/api` proxy currently targets `localhost:8090`. Inside Docker network, it needs to target the backend container's service name `api-dev`. We use an env var so it works in both local and container contexts.

**Files:**
- Modify: `frontend/vite.config.ts`

**Step 1: Update proxy target to use env var**

Replace the current `server` block in `frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:8090',
        changeOrigin: true,
      },
    },
    allowedHosts: ['yukimac-mini.echo-mercat.ts.net']
  },
})
```

**Step 2: Verify local dev still works**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx vite --host --port 5174`

Expected: Vite starts on 5174, proxy still targets localhost:8090 (env var not set = fallback). Stop it after verifying.

**Step 3: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "feat: make vite proxy target configurable via VITE_DEV_API_PROXY"
```

---

### Task 3: Add frontend-dev to docker-compose.dev.yml

**Files:**
- Modify: `backend/docker-compose.dev.yml`

**Step 1: Add frontend-dev service**

Add to the end of `backend/docker-compose.dev.yml`, inside the `services:` block:

```yaml
  frontend-dev:
    build:
      context: ../frontend
      dockerfile: Dockerfile.dev
    container_name: zenbill_frontend_dev
    restart: unless-stopped
    environment:
      - VITE_DEV_API_PROXY=http://api-dev:8090
    ports:
      - "127.0.0.1:5173:5173"
    volumes:
      - ../frontend:/app
      - frontend_node_modules_dev:/app/node_modules
    networks:
      - zenbill_network

volumes:
  frontend_node_modules_dev:
    driver: local
```

**Step 2: Verify compose config is valid**

Run: `cd /Users/yuki/projects/zen-bill/backend && docker compose -f docker-compose.yml -f docker-compose.dev.yml config --services`

Expected: Lists `db`, `pgadmin`, `api-dev`, `worker-dev`, `frontend-dev`.

**Step 3: Commit**

```bash
git add backend/docker-compose.dev.yml
git commit -m "feat: add frontend-dev service to docker-compose"
```

---

### Task 4: Add frontend-prod to docker-compose.prod.yml

**Files:**
- Modify: `backend/docker-compose.prod.yml`

**Step 1: Add frontend-prod service**

Add to the end of `backend/docker-compose.prod.yml`, inside the `services:` block:

```yaml
  frontend-prod:
    build:
      context: ../frontend
      dockerfile: Dockerfile.dev
    container_name: zenbill_frontend_prod
    restart: unless-stopped
    environment:
      - VITE_API_BASE_URL=https://zenapi.bibiota.com
    ports:
      - "127.0.0.1:4173:4173"
    volumes:
      - ../frontend:/app
      - frontend_node_modules_prod:/app/node_modules
    networks:
      - zenbill_network
    command: ["npx", "vite", "--host", "--port", "4173"]

volumes:
  frontend_node_modules_prod:
    driver: local
```

**Step 2: Verify compose config is valid**

Run: `cd /Users/yuki/projects/zen-bill/backend && docker compose -f docker-compose.yml -f docker-compose.prod.yml config --services`

Expected: Lists `db`, `pgadmin`, `api-prod`, `worker-prod`, `frontend-prod`.

**Step 3: Commit**

```bash
git add backend/docker-compose.prod.yml
git commit -m "feat: add frontend-prod service to docker-compose"
```

---

### Task 5: Update Makefile

**Files:**
- Modify: `backend/Makefile`

**Step 1: Update help, logs, and remove manual frontend targets**

Changes to make:
1. Update `help` section — change frontend description to indicate they're part of docker now
2. Update `dev-logs` to include `frontend-dev`
3. Update `prod-logs` to include `frontend-prod`
4. Replace `frontend-dev` and `frontend-prod` targets with docker-based versions
5. Update `dev` and `prod` echo messages to include frontend port info

Replace the following sections in `backend/Makefile`:

**help section** — update the frontend lines:
```makefile
	@echo "  === 前端 ==="
	@echo "  make frontend-dev-logs  - 查看前端開發日誌"
	@echo "  make frontend-prod-logs - 查看前端正式日誌"
```

**dev target** — add frontend info:
```makefile
dev:
	@echo "🐳 啟動開發環境..."
	@$(DC_DEV) up -d
	@echo "✅ 開發環境啟動完成！"
	@echo "   📋 API Server: http://localhost:8090"
	@echo "   📋 Frontend: http://localhost:5173"
	@echo "   📋 Health Check: http://localhost:8090/health"
	@echo "   📋 pgAdmin: http://localhost:5050"
	@echo "   💡 修改程式碼後會自動重新編譯"
```

**dev-logs target** — include frontend:
```makefile
dev-logs:
	@$(DC_DEV) logs -f api-dev worker-dev frontend-dev
```

**prod target** — add frontend info:
```makefile
prod:
	@echo "🐳 啟動正式環境..."
	@$(DC_PROD) up -d
	@echo "✅ 正式環境啟動完成！"
	@echo "   📋 API Server: http://localhost:8091"
	@echo "   📋 Frontend: http://localhost:4173"
	@echo "   📋 Health Check: http://localhost:8091/health"
	@echo "   📋 Frontend (public): https://zenbill.bibiota.com"
	@echo "   💡 修改程式碼後會自動重新編譯"
```

**prod-logs target** — include frontend:
```makefile
prod-logs:
	@$(DC_PROD) logs -f api-prod worker-prod frontend-prod
```

**Replace frontend targets:**
```makefile
# === 前端 ===
frontend-dev-logs:
	@$(DC_DEV) logs -f frontend-dev

frontend-prod-logs:
	@$(DC_PROD) logs -f frontend-prod
```

**Update .PHONY line** — replace `frontend-dev frontend-prod` with `frontend-dev-logs frontend-prod-logs`.

**Step 2: Verify Makefile syntax**

Run: `cd /Users/yuki/projects/zen-bill/backend && make help`

Expected: Help text shows updated frontend section.

**Step 3: Commit**

```bash
git add backend/Makefile
git commit -m "feat: update Makefile for containerized frontend"
```

---

### Task 6: End-to-end verification

**Step 1: Stop all existing containers**

Run: `cd /Users/yuki/projects/zen-bill/backend && docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.prod.yml down`

**Step 2: Start prod environment**

Run: `cd /Users/yuki/projects/zen-bill/backend && make prod`

**Step 3: Wait for frontend container to be ready**

Run: `docker logs zenbill_frontend_prod --tail 5`

Expected: Vite output showing `Local: http://localhost:4173/`

**Step 4: Verify frontend responds**

Run: `curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:4173`

Expected: `HTTP 200`

**Step 5: Verify Nginx → frontend works (this is what Cloudflare tunnel hits)**

Run: `curl -s -o /dev/null -w "HTTP %{http_code}" -H "Host: zenbill.bibiota.com" http://127.0.0.1:8888`

Expected: `HTTP 200` (was `502 Bad Gateway` before)

**Step 6: Verify API still works**

Run: `curl -s -o /dev/null -w "HTTP %{http_code}" -H "Host: zenapi.bibiota.com" http://127.0.0.1:8888/health`

Expected: `HTTP 200`

**Step 7: Start dev environment too**

Run: `cd /Users/yuki/projects/zen-bill/backend && make dev`

**Step 8: Verify dev frontend**

Run: `curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:5173`

Expected: `HTTP 200`

**Step 9: Verify public URL**

Run: `curl -s -o /dev/null -w "HTTP %{http_code}" https://zenbill.bibiota.com`

Expected: `HTTP 200` (no more Bad Gateway)

**Step 10: Commit any remaining changes if needed, then done**

No commit needed for this task — it's verification only.
