# Phase 5 — Cable Selection & Cable Configurator V2 Preservation Audit

**Project:** Energya Connect Platform  
**Module:** Phase 5 — Cable Selection & Technical Parameter Configurator V2  
**Date:** August 29, 2026  
**Status:** Preserved & Verified

---

## 1. Executive Summary & Scope

Phase 5 executes the production presentation redesign of the Cable Selection modal, Cable Catalog Search, and the Advanced Technical Parameters V2 Configurator (`CableConfiguratorV2`). 

All underlying engineering rules, the 27 cascading parameters, option resolvers, validation routines (`EXISTING_CABLE`, `CONFIGURATION_REQUIRED`, `INVALID`), Cable Master records, Technical Office queues, and inquiry workflows are 100% preserved without any functional modification.

---

## 2. Preserved Component Architecture

```
src/components/cable-configurator/
├── CableConfiguratorHub.tsx (Architecture Selector: V1 vs V2 authoritative)
└── v2/
    ├── components/
    │   ├── CableConfiguratorV2.tsx (Main V2 State Container & 7-Step Stepper)
    │   ├── CascadingParameterGridV2.tsx (27 Cascading Parameters in 7 Sections)
    │   ├── SimpleParameterGridV2.tsx (Direct grid renderer & section grouping)
    │   ├── CableResultPanelV2.tsx (Multi-State Engineering Decision Panel)
    │   ├── SendToTechnicalOfficeModalV2.tsx (TCR Submission Modal & Success State)
    │   ├── MatchingCablesGridV2.tsx (Filtered Catalog Grid)
    │   ├── CuttingLengthSectionV2.tsx (Packaging & Production Length Assignment)
    │   └── SelectionModeCardV2.tsx (Mode Selector: Customer Code vs Technical)
    ├── services/
    │   ├── parameterCascadingRulesV2.ts (Authority unlock & sanitize logic)
    │   ├── cableSelectionEngineV2.ts (Catalog query & dynamic option generator)
    │   ├── technicalValidationEngineV2.ts (IEC/BS standard validation)
    │   ├── technicalOfficeServiceV2.ts (TCR factory & state mutations)
    │   └── masterDataServiceV2.ts (Default lists & construction logic mapper)
    └── types.ts (SelectionStateV2, CableRecordV2, TechnicalValidationResultV2)

src/components/common/
├── CableSearchSelectModal.tsx (Cable Master Catalog Search & Filter Picker)
├── CableConfiguratorModal.tsx (Modal wrapper for direct cable configuration)
└── CableCrossSectionViewer.tsx / CableCrossSection2D.tsx (2D visualization)
```

---

## 3. The 27 Cascading Technical Parameters

All 27 parameters and their exact cascading dependency order (`GRID_PARAMETER_ORDER`) are strictly preserved and organized into 7 logical engineering sections:

| # | Parameter Key | Display Label | Engineering Section | Prerequisite / Unlock Condition |
|---|---|---|---|---|
| 1 | `family` | Cable Family | 1. Family & Voltage | Always unlocked |
| 2 | `voltageClass` | Voltage Level / Class | 1. Family & Voltage | `family` set |
| 3 | `voltage` | Voltage Rating / Level | 1. Family & Voltage | `voltageClass` set |
| 4 | `standard` | Standard & Specification | 1. Family & Voltage | `voltage` set |
| 5 | `conductorMaterial` | Conductor Material | 2. Conductor Details | `voltage` set |
| 6 | `conductorClass` | Construction Class | 2. Conductor Details | `conductorMaterial` set |
| 7 | `conductorShape` | Conductor Shape | 2. Conductor Details | `conductorClass` set |
| 8 | `conductorSize` | Conductor Size | 2. Conductor Details | `conductorMaterial` set |
| 9 | `cores` | No. of Cores | 3. Cores & Identification | `conductorSize` set |
| 10 | `conductorWaterTight` | Conductor Water Blocking | 2. Conductor Details | `conductorSize` set |
| 11 | `insulation` | Insulation Material | 4. Insulation System | `cores` set |
| 12 | `insulationColor` | Insulation Color | 4. Insulation System | `insulation` set |
| 13 | `outerSemiConductor` | Outer Semi-Conductor | 4. Insulation System | `insulation` set |
| 14 | `screenType` | Screen Type | 5. Screening & Armouring | `insulation` set |
| 15 | `screenCSA` | Screen Cross-Section (CSA) | 5. Screening & Armouring | `screenType` is set and != 'No Screen' / 'None' |
| 16 | `screenWaterTight` | Screen Water Tightness | 5. Screening & Armouring | `screenType` is set and != 'No Screen' / 'None' |
| 17 | `bedding` | Inner Sheath / Bedding | 5. Screening & Armouring | `insulation` AND `screenType` set |
| 18 | `armour` | Armour Layer | 5. Screening & Armouring | `bedding` OR `screenType` set |
| 19 | `armourWaterTight` | Armour Water Tightness | 5. Screening & Armouring | `armour` is set and != 'No Armour' / 'None' |
| 20 | `sheathing` | Outer Sheath (Jacket) | 6. Sheathing & Outer Layers | `insulation` set |
| 21 | `sheathingColor` | Outer Sheath Color | 6. Sheathing & Outer Layers | `sheathing` set |
| 22 | `waterTight` | Water Tight / Water Blocking | 6. Sheathing & Outer Layers | `sheathing` set |
| 23 | `termiteProtection` | Termite / Rodent Protection | 6. Sheathing & Outer Layers | `sheathing` set |
| 24 | `cprClass` | CPR Euroclass | 7. Standards & Special Properties | `sheathing` set |
| 25 | `specialArea` | Special Installation Area | 7. Standards & Special Properties | `sheathing` set |
| 26 | `specialAdditives` | Special Engineering Req. | 7. Standards & Special Properties | `sheathing` set |
| 27 | `customerIdentification`| Customer Identification | 7. Standards & Special Properties | `sheathing` set |

