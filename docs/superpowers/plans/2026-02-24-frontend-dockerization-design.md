# Frontend Dockerization Design

## Goal

將 dev 和 prod 的 frontend (Vite + React) 容器化，讓 `make dev` / `make prod` 一條指令啟動所有服務。

## Architecture

單一 `frontend/Dockerfile.dev` 基於 `node:22-alpine`，dev/prod 共用 image，透過不同 command 和環境變數區分。

| Environment | Container | Port | Command | Env |
|-------------|-----------|------|---------|-----|
| Dev | `zenbill_frontend_dev` | 5173 | `npx vite --host` | (proxy to api-dev) |
| Prod | `zenbill_frontend_prod` | 4173 | `npx vite --host --port 4173` | `VITE_API_BASE_URL=https://zenapi.bibiota.com` |

## Key Decisions

1. **Volume mount `../frontend:/app`** — enables HMR (edit locally → container detects → browser updates)
2. **`--host 0.0.0.0`** — Vite must bind all interfaces inside container
3. **Named volume for `node_modules`** — prevents macOS/Linux binary mismatch
4. **Dev proxy target** — change from `localhost:8090` to `http://api-dev:8090` (Docker internal network)
5. **`restart: unless-stopped`** — both containers auto-recover on crash

## Files Changed

```
frontend/
  Dockerfile.dev              ← NEW

backend/
  docker-compose.dev.yml      ← ADD frontend-dev service
  docker-compose.prod.yml     ← ADD frontend-prod service
  docker-compose.yml          ← ADD frontend volume definitions
  Makefile                    ← UPDATE logs commands, remove manual frontend targets
```

## Traffic Flow (Prod)

```
Browser → Cloudflare → Tunnel → Nginx:8888
  ├── zenbill.bibiota.com  → frontend-prod:4173
  └── zenapi.bibiota.com   → api-prod:8091
```
