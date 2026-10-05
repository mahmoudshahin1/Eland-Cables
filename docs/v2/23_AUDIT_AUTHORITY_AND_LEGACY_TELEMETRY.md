# 23 — Audit Authority & Legacy Telemetry (Task 04B-4)

**Date:** 2026-09-04  
**Status:** **AUDIT AUTHORITY ACCEPTED** — `AuditEvent` = `AUTHORITATIVE_SERVER_AUDIT`  
**Frozen 04A:** `57caf852067fea4b29efdfd4d73733499a0ba4f0`  
**Frozen 04B-1:** `fb03a3c8ccc2d339f021aac1950ec06959305d2e`  
**Frozen 04B-2:** `611c083754a616d4991f86dd27036583ae129e43`  
**Frozen 04B-3:** `34b76450f2e8ab325ef73ffde6d18271bbb92ff2`  
**Machine-readable:** `src/platform/masterDataSoT.ts` (`AuditEvent` row + matrix)  
**Related:** [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) · [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)

---

## 1. Objective

Establish **server `AuditEvent` as the authoritative audit source** for platform immutable event history. Classify `energya_platform_audit_v1` / `appendAudit` as **LEGACY_TELEMETRY** — retained, not deleted, no mass LS→PG migration.

**Scope boundary:** Audit authority only. **Does not** promote `AuditEvent` to `POSTGRESQL_SOT` master data. **Does not** start Cable/BOM/Drum/params cutovers (04B-5+).

---

## 2. Discovery summary (code-proven)

| Path | Authority |
|------|-----------|
| `appendServerAudit` / `prisma.auditEvent.create` | **AUTHORITATIVE_SERVER_AUDIT** |
| `GET /api/v2/audit/events` | PostgreSQL `listServerAuditEvents` + RBAC |
| `GET /api/admin/costing/audit` | PostgreSQL costing audit filter |
| `GET /api/admin/customers/:id/audit` | PostgreSQL customer-scoped audit |
| Identity / commercial / MD / governance repos | Dual-write: server audit + legacy telemetry |
| `energya_platform_audit_v1` / `appendAudit` | **LEGACY_TELEMETRY** (non-authoritative) |
| `listAudit` (client) | Legacy telemetry read — not admin history |

**No PUT/PATCH/DELETE** admin API for `AuditEvent` (verified `increment12b1.hardening.test.ts`).

---

## 3. Prisma `AuditEvent` model (unchanged)

| Field | Type | Role |
|-------|------|------|
| `id` | `String @id` | Immutable event id |
| `at` | `DateTime` | Event timestamp |
| `actorId` / `actorName` | `String?` | Who |
| `entity` / `entityId` | `String` | What |
| `action` | `String` | Action code |
| `oldValue` / `newValue` | `Json?` | Change payload |
| `message` | `String?` | Human summary |

Indexes: `[entity, at]`, `[actorId, at]`. No schema redesign in 04B-4.

---

## 4. Authority semantics (Gate A)

| Metric | Value |
|--------|-------|
| Registry status | `POSTGRESQL_PRIMARY` (honest — not master-data SoT) |
| `auditAuthority` | `AUTHORITATIVE_SERVER_AUDIT` |
| `cutoverPhase` | `AUTHORITATIVE_SERVER_AUDIT` |
| `postgresSoT` | `false` (explicit — not falsely claimed) |
| LS key class | `LEGACY_TELEMETRY` |
| `AUDIT_LOCAL_IS_AUTHORITATIVE` | `false` |

---

## 5. Gates A–J summary

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | PASS | `AuditEvent` table populated from server mutations |
| **B READ** | PASS | Admin/V2 read from PG APIs; `preferPostgresAudit` empty-PG wins |
| **C WRITE** | PASS | Server mutations call `appendServerAudit` / `prisma.auditEvent.create` |
| **D V1/V2** | PASS | V1 costing/customer admin + V2 `/api/v2/audit/events` share PG |
| **E LS** | PASS | `energya_platform_audit_v1` = `LEGACY_TELEMETRY`; retained |
| **F STALE** | PASS | Tests: PG audit beats LS telemetry; empty PG beats LS |
| **G FAILURE** | PASS | PG fail → `LEGACY_TELEMETRY_FALLBACK`, `authoritative: false` |
| **H SECURITY** | PASS | JWT + RBAC (`ADMIN/SECURITY/VIEW`, costing audit permissions) |
| **I AUDIT** | PASS | Authoritative writes produce server `AuditEvent` |
| **J REGRESSION** | PASS | `auditAuthority.test.ts` + full suite / tsc / prisma validate / build |

---

