# Source workbooks

**Official ENERGYA extracts** (do not modify):

| File | Contents | Import type |
|---|---|---|
| `Raw Material List.xlsx` | 74 raw materials; Price blank | `RAW_MATERIAL` |
| `Energya Cable Master Data.xlsx` | Cable List (432) + Cable Materials BOM (4986) | `CABLE` + `BOM` |
| `Drum List.xlsx` | 103 drums (`EWD*` codes) | `DRUM` |

**Additional reference files** (not Import Center master types):

| File | Contents |
|---|---|
| `Cables Parameters_1.xlsx` | 24 cables with engineering attributes (Family, Voltage, Conductor, etc.) |
| `Description Schema.xlsx` | Cable description generation rules (reference doc) |
| `ELAND Cost Sheet Required.xlsx` | Regression copy; canonical path `data/regression/` |

See `docs/CABLE_MASTER_DATA_ONBOARDING.md` and `docs/MASTER_DATA_IMPORT_LOG.md`.

## Import commands

```bash
npx tsx scripts/importAllMasters.ts      # RM + Cable + BOM + Drum
npx tsx scripts/importOfficialMasters.ts # RM + Cable + BOM only
npx tsx scripts/inspectSourceMasters.ts  # Sheet/row inspection
```
