# Data dictionary (as implemented today)

This is **not** a PostgreSQL catalog. It describes the current TypeScript / localStorage fields. Do not treat localStorage as production.

## Cable catalog (`MasterCableCatalogItem`)
- `itemCode` — ERP item (not unique in ENERGYA Excel)
- `cableCode` — cable material number (unique in source Excel)
- `customerCode` — specification / family code (e.g. N2XH)
- `description`, `outerDiameterMm`, `approxWeightKgKm`
- `priceConfigured` — false means `PRICE_NOT_CONFIGURED` (never store blank as 0)

## Cable BOM (`CableBomRawMaterial`)
- `cableMaterialNumber`, `rawMaterial`, `weight` (consumption), `unitKm` (UOM; do not convert PCS→kg)

## Raw material (`RawMaterialMasterRecord`)
- `rawMaterialCode`, `description`, `uom`, optional `category`, `supplier`, `currency`
- `price` nullable; `priceStatus` `CONFIGURED` | `PRICE_NOT_CONFIGURED`
- `priceTemporalStatus` `EFFECTIVE` | `DATA_REQUIRED` | `PRICE_NOT_CONFIGURED`

## PostgreSQL Incremental models (Increment 4)
- `BomDuplicateObservation` — forensic skip groups; not a costing source
- `RawMaterialPrice.effectiveFrom` nullable; `temporalStatus`
- `ImportBatch.skippedCount`
- BOM uniqueness remains `(cableMaterialNumber, rawMaterialCode, bomVersion)` — **not** Cable+RM alone

Official Cable List mapping: `docs/CABLE_MASTER_DATA_ONBOARDING.md`. BOM duplicates: `docs/BOM_DATA_QUALITY.md`. RM: `docs/RAW_MATERIAL_DATA_MODEL.md`.

## Increment 5 governance
- `CableEngineeringMapping` — per-cable attributes with origin SOURCE | DERIVED | APPROVED | MISSING | BUSINESS_DECISION_REQUIRED. DERIVED `suggestedValue` is not master data.
- `BomDuplicateObservation.conflictId` plus reviewer fields. Classification does not change weights.
- Keys: `docs/MASTER_DATA_KEY_ANALYSIS.md`

## Drum master (`DrumMasterRecord`)
- `drumCode`, `flange`, `barrel`, `innerWidth`, `outerWidth`, `capacity`
- `dimensionUnitNote` = `SOURCE_UNIT_NOT_IN_FILE`
- `capacityUom` = `CONFIGURATION_REQUIRED`

## Commercial (`ErpRequestHeader` / `ErpRequestItem`)
- One document with `transactionType`, `versionNo` (currently overwritten), lines, `drumDetails`, `bomDetails`

## Cable Master / BOM / RM / Drum (PostgreSQL)
See `docs/INCREMENT_2_MASTER_DATA.md` and `docs/CABLE_MASTER_AUTHORITY.md`. Natural key for cables is `materialNumber`. RM `price` is nullable; blank Excel is `PRICE_NOT_CONFIGURED`, never `0`.

## Parameter compatibility (Increment 3)
- `ParameterCompatibility` (`fromKind`, `fromCode`, `toKind`, `toCode`, `relation` ALLOWED | FORBIDDEN)
- Seeded only from existing `applicableFamilies` on voltage masters (VOLTAGE ↔ FAMILY)

## Technical Office request (Increment 3)
- `TechnicalOfficeRequest` stores configuration JSON, requester, reason, canonical status
