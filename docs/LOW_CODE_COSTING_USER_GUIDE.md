# Low-Code Costing User Guide

**Audience:** Costing Team (not Technical Office)  
**Engine:** Every Calculate / Preview path uses `executeCostingForInquiryLine` only.

## What you configure (no invented numbers)

| Screen (Costing Configuration) | Model | If amount is blank |
|--------------------------------|-------|--------------------|
| Raw Material Prices | `RawMaterialPrice` | `PRICE_NOT_CONFIGURED` until APPROVED |
| Scrap Rules | `CostingScrapRule` + BOM line % | BOM % first; then BOM_LINE → CABLE → FAMILY → MATERIAL_CLASS → GLOBAL; equal overlap = `BUSINESS_RULE_REQUIRED` |
| Variables / Formulas | `CostingVariable` / `CostingFormula` | Operators `+ - * / ( )` only. SUM/IF stay disabled |
| Cable Assignment | formula `GLOBAL` / `FAMILY` / `CABLE` | Unassigned process layers stay not configured |
| Other Costs → Metal / LME | `CostingMetalRate` | `NOT_CONFIGURED` (inquiry copper/aluminium rates are metadata, not LME) |
| Other Costs → Additives | same `CostingMetalRate` (`rateSource`) | Do not type ELAND workbook totals |
| Other Costs → Incoterm / Destination / Logistics | `CostingLogisticsRule` | `LOGISTICS_NOT_CONFIGURED` |
| Other Costs → Drums / Packing | `DrumMaster` identity + `CostingPackingRule` | Missing drum on inquiry = `DRUM_CONFIGURATION_REQUIRED`; missing packing amount = `PACKING_NOT_CONFIGURED` |
| Exchange rates | `CostingExchangeRate` | Draft rates are ignored until APPROVED+ACTIVE |

Technical Office approves **engineering mapping and BOM conflicts**, not RM prices or costing rules.

## Inquiry Calculate

1. Save header (approved fields stay in the header form).  
2. Add cables (ELAND identities 10009487, 10009546, 10010347, 10010439 are master codes, not prices).  
3. Set cutting length (persisted; qty × cutting is the length sent to the engine).  
4. Select a drum from Drum Master (manual or Auto from capacity).  
5. Calculate — server orchestrator. `NOT_READY` lists exact codes. Never treat 0 as a valid cost.  
6. Refresh / reopen — PostgreSQL snapshot if READY (`costingCalculationId`).  
7. Documents tab stores files in PostgreSQL.  
8. Quotation copies `costingCalculationId`. Customers never see internal breakdown.

## Field visibility

Code catalog `inquiryFieldManifest` plus `GET /api/inquiries/meta/field-definitions` (`PlatformFieldDefinition` when rows exist). localStorage only stores **your column preferences**, not master data.

## Reports

Print Inquiry Summary / Costing Breakdown / Technical Offer from the inquiry menu using saved lines and snapshots. The analytics report builder is `REPORT_BUILDER_NOT_IMPLEMENTED`.
