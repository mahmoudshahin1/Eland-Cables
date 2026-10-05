# V2 Advanced Cable Search

**Status:** IMPLEMENTED (current V2 customer flow enhancement)  
**V3:** BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED  
**Runtime authority:** PostgreSQL Cable Master  
**Excel / V3 workbooks:** reference only — not a compatibility engine

## Purpose

Customers first use **Standard Search**. If that does not produce a suitable existing cable, they can open **Advanced Search** to discover an existing engineered record in Cable Master.

Advanced Search is a **search / discovery** mechanism. It is **not** an engineering configuration engine.

## Standard vs Advanced Search

| | Standard Search | Advanced Search | Build via Parameters |
|---|-----------------|-----------------|----------------------|
| When | First | User action after Standard Search is insufficient | Separate V2 configurator |
| Source | `GET /api/master/cables` | `GET /api/v2/cables/search` | Existing V2 Cable Configurator |
| Auto-run Advanced? | No | No — user clicks Search | N/A |
| Creates Material Number? | No | No | No (evaluate / TCR only via existing flow) |

Customer journey:

```text
Standard Search
       ↓
Results?
       │
       ├── YES → select existing cable
       │
       └── NO
            ↓
       Advanced Search (user opens it)
            ↓
       Existing Cable Master hit? → select existing identity
            ↓
       No suitable result → Request Technical Office Review
```

## Search fields

Filters query **existing** Cable Master columns. Match modes: exact, contains, starts with (default contains). Input is trimmed and compared case-insensitively for search only. Stored canonical values are not rewritten.

| UI field | Runtime column / behaviour |
|----------|----------------------------|
| Material Number | `materialNumber` |
| Item Code | `itemCode` |
| Customer / spec code | `customerCode` (spec code such as N2XH — **not** a commercial customer id). Internal role only. |
| Cable Family | `family` |
| Voltage class (catalog) | Reuses existing catalog family chips (LV / MV / HV / Control) via `cableFamilyFilterWhere`. **Not** a PG column and **not** a new engineering class. |
| Voltage | `voltage` |
| Standard | `standard` |
| Conductor | `conductor` |
| Conductor size | `conductorSize` |
| Cores | `cores` |
| Insulation | `insulation` |
| Screen | `screen` |
| Armour | `armour` |
| Sheath | `sheath` |
| Description | `description` |
| Cable diameter / weight | exact numeric match on `diameter` / `weight` when provided |

PostgreSQL Cable Master does **not** currently store: `voltageClass`, `conductorClass`, `screenMaterial`, `screenCsa`, `armourMaterial`, `armourCsa`, `cpr`, `cprClass`. Advanced Search does not invent those columns.

Facet dropdowns are **distinct values already present** on ACTIVE Cable Master rows. They are labels for filtering, not a compatibility matrix.

## Customer visibility

Customers may search the shared product catalog after sign-in. They do not see:

- internal-only filter: Customer / spec code
- costing, BOM, or raw price fields on Advanced Search hits
- Technical Office processing queues (`GET /api/technical-office/requests`)

`customerCode` on Cable Master is a construction spec code. Commercial customer isolation continues to apply to inquiries, quotations, and other customer-owned records — not to the shared Cable Master catalog.

## Server-side filtering

- Query and pagination run in PostgreSQL.
- Customer page size is capped at 50; internal at 100.
- Results are not loaded in full into the browser.
- No extra indexes were added; `materialNumber` is already unique.

## Cable Master authority

PostgreSQL Cable Master is the runtime authority. Selecting a result **references** the existing Material Number / item identity. The search:

- does not create a Material Number
- does not clone a Cable Master row
- does not update Cable Master
- does not overwrite Cable Master from Excel

`Energya_Cable_Master_Engineering_Template.xlsx` is evidence/reference only.

## No compatibility inference

Advanced Search does **not**:

- infer engineering compatibility
- create engineering rules
- implement V3 dependency logic
- use the Technical Office dependency workbook as a runtime engine
- infer fit from lookup lists, example cables, frequency, observed combinations, V2 cascade behaviour, or industry practice

A filter match means the stored attribute contains (or equals / starts with) the search text. It does **not** mean the construction is technically approved as a new design.

## No V3 dependency logic

V3 remains future and blocked until Technical Office provides approved rules. This feature does not implement a dependency resolver, compatibility engine, rule versioning, engineering rule database, dynamic engineering configuration, or technical dependency cascade.

Do not modify `docs/v3/*` for this feature.

## No match → Technical Office Request

If Advanced Search produces no suitable result, the UI shows:

**Required cable was not found in the existing Cable Master.**

The customer may submit **Request Technical Office Review**, which uses the existing `POST /api/technical-office/requests` handoff (`configuration.kind = ADVANCED_CABLE_SEARCH_NO_MATCH`). This task does **not** implement Technical Office engineering, Cable Master creation, or `VALID_NEW_CABLE` classification.

Intended future workflow (not implemented here):

```text
Customer search → no existing cable → Technical Office Request
  → TO engineers/creates cable through governed process
  → Cable Master updated → customer can search again
```

## Security

Server-side enforcement:

- Search requires sign-in (`GET /api/v2/cables/search` → 401 without JWT).
- `POST /api/v2/cables/search` is 405 (read-only; does not create records).
- Customers cannot create or modify Cable Master (`assertCanWriteCableMaster`).
- Customers cannot process Technical Office master-data decisions.
- Advanced Search hits are mapped through `toCableSearchHit` (no costing / price / BOM keys).
- Customer unfiltered `GET /api/master/cables` is paginated (does not dump the full catalog).

## Future V3 relationship

When Technical Office later publishes approved dependency rules, V3 may become a **configuration** engine. Advanced Search remains a **discovery** tool against Cable Master. V3 must not be back-filled from this search, facet lists, or observed Cable Master combinations.
