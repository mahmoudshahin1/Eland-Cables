# Phase 4 — Customer Inquiry & Workspace Preservation Audit

**Project:** Energya Connect Platform  
**Module:** Phase 4 — Customer Inquiry (`My Inquiries`) & Inquiry Workspace (`CommercialInquiryDetail`)  
**Date:** August 29, 2026  
**Status:** Preserved & Verified

---

## 1. Executive Summary & Scope

Phase 4 redesigns the presentation layer of the Customer Inquiry list and Inquiry Workspace to match the modern enterprise design system established in Phase 2/3 and the approved mockups (`Inquiry_01.jpg`, `Inquiry_Details_01.jpg`, `Inquiry_02.jpg`, `Inquiry_Details_02.jpg`).

All business logic, database models, permissions, costing rules (Option B / Decision 5 frozen), Cable Authority validation, drum packing mechanics, and inquiry workflows are 100% preserved without modification.

---

## 2. Preserved Component Architecture

```
src/components/customer/PriceEstimation.tsx
  └── InquiryQuotationWorkspace.tsx (Router / State Container)
        ├── CommercialInquiryList.tsx (Inquiry Register & KPI Dashboard)
        └── CommercialInquiryDetail.tsx (Inquiry Detail Workspace)
              ├── InquiryHeaderForm.tsx (4-Section Enterprise Form)
              ├── InquiryFieldVisibilityPanel.tsx (Field Toggle Drawer)
              ├── InquiryLineAttachmentsCell.tsx (Technical Line Files)
              ├── InquirySummaryBar.tsx (KPI Totals Summary)
              ├── CableSearchSelectModal.tsx (Cable Catalog Search)
              └── DrumMasterSelect.tsx (Governed Drum Masters)
```

---

## 3. Preserved Fields & Manifests

### 3.1 Header Fields (`INQUIRY_HEADER_FIELDS`)
| Field ID | Label | Required | Customer Editable | Description |
|---|---|---|---|---|
| `transactionType` | Transaction Type | Yes | Yes | Type (e.g., Customer Request, Tender) |
| `inquiryDate` | Trx Date | Yes | Yes | Transaction / creation date |
| `customerReference` | Ref. No | Yes | Yes | Customer reference tracking code |
| `customerName` | Customer | Yes | No (Internal only) | Linked Customer account name |
| `organization` | Organization | Yes | Yes | Operating business unit |
| `contactPerson` | Contact Person | No | Yes | Primary client contact |
| `salesAgent` | Sales Agent | No | Internal only | Assigned sales engineer |
| `projectName` | Project Name | No | Yes | Project title / Tender name |
| `currency` | Currency | Yes | Yes | Commercial currency (USD, EUR, EGP, SAR, GBP) |
| `exchangeRate` | Exchange Rate | No | Yes | Commercial exchange rate to base |
| `rawMaterialCurrency` | Raw Material Currency | No | Read-only | Base currency for raw materials |
| `rawMaterialExchangeRate`| Raw Material Exch. Rate | No | Yes | FX rate for raw material conversion |
| `copperPriceRate` | Copper Price | Yes | Yes | LME Copper price ($/MT) |
| `copperPriceUom` | Copper UOM | No | Read-only | Fixed to `USD/MT` |
| `copperPriceSource` | Copper Source | No | Read-only | System Default vs Inquiry Override |
| `aluminiumPriceRate` | Aluminium Price | Yes | Yes | LME Aluminium price ($/MT) |
| `aluminiumPriceUom` | Aluminium UOM | No | Read-only | Fixed to `USD/MT` |
| `aluminiumPriceSource` | Aluminium Source | No | Read-only | System Default vs Inquiry Override |
| `incoterms` | Incoterms (Delivery) | Yes | Yes | Standard delivery terms (FOB, CIF, EXW, DDP, CFR) |
| `deliveryDestination` | Destination | No | Yes | Target port / site location |
| `requestedDeliveryDate` | Delivery Date | No | Yes | Requested delivery timeframe |
| `status` | Status | No | Read-only | Inquiry workflow status |
| `versionNo` | Version No | No | Read-only | Incremental version index |
| `quotationOwner` | Quotation Owner | No | Internal only | Responsible quotation specialist |
| `notes` | Remarks | No | Yes | Customer / general inquiry remarks |
| `salesComments` | Sales Comments | No | Internal only | Private internal sales engineering notes |

