# Master data key analysis (Increment 5)

Do not enforce a business key that the official extract disproves.

| Candidate key | Business meaning | Current uniqueness (432 Cable List / BOM) | Recommended constraint | Reason |
|---|---|---|---|---|
| Material Number | ENERGYA cable material number | Unique (432/432) | Keep UNIQUE | Supported by source |
| Item Code | ERP item | Not unique (264 distinct) | No global unique | Source disproves |
| Customer / Specification Code | Spec code (e.g. N2XH) | Not unique (7 distinct) | No global unique; not Cable Family | Source disproves; family mapping is BDR |
| Customer Code + Item Code | Possible commercial pair | Not documented as a key | Do not enforce | Would invent a key |
| Customer Code + Specification Code | Same column in this extract | N/A | None | One column, not two |
| Cable + RM + BOM version | Current BOM grain | Enforced; conflicts skipped not versioned | Keep until 81 groups classified | Cable+RM alone disproved |

`GET /api/master/keys` returns this analysis plus live uniqueness counts.
