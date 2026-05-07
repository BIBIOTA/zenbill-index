# Environment Separation Design

**Date:** 2026-02-24
**Goal:** Split production and development services into independent Docker Compose stacks with separate configs, both supporting hot reload.

## Problem

- Single `docker-compose.yml` serves both dev and prod — starting/stopping one affects the other
- `.env` mixes production URLs (`zenbill.bibiota.com`) with dev values (`localhost:5173`)
- No clear way to run both environments simultaneously

## Architecture

Both environments run on the same Mac Mini, sharing one PostgreSQL instance but using separate API/Worker containers on different ports.

```
Mac Mini
├── Shared (docker-compose.yml)
│   ├── zenbill_postgres    (port 5432)
│   └── zenbill_pgadmin     (port 5050)
│
├── Dev (docker-compose.dev.yml)
│   ├── zenbill_api_dev     (port 8090, Air hot reload)
│   ├── zenbill_worker_dev  (Air hot reload)
│   └── Frontend            (npm run dev, port 5173)
│
├── Prod (docker-compose.prod.yml)
│   ├── zenbill_api_prod    (port 8091, Air hot reload)
│   ├── zenbill_worker_prod (Air hot reload)
│   └── Frontend            (npm run dev --port 4173)
│
└── Nginx
    ├── zenbill.bibiota.com  → localhost:4173
    └── zenapi.bibiota.com   → localhost:8091
```

## Approach: Docker Compose Override Files

Use Docker Compose's multi-file mechanism to share base infrastructure while separating environment-specific services.

**Base** (`docker-compose.yml`): PostgreSQL, PGAdmin, network definition
**Dev** (`docker-compose.dev.yml`): API + Worker with dev env vars, port 8090
**Prod** (`docker-compose.prod.yml`): API + Worker with prod env vars, port 8091

Launch commands:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d   # Dev
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d  # Prod
```

## File Structure

```
backend/
├── docker-compose.yml          # Base: DB + PGAdmin + Network
├── docker-compose.dev.yml      # Dev: api-dev + worker-dev
├── docker-compose.prod.yml     # Prod: api-prod + worker-prod
├── .env.dev                    # Dev environment variables
├── .env.prod                   # Prod environment variables
└── Makefile                    # dev/prod shortcut commands
```

## Environment Variables

| Variable | `.env.dev` | `.env.prod` |
|----------|-----------|------------|
| `ZENBILL_APP_PORT` | 8090 | 8091 |
| `ZENBILL_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | `https://zenbill.bibiota.com` |
| `ZENBILL_AUTH_FRONTEND_CALLBACK_URL` | `http://localhost:5173/auth/callback` | `https://zenbill.bibiota.com/auth/callback` |
| `ZENBILL_AUTH_API_BASE_URL` | `http://localhost:8090` | `https://zenapi.bibiota.com` |

Shared values (DB credentials, JWT secret, Resend API key, etc.) remain in both files.

## Container Naming

- Dev: `zenbill_api_dev`, `zenbill_worker_dev`
- Prod: `zenbill_api_prod`, `zenbill_worker_prod`
- Shared: `zenbill_postgres`, `zenbill_pgadmin`

## Makefile Commands

```makefile
make dev            # Start DB + dev API + dev Worker
make dev-down       # Stop dev services
make dev-logs       # View dev logs

make prod           # Start DB + prod API + prod Worker
make prod-down      # Stop prod services
make prod-logs      # View prod logs

make frontend-dev   # npm run dev (port 5173)
make frontend-prod  # VITE_API_BASE_URL=https://zenapi.bibiota.com npm run dev -- --port 4173
```

## Frontend

Both environments use `npm run dev` (Vite dev server with hot reload):
- **Dev:** port 5173, API proxy to localhost:8090
- **Prod:** port 4173, `VITE_API_BASE_URL=https://zenapi.bibiota.com` (direct API calls, no proxy)

## Decisions

- **Database not separated** — same `zenbill_db` used by both envs (user confirmed this is acceptable)
- **Both envs use Air hot reload** — even prod, since it runs on a personal dev machine
- **Vite dev server for prod frontend** — enables hot reload for prod frontend too
