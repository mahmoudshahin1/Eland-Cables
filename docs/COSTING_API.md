# Costing Engine API Specification (Increment 10)

## Base Path: `/api/costing`

All endpoints require JWT Bearer authentication.

---

### 1. Calculate Manufacturing Cost
- **Method**: `POST`
- **Path**: `/api/costing/calculate`
- **Authorization**: Internal Costing, Finance, or Technical Office (`costingPricing: true` or `masterData: true`). Customers are blocked (`403 UNAUTHORIZED`).
- **Request Body**:
  ```json
  {
    "materialNumber": "10009487",
    "costingDate": "2026-08-20",
    "quantity": 1,
    "lengthMeters": 1000,
    "currency": "USD",
    "comment": "Initial manufacturing run estimate"
  }
  ```
- **Response `201 Created`**: Returns the created immutable `costingRun` snapshot with full `costingLines`.
- **Response `422 Unprocessable`**: Returns `COSTING_NOT_READY` with explicit array of `blockingReasons`.

---

### 2. Get Costing Run Detail
- **Method**: `GET`
- **Path**: `/api/costing/:id`
- **Parameters**: `id` (Costing Run ID or `costingRunNumber`)
- **Response `200 OK`**: Returns full historical costing snapshot with all frozen line details.

---

### 3. List Costing Runs
- **Method**: `GET`
- **Path**: `/api/costing`
- **Query Parameters**:
  - `materialNumber`: Filter by cable material number
  - `status`: Filter by `INCOMPLETE`, `CALCULATED`, `BLOCKED`, `SUPERSEDED`
  - `isCurrent`: Filter by current active snapshot (`true` / `false`)
- **Response `200 OK`**: `{ "costingRuns": [...] }`

---

### 4. Evaluate Costing Readiness
- **Method**: `GET`
- **Path**: `/api/costing/readiness/:materialNumber`
- **Response `200 OK`**: Returns real-time 4-gate evaluation (`engineeringStatus`, `bomStatus`, `rmPriceStatus`, `overallStatus`, `blockingReasons`).

---

### 5. Recalculate Costing Run
- **Method**: `POST`
- **Path**: `/api/costing/:id/recalculate`
- **Authorization**: Internal Costing/Finance.
- **Response `200 OK`**: Creates and returns a **new** `CostingRun` record while marking the previous run as superseded (`isCurrent: false`).
