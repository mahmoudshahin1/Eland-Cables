# BOM duplicate investigation (Increment 3)

**Official workbook was not modified.** Duplicate Cable + Raw Material rows were **not** deleted.

## What is known

From Increment 1–2 inspection of `Energya Cable Master Data.xlsx` / **Cable Materials** (when the file was present under `data/source/` and `public/source/`):

- ~4,986 BOM rows
- ~83 duplicate pairs of `(Cable Material Number, Raw Material)` with **different Weight values**
- Import treats those as `DUPLICATE_BOM` **ERROR** and rejects the **entire BOM kind** (no silent partial import)
- Schema unique key is `(cableMaterialNumber, rawMaterialCode, bomVersion)` with default `bomVersion = 1`
- Source sheet has **no** BOM version, effective date, plant, route, or consumption-basis columns

The xlsx files are **not in this workspace snapshot**, so the ~83 pairs cannot be re-opened here with live row numbers. Increment 4 still skips those groups on import and writes `BomDuplicateObservation`. See `docs/BOM_DATA_QUALITY.md`.

## Possible causes (not selected)

The different weights could be any of: BOM version, effective date, manufacturing route, process variation, plant, different consumption basis, true duplication, or source-system inconsistency.

## Decision

**BUSINESS DECISION REQUIRED.**

Do not guess which weight is authoritative. Do not change uniqueness to “last row wins.” Do not auto-delete rows. Costing must not run on this extract until the business names the correct grain (version / date / plant / route).
