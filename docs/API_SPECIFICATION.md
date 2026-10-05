# API specification (current)

Base: same origin as the SPA. Default port **3847**.

## Auth (existing)
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/refresh-token`
- `GET /api/auth/me`
- `GET /api/auth/roles`
- `POST /api/auth/roles`
- `POST /api/auth/assign-role`
- `GET /api/auth/users`

Passwords in process memory are plaintext fields named `passwordHash`.

## Platform (Increment 1)
- `GET /api/platform/health` — `{ ok, service, architecture }`
- `GET /api/platform/status` — persistence flags (`postgresql` from live `SELECT 1`, `d365DomainAdapters: NOT_IMPLEMENTED`)
- `GET /api/platform/db` — PostgreSQL connectivity

## Master data (Increment 2)
- `GET /api/master/cables` — list or paginated search (`q`, `customerCode`, `itemCode`, `materialNumber`, `family`, `voltage`, `conductor`, `cores`, `diameter`, `page`, `pageSize`)
- `POST /api/master/cables` (JWT, internal + `masterData`; customers 403)
- `PUT /api/master/cables/:materialNumber` (same RBAC)
- `GET /api/master/boms`
- `GET /api/master/raw-materials`
- `GET /api/master/raw-material-prices` — `price` is null when `PRICE_NOT_CONFIGURED`
- `GET /api/master/drums`
- `GET /api/master/reference` — `CableParameter`
- `POST /api/master/imports/preview` (JWT, internal + `masterData`; customers 403). Returns valid/errors/warnings/duplicates/skipped.
- `POST /api/master/imports/commit` (same RBAC)
- `GET /api/master/imports`
- `GET /api/master/readiness` — Cable / engineering / BOM / RM governance metrics
- `GET /api/master/engineering-mappings`
- `GET /api/master/bom-conflicts` · `PATCH /api/master/bom-conflicts/:conflictId` (internal; does not change weights)
- `GET /api/master/raw-material-price-readiness`
- `GET /api/master/keys`
- `GET /api/master/uniqueness` — material / item / customer code distinctness
- `GET /api/master/bom-duplicate-observations`
- `POST /api/master/raw-materials` / `PUT /api/master/raw-materials/:code` (internal)
- `POST /api/master/raw-materials/:code/prices` — blank body price rejected; no invented dates

## Cable authority (Increment 3)
- `GET /api/cables/search` — paginated Cable Master search
- `GET /api/cables/compatibility`
- `POST /api/cables/evaluate` — three-state decision (PostgreSQL)
- `POST /api/technical-office/requests` (JWT)
- `GET /api/technical-office/requests` (internal Technical Office)

## Prototype stubs (do not treat as live integration)
- `GET /api/d365/sync-status` — always `connected: true`
- `GET /api/advaris/mes-status` — mock
- `POST /api/master-data/import` — legacy stub; does **not** persist (use `/api/master/imports/*`)
- `POST /api/ai/assistant` — Gemini if `GEMINI_API_KEY` set

## Not present
No `/api/inquiries`, `/api/quotations`, `/api/cables`. Commercial data is client-side.