## 6. Gate B — READ authority

- `GET /api/v2/audit/events` — platform admin audit (V2 SECURITY module).
- Domain APIs: costing `/api/admin/costing/audit`, customer `/api/admin/customers/:id/audit`.
- `preferPostgresAudit`: successful PG response wins **including empty arrays** — stale LS telemetry is ignored.
- PG unavailable: degraded read from legacy telemetry only, `authoritative: false`.

---

## 7. Gate C — WRITE authority

- `appendServerAudit` in `src/server/serverAudit.ts` — canonical server append.
- Repositories: identity, commercial, master data, governance, drum writes, costing formula/currency/metal, platform configuration.
- Legacy `appendAudit` may still fire for compatibility — **not required** for audited status.
- `platformConfigurationRepository` remediated: now writes authoritative server audit (was telemetry-only gap).

---

## 8. Gate D — V1/V2 convergence

| Surface | API |
|---------|-----|
| V2 SECURITY / ADMIN | `/api/v2/audit/events` |
| V1 Costing admin | `/api/admin/costing/audit` |
| V1 Customer admin | `/api/admin/customers/:id/audit` |
| Module IA contract | `sourceApi: /api/v2/audit/events` for ADMIN/SECURITY |

No UI reads `listAudit` as authoritative admin history.

---

## 9. Gate E — LOCALSTORAGE / legacy telemetry

| Key | Class | Policy |
|-----|-------|--------|
| `energya_platform_audit_v1` | `LEGACY_TELEMETRY` | Retained; not deleted |
| `appendAudit` | Client/server memory telemetry | Non-authoritative mirror |
| `AUDIT_LOCAL_IS_AUTHORITATIVE` | `false` | Enforced in registry + constants |

---

## 10. Gate F — STALE DATA

`preferPostgresAudit`: when `pg.ok`, return PG payload including `[]`. Legacy telemetry cannot override or resurrect history when PG is available.

---

## 11. Gate G — FAILURE

When PostgreSQL audit read fails: `source=LEGACY_TELEMETRY_FALLBACK`, `authoritative=false`. Never silent authoritative audit from LS alone.

---

## 12. Gate H — SECURITY

- `/api/v2/audit/events`: `requireAuth` + `requirePermission(actor, 'ADMIN', 'SECURITY', 'VIEW')`.
- Costing audit: `assertCanViewCostingAudit`.
- Customer audit: customer admin RBAC + scope.
- Customers cannot read global platform audit.

---

## 13. Gate I — AUDIT / transaction semantics

- Import commit: `writeAudit` inside `persistImportTransaction` PG txn — no audit on failed txn.
- Identity login failures/successes: server `AuditEvent` only.
- Failed mutations must not append authoritative audit (repos throw before audit).

---

## 14. Gate J — REGRESSION

`auditAuthority.test.ts` (10 scenarios) + existing increment/hardening audit tests. Full `npm test`, `tsc --noEmit`, `prisma validate`, `npm run build`.

---

## 15. Immutability

- No user-facing PUT/PATCH/DELETE for `AuditEvent`.
- Test evidence: `increment12b1.hardening.test.ts` — DELETE/PATCH `/api/admin/audit/:id` rejected.
- Prisma model has no `updatedAt` — append-only by design.

---

## 16. Explicit non-actions

- **No** `POSTGRESQL_SOT` promotion for AuditEvent (not master data).
- **No** mass LS→PG migration or fabricated history.
- **No** LS key deletion.
- **No** second audit engine or EAV audit.
- Cable / BOM / Drum / Params / TCR **not** cut over.
- Costing Option B / Decision 5 / Phase 1 fulfillment / drum WIP **untouched**.

---

## 17. Remaining dual-write paths (documented)

Server repos may still call `appendAudit` for legacy telemetry alongside server audit. These are **non-authoritative** and may be retired in a future cleanup task — not 04B-4.

---

## 18. Rollback / compatibility

1. Revert the 04B-4 commit (do not amend 04A/04B-1/04B-2/04B-3).  
2. LS telemetry key remains — no destructive drop.  
3. Registry returns to pre-04B-4 audit notes if reverted.

---

## 19. Verdict

**AUDIT = AUTHORITATIVE SERVER AUDIT — ACCEPTED**

TASK 04A = ACCEPTED / FROZEN  
TASK 04B-1 = ACCEPTED / FROZEN  
TASK 04B-2 = ACCEPTED / FROZEN  
TASK 04B-3 = ACCEPTED / FROZEN  
TASK 04B-4 = AUDIT AUTHORITY ONLY  
TASK 04B-5 = NOT STARTED  
STOP.
