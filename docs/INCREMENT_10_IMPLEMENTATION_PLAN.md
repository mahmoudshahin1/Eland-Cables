# Increment 10 — Costing Engine Calculation Foundation: Implementation Plan

> **Stage A Architectural Review Document**  
> Status: Prepared for User Approval. **Zero implementation code has been written.**

---

## 1. Executive Summary & Strict Boundaries

Increment 10 implements **ONLY the foundational Material Cost Calculation Engine** as an isolated, deterministic Domain Service. It executes solely against cables that satisfy the **4-Gate Costing Readiness** criterion (`READY_FOR_COSTING`).

### Strict Non-Negotiable Boundaries:
- **NO Cost Calculation beyond Raw Material Cost**: Process cost, machine rates, labour rates, energy rates, factory overheads, and administrative overheads remain strictly `NOT_CONFIGURED`.
- **NO Commercial Logic**: Scrap formulas (remain `NOT_CONFIGURED`), sales margins, markups, commercial discounts, customer-specific pricing, selling prices, and quotation pricing remain strictly out of scope.
- **NO Automatic Drum Optimization**: Drum selection remains `CONFIGURATION_REQUIRED`.
- **NO D365 / MES / WMS / Planning Integrations**: Stubs and external connectors remain strictly out of scope.
- **NO UI Redesign**: The approved Energya logo, white theme, Inter typography, full-page login, and navigation hierarchy remain 100% protected.

---

## 2. Current Architectural State & Reused Components

| Component / Layer | Source File / Model | Reused In Increment 10 |
|---|---|---|
| **Cable Authority & Master** | `CableMaster` in `prisma/schema.prisma` | Natural key `materialNumber`, description, diameter, weight |
| **Engineering Mapping** | `CableEngineeringMapping` (Increment 6 & 7) | Authoritative `APPROVED` mapping only (`family`, `voltage`, `conductor`, `size`, `cores`, `insulation`) |
| **Governed BOM Line** | `GovernedBomLine` (Increment 8) | Authoritative `APPROVED` consumption rates, version, plant, route |
| **Raw Material Master** | `RawMaterial` in `prisma/schema.prisma` | Code, description, master UOM |
| **Raw Material Price** | `RawMaterialPrice` & `getValidRawMaterialPrice` (Increment 9) | Dimensionally & temporally valid approved price resolution |
| **Costing Readiness Gate** | `evaluateCableCostingReadiness` | 4-gate verification before calculation |
| **Audit Logging** | `AuditEvent` & `appendAudit` | Immutable audit entries for calculation, blocking, and recalculation |
| **Role-Based Access Control** | `src/server/rbac.ts` | Customer blocked (`403 UNAUTHORIZED`); Internal Costing/Finance authorized |

---

## 3. Database Schema Changes (Prisma Migration)

To maintain immutable historical snapshots of every calculation run without duplicating existing master-data entities:

### 3.1 Migration: `20260820080000_increment10_costing_foundation`

```prisma
enum CostingRunStatus {
  DRAFT
  CALCULATED
  INCOMPLETE
  BLOCKED
  SUPERSEDED
}

enum CostComponentType {
  MATERIAL
  PROCESS
  LABOUR
  ENERGY
  OVERHEAD
  PACKAGING
  DRUM
  SCRAP
  OTHER
}

model CostingRun {
  id                  String           @id @default(cuid())
  costingRunNumber    String           @unique // e.g. CR-20260820-XXXX
  materialNumber      String
  cable               CableMaster      @relation(fields: [materialNumber], references: [materialNumber])
  costingDate         DateTime
  currency            String           @default("USD")
  quantity            Decimal          @default(1)
  lengthMeters        Decimal          @default(1000)
  lengthKm            Decimal          @default(1)
  engineeringRevision Int              @default(1)
  bomVersion          Int              @default(1)
  status              CostingRunStatus @default(INCOMPLETE)
  
  // Cost Aggregates
  materialCost        Decimal
  processCostStatus   String           @default("NOT_CONFIGURED")
  overheadCostStatus  String           @default("NOT_CONFIGURED")
  scrapCostStatus     String           @default("NOT_CONFIGURED")
  manufacturingCost   Decimal?         // Null when process/overhead/scrap are not configured

  // Provenance & Audit
  isCurrent           Boolean          @default(true)
  supersededById      String?
  blockingReasons     Json?
  createdBy           String?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  costingLines        CostingLine[]

  @@index([materialNumber, isCurrent])
  @@index([costingDate])
  @@index([status])
}

model CostingLine {
  id                  String            @id @default(cuid())
  costingRunId        String
  costingRun          CostingRun        @relation(fields: [costingRunId], references: [id], onDelete: Cascade)
  componentType       CostComponentType @default(MATERIAL)
  rawMaterialCode     String
  rawMaterialDesc     String?
  
  // Quantities
  consumptionPerKm    Decimal
  totalConsumption    Decimal
  consumptionUom      String
  
  // Price Resolution Snapshot
  price               Decimal
  priceCurrency       String
  priceUom            String
  priceBasis          String            @default("PER_KG")
  priceRevision       Int               @default(1)
  priceId             String?
  effectiveFrom       DateTime?
  effectiveTo         DateTime?
  
  // Calculated Cost Line
  lineCost            Decimal
  calculationNotes    String?
  createdAt           DateTime          @default(now())

  @@index([costingRunId])
  @@index([rawMaterialCode])
}
```

