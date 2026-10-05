# CONTENT PRESERVATION INVENTORY

> Every business element enumerated below is **presentation-redesign-only**. "Must Preserve? = YES" means the field/behavior/data/label semantics stay; "Redesign Allowed? = presentation-only" means only visual treatment (layout, spacing, control styling, grouping, iconography, responsive form) may change. Data-model field IDs, validation rules, dependencies, workflow states, and API contracts **do not change**.

Legend — **Type:** F=field, A=action/button, T=table/column, M=modal/drawer, S=status/badge, W=workflow, N=nav.

## A. App Shell & Navigation

| Module | Current element | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- | --- |
| Shell | Two-portal model (customer/internal) resolved from `userType` | W | YES | presentation-only | No portal switcher added/removed. |
| Navbar | Logo (`/logo.png`), platform subtitle, notifications, theme toggle, user menu (Profile/Logout) | A/N | YES | presentation-only | Logo asset never altered. |
| Sidebar | Customer nav (9 defined, Phase-1 shows 3) + internal nav (12) with permission keys | N | YES | presentation-only | Same labels/routes/permission gating. |
| Sidebar | Costing navy sub-nav (grouped, `?tab=`) | N | YES | presentation-only | Same groups/tabs. |
| Footer | Brand lockup + taglines + copyright | — | YES | presentation-only | Taglines are content — keep. |
| AI Copilot | "AI Copilot" entry (unwired) | A | YES (as-is) | presentation-only | Do not activate; visual only. |

## B. Login / Auth

| Module | Current element | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- | --- |
| Login | Email, Password, Remember me, Forgot password | F/A | YES | presentation-only | |
| Login | Portal toggle (Internal/Customer) + dedicated portal paths | W | YES | presentation-only | `validateLoginPortal` logic unchanged. |
| Login | Entra ID "Coming Soon", demo accounts note | A | YES | presentation-only | Content preserved. |
| Forgot password | Two-step JWT reset (token display, new/confirm password) | W/F | YES | presentation-only | Prototype behavior kept. |

## C. Inquiry Header fields (ALL business fields Must Preserve = YES)

| Current element | Field ID | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- | --- |
| Transaction Type | `transactionType` | F (enum) | YES | presentation-only | Options: Customer Request / Sales Quotation / Tender Inquiry. Required. |
| Trx Date | `inquiryDate` | F (date) | YES | presentation-only | Required. |
| Ref. No | `customerReference` | F (text) | YES | presentation-only | Required. |
| Customer | `customerName` | F (text) | YES | presentation-only | Read-only for customers; internal "+ Add New Customer" (non-functional) preserved as-is. |
| Organization | `organization` | F (enum) | YES | presentation-only | Energya Cables / ELAND Cables / Energya Export. Required. |
| Contact Person | `contactPerson` | F | YES | presentation-only | |
| Sales Agent | `salesAgent` | F | YES | presentation-only | |
| Project Name | `projectName` | F | YES | presentation-only | |
| Currency | `currency` | F (enum) | YES | presentation-only | Changing resets RM currency + clears Cu/Al. Dependency preserved. |
| Exchange Rate | `exchangeRate` | F (number) | YES | presentation-only | |
| Raw Material Currency | `rawMaterialCurrency` | F (display-only) | YES | presentation-only | Mirrors Currency. |
| Raw Material Exchange Rate | `rawMaterialExchangeRate` | F (number) | YES | presentation-only | |
| Copper Price | `copperPriceRate` | F (number) | YES | presentation-only | USD/MT; source badge System Default / Inquiry Override. Required. |
| Aluminium Price | `aluminiumPriceRate` | F (number) | YES | presentation-only | USD/MT; source badge. Required. |
| Status | `status` | S (read-only) | YES | presentation-only | `formatInquiryStatus`. |
| Incoterms (Delivery) | `incoterms` | F (enum) | YES | presentation-only | FOB/CIF/EXW/DDP/CFR/DAP; sets `deliveryTerms`. Required. |
| Destination | `deliveryDestination` | F | YES | presentation-only | Required for submit. |
| Delivery Date | `requestedDeliveryDate` | F (date) | YES | presentation-only | |
| Version No | `versionNo` | F (read-only) | YES | presentation-only | +Version when SUBMITTED + current. |
| Remarks | `notes` | F (textarea) | YES | presentation-only | |
| Quotation Owner | `quotationOwner` | F | YES | presentation-only | Defaults from createdBy. |
| Sales Comments | `salesComments` | F (internal) | YES | presentation-only | `customerVisible:false` — keep hidden for customers. |
| Payment Terms | `paymentTerms` | F (enum) | YES | presentation-only | Read-only on Overview tab. |
| Inquiry No. | `inquiryNumber` | F (display) | YES | presentation-only | In title/subtitle. |

## D. Inquiry Line fields (ALL business fields Must Preserve = YES)

