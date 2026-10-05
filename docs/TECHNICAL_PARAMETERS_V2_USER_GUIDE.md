# Technical Parameters V2 — User Guide

Short walkthrough for **Sales**, **Costing**, and **Technical Office** users configuring cable construction in Energya Connect.

> This guide reflects the current UI in `CableConfiguratorV2`. It does not cover BOM or costing steps.

---

## Open the configurator

1. Sign in to Energya Connect.
2. Navigate to the **Cable Parameters** / configurator area (via customer portal or inquiry line cable picker, depending on your screen).
3. At the top, confirm **Technical Parameters V2** is selected (not "Cable Parameters V1").
4. The banner reads **Technical Parameters V2 — True Engineering Configuration Engine**.

---

## Configure construction (top to bottom)

Work through the numbered fields in **Select Cable Construction Parameters**. Grayed-out fields unlock after you complete the row above them.

### Quick path for underground MV power cable

| Step | Field | Typical choice |
|------|--------|----------------|
| 1 | Cable Family | `UGC` |
| 2 | Family Sub-Type | `MV` (auto-suggested) |
| 3 | Voltage Level / Class | `MV` |
| 4 | Voltage Rating | e.g. `6/10 kV` |
| 5 | Um | e.g. `12 kV` |
| 6 | Standard | e.g. `IEC 60502-2 (6 kV to 30 kV)` |
| 7–11 | Conductor | `CU`, class/shape as required, size e.g. `120`, cores e.g. `1 Core` |
| 14+ | Insulation | `XLPE` |
| 18–22 | Screen | Type, material, CSA (MV usually requires a screen) |
| 23–27 | Armour | `No Armour` or `AWA` / `SWA` as specified |
| 28–29 | Sheath | e.g. `MDPE`, color `Black` |
| Rest | Special reqs, CPR, core colors | As customer specification |

**Tip:** When you change **Voltage Rating**, the system auto-adjusts semi-conductor and screen defaults for LV vs MV vs HV.

---

## Find a cable in the catalog

1. After parameters are set, click **Find matching cables** (green button, bottom right of the parameter panel).
2. The page scrolls to **Approved Cable Catalog Matches**.
3. Use the search box to filter by material number, item code, or description.
4. Click **Add Cable** on the correct row.

**If you see multiple rows:** the catalog contains more than one master record matching the primary construction fields. Pick the row whose **Material Number** and **Technical Description** match the customer spec.

**If you see zero rows:** read the result panel below the grid (see next section).

---

## Understand the result

After **Find matching cables**, one of these applies:

### Green — Existing approved cable

- **State 1: Verified Master Match**
- Shows **Material Number**, **Item Code**, diameter, weight, full description.
- Click **Continue to Cutting Length** (standalone configurator) or **Select this cable** (when opened from inquiry/quotation).

### Blue — Valid design, no master record

- **State 2: Valid Technical Design — New Master Required**
- Engineering checks passed, but no matching Cable Master exists.
- Click **Send to Technical Office** → fill requester details → submit.
- **No material number is created** in this step. Technical Office must approve and implement master data.

### Red — Invalid configuration

- **State 3: Conflict Detected**
- Fix the listed parameter conflicts, then click **Correct Configuration** or adjust fields above.

### Amber — Configuration required

- Compatibility rules are missing in master data (admin/TO must configure **Parameter Compatibility**).
- Quotation cannot proceed until rules exist. Contact Technical Office / platform admin.

The progress stepper at the top (Customer → Family & Voltage → … → Validation Result) turns green, blue, or red to match this outcome.

---

## Cutting length (standalone flow)

After **Add Cable**:

1. Scroll to **Cutting Length & Production Drum Assignment**.
2. Enter length (metres), drum type, tolerance.
3. **Add to Request** stores the line locally for the ERP request flow.

Parameter fields **Cutting Length**, **Cutting Length Tolerance**, and **Packaging Drum Type** in the main grid are the same commercial values used on inquiries when embedded.

---

## Technical Office users

### Review submitted configurations

1. Open **Technical Office** hub.
2. Use **TCR Queue** / request list for submissions from **Send to Technical Office**.
3. Requests include the full `selections` payload and generated engineering description.

### Maintain parameter lists (prototype)

1. Open **Technical Office → Master Params** (`TechnicalOfficeMasterParams`).
2. Add custom options per category (standards, sizes, screen types, etc.).
3. **Note:** Custom options are saved locally today; the V2 configurator grid still uses built-in default lists until wired to this store.

### Engineering mapping (authoritative)

Cable existence for quotations uses **PostgreSQL Cable Master** plus **APPROVED engineering mappings**. Mapping work is done in Technical Office governance queues (mapping / approval), not in the configurator itself.

---

## Sales / inquiry integration

When the configurator opens from an **inquiry or quotation line**:

1. Configure parameters as above.
2. **Find matching cables** → **Add Cable** or use **Select this cable** on an exact match.
3. The line receives the resolved **material number** via the parent callback — the system runs `POST /api/cables/evaluate` in the background.
4. If the outcome is **Technical Office required**, follow your inquiry workflow to attach or await TCR resolution before costing.

See `docs/INQUIRY_LINE_CABLE_AUTHORITY.md` for governed line states.

---

## Reset

- **Reset Technical Parameters V2** (rotate icon, top banner): clears mode and all selections.
- Changing any parameter after a search clears previous **Find matching cables** results — run search again.

---

## V1 vs V2 — which should I use?

| Use V2 when… | Use V1 when… |
|--------------|--------------|
| You need engineering validation + PostgreSQL cable authority | You need catalog-narrowed dropdowns (each choice limited to what exists in catalog) |
| You may send **Technical Office requests** for new designs | You are on legacy screens still tied to V1 only |
| Inquiry/quotation increment 11+ cable authority applies | — |

Default in the hub is **V2**.

---

## Need help?

- Selection logic detail: `docs/TECHNICAL_PARAMETERS_V2_SELECTION_LOGIC.md`
- Cable Master rules: `docs/CABLE_MASTER_AUTHORITY.md`
- Error codes / blocked states: `docs/COSTING_ERROR_CODES.md` (for downstream costing gates)
