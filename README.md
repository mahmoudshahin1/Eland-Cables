# ENERGYA Cable Manufacturing Platform

CEO-accepted Google AI Studio prototype, evolved in place. Do not treat this as a greenfield ERP rebuild.

## Run locally

```bash
npm install
npm run dev
```

Opens on **http://localhost:3847** (override with `PORT`).

Optional: `DATABASE_URL` in `.env` (see `.env.example`). PostgreSQL is the target master-data store.

```bash
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

## Increment 2 (master data)

Internal portal → **Master Data**:

1. Import Center → **Import official ENERGYA workbooks**
2. Review Data Quality, Cable Master, BOM, Raw Materials, Drum Master

Source files: `data/source/` (also served from `public/source/`). Missing RM prices are `PRICE_NOT_CONFIGURED`, never zero.

Quotation, configurator, and prototype drum optimizer screens remain operational. Drum Details can **link** an imported EWD code as a reference; it does not replace Wood/Steel reel types. Automatic EWD pick is `CONFIGURATION_REQUIRED`.

## Increment 4 (onboarding)

Official workbooks live in `data/source/` (copied under `public/source/` for Import Center). Cable List (432) and Raw Materials (74, blank prices) are imported to PostgreSQL. Conflicting BOM weights are skipped (`docs/BOM_DATA_QUALITY.md`).

See `docs/CABLE_MASTER_DATA_ONBOARDING.md`.

## Increment 5 (governance)

Internal portal → Master Data → **Readiness**. Engineering mapping is PARTIAL (diameter/weight only). BOM conflicts stay in a review register. No costing.

See `docs/DATA_READINESS.md`.

## Cable Master authority

Configurator existence checks use PostgreSQL (`POST /api/cables/evaluate`). Search uses paginated `GET /api/master/cables`. Hub/Import Center/configurator writes are PostgreSQL-authoritative. **Task 04B-7:** Cable Master is `POSTGRESQL_SOT` — see `docs/v2/26_CABLE_MASTER_SOT_CUTOVER.md` and `docs/CABLE_MASTER_AUTHORITY.md`.

## Drum Master usage

- Service: `src/services/drumSelectionService.ts`
- Manual EWD link from Drum Details (does not change prototype reel dropdown)
- Automatic EWD: never selects a drum
- Import still via existing Import Center (`Drum List.xlsx`)

## Docs

- `docs/MASTER_DATA_CURRENT_STATE_ASSESSMENT.md`
- `docs/DRUM_MASTER_DOMAIN.md`
- `docs/MASTER_DATA_RELATIONSHIP_MODEL.md`
- `docs/D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md` (approved D365 Q2C baseline)
- `docs/D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`
- `docs/ARCHITECTURE_DECISIONS.md` (ADR-004 — D365 behind adapters only)
- `docs/KNOWN_LIMITATIONS.md`

## Increment 12 B1 (platform identity)

PostgreSQL-backed users, bcrypt passwords, JWT with live RBAC hydration, and Administration (Users / Roles / Security). Login requires a migrated database.

```bash
npx prisma migrate deploy
npx prisma db seed
```

Default development admin: `admin@energya.com` / `Admin@2026!` (override with `ADMIN_SEED_PASSWORD`). See `docs/USER_SECURITY_MODEL.md`, `docs/RBAC_PERMISSION_MODEL.md`, `docs/ADMIN_API.md`.

Increment 12 B2 adds a governed Customer master and Customer–User assignments. Customer isolation rules: `docs/CUSTOMER_ISOLATION.md`.

