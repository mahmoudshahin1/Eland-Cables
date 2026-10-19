# ملفات فوق الحد

These three repositories are over 300 lines because the Phase 2b port copied the legacy write paths as they are (PORT-FIRST). Splitting them waits for the user's approval.

| File | Lines reported by `check-rules` | Why it is large |
|---|---|---|
| `energya-backend/src/master-data/drums/drums.repository.ts` | 310 | Drum create, update, delete, and excel preview/commit sit next to the Phase 2a reads. |
| `energya-backend/src/master-data/exports/exports.repository.ts` | 866 | One method writes every master export workbook. |
| `energya-backend/src/master-data/imports/imports.repository.ts` | 712 | Import history plus cable, BOM, drum, raw-material, scrap, price, and mapping imports. |

`energya-backend/test/master-data/phase2bRepositories.spec.ts` names each file and covers a representative path: duplicate drum code and invalid geometry, an unknown export entity and an empty segments workbook, import history, a missing scrap material number, and a scrap cable that is not in Cable Master.