---

## 4. Engineering Decision States & Result Panel

The validation engine resolves selections into 3 primary engineering states plus compatibility notice:

1. **State 1: Existing Approved Cable Found (`EXISTING_APPROVED` / `EXISTING_CABLE`)**
   - **Visual Tone:** Emerald (`statusToTone('APPROVED')`).
   - **Data Rendered:** Material Number, Item Code, Outer Diameter (Ø mm), Approx. Weight (kg/km), Approved Specification, Customer Code, Standard, Conductor specs, Construction Logic.
   - **Primary Action:** "Select this cable" (when invoked from Inquiry line) or "Continue to Cutting Length" (standalone configurator).

2. **State 2: Valid Technical Design — New Master Required (`VALID_NEW_CABLE`)**
   - **Visual Tone:** Energya Blue / Indigo (`statusToTone('SUBMITTED')`).
   - **Data Rendered:** Construction Logic badge, Estimated Ø mm, Estimated kg/km, Formatted monospace description string, layer summary tags (Family & Voltage, Conductor, Screen & Armour, Sheathing & CPR).
   - **Primary Action:** "Send to Technical Office" (opens `SendToTechnicalOfficeModalV2`) and "Modify Configuration".

3. **State 3: Invalid Technical Configuration (`INVALID_CONFIGURATION` / `INVALID`)**
   - **Visual Tone:** Restrained Vermilion / Rose (`statusToTone('REJECTED')`).
   - **Data Rendered:** List of specific standard and electrical violations with parameter badges and conflicting field explanations.
   - **Primary Action:** "Correct Configuration".

4. **Compatibility Configuration Required (`CONFIGURATION_REQUIRED`)**
   - **Visual Tone:** Amber warning callout when unconfigured technical relationships occur.

---

## 5. Technical Office Request Modal & Success Lifecycle

- **Modal Input:** Requester Name, Requester Email, Client / Company Name, Project & Engineering Notes.
- **Header Info:** Read-only summary of configured construction, estimated outer diameter (Ø mm), and weight (kg/km).
- **Persistence:** Submits `TechnicalCableRequest` to `/api/technical-office/requests`.
- **Success State Confirmation:**
  - Displays unique **Technical Request Number** (`TCR-YYYYMMDD-XXXX`).
  - Displays **Temporary Technical ID** (`TID-XXXX`).
  - Displays current queue status (`SUBMITTED`).
  - Displays full configured technical description.

---

## 6. Functional Preservation Checklist

- [x] All 27 parameters strictly preserved in exact dependency order.
- [x] `isParameterUnlocked()` gating and `sanitizeSelectionsAfterChange()` downstream clearing preserved.
- [x] TriState parameters (`conductorWaterTight`, `screenWaterTight`, `armourWaterTight`) render dedicated Yes/No controls.
- [x] Multi-core color selectors (Core 1..N) preserved when `coresCount > 1`.
- [x] Server-side authority endpoint (`POST /api/cables/evaluate`) integrated with 250ms debounce.
- [x] Single global brand logo (no duplicate logo rendered in modal headers or configurator).
- [x] Design system primitives (`@/components/ui`) and industrial iconography utilized throughout.
- [x] Full TypeScript safety with 0 errors (`npx tsc --noEmit`).
- [x] All 547 existing tests passing without regression (`npm test`).
