# Costing configuration required

Official source lists can be imported without producing a READY manufacturing cost. The engine must not fill gaps.

| Gate | Typical code | Who |
|------|----------------|-----|
| RM list prices blank / draft | `PRICE_NOT_CONFIGURED` | Costing Team propose + APPROVE |
| Mapping not APPROVED | `ENGINEERING_NOT_APPROVED` | Technical Office |
| No APPROVED `GovernedBomLine` | BOM / `NOT_READY` | Technical Office after conflict resolution |
| BOM duplicate groups | `BUSINESS_DECISION_REQUIRED` | Technical Office — no auto-pick |
| UOM PCS vs kg (e.g. A-EC04) | `PRICE_UOM_MISMATCH` | Masters / Costing Team |
| No APPROVED+ACTIVE FX | `FX_NOT_CONFIGURED` | Costing Team (LE = EGP) |
| No Drum Master selection | `DRUM_CONFIGURATION_REQUIRED` | Sales on inquiry + import Drum List |
| Logistics / packing amount null | `LOGISTICS_NOT_CONFIGURED` / `PACKING_NOT_CONFIGURED` | Costing Team — do not zero-fill |
| Cable family UNMAPPED | Family scrap may not apply | TO mapping |
| Active costing configuration version | Persist path | Costing Manager activate |
| ELAND golden sheet totals | Must not be copied into `RawMaterialPrice` | Business — regression identity only |

Four ELAND cables (10009487, 10009546, 10010347, 10010439) stay **BUSINESS CONFIGURED = No** until the rows above are actually approved in PostgreSQL.
