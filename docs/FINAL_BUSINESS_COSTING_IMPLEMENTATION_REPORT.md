# Final business costing implementation report

**Date:** 2026-08-25  
**Runtime:** Express (`tsx server.ts`), PostgreSQL, Prisma. NestJS is not in this repo.

## Classification

| Item | Status |
|------|--------|
| Single engine `executeCostingForInquiryLine` | **IMPLEMENTED** |
| Inquiry tabs Overview / Cables / Costing / Drums / Cutting / Documents / Quotation / Activity | **IMPLEMENTED** |
| Approved inquiry header form | **IMPLEMENTED** (preserved) |
| Cutting length persist + qty×cutting to orchestrator | **IMPLEMENTED** |
| Drum Master manual + auto; `DRUM_CONFIGURATION_REQUIRED` blocks READY persist | **IMPLEMENTED** |
| Calculate → orchestrator; NOT_READY exact codes; no fake 0 | **IMPLEMENTED** |
| Save / refresh / reopen from PostgreSQL | **IMPLEMENTED** |
| Attachments | **IMPLEMENTED** (`CommercialInquiryAttachment`) |
| Quotation `costingCalculationId` snapshot | **IMPLEMENTED** |
| Customer projection hides cost | **IMPLEMENTED** |
| Formula `+ - * / ( )`; SUM/IF disabled | **IMPLEMENTED** |
| Scrap BOM% then BOM_LINE>CABLE>FAMILY>MATERIAL_CLASS>GLOBAL; overlap `BUSINESS_RULE_REQUIRED` | **IMPLEMENTED** (aligned with Cable+Material via BOM line %) |
| Costing Hub Metal/LME, additives, incoterm, destination, logistics, drums, packing UIs | **IMPLEMENTED** on existing models; amounts not invented |
| Costing Team approval not TO | **IMPLEMENTED** (RBAC unchanged) |
| PlatformFieldDefinition → inquiry visibility | **PARTIAL** (metadata GET + merge; no full admin designer) |
| 2D/3D engineering visualization | **NOT IMPLEMENTED** |
| D365 HTTP honesty | **IMPLEMENTED** `NOT_CONNECTED` / `connected: false` |
| Report builder | **NOT IMPLEMENTED**; thin print from DB **IMPLEMENTED** |
| Dashboard live KPIs | **IMPLEMENTED** or “No data configured” |
| ELAND READY totals | **CONFIGURATION REQUIRED** |
| Config REJECTED enum | **BUSINESS DECISION** |
| NestJS | Not applicable |

## Verification

- `npx prisma validate`: pass  
- `npx prisma migrate deploy`: applied `20260825120000_inquiry_attachments` (22 migrations)  
- `npx prisma generate`: EPERM on Windows while `npm run dev` locks the query engine DLL (schema already used by tsc)  
- `npx tsc --noEmit`: pass  
- `npm test -- --test-concurrency=1`: **431/431 pass**  
- ELAND probe persist:false: all four **NOT_READY** with honest codes (see `ELAND_FOUR_CABLE_FINAL_TEST.md`)

## APIs added/changed

- `GET /api/inquiries/meta/field-definitions`  
- `GET/POST /api/inquiries/:id/attachments`, `GET/DELETE .../:attachmentId`  
- Inquiry calculate still `POST /api/inquiries/:id/calculate-cost` → `executeCostingForInquiryLine`  
- Existing `/api/admin/platform/costing/metal-rates|logistics-rules|packing-rules` now have Costing Hub create forms  

## Next business action

Costing Team: APPROVE official RM prices (do not paste ELAND sheet totals). Technical Office: APPROVE mappings for 10009546 / 10010347 / 10010439; resolve BOM-CONF-008 and BOM-CONF-067; publish governed BOM. Costing Team: APPROVE+ACTIVATE FX and optional logistics/packing amounts. Sales: pick Drum Master on each inquiry line.
