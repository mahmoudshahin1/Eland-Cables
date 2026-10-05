# Cable Master authority (Increment 3)

**UI:** protected. No theme/logo/header/navigation redesign.

## Source of truth

| Question | Authority |
|---|---|
| Does an **approved existing cable** exist? | **PostgreSQL `CableMaster`** (ACTIVE rows) |
| Are parameter **values** valid? | PostgreSQL `CableParameter` (ACTIVE) |
| Are parameter **relationships** allowed? | PostgreSQL `ParameterCompatibility` |
| Prototype cascading UX / quotation screens | localStorage catalogs may remain until those domains are cut over |

localStorage / `MASTER_CABLE_CATALOG` is **not** used to declare `EXISTING_CABLE` when PostgreSQL is reachable. Evaluate runs on the server (`POST /api/cables/evaluate`).

Central module: `src/domain/cableAuthority.ts`. React and Express both call this model (Express loads PG rows first). Prototype IEC checks in V2 remain **warnings only**, not a second authority.

## Matching attributes

A Cable Master match uses structured fields, **not** description-only comparison:

- `customerCode` (exact, case-insensitive) when provided
- `materialNumber` / `itemCode` when provided
- `family` when both config and row have it
- `voltage` (normalized contains)
- `conductor` (CU/Copper vs AL/Aluminum)
- `conductorSize` (numeric mm²)
- `cores` (numeric count)
- `insulation` when both populated
- `screen` / `armour` when both populated
- `diameter` when both populated

Null/blank master fields are **not** treated as mismatches for identity queries, but in Increment 6:
**Structured `EXISTING_CABLE` matching requires APPROVED engineering mappings** (family, voltage, conductor, conductorSize, cores, insulation). If approved mappings are missing, the query evaluates to `CONFIGURATION_REQUIRED`.

## Three-state decision (Updated for Increment 6)

1. **EXISTING_CABLE** — ACTIVE master row matches authoritative configuration with an **APPROVED** engineering mapping (or explicit material identity lookup).
2. **TECHNICALLY_VALID_NOT_MASTER** — valid parameters and compatibility, but no matching approved master cable.
3. **INVALID_CONFIGURATION** — invalid parameters or forbidden compatibility.
4. **CONFIGURATION_REQUIRED** — missing compatibility rules, or Cable Master exists without approved engineering mapping for requested structured fields.

## Technical Office

Submit (`POST /api/technical-office/requests` + existing V2 local queue) stores the full configuration, customer, quantity/cutting length if provided, requester, reason, timestamp.

Canonical statuses: `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `IMPLEMENTED`, `CANCELLED` mapped to existing display strings (`Submitted`, `Under Technical Review`, `Released`, …). Submit does **not** insert Cable Master.

## API

- `GET /api/master/cables?q&customerCode&itemCode&materialNumber&family&voltage&conductor&cores&diameter&page&pageSize` — paginated search (default 25)
- `GET /api/cables/search` — same search helper
- `POST /api/cables/evaluate` — `{ config }` → `{ decision }`
- `GET /api/cables/compatibility`
- `POST /api/technical-office/requests` (JWT)
- `GET /api/technical-office/requests` (internal Technical Office)
- `POST`/`PUT /api/master/cables` — **internal + masterData**; customers receive **403 UNAUTHORIZED**

## Security

Customers may search/select/evaluate. Customers must not create or update Cable Master or process TO master-data decisions.
