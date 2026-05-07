# ZenBill Cloudflare Domain Setup - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy ZenBill frontend at `zenbill.bibiota.com` and API at `zenapi.bibiota.com` via Nginx + Cloudflare Tunnel on Mac Mini.

**Architecture:** Cloudflare handles DNS + SSL. Traffic flows through an existing remotely-managed Cloudflare Tunnel to Nginx on port 80, which routes by `server_name` — serving frontend static files or proxying to the Go API on port 8090.

**Tech Stack:** Nginx (brew), Cloudflare Tunnel (remotely managed, already running), Vite (frontend build), Gin + gin-contrib/cors (backend)

---

## Task 1: Add CORS middleware to Go backend

The frontend (`zenbill.bibiota.com`) and API (`zenapi.bibiota.com`) are on different subdomains, so cross-origin requests will be blocked without CORS headers. Currently there is zero CORS configuration.

**Files:**
- Modify: `backend/cmd/api/main.go:1-216`
- Modify: `backend/internal/config/config.go:12-23, 86-93, 189-248`
- Modify: `backend/.env.example`

**Step 1: Add gin-contrib/cors dependency**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go get github.com/gin-contrib/cors
```

**Step 2: Add CORS config to config struct**

In `backend/internal/config/config.go`, add a new field to `Config` and a new struct:

```go
// In Config struct (line ~13), add:
CORS CORSConfig `mapstructure:"cors"`

// New struct:
type CORSConfig struct {
    AllowedOrigins []string `mapstructure:"allowed_origins"`
}
```

In `setDefaults()` add:
```go
v.SetDefault("cors.allowed_origins", []string{"http://localhost:5173"})
```

Bind the env var in `Load()`:
```go
v.BindEnv("cors.allowed_origins", "ZENBILL_CORS_ALLOWED_ORIGINS")
```

**Step 3: Add CORS middleware to Gin router**

In `backend/cmd/api/main.go`, after `router := gin.Default()` (line 164), add:

```go
import "github.com/gin-contrib/cors"

// After router := gin.Default()
router.Use(cors.New(cors.Config{
    AllowOrigins:     cfg.CORS.AllowedOrigins,
    AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
    ExposeHeaders:    []string{"Content-Length"},
    AllowCredentials: true,
    MaxAge:           12 * time.Hour,
}))
```

**Step 4: Update .env.example**

Add to `backend/.env.example`:
```
# CORS Configuration
ZENBILL_CORS_ALLOWED_ORIGINS=http://localhost:5173
# Production: ZENBILL_CORS_ALLOWED_ORIGINS=https://zenbill.bibiota.com
```

**Step 5: Update production .env**

In the actual `.env` file used by docker-compose, set:
```
ZENBILL_CORS_ALLOWED_ORIGINS=https://zenbill.bibiota.com
```

**Step 6: Verify backend compiles**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/api/
```
Expected: no errors.

**Step 7: Commit**

```bash
git add internal/config/config.go cmd/api/main.go .env.example go.mod go.sum
git commit -m "feat: add CORS middleware for cross-origin API access"
```

---

## Task 2: Make frontend API base URL configurable

Currently `frontend/src/lib/api.ts` has a hardcoded `BASE_URL = '/api/v1'`. For production, API calls need to go to `https://zenapi.bibiota.com/api/v1`.

**Files:**
- Modify: `frontend/src/lib/api.ts:1`

**Step 1: Use Vite env var for API base URL**

Replace line 1 of `frontend/src/lib/api.ts`:

```typescript
// Before:
const BASE_URL = '/api/v1'

// After:
const BASE_URL = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`
```

This way:
- **Development** (no env var set): `BASE_URL = '/api/v1'` → Vite proxy handles it
- **Production** (`VITE_API_BASE_URL=https://zenapi.bibiota.com`): `BASE_URL = 'https://zenapi.bibiota.com/api/v1'`

**Step 2: Verify dev still works**

Run:
```bash
cd /Users/yuki/projects/zen-bill/frontend && npx vite build
```
Expected: build succeeds with no errors.

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill/frontend
git add src/lib/api.ts
git commit -m "feat: make API base URL configurable via VITE_API_BASE_URL"
```

---

## Task 3: Build frontend for production

**Files:**
- Output: `frontend/dist/` (built static files)

**Step 1: Build with production env var**

```bash
cd /Users/yuki/projects/zen-bill/frontend
VITE_API_BASE_URL=https://zenapi.bibiota.com npm run build
```

Expected: Build succeeds, `dist/` directory contains `index.html` and hashed JS/CSS assets.

**Step 2: Verify the env var was baked in**

```bash
grep -r "zenapi.bibiota.com" /Users/yuki/projects/zen-bill/frontend/dist/
```

Expected: The domain should appear in one of the JS bundles.

**Step 3: Do NOT commit dist/**

The `dist/` directory should already be in `.gitignore`. Verify:
```bash
grep "dist" /Users/yuki/projects/zen-bill/frontend/.gitignore
```

---

## Task 4: Install and configure Nginx

**Step 1: Install Nginx via Homebrew**

```bash
brew install nginx
```

Expected: Nginx installed to `/opt/homebrew/etc/nginx/`.

**Step 2: Find Nginx config directory**

```bash
ls /opt/homebrew/etc/nginx/
```

Expected: `nginx.conf` and `servers/` directory exist.

**Step 3: Create ZenBill Nginx config**

Create file `/opt/homebrew/etc/nginx/servers/zenbill.conf`:

```nginx
# ZenBill Frontend
server {
    listen 80;
    server_name zenbill.bibiota.com;

    root /Users/yuki/projects/zen-bill/frontend/dist;
    index index.html;

    # SPA routing - all paths fall back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-term cache for hashed static assets (Vite adds content hash to filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_types text/html text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;
}

