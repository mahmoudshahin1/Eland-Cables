# INQUIRY DESIGN PROPOSAL (presentation-only)

> Documents the current inquiry journey + dependencies precisely, then the visual redesign. **All fields, validation, dependencies, status machine, projection, and APIs are preserved.**

## 1. Current journey (verified)

Active stack: `PriceEstimation` ("My Inquiries") → `InquiryQuotationWorkspace` → `CommercialInquiryList` / `CommercialInquiryDetail` (+ `InquiryHeaderForm`, 8 tabs, `InquirySummaryBar`, modals). Internal reuses via `SalesQuotations` ("Inquiries & Quotes"). Legacy `ErpCustomerRequestView.tsx` is unrouted mock.

1. **List** → create/open inquiry (12/page; search, status, date, sort).
2. **Detail (DRAFT/Open)** → fill header, add cable lines (via `CableSearchSelectModal`), edit lines (drum plan, cutting), **Calculate** cost, attach Technical Offer per line.
3. **Submit** → client checks (`collectInquirySubmitMissingItems`) then server enforcement; status → SUBMITTED.
4. **New Version** (SUBMITTED + current) / **Generate Quotation** (internal sales) / **Cancel Inquiry**.

## 2. Fields & dependencies (must preserve)

- **Header (22 business fields):** Transaction Type, Trx Date, Ref No, Customer (read-only for customers), Organization, Contact Person, Sales Agent, Project Name, Currency, Exchange Rate, Raw Material Currency (mirror), Raw Material Exchange Rate, Copper Price (USD/MT + source badge), Aluminium Price (USD/MT + source badge), Status (read-only), Incoterms (Delivery), Destination, Delivery Date, Version No, Remarks, Quotation Owner (+ Sales Comments internal, Payment Terms, Inquiry No.). See `CONTENT_PRESERVATION_INVENTORY.md §C`.
- **Line fields:** Line No., Cable Material No., Cable Description, Voltage/Conductor/Size (parsed), Drums, Total Length (m), Cutting Length (m), Cable Tolerance (%), UOM, Drum Required, Value (internal), Currency, Tech. Status, Costing Status (internal), Attachments, `drumSchedule` rows. See `§D`.
- **Dependencies (preserve):** Currency change → set RM currency + clear Cu/Al rates/sources; Incoterms → set deliveryTerms; Total length = drums × cutting when both > 0; Customer locked for customers; costs lock after submit.
- **Validation codes (preserve):** COPPER_PRICE_REQUIRED, ALUMINIUM_PRICE_REQUIRED, DESTINATION_REQUIRED, INCOTERMS_REQUIRED, LINES_REQUIRED, CALCULATION_REQUIRED, TECHNICAL_OFFER_REQUIRED.
- **Status machine (preserve):** DRAFT(Open)/UNDER_REVIEW/SUBMITTED/QUOTED/CANCELLED/CLOSED; editable only DRAFT/UNDER_REVIEW.
- **RBAC/projection (preserve):** `requireInquiryAuth` + `assertCanManageInquiry` + `assertCustomerBusinessScope`; `commercialProjection.ts` strips cost/value/internal fields for customers.

## 3. Visual redesign (presentation only)

### List
- Filter bar as one row of `ui/Form` controls; primary "New Inquiry", secondary Export/Columns.
- `ui/Table` with `StatusBadge` status column, selectable rows, clear pagination footer ("Showing X–Y of N").
- Empty/loading standardized (skeleton rows).

### Detail
- **Sticky header:** title `Commercial Inquiry / {ref} · V{n}`, `{inquiryNumber}` subtitle, status `StatusBadge`, toolbar (`Save`, `Discard`, `Calculate`, `Submit`, `New Version`, `Generate Quotation`, `Cancel Inquiry`, `Field Visibility`, `More`) as `ui/Button` variants; destructive (Cancel) = accent/outline.
- **Header card:** collapsible ("Inquiry header" with collapsed summary `{currency} · Cu {rate} · Al {rate} · {status}`). Regroup fields into fieldsets (Transaction / Parties / Commercial / Delivery / Notes) using `ui/Field`. Metal price fields show source badge (System Default / Inquiry Override) and fixed USD/MT suffix. Field Visibility remains a toggle panel.
- **Tabs (`ui/Tabs`):** Overview, Cables, Costing, Drums, Cutting, Documents, Quotation, Activity.
  - *Overview:* two `ui/Card`s (Inquiry Summary + Commercial/construction).
  - *Cables:* wide `ui/Table` (`min-w-[1100px]`), row actions (edit/delete/duplicate/up/down), column visibility, in-line search, footer Total row; attachments cell → drawer.
  - *Costing:* internal cost tables via `CostingUiPrimitives` styling; customer sees limited messaging (projection preserved).
  - *Drums / Cutting:* read-only schedule + "Edit cutting / drum" opening line modal.
  - *Documents:* upload/download/delete (≤8 MB) with drag/drop card.
  - *Quotation:* linked quotations list + Generate (internal).
  - *Activity:* version-compare (A/B selectors, price diff) + audit timeline.
- **Summary bar:** `InquirySummaryBar` as stat strip (Total Lines/Drums/Length/Value/Currency).
- **Modals/drawers:** CableSearchSelectModal, Edit Line #{n}, Submit summary, Missing-info (lists blocking codes with labels), Line attachments → `ui/Modal`/`Drawer`.

### Responsive
- Header form `grid-cols-1 md:grid-cols-3`; tabs wrap; line/costing tables `overflow-x-auto`; toolbar `flex-wrap`; modals full-width capped height. No business data hidden on mobile.
