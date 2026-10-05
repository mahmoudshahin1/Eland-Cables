# APPLICATION STATUS REPORT

**Audit date:** 2026-09-03  
**Source brief:** `CURSOR_AUDIT_EXISTING_APPLICATION.md` (Downloads intake)  
**Workspace:** `D:/Projects/EPC_Platform/energya-connect-platform`  
**Method:** Code/docs inspection (schema, routes, package.json, Phase 1 / drum / prior audits). Live `npm test` / Lighthouse / pen-test **not** re-run in this session (Node binary unavailable in the audit shell). Test counts cited from freeze gates and prior audits where dated.

**Prior related docs (do not treat as superseded unless noted):**
- [`FINAL_PLATFORM_AUDIT.md`](./FINAL_PLATFORM_AUDIT.md) (2026-08-25) — Increments 10–14 deep audit  
- [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) (2026-08-29) — inventory  
- [`PHASE1_QUOTE_TO_CASH_FREEZE.md`](./PHASE1_QUOTE_TO_CASH_FREEZE.md) (2026-08-31) — domain freeze  
- [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md)  
- [`DRUM_SELECTION_OPTIMIZATION_ASSESSMENT.md`](./DRUM_SELECTION_OPTIMIZATION_ASSESSMENT.md) (2026-09-01) + in-progress drum optimization code  
- [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md)

---

### Executive Summary

Energya Connect is a **monolithic React 19 + Express 4 + Prisma 6 / PostgreSQL** B2B quote-to-cash platform for cable manufacturing. The **governed commercial/costing core is real and substantial** (identity/RBAC, master data import, inquiries/quotations, costing orchestrator, Phase 1 fulfillment domain frozen). It is **not** production SaaS-ready today: business master data gates (RM prices, governed BOM, FX, logistics amounts) block ready costing; dual localStorage/PostgreSQL remains on some master-data UI paths; operational screens (production, finance, shipments) are still mock; **no app Dockerfile**, no rate limiting/OpenAPI, TypeScript **not** in strict mode; D365 adapters correctly stay `NOT_IMPLEMENTED`. **Recommendation: UPDATE the existing repository** — do not rebuild. The “~20% incomplete” is mostly **business configuration, cutover of dual-write, deployment packaging, and UX/fulfillment polish**, not a failed architecture.

---

### Current State Assessment

#### 1. Application overview

| Item | Finding |
|------|---------|
| **Stack** | React 19, Vite 6, Express 4 (`server.ts` + `src/server/`), Prisma 6, PostgreSQL 16. **Not NestJS.** |
| **`src/` layout** | `app/`, `auth/`, `components/` (ai, architecture, auth, cable-configurator, common, costing, customer, fulfillment, inquiry-quotation, internal, layout, profile, ui), `context/`, `data/`, `domain/`, `fixtures/`, `platform/` (audit, errors, integration, logging), `server/`, `services/` |
| **Source files** | ~342 `.ts`/`.tsx` under `src/` (~128 component `.tsx`) |
| **DB** | PostgreSQL via Prisma (`provider = "postgresql"`). Local: `docker-compose.yml` **Postgres only**. |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt (`UserAccount.passwordHash`); `identityAuthRouter` at `/api/auth`. Demo auth still allowed when not production. |
| **Build** | `vite build` + esbuild → `dist/server.cjs`; `npm start` / `start:migrate` |
| **Deploy** | Documented for **Render** (`docs/release/RENDER_SETUP_GUIDE.md`). **No application Dockerfile.** Compose = DB only. |
| **Tests** | `tsx --test` (not Vitest). Phase 1 freeze gate: **564/564** (2026-08-31). This audit session could not re-execute tests (Node not on PATH). |
| **API surface** | ~19 `/api/*` router mounts; ~266 `router.(get\|post\|…)` registrations across `src/server`. |

#### 2. Completion status (honest)

**Working (governed paths):** JWT identity; RBAC; customer isolation (`customerScope` / `commercialProjection`); Import Center → Cable/BOM/RM/Drum masters; Technical Office / cable authority; Commercial Inquiry CRUD + calculate-cost orchestrator; Quotation freeze from inquiry; Costing Hub (formulas `+ - * /`, scrap, FX gates); Phase 1 fulfillment APIs (MTO quotation → commitment → SO; agreement release; Direct MTS) — **domain FROZEN**; drum master + cutting schedule; **recent** drum optimize/validate/candidates APIs + workflow UI (in progress / post-assessment).

**Partial:** Metal/logistics/packing layers (schema + admin; amounts often `NOT_CONFIGURED`); FX (blocks when missing); dual localStorage after import on some catalog services; fulfillment **operational UI** (workspace in progress per freeze “next phase”); drum auto-optimization (domain + API present; compatibility matrix still `CONFIGURATION_REQUIRED` / empty in places); customer dashboard (live inquiry KPIs + mock orders); notifications (model/SMTP helper, not full production routing).

