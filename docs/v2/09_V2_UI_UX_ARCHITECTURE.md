# 09 — V2 UI/UX Architecture (Design Only)

**Assessment date:** 2026-09-04  
**Constraint:** Design architecture **only** — no UI redesign implementation in Task 01.  
**Baseline tokens:** `docs/design/DESIGN_SYSTEM.md`, `src/index.css` `@theme`, `BrandLogo` / `public/logo.png`.

---

## 1. Design intent

V2 UX is an **ERP workspace product** for Energya Power Cables:

- **White-dominant** content canvas (`surface-page` / `surface-muted`)
- **Navy brand chrome** (`brand-700`–`900`) for shell
- **Vermilion accent** sparingly for primary/destructive CTAs (`accent-500`)
- **Poppins** display + existing body stacks
- Inspired by D365 F&O **information architecture** (workspaces, modules, lists, forms) — **not** a F&O visual clone

Preserve Energya branding: logo lockup must remain hero-level in chrome; do not invent alternate logos.

---

## 2. CURRENT STATE

| Surface | Pattern |
|---------|---------|
| Shell | Dual portal `/customer` vs `/internal` + sidebar tabs |
| Workspaces | Hubs (Master Data, Admin, TO, Costing full-bleed) |
| Commercial | Inquiry detail with many tabs |
| Customer Phase-1 | Narrow nav (dashboard, inquiries, support) |
| Mocks | Production, finance, logistics, some customer tabs |
| Design system | Tokens + `ui/*` primitives partially adopted |

---

## 3. TARGET INFORMATION ARCHITECTURE

```text
App Shell
├── Global: search (future), notifications, user, company/customer context
├── Module navigator (grouped: Core / Commercial / Eng / SC / Fin / Support)
└── Active Module
      ├── Workspace (landing)
      ├── Side or top subnav: Master | Transactions | Setup | Workflows | Reports | Dashboards
      └── Main stage: List → Form → Line grid / panels
```

### Navigation model

| Element | Target behavior |
|---------|-----------------|
| Module groups | Map to Doc 03 catalog; hide PLANNED/NOT_IMPLEMENTED by default |
| Workspace tiles | Open queues + KPIs (live metrics only) |
| Favorites | Future; not required for Phase 0 |
| Customer portal | Simplified subset: Inquiry & Quotation + Support (+ future Cases) |
| Internal portal | Full module navigator by EFFECTIVE ACCESS |

### List–Form pattern

1. **Filterable list** (`ui/Table`) with status badges  
2. **Header form** with `PageHeader` actions  
3. **Lines grid** + drawers for side detail (costing readiness, drum plan)  
4. **Workflow actions** in consistent action bar (Submit / Approve / Reject)

Costing already approximates this via `CostingWorkspaceShell` — treat as reference implementation for other modules.

---

## 4. Brand & visual rules (architecture)

| Rule | Specification |
|------|---------------|
| Brand first in chrome | `BrandLogo` left; Connect wordmark optional |
| Content | White / muted surfaces; avoid purple-gradient AI clichés |
| Cards | Prefer section layouts; cards for interactive containers |
| Status | Single `Badge`/`StatusBadge` language |
| Density | ERP-comfortable (compact tables) for internal; slightly airier for customer |
| Motion | Subtle only (panel open, status change) — not marketing motion |
| Mobile | Customer: bottom nav recipe already in design system; Internal: desktop-first |

**Out of scope for Task 01:** re-tokenizing colors, rewriting all pages, new illustration system.

---

## 5. Module UI contract (maps to Doc 04)

Every LIVE module provides:

| UI artifact | Description |
|-------------|-------------|
| Workspace route | Landing |
| List routes | Masters / transactions |
| Form routes | Create/edit with RBAC-aware actions |
| Empty/error states | Domain codes surfaced honestly (NOT_READY, NOT_IMPLEMENTED) |
| No fake connectivity | Do not show green “connected” for D365/MES stubs |

---

## 6. Recommendations

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Tab soup + mock peers | Module navigator + LIVE-only default | Operator clarity | Medium IA change | Demo script churn | Doc 03, 10 |
| Partial `ui/*` adoption | Standardize lists/forms on primitives | Consistency | Incremental per module | Visual drift mid-migration | Design system |
| Costing special chrome | Keep specialized shell; align tokens | Power users | Low | Two visual languages | Costing freeze unrelated to UX chrome |
| Hardcoded badges (“12 Open”) | Live counts or remove | Trust | Low | — | KPI service |
| Dual customer hidden routes | Explicit allow-list enforcement | Security + UX honesty | Low–medium | Deep links | Doc 07 |

---

## 7. Explicit non-goals (this task)

- No pixel redesign of Inquiry or Costing in Task 01  
- No new low-code form designer UI shipped  
- No replacement of Energya logo or navy/vermilion brand  
- No claiming D365 look-and-feel parity  