| Current element | Field ID | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- | --- |
| Line No. | `lineNumber` | T | YES | presentation-only | Auto. |
| Cable Material No. | `materialNumber` | F/T | YES | presentation-only | From catalog. |
| Cable Description | `cableDescription` | F/T | YES | presentation-only | |
| Voltage / Conductor / Size | parsed | T | YES | presentation-only | Derived display. |
| Drums | `requestedQuantity` | F/T | YES | presentation-only | Drum count. |
| Total Length (m) | `requestedLengthMeters` | F/T | YES | presentation-only | Derived = drums × cutting when both set. Dependency preserved. |
| Cutting Length (m) | `cuttingLengthMeters` | F/T | YES | presentation-only | `validateCuttingLength`. |
| Cable Tolerance (%) | `cableTolerancePercent` | F/T | YES | presentation-only | |
| UOM | `quantityUom` | F/T | YES | presentation-only | Default KM. |
| Drum Required | `drumType` | F/T | YES | presentation-only | Resolved vs Drum Master. |
| Value | `value`/`materialCost` | T (internal) | YES | presentation-only | `systemProtected`, hidden from customers. |
| Currency | `currency` | T | YES | presentation-only | Inquiry header currency. |
| Tech. Status | `cableAuthorityStatus` | S | YES | presentation-only | Mapped/Config Required/Valid/Invalid. |
| Costing Status | `costingReadinessStatus` | S (internal) | YES | presentation-only | Ready/Not Ready. |
| Attachments | line attachments | A/M | YES | presentation-only | Technical Offer per line, ≤8 MB. |
| Drum schedule | `drumSchedule` rows | T | YES | presentation-only | drumCode/noOfDrums/cuttingLengthM/drumTolerancePercent. |

**Inquiry tabs (8):** Overview, Cables, Costing, Drums, Cutting, Documents, Quotation, Activity — **all Must Preserve = YES, presentation-only.**
**Inquiry actions:** Save, Discard, Calculate, Submit, New Version, Generate Quotation, Cancel Inquiry, Field Visibility, More — **Must Preserve = YES.**
**Submit validation codes** (COPPER/ALUMINIUM_PRICE_REQUIRED, DESTINATION_REQUIRED, INCOTERMS_REQUIRED, LINES_REQUIRED, CALCULATION_REQUIRED, TECHNICAL_OFFER_REQUIRED) — **Must Preserve = YES.**
**Status machine** (DRAFT/UNDER_REVIEW/SUBMITTED/QUOTED/CANCELLED/CLOSED) — **Must Preserve = YES.**

## E. Cable Selection parameters + dependencies (ALL Must Preserve = YES)

| # | Current parameter | Field key | Must Preserve? | Redesign Allowed? | Dependency (preserved) |
| --- | --- | --- | --- | --- | --- |
| 1 | Cable Family | `family` | YES | presentation-only | root |
| 2 | Voltage Level / Class | `voltageClass` | YES | presentation-only | needs family |
| 3 | Voltage Rating / Level | `voltage` | YES | presentation-only | needs voltageClass |
| 4 | Standard & Specification | `standard` | YES | presentation-only | needs voltage |
| 5 | Conductor Material | `conductorMaterial` | YES | presentation-only | needs voltage |
| 6 | Construction Class | `conductorClass` | YES | presentation-only | needs conductorMaterial |
| 7 | Conductor Shape | `conductorShape` | YES | presentation-only | needs conductorClass |
| 8 | Conductor Size | `conductorSize` | YES | presentation-only | needs conductorMaterial |
| 9 | No. of Cores | `cores` | YES | presentation-only | needs conductorSize |
| 10 | Conductor Water Blocking | `conductorWaterTight` | YES | presentation-only | needs conductorSize |
| 11 | Insulation Material | `insulation` | YES | presentation-only | needs cores |
| 12 | Insulation Color | `insulationColor` | YES | presentation-only | needs insulation |
| 13 | Outer Semi-Conductor | `outerSemiConductor` | YES | presentation-only | needs insulation |
| 14 | Screen Type | `screenType` | YES | presentation-only | needs insulation |
| 15 | Screen Cross-Section (CSA) | `screenCSA` | YES | presentation-only | needs screen (not None) |
| 16 | Screen Water Tightness | `screenWaterTight` | YES | presentation-only | needs screen |
| 17 | Inner Sheath / Bedding | `bedding` | YES | presentation-only | needs insulation + screenType |
| 18 | Armour Layer | `armour` | YES | presentation-only | needs bedding OR screenType |
| 19 | Armour Water Tightness | `armourWaterTight` | YES | presentation-only | needs armour |
| 20 | Outer Sheath (Jacket) | `sheathing` | YES | presentation-only | needs insulation |
| 21 | Outer Sheath Color | `sheathingColor` | YES | presentation-only | needs sheathing |
| 22 | Water Tight / Blocking | `waterTight` | YES | presentation-only | needs sheathing |
| 23 | Termite / Rodent Protection | `termiteProtection` | YES | presentation-only | needs sheathing |
| 24 | CPR Euroclass | `cprClass` | YES | presentation-only | needs sheathing |
| 25 | Special Installation Area | `specialArea` | YES | presentation-only | needs sheathing |
| 26 | Special Engineering Req. | `specialAdditives` | YES | presentation-only | needs sheathing |
| 27 | Customer-Specific Identification | `customerIdentification` | YES | presentation-only | needs sheathing |
| + | Customer Specification Code | `customerCode` | YES | presentation-only | when selectionMode=CUSTOMER |
| + | Core Colors (per core) | `coreColors.{n}` | YES | presentation-only | when cores>1 |

