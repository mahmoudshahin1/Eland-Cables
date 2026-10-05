# Engineering Mapping Excel Template & Pipeline (Increment 7)

## Excel Template Structure

Export URL: `GET /api/master/engineering-mappings-export`

The exported workbook contains the controlled sheet `Engineering Mapping` with the following columns:

| Column Header | Required / Type | Controlled Parameter Master | Notes |
|---|---|---|---|
| **Material Number** | Required (String) | `CableMaster.materialNumber` | Natural key. Cannot be changed. |
| **Cable Description** | Read-only Informational | N/A | Source description from extract. |
| **Cable Family** | Controlled Parameter | `CableParameter` (kind: `FAMILY`) | e.g. `LV`, `MV`, `HV` |
| **Voltage** | Controlled Parameter | `CableParameter` (kind: `VOLTAGE`) | e.g. `600/1000V`, `12/20kV` |
| **Conductor Material** | Controlled Parameter | `CableParameter` (kind: `CONDUCTOR`) | e.g. `Copper`, `Aluminum`, `CU`, `AL` |
| **Conductor Size** | Numeric mm² | `CableMaster.conductorSize` | e.g. `16`, `25`, `50`, `95` |
| **Number of Cores** | Numeric Count / Code | `CableMaster.cores` | e.g. `1`, `3`, `4`, `1C`, `3C`, `4C` |
| **Insulation** | Controlled Parameter | `CableParameter` (kind: `INSULATION`) | e.g. `XLPE`, `PVC`, `EPR` |
| **Screen** | Controlled Parameter | `CableParameter` (kind: `SCREEN`) | e.g. `NONE`, `CTS`, `CWS`, `LEAD` |
| **Armour** | Controlled Parameter | `CableParameter` (kind: `ARMOUR`) | e.g. `NONE`, `SWA`, `STA`, `AWA` |
| **Sheath** | Controlled Parameter | `CableParameter` (kind: `SHEATH`) | e.g. `PVC`, `LSHF`, `MDPE`, `PE` |
| **Sheath Colour** | Controlled Parameter | `CableParameter` (kind: `CORE_COLOUR`) | e.g. `BLK`, `RED`, `BLU` |
| **Core Colour** | Controlled Parameter | `CableParameter` (kind: `CORE_COLOUR`) | e.g. `BLK`, `RED`, `BLU` |
| **Standard** | Controlled Parameter | `CableParameter` (kind: `STANDARD`) | e.g. `IEC 60502-1`, `IEC 60502-2` |
| **Special Additives** | Optional String | `CableMaster.specialAdditives` | Optional additive notes |
| **Comment** | Optional String | `CableEngineeringMapping.comments` | Reviewer / change justification note |

---

## Import Pipeline & Governance Rules

1. **Upload & Parse**: `POST /api/master/engineering-mappings/import/preview`
   - Validates file structure and columns.
   - Previews valid rows, errors, duplicates, and unknown material numbers without persisting.
2. **Strict Error Blocking**: If even a single row has an error (unknown material, duplicate row, invalid parameter, or incompatible Family/Voltage combination), the import cannot be committed.
3. **Draft Target**: Committing the import (`POST /api/master/engineering-mappings/import/commit`) creates or updates mappings in **DRAFT** status.
4. **Source Protection**: The import **never** overwrites `CableMaster` source extract values (`diameter`, `weight`, `description`, `customerCode`, `itemCode`).
