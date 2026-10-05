# Energya Connect — Render Setup Guide

**Purpose:** Configure Render for the Energya Connect demo (audit + operator runbook).  
**Deploy path:** GitHub auto-deploy from `pop2020/energya-connect-platform` branch `cursor/costing-configuration-dashboard` (dashboard Web Service + PostgreSQL). Not Blueprint / not Render CLI.  
**Architecture source of truth:** `package.json`, `server.ts`, `prisma/`, `.env.example`, `.node-version`.  
**Report date:** 2026-09-20  

Status legend: **AUTOMATIC** (Render/platform) | **MANUAL** (operator)

### Current hosted demo

| Item | Value |
| :--- | :--- |
| Web service URL | `https://energya-connect-platform.onrender.com` |
| Health | `GET https://energya-connect-platform.onrender.com/api/platform/health` |
| GitHub repo | `https://github.com/pop2020/energya-connect-platform` |
| Deploy branch | `cursor/costing-configuration-dashboard` |
| Postgres | Render PostgreSQL 16, Virginia, database `energya_connect_demo` (internal host `dpg-daa2decs728c73f6c2hg-a`) |
| Node | **20 LTS** (`.node-version`; Render `NODE_VERSION=20` if the file is not yet on the deployed revision) |

**Live check (2026-09-20):** `GET /api/platform/health` returns 200 with `database.ok === true`, but the SPA is still **stale**: `index.html` Last-Modified **Sun, 30 Aug 2026** and script `/assets/index-BIybi7LQ.js`. GitHub branch tip is **`cafaa4c`** (2026-09-14). A failed Auto-Deploy does **not** replace that bundle. Paste the commands below, then **Manual Deploy → Clear build cache & deploy**. Do **not** wait for the failed Events row to recover.

---

## Architecture (from repo)

```
Browser (HTTPS)
    │
    ▼
Render Web Service  —  Node, listens on process.env.PORT
    │
    ├─ Express API  (/api/*)          from dist/server.cjs
    └─ Vite SPA static + SPA fallback from dist/ (index.html, assets)
    │
    ▼
Render PostgreSQL 16  —  DATABASE_URL (Prisma)
```

| Item | Exact value (from repo) |
| :--- | :--- |
| Runtime | Node **20 LTS** (set `NODE_VERSION=20` — `.node-version` is **not** on `cafaa4c`) |
| Build script | `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs` |
| Start script | Free-tier demo: `npm run start:migrate` (`npx prisma migrate deploy && npm start`). Paid Shell: `npm start` is `node dist/server.cjs`. |
| Health endpoint | `GET /api/platform/health` |
| Default local PORT | `3847` if `PORT` unset; **always use Render `$PORT` in production** |
| Migrations (committed on deploy branch HEAD) | **50** under `prisma/migrations/` (workspace may have additional untracked WIP migrations — do not deploy those until committed) |
| Migrate command | `npx prisma migrate deploy` (**not** `migrate dev`) |

Production server (`NODE_ENV=production`) serves `dist/` statically and falls back to `dist/index.html` for non-API routes. Unmatched `/api/*` returns JSON 404 (never SPA HTML).

---

## Exact Render commands

**Paste these on the current GitHub SHA (`cafaa4c`). No new commit required.** `package.json` on that revision already defines `start:migrate`. Do not mix local Quotation V2 / customer-home WIP into a deploy commit.

### Dashboard click-path (do this in order)

Failed Auto-Deploy **never goes live by itself**. Changing settings does not re-run the dead Events row. After saving, you must start a **new** deploy.

