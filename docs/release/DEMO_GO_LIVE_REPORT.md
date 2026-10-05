# Energya Connect — Demo Go-Live Report

**Report date:** 2026-08-30  
**Prepared against workspace:** `d:\Projects\EPC_Platform\energya-connect-platform`  
**Git commit:** `6bbe217` (`cursor/costing-configuration-dashboard`)  
**Overall go-live verdict:** **NOT GO-LIVE** — Render configuration docs ready; public deployment not performed; local re-verification still blocked (see §18).

**Render configuration verdict:** **READY FOR RENDER CONFIGURATION** — see `docs/release/RENDER_SETUP_GUIDE.md`. Do not treat as deployed.

Status legend used below: **PASS** | **FAIL** | **MANUAL REQUIRED** | **BLOCKER** | **N/A**

---

## 1. Executive Summary / Go-Live Verdict

Demo publishing preparation advanced: production seed/JWT guards are enforced in code, environment templates and security docs were updated, master Excel sources were confirmed present, `PORT` respects `process.env.PORT`, and an existing `dist/server.cjs` + `dist/index.html` artifact is on disk from a prior build.

**Render setup guide written** (`RENDER_SETUP_GUIDE.md`) with exact Build/Start/Health commands from `package.json` / `server.ts`, env list, DB sequence, and steps A–O. **No Render resources were created. No deploy. No DNS changes.**

**Public deployment did not happen.** DNS/HTTPS for `https://demo.energyaconnect.com` were **not** verified.

**BLOCKER (local only):** `node_modules` exists as an empty/incomplete tree; critical packages (`typescript`, `vite`, `prisma`, `tsx`) are missing. Do not loop `npm ci` here (registry **E403** / TLS). Local Phase 0 re-runs remain **LOCAL VALIDATION BLOCKED BY NPM NETWORK ACCESS**.

---

## 2. Release Version / Commit

| Field | Value |
| :--- | :--- |
| Package name | `energya-connect` (`package.json`) |
| Package version | `0.0.0` |
| Branch | `cursor/costing-configuration-dashboard` |
| HEAD commit | `6bbe217` — *Redesign Costing Configuration to match the Costing Form workspace.* |
| Migrations on disk | **29** directories under `prisma/migrations/` |

---

## 3. Deployment Platform

| Item | Status | Notes |
| :--- | :---: | :--- |
| Recommended architecture | Documented | Single Node process (`dist/server.cjs`) + managed PostgreSQL 16 |
| Local Docker Compose | Present | `docker-compose.yml` — PostgreSQL 16 only (`energya` / `energya_dev`) |
| Application Dockerfile | Not in repo | Spec exists in `DEMO_DEPLOYMENT_CHECKLIST.md`; not added (avoid over-engineering for PaaS) |
| PaaS push (Railway/Render/etc.) | **N/A** | Not deployed (by design). Config runbook: `RENDER_SETUP_GUIDE.md` |
| Docker Desktop | Available | `Docker version 29.7.2` (used only for recovery attempts) |

---

## 4. Application URL

| URL | Status |
| :--- | :--- |
| Target public URL | `https://demo.energyaconnect.com` |
| Verified live URL | **None** — not deployed; not invented |
| Local default | `http://localhost:${PORT}` with `PORT` default `3847` when unset |

---

## 5. Database Platform

| Item | Status | Notes |
| :--- | :---: | :--- |
| Target | Managed PostgreSQL 16 | AWS RDS / Azure / Railway / Render / Supabase / Compose |
| Local Compose DB definition | Present | Port `5432`, DB `energya_connect` |
| `psql` CLI on PATH | Missing | Not required if using Prisma |
| Remote managed demo DB initialized this session | **NO** | Not claimed |
| Local migrate/seed/import this session | **BLOCKER** | Requires restored `node_modules` + reachable `DATABASE_URL` |

---

## 6. Phase 0 — Production Readiness Audit Results

Re-run attempted against **current** repo on 2026-08-30:

