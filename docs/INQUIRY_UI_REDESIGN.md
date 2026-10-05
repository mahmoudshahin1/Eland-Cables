# Increment 12 — Commercial Inquiry UI Redesign & Persistence

## Architecture (existing + new)

### Backend (preserved + extended)
- **Prisma models:** `CommercialInquiry`, `CommercialInquiryLine`, `CommercialQuotation` (unchanged domain rules)
- **Repository:** `src/server/commercialRepository.ts`
- **Routes:** `src/server/commercialRoutes.ts`
- **Projection / field security:** `src/server/commercialProjection.ts`
- **RBAC + customer scope:** unchanged (`rbac.ts`, `customerScope.ts`)

### New schema fields (`CommercialInquiry`)
- `versionNo`, `isCurrent`, `supersedesInquiryId`, `inquiryGroupKey`
- `modifiedBy`, `salesAgent`, `quotationOwner`
- `commercialMetadata` (JSON for exchange/metal rates without new typed columns)

Migration: `prisma/migrations/20260821120000_increment12_inquiry_ui_persistence`

## API changes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/inquiries` | Paginated list (`page`, `pageSize`, `sortBy`, `q`, `status`) |
| GET | `/api/inquiries/:id` | Full aggregate |
| GET | `/api/inquiries/:id/versions` | Version history |
| POST | `/api/inquiries` | Create (transactional) |
| PATCH | `/api/inquiries/:id` | Update header (DRAFT only) |
| POST | `/api/inquiries/:id/submit` | Submit |
| POST | `/api/inquiries/:id/new-version` | Create V(n+1), preserve prior version |
| POST | `/api/inquiries/:id/cancel` | Cancel |
| POST | `/api/inquiries/:id/quotation` | Generate quotation (sales) |
| POST/PATCH/DELETE | `/api/inquiries/:id/lines...` | Line CRUD, duplicate, reorder |

All responses pass through `projectInquiryForActor()` — customers do not receive `commercialMetadata`, `materialCost`, or costing fields.

## Frontend architecture

```
InquiryQuotationWorkspace
├── CommercialInquiryList      (PostgreSQL list, pagination, column prefs)
└── CommercialInquiryDetail    (sticky header, tabs, line grid, summary)
```

Supporting services:
- `src/services/commercialInquiryApiService.ts` — REST client
- `src/services/inquiryFieldManifest.ts` — field/column definitions + personal prefs (localStorage)

### Field visibility
- **Administrative field config (Increment 12 B3):** planned; manifest is structured for future admin merge
- **Personal views:** localStorage keys for list/header/line column visibility
- **System protected fields:** hidden from customers in manifest + stripped server-side

## Known limitations
- Document attachments tab shows honest empty state (no document API yet)
- Activity tab references server AuditEvent (no dedicated activity feed endpoint)
- Administrative low-code field editor UI not implemented (B3 not started)
- Demo login without JWT cannot access PostgreSQL-backed inquiries (by design)

## Test coverage
- `src/server/increment12.inquiryUi.test.ts` — persistence, versioning, cancel, projection
- Existing Increment 11/12 tests updated for paginated list response
