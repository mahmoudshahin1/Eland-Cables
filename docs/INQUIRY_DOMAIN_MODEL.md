# Commercial Inquiry Domain Model (Increment 11)

## Overview & Architecture

Increment 11 connects customer RFQ commercial inquiries and sales quotation workflows directly to the PostgreSQL master-data authority, Cable Authority (`evaluateCableAuthority`), Technical Office request generation, and the Costing Readiness Gate (`evaluateCableCostingReadiness` / `executeCostingRun`).

```
                    COMMERCIAL INQUIRY BUSINESS FLOW
                    
Customer / Sales User
         │
         ▼
[CommercialInquiry] (inquiryNumber: INQ-2026-XXXX, customerId, currency, incoterms, DRAFT)
         │
         ├── Add Inquiry Line
         │        │
         │        ├── PATH A: Select Approved Master Cable
         │        │     └── evaluateCableAuthority({ materialNumber })
         │        │           └── If EXISTING_CABLE:
         │        │                 ├── Stores authoritative materialNumber
         │        │                 ├── Checks Costing Readiness Gate (4-Gate)
         │        │                 └── Status: CABLE_VALIDATED / COSTING_READY
         │        │
         │        └── PATH B: New / Unmapped Configuration
         │              └── evaluateCableAuthority(configurationPayload)
         │                    ├── If TECHNICALLY_VALID_NOT_MASTER:
         │                    │     ├── Automatically generates TechnicalOfficeRequest (TCR-INQ-XXXX)
         │                    │     └── Status: TECHNICAL_OFFICE_REQUIRED
         │                    └── If INVALID_CONFIGURATION:
         │                          └── Rejected immediately with specific compatibility error
         │
         ▼
[Submit Inquiry] ──► Validates lines ──► Status: SUBMITTED
         │
         ▼
[Sales Quotation Generation] ──► Creates CommercialQuotation V1
```

---

## 1. Inquiry State Machine

| Status | Description | Allowed Operations |
|---|---|---|
| **`DRAFT`** | Initial editable inquiry state. | Add/edit/delete lines, update header, submit. |
| **`SUBMITTED`** | Formally submitted by customer or sales. | Internal Sales review, Technical Office processing, quotation generation. |
| **`UNDER_REVIEW`** | Technical Office is actively reviewing unmapped lines. | Technical review, mapping creation. |
| **`QUOTED`** | At least one official `CommercialQuotation` has been generated from this inquiry. | Quotation revision, customer viewing. |
| **`CLOSED`** | Inquiry fulfilled or contract signed. | Read-only historical inspection. |
| **`CANCELLED`** | Withdrawn by customer or sales. | Archived. |

---

## 2. Inquiry Line State Machine

- **`DRAFT`**: Line item initialized.
- **`CABLE_VALIDATED`**: Cable matches an approved master cable in `CableMaster` with approved engineering mapping.
- **`COSTING_READY`**: Cable satisfies all 4 gates of costing readiness (material manufacturing cost available).
- **`TECHNICAL_OFFICE_REQUIRED`**: Cable is technically valid but not approved in Cable Master; linked to `TechnicalOfficeRequest`.
- **`CONFIGURATION_REQUIRED`**: Cable parameter configuration or compatibility requires governance setup before line validation.
- **`CANCELLED`**: Line revoked.

---

## 3. Strict Commercial Boundaries

- **Material Cost is NOT Selling Price**: Line items display `Material Cost: USD X.XX` (calculated from the Increment 10 costing engine). Selling price remains strictly `NULL`.
- **Zero Commercial Pricing Formulas**: Margins, markups, customer discounts, sales commissions, and commercial price calculation formulas remain strictly `NOT_CONFIGURED`.
- **Zero Automatic Drum Formulas**: Drum selection remains `CONFIGURATION_REQUIRED`.
- **Zero D365 Integrations**: D365 remains decoupled.