### 3.2 Line Items Columns (`INQUIRY_LINE_COLUMNS`)
| Column ID | Label | Data Source |
|---|---|---|
| `lineNumber` | Line No | Line index (1, 2, ...) |
| `materialNumber` | Material No. | ERP / Master cable catalog code |
| `cableDescription` | Cable Description | Full technical cable description |
| `voltage` | Voltage | Extracted / configured voltage class |
| `conductor` | Conductor | Conductor material (Cu / Al) |
| `conductorSize` | Size | Cross-sectional area (mm²) |
| `requestedQuantity` | Drums | Number of standard drums |
| `requestedLengthMeters`| Length (m) | Total line length |
| `cuttingLengthMeters` | Cutting (m) | Length per single drum cut |
| `quantityUom` | UOM | Unit of measure (M, KM) |
| `drumType` | Drum Type | Selected governed drum code |
| `cableTolerancePercent`| Cable Tol. % | Allowed manufacturing tolerance |
| `cableAuthorityStatus`| Engineering Status | `EXISTING_CABLE`, `CONFIGURATION_REQUIRED`, `INVALID` |
| `costingReadinessStatus`| Costing Status | `READY`, `NOT_READY` |
| `value` / `materialCost`| Line Value | Direct material or total line value |
| `actions` | Actions | Edit, Duplicate, Delete line |
| `attachments` | Attachments | Line-level technical data sheets / specs |

---

## 4. Preserved Actions & Business Logic

1. **Inquiry Lifecycle Actions:**
   - **Save Header:** Persists metadata, Incoterms, and currency changes via `updateCommercialInquiry`.
   - **Discard Header:** Reverts uncommitted local edits to PostgreSQL snapshot.
   - **Submit Inquiry:** Validates completeness (rates, destinations, lines) and transitions status to `SUBMITTED`.
   - **New Version:** Generates immutable historical version snapshot and creates next revision (`V2`, `V3`).
   - **Generate Quotation:** Converts commercial inquiry into quotation workspace snapshot.
   - **Cancel Inquiry:** Cancels inquiry and logs audit event.
   - **Field Visibility:** Customizes visible columns and fields per user preferences.
   - **Print Reports:** Summaries, costing breakdown, and technical offer exports.

2. **Line Item Operations:**
   - **Add Line (Manual / Catalog):** Adds new cable item via `addCommercialInquiryLine`.
   - **Edit Line:** Configures length, drum schedule, and cutting parameters.
   - **Duplicate Line:** Clones line item preserving drum configuration.
   - **Delete Line:** Removes line item transactionally.
   - **Calculate Cost:** Executes Option B costing calculation engine per line or for entire inquiry.

---

## 5. Visual Redesign Summary

- **Single Global Logo:** Verified only one brand logo rendered in main application sidebar shell.
- **Enterprise Stat Cards:** Added KPI metrics (Open, Submitted, Under Review, Closed) to the Inquiry List.
- **Structured 4-Section Information Architecture:** Clean 4-card grid for Inquiry Header with section icons and clear typography.
- **Design System Primitives:** Fully adopted `@/components/ui` (`Card`, `StatCard`, `Button`, `Badge`, `StatusBadge`, `Table`, `Input`, `Select`, `Tabs`, `Modal`).
- **Mobile & Tablet Responsive:** Collapsible drawer filters, responsive tables, and floating AI Copilot widget that does not obstruct navigation.