| Command | Result | Evidence |
| :--- | :---: | :--- |
| `npm ci` | **BLOCKER** | Not re-run (prior E403/TLS). `node_modules` present but empty of app deps |
| `npx prisma validate` | **BLOCKER** | `node_modules/prisma` missing |
| `npx prisma generate` | **BLOCKER** | Same |
| `npx tsc --noEmit` | **BLOCKER** | `node_modules/typescript` / `.bin/tsc` missing — **LOCAL VALIDATION BLOCKED BY NPM NETWORK ACCESS** |
| `npm test` | **BLOCKER** | Same |
| `npm run build` | **BLOCKER** | `vite` / `esbuild` missing; prior `dist/` artifact remains on disk (freshness not re-proven) |

**Inspection (code/docs — completed without install):**

- Scripts: `dev`, `build`, `start` (`node dist/server.cjs`), `prisma:migrate`, `prisma:seed`, `import:masters`
- `server.ts`: `const PORT = Number(process.env.PORT) || 3847` — platform `$PORT` respected
- Production static SPA: `express.static(dist)` + SPA fallback; `/api` 404 JSON guard
- Health: `GET /api/platform/health`
- Auth production guards: present (see §10)
- Attachments: in-DB `bytea`, 8 MB ceiling
- CORS: same-origin monolith; `CORS_ALLOWED_ORIGINS` documented (optional)
- Docker: Compose for Postgres only

---

## 7. Security Hardening Changes (This Session)

| Change | File(s) | Status |
| :--- | :--- | :---: |
| Production JWT: reject missing / default / weak (&lt;32 chars) via `validateProductionJwtSecret` | `src/server/auth.ts` | **PASS** (code) |
| Unit coverage for JWT production validator | `src/server/increment12b1.hardening.test.ts` | **PASS** (code; execution **BLOCKER**) |
| Production admin seed already required explicit non-default `ADMIN_SEED_PASSWORD` | `prisma/seed.ts`, `src/server/identityService.ts` | **PASS** (verified existing) |
| Dev identity seed ignored in production | `isDevelopmentIdentitySeedAllowed` | **PASS** |
| Admin reset token never in production responses | `includeAdminResetTokenInResponse` | **PASS** |
| Demo auth bypass disabled in production | `src/domain/demoAuth.ts` | **PASS** |
| Safe env template updated (no production default admin password) | `.env.example` | **PASS** |
| Docs aligned with hardening | `DEMO_ENVIRONMENT.md`, `DEMO_SECURITY_CHECK.md` | **PASS** |

No business/UI/costing/RBAC/schema/API behavior changes beyond security guards and docs.

---

## 8. Production Configuration

Safe placeholders only (see `.env.example` and `docs/release/DEMO_ENVIRONMENT.md`):

- `NODE_ENV=production`
- `PORT=$PORT` (or numeric; server reads `process.env.PORT`)
- `DATABASE_URL=...`
- `JWT_SECRET=` strong ≥32 chars, not the dev fallback
- `ADMIN_SEED_PASSWORD=` required for production seed; **not** `Admin@2026!`
- `ALLOW_DEV_IDENTITY_SEED=false`
- `ADMIN_RESET_TOKEN_IN_RESPONSE=false`
- `CORS_ALLOWED_ORIGINS=https://demo.energyaconnect.com`
- Optional: `GEMINI_API_KEY`, SMTP_*

Real secrets were **not** committed.

---

## 9. Migration & Seed Results

| Step | Status | Notes |
| :--- | :---: | :--- |
| `npx prisma migrate deploy` | **MANUAL REQUIRED** | 29 migrations on disk; not executed against managed demo DB this session |
| `npx tsx prisma/seed.ts` (production) | **MANUAL REQUIRED** | Requires `ADMIN_SEED_PASSWORD` (non-default) + restored tooling |
| Production seed rejects missing/default admin password | **PASS** (code) | `validateProductionAdminSeedPassword` |

Exact commands for managed demo DB:

```bash
export NODE_ENV=production
export DATABASE_URL='postgresql://...'
export JWT_SECRET='...(≥32 chars, non-default)...'
export ADMIN_SEED_PASSWORD='...(unique, not Admin@2026!)...'
export ALLOW_DEV_IDENTITY_SEED=false
export ADMIN_RESET_TOKEN_IN_RESPONSE=false
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

---

## 10. Master Data Import

### Required Excel files under `data/source/` (verified present)

| File | Present |
| :--- | :---: |
| `Raw Material List.xlsx` | **YES** |
| `Energya Cable Master Data.xlsx` | **YES** |
| `Drum List.xlsx` | **YES** |
| Additional (not blockers for import script): `Cables Parameters_1.xlsx`, `Description Schema.xlsx`, `ELAND Cost Sheet Required.xlsx` | YES |

### Import / readiness commands

```bash
npx tsx scripts/importAllMasters.ts
npx tsx scripts/configureCostingOperationalReadiness.ts
```

| Step | Status |
| :--- | :---: |
| File presence audit | **PASS** |
| Import executed this session | **MANUAL REQUIRED** (tooling/DB) |
| Count verification (cables, BOM, RM, prices, drums, params, costing readiness) | **MANUAL REQUIRED** |

---

## 11. Costing Operational Readiness

| Item | Status |
| :--- | :---: |
| Script present: `scripts/configureCostingOperationalReadiness.ts` | **PASS** (on disk) |
| Executed this session | **MANUAL REQUIRED** |
| Decision 5 / metal Option B freeze | Unchanged (not modified) |

---

## 12. Deployment Artifact

| Artifact | Status |
| :--- | :---: |
| `dist/server.cjs` | **PASS** (exists from prior build; freshness not re-proven this session) |
| `dist/index.html` (+ assets) | **PASS** (exists) |
| Production start command | `node dist/server.cjs` with `PORT` from env |
| Rebuild this session | **BLOCKER** (`npm run build` unavailable) |
| Public container/image push | **N/A** |

---

## 13. Health Check

| Check | Status |
| :--- | :---: |
| `GET /api/platform/health` against local production boot | **MANUAL REQUIRED** / **BLOCKER** — cannot boot without `node_modules` (externals) |
| `GET /api/platform/health` against public URL | **N/A** — no public deploy |

---

## 14. Smoke Test (`DEMO_SMOKE_TEST.md`)

| Step | Scenario | Status |
| :---: | :--- | :---: |
| 1 | RBAC Authentication & Isolation | **MANUAL REQUIRED** |
| 2 | Executive Dashboard / health | **MANUAL REQUIRED** |
| 3 | Commercial Inquiry creation | **MANUAL REQUIRED** |
| 4 | Cable Authority & BOM | **MANUAL REQUIRED** |
| 5 | Attachment upload/download | **MANUAL REQUIRED** |
| 6 | Drum cutting workbench | **MANUAL REQUIRED** |
| 7 | Dynamic costing | **MANUAL REQUIRED** |
| 8 | Quotation + snapshot lock | **MANUAL REQUIRED** |
| 9 | Logout / session revocation | **MANUAL REQUIRED** |

Prior document checkboxes marked PASS were **not** re-validated in this session and must not be treated as live go-live evidence.

---

## 15. Responsive Verification

| Surface | Status |
| :--- | :---: |
| Login / dashboards / inquiry / cable / drum / costing on desktop & mobile | **MANUAL REQUIRED** |
| Design mockup screenshots under `docs/design/mockups/` | Reference only — not a live deploy proof |

---

## 16. Domain / DNS / HTTPS

| Item | Status |
| :--- | :---: |
| Target hostname | `demo.energyaconnect.com` |
| DNS A/AAAA or CNAME to PaaS | **MANUAL REQUIRED** — not verified |
| TLS certificate / HTTPS | **MANUAL REQUIRED** — not verified |
| HSTS / reverse proxy | **MANUAL REQUIRED** |

Suggested DNS (operator to confirm with chosen PaaS):

1. Create DNS record for `demo.energyaconnect.com` → hosting provider target (CNAME preferred for PaaS).
2. Enable managed TLS on the PaaS / load balancer for that hostname.
3. Point health checks at `https://demo.energyaconnect.com/api/platform/health`.

