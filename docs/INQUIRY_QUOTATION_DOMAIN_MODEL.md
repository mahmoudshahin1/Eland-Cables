# Inquiry / Quotation domain model (conceptual)

**Status:** design checkpoint. **No tables created. No Increment 2.**

## Recommendation: one commercial transaction (option B)

**Inquiry and Quotation are not two independent aggregates in the prototype.**

Existing `ErpRequestHeader.transactionType` is `'Customer Request' | 'Sales Quotation' | 'Tender Inquiry'`. One header owns `items[]`, drums, attachments, status logs. Home maps this to display type **Inquiry** vs **Quotation**.

**Recommended production model: one aggregate `CommercialTransaction` (document number family e.g. QT-000123) with `transactionType` / lifecycle, not two parallel roots.**

Lifecycle (logical, not implemented):

```
Inquiry (Draft)
  → Quotation (Calculated / Submitted / Sent)
    → Approved Quotation
      → Customer PO (external/ref)
        → Sales Order (handoff; D365 owns financial SO)
```

Separate `Inquiry` and `Quotation` tables would duplicate header/lines/versions and fight the accepted UI. Type + status + workflow tasks are enough. PO and SO are **downstream documents**, not extra copies of cable lines.

---

## Existing vs proposed entities

| Proposed | Exists today? | Action |
|----------|---------------|--------|
| CommercialTransaction (Inquiry/Quotation type) | `ErpRequestHeader` | Evolve; do not clone |
| CommercialTransactionVersion | `versionNo` on same row (overwrite) | **New rows**; current overwrite is non-compliant |
| CommercialLine | `ErpRequestItem` embedded | Child table |
| LineCuttingLength | partly `drumDetails.drumsList[].lengthMeters` | Structured children; **not** comma-separated |
| LineDrum | `drumDetails` blob | Child table → Drum Master |
| Customer | user `companyName` | Real Customer master later |
| Cable | Cable Master / catalog | Reuse |
| CableConfiguration | configurator state | Persist snapshot on line |
| TechnicalOffer | not generated | Service later |
| Document | `ErpAttachment` metadata only | File store + FK to version |
| CalculationSnapshot | missing | Service later; immutable per version |
| WorkflowInstance / Task | `quotationStatus` strings | State machine later |
| AuditLog | `statusLogs` / `comments` | Structured audit |
| RawMaterialPrice, ScrapRule, … | costing UI mock | Costing bounded context |

Do **not** create all tables now.

---

## Entity catalogue (conceptual)

### CommercialTransaction
- **Purpose:** Root commercial document (inquiry or quotation).
- **Keys:** `id`, `documentNo` (stable across versions, e.g. QT-000123), `transactionType`.
- **Ownership:** Sales org; `customerId`.
- **Lifecycle:** Draft → … → Won/Lost/Cancelled.
- **Versioning:** 1:N `CommercialTransactionVersion`; `currentVersionId`.
- **Audit:** created/modified by/at; never user-typed.

### CommercialTransactionVersion
- **Purpose:** Immutable historical edition except the **current DRAFT**.
- **Keys:** (`documentNo`, `versionNo`) unique.
- **Preserves:** header snapshot, lines, cutting lengths, drums, prices, calculation snapshot id, technical offer ids, documents, workflow history pointer, audit.
- **Behavior:** Update → insert Vn+1 DRAFT, set Vn SUPERSEDED/CANCELLED, **do not delete Vn**. Previous versions **read-only**.
- **Concurrency:** optimistic lock on current version.

### CommercialLine
- **Purpose:** One cable position.
- **Fields:** serial, `cableMasterId` (FK, not duplicated master attrs except frozen description), qty, UOM, prices (role-visible), technicalOfferDocumentId.
- **Ownership:** version.

### CommercialLineCuttingLength
- **Purpose:** Multiple lengths for one line (`1000m × 2`, `2500m × 3`).
- **Fields:** length, piece count, UOM. **Not** a CSV string.

