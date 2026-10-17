---
name: port-tests
description: Port legacy vitest tests for one module to energya-backend 1:1 with the same names and a verified old->new mapping table. Use when porting or auditing migrated tests.
---

# Port tests 1:1

1. Find legacy tests: `rg -l "<module keywords>" src --glob "*.test.ts"`. Count `it(`/`test(` per file.
2. For each file create the Nest counterpart:
   - pure domain tests -> `energya-backend/test/<area>/<name>.spec.ts`
   - HTTP/DB tests -> `energya-backend/test/<area>/<name>.e2e-spec.ts` using `AppModule` + supertest
3. Keep test names identical. Same inputs, same expected values. Only adapt imports and HTTP plumbing.
4. Tests that belong to a later phase: `it.todo('<same name>')` + entry in `MIGRATION_STATUS.md` §4 with target phase and reason.
5. Forbidden: conditional early returns, swallowed errors, weakened assertions, `.skip` without a logged reason.
6. Run `npm test` and `npm run test:e2e`. Build the mapping table from the real output:

| Legacy file | Legacy count | Nest file | Passed | Todo | Reason |
|---|---|---|---|---|---|

7. Paste verbatim output. Counts in docs must equal the output.