**Not implemented / mock:** Live D365 F&O / Advaris MES; production monitoring, finance AR, shipment tracker, Power BI–style reports (mock data); real quotation **PDF** generation (toasts / mock messaging exist; Excel used for templates/export elsewhere); container loading optimizer as production engine; SaaS billing/license; LDAP/AD; Redis/job queue; OpenAPI; rate limiting.

**What drives the “~20% incomplete”:** (1) business data gates for READY costing, (2) dual-write cutover, (3) deployment hardening (Dockerfile, secrets, HTTPS/ops), (4) mock ops screens vs real ERP, (5) Phase 1 UI polish + drum optimization productization, (6) Decision 5 / Costing V2 metal freeze still pending.

#### 3. Code quality (summary)

| Topic | Assessment |
|-------|------------|
| TypeScript | **No `"strict": true`** in `tsconfig.json` (`noEmit`, bundler resolution). |
| Organization | Clear domain/services/server split; Express routers (not Nest controllers). |
| Errors | Domain error patterns + tests (`platform/errors`); costing returns explicit `NOT_READY` codes. |
| Validation | Server-side commercial/costing gates; Prisma types; not a single shared Zod/OpenAPI layer. |
| Logging | Platform logging helpers; not centralized ELK/CloudWatch out of the box. |
| Duplication | Documented in `FINAL_PLATFORM_AUDIT.md` (dual auth leftovers, dual audit stores, dual costing persist contracts, localStorage vs Prisma masters). |
| Naming / comments | Generally clear for domain code; quality ~7–8/10 with known legacy naming debt. |

#### 4. Database

- **~66 Prisma models** (cable/BOM/RM/drum, commercial inquiry/quotation/commitment/SO/agreement, identity, costing config, platform fields/notifications/reports).  
- **34 versioned migrations** under `prisma/migrations/`.  
- **Heavy indexing** (~200 `@@index` / unique markers). FKs via Prisma relations.  
- Timestamps / audit: models commonly use `createdAt`/`updatedAt`; `AuditEvent` for server-side audit; client localStorage audit still exists.  
- Passwords: bcrypt hashes only on identity path.  
- Backup: **not** codified in-repo beyond host (Render/Postgres) ops. Schema scales to 10K–100K with indexes; N+1 risk remains case-by-case.

#### 5. API

- Category mounts: auth, admin identity/customers, master data, cables, technical-office, costing, admin costing/platform, commercial-pricing, inquiries, quotations, commercial-commitments, sales-orders, sales-agreements, agreement-releases, AI assistant, health/status, D365/Advaris **stubs**.  
- **No Swagger/OpenAPI** found. **No rate limiting** found.  
- Auth: Bearer JWT via `resolveRequestActor` + RBAC.  
- CORS: optional via env (same-origin monolith default).  
- Versioning: **none** (`/api/...` unversioned).  
- Error shape: JSON domain/HTTP errors (not fully standardized OpenAPI Error schema).

#### 6. Frontend

- ~128 React components under `src/components`.  
- State: React Context (`AuthContext`) + local component state; **not** Redux/Zustand.  
- Forms: custom (no React Hook Form / Formik as standard).  
- UI: **Tailwind CSS 4** + shared UI primitives.  
- Mobile/a11y/Lighthouse: **not verified** in this audit. Loading states exist on many API-driven screens; inconsistent on older mocks.

#### 7. Security (summary)

| Control | Status |
|---------|--------|
| Auth | JWT + bcrypt; lockout threshold configurable |
| RBAC | `rbac.ts` / permission catalog — used on many commercial/admin routes |
| Secrets | `.env.example` documents production requirements; never commit secrets |
| HTTPS / at-rest | Host responsibility (Render etc.) |
| SQLi | Prisma parameterized |
| XSS | React escaping; no full CSP audit |
| CSRF | Same-origin API + JWT; no classic cookie CSRF layer documented |
| Rate limit | **Missing** |
| Pen-test / SOC2 / GDPR program | **Not evidenced** |

#### 8. Feature completeness checklist