### CommercialLineDrum
- **Purpose:** Drum assignment per cutting length or line.
- **Fields:** `drumMasterId`, qty drums, tare/gross/net as calculated snapshot fields.
- **Ownership:** line / cutting length.

### Customer
- **Purpose:** Party; isolation for portal.
- **Lifecycle:** MDM; effective dates later.

### Cable (Cable Master)
- **Purpose:** Approved identity (`cableMaterialNumber` unique).
- **Ownership:** engineering/master data.

### CableConfiguration
- **Purpose:** Validated parameter set from **existing** configurator (V1/V2 + constraint engine).
- **Relationship:** 0..1 on line; “not in catalog” → TCR, **do not invent Cable Master**.

**Integration boundary (before Increment 5):**

```
Existing Cable Configurator (one hub, V1/V2)
        ↓
cableConstraintEngine / V2 validation
        ↓
Validated CableConfiguration object
        ↓
CommercialLine (after qty, cutting length, drum)
```

Do **not** add a third configurator.

### TechnicalOffer
- **Purpose:** Generated document, not typed quotation prose.
- **Pipeline:** Cable Master + Configuration + BOM/params + customer requirements + **template** → generator → stored Document → FK on **version and/or line**.
- **Ownership:** document service; templates versioned.

### Document
- **Purpose:** Files (TO PDF, attachments).
- **Lifecycle:** tied to version; superseded versions keep files.

### CalculationSnapshot
- **Purpose:** Reproducible commercial result.
- **Inputs stored:** BOM version, RM prices (effective-dated values used), scrap/overhead/incoterm/fx/margin/discount, drums, lengths, formula version, engine version, timestamp.
- **Rule:** submitted/final versions **immutable**. Recalc only on current DRAFT.
- **Boundary:** **not** in React (`InquiryQuotationHome` or `CostingPricing` UI).  
  `CalculationService.calculate(versionId) → snapshot`.

```
Quotation version
  → Calculation Service
    → Cable/BOM → RM consumption → RM prices → scrap → mfg → overhead
    → drum → packaging → incoterm → margin → discount → final price
  → CalculationSnapshot
```

### WorkflowInstance / WorkflowTask
- **Purpose:** Submit/approve/reject; configurable later — **not** a generic workflow builder now.
- **Do not** hard-code transitions in each page; one policy module.

### AuditLog
- **Purpose:** who/when/what on header, lines, costing, import.
- **Users must not enter** created/modified fields.

---

## Versioning design (required, not implemented)

```
QT-000123 V1  SUBMITTED  (immutable)
QT-000123 V2  DRAFT      (editable current)
QT-000123 V3  …
```

Each version copies the full graph. Diff later (Increment versioning): old → new for cable, qty, length, drum, currency, incoterm, RM price, margin, discount, total, requested date.

Prototype `handleCreateNewVersion` **overwrites `versionNo` on the same object** — **conflict**; replace later, do not “fix” inside Home now.

---

## Calculation / costing notes

- Consumption from **BOM master**, not hard-coded kg/km in UI.
- Prices **effective-dated**; quotation dated 10-Aug keeps X after 15-Aug Y.
- Blank RM price = `PRICE_NOT_CONFIGURED`, never 0.
- Formula engine: **restricted AST**, not `eval` / user JavaScript.
- Costing Excel: reuse Import Center pipeline (validate → preview → approve → batch).

---

## Database principles (when tables exist)

Referential integrity; effective dating; version rows; audit; concurrency; transactions; security; historical reproducibility. No CSV lengths/drums; no JS formulas; no history-only-as-JSON.

## D365 F&O boundary

```
EPC Platform → Integration Layer (adapter) → D365 F&O
```

No React→D365. No EPC tables inside D365. SO posting stays ERP. Do not implement integration now.

Approved quote-to-cash baseline: [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md). Phase 1 gaps: [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md). Adapter rule: ADR-004.

## Low-code

No form/workflow/report builders now. Prove quotation + cable + costing + versioning + workflow first.

## Security reminder

Home toolbar gating is **UX only**. Production: authorize every command on the server; customers scoped by `customerId`.
