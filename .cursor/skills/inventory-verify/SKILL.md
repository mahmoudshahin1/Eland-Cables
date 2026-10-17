---
name: inventory-verify
description: Verify the legacy endpoint inventory against the routes actually mounted by server.ts and the router files, and regenerate ENDPOINT_INVENTORY.md. Use before sizing a phase or when endpoint counts look wrong.
---

# Inventory verify

1. Mounts: `git show origin/main:server.ts | rg "app\.(use|get|post|put|patch|delete)\('/api"`. Use `origin/main`, not the working tree, so local edits cannot inflate the table.
2. For each `app.use(prefix, routerVar)`, list only routes of that exact router variable: `rg "^<routerVar>\.(get|post|put|patch|delete)\(" <file>`. Several routers can live in one file (e.g. `platformDbRouter` and `masterDataRouter` in `masterDataRoutes.ts`).
3. Regenerate: `node scripts/inventory/generateInventory.mjs` (it must parse by router variable).
4. Diff the new table against the old one: list removed (fake) and added rows.
5. Cross-check the Nest side: `rg "@(Controller|Get|Post|Put|Patch|Delete)\(" energya-backend/src` and flag any Nest route absent from legacy.
6. Output: totals per phase, list of fake rows, list of Nest-only routes. Update `MIGRATION_STATUS.md` totals only with these numbers.
