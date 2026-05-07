# ZenBill Cloudflare Domain Setup Design

## Date: 2026-02-24

## Goal

Set up ZenBill production frontend and backend API on Cloudflare domain using Nginx reverse proxy and Cloudflare Tunnel on local Mac Mini.

## Domain Plan

| Service | Domain | Target |
|---------|--------|--------|
| Frontend | `zenbill.bibiota.com` | Nginx → static files (`frontend/dist/`) |
| Backend API | `zenapi.bibiota.com` | Nginx → proxy to `localhost:8090` |

## Architecture

```
Internet → Cloudflare (DNS + SSL) → Cloudflare Tunnel → Nginx (:80) on Mac Mini
                                                          ├── zenbill.bibiota.com → serve frontend/dist/
                                                          └── zenapi.bibiota.com  → proxy_pass localhost:8090
```

- Cloudflare handles SSL termination (browser ↔ Cloudflare)
- Tunnel encrypts traffic (Cloudflare ↔ Mac Mini)
- Nginx listens on HTTP port 80 only (no local SSL needed)
- SSL/TLS mode: Full

## Components

### 1. Nginx (to install via brew)

Two server blocks:

**Frontend** (`zenbill.bibiota.com`):
- Serve `frontend/dist/` as static files
- `try_files $uri $uri/ /index.html` for SPA routing (React Router)
- Long-term cache for hashed static assets (js, css, images)
- Gzip compression

**Backend API** (`zenapi.bibiota.com`):
- `proxy_pass http://127.0.0.1:8090`
- Forward real IP headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`)

### 2. Cloudflare Tunnel Ingress

Both hostnames route to Nginx on port 80:

```yaml
ingress:
  - hostname: zenbill.bibiota.com
    service: http://localhost:80
  - hostname: zenapi.bibiota.com
    service: http://localhost:80
  - service: http_status:404
```

### 3. Cloudflare DNS

- `zenbill.bibiota.com` → CNAME → `<tunnel-id>.cfargotunnel.com` (Proxied)
- `zenapi.bibiota.com` → CNAME → `<tunnel-id>.cfargotunnel.com` (Proxied)

If managed via Cloudflare Dashboard, DNS records are auto-created when adding public hostnames to the tunnel.

### 4. Frontend Environment

- Add `VITE_API_BASE_URL` environment variable support
- Development: `/api` (Vite proxy)
- Production: `https://zenapi.bibiota.com`
- Build command: `VITE_API_BASE_URL=https://zenapi.bibiota.com npm run build`

### 5. Backend CORS

- Go API needs to allow `https://zenbill.bibiota.com` as CORS origin
- Required because frontend and API are on different subdomains

## Implementation Steps

1. Install Nginx via `brew install nginx`
2. Create Nginx config with two server blocks
3. Start Nginx via `brew services start nginx`
4. Configure Cloudflare Tunnel ingress (add two hostname routes)
5. Configure Cloudflare DNS (two CNAME records)
6. Add `VITE_API_BASE_URL` support to frontend API client
7. Build frontend with production environment variable
8. Update backend CORS to allow `https://zenbill.bibiota.com`
9. Verify: frontend loads, API calls work, SPA routing works

## Out of Scope

- Production Dockerfile (keep using docker-compose dev setup for now)
- CI/CD pipeline
- Monitoring / alerting
- Rate limiting (Cloudflare provides basic protection)