# ZenBill API Proxy
server {
    listen 80;
    server_name zenapi.bibiota.com;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

**Step 4: Test Nginx config syntax**

```bash
nginx -t
```

Expected: `syntax is ok`, `test is successful`.

**Step 5: Start Nginx**

```bash
brew services start nginx
```

Expected: Service starts successfully.

**Step 6: Verify Nginx is running**

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Host: zenbill.bibiota.com" http://localhost:80/
```

Expected: `200` (serves index.html).

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Host: zenapi.bibiota.com" http://localhost:80/health
```

Expected: `200` (proxied to Go API health check).

---

## Task 5: Configure Cloudflare Tunnel public hostnames

The tunnel is **remotely managed** (token-based, no local config.yml). Configuration is done via the Cloudflare Zero Trust Dashboard.

**Step 1: Open Cloudflare Zero Trust Dashboard**

Navigate to: `https://one.dash.cloudflare.com/` → Networks → Tunnels → select the active tunnel (`d2dea21c-...`).

**Step 2: Add public hostname for frontend**

Click "Public Hostname" tab → "Add a public hostname":
- **Subdomain:** `zenbill`
- **Domain:** `bibiota.com`
- **Service Type:** `HTTP`
- **URL:** `localhost:80`

Save.

**Step 3: Add public hostname for API**

Click "Add a public hostname" again:
- **Subdomain:** `zenapi`
- **Domain:** `bibiota.com`
- **Service Type:** `HTTP`
- **URL:** `localhost:80`

Save.

**Step 4: Verify DNS records were auto-created**

Go to Cloudflare main dashboard → `bibiota.com` → DNS → Records.

Verify two CNAME records exist:
- `zenbill` → `<tunnel-id>.cfargotunnel.com` (Proxied)
- `zenapi` → `<tunnel-id>.cfargotunnel.com` (Proxied)

**Step 5: Check SSL/TLS mode**

Go to `bibiota.com` → SSL/TLS → Overview.

Ensure mode is set to **Full** (not Flexible, not Full (Strict)).

---

## Task 6: Update backend production environment variables

The backend needs updated env vars for production CORS and auth callback URLs.

**Files:**
- Modify: `backend/.env` (the actual env file, not .env.example)

**Step 1: Update CORS origins**

```
ZENBILL_CORS_ALLOWED_ORIGINS=https://zenbill.bibiota.com
```

**Step 2: Update auth callback URL**

```
ZENBILL_AUTH_FRONTEND_CALLBACK_URL=https://zenbill.bibiota.com/auth/callback
ZENBILL_AUTH_API_BASE_URL=https://zenapi.bibiota.com
```

**Step 3: Restart backend containers**

```bash
cd /Users/yuki/projects/zen-bill/backend
docker-compose restart api worker
```

Expected: Containers restart with new env vars.

---

## Task 7: End-to-end verification

**Step 1: Verify frontend loads**

Open browser: `https://zenbill.bibiota.com`

Expected: React app loads, no console errors.

**Step 2: Verify SPA routing**

Navigate to `https://zenbill.bibiota.com/login` directly (type in address bar).

Expected: Login page renders (not a 404).

**Step 3: Verify API health check**

```bash
curl https://zenapi.bibiota.com/health
```

Expected: `{"status":"ok","service":"ZenBill","env":"..."}`.

**Step 4: Verify API calls from frontend**

Open browser DevTools Network tab on `https://zenbill.bibiota.com`.

Trigger an API call (e.g., attempt login). Check that:
- Request goes to `https://zenapi.bibiota.com/api/v1/...`
- No CORS errors in console
- Response headers include `Access-Control-Allow-Origin: https://zenbill.bibiota.com`

**Step 5: Verify CORS preflight**

```bash
curl -X OPTIONS https://zenapi.bibiota.com/api/v1/auth/login \
  -H "Origin: https://zenbill.bibiota.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v 2>&1 | grep -i "access-control"
```

Expected: Response includes:
- `Access-Control-Allow-Origin: https://zenbill.bibiota.com`
- `Access-Control-Allow-Methods: ...POST...`
- `Access-Control-Allow-Headers: ...Content-Type...Authorization...`

---

## Task Summary

| Task | Type | Scope |
|------|------|-------|
| 1. Add CORS middleware | Code change | Backend (Go) |
| 2. Make API URL configurable | Code change | Frontend (TS) |
| 3. Build frontend for production | Build step | Frontend |
| 4. Install and configure Nginx | Infrastructure | Mac Mini |
| 5. Configure Cloudflare Tunnel | Infrastructure | Cloudflare Dashboard (manual) |
| 6. Update backend env vars | Configuration | Backend .env |
| 7. End-to-end verification | Testing | All |

**Dependencies:** Task 1 and 2 are independent (can be done in parallel). Task 3 depends on Task 2. Task 4 depends on Task 3. Task 5 is independent of code tasks. Task 6 depends on Task 1. Task 7 depends on all other tasks.