1. Open [Render Dashboard](https://dashboard.render.com) → Web Service **`energya-connect-platform`**.
2. Confirm the service **branch** is `cursor/costing-configuration-dashboard` (not `main`; `origin/main` is a different SHA).
3. Left nav **Settings** (not Events). Scroll to **Build & Deploy**.
4. Set **Build Command**, **Start Command**, and **Health Check Path** to the values below. Save.
5. Left nav **Environment**. Add/update `NODE_VERSION`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, `NODE_OPTIONS` (table below). Save. Do not touch `DATABASE_URL` / `JWT_SECRET` / `ADMIN_SEED_PASSWORD`.
6. Top of the service page → **Manual Deploy** → **Clear build cache & deploy**. This is required even if Auto-Deploy is On Commit.
7. Watch **Logs** (build + runtime), not the Events commit title. Events only shows that `cafaa4c` was attempted; it is not the failure reason.
8. If it fails again: copy the **last 30 lines of Logs** and paste those. The commit **message** (`feat(container-study): …`) is not a log and cannot be diagnosed.

### Build Command

Free-tier 512MB — paste this **now** (Playwright is a committed `devDependency`; skipping browser download avoids OOM / 30–45m stalls):

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci && npx prisma generate && npm run build
```

| Part | Why |
| :--- | :--- |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` | Stops Playwright postinstall from fetching Chromium (kills Free 512MB builds) |
| `npm ci` | Lockfile-faithful install (`package-lock.json`) |
| `npx prisma generate` | Required — **not** inside `npm run build`; generates `@prisma/client` |
| `npm run build` | Vite SPA → `dist/` + esbuild server → `dist/server.cjs` |

Paid / ≥1GB instances may omit the Playwright prefix and use `npm ci && npx prisma generate && npm run build`.

**DevDependencies required at build time:** `vite`, `esbuild`, `prisma`, `tsx` (later for seed/import), TypeScript tooling as pulled by the lockfile.  
Do **not** set `NPM_CONFIG_PRODUCTION=true` / omit-dev during the Render **build** phase, or `vite` / `prisma` will be missing.

### Start Command

```bash
npm run start:migrate
```

Equivalent: `npx prisma migrate deploy && npm start` → `node dist/server.cjs`. Idempotent migrate on every boot (Free tier / no Shell). Paid Shell may use `npm start` if migrate is run separately.

### Health Check Path

```
/api/platform/health
```

Notes:

- Handler always returns HTTP **200** with JSON `{ ok: true, service, architecture, database }`.
- Database reachability is in `database.ok` / `database` payload — not the HTTP status code.
- After first deploy, confirm JSON shows PostgreSQL connected (`database.ok === true`), not only that Render marks the instance healthy.

---

## Environment variables (no secret values)

Set these on the Render **Web Service** (and use the same `DATABASE_URL` for one-off Shell/migrate jobs).

### Required

| Variable | Notes |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | From Render Postgres **Internal** Database URL (prefer internal on same region). Append `?schema=public` if missing. Use SSL params Render provides (`sslmode=require` when external). |
| `JWT_SECRET` | Required in production. Non-default, **≥ 32 characters**. Must **not** equal the development fallback. Generate e.g. `openssl rand -base64 32`. |
| `ADMIN_SEED_PASSWORD` | Required for production `prisma/seed.ts`. Explicit, unique; **rejected** if unset or equal to known demo defaults (`Admin@2026!`, `Sales@2026!`, etc.). |
| `PORT` | **AUTOMATIC** on Render — do not hardcode; server uses `Number(process.env.PORT) \|\| 3847`. |
| `NODE_VERSION` | `20` — **required for `cafaa4c`** (`.node-version` is not on that Git revision). |

### Required on Free 512MB (paste now)

| Variable | Value |
| :--- | :--- |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` — Playwright is in `package.json` on `cafaa4c`; without this, `npm ci` downloads browsers and the build OOMs or times out (~39m). |
| `NODE_OPTIONS` | `--max-old-space-size=460` — cap Node heap under the 512MB instance. Do not set 512 or higher (kernel + npm need headroom). |

### Recommended (security)

| Variable | Production value |
| :--- | :--- |
| `ALLOW_DEV_IDENTITY_SEED` | `false` (ignored in production even if `true`) |
| `ADMIN_RESET_TOKEN_IN_RESPONSE` | `false` (forced off in production) |
| `LOGIN_LOCK_THRESHOLD` | `5` (optional; default 5) |

### Optional

| Variable | Notes |
| :--- | :--- |
| `CORS_ALLOWED_ORIGINS` | Documented for split-origin setups. **Same-origin monolith does not implement CORS middleware today** — usually leave unset on Render. |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_USERNAME` / `ADMIN_SEED_FULLNAME` | Optional overrides for production admin seed identity |
| `GEMINI_API_KEY` | Optional AI assistant |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `NOTIFY_SALES_EMAIL` | Optional notifications |

**Never** commit real `.env` values. Repo `.gitignore` ignores `.env*` except `.env.example`.

---

## Database sequence (clean Demo Postgres)

Run **once** against the empty Render database, in this order:

| Step | Command | Safe on clean DB? |
| :---: | :--- | :--- |
| 1 | `npx prisma migrate deploy` | Yes — applies all committed migrations on the revision |
| 2 | `npx tsx prisma/seed.ts` | Yes — upserts cable parameters; production path seeds admin/roles only when `NODE_ENV=production` + valid `ADMIN_SEED_PASSWORD` |
| 2b | `ALLOW_DEMO_USERS=true npx tsx scripts/seedDemoUsers.ts` | Optional — creates documented demo personas (sales/tech/costing/customer). Requires opt-in flag. Passwords from `DEMO_*_PASSWORD` or documented demo fallbacks. |
| 3 | `npx tsx scripts/importAllMasters.ts` | Yes on empty DB — imports RM + Cable + BOM + Drum from `data/source/` |
| 4 | `npx tsx scripts/configureCostingOperationalReadiness.ts` | Yes — configures FX/scrap/price workflow; skips already-active FX pairs |

**Do not use** `prisma migrate dev` on Render.

Re-running import/readiness on a populated DB is not a full wipe; treat first demo init as one-shot unless you understand upsert/replace semantics.

**Production seed does not create** sales/customer demo users unless `ALLOW_DEMO_USERS=true` or `DEMO_SEED=true` (then `prisma/seed.ts` or `npm run seed:demo-users` creates them). Admin still comes only from `ADMIN_SEED_PASSWORD`. Use `DEMO_RESET_PASSWORDS=true` to re-hash existing demo personas.

Shell one-offs need `prisma` + `tsx` available (present after a full `npm ci` build). Prefer Render **Shell** on the web service shortly after deploy, with the same env vars.

### Symptom: `public.Permission` does not exist

Login calls `ensureIdentitySeed()` → `prisma.permission.upsert()`. If migrations were never applied, Prisma fails with:

`The table public.Permission does not exist in the current database.`

That table is created by migration `20260820120000_increment12_b1_identity`. **Build only runs `prisma generate`** — it does **not** apply migrations.

**Fix without Shell (Free tier):** see [Free tier / No Shell](#free-tier--no-shell) — Option A (migrate on Start Command) or Option B (migrate + seed from your laptop with the **External** Database URL). Then verify login.

**Fix with Shell:** run Step **K** (`npx prisma migrate deploy`) on the Web Service Shell against the same `DATABASE_URL` the app uses (prefer **Internal** URL on same region). Then seed (L) and verify login.

Common pitfalls: External URL pointed at a different/empty DB, migrate never run, or `prisma generate` mistaken for schema apply.

---

## Free tier / No Shell

Render **Free** web services often have **no Shell/SSH**. Build still does **not** run `prisma migrate deploy`, so a fresh Postgres has no `Permission` table and login fails until migrations are applied.

### Option A — Migrate at boot (Start Command)

Change the Web Service **Start Command** to either of these (equivalent):

```bash
npm run start:migrate
```

```bash
npx prisma migrate deploy && npm start
```

Then **Manual Deploy** / Redeploy so migrate runs once at process start.

| Rule | Guidance |
| :--- | :--- |
| Migrate every start | **OK** — `prisma migrate deploy` is idempotent (no-op when already applied). |
| Seed / import every start | **Do not** — slow, risky on a live DB. Run seed/import **once** via Option B, or temporarily change Start Command for a one-shot job, then switch back to migrate-only start. |

After tables exist, keep Start Command as `npm run start:migrate` (safe) or revert to `npm start` if you prefer migrate only from Option B / paid Shell.

### Option B — Migrate + seed from your laptop

Use the Render Postgres **External** Database URL (not Internal — Internal is unreachable from outside Render). Never paste real secrets into docs or chat.

PowerShell (replace placeholders; do not commit these values):

```powershell
$env:DATABASE_URL="<Render Postgres External Database URL>"
npx prisma migrate deploy

$env:NODE_ENV="production"
$env:ADMIN_SEED_PASSWORD="<same value as on Render Web Service>"
npx tsx prisma/seed.ts
npx tsx scripts/importAllMasters.ts
npx tsx scripts/configureCostingOperationalReadiness.ts
```

Requires local `node_modules` (e.g. via npmmirror) and the same Git revision / masters as the deployed build.

After migrate + seed succeed, login with the production admin credentials should work. Then import/readiness as above for a full demo dataset.

---

## Master data (`data/source/`)

| File | Purpose | Git-tracked? | Required for first demo import? |
| :--- | :--- | :---: | :---: |
| `Raw Material List.xlsx` | Raw materials (Import `RAW_MATERIAL`) | Yes (modified locally) | **YES** |
| `Energya Cable Master Data.xlsx` | Cable list + BOM | Yes (modified locally) | **YES** |
| `Drum List.xlsx` | Drum master | Yes (modified locally) | **YES** |
| `Cables Parameters_1.xlsx` | Engineering attributes reference | Untracked | No (not used by `importAllMasters.ts`) |
| `Description Schema.xlsx` | Description rules reference | Untracked | No |
| `ELAND Cost Sheet Required.xlsx` | Regression/reference | Untracked | No |
| `README.md` | Source workbook index | Yes (modified) | Docs only |

Import script paths (hardcoded):

- `data/source/Raw Material List.xlsx`
- `data/source/Energya Cable Master Data.xlsx`
- `data/source/Drum List.xlsx`

These three must exist in the Git revision Render builds.

---

## Git / commit gate (before first Render deploy)

Render builds from GitHub. Uncommitted workspace changes are **not** deployed.

### MUST commit (for a working demo deploy)

- Application: `package.json`, `package-lock.json`, `server.ts`, `vite.config.ts`, `index.html`, `src/**`, `prisma/schema.prisma`, `prisma/seed.ts`
- All `prisma/migrations/**` (including currently untracked Increment 12–14 / costing migrations)
- Scripts: at least `scripts/importAllMasters.ts`, `scripts/configureCostingOperationalReadiness.ts`, and any modules they import
- Official masters: the three `data/source/*.xlsx` import files (+ `data/source/README.md` if updated)
- `public/logo.png` (currently **untracked** — login/branding uses `/logo.png`)
- Release docs under `docs/release/` as needed

### MUST NOT commit

- `.env`, `.env.*` secrets (except `.env.example` placeholders)
- `node_modules/`, `dist/`
- `.cursor/` local rules/cache
- Hosting API keys, JWT/admin passwords, real `DATABASE_URL` credentials

This guide does **not** create commits. Prefer a deliberate commit/PR before connecting Render to the branch.

---

## Security checklist (code-verified; report only)

| Guard | Status |
| :--- | :--- |
| Production rejects missing / default / weak (`<32`) `JWT_SECRET` | PASS (code) — `validateProductionJwtSecret` |
| Production seed requires non-default `ADMIN_SEED_PASSWORD` | PASS (code) |
| `ALLOW_DEV_IDENTITY_SEED` ignored in production | PASS (code) |
| `ADMIN_RESET_TOKEN_IN_RESPONSE` forced off in production | PASS (code) |
| Demo quick-login disabled when `NODE_ENV=production` | PASS (code) |
| Frontend API calls use relative `/api/...` (no hardcoded localhost API base) | PASS (spot-check) |
| Secrets not in git | PASS (`.env` gitignored; local `.env` must stay untracked) |

No business-logic changes were made for this guide.

---

## Landing / routes (no redesign)

| Route | Behavior |
| :--- | :--- |
| `/` | Unauthenticated → redirect to `/login` |
| `/login` | Unified login (Internal / Customer toggle) — branded `BrandLogo` → `/logo.png` |
| `/login/customer`, `/login/users`, `/login/admin` | Portal-specific login |
| `/customer/*` | Customer portal (auth required) |
| `/internal/*` | Internal portal (auth required) |

There is no separate public marketing landing page; the approved entry is the login experience. Ensure `public/logo.png` is committed so production static hosting serves the lockup.

---

## Steps A–O (Render configuration + first init)

| Step | Action | AUTOMATIC / MANUAL |
| :---: | :--- | :---: |
| **A** | Create a **PostgreSQL** instance on Render (PostgreSQL 16). Note region. | **MANUAL** |
| **B** | Copy **Internal Database URL** into `DATABASE_URL` (add `?schema=public` if needed). | **MANUAL** |
| **C** | Create a **Web Service** (Node). | **MANUAL** |
| **D** | Connect the **GitHub** repository that contains Energya Connect. | **MANUAL** |
| **E** | Select deploy branch **`cursor/costing-configuration-dashboard`**. | **MANUAL** |
| **F** | Set **Build Command** to `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci && npx prisma generate && npm run build` (Free 512MB). | **MANUAL** |
| **G** | Set **Start Command** to `npm run start:migrate` for this demo (Free tier / no Shell). Paid Shell may use `npm start` if migrate is run separately. | **MANUAL** |
| **H** | Set env vars: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_SEED_PASSWORD`, `NODE_VERSION=20`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, `NODE_OPTIONS=--max-old-space-size=460`; security flags false; leave `PORT` to Render. | **MANUAL** |
| **I** | Set **Health Check Path** to `/api/platform/health`. | **MANUAL** |
| **J** | Trigger **Deploy**. Render runs build + start. | **AUTOMATIC** (after Manual trigger / autodeploy) |
| **K** | Apply migrations: Web Service **Shell** `npx prisma migrate deploy`, **or** Free tier Option A/B (no Shell). | **MANUAL** |
| **L** | Seed once: Shell `npx tsx prisma/seed.ts`, **or** Free tier Option B from laptop. **Do not** put seed on every Start Command. | **MANUAL** |
| **M** | `npx tsx scripts/importAllMasters.ts` (Shell or Option B). | **MANUAL** |
| **N** | `npx tsx scripts/configureCostingOperationalReadiness.ts` (Shell or Option B). | **MANUAL** |
| **O** | Smoke: open service URL → `/login` → login as seeded admin → probe `/api/platform/health` JSON `database.ok` → follow `DEMO_SMOKE_TEST.md` (adjust credentials for production admin). | **MANUAL** |

DNS for `demo.energyaconnect.com` is **out of scope** for this guide (do not modify DNS here). Optionally add a Render custom domain later.

---

## Local validation note

Prior go-live / this audit: local `npm ci` may fail with npm registry **E403** / TLS intercept. That is **environment/network**, not an application defect.

If local `node_modules` is missing or incomplete:

- Do **not** loop on `npm ci`.
- Report: **LOCAL VALIDATION BLOCKED BY NPM NETWORK ACCESS**.
- Do **not** claim local `tsc` / `npm test` / `npm run build` PASS.

Render’s build network is independent; a successful Render build still validates install+compile on their side.

---

## Related docs

- `docs/release/DEMO_ENVIRONMENT.md` — env variable reference  
- `docs/release/DEMO_DEPLOYMENT_CHECKLIST.md` — hosting architecture + checklist  
- `docs/release/DEMO_SECURITY_CHECK.md` — security guards  
- `docs/release/DEMO_SMOKE_TEST.md` — post-deploy smoke scenarios  
- `docs/release/DEMO_GO_LIVE_REPORT.md` — latest go-live / readiness narrative  

---

## Final readiness for this guide

| Gate | Status |
| :--- | :--- |
| Commands derived from `package.json` / `server.ts` | PASS |
| Env list from code + `.env.example` | PASS |
| DB sequence documented (`migrate deploy` → seed → import → costing) | PASS |
| Security guards documented | PASS |
| Local re-verify (`tsc` / test / build) | **BLOCKED** (npm network / empty `node_modules`) |
| Render resources created / deployed | **LIVE but STALE SPA** — health `database.ok === true`; HTML still `index-BIybi7LQ.js` (Last-Modified 2026-08-30). GitHub tip `cafaa4c` Auto-Deploy failed; must Manual Deploy after Free-tier command/env change. |
| Required git commit before first GitHub→Render deploy | Done historically. Further deploys: push the tracking branch. Uncommitted WIP (including Quotation V2) is **not** deployed. |

**Verdict for operators:** Demo Web Service + Postgres already exist. Live SPA can stay on an old successful deploy while Auto-Deploy of a newer SHA **fails**. Paste the Free-tier Build/Start/Env values, then **Manual Deploy → Clear build cache & deploy**. The failed Events row will never go live. If it fails again, paste the **last 30 log lines**, not the commit title. Do **not** apply a new Blueprint. Do **not** commit secrets or uncommitted Quotation V2 / customer-home WIP just to unstick Render.