**DNS/HTTPS success is not claimed.**

---

## 17. Post-Deployment Security Verification

| Guard | Method | Status |
| :--- | :--- | :---: |
| JWT mandatory / non-default / ≥32 chars | Code review + unit test added | **PASS** (code); runtime **MANUAL REQUIRED** |
| `ADMIN_SEED_PASSWORD` required; no `Admin@2026!` in production seed | Code review | **PASS** (code) |
| `ALLOW_DEV_IDENTITY_SEED` ignored in production | Code review | **PASS** |
| `ADMIN_RESET_TOKEN_IN_RESPONSE` ignored in production | Code review | **PASS** |
| Demo quick-login disabled in production | Code review | **PASS** |
| Destructive pentest | Out of scope | **N/A** |

---

## 18. Known Limitations & Blockers

### BLOCKER — npm registry / dependency restore

- **ROOT CAUSE:** Outbound installs to `registry.npmjs.org` fail with security-policy `403 Forbidden` and/or TLS `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (intercepting proxy). A prior `npm ci` while `npm run dev` held native bindings also corrupted/removed `node_modules`.
- **EVIDENCE:** Host `npm ci` / `npm install` logs (`E403` on `react-router-dom` / `yallist` / `prisma`); Docker/npm logs showing `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; `node_modules` missing critical bins (`typescript/bin/tsc`, `prisma/build/index.js`).
- **EXACT REQUIRED ACTION:** On a network path that can reach the npm registry with valid TLS (or from a machine with an intact cache of this lockfile), run `npm ci` in the repo root, then re-run Phase 0 commands. Restore any interrupted local Postgres/`npm run dev` workflows afterward.
- **CODE CHANGE REQUIRED?** No — environment/network recovery only.

### Other limitations

- No PaaS credentials → no public URL.
- Smoke and responsive checks remain manual after a successful local/production boot.
- Decision 5 remains unsigned/frozen per platform policy (costing Option B) — not changed here.

---

## 19. Manual Next Actions & Rollback

### Exact next manual actions (operator)

1. **Commit** the MUST-commit set in `RENDER_SETUP_GUIDE.md` (migrations, scripts, masters, `public/logo.png`, app/prisma changes). Never commit `.env`.
2. Follow **`docs/release/RENDER_SETUP_GUIDE.md` steps A–O** (Postgres → Web Service → build/start/env/health → deploy → migrate → seed → import → costing → smoke).
3. Exact Render Build: `npm ci && npx prisma generate && npm run build` · Start: `npm start` · Health: `/api/platform/health`
4. Secrets on Render only: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_SEED_PASSWORD`, `NODE_ENV=production`, `ALLOW_DEV_IDENTITY_SEED=false`, `ADMIN_RESET_TOKEN_IN_RESPONSE=false` (`PORT` automatic).
5. Verify health JSON `database.ok === true` (HTTP status is always 200 by design).
6. Smoke with **production admin** (`ADMIN_SEED_PASSWORD`); do not assume `Sales@2026!` / `Customer@2026!` exist after production seed.
7. Optional later: DNS for `demo.energyaconnect.com` + TLS (not part of Render config-only prep).
8. Local restore (optional, separate network): `npm ci` then `tsc` / `npm test` / `npm run build` — currently **BLOCKED** here.

### Rollback

1. Re-route traffic to previous container/image tag.
2. Schema migrations are additive — app rollback does not require DB downgrade for normal cases.
3. If master data corrupted: re-run `importAllMasters.ts` / costing readiness scripts against a known-good source set.

---

## Appendix — Checklist Cross-Reference

See updated statuses in `docs/release/DEMO_DEPLOYMENT_CHECKLIST.md`.