---

## 4. Costing Domain Services & Calculation Architecture

### 4.1 Layer Separation & Abstraction
```
CostingRequest (materialNumber, costingDate, quantity, length, currency)
      │
      ▼
CostingReadinessGate (evaluateCableCostingReadiness)
  ├── If NOT READY ──► Returns COSTING_NOT_READY (Blocked with specific reasons)
  │
  ▼ If READY_FOR_COSTING
CostingEngineDomainService (src/domain/costingEngine.ts)
  ├── 1. Load Approved CableEngineeringMapping snapshot
  ├── 2. Load Approved GovernedBomLine items for cable
  ├── 3. For each BOM item:
  │      └── Resolve Valid Price via getValidRawMaterialPrice(costingDate, uom, currency)
  ├── 4. MaterialCostCalculator (Calculate line cost & verify dimensional compatibility)
  ├── 5. Aggregate Total Material Cost
  ├── 6. Set Process Cost & Overhead to "NOT_CONFIGURED" (manufacturingCost = NULL)
  ├── 7. Persist Immutable CostingRun & CostingLine records
  └── 8. Append AuditEvent (COSTING_CALCULATED)
```

### 4.2 Material Cost Calculation Formula
For each consumed raw material:
$$\text{Total Consumption} = \text{Consumption per km} \times \frac{\text{Length in Meters}}{1000} \times \text{Quantity}$$
$$\text{Material Line Cost} = \text{Total Consumption} \times \text{Resolved Unit Price}$$
$$\text{Total Material Cost} = \sum \text{Material Line Cost}$$

### 4.3 Dimensional & Numeric Precision Standards
- **Dimensional Compatibility**:
  - `kg` consumption $\times$ `USD/kg` price $\rightarrow$ `USD`
  - `ton` price $\rightarrow$ converted using standard base 1 ton = 1000 kg if basis is `PER_TON` and UOM is `kg`
  - UOM mismatch with no conversion (e.g. `PCS` vs `kg`) $\rightarrow$ returns `COSTING_UOM_MISMATCH`
