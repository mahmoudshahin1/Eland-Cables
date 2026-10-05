# Commercial Inquiry & Quotation API Specification (Increment 11)

## Base Paths: `/api/inquiries` and `/api/quotations`

All endpoints require JWT Bearer authentication.

---

## 1. Commercial Inquiries API (`/api/inquiries`)

### `GET /api/inquiries`
- **Authorization**: Customer users can list **only their own** inquiries. Internal Sales / Admin can list all.
- **Query Parameters**: `customerId`, `status`, `q` (search by number, reference, customer name).
- **Response**: `{ "inquiries": [ ... ] }`

### `GET /api/inquiries/:id`
- **Authorization**: Customer ownership strictly enforced (`403 UNAUTHORIZED` if Customer A attempts to view Customer B's inquiry).
- **Response**: `{ "inquiry": { ..., "lines": [...], "quotations": [...] } }`

### `POST /api/inquiries`
- **Authorization**: Customer or Internal Sales.
- **Request Body**:
  ```json
  {
    "customerReference": "RFQ-ELAND-2026-001",
    "projectName": "Cairo Metro Line Expansion",
    "currency": "USD",
    "incoterms": "FOB",
    "paymentTerms": "LC at sight",
    "deliveryTerms": "CIF Alexandria",
    "notes": "Fast-track delivery required"
  }
  ```
- **Response `201 Created`**: Returns created `CommercialInquiry` in `DRAFT` status.

### `POST /api/inquiries/:id/lines`
- **Authorization**: Inquiry owner or Internal Sales.
- **Request Body (Path A - Existing Cable)**:
  ```json
  {
    "materialNumber": "10009487",
    "requestedQuantity": 2.5,
    "quantityUom": "KM",
    "requestedLengthMeters": 2500,
    "drumType": "Wood Reel 220"
  }
  ```
- **Request Body (Path B - Unmapped Configuration)**:
  ```json
  {
    "configurationPayload": {
      "family": "LV",
      "voltage": "600/1000V",
      "conductor": "Copper",
      "conductorSize": 95,
      "cores": 1,
      "insulation": "XLPE"
    },
    "requestedQuantity": 1,
    "cableDescription": "Cu / XLPE 0.6/1 kV 1X95 mm2 Custom Design"
  }
  ```
- **Response `201 Created`**: Returns created `CommercialInquiryLine` with Cable Authority and Costing status.

### `POST /api/inquiries/:id/submit`
- **Authorization**: Inquiry owner or Internal Sales.
- **Response `200 OK`**: Transitions status to `SUBMITTED`.

---

## 2. Commercial Quotations API (`/api/quotations`)

### `GET /api/quotations`
- **Authorization**: Customer users view own quotes; Internal Sales view all.
- **Query Parameters**: `customerId`, `status`, `isCurrent`, `q`.

### `GET /api/quotations/:id`
- **Authorization**: Ownership verified.
- **Response `200 OK`**: Returns quotation detail with frozen material cost snapshots.

### `POST /api/quotations`
- **Authorization**: Internal Sales (`assertCanManageQuotations`). Customer users receive `403 UNAUTHORIZED`.
- **Request Body**:
  ```json
  {
    "inquiryId": "inq-123456",
    "currency": "USD",
    "incoterms": "FOB",
    "paymentTerms": "LC at sight",
    "remarks": "Official Commercial Offer V1"
  }
  ```
- **Response `201 Created`**: Creates Version 1 quotation (`isCurrent: true`).

### `POST /api/quotations/:id/versions`
- **Authorization**: Internal Sales.
- **Request Body**: `{ "remarks": "Updated delivery terms" }`
- **Response `201 Created`**: Creates Version V(N+1), marks previous version as `SUPERSEDED`, and preserves historical lines immutably.
