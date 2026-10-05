# ELAND Costing Golden Regression

> **Status: WORKBOOK AVAILABLE** — regression reference only; not imported as master data.

## Purpose

Cell-level regression tests against `ELAND Cost Sheet Required.xlsx` to verify costing engine outputs match company methodology.

## Workbook location

| Path | Purpose |
|---|---|
| `data/regression/ELAND Cost Sheet Required.xlsx` | Governed regression artifact (copied 2026-08-22 from Desktop) |
| `data/source/ELAND Cost Sheet Required.xlsx` | Convenience copy alongside other source files |

**Do not import this workbook into master data tables.**

## Workbook structure (inspected 2026-08-22)

| Sheet | Rows | Contents |
|---|---:|---|
| Summary | 23 | Aggregate totals (material, ex-work, shipping, DAP) |
| Materials List | 39 | Cross-cable material roll-up |
| 1–4 | 27 / 35 / 37 / 37 | Per-cable costing worksheets |

## Known workbook aggregates (SOURCE DATA)

| Metric | Workbook value | Test status |
|---|---:|---|
| Material total EUR | 181,194.03 | ⏳ Pending automated test |
| Ex-work total EUR | 192,759.61 | ⏳ Pending automated test |
| Shipping total EUR | 3,603.09 | ⏳ Pending automated test |
| DAP grand total EUR | 196,362.70 | ⏳ Pending automated test |

## Prerequisites before golden tests pass

1. Raw material prices approved (Gate 4)
2. Engineering mappings approved for cables 1–4 (Gate 1)
3. BOM conflicts resolved (Gate 2)
4. Published costing configuration version (Gate 5, when enforced)

## Do not fabricate

Per project mandate: **no test numbers invented**. Assertions must read from the workbook at test time.

## Planned test structure (Phase P)

```
describe('ELAND golden regression', () => {
  // Cable 1-4 material lines
  // Scrap-adjusted consumption
  // Ex-work uplift (configurable EX_WORK_RATE)
  // DAP shipping (Phase G)
});
```

## Related documents

- [`ELAND_COSTING_RULES.md`](./ELAND_COSTING_RULES.md)
- [`ELAND_COSTING_RECONCILIATION.md`](./ELAND_COSTING_RECONCILIATION.md)
- [`INCREMENT_13_COSTING_RULE_DISCOVERY.md`](./INCREMENT_13_COSTING_RULE_DISCOVERY.md)
- [`MASTER_DATA_IMPORT_LOG.md`](./MASTER_DATA_IMPORT_LOG.md)