| Feature | Status | Notes |
|---------|--------|-------|
| a. Customer Inquiry Submission | ✓ / ⚠️ | Live PostgreSQL path; some UI prefs dual-store |
| b. Cable Selection & BOM | ✓ / ⚠️ | Import + authority; governed BOM / mapping gaps for production cables |
| c. Cutting Lengths & Optimization | ⚠️ | Schedule UI + domain; full STEP-6 productization ongoing |
| d. Drum Optimization Algorithm | ⚠️ | `drumOptimizationService` + `/api/master/drums/optimize`; compatibility/config still required |
| e. Cost Calculation | ✓ / ⚠️ | Orchestrator solid; READY blocked without prices/BOM/FX |
| f. Metal Price Integration | ⚠️ | LME/manual models + Costing V2 freeze (Decision 5 pending); often not configured |
| g. Shipping (Incoterms + destination) | ⚠️ | Incoterms on inquiry; logistics amounts `NOT_CONFIGURED` |
| h. Container Quantity Calculation | ✗ / mock | Prototype/modal paths; not production engine |
| i. Quotation Generation (PDF/Excel) | ⚠️ | Quotation domain persist ✓; PDF not production-grade |
| j. Workflow Technical → Costing → Planning | ⚠️ | TO + costing + commercial exist; planning/MES mock |
| k. User Authentication & Login | ✓ | Production identity path; demo auth must stay off in prod |
| l. Multi-user Dashboard | ⚠️ | Role hubs exist; KPIs partially live / partially hardcoded |

---

### Production Readiness Gap Analysis

| Feature / area | Status | Gap | Effort (order-of-magnitude) |
|----------------|--------|-----|-----------------------------|
| Identity + RBAC | Ready | Demo auth off; secret hygiene | S |
| Inquiry / Quotation domain | Ready | PDF/export polish | M |
| Costing engine | Ready (code) | Official RM prices, governed BOM, FX, logistics amounts | L (business + data) |
| Phase 1 fulfillment domain | **Frozen** | UI workflow stabilize | M |
| Drum auto-selection | In progress | Compatibility matrix, UX, acceptance | M |
| Master data cutover | Partial | Remove localStorage dual-write | M–L |
| Ops screens (prod/finance/ship) | Mock | Replace with ERP or hide | L / product decision |
| D365 | Stub by design | Phase 2 adapters | XL |
| Docker app image | Missing | Add Dockerfile + compose app service | S–M |
| API hardening | Weak | Rate limit, OpenAPI, API versioning | M |
| TS strict | Off | Gradual strict enablement | M |
| SaaS multi-tenant | Partial | Customer isolation ✓; true org/tenant SaaS model incomplete | L |

---

### Deployment Readiness

| Question | Answer |
|----------|--------|
| Dockerfile (app)? | **No** |
| docker-compose? | **Yes — Postgres only** (healthcheck present) |
| 12-factor / env? | Largely yes (`.env.example`) |
| External PostgreSQL? | Yes (`DATABASE_URL`) |
| Cloud-agnostic? | Yes (Node + Postgres); Render guide exists |
| File storage? | Local / import artifacts; not cloud object storage abstraction |
| Metrics / Prometheus? | Health endpoints only |
| Horizontal scale? | Stateless JWT + Postgres — feasible; sessions in DB; **no** shared cache/queue |
| On-prem LDAP/AD? | **No** |
| Internet needs? | Optional Gemini (`GEMINI_API_KEY`); otherwise can be isolated with local Postgres |

**Verdict:** Demo/cloud deploy possible with ops discipline (Render guide). **Not** turnkey SaaS/on-prem appliance.

---

### D365 Integration Assessment

| Topic | Finding |
|-------|---------|
| Complexity (Phase 2) | **7/10** — domain already shaped for quote-to-cash; live ERP sync, conflict ownership, and ops cutover are hard |
| Current adapters | `d365Adapters.ts` → `NOT_IMPLEMENTED`; HTTP stub `connected: false` / `NOT_CONNECTED` (correct per ADR-004) |
| Phase 1 | Standalone fulfillment **frozen**; `integrationStatus = NOT_SENT` |
| Aligns with D365 concepts? | Customers, items (CableMaster), quotations, SO/agreements — **partially aligned** via approved spec docs |
| Read from app (future) | Quotations, commitments, EPC SO/agreements, master snapshots |
| Write to app (future) | Confirmations, ERP IDs, inventory/availability (esp. MTS), status |
| Conflicts | Master data ownership (item/customer), pricing vs costing, dual SO systems |
| Refactor now? | Keep adapters thin; finish dual-write cutover; freeze costing Decision 5 carefully; do **not** invent live D365 |

---

### Decision Recommendation

**UPDATE existing codebase.**

**Reasoning:** Architecture matches the business (cable masters → inquiry → costing → quotation → Phase 1 fulfillment). Significant tested domain logic, Prisma schema, and RBAC already exist. Prior audits and freezes show intentional gates (`NOT_READY`, `NOT_IMPLEMENTED`) rather than a collapsed prototype. A greenfield rewrite would discard months of domain truth and reintroduce integration risk.

