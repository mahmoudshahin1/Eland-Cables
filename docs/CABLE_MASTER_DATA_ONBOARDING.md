# Cable Master data onboarding (Increment 4)

## Official workbook status

**AVAILABLE** in this workspace at `data/source/Energya Cable Master Data.xlsx` (also `public/source/`). The original file was **not modified**.

Inspected 2026-08-19 before import.

## Workbook structure

| File | Worksheets | Data rows |
|---|---|---|
| Energya Cable Master Data.xlsx | Cable List, Cable Materials | 432 / 4986 |
| Raw Material List.xlsx | Sheet1 | 74 |
| Drum List.xlsx | Sheet1 | 103 (not costing; drums not required for I4 costing) |

### Cable List columns (A1:G433)

| Excel | Type | Blank | PostgreSQL entity.field | Transform | Validation |
|---|---|---|---|---|---|
| Specification Code | string | 0 | CableMaster.customerCode | trim | required; **not unique** (7 codes) |
| Item Code | string | 0 | CableMaster.itemCode | trim | required; **not unique** (264 distinct / 432) |
| Cable Material Number | string | 0 | CableMaster.materialNumber | trim | required; unique (432/432) |
| Eland Item Number | (all blank) | 432 | CableMaster.elandItemNumber | trim | WARNING EMPTY |
| Cable Desc | string | 0 | CableMaster.description | trim | required |
| Total Cable Weight | number | 0 | CableMaster.weight | number | required > 0 |
| Cable Diameter | number | 0 | CableMaster.diameter | number | required > 0 |

Absent engineering columns (Family, Voltage, Conductor, Conductor Size, Core Count, Insulation, Screen, Armour, Sheath, Sheath Colour, Core Colour, Standard, UOM, Status): **CONFIGURATION_REQUIRED** — not invented. UOM stored as `CONFIGURATION_REQUIRED`.

### Normalization

- Trim strings. No PCS→kg. No description→family auto-write into authority fields.
- Item/customer codes may repeat; material number is the natural key.

## Import results (PostgreSQL)

| Metric | Count |
|---|---|
| Total source Cable List records | 432 |
| Total imported | 432 |
| Total rejected | 0 |
| Total warnings | 432 (empty Eland Item Number) |
| Total material-number duplicates | 0 |
| Total active cables | 432 (+ labeled I4-FIXTURE rows from tests) |

`GET /api/master/uniqueness` confirms item code and customer code are not globally unique.

Configurator Tests A–D on **fixture** `I4-FIXTURE-EXISTING` (structured fields present). Official rows lack family/voltage columns, so structured matching of those attributes is not claimed against the 432 ENERGYA descriptions.


### Cable List columns → PostgreSQL

| Excel column | Entity | Field | Transform | Validation |
|---|---|---|---|---|
| Specification Code | CableMaster | customerCode | trim | required; **not** globally unique |
| Item Code | CableMaster | itemCode | trim | required; **not** globally unique |
| Cable Material Number | CableMaster | materialNumber | trim | required; unique natural key |
| Eland Item Number | CableMaster | elandItemNumber | trim | empty = WARNING |
| Cable Desc | CableMaster | description | trim | required. Structured parse is **not** written as invented family/voltage |
| Total Cable Weight | CableMaster | weight | number | required, > 0, blank ≠ 0 |
| Cable Diameter | CableMaster | diameter | number | required, > 0, blank ≠ 0 |
| *(absent)* Cable Family, Voltage, Conductor, Conductor Size, Core Count, Insulation, Screen, Armour, Sheath, Sheath Colour, Core Colour, Standard, UOM, Status | CableMaster | matching nullable fields | none | `CONFIGURATION_REQUIRED` information; values are **not invented** |

If those engineering columns **are** present in a later extract: required when the column exists; values must match `CableParameter` (or ERROR `INVALID_REFERENCE`). Sheath Colour and Core Colour are checked against `CORE_COLOUR` (the only colour parameter kind today).

## Uniqueness (do not assume three global unique keys)

| Key | Rule |
|---|---|
| Material Number | Unique (PostgreSQL unique + import duplicate ERROR) |
| Item Code | Not globally unique |
| Customer / Specification Code | Not globally unique |

`GET /api/master/uniqueness` reports distinct vs duplicate counts from PostgreSQL.

## Import pipeline

Same Import Center. Preview counts: **Valid / Errors / Warnings / Duplicates / Skipped**.

- ERROR → kind not committed
- Conflicting BOM weights → **skipped** (`BUSINESS_DECISION_REQUIRED`), not averaged or versioned
- No auto-fix of business data

## Production import result (this environment)

| Metric | Value |
|---|---|
| Total source records | DATA_REQUIRED (workbook absent) |
| Total imported | 0 official cables |
| Total rejected | n/a |
| Total warnings | n/a |
| Total duplicates | n/a |
| Total active cables (official) | 0 |

Fixture cable `I4-FIXTURE-EXISTING` may exist after tests; it is labeled test data, not ENERGYA production.

## APIs

- `GET /api/master/readiness` — official file probe + counts
- `GET /api/master/uniqueness`
- `POST /api/master/imports/preview` and `commit` — internal `masterData` only (customers 403)
