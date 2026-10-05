# 16 — Task 02 Status & Risks

**Status:** Implemented (foundation) — 2026-09-04

## Delivered

- V1/V2 runtime boundary + docs
- Module registry + navigable filter (no fake GAP screens)
- Data ownership matrix
- EFFECTIVE ACCESS evaluate + explain UI
- Security groups schema (User→Group→Role)
- Metadata merge service + PlatformFieldDefinition extensions
- NumberSequence + costing wrapper
- Server audit helper + migration note
- V2 ERP shell (Energya branding)
- Master/drum API hardening (401/403)

## Explicitly out of scope (not started)

- Task 03 / full low-code builders
- Supply Chain / Finance native ledgers
- Live D365 / Advaris
- Costing Option B / Decision 5 changes
- Phase 1 fulfillment domain changes

## Risks / gaps

| Item | Risk | Mitigation |
|------|------|------------|
| Clients calling master GETs without JWT | 401 after hardening | SPA already sends JWT; localStorage drum fallback remains |
| Permission seed lag for PLATFORM:* | Explain API uses ADMIN:SECURITY:VIEW | SYSTEM_ADMIN gets full catalog on re-seed |
| Commercial INQ numbers not on NumberSequence | Inconsistency | Documented; wrap later without breaking stamp+random |
| Dual audit (client localStorage) | Incomplete forensics | Migration path in `/api/v2/audit/migration` |
| Group membership empty by default | Chain incomplete until admins assign groups | Direct UserRole still works |

## Recommended next (after Task 02 acceptance)

**Task 03 (done):** Module IA + MD ownership surfaces — see `docs/v2/17_TASK03_MODULE_IA.md`.

**Next candidate (Task 04):** Inquiry & Quotation module packaging with field-metadata SoT on list/form — not low-code builders, not SC/Finance, not freeze lifts.
