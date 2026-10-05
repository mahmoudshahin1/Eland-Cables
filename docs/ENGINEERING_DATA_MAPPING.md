# Engineering data mapping (Increment 5)

## A1. Available sources

Searched `data/source/`, `public/source/`, Technical Office tables, parameter masters, and the repo for TDS / C2 / specification workbooks.

| Source | Present | Use for 432-cable engineering attributes |
|---|---|---|
| Energya Cable Master Data.xlsx / Cable List | Yes | **Authoritative** for Material Number, Item Code, Specification/Customer Code, description, **diameter**, **weight**. Eland Item Number blank. |
| Cable Materials (BOM) | Yes | Consumption only. Not a family/voltage/insulation source. |
| Raw Material List.xlsx | Yes | RM identity. No cable construction attributes. |
| Drum List.xlsx | Yes | Drum geometry. Not cable construction. |
| CableParameter masters (seed) | Yes | Allowed **value lists**, not per-cable facts. |
| TechnicalOfficeRequest | Yes | Request JSON, not an approved Cable List map. |
| TDS library / C2 export / spec PDF | **No files in this workspace** | DATA_REQUIRED |

No second workbook contains Family, Voltage, Conductor, Size, Cores, Insulation, Screen, Armour, Sheath, colours, Standard, or Special Additives for the 432 rows.

Customer/Specification codes (N2XH, N2XS2Y, …) are **not** treated as Cable Family. That mapping is BUSINESS_DECISION_REQUIRED.

## A2. Mapping model

```
Cable Material Number → CableEngineeringMapping.attributes[] → CableParameter (when APPROVED/SOURCE)
```

Each attribute:

| Origin | Meaning |
|---|---|
| SOURCE | Copied from the official Cable List (diameter, weight). |
| DERIVED | Description parse **candidate** only (`suggestedValue`, label **Suggested**). `value` stays null. |
| APPROVED | Human-approved parameter code. Not written by Increment 5. |
| MISSING | No source and no suggestion. |
| BUSINESS_DECISION_REQUIRED | Reserved; not auto-assigned. |

`mappingStatus`: COMPLETE (all 15 fields SOURCE or APPROVED) · PARTIAL · MISSING · BUSINESS_DECISION_REQUIRED.

## A3. No automatic inference

`suggestEngineeringFromDescription` never writes Cable Master columns. Suggested ≠ Approved.

## A4. Completeness

After populate: **432 official cables are PARTIAL** (diameter + weight SOURCE; remaining engineering fields MISSING or Suggested-only). Report: `docs/ENGINEERING_MAPPING_REPORT.json` and `GET /api/master/engineering-mappings`.

## A5. Configurator

Structured EXISTING_CABLE requires authoritative family, voltage, conductor, size, cores, and insulation on the Cable Master row.

Unmapped official cables + structured config → **CONFIGURATION_REQUIRED** (or identity-only EXISTING_CABLE when only material number is supplied).

No false EXISTING_CABLE from null engineering columns.
