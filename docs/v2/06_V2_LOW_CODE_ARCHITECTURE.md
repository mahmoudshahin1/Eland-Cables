# 06 — V2 Low-Code Architecture

**Assessment date:** 2026-09-04  
**Definition:** Metadata-driven configuration **without** arbitrary JavaScript/SQL execution.  
**Baseline:** `docs/FINAL_LOW_CODE_ARCHITECTURE.md` (reuse; do not contradict).

---

## 1. CURRENT STATE

| Area | Exists? | Evidence | Runtime admin? |
|------|---------|----------|----------------|
| Costing formulas / variables / scrap / FX | Yes | `/api/admin/costing/*`, Costing Hub | Yes (Costing Team) |
| Extension layers (metal/logistics/packing) | Schema + CRUD | `platformAdminRoutes`, costing extensions | Yes; amounts often empty → NOT_CONFIGURED |
| Platform field definitions | Prisma + API | `PlatformFieldDefinition` | Thin API; inquiry UI uses TS manifest |
| Notification rules | Prisma + SMTP helper | `NotificationRule` | No full admin UX as SoT |
| Report definitions | Prisma + API | `ReportDefinition` | No execution |
| Inquiry field visibility | TS + localStorage | `inquiryFieldManifest.ts` | User prefs only |

**Formula language (protected):** tokenizer → AST → operators `+ - * / ( )` only. SUM/IF disabled by design.

---

## 2. TARGET STATE — layered low-code

```text
┌─────────────────────────────────────────────┐
│ Experience metadata (layouts, labels, tabs) │  ← safest
├─────────────────────────────────────────────┤
│ Field metadata (visibility, required, types)│
├─────────────────────────────────────────────┤
│ Setup parameters & number sequences         │
├─────────────────────────────────────────────┤
│ Domain configuration (costing formulas…)    │  ← sandboxed
├─────────────────────────────────────────────┤
│ PROTECTED CORE (code invariants)            │  ← never low-code
└─────────────────────────────────────────────┘
```

### Allowed in low-code / metadata

- Labels, help text, field show/hide (within role policy)
- Optional/required (where domain allows)
- List column preferences
- Notification routing templates
- Report field selection from **whitelist**
- Costing formulas inside existing language + assignment scopes
- Scrap/FX/logistics **amounts** and effectivity (with workflow)

### Forbidden (protected core invariants)

| Invariant | Owner |
|-----------|-------|
| Customer isolation / projection | Platform + commercial |
| RBAC / EFFECTIVE ACCESS | Security |
| Costing READY gates & orchestrator entry | Costing engine |
| Formula sandbox (no eval/JS) | Costing engine |
| BOM conflict BUSINESS_DECISION_REQUIRED | Engineering/BOM |
| Price overlap / workflow exclusivity | RM price + pricing |
| Cable authority evaluation | Engineering |
| Phase 1 fulfillment entry points & qty integrity | Commercial/Sales (frozen) |
| ADR-004 adapter boundaries | Integration |
| Audit immutability | Platform |
| Option B metal semantics until Decision 5 | Costing freeze |

---

## 3. Dual systems to collapse

| CURRENT | TARGET | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------|--------|--------|------------------|---|--------------|
| `inquiryFieldManifest` vs `PlatformFieldDefinition` | PlatformFieldDefinition SoT | One metadata model | Medium (UI bind) | Missing fields | Inquiry workspace |
| Client audit vs `AuditEvent` | Server AuditEvent | Integrity | Low–medium | History gap | Platform audit |
| ReportDefinition unused | Reporting runtime whitelist | Real reports | High | Over-broad queries | Doc 05 |
| NotificationRule unused in UX | Admin + event bus | Ops | Medium | Email storms | SMTP config |

---

## 4. Conceptual metadata model (not EAV business data)

V2 uses **typed metadata**, not full EAV for transactions:

| Store | Purpose |
|-------|---------|
| `PlatformFieldDefinition` | Field UI/behavior per entityCode |
| Future `PlatformFormLayout` (planned) | Section/tab composition |
| Future `PlatformViewDefinition` (planned) | Grid views |
| `NotificationRule` | Event routing |
| `ReportDefinition` | Report specs |
| Costing config tables | Domain configuration (already strong) |

**Transactional business data** (inquiries, SO lines, BOM quantities) remains **first-class Prisma columns** — not EAV.

---

## 5. Recommendation

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Strong costing low-code; weak form/report low-code | Extend metadata for UX; keep core coded | Speed config without losing integrity | Phased | “Low-code everything” pressure | Roadmap phases; protected list above |
| No generic workflow designer | Status machines in code + metadata labels | Avoid brittle WF builders early | Low | Premature WF product | Doc 04 Workflow module PARTIAL |