**Cascading engine (Must Preserve = YES):** `isParameterUnlocked`, `sanitizeSelectionsAfterChange`, `resolveParameterOptionsV2`, `mergeWithCatalog`, `handleUpdateParam` side effects, `validateCableConfigurationV2`, `evaluateCableAuthority`, `EXISTING_APPROVED`/`VALID_NEW_CABLE`/`INVALID_CONFIGURATION`/`CONFIGURATION_REQUIRED` determination, stepper sequence. Result-panel states 1/2/3 and their fields — presentation-only.

## F. Technical Office (ALL Must Preserve = YES)

| Current element | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- |
| 7 tabs (Engineering Mapping, BOM Governance, TCR Queue, Cable Master Catalog, Excel Pre-Import Method B, Master Parameters, Raw Materials Reference) | N | YES | presentation-only | |
| Mapping workflow (SUBMIT/ASSIGN/REVIEW/APPROVE/REJECT/CANCEL) | W | YES | presentation-only | |
| BOM governance workflow (ASSIGN/START_REVIEW/DECIDE/RESOLVE/APPROVE/REJECT/REOPEN) + decision form | W/F | YES | presentation-only | Governed consumption logic untouched. |
| TCR statuses + Approve & Release Cable | W | YES | presentation-only | |
| Excel Method-B 44-column template | T | YES | presentation-only | |

## G. Drum Selection fields (ALL Must Preserve = YES)

| Current element | Field key | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- | --- |
| Cable Weight/m | `cableWeightKgM` | F | YES | presentation-only | DrumOptimizer, kg/m. |
| Total Order Tolerance | `totalOrderTolerancePercent` | F | YES | presentation-only | % |
| Cable Tolerance* | `cableTolerancePercent` | F | YES | presentation-only | Required, 0–20. |
| Drum Code | `drumCode` (`DrumMasterSelect`) | F | YES | presentation-only | EWD master. |
| No. of Drums | `noOfDrums` | F | YES | presentation-only | min 1. |
| Cutting Length / Drum | `cuttingLengthM` | F | YES | presentation-only | suffix m. |
| Drum Tolerance* | `drumTolerancePercent` | F | YES | presentation-only | Required, 0–20. |
| Fill % / Nominal Line (m) / Total Line Wt (kg) | computed | T | YES | presentation-only | Formulas untouched. |
| Drum master fields (flange/barrel/inner/outer/capacity) | — | F/T | YES | presentation-only | From Drum List.xlsx. |
| DrumDetailsModal reel types + tare weights | — | F | YES | presentation-only | Prototype schedule. |
| Container 20ft/40HC recommendation logic | W | YES | presentation-only | Client math untouched. |
| Automatic EWD = CONFIGURATION_REQUIRED boundary | W | YES | presentation-only | Do not "fix" — governance boundary. |

## H. Costing (ALL Must Preserve = YES — engine freeze)

| Current element | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- |
| Grouped sub-nav + 16 panels | N | YES | presentation-only | Same tabs. |
| Option B banners / Decision 5 gate | S/W | YES | presentation-only | **Freeze — do not alter semantics.** |
| Validation Direct RM cost breakdown (10 columns) | T | YES | presentation-only | Column set + pricing-source display preserved. |
| RM / Prices / BOM / Currencies / FX / Metal panels CRUD + approval workflow | W/F | YES | presentation-only | |
| `CostingMetalCostComponent` semantics | W | YES | presentation-only | **Freeze.** |

## I. Master Data / Administration / Production / Profile / Reports / Finance

| Module | Current element | Type | Must Preserve? | Redesign Allowed? | Notes |
| --- | --- | --- | --- | --- | --- |
| Master Data | 7 tabs + import flow (upload/validate/preview/confirm) | N/W | YES | presentation-only | Entities cables/boms/raw_materials/drums. |
| Administration | 6 tabs + user lifecycle + role/permission matrix | N/W | YES | presentation-only | `canAssign` gating preserved. |
| Production | NOT_CONNECTED mock ledger + disabled actions | T/A | YES | presentation-only | Keep NOT_CONNECTED messaging honest. |
| Profile | Read-only account fields + Change password | F/A | YES | presentation-only | |
| Reports | REPORT_BUILDER_NOT_IMPLEMENTED + KPIs | S | YES | presentation-only | |
| Finance | NOT_IMPLEMENTED mock ledger | T | YES | presentation-only | |
