# CABLE SELECTION DESIGN PROPOSAL (presentation-only)

> **Technical Parameters V2 engineering logic, parameter dependencies, validation, existing/new-cable determination, and the Technical Office workflow MUST be preserved.** This is a visual redesign only.

## 1. Current journey + dependencies (verified)

`CableConfiguratorHub` toggles V1 (`SmartConfigurator`) and V2 (`CableConfiguratorV2`, "Cable Technical Parameter / Cascading Selection"). V2 is authoritative.

### 1.1 The 27 cascading parameters
Family → Voltage Class → Voltage → Standard → Conductor Material → Construction Class → Conductor Shape → Conductor Size → Cores → Conductor Water Blocking → Insulation → Insulation Color → Outer Semi-Conductor → Screen Type → Screen CSA → Screen Water Tightness → Bedding → Armour → Armour Water Tightness → Sheathing → Sheath Color → Water Tight → Termite Protection → CPR Euroclass → Special Area → Special Additives → Customer Identification (+ Customer Spec Code, per-core Core Colors). Full keys/labels/options in `CONTENT_PRESERVATION_INVENTORY.md §E`.

### 1.2 Dependency engine (MUST preserve)
- **Unlock chain** (`isParameterUnlocked`): each field enabled only after its upstream prerequisites are set (e.g. `screenCSA` needs a real screen; `bedding` needs insulation + screenType; `armour` needs bedding OR screenType).
- **Downstream sanitize** (`sanitizeSelectionsAfterChange`): clears now-invalid downstream values on any change.
- **Option filtering** (`resolveParameterOptionsV2` + `mergeWithCatalog`): family/voltage/potential-driven option sets intersected with the filtered master catalog.
- **Side effects** (`handleUpdateParam`): family→subtype; cores→coresCount + default core colors; voltage→auto class + semi/screen adjustments.
- **Validation** (`validateCableConfigurationV2`): IEC/BS rules (HV insulation, screen required, single-core SWA, Class-1 size, CPR, core colors, standard-vs-voltage…).
- **Determination** (`evaluateCableAuthority` via `POST /api/cables/evaluate`): → `EXISTING_APPROVED` (master match), `VALID_NEW_CABLE`, `INVALID_CONFIGURATION`, `CONFIGURATION_REQUIRED`.
- **Stepper:** Family & Voltage → Conductor → Cores & Colors → Insulation → Screen & Armour → Sheathing → Validation Result.

## 2. Visual redesign (presentation only)

### Layout
- Two-column: **left** parameter grid (`ui/Card`, grouped by stepper section) + **right** sticky result panel. Progress **stepper** across the top (`ui/Tabs`-style, `overflow-x-auto min-w-[640px]`), current step highlighted navy, completed = check, locked = muted.
- Header chip: "{N} Parameters Active" + filtered catalog count.

### Parameter grid
- Each parameter = `ui/Field` with a `ui/Select` (or Yes/No switch for water-tight params). **Locked state** = disabled control + small lock icon + hint "Set {upstream} first" — driven by `isParameterUnlocked` (no logic change; only styling the disabled state).
- Section grouping matches stepper (Family & Voltage / Conductor / Cores & Colors / Insulation / Screen & Armour / Sheathing).
- Per-core **Core Colors** as a compact grid (Core 1…N) when cores > 1.
- Material/layer icons from the registry (`conductor`, `insulation`, `screen`, `armour`, `sheath`, `bedding`, `voltage`, `cores`, `fireClass`, `waterBlocking`, `termiteProtection`).

### Result panel — three states (exact fields preserved)
- **State 1 — Existing Approved** (`success`/emerald `StatusBadge` "Existing Approved Cable Found"): Material Number, Item Code, Outer Diameter (Ø mm), Approx. Weight (kg/km), Approved Master Technical Specification, Customer Code, Standard, Conductor, construction Logic. Actions: **Select this cable** (inquiry path) / **Continue to Cutting Length** (standalone).
- **State 2 — Valid New Cable** (`info`/blue "New Master Required"): construction-logic badge, Estimated Ø + ~kg/km, `summaryDescription` mono block, pills (Family & Voltage / Conductor / Screen & Armour / Sheathing & CPR). Actions: **Modify Configuration** / **Send to Technical Office** (`SendToTechnicalOfficeModalV2`).
- **State 3 — Invalid** (`error`/rose "Invalid Technical Configuration"): "Electrical & Standard Violations (N)" list with Parameter/conflict/message. Action: **Correct Configuration**.
- **Configuration required:** honest "Compatibility configuration required" callout.

### Cutting length section
- Shown only when a master match exists — `ui/Card` "Cutting Length & Production Drum Assignment": cutting length, drum type, tolerance, special requirements, **Add to Request**.

### Advanced Cable Parameters view
- Same engine; presents the full 27-parameter grid with all groups expanded and the live active-count/catalog chip. Purely a denser presentation of the same fields.

## 3. Technical Office (presentation only)
- `ui/Tabs` for the 7 queues (Engineering Mapping, BOM Governance, TCR Queue, Cable Master Catalog, Excel Pre-Import Method B, Master Parameters, Raw Materials Reference).
- Each queue: filter toolbar + `ui/Table` list + right `ui/Drawer` detail. Governance actions as `ui/Button`s; states as `StatusBadge`. Mapping edit + BOM decision form via `ui/Form`. **All workflows, bulk actions, and the 44-column Method-B template preserved.**

## 4. Responsive
Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; core colors `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`; result panel stacks below grid on mobile; stepper scrolls horizontally; TO tables `overflow-x-auto`.
