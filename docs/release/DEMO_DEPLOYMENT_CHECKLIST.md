# Energya Connect — Demo Deployment Checklist & Hosting Architecture

## 1. Hosting Architecture Recommendation

### 1.1 Recommended Architecture: Monolithic Containerized App + Managed PostgreSQL
The optimal, lowest-risk deployment architecture for the Energya Connect demo is a **Single-Container Node.js Service** paired with a **Managed PostgreSQL 16 Instance**.

```
                           HTTPS (TLS 443)
                                  │
                                  ▼
                   ┌─────────────────────────────┐
                   │   Cloud Load Balancer /     │
                   │   Reverse Proxy (Ingress)   │
                   └──────────────┬──────────────┘
                                  │ Forward to $PORT (default 3847)
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│               ENERGYA CONNECT APPLICATION CONTAINER             │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │               Node.js Express Server                    │   │
│   │                 (`dist/server.cjs`)                     │   │
│   ├────────────────────────────┬────────────────────────────┤   │
│   │       REST API Routes      │    SPA Static Assets       │   │
│   │       (`/api/*`)           │  (`dist/index.html` + css) │   │
│   └─────────────┬──────────────┴────────────────────────────┘   │
│                 │ (Prisma ORM 6)                                │
└─────────────────┼───────────────────────────────────────────────┘
                  │ PostgreSQL Wire Protocol (Port 5432)
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 MANAGED POSTGRESQL 16 DATABASE                  │
│       (AWS RDS / Azure DB for PG / Railway / Render / Supabase)  │
│                                                                 │
│  - 29 Applied Migrations                                        │
│  - Master Data (Cables, BOMs, Drums, Raw Materials)             │
│  - Costing Formulas, Scrap Rules, FX Tables                     │
│  - Bytea Binary Attachment Storage (<=8 MB)                     │
└─────────────────────────────────────────────────────────────────┘
```

#### Why This Is Optimal:
1. **Zero CORS Issues:** Frontend SPA and Backend API share the same origin (`demo.energyaconnect.com`).
2. **Atomic Releases:** Code changes to API endpoints and frontend React components are packaged and deployed synchronously in a single artifact.
3. **Low Operational Overhead:** No microservice orchestration needed. Compatible with any container platform (AWS ECS / App Runner, Azure App Service / Container Apps, GCP Cloud Run, Railway, Render, or Docker Compose VM).

---

## 2. Production Dockerfile Specification

Optional multi-stage `Dockerfile` (not committed unless operators choose container hosting). Spec retained for PaaS/container builds:

```dockerfile
# ==============================================================================
# STAGE 1: Builder
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy source code and configuration
COPY . .

# Generate Prisma Client & Run Production Build
RUN npx prisma generate
RUN npm run build

# ==============================================================================
# STAGE 2: Production Runtime
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3847

# Install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Copy build artifacts and master data assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/data ./src/data

# Non-root user for security
USER node

EXPOSE 3847

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3847}/api/platform/health || exit 1

CMD ["node", "dist/server.cjs"]
```

Local Postgres-only Compose remains in `docker-compose.yml`.

---

## 3. Pre-Deployment Database Initialization Runbook

Execute these steps once against the target PostgreSQL database before directing traffic:

```bash
# 1. Apply all 29 database schema migrations
npx prisma migrate deploy

# 2. Seed parameter categories and production administrator
#    NODE_ENV=production requires ADMIN_SEED_PASSWORD (non-default)
npx tsx prisma/seed.ts

# 3. Import official Excel Master Data (Raw Materials, Cables, BOMs, Drums)
npx tsx scripts/importAllMasters.ts

# 4. Configure operational costing rules (FX pairs, scrap rates, metal prices)
npx tsx scripts/configureCostingOperationalReadiness.ts
```

---

## 4. Pre-Flight Release Checklist (actual status 2026-08-30)

| Check Item | Action Required | Responsibility | Verification Status |
| :--- | :--- | :--- | :---: |
| **1. Database Provisioning** | Target PostgreSQL 16 instance accessible with `DATABASE_URL` | DevOps / Infra | **MANUAL REQUIRED** — Render Postgres not created (config-only audit) |
| **2. Migrations** | Run `npx prisma migrate deploy` (29 migrations) | DevOps | **MANUAL REQUIRED** — not executed; command documented in `RENDER_SETUP_GUIDE.md` |
| **3. Seed & Masters** | Run `prisma:seed`, `import:masters`, and costing readiness | DevOps / Data Lead | **MANUAL REQUIRED** — Excel sources present; import not executed |
| **4. Secrets Injected** | Set `JWT_SECRET`, `ADMIN_SEED_PASSWORD`, `NODE_ENV=production` | DevOps / Security | **MANUAL REQUIRED** — templates updated; live secrets not injected |
| **5. Build Artifact** | Execute `npm run build` -> generate `dist/` and `dist/server.cjs` | Release Pipeline | **BLOCKED** locally — prior `dist/` on disk; rebuild needs intact `node_modules` |
| **6. Automated Tests** | Execute `npm test` | CI / QA | **BLOCKED** — **LOCAL VALIDATION BLOCKED BY NPM NETWORK ACCESS** |
| **7. Type Check** | Execute `npx tsc --noEmit` | CI / QA | **BLOCKED** — same |
| **8. Health Check** | Verify `GET /api/platform/health` returns `200` with DB ok | Release Lead | **MANUAL REQUIRED** — endpoint exists; no public/local production boot this session |
| **9. Smoke Test** | Execute `docs/release/DEMO_SMOKE_TEST.md` manual walkthrough | Commercial Lead | **MANUAL REQUIRED** |
| **10. DNS & TLS** | Bind `https://demo.energyaconnect.com` with valid TLS | DevOps | **MANUAL REQUIRED** — out of scope for Render config-only prep |
| **11. npm dependency restore** | `npm ci` on network with registry access | DevOps / Dev | **BLOCKER** (local) — empty `node_modules`; do not loop installs here |
| **12. Production security guards** | JWT / admin seed / demo bypass / reset-token flags | Security | **PASS** (code audit + hardening) |
| **13. Render setup guide** | Exact build/start/health/env/A–O steps | DevOps | **PASS** — `docs/release/RENDER_SETUP_GUIDE.md` |
| **14. Git commit gate** | Commit migrations, scripts, masters, `public/logo.png` before GitHub→Render | Release Lead | **MANUAL REQUIRED** — large uncommitted/untracked set in workspace |

Full narrative: `docs/release/DEMO_GO_LIVE_REPORT.md`. Render operator runbook: `docs/release/RENDER_SETUP_GUIDE.md`.

---

## 5. Rollback Procedure

If critical issues arise during demo deployment:
1. **Container Rollback:** Re-route load balancer traffic to the previous stable container image tag.
2. **Database Schema Rollback:** Since migrations are strictly additive and backward-compatible, rolling back the application container is safe without requiring immediate database downgrade.
3. **Data Reset (if corrupted):** Execute `npx tsx scripts/resetCostingTestData.ts` or re-run `importAllMasters.ts` to restore clean master data state.
