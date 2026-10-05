# V2 presentation demo

**Purpose:** One connected customer-to-quotation path for Energya Connect V2. Not a V3 delivery. Not an ERP expansion.

**Process rule (unchanged):** Customer override → Customer group → System default. Customers never pick VIP vs Standard.

**Demo customer:** ELAND Cables (`david.smith@elandcables.com`). Governed Customer `C-ELAND` is seeded with `defaultInquiryProcessCode = VIP_FAST_TRACK` so **Submit for quotation** runs the automatic pipeline (`POST /api/v2/inquiries/:id/calculate`). Standard Workflow still only submits for engineering; it does not merge into VIP calculate.

**D365:** remains `NOT_IMPLEMENTED` / `NOT_SENT`.

**V3:** remains blocked. Advanced Cable Search is Cable Master discovery only.

## Automatic pipeline (server-side)

Customer **Submit for quotation** (VIP Fast Track):

1. Engineering validation (existing VIP gates)
2. Costing (`calculateV2CostingRun`)
3. Pricing + quotation draft (`OPEN`, not issued)
4. Financial offer snapshot — **required**. If snapshot creation fails, calculate returns `QUOTATION_BLOCKED` (HTTP 409), `quotation: null`, and the UI must not present a quotation number or View quotation. Optional missing components remain warnings.
5. Internal **Approve** then **Issue** (RBAC)

If engineering fails: `BLOCKED` with reasons. Technical Office is the exception path. Do not fake success.

Costing may return `PARTIAL` when BOM/prices are not governed in the database. That is an honest demo outcome, not a UI substitute.

## Click-by-click

### Customer

1. Open `/login/customer`.
2. Sign in as Eng. David Smith (`david.smith@elandcables.com`). Lands on `/v2/customer`.
3. **New Inquiry**.
4. **Lines** → search Cable Master (Standard Search first). If empty, **Open Advanced Search**. Select an existing cable. Do not create a Material Number.
5. Complete V2 configuration, cutting plan, and confirm drum plan (existing V2 tabs).
6. Set destination / Incoterm on the header if prompted. Missing optional shipment → warning, shipment value may be 0.
7. **Submit for quotation**. Watch **Processing inquiry** — it reflects the API result, not a timer.
8. After issue (internal step below), open **Quotations** or the inquiry **Quotation** tab. Download PDF. **Commercial Commitment** appears only on an issued quotation.

### Internal

1. Sign in as sales (`m.ahmed@energya.com`) or admin.
2. Open `/v2/internal/commercial` (or `/internal` → Inquiries & Quotes).
3. Open the same inquiry.
4. Confirm processing / financial offer / quotation draft.
5. Quotation tab: **Approve** then **Issue**.
6. Customer refreshes and sees the issued quotation.

### Commitment

Issued quotation → customer **Commercial Commitment** → existing sales order / sales agreement path. Integration status stays `NOT_SENT`.

## Dataset notes

Use a Cable Master row that already has a governed BOM and approved prices in **this** PostgreSQL. Do not invent unit prices in the UI.

ELAND process assignment is the existing Customer Master override. Increment tests that use stub actors without `customerMasterIds` remain on system default Standard Workflow.

## Browser E2E

No Playwright/Cypress suite is in this repository. The strongest automated coverage is `src/platform/v2PresentationPipeline.test.ts` (API integration).