**Effort to production-ready (Phase 1 SaaS demo / limited go-live):** roughly **120–250 hours** depending on how much mock UI is hidden vs replaced, and how fast business configures prices/BOM/FX. Full multi-tenant SaaS + live D365 is a **separate** larger program.

---

### Critical Path Items (Do these first)

1. **Business costing readiness data** — APPROVED RM prices, governed BOM/mappings, FX — Priority P0 — L (business + TO)  
2. **Production env hardening** — `JWT_SECRET`, demo auth off, migrate deploy, HTTPS host — P0 — S  
3. **Master-data dual-write cutover** — PostgreSQL only for cable/BOM/RM/drum UI — P0 — M  
4. **App container / deploy package** — Dockerfile + compose app service (or lock Render runbook) — P1 — S–M  
5. **Fulfillment UI stabilize** + drum optimization acceptance — P1 — M  
6. **API hardening** — rate limiting, consistent errors, optional OpenAPI — P1 — M  

---

### Blockers to Go-Live

1. **READY costing blocked without configured master economics** → Configure prices/BOM/FX/logistics → days–weeks (business)  
2. **Dual localStorage/PostgreSQL** → Cut over UI services → 16–40 h  
3. **No app image / incomplete SaaS packaging** → Dockerfile + secrets/runbook → 8–16 h  
4. **Mock operational surfaces misread as live ERP** → Hide or label; do not claim D365 → 4–12 h  
5. **Missing rate limit / strict TS / API docs** → Hardening sprint → 16–40 h  

---

### Readiness scores (1–10)

| Dimension | Score |
|-----------|------:|
| Code quality | 7 |
| Feature completeness (Phase 1 commercial) | 7 |
| Testing coverage (breadth of domain tests) | 7 |
| Documentation | 8 |
| Security | 6 |
| Performance (evidence limited) | 6 |
| Deployment readiness | 5 |
| **OVERALL** | **6.5** |

**Can this go live TODAY as SaaS?** **No — with conditions.**  
Conditions: production secrets + demo auth disabled; costing business data configured for the launch cable set; dual-write cutover or clearly scoped demo; mock ERP screens hidden/labelled; deploy host with HTTPS + Postgres backups; acceptance on inquiry→quote→(optional) Phase 1 SO paths.

---

### Quick wins (&lt;4 hours each)

1. Hide/label mock D365/MES “connected” misconceptions in UI copy (stubs already `false` on API).  
2. Fail-fast if `JWT_SECRET` missing/fallback in production (verify current guard).  
3. Document “demo vs production” checklist from `.env.example` into operator one-pager.  
4. Sidebar/KPI hardcode cleanup on primary sales surfaces.  
5. Ensure Phase 1 customer nav filter stays aligned with what is actually live.

---

### Architect’s assessment

1. **Stack:** Keep React + Express + Prisma + PostgreSQL. NestJS rewrite is unnecessary cost.  
2. **Pattern:** Modular monolith — appropriate through Phase 2; extract services only when D365/MES load demands.  
3. **Scale to 100K customers / 1M orders:** Schema OK with care; add caching, queues, read replicas, and tenant strategy before that scale.  
4. **Multi-tenancy:** **Partial** — strong **customer** isolation; not full SaaS org/tenant productization.  
5. **Phase 2 D365:** Batch/event-driven sync behind adapters; REST to F&O OData/custom services; **D365 owns** posted SO/invoice truths; Energya owns pre-ERP commercial/costing engineering; conflict = ERP authoritative post-posting.

---

### Next Steps

1. Share this report; confirm **UPDATE** decision.  
2. Run fresh `npm test` + `tsc --noEmit` on a machine with Node (re-baseline after drum/fulfillment WIP).  
3. Prioritize P0 data + env hardening + dual-write cutover.  
4. Finish drum optimization acceptance against `DRUM_SELECTION_OPTIMIZATION_ASSESSMENT.md`.  
5. Stabilize fulfillment UI under frozen Phase 1 domain rules.  
6. Only then schedule D365 Phase 2 adapter work (do not unblock by inventing ERP).  
7. Defer MES / CMMS / scheduling apps until Phase 1 SaaS demo is honest and deployable.

**Estimated time to limited production-ready (Phase 1 commercial SaaS demo):** ~**160 hours** (± depending on business data readiness).

---

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Treating mock ops UI as live ERP | High | Hide/label; keep adapters `NOT_IMPLEMENTED` |
| Costing V2 / Decision 5 accidental change | High | Honor freeze; no metal semantics edits without approval |
| Dual-write data drift | High | Cutover plan; health already reports dual mode |
| Demo auth in production | High | Env gates + seed password policy |
| Rebuild temptation | Medium | This report: UPDATE |

---

*End of APPLICATION STATUS REPORT (2026-09-03).*
