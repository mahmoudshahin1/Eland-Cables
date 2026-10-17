---
name: port-module
description: Port exactly one legacy Express module to NestJS with identical behaviour (routes, guards, DTOs, service, repository, domain copy). Use after a phase plan is approved and the user asks to implement a module.
---

# Port one module

Scope: one module from the approved plan. If the change touches another module, stop and ask.

1. Re-read the legacy router handlers for the module (file:line from the plan).
2. Copy pure logic to `energya-backend/src/shared/domain/` byte-identical except import lines; register it in `scripts/parity/verify-domain-sync.mjs` and `MIGRATION_STATUS.md` §3.
3. Create under `energya-backend/src/<area>/<module>/`:
   - `dto/*.ts` with class-validator for every body/query/param (no `any`)
   - `<module>.repository.ts` (Prisma only, same `orderBy`, Decimal -> number)
   - `<module>.service.ts` (logic, same error codes/messages as legacy)
   - `<module>.controller.ts` (single legacy path prefix, same guard + permission helper, same status codes)
   - `<module>.module.ts`, registered in the parent module
4. Respect size limits (controller 200, service/repo 300, DTO 200, module 60, function 50).
5. Add the exact routes (method + path) to the Nest list in `vite.config.ts` only after G1 passes.
6. Run `npm run build` and `npm run lint` in `energya-backend`; paste output.
7. Hand over to `port-tests` and `parity-run`. Do not mark gates.
