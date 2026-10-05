# DRUM SELECTION DESIGN PROPOSAL (presentation-only)

> **Drum calculation logic (cutting schedule math, fill %, container optimization, EWD governance boundary) MUST be preserved.** Visual redesign only.

## 1. Current journey + fields (verified)

Two parallel identity systems (both preserved):
- **Prototype reel types** — `DrumDetailsModal` (`Wood Reel 220`, `Steel Drum 240`, … + tare weights).
- **Governed EWD Drum Master** — `Drum List.xlsx` → `DrumMasterRecord` / `DrumMasterSelect`. **Automatic EWD selection is intentionally `CONFIGURATION_REQUIRED`** (capacity UOM / winding rule not in source). Do not "fix" — it is a governance boundary.

### Components
`DrumOptimizer` (customer page "Multi-Drum Size & Cutting Length Schedule Engine"), `ContainerAndDrumOptimizerModal`, `DrumDetailsModal`, `DrumMasterReferencePanel`, `DrumMasterSelect`, `DrumCuttingScheduleTable`, `WoodenDrumIcon`.

### Fields (preserve — see `CONTENT_PRESERVATION_INVENTORY.md §G`)
- Optimizer inputs: **Cable Weight/m** (kg/m), **Total Order Tolerance** (%).
- Schedule row: **Drum Code** (`DrumMasterSelect`), **No. of Drums** (min 1), **Cutting Length / Drum** (m), **Drum Tolerance** (0–20 %) + **Cable Tolerance** (0–20 %) above table.
- Computed columns: **Fill %**, **Nominal Line (m)** (+min/max range), **Total Line Wt (kg)**.
- Drum master fields: Drum Code, Description, Flange, Barrel, Inner/Outer Width, Capacity.
- Summary cards: Nominal Cable Length, Total Drum Packages, Total Gross Weight, Total Packaging Volume, Drum packaging cost (`NOT_CONFIGURED`), Total Order Tolerance.
- Container recommendation: 20ft Dry (22.0 MT / 28 m³), 40HC (26.5 MT / 58 m³).

### Calculation (preserve exactly)
`inquiryDrumSchedule.ts` (nominal = drums × cutting; ±drum tolerance; weight = cutting/1000 × kg/km; fill % = weight/capacity), `drumMasterService.ts`, `drumPlanService.suggestDrumPlan` / `validateCuttingLength`, container counts `ceil(max(weight/limit, volume/limit))`. **Known inconsistencies noted in the audit (Optimizer uses kg/m + length-based fill vs weight-based elsewhere) are documented, NOT changed.**

### Cutting-schedule table columns (preserve)
`#`, Drum Type/Code, No. of Drums, Cutting Length / Drum, Drum Tolerance*, Fill %, Nominal Line (m), Total Line Wt (kg), Actions. Above: Cable Tolerance* + order length range.

## 2. Visual redesign (presentation only)

### Standalone Drum Optimizer page
- **Header:** `ui/PageHeader` (title + subtitle) + preset buttons (33kV Substation 17,000m / Export Container Reels 12,300m) as secondary `ui/Button`s + "Proceed to Price Estimation" primary.
- **Inputs card:** Cable Weight/m + Total Order Tolerance in a compact `ui/Card`.
- **Schedule table:** `ui/Table` with `DrumMasterSelect` in the Drum Code cell (showing parameter grid on select), numeric `ui/Input`s, computed cells right-aligned with unit suffixes; "Add Drum Line" tertiary button; row delete icon (disabled when last row).
- **Fill % indicator:** small horizontal bar + "{n}% vs capacity" (visual only over existing number).
- **Summary strip:** stat cards (`DashboardStatCard` style) for the 6 summary metrics; packaging cost shows honest `NOT_CONFIGURED` badge.
- **Container recommendation:** two `ui/Card`s (20ft / 40HC) with payload/volume + required-containers + utilization bar. `container` icon.

### Cutting schedule inside inquiry (`DrumCuttingScheduleTable`)
- Same table styling reused; Cable Tolerance* / Drum Tolerance* as required `ui/Field`s; footer helper text kept verbatim; order-length-range chip.

### Modals
- `DrumDetailsModal` (per-line multi-drum schedule) and `ContainerAndDrumOptimizerModal` as wide `ui/Modal`s: overview metrics as stat grid, editable drum rows in `ui/Table`, EWD reference link panel (`DrumMasterReferencePanel`) as a side column, honest "EWD auto-selection unavailable — CONFIGURATION_REQUIRED" `warning` callout. Actions (Generate Equal Drums, Fill Remaining, Add Drum Row, Save) as `ui/Button`s.

### Drum master reference
- `DrumMasterReferencePanel` table (Drum Code, Description, Flange, Barrel, Inner, Outer, Capacity*) as a scrollable `ui/Table` with search; "Link row" / "Clear EWD link" actions preserved.

### Iconography
`drum` (`WoodenDrumIcon`), `cutting` (`Scissors`), `container` (`Container`), `gauge` for fill.

## 3. Responsive
Header `flex-col md:flex-row`; summary `grid-cols-2 sm:grid-cols-3`; schedule table `overflow-x-auto`; container cards `grid-cols-1 md:grid-cols-2`; modals `max-h-[92vh]` internal scroll. No fields hidden on mobile.