- **Numeric Precision**:
  - Raw Material Price: 4 decimal places
  - Consumption rates: 4 decimal places
  - Subtotals & Line Costs: 2 decimal places (Banker's Rounding on final output only)

---

## 5. API Design & Endpoints

| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| `POST` | `/api/costing/calculate` | Internal Costing/Finance | Executes 4-gate check and calculates material cost snapshot |
| `GET` | `/api/costing/:id` | Internal / Sales (Read) | Retrieves historical immutable costing run with full lines |
| `GET` | `/api/costing` | Internal / Sales (Read) | Lists costing runs with filters (`materialNumber`, `status`, date range) |
| `GET` | `/api/costing/readiness/:materialNumber` | Authenticated Users | Returns cable 4-gate readiness evaluation |
| `POST` | `/api/costing/:id/recalculate` | Internal Costing/Finance | Recalculates cost as a **new CostingRun** (historical snapshot unchanged) |

---

## 6. Technical Office UI Extensions

Under **Technical Office → Costing Engine**:
1. **Readiness Inspection Card**: Real-time display of the 4 gates (`Engineering`, `BOM`, `Raw Materials`, `Prices`) with pass/blocked badges.
2. **Costing Request Panel**: Input fields for Costing Date, Quantity, Length in Meters, and Currency.
3. **Calculation Action**: Triggers calculation for `READY_FOR_COSTING` cables.
4. **Material Cost Breakdown Table**: Detailed view of each material line (Consumption, Price, Price Revision, UOM, Currency, Line Cost).
5. **Cost Component Status Indicators**: Explicitly shows:
   - `Material Cost`: Calculated (e.g. `$1,140.00 USD`)
   - `Process Cost`: `NOT_CONFIGURED`
   - `Overhead`: `NOT_CONFIGURED`
   - `Scrap`: `NOT_CONFIGURED`
   - `Total Manufacturing Cost`: `INCOMPLETE` (Never displays false zeros or fake selling prices).

---

## 7. Files to Create and Modify

### Files to Create:
1. `prisma/migrations/20260820080000_increment10_costing_foundation/migration.sql`
2. `src/domain/costingEngine.ts` (Core costing domain calculation logic)
3. `src/domain/costingEngine.test.ts` (Unit tests for costing domain calculations)
4. `src/server/costingRepository.ts` (PostgreSQL repository for CostingRun and CostingLine)
5. `src/server/costingRoutes.ts` (Express API routes for `/api/costing/*`)
6. `src/components/cable-configurator/v2/components/TechnicalOfficeCostingWorkbench.tsx` (UI tab component)
7. `src/server/increment10.costing.test.ts` (Comprehensive integration & regression tests)
8. `docs/COSTING_ENGINE_ARCHITECTURE.md`
9. `docs/COSTING_ENGINE_SPECIFICATION.md`
10. `docs/COSTING_MATERIAL_COST.md`
11. `docs/COSTING_SNAPSHOT_MODEL.md`
12. `docs/COSTING_VERSIONING.md`
13. `docs/COSTING_ERROR_CODES.md`
14. `docs/COSTING_API.md`

### Files to Modify:
1. `prisma/schema.prisma` (Add `CostingRun`, `CostingLine`, `CostingRunStatus`, `CostComponentType`)
2. `server.ts` (Mount `/api/costing` router)
3. `src/server/rbac.ts` (Add `assertCanCalculateCosting`)
4. `src/components/internal/TechnicalOffice.tsx` (Add Costing tab to main navigation)
5. `package.json` (Register `src/server/increment10.costing.test.ts`)
6. `docs/COSTING_READINESS.md`, `docs/BUSINESS_RULES.md`, `docs/DATA_READINESS.md`, `docs/IMPLEMENTATION_LOG.md`

---

## 8. Test Strategy (25 Required Tests)

1. **Gate 1 Fail**: Non-ready cable (unapproved engineering) blocks costing (`COSTING_NOT_READY`).
2. **Gate 2 Fail**: Unresolved BOM conflict blocks costing (`BOM_CONFLICT_UNRESOLVED`).
3. **Gate 3 Fail**: Missing raw material master blocks costing (`RAW_MATERIAL_NOT_FOUND`).
4. **Gate 4 Fail**: Missing raw material price blocks costing (`PRICE_NOT_CONFIGURED`).
5. **Gate 4 Expired**: Expired raw material price blocks costing (`PRICE_EXPIRED`).
6. **Gate 4 Overlap**: Overlapping price records block costing (`PRICE_PERIOD_OVERLAP`).
7. **UOM Mismatch**: Incompatible BOM vs Price UOM blocks calculation (`COSTING_UOM_MISMATCH`).
8. **Currency Mismatch**: Requested currency unavailable without FX conversion blocks calculation (`CURRENCY_MISMATCH`).
9. **Valid Ready Cable**: Cable satisfying all 4 gates calculates material cost accurately.
10. **Multi-Material Calculation**: Multiple BOM lines calculate independently and sum to total material cost.
11. **Price Revision Captured**: CostingLine records exact price revision and effective dates used.
12. **Engineering Revision Captured**: CostingRun records exact engineering mapping revision used.
13. **BOM Version Captured**: CostingRun records exact BOM version used.
14. **Costing Date Captured**: CostingRun records exact costing date used.
15. **Immutability Check**: Updating a raw material price in the future does NOT change historical CostingRun snapshots.
16. **Recalculation Behavior**: Recalculating cost creates a new `CostingRun` linked as successor, preserving historical run.
17. **No Scrap Applied**: Scrap status remains `NOT_CONFIGURED`.
18. **No Process Cost Applied**: Process cost status remains `NOT_CONFIGURED`.
19. **No Overhead Applied**: Overhead status remains `NOT_CONFIGURED`.
20. **No Margin Calculated**: Commercial margins are omitted.
21. **No Selling Price Calculated**: Selling price is omitted.
22. **RBAC Protection**: Customer role blocked from calculating costs (`403 UNAUTHORIZED`).
23. **Audit Verification**: `COSTING_CALCULATED`, `COSTING_BLOCKED`, `COSTING_RECALCULATED` write immutable `AuditEvent` records.
24. **Synthetic Test Cohort**: Tests use isolated synthetic fixtures (`TEST-CABLE-001`, `TEST-RM-001`) without polluting official data.
25. **Full Regression**: All Increments 1–9 test suites pass cleanly.

---

## 9. Risk & Mitigation Analysis

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Accidental Cost Calculation for Incomplete Master Data** | Erroneous manufacturing figures | Hard 4-gate evaluation in Domain Service; throws `COSTING_NOT_READY` before entering formula calculation. |
| **Silent Price Overwrite when Master Prices Change** | Corrupted historical financial audits | `CostingRun` and `CostingLine` store frozen price snapshots, revisions, and date intervals. |
| **Conflation of Manufacturing Cost with Commercial Quotations** | Premature or unapproved pricing offers | No quotation pricing or margin calculations exist in this increment. Output is explicitly labeled `MATERIAL_COST_ONLY (INCOMPLETE)`. |

---

## 10. Stage A Stop Point

**Plan is complete and documented.** In accordance with Stage A instructions:
- **No implementation code has been written.**
- **Awaiting explicit User Approval before starting Stage B.**
