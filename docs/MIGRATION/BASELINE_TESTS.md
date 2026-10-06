# Baseline Test Results (Legacy Express)
> التاريخ: 2026-10-06
> أداة التشغيل: `node scripts/runRegisteredTests.mjs` (إجمالي 202 ملف اختبار مسجل في `scripts/registered-tests.txt`)
> حالة قاعدة البيانات أثناء التشغيل: Offline (اختبارات المنطق النقي Domain والـ Unit تنجح؛ اختبارات التكامل Integration التي تتطلب اتصال PostgreSQL حي تفشل بسبب عدم وجود قاعدة بيانات محلية نشطة: `DATABASE_URL is not set`).

---

▶ migrateLocalToSupabase auth / security mapping
  ✔ 1. UserAccount mapping by email/username with deterministic target preserve (1.102ms)
  ✔ 2. Customer ID remapping for UserAccount / CustomerUser via customer map (0.2354ms)
  ✔ 3. CustomerUser mapping remaps customerId + userAccountId without inventing ids (0.1119ms)
  ✔ 4. UserRole mapping remaps userId + roleId (0.2126ms)
  ✔ 5. RolePermission mapping remaps roleId + permissionId (0.2341ms)
  ✔ 6. UserNotification mapping remaps userAccountId; nulls orphan when nullable (0.1429ms)
  ✔ 7. SecurityGroup mapping + member/role junctions (0.1866ms)
  ✔ 8. PasswordResetTicket: keep historical; force-expire active; never invent tokens (1.8077ms)
  ✔ 9. UserSession: invalidate active; preserve historical (0.5039ms)
  ✔ 10. duplicate email conflict reported without inventing ids (0.339ms)
  ✔ 11. duplicate username conflict reported without inventing ids (0.2409ms)
  ✔ 12. production admin protection — never overwrite target (0.3723ms)
  ✔ 13. orphan identity FK detection for required junctions (0.3348ms)
  ✔ 14. secret redaction of passwordHash / tokens from records and free text (1.0551ms)
  ✔ auth FK dependency order places Customer and Permission before dependents (0.8052ms)
  ✔ identity summary rows cover all AUTH_MIGRATION_ORDER tables (1.2584ms)
✔ migrateLocalToSupabase auth / security mapping (10.3898ms)
▶ migrateLocalToSupabase Incoterm / CustomerShippingCostRate remapping
  ✔ 1. maps source Incoterm ids to target Incoterm ids by code (1.109ms)
  ✔ 2. remaps CustomerShippingCostRate.incotermId via Incoterm code map (0.225ms)
  ✔ 3. remaps CustomerShippingCostRate.customerId via Customer code map (0.1696ms)
  ✔ 4. places Incoterm before CustomerShippingCostRate in dependency order (0.1032ms)
  ✔ 5. skips inserting Incoterms whose code already exists on target (shared/duplicate target ids) (0.2005ms)
  ✔ 6. nullable ShippingCostTransactionSnapshot.incotermId clears when unmapped (0.1289ms)
  ✔ 7. prepared CustomerShippingCostRate rows have no orphan customerId/incotermId refs (0.3557ms)
✔ migrateLocalToSupabase Incoterm / CustomerShippingCostRate remapping (3.0981ms)
▶ httpClient
  ✔ GET returns successful JSON (14.44ms)
  ✔ POST sends JSON body and returns successful JSON (0.3867ms)
  ✔ attaches Authorization Bearer from the explicit token (0.4261ms)
  ✔ falls back to tokenStorage when no token option is passed (0.4698ms)
  ✔ preserves backend error, code, and HTTP status (0.8265ms)
  ✔ preserves 401 (0.4411ms)
  ✔ preserves 403 (0.3208ms)
  ✔ preserves 409 (0.2691ms)
  ✔ PATCH and DELETE use those verbs through the same client (0.4504ms)
✔ httpClient (18.9347ms)
▶ Customer home presentation navigation
  ✔ keeps the approved customer functions and hides engineering tools (1.0253ms)
  ✔ maps Quotations to the existing inquiry list, not a new destination (0.1451ms)
  ✔ reads company name from master fields and uses the uploaded logo URL when present (0.2635ms)
  ✔ uses a generic placeholder when the customer has no logo and never invents Energya artwork (0.0961ms)
  ✔ shows a legal-name descriptor only when master data differs from the trading name (0.1056ms)
  ✔ prefers the Customer Master tagline over legal name for the header subtitle (0.0772ms)
  ✔ exposes six photographic product-category tiles as presentation assets (0.2712ms)
  ✔ derives product categories from real catalog family/voltage fields without inventing rows (0.6077ms)
✔ Customer home presentation navigation (3.4334ms)
▶ Application shell route map
  ✔ maps existing customer and internal tabs to URL paths (0.916ms)
  ✔ sends unauthenticated users to /login and keeps dedicated login paths (1.0763ms)
  ✔ lands authenticated users on the correct portal home (0.4052ms)
  ✔ does not use a login portal URL to choose Internal vs Customer after authentication (0.4942ms)
  ✔ keeps unassigned customer users on login instead of opening a generic customer portal (0.3967ms)
  ✔ does not invent a context selector when a customer has multiple CustomerUser assignments (0.2408ms)
  ✔ blocks customers from internal deep links without leaking those routes (0.3645ms)
  ✔ allows internal users on internal paths and redirects them away from customer URLs (0.2373ms)
  ✔ sends logout and unknown authenticated URLs to a safe destination (0.2359ms)
  ✔ keeps ELAND customers on the allowed customer tabs (0.3616ms)
  ✔ allows portal profile routes and blocks the other portal profile (0.2376ms)
  ✔ allows internal users on V2 platform paths and blocks customers from the platform navigator (0.1588ms)
  ✔ distinguishes V2 product shells from /v2/modules/customer and the platform catch-all prefix (0.2298ms)
  ✔ enforces P1.5-03 customer and internal product-shell isolation (0.2321ms)
✔ Application shell route map (7.135ms)
▶ Login routing and portal guards
  ✔ treats /login as the unauthenticated entry path (0.6422ms)
  ✔ keeps dedicated customer, users, and admin paths as aliases of /login (0.106ms)
  ✔ routes Customer vs Internal from authenticated userType, not a login portal flag (0.1131ms)
  ✔ sends internal and customer accounts to their dashboards regardless of login URL alias (0.187ms)
  ✔ blocks a customer account with no CustomerUser association after credentials succeed (0.1708ms)
✔ Login routing and portal guards (1.9994ms)
▶ JWT client expiry helper
  ✔ reads exp from a JWT payload (0.5137ms)
  ✔ returns null for invalid or missing tokens (0.1009ms)
  ✔ keeps remember-me on the same client storage keys (0.0708ms)
✔ JWT client expiry helper (1.3562ms)
▶ costing v3 bulk approve helpers
  ✔ selects only submitted and under-review ids (0.9618ms)
  ✔ summarizes approved, failed, and skipped counts (0.1613ms)
✔ costing v3 bulk approve helpers (1.8322ms)
▶ Costing navigation owns Pricing Rules
  ✔ exposes Pricing Rules under Costing with the Costing / Pricing Rules breadcrumb (0.5952ms)
  ✔ does not list Pricing Rules under Technical Office (0.5249ms)
✔ Costing navigation owns Pricing Rules (1.8318ms)
▶ Pricing Rules ERP table
  ✔ renders the master-data table columns and Markup / Margin method display (9.6847ms)
  ✔ renders filter dropdowns including Cable Family from existing master data (3.3081ms)
  ✔ renders the Scope dropdown on New Pricing Rule (5.841ms)
  ✔ shows Customer and Cable when scope is Customer + Cable (5.0096ms)
  ✔ shows Customer Group and Cable Family when scope is Customer Group + Cable Family (4.9048ms)
  ✔ keeps existing commercial pricing API routes unchanged (0.5134ms)
✔ Pricing Rules ERP table (30.2006ms)
▶ Costing Pricing Rules UI helpers
  ✔ exposes existing backend scopes without inventing new ones (0.9058ms)
  ✔ shows Customer + Cable fields for CUSTOMER_CABLE_SPECIFIC (0.1801ms)
  ✔ shows Customer Group + Cable Family fields for CUSTOMER_GROUP_FAMILY (0.0898ms)
  ✔ displays Markup / Margin for existing method enum values (0.0879ms)
  ✔ validates required scope fields, non-negative percent, and margin < 100 (0.1735ms)
  ✔ builds a rule name from selected master rows (0.2224ms)
✔ Costing Pricing Rules UI helpers (2.4026ms)
▶ customerInquiryDetailPresentation
  ✔ groups drums and cutting into Cutting & Drums and keeps costing (0.9889ms)
  ✔ maps presentation tabs back to existing workspace modules (0.1421ms)
  ✔ titles draft inquiries as New Inquiry (0.1172ms)
  ✔ derives type, cores x size, quantity and unit from real line data (0.3266ms)
✔ customerInquiryDetailPresentation (2.2928ms)
▶ customer Cutting & Drums workspace
  ✔ CASE A INQ26-06065: one combined workspace, packing once, 15 drums, no V2 chrome without snapshot (17.5515ms)
  ✔ CASE B genuine V2 snapshot: V2 UI available as one section on customer Cutting & Drums (0.2365ms)
  ✔ never mounts both drums and cutting V2 bridges for customer Cutting & Drums (0.1584ms)
  ✔ does not show V2 Engine chrome from workflowChannel === V2_CONFIGURATION alone (0.0996ms)
  ✔ static: CommercialInquiryDetail no longer dual-mounts customer V2 bridges (0.8383ms)
  ✔ static: InquiryV2TabBridge gates V2 Engine chrome on snapshot lineage, not workflowChannel (0.456ms)
✔ customer Cutting & Drums workspace (19.6179ms)
▶ customer inquiry list presentation
  ✔ maps backend statuses to customer-facing labels without costing language (0.692ms)
  ✔ buckets KPI statuses from real inquiry workflow states (0.1206ms)
  ✔ derives cable type, application and quantity from live line data (13.7104ms)
  ✔ only offers quotation actions when a quotation exists (0.6343ms)
  ✔ builds a customer timeline without a costing stage (0.2659ms)
  ✔ sanitizes quotation list rows to commercial-offer fields (0.4873ms)
  ✔ exports the visible list as CSV without inventing rows (0.3843ms)
✔ customer inquiry list presentation (17.2149ms)
▶ CustomerPageHero
  ✔ uses the shared drums photo and stacked slogan on every page (7.0375ms)
  ✔ omits breadcrumb on Home and still shows the drums strip (0.9805ms)
✔ CustomerPageHero (8.7287ms)
▶ Customer Cable Products page wiring
  ✔ uses the shared hero, existing advanced search, and existing New Inquiry + add-line APIs (0.9968ms)
  ✔ keeps Cable Search modal and inquiry list as separate entry points (0.9157ms)
  ✔ adds Products to customer nav without restoring New Inquiry in the sidebar (0.9861ms)
✔ Customer Cable Products page wiring (3.7923ms)
▶ Support center presentation
  ✔ labels and tones customer-facing case statuses (13.0697ms)
  ✔ builds compact numbered pagination windows (0.6011ms)
✔ Support center presentation (14.342ms)
▶ InquiryAutomaticProcessingPanel
  ✔ renders completed stages from backend result without fake delays (6.1158ms)
  ✔ uses customer-safe labels without costing leakage (1.4706ms)
  ✔ shows the failed engineering stage and reason (1.3546ms)
  ✔ does not present quotation success when the financial offer snapshot is missing (1.2123ms)
✔ InquiryAutomaticProcessingPanel (10.9224ms)
▶ InquiryHeaderForm delivery masters
  ✔ populates Incoterm from the global master and does not restrict to Eland combinations (10.983ms)
  ✔ does not invent FOB when it is absent from the approved Incoterm Master (4.6466ms)
  ✔ renders Select plus all 11 ICC Incoterms from the global master (4.4042ms)
  ✔ hides exchange-rate fields on the customer header and uses the four reference cards (8.7807ms)
  ✔ shows scoped Customer Master name instead of a leftover inquiry customerName (7.781ms)
  ✔ does not pre-select Rotterdam when destination is unsaved Alexandria (4.4185ms)
✔ InquiryHeaderForm delivery masters (41.8724ms)
▶ inquiryWorkspaceTabs
  ✔ exposes canonical inquiry workspace including Container Study after Cutting (0.946ms)
  ✔ exposes the same customer portal workspace including Container Study (0.2328ms)
  ✔ hides costing tab for internal users without costing permission (0.1178ms)
  ✔ keeps drums and cutting tabs for internal users without costing permission (0.1112ms)
  ✔ shows canonical internal workspace when costing is allowed (0.0992ms)
  ✔ normalizes disallowed tab to first allowed tab (0.101ms)
  ✔ CASE C Internal: Drums and Cutting remain separate tabs with separate V2 bridges (0.2597ms)
✔ inquiryWorkspaceTabs (2.6446ms)
▶ P1.5-02A additive foundation primitives
  ✔ does not render complete without an artifact (6.0436ms)
  ✔ renders journey state labels, not color-only status (0.5991ms)
  ✔ builds snapshot freeze copy and shows identity fields plus lifecycle text (0.6886ms)
  ✔ renders validation what / why / next / owner (0.4859ms)
  ✔ renders permission denial with module and role text (0.3367ms)
  ✔ renders empty and honest error stubs without success language (0.5294ms)
✔ P1.5-02A additive foundation primitives (9.5926ms)
▶ V2 Wave 1 — Customer Inquiry
  ✔ builds create payload without process or customerId override (1.5634ms)
  ✔ does not let the list query send a client customerId (0.1404ms)
  ✔ reads process from server metadata and formats it as a label (0.1545ms)
  ✔ derives journey steps from inquiry artifacts (0.2748ms)
  ✔ omits costing fields from customer line summaries (0.141ms)
  ✔ classifies IDOR and missing inquiry errors (0.2231ms)
  ✔ enforces inquiry ownership on the server helper (not by hiding rows) (0.4552ms)
  ✔ renders the customer dashboard with KPIs and recent inquiries (17.6837ms)
  ✔ renders dashboard empty and error states (1.6829ms)
  ✔ renders dashboard permission state when unsigned (0.4998ms)
  ✔ renders the inquiry list without a process selector (3.0945ms)
  ✔ renders inquiry detail journey without deferred NOT_IMPLEMENTED stages and no costing UI (3.098ms)
  ✔ renders forbidden when another customer inquiry is not authorized (0.3697ms)
  ✔ keeps product inquiry routes distinct from platform /v2/modules/customer (0.8929ms)
  ✔ keeps customer journey control labels for cable clear/replace and both drum paths (3.4392ms)
✔ V2 Wave 1 — Customer Inquiry (34.8523ms)
▶ cableAuthority three-state decision
  ✔ Test A: known approved Cable Master configuration is EXISTING_CABLE (1.0795ms)
  ✔ Test B: engineering-valid configuration absent from Cable Master (0.2883ms)
  ✔ Test C: family/voltage incompatibility is INVALID_CONFIGURATION (0.1713ms)
  ✔ Test D: missing CORE_COLOUR/FAMILY compatibility is CONFIGURATION_REQUIRED (0.1219ms)
  ✔ does not treat an unmapped official cable as structured EXISTING_CABLE (0.1613ms)
  ✔ maps identity + incomplete engineering to CONFIGURATION_REQUIRED (0.1582ms)
✔ cableAuthority three-state decision (2.7693ms)
▶ cable metal price resolution
  ✔ uses the inquiry override instead of a published price (1.2656ms)
  ✔ snapshots a missing header from the published cash ask and keeps an existing rate (0.2062ms)
  ✔ uses the published cash ask when the inquiry has no metal snapshot (0.1567ms)
  ✔ blocks when neither an inquiry snapshot nor a published price exists (0.1043ms)
  ✔ does not let a later publish rewrite stored inquiry, costing, pricing, or quotation snapshots (0.2032ms)
  ✔ ignores other metals, unapproved rows, and a system-default stand-in (0.2041ms)
✔ cable metal price resolution (2.9535ms)
▶ calculation completeness — calculate with available data
  ✔ 1. complete data stays CALCULATED + COMPLETE (1.1442ms)
  ✔ 2. missing numeric → 0 + warning, still CALCULATED (0.4201ms)
  ✔ 3. missing descriptive → Not Set + warning (0.1991ms)
  ✔ 4. multiple missing values collect every warning (0.1856ms)
  ✔ 5. structurally impossible stays BLOCKED, not zeroed (0.1775ms)
  ✔ 6. customer costing readiness is READY or CALCULATED WITH WARNINGS only — never PENDING (0.3021ms)
  ✔ 7. customer projection never includes internal cost tokens (0.327ms)
  ✔ 8. historical snapshot facts are not replaced by live zeros (0.4027ms)
  ✔ 9. VIP missing snapshot is 0+warning; STANDARD missing rate is 0+warning; packing is not blocked (1.1807ms)
  ✔ structural missing drums does not fabricate packing charges (0.4137ms)
  ✔ shippingChargesUnavailableInformation counts missing charges (0.1871ms)
  ✔ Rotterdam CIF missing ocean/handling stays CALCULATED WITH WARNINGS and keeps available charges (0.268ms)
✔ calculation completeness — calculate with available data (6.7868ms)
[email] quotation issued enqueue failed — quotation remains issued Error: smtp down
    at <anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\domain\commercialOfferDocument.test.ts:249:13)
    at runEmailWithoutRollback (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\domain\quotationIssuedEmail.ts:38:11)
    at TestContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\domain\commercialOfferDocument.test.ts:248:22)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1382:25)
    at Test.start (node:internal/test_runner/test:1242:17)
    at node:internal/test_runner/test:1867:71
    at node:internal/per_context/primordials:504:82
    at new Promise (<anonymous>)
    at new SafePromise (node:internal/per_context/primordials:478:3)
▶ inquiry line column registry
  ✔ hides a column in the same set the grid renders (0.6578ms)
  ✔ does not offer unit cost, total cost, or margin in the inquiry selector (0.2004ms)
✔ inquiry line column registry (2.1877ms)
▶ commercial line pricing display
  ✔ shows a dash before pricing and never a zero placeholder (0.2302ms)
  ✔ uses the server snapshot after pricing and dashes when inputs change (0.1431ms)
  ✔ keeps estimated value on the financial snapshot or a dash (0.6172ms)
✔ commercial line pricing display (1.1894ms)
▶ issued commercial offer document
  ✔ stores the price adjustment formula and inquiry metal bases (2.22ms)
  ✔ does not hardcode DAP Doncaster and leaves missing weights null (0.2642ms)
  ✔ maps missing numeric values to 0 and descriptive values to Not Set (0.2364ms)
  ✔ exposes print and export actions for draft and issued documents (0.1774ms)
✔ issued commercial offer document (3.1055ms)
▶ quotation issued email
  ✔ includes the commercial notice fields and does not throw when enqueue fails (13.1079ms)
✔ quotation issued email (13.2077ms)
▶ customer commercial projection
  ✔ strips cost and margin fields and keeps selling price (0.2882ms)
✔ customer commercial projection (0.3566ms)
▶ Version A submit routing
  ✔ calls the V2 submit path only when a V2 snapshot already exists (0.1419ms)
✔ Version A submit routing (0.2078ms)
▶ Commercial Pricing Engine Domain Service Tests
  ✔ calculates 20% Markup correctly (Cost = 100 -> Base = 120) (1.1834ms)
  ✔ calculates 20% Gross Margin correctly (Cost = 100 -> Base = 125) (0.2583ms)
  ✔ verifies Markup != Gross Margin mathematically for identical percentage (0.1647ms)
  ✔ rejects invalid Gross Margin >= 100% or < 0% (0.3332ms)
  ✔ rejects negative markup percentage (0.1073ms)
  ✔ calculates discount and final selling price correctly (0.1889ms)
  ✔ rejects discount > 100% or < 0% (0.162ms)
  ✔ resolves Customer-Specific + Cable-Specific rule as highest precedence (Level 1) (0.4265ms)
  ✔ resolves Customer-Specific rule when cable-specific rule is not present (Level 2) (0.1904ms)
  ✔ resolves Customer Tier rule for generic customer belonging to TIER_1 (Level 4) (0.2285ms)
  ✔ resolves Global Default rule when customer and tier have no custom rules (Level 5) (0.1383ms)
  ✔ detects priority conflict when multiple active rules share identical scope and priority (7.8967ms)
  ✔ detects expired pricing rule and returns PRICING_RULE_EXPIRED (0.2053ms)
  ✔ blocks currency mismatch without automated FX conversion (0.1305ms)
  ✔ triggers PRICING_APPROVAL_REQUIRED when discount exceeds max allowed threshold (2.5658ms)
✔ Commercial Pricing Engine Domain Service Tests (15.2743ms)
▶ 05I-DF-B1 architectural guardrails
  ✔ does not introduce CALCULATED lifecycle (0.8612ms)
  ✔ keeps the calculation engine free of Prisma and HTTP (0.4555ms)
  ✔ B1 snapshot mapper does not invent Forklifting or 6100 behavior (0.3605ms)
  ✔ B1 repository does not call D365 or treat container preference as suitability (0.4257ms)
✔ 05I-DF-B1 architectural guardrails (2.8422ms)
▶ 05I-DF-B2 architectural guardrails
  ✔ does not introduce CALCULATED lifecycle (1.2505ms)
  ✔ keeps the Rolling engine free of I/O, clocks, and randomness (0.4542ms)
  ✔ aggregation rules are pure and do not invent Forklifting or 6100 (0.4345ms)
  ✔ snapshot capture rejects client drum populations and does not call D365 (0.3641ms)
  ✔ calculation mapper has no Prisma or HTTP (0.2978ms)
  ✔ physical allocations stay PHYSICAL (0.095ms)
✔ 05I-DF-B2 architectural guardrails (3.7304ms)
▶ 05I-DF-B3 architectural guardrails
  ✔ does not introduce CALCULATED lifecycle (1.5684ms)
  ✔ keeps the integrity checker and mapper free of I/O, clocks, and randomness (1.7449ms)
  ✔ closes the public client-drum snapshot route (0.413ms)
  ✔ adds uniqueness for physical drum identity without a CALCULATED status (1.0707ms)
  ✔ line pointer alone cannot establish a multi-requirement population (0.6203ms)
  ✔ does not claim the calculation engine is unimplemented (0.6256ms)
  ✔ same snapshot and shuffled drum rows produce the same Rolling allocation (0.8465ms)
  ✔ mapper fails closed instead of coalescing null geometry to zero (0.2932ms)
✔ 05I-DF-B3 architectural guardrails (8.0825ms)
▶ 05I-DF-B4-A architectural guardrails
  ✔ does not introduce CALCULATED lifecycle or ShippingCostMaster (1.6736ms)
  ✔ LOCKED groups may receive successor snapshots; SUPERSEDED groups may not (0.3813ms)
  ✔ keeps membership rules free of Prisma and HTTP (0.3396ms)
✔ 05I-DF-B4-A architectural guardrails (3.3467ms)
▶ Container Study Rolling engine (05I-DE)
  ✔ is deterministic across repeated runs (1.7083ms)
  ✔ rejects Forklifting without Rolling fallback (0.1637ms)
  ✔ B2300M — SaaS 40 STD @ 12000 (NOT Excel 20 STD / 5900 parity) (0.1976ms)
  ✔ classifies B2300P as 40 HQ (0.1653ms)
  ✔ classifies B2600M as 40 HQ and B2600P as 40 Open Top (0.165ms)
  ✔ G10 weight gate yields unallocated WEIGHT_LIMIT (0.2137ms)
  ✔ G10B length gate yields unallocated DIMENSION_LIMIT (0.1346ms)
  ✔ G11A classifies 5900 mm drum as 40 Open Top without 6100 adjust (0.4744ms)
  ✔ G11B and G11C classify as 40 Open Top (0.3563ms)
  ✔ B1050M sets secondLayerEnabled in Africa without virtual allocations (0.4297ms)
  ✔ SL50M does not set secondLayerEnabled when small share below 50% (0.1806ms)
  ✔ G01 allocates all 185 drums with no silent loss (1.7642ms)
  ✔ enforces payload and dimension invariants on allocations (0.216ms)
  ✔ G09 low max weight scenario uses snapshot pins only (0.1163ms)
  ✔ rejects blocked algorithm version codes (0.2408ms)
✔ Container Study Rolling engine (05I-DE) (7.6767ms)
▶ Container Study shipment-gated requirement (A–J)
  ✔ A: shipment required + no container → BLOCK / SHIPMENT_CONFIGURATION_REQUIRED (0.8755ms)
  ✔ B: shipment required + container + rate available → CALCULATED with actual price (0.2219ms)
  ✔ C: shipment required + container + rate missing → physical ok, price 0, CALCULATED WITH WARNINGS (0.3225ms)
  ✔ D: VIP + shipment not required → Container Study may be skipped (0.1537ms)
  ✔ E: VIP + shipment required → container + Container Study required (0.1187ms)
  ✔ F: STANDARD + shipment required → container + Container Study required (0.1138ms)
  ✔ G: STANDARD + shipment not required → Container Study may be skipped (0.09ms)
  ✔ H: multiple container types display from persisted packing result (6.9636ms)
  ✔ I: historical snapshot facts remain unchanged (immutable presentation) (0.1677ms)
  ✔ J: no meaningless 0 / 0; VIP flag alone does not force optional; customer-safe (0.2468ms)
✔ Container Study shipment-gated requirement (A–J) (10.2182ms)
▶ containerStudyDrumPlanSnapshot
  ✔ resolves geometry from packing profile pins (0.5969ms)
  ✔ rejects non-positive packed height when height is represented (0.1072ms)
  ✔ builds snapshot drums when geometry and gross weight exist (0.2092ms)
  ✔ expands physical drum provenance for every instance (0.2574ms)
✔ containerStudyDrumPlanSnapshot (1.918ms)
▶ 05I-DF-B2 ENTIRE_INQUIRY aggregation rules
  ✔ includes every current CONFIRMED drum plan and ignores a client singleton override (1.2089ms)
  ✔ rejects ENTIRE_INQUIRY when any line lacks a CONFIRMED current plan (0.3512ms)
  ✔ PER_INQUIRY_LINE includes only the shipment-group line (0.3138ms)
  ✔ rejects a client drum plan from another line in PER_INQUIRY_LINE (0.2629ms)
  ✔ does not sum independent cutting lengths into a drum-selection input (0.1934ms)
  ✔ includes every requirement on a PER_INQUIRY_LINE commercial line (0.1599ms)
  ✔ ENTIRE_INQUIRY includes every requirement on every line (Cable A/B/C) (0.1541ms)
  ✔ DESTINATION_CLUSTER uses memberLineIds and excludes other inquiry lines (0.1862ms)
  ✔ fails closed when one requirement among many lacks a CONFIRMED plan (0.1862ms)
✔ 05I-DF-B2 ENTIRE_INQUIRY aggregation rules (3.9984ms)
▶ Container Study domain foundation (05I-DD)
  ✔ builds deterministic physicalDrumKey without random UUIDs (1.0359ms)
  ✔ rejects invalid lifecycle transitions (0.3588ms)
  ✔ blocks VALIDATED when dimensions are pending approval (0.2462ms)
  ✔ does not convert Forklifting to Rolling (0.1565ms)
  ✔ requires a calculation result before CONFIRMED (0.1429ms)
  ✔ rejects virtual physical allocations (0.119ms)
✔ Container Study domain foundation (05I-DD) (2.8328ms)
▶ Container Study 05I-DE hardening
  ✔ keeps calculation engine free of IO and non-deterministic dependencies (0.8563ms)
  ✔ pins and reads configuration status from snapshot parameters (0.1582ms)
  ✔ B2300M — SaaS 40 STD @ 12000 (NOT Excel 20 STD parity) (0.9931ms)
  ✔ remainingLength >= 6100 does NOT convert container to 20 STD (6100 rule blocked) (0.2454ms)
  ✔ repository create path has no CONTAINER_STUDY number-sequence Date.now fallback (0.564ms)
  ✔ failed engine output is not ok and produces no allocations (0.1488ms)
✔ Container Study 05I-DE hardening (3.8166ms)
▶ Container Study physical-drum compatibility
  ✔ V2 confirmed plan still expands to physical drums (1.0158ms)
  ✔ legacy/current physical schedule via compatibility path expands 1500×2+1000×1+800×3 to 6 drums / 6400 m (0.3311ms)
  ✔ cutting without drums requires a confirmed drum plan (0.1583ms)
  ✔ unconfirmed physical drums are visible but blocked until confirm (0.1952ms)
  ✔ empty schedule does not calculate and uses a clear missing-schedule message (0.1449ms)
  ✔ true lineage failure uses a support message, never V2 workflow wording (0.1512ms)
  ✔ customer isolation helper still rejects a foreign customer key (0.1108ms)
  ✔ customer-facing Container Study paths do not mention V2 configuration workflow records (0.9273ms)
✔ Container Study physical-drum compatibility (4.2653ms)
▶ 05I-DF-B3 snapshot input hardening
  ✔ rejects duplicate sourceLineId, non-positive geometry/weight, and non-integer quantity (0.9189ms)
  ✔ rejects missing lineage and drums without requirement provenance (0.1783ms)
  ✔ detects drum-plan drift by id set and version (0.2182ms)
✔ 05I-DF-B3 snapshot input hardening (2.0474ms)
▶ 05I-DF-B3 result integrity
  ✔ passes exact physicalDrumKey set conservation (0.7971ms)
  ✔ detects duplicate allocation, duplicate unallocated, intersection, unknown key, invalid instanceIndex, VIRTUAL, mismatch (0.4525ms)
  ✔ explains unallocated drums with dimensions, weight, and requirement provenance (0.1997ms)
  ✔ does not introduce CALCULATED as a structural status check (0.2332ms)
✔ 05I-DF-B3 result integrity (1.9177ms)
▶ 05I-DF-B4-A shipment group membership
  ✔ ENTIRE_INQUIRY materializes every inquiry line and rejects a subset (1.2082ms)
  ✔ PER_INQUIRY_LINE contains exactly one line (0.1432ms)
  ✔ DESTINATION_CLUSTER requires two or more shared-identity lines (0.1304ms)
  ✔ rejects mixed shipment identity on member hints (0.2158ms)
  ✔ LOCKED group identity cannot be mutated (0.1611ms)
  ✔ legacy fallback uses inquiryLineId then ENTIRE_INQUIRY all-lines (0.1634ms)
✔ 05I-DF-B4-A shipment group membership (2.7992ms)
▶ containerStudyShipmentGroupRules
  ✔ allows physical packing shipment groups without destination or incoterm (0.5499ms)
  ✔ requires inquiryLineId for PER_INQUIRY_LINE (0.3065ms)
  ✔ requires an explicit destination for PER_INQUIRY_LINE and does not invent one (0.1139ms)
  ✔ rejects client-declared container suitability (0.1639ms)
  ✔ parses allocation modes (0.107ms)
✔ containerStudyShipmentGroupRules (1.9748ms)
▶ costingCalculator
  ✔ stacks fixed and percent lines on a material base (0.6327ms)
  ✔ maps margin and scrap rows to layer inputs (0.1476ms)
✔ costingCalculator (1.4557ms)
▶ Costing document sequence format
  ✔ formats scrap SC26-00001 (0.5894ms)
  ✔ parses official sequence codes (0.8164ms)
✔ Costing document sequence format (2.1758ms)
▶ Synthetic costing codes
  ✔ detects increment RM and config codes (0.2847ms)
✔ Synthetic costing codes (0.3888ms)
▶ CostingEngine Domain Unit Tests
  ✔ calculates material line cost correctly for 1 km (0.8142ms)
  ✔ calculates material cost with ton-to-kg conversion when basis is PER_TON (0.126ms)
  ✔ normalizes 14600 USD/MT to 14.6 USD/kg for kg BOM consumption (0.0937ms)
  ✔ normalizes 4100 EUR/MT to 4.1 EUR/kg (0.0886ms)
  ✔ blocks PCS price against kg BOM (1.0393ms)
  ✔ does not apply scrap to Direct RM cost (0.2245ms)
  ✔ does not 1000× inflate an MT list price stored against kg consumption (0.2487ms)
  ✔ calculates multi-material total manufacturing material cost correctly (1.1278ms)
  ✔ does not add Premium, Shipping or Clearance into Direct RM Cost (Option B — LME/Base only) (0.3375ms)
  ✔ costs PCS BOM lines with an approved PER_PCS price and does not treat them as kg (0.2828ms)
  ✔ excludes end-cap packing from Direct Raw Material Cost even when a PCS price exists (0.2731ms)
  ✔ blocks calculation if engineering mapping is not APPROVED (0.1455ms)
  ✔ blocks calculation if BOM has unresolved conflict (0.1118ms)
✔ CostingEngine Domain Unit Tests (6.0101ms)
▶ Increment 14 formula assignment
  ✔ GLOBAL formulas apply to every cable (0.4943ms)
  ✔ FAMILY formulas apply only to matching family (0.1112ms)
  ✔ CABLE formulas override family and global for the same output (0.5334ms)
  ✔ keeps global formulas when no cable-specific output exists (0.105ms)
✔ Increment 14 formula assignment (1.9486ms)
▶ CostingDecimal
  ✔ 1. adds without float error (0.6758ms)
  ✔ 2. multiplies with precision (0.1552ms)
  ✔ 3. divides and throws on zero (0.2634ms)
✔ CostingDecimal (1.8013ms)
▶ CostingFormulaEngine — Tokenizer
  ✔ 4. tokenizes numbers, identifiers, operators (0.3505ms)
  ✔ 5. rejects empty expression (0.2464ms)
  ✔ 6. rejects unexpected characters (0.1451ms)
✔ CostingFormulaEngine — Tokenizer (0.9109ms)
▶ CostingFormulaEngine — Parser
  ✔ 7. respects operator precedence (0.3098ms)
  ✔ 8. parses parentheses (0.4172ms)
  ✔ 9. parses unary minus (0.1609ms)
✔ CostingFormulaEngine — Parser (1.0811ms)
▶ CostingFormulaEngine — Validation
  ✔ 10. detects unknown variable (0.2918ms)
  ✔ 11. detects inactive variable (0.1419ms)
  ✔ 12. detects self-reference (0.1013ms)
  ✔ 13. detects circular dependency (0.146ms)
✔ CostingFormulaEngine — Validation (0.7791ms)
▶ CostingFormulaEngine — Evaluator
  ✔ 14. evaluates ex-work formula (configurable, not hard-coded) (0.1785ms)
  ✔ 15. detects division by zero (0.1276ms)
  ✔ 16. detects missing variable value (0.1116ms)
✔ CostingFormulaEngine — Evaluator (0.497ms)
▶ CostingFormulaEngine — Security
  ✔ 17. rejects eval injection (0.1384ms)
  ✔ 18. rejects Function constructor (0.0978ms)
  ✔ 19. rejects semicolons and brackets (0.2624ms)
  ✔ 20. rejects require/import (0.0834ms)
✔ CostingFormulaEngine — Security (0.6651ms)
▶ CostingFormulaEngine — Trace
  ✔ 21. produces evaluation trace (0.1333ms)
✔ CostingFormulaEngine — Trace (0.8478ms)
▶ CostingFormulaEngine — Complex expressions
  ✔ 22. evaluates nested arithmetic (0.1412ms)
  ✔ 23. handles decimal literals (0.0677ms)
✔ CostingFormulaEngine — Complex expressions (0.2708ms)
▶ Costing V2 commercial pricing — markup/margin Decimal resolver
  ✔ 1. Cost 100 USD, Customer + Cable Family LV, MARGIN 20% → selling price 125 USD exact Decimal (1.8298ms)
  ✔ 2. Customer+Family MARGIN 20% plus more specific Customer+Cable MARKUP 25%; cost 100 → Customer+Cable wins, price 125 (0.3288ms)
  ✔ 3. Full precedence A Global, B Family, C Group+Family, D Customer+Family, E Group+Cable, F Customer+Cable (0.6932ms)
  ✔ 6. Margin 100% and >100% validation failure. No Infinity/NaN (6.8103ms)
  ✔ 7. Valid Costing V2 cost, no applicable rule → Costing valid conceptually, Pricing NOT_CONFIGURED, no fake selling price (0.337ms)
✔ Costing V2 commercial pricing — markup/margin Decimal resolver (10.8354ms)
▶ currencyConversion
  ✔ normalizes LE and EGP as equivalent (0.6046ms)
  ✔ returns 1 for same currency (0.1694ms)
  ✔ uses inquiry rawMaterialExchangeRate when price currency matches (0.1139ms)
  ✔ uses inquiry exchangeRate as fallback to target (0.0852ms)
  ✔ uses governed table when inquiry rates absent (1.3568ms)
  ✔ converts via company base when only USD/LE and EUR/LE rates exist (0.2004ms)
  ✔ blocks when no FX path exists (0.1006ms)
  ✔ treats LE and EGP as the same pair for governed rates (0.1364ms)
  ✔ consumes APPROVED governed rates and ignores DRAFT (0.1586ms)
  ✔ convertAmount applies rate to line cost (0.186ms)
✔ currencyConversion (4.0172ms)
▶ Customer cable catalog mapping
  ✔ parses category query params without inventing a Product Category column (0.6899ms)
  ✔ maps POWER/LV/MV from stored family keys and leaves CONTROL/SPECIAL as family contains (0.5427ms)
  ✔ caps page size to 25/50/100 and maps sort fields to Cable Master columns (0.1712ms)
  ✔ parses Energya description construction for display without rewriting masters (0.5241ms)
  ✔ prefers stored construction columns over description tokens (0.2789ms)
  ✔ expands conductor filter aliases and strips costing keys from catalog DTOs (0.2609ms)
  ✔ formats showing labels and compact pagination windows (11.329ms)
✔ Customer cable catalog mapping (14.6454ms)
▶ Customer service case domain
  ✔ documents a controlled category master and CS-YY-##### sequence (0.5372ms)
  ✔ maps list tabs to statuses and hides internal comments from customers (0.5821ms)
  ✔ forces customer comments to CUSTOMER visibility (0.1092ms)
  ✔ allows confirm/reopen only from resolved or closed (0.1034ms)
✔ Customer service case domain (2.1145ms)
▶ customer shipping cost resolution
  ✔ resolves the six Eland lane amounts from the seed definition (1.061ms)
  ✔ returns v1 inside the v1 window, v2 on and after v2, and not configured before v1 (0.2737ms)
  ✔ returns SHIPPING_COST_NOT_CONFIGURED and not zero when no rate covers the date (0.1745ms)
  ✔ copies shipping facts onto a commercial offer without changing selling totals (0.1009ms)
  ✔ D: maps destination-port code ROTTERDAM to shipping delivery-point Rotterdam (0.1832ms)
  ✔ E: Rotterdam CIF 20 SD resolves 1800 (0.1946ms)
  ✔ F: Rotterdam CIF 40 SD/HC resolves 2000 (0.1906ms)
  ✔ G: missing container type stays SHIPPING_COST_NOT_CONFIGURED (0.3305ms)
  ✔ J: Doncaster/SD or HC lanes stay unchanged (0.1615ms)
  ✔ K: Doncaster/RORO lanes stay unchanged (0.1615ms)
  ✔ DF-C: shipping lookup uses lineage dest and result typeCode, not preference or Alexandria metadata (0.3529ms)
✔ customer shipping cost resolution (4.22ms)
▶ Demo authentication production gate
  ✔ allows demo login only outside production (0.5181ms)
  ✔ does not simulate an authenticated identity in production (0.278ms)
  ✔ requires explicit ALLOW_DEMO_USERS or DEMO_SEED for persona seed (0.1142ms)
✔ Demo authentication production gate (1.5772ms)
▶ evaluateDrumPlanConfirmReadiness
  ✔ 1. Confirm is available when a valid draft drum plan exists (0.8317ms)
  ✔ 2. Confirm is blocked when physical drum coverage is incomplete (0.1966ms)
  ✔ 3. Confirm readiness becomes CONFIRMED only after an explicit confirm status (0.1475ms)
  ✔ 4. Confirmed plan cannot be edited in place (0.132ms)
  ✔ 5. Container Study can read the confirmed physical drum population (0.6624ms)
  ✔ 6. Multiple cutting lengths remain intact after confirmation (0.1478ms)
  ✔ 7. 1500 × 2 + 1000 × 1 + 800 × 3 = 6 physical drums (0.1895ms)
  ✔ 8. Readiness evaluation performs no database writes (0.1016ms)
  ✔ does not treat a missing inquiry/line as confirmable (0.1484ms)
✔ evaluateDrumPlanConfirmReadiness (3.5177ms)
▶ evaluateAutoConfirmDrumPlan
  ✔ A. cutting + valid drum + technical validation auto-confirms (0.2554ms)
  ✔ B. cutting without a drum does not auto-confirm (0.1109ms)
  ✔ C. drum without cutting does not auto-confirm (0.101ms)
  ✔ D. invalid capacity does not auto-confirm (0.0821ms)
  ✔ E. multiple allocations auto-confirm only when every required drum is selected (0.0877ms)
  ✔ does not treat UI selection as CONFIRMED until an explicit persisted confirm status (0.0921ms)
✔ evaluateAutoConfirmDrumPlan (0.927ms)
▶ B4-D financial offer aggregation helpers
  ✔ canonicalizes pin sets independently of order (7.4554ms)
  ✔ rejects mixed currencies without converting (0.1609ms)
  ✔ treats omitted caller pin lists as a match and explicit mismatches as stale (0.102ms)
  ✔ recognizes VIP process without making the warning customer-facing (0.088ms)
✔ B4-D financial offer aggregation helpers (8.5525ms)
▶ 05I-DF-B4-D architectural guardrails
  ✔ adds an immutable offer without a status machine, CostingRun FK, or inquiry-scoped pricing host (1.6313ms)
  ✔ enforces one current offer per inquiry in SQL, not only application code (0.4014ms)
  ✔ keeps aggregation free of FX, costing, live rates, and competing quotation JSON writes (0.5269ms)
  ✔ exposes create/read APIs without PATCH or DELETE (0.3208ms)
  ✔ does not leak financial offer aggregation into the costing engine freeze surface (0.365ms)
✔ 05I-DF-B4-D architectural guardrails (4.1056ms)
▶ global Incoterm Master
  ✔ 1. inquiry Incoterm lookup comes from the global Incoterm Master (1.0076ms)
  ✔ 2. all active global Incoterms are available for new selection (0.8179ms)
  ✔ 3. inactive Incoterms cannot be selected for a new inquiry (0.1552ms)
  ✔ 4. existing inquiry value remains readable if its Incoterm becomes inactive (0.1781ms)
  ✔ 5. inquiry CIF → Container Study CIF (0.1264ms)
  ✔ 6. inquiry DAP → Container Study DAP (0.107ms)
  ✔ 7. inquiry FOB → Container Study FOB when FOB exists on the master (0.2339ms)
  ✔ 8. customer preference does not override an explicit inquiry selection (0.1451ms)
  ✔ 9. no hardcoded DAP fallback (0.1767ms)
  ✔ 10. no localStorage Incoterm override (0.1858ms)
  ✔ 11. pricing reads inquiry Incoterm (0.1648ms)
  ✔ 12. logistics / shipping cost reads inquiry Incoterm (0.2227ms)
  ✔ 13. commercial offer reads inquiry Incoterm (0.3056ms)
  ✔ 14. historical quotation snapshot remains unchanged after master edit (0.1504ms)
  ✔ 15. physical container calculation does not change merely because Incoterm changes (0.2596ms)
  ✔ 16. no duplicate Incoterm master is created (0.9328ms)
  ✔ 17. ICC Incoterms 2020 catalog is exactly the official 11 codes (0.1545ms)
✔ global Incoterm Master (6.6583ms)
▶ imported catalog calculation authority — generic rule
  ✔ recognizes official Energya Cable Master source files (0.6641ms)
  ✔ treats numeric Energya identities as official imported cables (0.1583ms)
  ✔ A. multiple approved catalog + validated BOM structures calculate without V2 snapshot (0.5701ms)
  ✔ E/F. structural invalid BOM, conflicts, and unapproved catalog stay blocked without SNAPSHOT_REQUIRED (0.3714ms)
  ✔ G. VIP inquiry with catalog authority is ready without snapshot or shipment (0.5151ms)
  ✔ H. STANDARD engineering and costing lineage pass catalog cables without snapshot (0.5005ms)
  ✔ I. STANDARD still blocks genuine cutting/drum requirements when catalog authority is absent (0.1718ms)
  ✔ VIP calculate still requires snapshot when cable is not catalog-validated (0.148ms)
  ✔ L. calculation orchestrators do not fabricate V2 configuration snapshots (1.1344ms)
✔ imported catalog calculation authority — generic rule (5.2408ms)
▶ Container Study ENTIRE_INQUIRY physical population
  ✔ TEST 1 — ENTIRE_INQUIRY consumes all three lines (4+4+7=15), not first-line only (1.4864ms)
  ✔ TEST 2 — PER_INQUIRY_LINE consumes the selected line only (0.2175ms)
  ✔ TEST 3 — DESTINATION_CLUSTER consumes group members of that identity only (0.1469ms)
  ✔ TEST 4 — ContainerShipmentGroup.inquiryLineId is not authoritative for ENTIRE_INQUIRY (0.198ms)
  ✔ TEST 5 — physical drums are instances (2×1500 m = two 1500 m drums) (0.6586ms)
  ✔ TEST 6 — stale 4-drum snapshot must be recaptured against the 15-drum population (6.8159ms)
  ✔ TEST 7 — calculate creates a new snapshot identity; historical 4-drum identity is unchanged (0.2249ms)
  ✔ TEST 8 — DONCASTER / CIF do not block packing readiness (0.2991ms)
  ✔ TEST 9 — empty ENTIRE_INQUIRY membership falls back to all current inquiry lines and invents none (0.1833ms)
  ✔ TEST 10 — expanded instances carry inquiry / line / plan provenance (0.2063ms)
✔ Container Study ENTIRE_INQUIRY physical population (11.6568ms)
▶ Container Study physical packing independence (C01–C08)
  ✔ C01: dest DONCASTER + incoterm CIF calculates (0.7134ms)
  ✔ C02: dest NULL + CIF calculates (0.1088ms)
  ✔ C03: dest invalid/unconfigured + CIF calculates (0.1359ms)
  ✔ C04: dest NULL + incoterm NULL calculates when drum/engineering gates are valid (0.1364ms)
  ✔ C05: dest exists but no ShippingCostRate calculates (10.6875ms)
  ✔ C06: ShippingCostRate exists — packing unchanged and still no shipping cost (0.2783ms)
  ✔ C07: Container Study result contains no shipping cost (0.228ms)
  ✔ C08: financial/shipping calculation can consume confirmed CS result later (0.7351ms)
  ✔ H: missing shipping and missing destination do not block packing (0.2223ms)
✔ Container Study physical packing independence (C01–C08) (14.2099ms)
▶ inquiryContainerStudyPresentation
  ✔ 1. one confirmed drum expands to one physical drum (1.9618ms)
  ✔ 2. multiple drums from one requirement stay independent (0.2227ms)
  ✔ 3. multiple cutting-length requirements expand to six physical drums (0.2249ms)
  ✔ 4. physical drum population is preserved from plan lines and is not rebuilt from cable total (0.3288ms)
  ✔ 5. container calculation input uses each physical drum, not an aggregated length (0.16ms)
  ✔ 6. calculation mapping does not alter the drum plan (10.9603ms)
  ✔ 7. calculation mapping does not alter cutting lengths (0.1625ms)
  ✔ 8. calculation does not delete any physical drum (0.148ms)
  ✔ physical drum label uses Drum Master description, not code-only (0.4347ms)
  ✔ gross weight is cable weight for the cutting length plus empty drum weight (0.1878ms)
  ✔ gross weight stays Not Available when empty weight or cable weight is missing (0.1569ms)
  ✔ 9. unallocated drums are reported explicitly (0.1386ms)
  ✔ 10. invalid container master data blocks calculation readiness (0.2133ms)
  ✔ 11. recommendation comes from the calculation result, not a hardcoded type (0.0874ms)
  ✔ 12. selecting a container does not change drum selection (0.1676ms)
  ✔ 13. customer isolation rejects a foreign inquiry (0.0796ms)
  ✔ 14. historical result ids remain readable after a new result (0.0607ms)
  ✔ 15. recalculation creates a new result id and does not delete the previous one (0.0424ms)
  ✔ 16. confirmation fails when drums are unallocated (0.221ms)
  ✔ 17. no fabricated dimensions, volume, or cost (0.1994ms)
  ✔ 18. helpers do not perform database writes (0.1176ms)
  ✔ readiness requires confirmed drums and supported configuration, not destination (0.0787ms)
  ✔ missing destination does not invent a DestinationPort and does not block packing (0.2034ms)
  ✔ global Incoterm master dropdown is not restricted by Eland delivery preferences (0.2822ms)
  ✔ shipping cost stays blocked without a Customer Master destination even if packing rates exist (0.0997ms)
  ✔ inquiry destination identity DONCASTER is displayed without Customer Master as a packing gate (0.048ms)
  ✔ approved master selects never promote free-text Alexandria or FOB labels into master codes (0.2134ms)
  ✔ 1. inquiry Incoterm CIF is displayed by Container Study as CIF (0.134ms)
  ✔ 2. inquiry Incoterm DAP is displayed by Container Study as DAP (0.2944ms)
  ✔ 3. inquiry Incoterm FOB is displayed when FOB exists on the approved master (0.1069ms)
  ✔ 4. changing inquiry Incoterm from DAP to CIF updates Container Study to CIF (0.0596ms)
  ✔ 5. Container Study never falls back to DAP when current inquiry value is CIF (0.0541ms)
  ✔ 6. missing destination does not prevent physical packing calculation (0.0677ms)
  ✔ 7. Container Study presentation does not modify the inquiry Incoterm (0.0451ms)
  ✔ 8. no localStorage value overrides the current inquiry Incoterm (0.0511ms)
  ✔ 9. a stale ContainerStudyInputSnapshot is not the current display source (0.0598ms)
  ✔ inactive master Incoterm remains readable on an existing inquiry (0.1041ms)
  ✔ B: saved destinationPortCode ROTTERDAM resolves CS destination Rotterdam, not Alexandria (0.1486ms)
  ✔ C: Alexandria remains legacy free-text when no canonical destination is saved (0.1527ms)
  ✔ I: does not auto-select a default or first delivery combination (0.0689ms)
✔ inquiryContainerStudyPresentation (20.1878ms)
▶ inquiryDrumLineSummary
  ✔ derives drum count and total length from drum schedule rows (0.8677ms)
  ✔ falls back to drum master match when no schedule exists (0.7474ms)
  ✔ formats drum code and description for display (0.1626ms)
✔ inquiryDrumLineSummary (2.5685ms)
▶ inquiryDrumSchedule
  ✔ computes nominal line range from drum tolerance (0.7047ms)
  ✔ computes cable order length range from cable tolerance (0.1174ms)
  ✔ round-trips drum schedule JSON (0.6098ms)
  ✔ treats unconfirmed Version A rows as a current physical population (0.1656ms)
  ✔ expands 2×1500 m as two physical drum instances, not one 3000 m drum (0.1997ms)
  ✔ expands 1500×2 + 1000×1 + 800×3 into 6 physical drums totaling 6400 m (0.1409ms)
✔ inquiryDrumSchedule (2.7182ms)
▶ inquiryLineAttachments
  ✔ detects technical offer on line attachments (1.4645ms)
  ✔ allows internal technical office users to edit line attachments (0.2354ms)
✔ inquiryLineAttachments (3.524ms)
▶ computeInquiryLineTotalValue
  ✔ uses material cost when no other costing parameters are configured (0.6027ms)
  ✔ uses manufacturing total instead of double-counting material (0.1284ms)
  ✔ adds only configured logistics and packing amounts (0.0929ms)
  ✔ does not invent logistics or packing when amounts are missing (0.0991ms)
✔ computeInquiryLineTotalValue (1.7948ms)
▶ Inquiry metal pricing
  ✔ normalizes 14600 USD/MT inquiry copper to 14.6 USD/kg (0.8609ms)
  ✔ uses approved standard RM price in MT against kg BOM (0.5789ms)
  ✔ converts MT header price to kg consumption UOM (0.1058ms)
  ✔ uses inquiry header copper price instead of master price (0.8437ms)
  ✔ keeps inquiry-header copper in USD when the inquiry currency is EUR (0.1785ms)
  ✔ uses inquiry header aluminium price instead of master price (0.1928ms)
  ✔ blocks costing when copper header price is missing (0.5543ms)
  ✔ blocks costing when aluminium header price is missing for aluminium BOM line (0.2339ms)
  ✔ continues using raw material master for non-market materials (0.1688ms)
  ✔ calculates cable material cost with inquiry copper override (0.742ms)
  ✔ snapshots inquiry header metal prices for costing runs (0.6027ms)
  ✔ produces different material cost when inquiry copper price changes (0.3601ms)
✔ Inquiry metal pricing (6.4881ms)
▶ inquiryProcessResolver
  ✔ 1. customer override resolves VIP_FAST_TRACK (0.6379ms)
  ✔ 2. customer override resolves STANDARD_WORKFLOW (0.0998ms)
  ✔ 3. customer group default resolves when customer has no override (0.0797ms)
  ✔ 4. system default when customer and group unset (0.2399ms)
  ✔ 4b. classification resolves before group when customer has no override (0.0957ms)
  ✔ 4c. segment resolves after classification miss and before group (0.0967ms)
  ✔ 4d. customer override still wins over classification and segment (0.0768ms)
  ✔ 5. customer override wins over customer group (0.0745ms)
  ✔ 6. strips client process overrides from metadata (0.137ms)
  ✔ 7. applyInquiryProcessToMetadata pins immutable fields (1.4495ms)
  ✔ 8. preserveImmutableInquiryProcess blocks client re-assignment on update (0.141ms)
✔ inquiryProcessResolver (4.0633ms)
▶ inquiryProcessCommands
  ✔ 9. getInquiryProcessCode reads metadata (0.1866ms)
  ✔ 10. getInquiryProcessCode defaults to STANDARD_WORKFLOW (0.0525ms)
  ✔ 11. canSubmitInquiry true for STANDARD_WORKFLOW (0.0811ms)
  ✔ 12. canSubmitInquiry false for VIP_FAST_TRACK (0.0531ms)
  ✔ 13. canCalculateInquiry true for VIP_FAST_TRACK (0.0701ms)
  ✔ 14. canCalculateInquiry false for STANDARD_WORKFLOW (0.0341ms)
  ✔ 15. assertVipCalculateAllowed throws for STANDARD_WORKFLOW (0.2654ms)
  ✔ 16. assertStandardSubmitAllowed throws for VIP_FAST_TRACK (0.0873ms)
  ✔ readInquiryProcessFromMetadata round-trips assigned process (0.3192ms)
✔ inquiryProcessCommands (1.3448ms)
▶ LME official price import
  ✔ parses 11 rows, a blank US aluminium premium, and suspended molybdenum (1.0953ms)
  ✔ does not let other metals affect cable cost and does not publish unapproved rows (0.839ms)
  ✔ keeps a costing metal snapshot stable after a later published price (2.0391ms)
✔ LME official price import (4.7435ms)
▶ Market metal price defaults — domain
  ✔ parses ACTIVE copper/aluminium defaults as USD/MT (1.0124ms)
  ✔ copies active system defaults onto new inquiry metadata (1.3953ms)
  ✔ does not overwrite explicit create-time rates (inquiry override) (0.1554ms)
  ✔ marks INQUIRY_OVERRIDE on update when rate differs from create-time snapshot (0.2064ms)
  ✔ 7 costing uses inquiry override 16000 not system default (1.429ms)
  ✔ 8 costing uses inherited header 14600 when no override (0.2874ms)
  ✔ 9 market metal does not use RawMaterialPrice when header present (0.154ms)
  ✔ 10 non-market RM still uses RawMaterialPrice master (0.1395ms)
  ✔ 11 USD/MT converts to kg for consumption (14600 → 14.6) (0.1267ms)
  ✔ 12 Direct RM uses header metal price only (no premium/shipping/clearance in line) (0.2813ms)
  ✔ R traceability — inherited system default is labelled INQUIRY_SYSTEM_DEFAULT (0.2444ms)
  ✔ R traceability — inquiry override is labelled INQUIRY_OVERRIDE (0.2343ms)
  ✔ R traceability — missing header source falls back to INQUIRY_HEADER; standard RM stays RAW_MATERIAL_MASTER (0.1355ms)
  ✔ 13 snapshot preserves applied inquiry metal price (0.1149ms)
✔ Market metal price defaults — domain (6.9989ms)
▶ Metal cost component validation (master data only)
  ✔ defaults new records to Draft (1.0288ms)
  ✔ rejects negative values (0.357ms)
  ✔ rejects Effective To before From (0.2132ms)
  ✔ detects overlapping inclusive periods (0.1359ms)
  ✔ stores Percentage and Fixed Amount without converting them (0.1555ms)
✔ Metal cost component validation (master data only) (2.9385ms)
▶ priceUom
  ✔ canonicalizes KG, MT, PCS, and M (0.5963ms)
  ✔ normalizes 14600 USD/MT to 14.6 USD/kg (0.1685ms)
  ✔ normalizes 4100 EUR/MT to 4.1 EUR/kg (0.0966ms)
  ✔ normalizes 2600 EUR/MT to 2.6 EUR/kg (0.089ms)
  ✔ blocks PCS to KG conversion (0.0916ms)
  ✔ requires a price UOM (0.0739ms)
  ✔ shows equivalent per kg for UI (0.1331ms)
✔ priceUom (2.0472ms)
▶ suggestedClassificationFromCode
  ✔ classifies CR01 as inquiry-header copper (0.6676ms)
  ✔ classifies ALxxxx as inquiry-header aluminium (0.194ms)
  ✔ leaves end caps and aluminium tape as standard accessories (0.1737ms)
  ✔ classifies aluminium rod AR01 as inquiry-header aluminium (0.1049ms)
  ✔ leaves PVC compounds as standard (0.1021ms)
  ✔ excludes end-cap packing from Direct Raw Material Cost (0.1008ms)
✔ suggestedClassificationFromCode (2.152ms)
▶ 05I-DF-B4-C architectural guardrails
  ✔ adds an immutable snapshot without a status machine or CostingRun FK (1.6639ms)
  ✔ keeps snapshot persistence free of FX, costing engine, and live drum-plan re-eval (0.4669ms)
  ✔ exposes create/read APIs without PATCH or DELETE (0.3383ms)
  ✔ does not leak shipment cost into the costing engine freeze surface (0.3259ms)
✔ 05I-DF-B4-C architectural guardrails (3.5693ms)
▶ B4-C quantity aggregation
  ✔ counts physical containers by typeCode and sorts codes ascending (7.1909ms)
  ✔ does not use drumCountQ3 as the freight quantity (0.1191ms)
  ✔ fails closed on blank typeCode and empty containers (0.0848ms)
  ✔ rejects mixed currencies rather than converting (0.1145ms)
✔ B4-C quantity aggregation (8.2692ms)
▶ 05I-DF-B4-B architectural guardrails
  ✔ adds DestinationPort, Incoterm, and ShippingCostRate as B4-B masters (1.2518ms)
  ✔ keeps the resolver free of Prisma, FX, costing, and snapshots (0.3568ms)
  ✔ does not reuse costing logistics or metal shipping in the rate repository (0.3566ms)
✔ 05I-DF-B4-B architectural guardrails (2.6578ms)
▶ B4-B canonical codes
  ✔ normalizes trim and case; names are not identity (0.6388ms)
  ✔ inclusive date coverage and overlap (0.1219ms)
✔ B4-B canonical codes (1.3918ms)
▶ B4-B shipping rate resolver
  ✔ returns RATE_NOT_FOUND for zero covering rows (0.2511ms)
  ✔ returns SELECT for exactly one covering row (0.1142ms)
  ✔ returns RATE_AMBIGUOUS for overlapping covering rows and never picks one (0.1048ms)
  ✔ selects A on 10-Jan and B on 10-Feb in the Doc 48 example (0.0946ms)
  ✔ honours inclusive start and end and open-ended rates (0.1726ms)
  ✔ ignores inactive rows and does not convert currency (0.125ms)
  ✔ does not substitute another container type (0.1056ms)
✔ B4-B shipping rate resolver (1.2391ms)
▶ STANDARD_WORKFLOW readiness
  ✔ auto-clears engineering when snapshot is existing approved / valid (0.603ms)
  ✔ requires TO on TECHNICALLY_VALID_NOT_MASTER exception (0.15ms)
  ✔ imported catalog engineering is ready without a V2 snapshot (0.2354ms)
  ✔ does not fabricate cutting/drum evidence — missing lineage blocks costing (0.5523ms)
✔ STANDARD_WORKFLOW readiness (2.3618ms)
▶ Support chat scripted replies
  ✔ greets the signed-in first name without inventing a product spec (0.8125ms)
  ✔ answers approved chips and never invents a cable construction (0.6732ms)
  ✔ labels case types and engineer status for the customer UI (0.3246ms)
✔ Support chat scripted replies (3.0004ms)
▶ Authenticated profile field visibility
  ✔ shows company information to customers without internal-only fields or permissions (0.7352ms)
  ✔ shows role and internal organization fields to internal users (0.1485ms)
✔ Authenticated profile field visibility (1.6096ms)
▶ V2 Advanced Cable Search — query model
  ✔ trims and case-folds match mode without changing stored values (1.1387ms)
  ✔ builds exact / contains / startsWith Prisma filters (0.9043ms)
  ✔ caps customer page size and ignores unknown sort (0.3989ms)
  ✔ does not treat empty filters as a search (0.2226ms)
  ✔ strips costing keys from search hits (0.2821ms)
  ✔ documents PG fields that must not be invented as search columns (0.2128ms)
✔ V2 Advanced Cable Search — query model (4.2948ms)
▶ v2CostingRunService — request builder
  ✔ buildV2CostingRequestFromHandoff uses totalPlannedLengthM not legacy cutting fields (2.0965ms)
  ✔ rejects non-CONFIRMED drum plan handoff (0.1862ms)
  ✔ rejects missing cable material number (0.0999ms)
  ✔ documents Decision 5 as pending business sign-off (0.0816ms)
  ✔ does not import drum optimization modules (6.6283ms)
✔ v2CostingRunService — request builder (10.1558ms)
▶ v2CuttingLengthService
  ✔ computes symmetric tolerance bounds from nominal length (0.7194ms)
  ✔ returns VALID for nominal length within production envelope (0.2972ms)
  ✔ returns ERROR when snapshot is stale (0.1682ms)
  ✔ returns WARNING when below minimum production length (0.1529ms)
  ✔ builds deterministic drum handoff DTO from plan + snapshot (0.3392ms)
  ✔ marks handoff stale when line snapshot moved on (0.2684ms)
✔ v2CuttingLengthService (2.927ms)
▶ v2DrumPlanService
  ✔ maps handoff to cable engineering input (1.9687ms)
  ✔ rejects stale cutting plan id (0.4087ms)
  ✔ passes handoff tolerance to automatic optimizer (1.0471ms)
  ✔ reconciles quantity with explicit remainder (0.4377ms)
  ✔ maps authoritative plan to persist rows with engineering snapshot (0.4346ms)
  ✔ flags over-scheduled quantity as ERROR reconciliation (0.2114ms)
  ✔ does not treat requested drum count as a drum-type selection input (1.0503ms)
✔ v2DrumPlanService (6.4636ms)
▶ v2QuotationService
  ✔ defaults validity to 30 calendar days (1.9073ms)
  ✔ blocks price when BOM Gate 2 is open (0.3403ms)
  ✔ blocks issue when Decision 5 is unsigned (0.2432ms)
  ✔ allows issue only when a recorded Decision 5 sign-off is passed in (0.1715ms)
  ✔ detects issued quotations by issuedAt (0.0946ms)
✔ v2QuotationService (3.5417ms)
▶ versionADrumScheduleConfirm
  ✔ parses the existing Version A drum schedule without requiring a V2 snapshot (1.1786ms)
  ✔ confirms 1500×2 + 1000×1 + 2000×1 as 4 physical drums (0.4067ms)
  ✔ does not require a V2 configuration snapshot to confirm (0.4169ms)
  ✔ blocks confirm when a selected drum is not in Drum Master (0.1858ms)
  ✔ confirmed schedule cannot be edited in place (0.1587ms)
  ✔ Container Study reads confirmed Version A drums and does not say none exist (0.236ms)
  ✔ unresolved Alexandria does not block packing and does not clear the 4 physical drums (0.1878ms)
  ✔ helpers perform no database writes (0.1123ms)
✔ versionADrumScheduleConfirm (3.8156ms)
▶ workflowRuntimeService — domain
  ✔ parses governed transition conditions (0.9744ms)
  ✔ evaluates inquiryProcessCode and taskResult conditions (0.1264ms)
  ✔ lists outgoing transitions for current step (0.1065ms)
  ✔ assertTransitionAllowed rejects invalid transition (0.3273ms)
  ✔ assertTransitionAllowed enforces inquiry process condition on START (0.1153ms)
  ✔ documents workflow-to-inquiry status mapping hints (0.0813ms)
✔ workflowRuntimeService — domain (2.532ms)
▶ Task 04B-4 Audit authority & legacy telemetry
  ✔ Test 1: AuditEvent uses AUTHORITATIVE_SERVER_AUDIT — not POSTGRESQL_SOT (0.7309ms)
  ✔ Test 2: matrix marks audit authority established without POSTGRESQL_SOT promotion (0.1386ms)
  ✔ Test 3: does not promote sibling PRIMARY entities via audit authority task (0.1074ms)
  ✔ Test 4: PG audit events + LS stale telemetry → PG wins (0.1093ms)
  ✔ Test 5: PG empty + LS has events → empty PG wins (no resurrect) (0.4744ms)
  ✔ Test 6: PG unavailable + LS → fallback non-authoritative (0.1163ms)
  ✔ Test 7: legacy telemetry constants — LS never authoritative (0.0865ms)
  ✔ Test 8: registry matrix row documents immutability posture (no POSTGRESQL_SOT claim) (0.1814ms)
  ✔ Test 9: V1/V2 admin surfaces share server audit APIs (evidence flags) (0.1354ms)
  ✔ Test 10: failed PG read must not claim authoritative audit from legacy telemetry (0.15ms)
✔ Task 04B-4 Audit authority & legacy telemetry (3.1777ms)
▶ auditLogService
  ✔ appends immutable entries with who/what/when (1.9709ms)
  ✔ does not overwrite previous entries when appending (0.2261ms)
  ✔ exposes legacy telemetry constants (non-authoritative) (0.128ms)
✔ auditLogService (3.0444ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Task 04B-13 Cable BOM conflict governance
  ✖ Test A: all 81 official conflict groups preserved in PostgreSQL
  ✖ Test B: governance register lists every official conflict without loss
  ✖ Test C: every row uses lettered classification taxonomy A–L
  ✖ Test D: every row has an allowed governance disposition
  ✖ Test E: source CableBomLine volume preserved — no mass deletion
  ✖ Test F: no mass auto-approve — zero AUTO_RESOLVE_SAFE without explicit evidence
  ✖ Test G: cutover OUTCOME B — CableBomLine remains POSTGRESQL_PRIMARY
  ✖ Test H: import pipeline guard rejects silent conflict deletion or mass approval
  ✖ Test I: existing Technical Office governance register API remains authoritative
  ✖ Test J: workflow classifications remain on observations — governance is additive
  ✖ Test K: costing impact flagged BLOCKED or NO_SOURCE_LINE for unresolved conflicts
  ✖ Test L: bomVersion semantics unchanged — all conflicts at default version grain
  ✖ Test M: committed JSON register matches live PostgreSQL inventory
  ✖ Test N: promotion gates pass but entity not promoted — honest registry
  ✖ Test O: governance summary reports zero deleted records and OUTCOME B
  ✖ classifyBomConflictEvidence maps near-equal weights to TRUE_DUPLICATE
  ✖ dispositionForBomClassification never returns RETIRE_OBSOLETE without SOURCE_DATA_ERROR
✖ Task 04B-13 Cable BOM conflict governance (1.4935ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Task 04B-9 Cable BOM persistence remediation
  ✔ CableBomLine remains POSTGRESQL_PRIMARY — not promoted (0.6508ms)
  ✔ Gate C remediated — Excel Method-B no longer LS-only authoritative write (0.119ms)
  ✔ cutover matrix still not ready — governance debt blocks promotion (0.1965ms)
  ✔ ExcelMethodBCableBomUpload remediated to PG write path (0.0896ms)
  ✔ refuses LS-only saveCableBoms writes (mirrorAfterPgSuccess required) (0.5604ms)
  ✔ stale LS cannot override PG; PG failure is non-authoritative (0.3784ms)
  ✔ does not falsely promote sibling entities (0.2047ms)
  ✔ framework next cutover entity remains CableBomLine (0.1089ms)
  ✔ governance debt documented — BomDuplicateObservation not auto-resolved (0.2208ms)
  ✔ DRAFT/UNAPPROVED governed BOM must not be treated as POSTGRESQL_SOT (0.1507ms)
✔ Task 04B-9 Cable BOM persistence remediation (3.6973ms)
▶ Task 04B-9 Cable BOM PG write + audit evidence
  ✖ persistCableBomExcelCommit validates CableMaster + RawMaterial FKs
  ✖ persistCableBomExcelCommit writes whole-txn AuditEvent (entity CableBom)
  ✖ listBoms returns PG-backed rows after excel commit
  ✖ 81+ BomDuplicateObservation governance register preserved (not deleted)
  ✖ promotion still blocked after gate remediation
✖ Task 04B-9 Cable BOM PG write + audit evidence (1.0064ms)
▶ Task 04B-8/04B-9 Cable BOM SoT readiness (discovery — cutover blocked)
  ✔ CableBomLine remains POSTGRESQL_PRIMARY — not promoted (0.6216ms)
  ✔ cutover matrix marks Cable BOM not ready (04B-9 governance debt) (0.2084ms)
  ✔ ExcelMethodBCableBomUpload remediated — PG write path (04B-9) (0.1024ms)
  ✔ LS mirror is non-authoritative (gate E evidence) (0.0994ms)
  ✔ stale LS cannot override successful PG read (gates F/G) (0.1642ms)
  ✔ framework next cutover entity is CableBomLine (0.0819ms)
✔ Task 04B-8/04B-9 Cable BOM SoT readiness (discovery — cutover blocked) (2.074ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Task 04B-6 Cable Master persistence remediation
  ✔ CableMaster promoted to POSTGRESQL_SOT after 04B-7 formal reassessment (0.6277ms)
  ✔ matrix records 04B-7 Cable Master POSTGRESQL_SOT cutover (0.2232ms)
  ✔ refuses LS-only saveCableCatalog writes (mirrorAfterPgSuccess required) (0.3539ms)
  ✔ stale LS cannot override PG; empty PG beats LS; PG failure is non-authoritative (0.5308ms)
  ✔ selection engine offline fallbacks are explicitly non-authoritative (1.9744ms)
  ✔ resolveAllParsedCables / resolveAllMasterRecordsV2 expose PG-first contract (13.2332ms)
  ✔ does not falsely promote sibling entities (0.1573ms)
✔ Task 04B-6 Cable Master persistence remediation (17.9783ms)
▶ Task 04B-6 Cable Master PG write + audit evidence
  ✖ createCable writes AuditEvent (TCR/Excel path uses same repository)
  ✖ Gates A–J pass; CableMaster POSTGRESQL_SOT after 04B-7
✖ Task 04B-6 Cable Master PG write + audit evidence (1.0416ms)
▶ Task 04B-7 Cable Master SoT cutover (accepted)
  ✔ CableMaster promoted to POSTGRESQL_SOT after gates A–J pass (0.6253ms)
  ✔ cutover matrix marks Cable Master ready after 04B-7 (0.1237ms)
  ✔ LS mirror is non-authoritative (gate E evidence) (0.0818ms)
  ✔ stale LS cannot override successful PG read (gates F/G) (0.7067ms)
  ✔ does not falsely promote sibling entities (0.2893ms)
✔ Task 04B-7 Cable Master SoT cutover (accepted) (2.8008ms)
▶ Task 04B-6A Cable Master V1/V2 read-path convergence
  ✔ PG catalog affects V1 dynamic filter options (3.1033ms)
  ✔ stale LS cannot alter V1 results when PG catalog is injected (0.7555ms)
  ✔ empty PG cannot resurrect LS records in V1 filters or validation (0.2595ms)
  ✔ PG failure resolves to degraded non-authoritative fallback (0.1647ms)
  ✔ V1 and V2 produce equivalent candidate sets for the same PG catalog (0.764ms)
✔ Task 04B-6A Cable Master V1/V2 read-path convergence (5.978ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ CEO demo journey — login through quotation + security + low-code
  ✖ walks LOGIN→DASHBOARD→INQUIRY→CABLE→CUTTING→DRUM CONFIRMED→delivery→CS/costing/FO gates→isolation→low-code
✖ CEO demo journey — login through quotation + security + low-code (1.6566ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Task 05I dedicated E2E — Container Study → Costing → Standard Workflow
  ✖ A) STANDARD shipment required: saved combination → SG → confirmed drum → snapshot → CS result → pin → orchestrator readiness
  ✖ B) STANDARD no shipment: engineering/cutting/confirmed drum → costing/pricing path; CS not required
  ✖ C) fail-closed: missing SG, unconfirmed drum, snapshot missing, result missing, lineage mismatch, pin missing/mismatched
  ✖ D) historical: R1, CR1 pins R1, recalc R2, CR1 still R1, R1 immutable, R2 separate
  ✖ E) delivery authority: saved ROTTERDAM/CIF combination, not customer default, unsaved UI, Alexandria, or live metadata
  ✖ F) AUTH: customer cannot create/confirm SG, cannot advance Standard workflow, cannot list/get CostingRuns; Logistics owns SG
  ✖ G) VIP_FAST_TRACK: CS optional only without shipment; required when logistics active; metadata is not Standard SoT
  ✖ H) no live/latest: after snapshot/pin, live dest/drum/currentResultId changes do not rewrite CR1
✖ Task 05I dedicated E2E — Container Study → Costing → Standard Workflow (2.9201ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ Task 05I-DF-B1 — Shipment group + drum plan input snapshot
  ✖ happy path: confirmed drum → shipment group → study → immutable input snapshot with lineage
  ✖ rejects DRAFT drum plan for input snapshot
  ✖ rejects cross-customer container study input snapshot (IDOR)
  ✖ snapshot retains values after drum master change
  ✖ rejects missing shipment-group destination
  ✖ rejects client-declared container suitability
  ✖ rejects shipment group from another inquiry
  ✖ rejects drum plan from another inquiry
  ✖ rejects mismatched inquiry line vs drum plan
  ✖ rejects SUPERSEDED drum plan
  ✖ rejects client-supplied drum payload
  ✖ rejects snapshot mutation
  ✖ invalid configuration does not leave a snapshot pointer
  ✖ rejects missing drum packing/master geometry
✖ Task 05I-DF-B1 — Shipment group + drum plan input snapshot (1.985ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Task 05I-DF-B2 — ENTIRE_INQUIRY aggregation + Rolling calculation
  ✖ ENTIRE_INQUIRY snapshots all confirmed plans without aggregating cutting lengths
  ✖ PER_INQUIRY_LINE isolates a single confirmed drum plan
  ✖ rejects ENTIRE_INQUIRY when a line has no CONFIRMED drum plan
  ✖ rejects cross-customer calculation and result access (IDOR)
  ✖ plans multiple cutting lengths on one inquiry line independently
  ✖ does not change drum type when only requested drum count changes
  ✖ preserves physical drum lineage across multiple CL counts on one line
  ✖ ENTIRE_INQUIRY includes all requirements on three lines and fails closed if one confirmed plan is removed
  ✖ PER_INQUIRY_LINE includes every requirement on one line and excludes the other line
  ✖ snapshot physical drums follow confirmed plan lines, not requestedDrumCount
  ✖ historical drum master change does not mutate a captured snapshot
✖ Task 05I-DF-B2 — ENTIRE_INQUIRY aggregation + Rolling calculation (1.7994ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Task 05I-DF-B3 — Container Study validation and result hardening
  ✖ rejects the legacy client-drum snapshot endpoint and keeps B2 input-snapshot authoritative
  ✖ keeps multiple requirements independent and rejects line-pointer-only population
  ✖ VALIDATE succeeds without a result, does not change to CALCULATED, and uses the pinned configuration
  ✖ calculation creates a new result without changing status; failed integrity does not persist
  ✖ unallocated drums are explicit, explained, and block confirm
  ✖ CONFIRM requires VALIDATED + current result; DRAFT cannot confirm; stale drum plan is blocked
  ✖ customers may VIEW own studies and cannot mutate; other customers are isolated
  ✖ Forklifting remains fail-closed and Rolling golden algorithm is unchanged
✖ Task 05I-DF-B3 — Container Study validation and result hardening (2.0923ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Task 05I-DF-B4-A — Shipment Group Foundation
  ✖ ENTIRE_INQUIRY rejects mixed shipment identity and a subset of lines
  ✖ PER_INQUIRY_LINE contains exactly one line and dual-writes inquiryLineId
  ✖ DESTINATION_CLUSTER groups Lines 1+3 while Line 2 belongs to another destination group
  ✖ LOCKED group identity cannot be mutated; identity change requires a new group
  ✖ LOCKED group can receive a successor Container Study snapshot
  ✖ stale Drum Plan still blocks Container Study confirmation
  ✖ enforces customer isolation and RBAC on shipment-group commands
✖ Task 05I-DF-B4-A — Shipment Group Foundation (1.8437ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ Task 05I-DF-B4-B — Shipping Cost Master
  ✖ canonicalizes destination port codes and rejects case/whitespace duplicates
  ✖ canonicalizes incoterm codes including dap / DAP / padded
  ✖ audits destination port and incoterm create
  ✖ creates a valid shipping cost rate and rejects unknown/inactive masters and invalid amounts
  ✖ rejects overlapping active rates and preserves history when closing then inserting
  ✖ resolves 0/1/>1, inclusive bounds, open-ended, inactive, and canonical codes
  ✖ audits rate create, date change, and deactivate
  ✖ rejects inactive destination on new rate writes and still resolves historical rates
  ✖ denies customers and container-study-only users
✖ Task 05I-DF-B4-B — Shipping Cost Master (2.834ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Task 05I-DF-B4-C — Shipment Cost Snapshot
  ✖ creates a snapshot from confirmed-result container counts, ignoring client quantities
  ✖ is idempotent for the same confirmed result and rejects a competing as-of date
  ✖ rejects DRAFT, SUPERSEDED, non-current result, unallocated, and blank typeCode
  ✖ fails closed on RATE_NOT_FOUND, RATE_AMBIGUOUS, and mixed currencies without persisting
  ✖ denies customers, allows CONFIRM-only create, and has no PATCH/DELETE
  ✖ serializes concurrent creates to one snapshot via unique containerStudyResultId
  ✖ rejects a mismatched shipmentGroupId
  ✖ rolls back the snapshot when appendServerAuditTx throws inside the transaction
✖ Task 05I-DF-B4-C — Shipment Cost Snapshot (1.8886ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ Task 05I-DF-B4-D — Financial Offer Snapshot
  ✖ aggregates copied pricing + B4-C totals and does not write commercialOfferSnapshot
  ✖ is idempotent for the same pin set and freezes copied amounts if live pricing later changes
  ✖ refuses a pricing snapshot from another inquiry
  ✖ refuses a superseded shipment group and an unrelated B4-C snapshot
  ✖ fails closed on mixed currencies and persists nothing
  ✖ treats a superseded quotation version pin as stale pricing
  ✖ stores VIP_SHIPMENT_NOT_CONFIGURED internally with shipment total 0
  ✖ STANDARD workflow calculates 0 + warning when an included group has no B4-C snapshot
  ✖ sums multiple included groups without allocating freight into cable unit price
  ✖ enforces at most one isCurrent offer per inquiry at PostgreSQL
  ✖ denies customers and has no PATCH surface
✖ Task 05I-DF-B4-D — Financial Offer Snapshot (1.8608ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Task 05I-DF-B — Shipment Group + confirmed Drum Plan → immutable input snapshot
  ✖ 01 create SG from valid saved combination
  ✖ 02 destination from SAVED inquiry
  ✖ 03 customer default NOT used
  ✖ 04 unsaved UI destination cannot influence persisted SG
  ✖ 05 SG with confirmed Drum Plan → snapshot
  ✖ 06 reject snapshot if drum plan not CONFIRMED
  ✖ 07 reject if drum plan missing
  ✖ 08 drum plan ID/version provenance
  ✖ 09 every physical drum has traceable provenance
  ✖ 10 copied drum/calculation inputs persisted
  ✖ 11 snapshot cannot be mutated after create
  ✖ 12 confirmed SG cannot be silently mutated
  ✖ 13 mixed destinations → separate SGs
  ✖ 14 ENTIRE_INQUIRY
  ✖ 15 PER_INQUIRY_LINE
  ✖ 16 auth: customer cannot authoritative SG lifecycle
  ✖ 17 audit events
  ✖ 18 regression INQ26-06065: saved ROTTERDAM/CIF; SG reads ROTTERDAM not Alexandria
✖ Task 05I-DF-B — Shipment Group + confirmed Drum Plan → immutable input snapshot (2.1475ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Task 05I-DF-C — bind Container Study calculation + shipping to immutable snapshot
  ✖ calculation uses the immutable snapshot only after live dest, drums, packing, default, and preference change
  ✖ missing shipping grain stays SHIPPING_COST_NOT_CONFIGURED with amount 0 and does not block packing
  ✖ customer isolation is unchanged for calculate
✖ Task 05I-DF-C — bind Container Study calculation + shipping to immutable snapshot (1.7263ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ Task 05I-DF-D — CostingRun pins immutable ContainerStudyResult
  ✖ TEST 01 CostingRun can pin a valid ContainerStudyResult
  ✖ TEST 02 CostingRun stores the exact result ID
  ✖ TEST 03 CostingRun does not dynamically resolve latest result
  ✖ TEST 04 R1 pinned by C1 remains after CS recalc to R2
  ✖ TEST 05 New CostingRun may explicitly pin R2
  ✖ TEST 06 Missing required ContainerStudyResult blocks CostingRun
  ✖ TEST 07 Mismatched result/study is rejected
  ✖ TEST 08 Historical pinned result remains valid even when not current
  ✖ TEST 09 Live Inquiry destination changes do not affect an existing CostingRun
  ✖ TEST 10 Live Drum Plan changes do not affect an existing CostingRun
  ✖ TEST 11 Customer/default delivery changes do not affect an existing CostingRun
  ✖ TEST 12 Shipping dependency remains bound to the pinned result
  ✖ TEST 13 Customer cannot access internal costing
  ✖ TEST 14 Audit event is generated
✖ Task 05I-DF-D — CostingRun pins immutable ContainerStudyResult (2.0711ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Task 05I-DF-E — Standard Workflow Container Study integration
  ✔ 1. Standard without shipment can proceed without CS (1.0981ms)
  ✔ 2. Standard requiring shipment blocked without Shipment Group (0.1365ms)
  ✔ 3. Blocked without confirmed Drum Plan (0.1114ms)
  ✔ 4. Blocked without snapshot (0.0917ms)
  ✔ 5. Blocked without ContainerStudyResult (0.1004ms)
  ✔ 6. Result enables CS readiness gate (0.1378ms)
  ✔ 7. CostingRun must pin required result (0.1057ms)
  ✔ 8. New result does not silently repoint existing CostingRun (0.0949ms)
  ✔ 9. Historical CostingRun valid after CS recalc (0.127ms)
  ✔ 10. Fail closed when required dependency missing/mismatched (0.311ms)
  ✔ 11. VIP_FAST_TRACK: CS required when shipment/logistics active; optional when not (0.3446ms)
  ✔ metadata CONTAINER_STUDY_READY is not a Standard substitute for persisted CS state (0.1544ms)
✔ Task 05I-DF-E — Standard Workflow Container Study integration (3.9047ms)
▶ Task 05I-DF-E — persisted Standard gate + customer isolation
  ✖ persisted shipment group without snapshot blocks Standard orchestrator (not metadata)
  ✖ 7–9 persisted: pin required, no silent repoint, historical pin remains
  ✖ 12. Customer cannot mutate Standard workflow readiness
✖ Task 05I-DF-E — persisted Standard gate + customer isolation (1.1837ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Task 05I-DF-F — invariants (domain, no live CS lookup)
  ✔ immutable snapshot / result: Standard fails closed without snapshot or matching result (0.84ms)
  ✔ write-once CostingRun pin never silently repoints (0.1951ms)
  ✔ historical CostingRun pin remains valid after CS recalc (0.1587ms)
  ✔ fail-closed: missing SG, unbound study, missing result lineage (0.1297ms)
  ✔ Standard no-shipment does not require CS (0.375ms)
  ✔ Standard shipment-required uses persisted DF-B/C/D facts, not CONTAINER_STUDY_READY metadata (0.199ms)
  ✔ VIP_FAST_TRACK: CS required when logistics active; optional only with no shipment path (0.1826ms)
  ✔ customer auth: cannot create/confirm SG, cannot run internal costing, cannot transition workflow (0.4126ms)
✔ Task 05I-DF-F — invariants (domain, no live CS lookup) (3.4141ms)
▶ Task 05I-DF-F — persisted hardening
  ✖ immutable snapshot: PUT/PATCH/second capture are 409
  ✖ immutable historical result: recalc creates a new row; old result unchanged; pin write-once
  ✖ Standard no-shipment orchestrator is not CS-blocked; shipment without snapshot is
  ✖ customer cannot create/confirm SG, cannot access internal costing, cannot mutate workflow
✖ Task 05I-DF-F — persisted hardening (1.4979ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Task 05I-DF-F2 — Financial Offer customer projection (domain)
  ✔ projects cable/shipping/summary and strips internal cost tokens (18.134ms)
  ✔ surfaces VIP zero shipping with a customer-visible warning (0.1662ms)
✔ Task 05I-DF-F2 — Financial Offer customer projection (domain) (18.9638ms)
▶ Task 05I-DF-F2 — Financial Offer + customer visibility
  ✖ creates FO pinning exact pricing and shipment snapshots with inquiry total
  ✖ customer-safe current FO hides internals and copies pinned commercial totals
  ✖ fails closed on mixed currency and does not persist an offer
  ✖ keeps F1 immutable when later pricing/shipping/CS facts change; F2 is a new snapshot
  ✖ pins shipment snapshots for PER_INQUIRY_LINE groups without live rate lookup
  ✖ creates STANDARD no-shipment FO without ShipmentCostSnapshot when no groups exist
  ✖ sums persisted shipment snapshots for DESTINATION_CLUSTER without regrouping
  ✖ VIP no-shipment stores zero + warning; customer sees notice, not internal costing
  ✖ customer auth: own FO/CS yes; mutate CS/SG no; costing and live shipment APIs no
✖ Task 05I-DF-F2 — Financial Offer + customer visibility (1.1499ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Task 05I-DD — Container Study persistence foundation
  ✖ seeds catalog types without production dimensions and pending approval
  ✖ creates study, snapshots, and enforces lifecycle + missing master data
  ✖ versions container master, packing profile, and algorithm configuration with audit
  ✖ pins snapshot versions, refuses Forklifting calculate, and blocks confirmed mutation / referenced delete
  ✖ supersedes a study and allocates CONTAINER_STUDY numbers
✖ Task 05I-DD — Container Study persistence foundation (1.7468ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ Container Study Version A compatibility
  ✖ confirmed Version A schedule loads physical drums without a V2 workflow error
  ✖ unconfirmed Version A drums are visible and calculate is blocked until confirm
  ✖ cutting without drums requires a confirmed drum plan
  ✖ empty inquiry returns no calculation and a missing-schedule message
  ✖ customer isolation blocks a foreign Version A inquiry
  ✖ confirmed Version A calculate produces container options from physical drums
✖ Container Study Version A compatibility (1.6672ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ Task 05G — customer portal journey
  ✖ customer can login and list own V2 inquiries
  ✖ customer can fetch own inquiry detail
  ✖ IDOR: customer B cannot read customer A inquiry
  ✖ customer cannot access internal costing runs
  ✖ customer cannot mutate quotations
  ✖ customer quotation readiness is internal-only
  ✖ customer can list commitments scoped to own customer
✖ Task 05G — customer portal journey (1.5834ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Task 04B-11 Drum Master persistence remediation
  ✔ A — DrumMaster promoted to POSTGRESQL_SOT after 04B-12 reassessment (0.6422ms)
  ✔ B — Gate C remediated — import + full PG CRUD paths (0.1207ms)
  ✔ C — cutover matrix ready — DrumCompatibility decoupled from Drum Master promotion (0.1192ms)
  ✔ D — commitDrums maps Clearance / MaxLoad / Empty weight from Excel (1.2468ms)
  ✔ E — refuses LS-only saveDrumMaster writes (mirrorAfterPgSuccess required) (0.359ms)
  ✔ F — stale LS cannot override PG; PG failure is non-authoritative (0.1763ms)
  ✔ G — DrumCompatibility remains BLOCKED — not promoted (0.1177ms)
  ✔ H — drum optimization service does not mutate Drum Master (0.6386ms)
  ✔ J — TO defaults: Clearance 50 and MaxLoad from Capacity when absent (0.2293ms)
  ✔ K — deactivateDrum LS-only path is blocked (0.2238ms)
  ✔ L — all gates pass and promotion accepted (04B-12) (0.1054ms)
  ✔ M — commitDrums TO defaults when engineering columns blank (0.2669ms)
  ✔ N — framework next cutover entity remains CableBomLine (0.0719ms)
  ✔ O — DrumCompatibility 0 rows is downstream entity, not Drum Master prerequisite (0.0632ms)
✔ Task 04B-11 Drum Master persistence remediation (5.4194ms)
▶ Task 04B-11 Drum Master PG write + audit evidence
  ✖ I — createDrum writes AuditEvent (entity DrumMaster)
  ✖ listDrums returns PG-backed rows
✖ Task 04B-11 Drum Master PG write + audit evidence (0.933ms)
▶ Task 04B-12 Drum Master PostgreSQL SoT cutover
  ✔ promotes DrumMaster to POSTGRESQL_SOT with all gates A–J (0.6891ms)
  ✔ matrix marks Drum Master cutover ready without DrumCompatibility coupling (0.2232ms)
  ✔ DrumCompatibility remains BLOCKED — separate downstream entity (0.0979ms)
  ✔ does not promote sibling PRIMARY entities via Drum cutover (0.1426ms)
  ✔ LS mirror is non-authoritative (gate E evidence) (0.0866ms)
  ✔ stale LS cannot override successful PG read (gates F/G) (0.5562ms)
  ✔ framework next cutover entity remains CableBomLine (0.0939ms)
✔ Task 04B-12 Drum Master PostgreSQL SoT cutover (2.7347ms)
▶ Task 04B-10/04B-12 Drum Master SoT (04B-12 cutover accepted)
  ✔ DrumMaster promoted to POSTGRESQL_SOT after gates A–J pass (0.6795ms)
  ✔ cutover matrix marks Drum Master ready after 04B-12 (0.1298ms)
  ✔ DrumCompatibility remains BLOCKED — not promoted (0.0929ms)
  ✔ LS mirror is non-authoritative (gate E evidence) (0.0963ms)
  ✔ stale LS cannot override successful PG read (gates F/G) (0.5218ms)
  ✔ does not falsely promote sibling entities (0.1059ms)
✔ Task 04B-10/04B-12 Drum Master SoT (04B-12 cutover accepted) (2.4534ms)
▶ domainError
  ✔ does not map missing price to zero (0.5719ms)
  ✔ marks unsigned engineering rules as CONFIGURATION_REQUIRED (0.1107ms)
✔ domainError (1.3883ms)
▶ Task 04B-3 Import Batch PostgreSQL SoT cutover
  ✔ promotes ImportBatch to POSTGRESQL_SOT with all gates A–J (0.7367ms)
  ✔ matrix marks Import Batches cutover ready without blocking reason (0.1644ms)
  ✔ does not promote sibling PRIMARY entities via ImportBatch cutover (0.2499ms)
  ✔ Test 1: PG batch history + LS stale → PG wins (0.2814ms)
  ✔ Test 2: PG empty + LS has batches → empty PG wins (0.5944ms)
  ✔ Test 3: PG unavailable + LS → fallback non-authoritative (0.213ms)
  ✔ Test 4/5: LS mirror flag + LS-only batch save refused (0.6367ms)
  ✔ Test 6: memory store mirrors batch only when persist + explicit mirror flag for default path (1.1473ms)
  ✔ Test 7–8 evidence: V1/V2 share same Import Center API paths (0.1677ms)
  ✔ Test 9–10 evidence: security + audit gates recorded for ImportBatch (0.1933ms)
✔ Task 04B-3 Import Batch PostgreSQL SoT cutover (5.5529ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Task 05I-A — inquiry process foundation
  ✖ V1 create resolves customer override and audits process assignment
  ✖ V1 create uses customer group when no customer override
  ✖ V2 create resolves process from customer scope (IDOR-safe)
✖ Task 05I-A — inquiry process foundation (5003.0546ms)
▶ d365Adapters
  ✔ does not pretend D365 is connected (0.5872ms)
✔ d365Adapters (1.2767ms)
▶ Task 04A MasterDataSoT registry (honest statuses)
  ✔ marks Customer as POSTGRESQL_SOT with no LS authority (0.6974ms)
  ✔ does NOT claim BOM as POSTGRESQL_SOT yet; CableMaster and DrumMaster are POSTGRESQL_SOT; Audit uses server authority not SoT (0.2343ms)
  ✔ marks ImportBatch as POSTGRESQL_SOT after 04B-3 with LS mirror only (0.1656ms)
  ✔ marks RawMaterial as POSTGRESQL_SOT after 04B-2 with LS mirror only (0.128ms)
  ✔ keeps RawMaterialPrice / engineering / costing currencies as POSTGRESQL_SOT (0.1315ms)
  ✔ keeps incomplete / temporary / blocked entities out of postgresSoT (0.1905ms)
  ✔ exposes typed authority statuses without EAV (0.1799ms)
  ✔ classifies cable parameter / TCR / audit keys (0.1315ms)
✔ Task 04A MasterDataSoT registry (honest statuses) (2.9469ms)
▶ Task 04A preferPostgresMasterData (stale localStorage loses)
  ✔ uses PostgreSQL payload when ok, even if empty and localStorage is stale/full (1.1828ms)
  ✔ uses PostgreSQL current record over differing localStorage (0.1651ms)
  ✔ falls back to localStorage only when PostgreSQL read failed — non-authoritative (0.1047ms)
✔ Task 04A preferPostgresMasterData (stale localStorage loses) (1.6068ms)
▶ Task 04B-1 Master Data SoT cutover framework
  ✔ defines formal gates A–J without a second SoT registry (0.2141ms)
  ✔ keeps cutover matrix aligned to registry authority (no invented SoT) (0.1754ms)
  ✔ CableMaster promoted to POSTGRESQL_SOT after 04B-7 gates A–J (0.1181ms)
  ✔ documents stop conditions and recommended order without executing (0.0799ms)
  ✔ does not mark complex entities as POSTGRESQL_SOT via framework alone (0.0948ms)
✔ Task 04B-1 Master Data SoT cutover framework (0.8086ms)
▶ V2 Module IA (Task 03)
  ✔ groups navigable modules by category and excludes informational statuses (0.8539ms)
  ✔ builds workspace contracts with ERP surfaces and honest KPIs (0.5683ms)
  ✔ routes Engineering MD under Engineering — no separate Cable/Drum apps (0.1756ms)
  ✔ parses V2 module paths and breadcrumbs (0.7618ms)
  ✔ exposes ownership surfaces with owner module and permissions (0.4289ms)
  ✔ builds surface nav only for IMPLEMENTED/PARTIAL surfaces (0.1352ms)
  ✔ marks operational modules for LIVE/PARTIAL/FROZEN with navDefault (0.1111ms)
✔ V2 Module IA (Task 03) (4.0214ms)
▶ Master data service boundaries
  ✔ keeps single authorities for Customer/Costing/Pricing/BOM/Engineering (0.1497ms)
✔ Master data service boundaries (0.2513ms)
▶ Minimum notification catalog
  ✔ covers new inquiry, released order, readiness, approval/rejection, and issued offer (0.5067ms)
✔ Minimum notification catalog (1.1589ms)
▶ Task 04B-2 Raw Material PostgreSQL SoT cutover
  ✔ promotes RawMaterial to POSTGRESQL_SOT with all gates A–J (1.0029ms)
  ✔ matrix marks Raw Material cutover ready without blocking reason (0.2403ms)
  ✔ does not promote sibling PRIMARY entities via RM cutover (0.1593ms)
  ✔ Test 1: PG data + LS stale → PG wins (0.1795ms)
  ✔ Test 2: PG empty + LS has data → empty PG wins (0.5713ms)
  ✔ Test 3: PG unavailable + LS → fallback non-authoritative (0.1479ms)
  ✔ Test 4/5: LS mirror flag + LS-only deactivate refused (writes must be PG) (0.3418ms)
  ✔ Test 6–8 evidence: V1/V2/Costing share same SoT registry entity (0.1419ms)
  ✔ Test 9–10 evidence: security + audit gates recorded for RawMaterial (0.1192ms)
✔ Task 04B-2 Raw Material PostgreSQL SoT cutover (4.1313ms)
▶ Phase 10 reporting whitelist runtime
  ✔ does not enable a generic BI / SQL engine (0.5506ms)
  ✔ whitelists only governed count entities (0.1561ms)
  ✔ rejects cost/secret fields and unknown entities (0.3807ms)
  ✔ forbids customer-visible internal datasets (0.12ms)
  ✔ accepts inquiry status counts (0.0916ms)
✔ Phase 10 reporting whitelist runtime (2.1266ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ STANDARD_WORKFLOW quotation V2
  ✖ seeds TEST-STANDARD-001 without modifying ELAND
  ✖ customer create stamps V2 channel and STANDARD process from master
  ✖ submit without lines is rejected; customer cannot approve or issue
  ✖ submit with snapshot starts workflow, records timing, and stops at real lineage gate
  ✖ customer cannot see another customer notifications and cannot retry email
  ✖ email queue stays QUEUED without SMTP and FAILED send does not throw
  ✖ duplicate customer decision is rejected; unissued quotation is hidden
  ✖ internal my-tasks returns only real pending tasks
  ✖ internal return requires a reason and customers cannot return
  ✖ customer accept of an issued quotation creates existing CommercialCommitment
  ✖ TO exception evaluation is additive and does not invent snapshots
  ✖ customer notifications list is scoped to the actor
✖ STANDARD_WORKFLOW quotation V2 (5006.3341ms)
▶ V2 Advanced Cable Search UI
  ✔ keeps Standard Search first and opens Advanced Search by user action (1.0958ms)
  ✔ renders discovery copy, Select Cable, and Technical Office handoff (10.5716ms)
  ✔ does not wire V3 dependency files as a runtime engine (0.7365ms)
✔ V2 Advanced Cable Search UI (13.3065ms)
▶ Task 05A V2 Cable Configuration production readiness
  ✔ Test A: V2 routes and core modules exist (1.7868ms)
  ✔ Test B: V2 uses authoritative PG cable catalog contract (0.8163ms)
  ✔ Test C: single technical parameter engine — cableAuthority is sole match authority (0.673ms)
  ✔ Test D: configuration flow states map to governed terms (0.2196ms)
  ✔ Test E: BOM governance boundary blocks costing without silent LS fallback (0.4449ms)
  ✔ Test F: configuration snapshot preserves identity, params, engineering status, actor (0.4537ms)
  ✔ Test G: customer-facing evaluate route does not require cable master write RBAC (0.3702ms)
  ✔ Test H: internal Technical Office list enforces RBAC (0.3481ms)
  ✔ Test I: cable search supports customer isolation filter (0.5238ms)
  ✔ Test J: cutting length handoff gated on VALID + authoritative catalog (0.3725ms)
  ✔ Test K: drum selection handoff follows same gate as cutting length (0.1377ms)
  ✔ Test L: costing handoff blocked by BOM governance (verify gates only) (0.3922ms)
  ✔ Test M: LS inventory classified UI_STATE / CACHE / NON_AUTHORITATIVE / PROHIBITED (0.1177ms)
  ✔ Test N: server TCR mutation path exists (appendServerAudit via repository) (0.5703ms)
  ✔ Test O: V2 does not import SmartConfigurator as authority (0.8248ms)
  ✔ Test P: V2 does not import legacy V1 modal configurator as authority (0.7862ms)
  ✔ Test Q: Cable BOM governance debt preserved — no mass resolution (0.088ms)
  ✔ Test R: production readiness classifications per area (0.0893ms)
  ✔ Test S: documentation spec file exists with 24 sections (1.3424ms)
  ✔ mergeServerCableMatches prefers decision.matches over cable (0.383ms)
  ✔ evaluateDownstreamGates blocks all stages when INVALID (0.0845ms)
  ✔ evaluateCableConfigurationV2 integrates cableAuthority decision codes (0.5217ms)
✔ Task 05A V2 Cable Configuration production readiness (12.6553ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Task 05E — V2 costing run persistence
  ✖ requires CONFIRMED drum plan for costing preview
  ✖ preview is blocked by BOM Gate 2 (81 conflicts) with structured reasons
  ✖ records appendServerAudit on gate-blocked preview
  ✖ blocks IDOR on costing preview
  ✖ returns current run null before persist
  ✖ calculate does not persist when gates fail (immutability guard)
✖ Task 05E — V2 costing run persistence (1.5959ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Task 05C — V2 cutting length persistence
  ✖ creates versioned cutting plan linked to snapshot FK
  ✖ increments version on second plan persist
  ✖ rejects without snapshot and blocks IDOR
  ✖ returns deterministic handoff DTO
  ✖ blocks READY_FOR_COMMERCIAL without cutting plan per line
  ✖ records appendServerAudit on persist
✖ Task 05C — V2 cutting length persistence (1.8608ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Task 05D — V2 drum plan persistence
  ✖ returns ephemeral drum selection candidates
  ✖ creates versioned draft drum plan (automatic)
  ✖ increments version on second drum plan
  ✖ validates and confirms drum plan lifecycle
  ✖ rejects drum plan without cutting plan
  ✖ blocks IDOR on drum plan persist
  ✖ records appendServerAudit on drum plan persist
  ✖ creates manual multi-drum draft plan
✖ Task 05D — V2 drum plan persistence (1.5681ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ Task 05B — V2 inquiry configuration persistence
  ▶ domain workflow
    ✔ detects V2 inquiry metadata (0.5087ms)
    ✔ does not route Version A submit through V2 snapshot gates (0.1444ms)
    ✔ enforces legal status transitions (0.1929ms)
  ✔ domain workflow (1.3763ms)
  ▶ API + IDOR
    ✖ creates V2 inquiry with server-generated number
    ✖ persists line + snapshot in transaction and blocks cross-customer read (IDOR)
    ✖ submit requires snapshots and records engineering status
    ✖ POST /api/cables/evaluate applies customer scope from auth
    ✖ internal can list V2 inquiries with engineering summary
  ✖ API + IDOR (1.0624ms)
✖ Task 05B — V2 inquiry configuration persistence (3.0111ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ Phase 12 low-code — PlatformFieldDefinition (no EAV)
  ✖ refuses invented columns and costing entities
  ✖ keeps protected cost fields hidden from customers after overlay
  ✖ unauthenticated metadata mutation is 401
  ✖ customer and sales cannot mutate metadata
  ✖ admin can configure a typed field and runtime form/list metadata reflects it
  ✖ protected fields and invented EAV columns fail closed
✖ Phase 12 low-code — PlatformFieldDefinition (no EAV) (1.6972ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Phase 1 platform foundation — V2 deny-by-default
  ✖ unauthenticated GET /api/v2/boundary returns 401
  ✖ unauthenticated GET /api/v2/modules returns 401
  ✖ unauthenticated GET /api/v2/audit/events returns 401
  ✖ unauthenticated GET /api/v2/workflows/presentation returns 401
  ✖ unauthenticated GET /api/admin/platform/dashboard/kpis returns 401
  ✖ unauthenticated GET /api/admin/platform/reports returns 401
  ✖ unauthenticated GET /api/admin/platform/fields returns 401
  ✖ unauthenticated GET /api/v2/metadata/fields returns 401
  ✖ missing permission on audit is 403 not 401
  ✖ customer is forbidden from platform KPIs
  ✖ authorized internal may read boundary and KPIs
✖ Phase 1 platform foundation — V2 deny-by-default (1.5365ms)
▶ V2 Phases 1–11 closure evidence
  ✔ Phase 2 keeps CableBomLine off POSTGRESQL_SOT while 81 conflicts remain (0.6162ms)
  ✔ Phase 3 navigator excludes PLANNED/STUB/NOT_IMPLEMENTED fakes (0.1924ms)
  ✔ Phase 6 / 15 keep D365 honest (0.1958ms)
  ✔ Phase 10–11 keep BI and generic workflow engines off (0.1299ms)
  ✔ npm test still registers dedicated domain suites (0.7181ms)
✔ V2 Phases 1–11 closure evidence (2.7103ms)
▶ V2 module registry
  ✔ registers catalog modules 01–29 plus PLATFORM (0.5954ms)
  ✔ navigable modules exclude PLANNED/STUB/NOT_IMPLEMENTED fakes (0.2402ms)
  ✔ keeps single authorities — no duplicate customer/costing/pricing engines (0.1956ms)
  ✔ preserves V1 legacy workspace entries alongside V2 IA paths (0.0854ms)
✔ V2 module registry (1.8268ms)
▶ Data ownership matrix
  ✔ is machine-readable and freezes fulfillment + metal component (0.1489ms)
✔ Data ownership matrix (0.2261ms)
▶ EFFECTIVE ACCESS
  ✔ denies unauthenticated with 401 (0.2586ms)
  ✔ denies missing permission with 403 (0.233ms)
  ✔ allows when permission present (0.275ms)
  ✔ enforces customer scope (0.1336ms)
✔ EFFECTIVE ACCESS (1.0804ms)
▶ Metadata foundation (no EAV)
  ✔ merges PlatformFieldDefinition over inquiry manifest (6.6388ms)
✔ Metadata foundation (no EAV) (6.7064ms)
▶ Number sequence format
  ✔ formats prefix/year/serial tokens (1.3855ms)
✔ Number sequence format (1.4626ms)
▶ Task 04A Master Data SoT (stale localStorage loses to PostgreSQL)
  ✔ marks Customer as SoT and governed masters as PostgreSQL-primary without LS authority (0.624ms)
✔ Task 04A Master Data SoT (stale localStorage loses to PostgreSQL) (0.6876ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ V2 presentation pipeline — customer to quotation
  ✖ logs in and creates a VIP inquiry without a client process choice
  ✖ standard and advanced Cable Master search stay read-only
  ✖ runs automatic processing: engineering → costing → pricing → offer → quotation
✖ V2 presentation pipeline — customer to quotation (1.5985ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ Task 05F — V2 quotation persistence
  ✖ creates draft quotation with QUO_COMMERCIAL numbering and V2 lineage pins
  ✖ blocks pricing when BOM Gate 2 is open
  ✖ readiness reports Decision 5 status
  ✖ blocks issue until Decision 5 signed and gates pass
  ✖ rejects cross-customer IDOR on quotation fetch
  ✖ records appendServerAudit on quotation create
✖ Task 05F — V2 quotation persistence (1.6394ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Task 05I-C — VIP calculate readiness (unit)
  ✔ 1. default container study is CONTAINER_STUDY_REQUIRED (0.6412ms)
  ✔ 2. CONTAINER_STUDY_NOT_READY warns but does not block calculate (0.2196ms)
  ✔ 3. CONTAINER_STUDY_READY passes container gate (0.0836ms)
  ✔ 4. dev bypass documents explicit PO override only (0.1043ms)
  ✔ 5. missing configuration snapshot blocks line readiness (0.6256ms)
  ✔ 6. stale snapshot pointer blocks line readiness (0.1131ms)
  ✔ 7. invalid snapshot validation blocks line readiness (0.1258ms)
  ✔ 8. missing cutting plan blocks line readiness (0.0921ms)
  ✔ 9. cutting plan ERROR blocks line readiness (0.1081ms)
  ✔ 10. non-CONFIRMED drum plan blocks line readiness (0.3944ms)
  ✔ 11. BOM Gate 2 (81 conflicts) hard blocks line readiness (0.1858ms)
  ✔ 12. header commercial config missing blocks inquiry readiness (0.3017ms)
  ✔ 13. container study missing warns inquiry readiness but does not block (0.1413ms)
  ✔ 14. all pre-costing gates pass when header + container ready (0.1054ms)
  ✔ 15. inquiry with no lines is not ready (0.0707ms)
  ✔ 16. missing shipping → 0 + warning in optional components (0.2888ms)
  ✔ 17. missing container data → 0 + warning, not a readiness block (0.135ms)
  ✔ 18. missing premium → 0 + warning (0.0734ms)
  ✔ 19. not-applicable charge → 0 without warning (0.0777ms)
✔ Task 05I-C — VIP calculate readiness (unit) (4.9772ms)
▶ Task 05I-C — VIP calculate orchestrator (integration)
  ✖ 16. rejects STANDARD_WORKFLOW inquiry on VIP calculate route
  ✖ 20. container study no longer blocks VIP calculate (warns + proceeds)
  ✖ 21. blocks VIP calculate on BOM Gate 2 before costing
  ✖ 22. records VIP_CALCULATE_STARTED audit for container-warn path
  ✖ 23. container study alone does not produce CONTAINER_STUDY BLOCK gate
  ✖ 24. rejects cross-customer IDOR on VIP calculate
  ✖ 25. returns gate breakdown with Decision 5 info on response
  ✖ 26. pre-costing readiness passes when container study missing and BOM clear
  ✖ 27. VIP calculate advances to costing phase when pre-gates pass (may PARTIAL at costing)
  ✖ 28. warnings persisted on inquiry metadata when calculate completes
  ✖ 29. retry does not duplicate quotation draft
  ✖ 30. standard workflow submit path unchanged (regression)
  ✖ 31. completed calculate includes financialOffer when offer generation succeeds
✖ Task 05I-C — VIP calculate orchestrator (integration) (1.0923ms)
▶ Phase 11 workflow presentation metadata
  ✔ does not enable a generic workflow engine (0.5259ms)
  ✔ keeps VIP off the STANDARD_INQUIRY_V1 template (0.0968ms)
  ✔ covers STANDARD stages with labels and queues (0.1608ms)
  ✔ stays aligned with runtime inquiry status hints (0.0871ms)
✔ Phase 11 workflow presentation metadata (1.5852ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ Task 05I-B — workflow runtime foundation
  ✖ A — seeds STANDARD_INQUIRY_V1 template with version pin
  ✖ B — startWorkflow is idempotent for same entity
  ✖ C — rejects invalid transition from current step
  ✖ D — clarification loop transition path exists in template
  ✖ E — customer cannot perform internal transition
  ✖ F — customer isolation on workflow by-entity lookup
  ✖ G — inquiry submit starts workflow for STANDARD_WORKFLOW (integration hook)
  ✖ H — transition writes appendServerAudit trail
  ✖ I — getCurrentStep and getTasks endpoints
  ✖ J — assignTask updates assignment
  ✖ K — cancelWorkflow completes instance
  ✖ L — WORKFLOW_ADMIN lists templates
  ✖ M — pins template version on instance
  ✖ N — workflow events append-only history
  ✖ O — VIP fast track does not require workflow instance (boundary)
  ✖ P — RBAC WORKFLOW_VIEW for customer on own entity when scoped
  ✖ Q — completeTask with customer response auto-transitions
  ✖ R — inquiry business status separate from workflow step
✖ Task 05I-B — workflow runtime foundation (2.0312ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Approved Cable Master import validation stamp
  ✖ 1-5 imported official cable+BOM+lines are VALIDATED and can calculate without V2 snapshot
  ✖ 6 incomplete fixture import is not falsely validated
  ✖ 7 audit records approved MD import provenance
✖ Approved Cable Master import validation stamp (1.6121ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Increment 3 PostgreSQL Cable Master authority
  ✖ Test A/F: search and EXISTING_CABLE against persisted master (1.1909ms)
✖ Increment 3 PostgreSQL Cable Master authority (1.7936ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ commercial offer engine tests 1-27
  ✔ 1-13, 21, 23, 25: generates the Energya commercial offer with snapshot values (280.0319ms)
  ✔ 14-16: missing values, draft watermark, and configurable greeting (200.1999ms)
  ✖ 17-20, 22, 27: issued snapshot, isolation, costing hidden, print HTML, lifecycle unchanged (0.9292ms)
  ✔ 24, 26: multi-page table repeats headers and numbers pages (200.079ms)
  ✔ currency formatting is dynamic (0.4694ms)
✖ commercial offer engine tests 1-27 (682.9585ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Costing lineage durability
  ✖ deletes costing artifacts only for the named inquiry lines
  ✖ keeps a new fixture CostingRun through pricing and quotation, and does not rebuild QUO26-00320
✖ Costing lineage durability (1.4678ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Metal Cost Components master data
  ✖ customer cannot access metal cost components
  ✖ creates a Draft component and writes CREATED audit
  ✖ rejects negative values and invalid dates
  ✖ rejects inactive currency
  ✖ activates, then blocks overlapping active duplicate, then deactivates
  ✖ bulk upload validates and commits Draft only
  ✖ existing costing result is unchanged when Premium/Shipping/Clearance records exist
✖ Metal Cost Components master data (1.6477ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ CostingRun test teardown isolation
  ✖ removes only the test line and leaves a neighboring run, quotation link, and pricing snapshot
✖ CostingRun test teardown isolation (1.5579ms)
▶ Costing scrap rule resolution
  ✔ matches MATERIAL_CLASS to RawMaterial.category (0.7108ms)
  ✔ does not match MATERIAL_CLASS when category differs (0.1201ms)
  ✔ uses BOM line scrap % before any matching rule (0.0908ms)
  ✔ picks lowest priority among the winning specificity (0.0924ms)
  ✔ prefers MATERIAL_CLASS over GLOBAL even when GLOBAL has a lower priority number (0.0894ms)
  ✔ returns BUSINESS_RULE_REQUIRED when two ACTIVE rules share specificity, priority, and effective date (0.1937ms)
✔ Costing scrap rule resolution (2.0639ms)
▶ Costing V2 commercial pricing — effective dating and snapshot immutability
  ✖ 4. Effective dating: 20% through 2026-09-30, 22% from 2026-10-01, test-owned customer
  ✖ 5. Snapshot immutability: 20% snapshot stays 20% after master versions to 25%
✖ Costing V2 commercial pricing — effective dating and snapshot immutability (1.5792ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ Customer Cable Products catalog API
  ✖ requires sign-in
  ✖ lists Cable Master rows with server-side pagination and no costing leak
  ✖ maps category=MV from family/voltage without rewriting masters
  ✖ maps POWER as LV ∪ MV family keys
  ✖ returns live facets from Cable Master and documents unmapped category field
  ✖ exports customer-safe Excel without costing or BOM columns
✖ Customer Cable Products catalog API (1.4687ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Customer service cases — scope, visibility, commands
  ✖ creates a case from owned inquiry/line and rejects another customer inquiry
  ✖ blocks IDOR reads and keeps other-customer cases out of the list
  ✖ hides INTERNAL comments from the customer and allows customer comments
  ✖ rejects customer assignment and arbitrary status, then confirm/reopen
  ✖ does not list another customer inquiry on the reference endpoint
  ✖ opens scripted AI chat and blocks the other customer from that session
  ✖ requests an engineer by creating a Technical Support case
✖ Customer service cases — scope, visibility, commands (1.6634ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ customer shipping cost master
  ✖ resolves the six current Eland rates and treats customer and incoterm as foreign keys
  ✖ versions, audits, rejects in-place edits, and keeps the commercial snapshot
  ✖ maps ROTTERDAM to Rotterdam and resolves live Eland CIF 20 SD 1800 and 40 SD/HC 2000
✖ customer shipping cost master (1.5553ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Decision 5 sign-off then quotation issue
  ✖ refuses Decision 5 sign-off for a customer
  ✖ blocks issue while unsigned, then issues from the persisted run after an explicit sign-off
✖ Decision 5 sign-off then quotation issue (1.527ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ draft commercial offer
  ✔ labels a draft and keeps an issued document official (1.1609ms)
  ✖ generates a draft from the current quotation without freezing, emailing, or changing status (0.7453ms)
✖ draft commercial offer (2.6804ms)
▶ HTTP security headers and login rate limit
  ✔ sets nosniff and DENY frame headers (78.9834ms)
  ✔ rate-limits login when LOGIN_RATE_LIMIT=true (34.4273ms)
✔ HTTP security headers and login rate limit (114.2969ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ ICC Incoterms 2020 global master load
  ✖ upserts exactly the 11 ICC codes, preserving CIF and DAP row identity
  ✖ is idempotent and does not insert unexpected codes on a second run
  ✖ GET /api/inquiries/:id shipmentMasters.incoterms uses listApprovedShipmentMasters and contains all 11
  ✖ does not introduce a second Incoterm table or hardcoded selectable list
✖ ICC Incoterms 2020 global master load (1.5422ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ GET /api/auth/roles - pure read (no identity seed)
  ✔ GET /roles handler does not invoke ensureIdentitySeed (source) (1.0365ms)
  ✔ POST /login handler does not invoke ensureIdentitySeed (source) (0.3997ms)
  ▶ HTTP behavior
    ✖ returns active roles with the public contract (0.9443ms)
    ✔ returns empty roles when Prisma is unavailable (33.1086ms)
  ✖ HTTP behavior (51.6252ms)
✖ GET /api/auth/roles - pure read (no identity seed) (53.8149ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ Increment 10 — Costing Engine Calculation Foundation
  ✖ Test 1 & 2: Persist costing auto-approves DRAFT mapping; preview still reports ENGINEERING_NOT_APPROVED
  ✖ Test 3: Unresolved BOM conflict blocks costing calculation (Gate 2)
  ✖ Test 4: Consuming an unregistered raw material blocks costing (Gate 3)
  ✖ Test 5: Unpriced raw material blocks costing with PRICE_NOT_CONFIGURED (Gate 4)
  ✖ Test 6: Expired price relative to costing date blocks costing with PRICE_EXPIRED
  ✖ Test 7: Incompatible PCS price against kg BOM blocks without converting
  ✖ Test 8: EUR master price converts to USD inquiry currency via governed FX
  ✖ Test 9, 10, 11, 12, 13, 14, 15: Valid cable calculates material cost, aggregates multiple BOM lines, and captures exact revisions
  ✖ Test 16: Historical costing run snapshots remain immutable when master prices change
  ✖ Test 17: Recalculating a costing run creates a new run without overwriting historical run
  ✖ Test 18-22: Process/overhead remain NOT_CONFIGURED; Inc 13 orchestrator may apply governed scrap
  ✖ Test 23: Customer role is blocked with 403 UNAUTHORIZED from calculating costs
  ✖ Test 24: Costing calculation creates immutable AuditEvent entries
  ✖ Test 25: Master data, Cable Authority, BOM Governance, and Price Governance remain fully operational
✖ Increment 10 — Costing Engine Calculation Foundation (2.0177ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Increment 11 — Commercial Inquiry & Quotation Foundation
  ✖ Test 1: Customer creates commercial inquiry successfully
  ✖ Test 2 & 3: Customer ownership is strictly enforced server-side
  ✖ Test 4: Internal Sales can list and access all inquiries
  ✖ Test 5: Approved Cable Master is validated by Cable Authority and added as EXISTING_CABLE
  ✖ Test 6: Unapproved cable is not treated as EXISTING_CABLE for structured parameters
  ✖ Test 7: Technically valid unmapped cable creates and links a TechnicalOfficeRequest
  ✖ Test 8: Invalid cable configuration is rejected and blocked from inquiry addition
  ✖ Test 9: CONFIGURATION_REQUIRED blocks commercial line validation
  ✖ Test 10: Customer Master VIP Fast Track denies Standard SUBMIT
  ✖ Test 11 & 12: Sales creates Quotation V1 with frozen material cost snapshots
  ✖ Test 13 & 14: Creating quotation revision generates V2 and marks V1 as SUPERSEDED and immutable
  ✖ Test 15 & 16: Material cost is retrieved from Increment 10 costing architecture with transparent blocking reasons
  ✖ Test 17-20: Quotation initially creates with unconfigured selling price and null commercial status
  ✖ Test 21: Customer role is blocked from creating quotations directly (403 UNAUTHORIZED)
  ✖ Test 22: Commercial inquiry and quotation actions create immutable AuditEvent entries
  ✖ Test 23: Existing Cable Authority, BOM Governance, Price Governance, and Costing Engine remain intact
✖ Increment 11 — Commercial Inquiry & Quotation Foundation (1.551ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ Increment 12 — Inquiry UI persistence
  ✖ creates and reloads inquiry header from PostgreSQL
  ✖ updates inquiry header and persists changes
  ✖ persists incoterms and delivery destination on header update
  ✖ A: persists selected NETHERLANDS / CIF / ROTTERDAM combination through inquiry update
  ✖ internal user can update customer name on draft inquiry
  ✖ adds, duplicates, and deletes inquiry lines transactionally
  ✖ submits inquiry and creates immutable new version
  ✖ cancels inquiry and strips internal-only fields from customer projection
  ✖ submit snapshots published copper and aluminium when the header is empty
  ✖ customer create stamps scoped Customer Master name and ignores leftover client customerName
  ✖ clears and replaces the inquiry-line cable without deleting Cable Master
✖ Increment 12 — Inquiry UI persistence (1.5557ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Increment 12 — Commercial Pricing & Sales Margin Engine
  ✖ Test 1: Markup formula calculates Cost * (1 + Markup%) correctly
  ✖ Test 2: Gross margin formula calculates Cost / (1 - Margin%) correctly
  ✖ Test 3: Confirms Markup and Gross Margin produce mathematically distinct results for identical percentage
  ✖ Test 4: Invalid margin values >= 100% or < 0% are rejected
  ✖ Test 5: Negative markup percentage is rejected
  ✖ Test 6: Governed discount is subtracted from base selling price accurately
  ✖ Test 7: Discount > 100% or negative is rejected
  ✖ Test 8, 9, 10: Pricing precedence strictly resolves Customer+Cable over Customer over Global
  ✖ Test 11: Multiple active rules sharing identical scope and priority trigger PRICING_RULE_CONFLICT
  ✖ Test 12 & 13: Pricing rule past effectiveTo returns PRICING_RULE_EXPIRED
  ✖ Test 14: Approving an overlapping pricing rule period is blocked with PRICING_RULE_PERIOD_OVERLAP
  ✖ Test 15: Currency mismatch blocks pricing resolution without automated FX conversion
  ✖ Test 16: No matching pricing rule returns PRICING_NOT_CONFIGURED (no arbitrary fallback)
  ✖ Test 17 & 18: Discount exceeding maxDiscountAllowed marks quotation as PRICING_APPROVAL_REQUIRED
  ✖ Test 19: Authorized manager can approve commercial pricing on quotation
  ✖ Test 20 & 21: Customer role is blocked from creating/approving pricing rules (403 UNAUTHORIZED)
  ✖ Test 22: Historical CommercialPricingSnapshot remains frozen and immutable
  ✖ Test 23, 24, 25: Creating Quotation V2 revision leaves V1 pricing snapshot immutable
  ✖ Test 26, 27, 28: Underlying CostingRun and material cost remain strictly separate from selling price and discounts
  ✖ Test 30: Commercial pricing operations generate immutable AuditEvent records
  ✖ Test 31: Master data, Cable Authority, BOM Governance, Price Governance, and Costing Engine remain intact
✖ Increment 12 — Commercial Pricing & Sales Margin Engine (1.5707ms)
▶ Increment 12 pricing UI ownership
  ✔ keeps existing commercial pricing API routes unchanged (0.9313ms)
  ✔ hosts Pricing Rules in Costing and not in Technical Office (0.8745ms)
✔ Increment 12 pricing UI ownership (2.4847ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
ALLOW_DEV_IDENTITY_SEED is ignored in production; development identity seed will not run.
ADMIN_RESET_TOKEN_IN_RESPONSE is ignored in production; reset tokens are never returned.
▶ Increment 12 B1 — Hardening gate
  ✖ revoked refresh token cannot mint a new access token
  ✖ rotated refresh token cannot be reused
  ✖ locking a user revokes refresh and blocks authorization
  ✖ password reset ticket is hashed, single-use, and expires after use
  ✖ forgot-password does not reveal whether an email exists
  ✖ user cannot grant themselves a role or permissions on their own role
  ✖ non-admin cannot modify another user or grant SYSTEM_ADMINISTRATOR
  ✖ admin APIs return 401 unauthenticated and 403 unauthorized
  ✖ customer A cannot read or steal customer B inquiry or quotation via URL, query, or body
  ✖ B1 security audit events never contain passwords, JWTs, or reset tokens
  ✖ AuditEvent has no update or delete admin API
  ✖ GET /api/master/cables requires JWT
  ✖ POST /api/ai/assistant requires JWT before Gemini
✖ Increment 12 B1 — Hardening gate (1.6698ms)
▶ Production identity seed and reset-token guards
  ✔ demo-style identity seed cannot run in production even with ALLOW_DEV_IDENTITY_SEED (0.2852ms)
  ✔ ADMIN_RESET_TOKEN_IN_RESPONSE cannot take effect in production (0.1294ms)
  ✔ validateProductionAdminSeedPassword enforces explicit non-default password (0.3701ms)
  ✔ validateProductionJwtSecret rejects missing, default, and weak secrets (0.2151ms)
✔ Production identity seed and reset-token guards (1.1961ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Increment 12 B1 — Identity, login, and RBAC
  ✖ 1. Login with valid credentials
  ✖ 2. Invalid password returns 401
  ✖ 3. Inactive user cannot login
  ✖ 4. Locked user cannot login
  ✖ 5-6. Failed attempts increase and successful login resets them
  ✖ 7. Admin can create user
  ✖ 8. Non-admin receives 403
  ✖ 9. Admin can assign role
  ✖ 10. Unauthorized user cannot assign role
  ✖ 11. Permission enforcement works (granular codes)
  ✖ 12. User cannot elevate own role
  ✖ 13. Vertical privilege: ROLE_MANAGE without SYSTEM_ADMINISTRATOR cannot grant it
  ✖ 14. Password hash never appears in API response
  ✖ 15. Password hash never appears in audit
  ✖ 16. Existing customer isolation still works
  ✖ 17. Existing quotation authorization still works
  ✖ 18. Existing costing authorization still works
  ✖ 19. Existing BOM authorization still works
  ✖ 20. Existing Technical Office authorization still works
  ✖ Horizontal privilege escalation is blocked for customer isolation
  ✖ Unauthenticated admin API is 401
  ✖ Login accepts username as well as email
  ✖ Login without identifier or password is 400
  ✖ Expired access token cannot access /me
  ✖ Invalid token cannot access /me
  ✖ Customer session cannot access internal admin APIs
  ✖ Logout revokes refresh and /me for that session
  ✖ Change password requires authentication and current password
✖ Increment 12 B1 — Identity, login, and RBAC (2.0171ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Increment 12 B2 — Customer master & customer–user linkage
  ✖ creates a customer
  ✖ updates a customer
  ✖ deactivates a customer
  ✖ assigns a user to a customer (already assigned in setup) and lists customer users
  ✖ unauthorized user cannot create customer
  ✖ customer user cannot modify customer master
  ✖ customer A cannot create inquiry for customer B or manipulate customerId
  ✖ customer A cannot read customer B inquiries or quotations via URL/query
  ✖ customer A cannot assign itself to another customer
  ✖ internal sales can access authorized customers commercial records
  ✖ AuditEvent is generated for customer master and assignment
  ✖ existing inquiries remain accessible after migration
  ✖ existing quotation isolation remains intact for in-memory actors
✖ Increment 12 B2 — Customer master & customer–user linkage (1.6235ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Increment 12 B2.1 — Customer scope and session revocation
  ✖ TEST 1-2: Customer A cannot read Customer B inquiry by id/URL
  ✖ TEST 3: Customer A POST body customerId for B stays scoped to A
  ✖ TEST 4: Customer A query customerId for B does not list B inquiries
  ✖ TEST 5-6: Customer A cannot modify assignments or assign itself to B
  ✖ TEST 7: CUSTOMER_USER with multiple active assignments is denied without guessing
  ✖ TEST 8-9 and JWT replay: logout revokes access JWT immediately
  ✖ TEST 10: lock revokes access JWT immediately
  ✖ TEST 11: deactivate revokes access JWT immediately
  ✖ TEST 12-14: revoke or delete UserSession invalidates access JWT
  ✖ TEST 15-17: revoked/locked/deactivated refresh tokens fail
  ✖ TEST 18: password reset revokes prior access JWT
✖ Increment 12 B2.1 — Customer scope and session revocation (1.6237ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Increment 13 — BOM scrap per line
  ✖ lists cables with BOM for costing team
  ✖ returns governed BOM lines with consumption per km
  ✖ updates scrap percent on governed BOM line
  ✖ creates governed line from source BOM when saving scrap
  ✖ rejects invalid scrap rate
  ✖ denies customer from updating BOM scrap
  ✖ downloads cable scrap template and imports scrap by metal/family row
  ✖ uses BOM line scrap in costing preview when price and mapping exist
✖ Increment 13 — BOM scrap per line (1.5245ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Increment 13 — Costing Calculator preview API
  ✖ RBAC: admin can execute calculator preview permission
  ✖ RBAC: customer cannot execute calculator preview
  ✖ Calculator preview stacks scrap and margin on manual base
  ✖ Rejects invalid row basis
✖ Increment 13 — Costing Calculator preview API (1.5165ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ Increment 13 — Costing Formula Engine (Phase B+C)
  ✖ 24. RBAC: admin can view costing formulas
  ✖ 25. RBAC: customer cannot view costing formulas
  ✖ 26. RBAC: customer API request returns 403
  ✖ 27. Lists seeded system variables including MATERIAL_COST and EX_WORK_RATE
  ✖ 28. Lists seeded EX_WORK component (configurable, not hard-coded)
  ✖ 29. Creates costing configuration with initial version
  ✖ 30. Validates ex-work formula expression
  ✖ 31. Rejects unknown variable in validate
  ✖ 32. Preview evaluates without persisting
  ✖ 33. Creates formula with dependencies
  ✖ 34. Activates formula and creates audit event
  ✖ 35. Deactivates formula
  ✖ 36. Rejects malicious expression in validate
  ✖ 37. RBAC preview permission check
  ✖ 38. RBAC manage formulas permission
  ✖ 39. Creates custom variable in registry
  ✖ 40. Activates configuration version
✖ Increment 13 — Costing Formula Engine (Phase B+C) (2.3703ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Increment 13 — multi-currency FX costing
  ✖ converts USD RM price to LE inquiry currency via rawMaterialExchangeRate
  ✖ blocks costing when FX is not configured
  ✖ does not use DRAFT governed FX; APPROVED EGP→LE alias converts USD price to LE
✖ Increment 13 — multi-currency FX costing (1.5615ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Increment 13 — Phase D (Configuration UI + Orchestration)
  ✖ 1. normalizeCostingDate defaults to today
  ✖ 2. buildCostingRequestFromPreviewPayload requires materialNumber
  ✖ 3. buildCostingRequestFromPreviewPayload builds valid request
  ✖ 4. buildCostingRequestFromInquiryLine fails without material
  ✖ 5. buildCostingRequestFromInquiryLine builds from line
  ✖ 6. buildCostingRequestFromPreviewPayload rejects invalid quantity
  ✖ 7. RBAC: admin can manage scrap rules
  ✖ 8. RBAC: admin can approve scrap rules
  ✖ 9. RBAC: admin can execute preview
  ✖ 10. RBAC: admin can view audit
  ✖ 11. RBAC: customer cannot execute preview API
  ✖ 12. GET /methods returns configurations
  ✖ 13. GET /layers returns components
  ✖ 14. Creates configuration for workflow tests
  ✖ 15. Validates configuration version workflow
  ✖ 16. Submits configuration version
  ✖ 17. Approves configuration version
  ✖ 18. Activates configuration version
  ✖ 19. Creates scrap rule without rate (governed)
  ✖ 20. Lists scrap rules
  ✖ 21. Updates draft scrap rule with rate
  ✖ 22. Submits scrap rule
  ✖ 23. Approves scrap rule
  ✖ 24. Activates scrap rule
  ✖ 25. Scrap rule GET by id
  ✖ 26. Customer cannot list scrap rules
  ✖ 27. Creates formula for workflow
  ✖ 28. Submits formula
  ✖ 29. Approves formula
  ✖ 30. Preview NOT_READY without engineering approval
  ✖ 31. Preview API returns NOT_READY for unready cable
  ✖ 32. Preview rejects missing materialNumber
  ✖ 33. Preview NOT_READY for unknown cable
  ✖ 34. Seeds approved engineering mapping
  ✖ 35. Seeds governed BOM with scrap
  ✖ 36. Seeds approved price
  ✖ 37. Preview READY with material breakdown
  ✖ 38. Preview applies BOM line scrap source
  ✖ 39. GET /audit returns costing events
  ✖ 40. GET /approval-queue returns structure
  ✖ 41. Scrap rule activation creates audit event
  ✖ 42. Preview with active config evaluates layers
✖ Increment 13 — Phase D (Configuration UI + Orchestration) (1.6152ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Increment 13 — Phase E inquiry costing integration
  ✖ buildLayerInputsFromCommercialMetadata snapshots header metal rates
  ✖ buildCostingRequestFromInquiryLine passes header incoterms and destination
  ✖ buildCostingRequestFromInquiryLine passes cutting length and drum to orchestrator metadata
  ✖ calculateInquiryLineCost persists CostingCalculation when READY
  ✖ calculateInquiryLineCost returns DRUM_CONFIGURATION_REQUIRED when drum is not on Drum Master
  ✖ calculateInquiryLineCost auto-approves DRAFT engineering mapping
  ✖ calculateInquiryLineCost still blocks REJECTED engineering mapping
  ✖ getInquiryLineCosting returns breakdown snapshot
  ✖ customer projection hides internal costing fields including material cost
  ✖ updateInquiryLine marks costing stale on qty change
  ✖ applies configured logistics rule cost and does not invent unmatched shipping
  ✖ calculate without material number returns BOM_NOT_READY
  ✖ calculateInquiryCost runs every line and reports structured codes
  ✖ submitInquiry locks recalculation
  ✖ submitInquiry rejects mapped lines without calculation
  ✖ createQuotationFromInquiry copies costingCalculationId snapshot per line
  ✖ POST /api/inquiries/:id/calculate-cost is registered and does not 404
✖ Increment 13 — Phase E inquiry costing integration (1.8455ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Increment 14 — Costing Team workspace APIs
  ✖ customer cannot view costing configuration
  ✖ customer receives 403 on costing readiness summary
  ✖ readiness summary uses evaluateCableCostingReadiness domain counts
  ✖ readiness cables list is paginated and shaped
  ✖ readiness cable detail merges governance and engine probe
  ✖ production readiness live control is not PRODUCTION READY
  ✖ golden regression probe covers ENERGYA probe cables
  ✖ customer receives 403 on costing readiness
  ✖ admin preview does not persist a CostingCalculation
  ✖ readiness matrix covers the four ELAND regression cables without inventing totals
  ✖ approval queue includes raw material prices for Costing Team
  ✖ scrap rules flag undefined overlap as BUSINESS_RULE_REQUIRED
  ✖ variables include usedBy without inventing formula links
  ✖ lookups expose families, ACTIVE cables, and official RM only
  ✖ auto-assigns unique SC26-##### scrap codes and keeps explicit test codes
  ✖ workspace KPIs are live counts, not mock 256/212
  ✖ BOM costing validate uses orchestrator and does not persist
✖ Increment 14 — Costing Team workspace APIs (1.5031ms)
◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
▶ Increment 4 official source + BOM forensics
  ✔ reports official Cable List availability from data/source without modifying the file (0.9548ms)
  ✔ does not classify conflicting BOM weights as resolved (0.6686ms)
✔ Increment 4 official source + BOM forensics (2.315ms)
▶ Increment 4 Cable Master import pipeline
  ✔ detects duplicate material numbers and required-field errors (1.4124ms)
  ✔ rejects an unknown family reference instead of inventing it (0.4806ms)
✔ Increment 4 Cable Master import pipeline (2.0309ms)
▶ Increment 4 PostgreSQL readiness (fixture data only)
  ✖ imports the labeled fixture cable, searches it, and persists structured fields
  ✖ does not wipe family when Cable List reimport omits Family column
  ✖ Test A: fixture approved cable is EXISTING_CABLE
  ✖ Test A-official: identity-only lookup of a Cable List material is EXISTING_CABLE
  ✖ Test B: one valid parameter change is TECHNICALLY_VALID_NOT_MASTER
  ✖ Test C: invalid configuration is INVALID_CONFIGURATION
  ✖ Test D: missing FAMILY/CORE_COLOUR rule is CONFIGURATION_REQUIRED
  ✖ raw material CRUD, duplicate detection, blank price, and history without invented dates
  ✖ official Cable List is persisted (432) without fabricating rows
  ✖ BOM lines require Cable Master and Raw Material FKs
✖ Increment 4 PostgreSQL readiness (fixture data only) (1.3153ms)
▶ Increment 4 RBAC
  ✔ customers cannot import master data (4.9677ms)
✔ Increment 4 RBAC (5.0997ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Increment 5 engineering mapping (no silent approval)
  ✔ marks official diameter/weight as SOURCE and description tokens as Suggested only (0.9035ms)
  ✔ does not treat a complete suggestion set as COMPLETE mapping (0.3432ms)
✔ Increment 5 engineering mapping (no silent approval) (1.9209ms)
▶ Increment 5 PostgreSQL governance
  ✖ preserves all BOM conflict groups and does not overwrite weights on classification
  ✖ rejects an unknown BOM classification and does not delete the group
  ✖ does not match structured configurator fields against unmapped official cables
  ✖ keeps blank RM prices as PRICE_NOT_CONFIGURED and never stores zero
  ✖ reports material number unique and item/customer codes not unique
✖ Increment 5 PostgreSQL governance (0.9568ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Increment 6 — Engineering Mapping & Technical Office Approval Workflow
  ✖ Test 1: Cable with no approved mapping (DRAFT) evaluates to CONFIGURATION_REQUIRED for structured search
  ✖ Test 3: Draft mapping remains CONFIGURATION_REQUIRED and does not produce false EXISTING_CABLE
  ✖ Test 5: Approving mapping with invalid parameter compatibility is blocked with error
  ✖ Test 4: Rejected mapping evaluates to CONFIGURATION_REQUIRED
  ✖ Test 6: Customer role cannot edit or approve engineering mapping (403 UNAUTHORIZED)
  ✖ Test 7 & Test 2: Technical Office valid approval makes the mapping authoritative (EXISTING_CABLE)
  ✖ Test 8: Editing an approved mapping creates an immutable revision history
✖ Increment 6 — Engineering Mapping & Technical Office Approval Workflow (1.4845ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Increment 7 — Technical Office Engineering Workbench & Batch Approval
  ✖ Test 1: Excel mapping import parses and updates draft engineering mapping without changing CableMaster source values
  ✖ Test 2: Excel import with unknown Material Number fails validation and is rejected
  ✖ Test 3: Excel import with duplicate Material Number rows is rejected
  ✖ Test 4: Excel import with invalid parameter value is rejected
  ✖ Test 5: Excel import with incompatible Family/Voltage combination is rejected
  ✖ Test 6 & 7: Valid mappings in Draft status can be bulk validated and submitted
  ✖ Test 8: Customer attempting bulk approval is blocked with 403 UNAUTHORIZED
  ✖ Test 9 & 10: Authorized Technical Office Manager batch approval succeeds and creates one audit event per record
  ✖ Test 11 & 12: Updating an approved mapping creates Revision V2 while V1 remains immutable and approved
  ✖ Test 14: Cable Authority evaluates APPROVED mapping (testMat2) as EXISTING_CABLE
  ✖ Test 15: Cable in DRAFT status (testMat1 V2) evaluates to CONFIGURATION_REQUIRED
✖ Increment 7 — Technical Office Engineering Workbench & Batch Approval (1.5455ms)
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
▶ Increment 8 — BOM Governance & Material Consumption Review
  ✖ Test 1: All 81 conflict groups are preserved in BomDuplicateObservation without loss
  ✖ Test 2, 9, 10, 11: Original source weights and row counts remain preserved and immutable
  ✖ Test 3: Technical Office can classify conflict with governed category
  ✖ Test 4: Resolving conflict requires mandatory evidence according to classification category
  ✖ Test 5: Customer cannot approve BOM governance decision (403 UNAUTHORIZED)
  ✖ Test 6 & 7: Authorized Technical Office Manager approval creates GovernedBomLine and AuditEvent
  ✖ Test 8: Reopening an approved BOM conflict marks GovernedBomLine as UNDER_REVIEW
  ✖ Test 12: Source UOM (kg, PCS, m2) is preserved without fake conversions
  ✖ Test 13: Missing RM price (PRICE_NOT_CONFIGURED) blocks costing readiness
  ✖ Test 14: Cable with unapproved engineering mapping is NOT_READY or UNDER_REVIEW
  ✖ Test 15: Approved mapping + resolved BOM evaluated with transparent blocking reasons
  ✖ Test 16: Cable associated with an unresolved BOM conflict is flagged as CONFLICT_UNRESOLVED
  ✖ Test 17: Approved cable mapping continues evaluating to EXISTING_CABLE
✖ Increment 8 — BOM Governance & Material Consumption Review (1.5205ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ Increment 9 — Raw Material Price Governance & Costing Readiness
  ✖ Test 1: Create price draft proposals in DRAFT status
  ✖ Test 2: Blank price is rejected with PRICE_NOT_CONFIGURED
  ✖ Test 3: Zero price (price = 0) is rejected as INVALID_PRICE
  ✖ Test 4: Negative price is rejected as INVALID_PRICE
  ✖ Test 5: Unknown raw material code is rejected with RAW_MATERIAL_NOT_FOUND
  ✖ Test 6: Invalid currency string is rejected
  ✖ Test 7: Invalid UOM string is rejected
  ✖ Test 8: Effective From after Effective To is rejected
  ✖ Test 9: Overlapping approved price periods for identical parameters are detected
  ✖ Test 10: Submitting and approving a valid price updates workflowStatus to APPROVED
  ✖ Test 11: Adding a new price revision preserves historical approved price immutably
  ✖ Test 12: Price evaluation detects expired pricing when costing date is past effectiveTo
  ✖ Test 13: Correct price record selected matching specific costing date
  ✖ maps PCS BOM consumption to PER_PCS so piece items are not looked up as PER_KG
  ✖ Test 14: Unpriced raw material blocks costing readiness with PRICE_NOT_CONFIGURED
  ✖ mentions an existing DRAFT price instead of implying the material has no price row
  ✖ Test 15: Expired price blocks readiness evaluation
  ✖ Test 16: ton price is valid against kg BOM via governed MT→kg conversion
  ✖ Test 16b: PCS price is incompatible with kg BOM
  ✖ Test 17: Currency mismatch blocks readiness without automated FX conversion
  ✖ Test 18: Cable with unapproved engineering mapping is NOT_READY or UNDER_REVIEW
  ✖ Test 19: Cable with unapproved BOM conflict fails Gate 2 and is DATA_ISSUE
  ✖ Test 20: Cable satisfying all 4 gates is classified as READY_FOR_COSTING
  ✖ Test 21: Customer role blocked from modifying prices (403 UNAUTHORIZED)
  ✖ Test 22: Unauthorized role blocked from approving prices
  ✖ Test 23: Approving price creates immutable AuditEvent
  ✖ Test 24: Excel price import validates unknown RM and bad currency/price
  ✖ Test 25: Excel price import creates records in DRAFT status only
  ✖ Test 26: Platform components continue functioning with full governance integration
  ✖ Bulk approve only processes SUBMITTED prices and skips drafts
✖ Increment 9 — Raw Material Price Governance & Costing Readiness (1.6649ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ Market metal price defaults — admin + inquiry create
  ✖ customer cannot access market metal price defaults
  ✖ 1-2 GET active copper and aluminium defaults
  ✖ 3-4 new inquiry does not inherit an arbitrary system default
  ✖ 5 existing inquiry snapshot is unchanged when the system default changes
  ✖ 6 header override stays on the inquiry and is not replaced by the system default
  ✖ writes CREATED/ACTIVATED audit for market metal defaults
✖ Market metal price defaults — admin + inquiry create (1.6064ms)
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
▶ Increment 2 PostgreSQL master data
  ✖ reports database connectivity
  ✖ creates and reads a cable without inventing a sales price
  ✖ persists raw materials with PRICE_NOT_CONFIGURED and no zero price row
  ✖ Task 04: PostgreSQL cable wins over stale local payload
  ✖ Task 04: drum status update is PostgreSQL + AuditEvent
✖ Increment 2 PostgreSQL master data (1.414ms)
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
▶ Phase 1 — Quote-to-Cash domain (commitment / SO / agreement / release)
  ✖ rejects commercial approval without pricing approval
  ✖ DIRECT_ORDER: approve → commitment → multiple partial sales orders with remaining qty
  ✖ SALES_AGREEMENT: approve → commitment → agreement → releases with remaining qty tracking
  ✖ does not create commitment from non-approved quotation
  ✖ F: commercially approved revision is immutable (re-approve / reprice blocked)
  ✖ G: new revision after commercial approval resets approval on Vn+1; prior stays APPROVED
  ✖ H: SO snapshot independent of later quotation / line mutation
  ✖ I: duplicate direct-order create is idempotent (one document)
  ✖ J: duplicate agreement release is idempotent; over-release message includes qty breakdown
  ✖ K: fulfillment succeeds while D365 adapters remain NOT_IMPLEMENTED
  ✖ L: MTS → Direct Sales Order without quotation / Commercial Commitment
  ✖ M: prevent Direct MTS for MTO-only cables; allow MTS and MTO_MTS
  ✖ N: Direct MTS preserves drum/cutting; records DIRECT_MTS; idempotent; D365 NOT_IMPLEMENTED
✖ Phase 1 — Quote-to-Cash domain (commitment / SO / agreement / release) (1.8455ms)
▶ Production readiness control rules
  ✔ production readiness = blocked for current/fixture platform counts (0.89ms)
  ✔ production readiness = ready when all mandatory gates pass and Decision 5 is signed (0.1849ms)
  ✔ Decision 5 unsigned blocks READY even if master data and CI pass (0.15ms)
  ✔ one mandatory gate failing blocks READY (0.1529ms)
  ✔ does not report false PRODUCTION READY when tests/tsc are not verified (0.1248ms)
✔ Production readiness control rules (2.2529ms)
◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
▶ Quotation revision lookup
  ✖ one revision returns that revision selling price
  ✖ multiple revisions: number-only returns the original, and each versionNo returns its own price
  ✖ Version A and V2 sharing a quotation number each return their own selling price
  ✖ V2 with a pricing snapshot returns that snapshot price
  ✖ older revision does not return the latest selling price
  ✖ latest revision does not return the older selling price
  ✖ missing snapshot does not borrow another revision selling price
✖ Quotation revision lookup (1.6875ms)
▶ Cable Master RBAC
  ✔ Test E: customer cannot modify Cable Master (0.7158ms)
  ✔ Test F: internal authorized user may write/search Cable Master (0.1582ms)
✔ Cable Master RBAC (1.4823ms)
▶ Container Study RBAC
  ✔ customer cannot create container studies (0.1891ms)
  ✔ customer cannot calculate container studies (0.1372ms)
  ✔ customer may operate inquiry Container Study on their own inquiry (0.1112ms)
  ✔ customer still cannot use logistics create/calculate asserts (0.0875ms)
  ✔ customer cannot view logistics Container Study APIs even with VIEW (0.1018ms)
✔ Container Study RBAC (0.8422ms)
▶ Shipment Cost RBAC
  ✔ customer cannot view shipping cost master even with VIEW (0.1552ms)
  ✔ customer cannot manage shipping cost master even with MANAGE (0.2114ms)
  ✔ container-study permissions do not grant rate writes (0.2645ms)
  ✔ internal MANAGE may manage; VIEW may view (0.1031ms)
✔ Shipment Cost RBAC (0.9371ms)
▶ Shipment Cost Snapshot RBAC
  ✔ customer cannot read or create snapshot APIs even with logistics codes (0.19ms)
  ✔ CONTAINER_STUDY:CONFIRM may create; VIEW may read; study-create-only may not create (0.1421ms)
✔ Shipment Cost Snapshot RBAC (0.4052ms)
▶ Financial Offer Snapshot RBAC
  ✔ customer cannot read or create financial offer APIs even with quotation codes (0.1286ms)
  ✔ QUOTATION:CREATE may create; VIEW may read; logistics-only may not (0.094ms)
  ✔ customer may read customer-safe financial offer and shipment visibility, not create (0.1084ms)
✔ Financial Offer Snapshot RBAC (0.4019ms)
▶ Reporting / dashboard RBAC
  ✔ denies unauthenticated dashboard with sign-in message (0.1355ms)
  ✔ customer cannot view internal platform KPIs or run internal reports (0.1064ms)
  ✔ internal reportsAnalytics role may view dashboards and reports (0.0633ms)
✔ Reporting / dashboard RBAC (0.3771ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ Phase 10 report runtime persistence
  ✖ rejects creating a report on a non-whitelisted entity
  ✖ creates and runs a CommercialInquiry count report
✖ Phase 10 report runtime persistence (1.5555ms)
▶ server audit abstraction
  ✔ uses one AuditEvent payload for transactional and non-transactional append (1.1152ms)
  ✔ appendServerAuditTx does not swallow create errors (0.4472ms)
  ✔ appendServerAudit still swallows errors for non-transactional callers (0.2754ms)
✔ server audit abstraction (3.9704ms)
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
▶ shipping cost master e2e — study snapshot issue freeze
  ✖ freezes 3100 through Container Study and issued quotation while a later 3500 version does not rewrite history
✖ shipping cost master e2e — study snapshot issue freeze (1.5368ms)
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
▶ Task 05H — standalone commercial fulfillment
  ✖ V2 DIRECT_ORDER: customer commitment → internal SO with lineage snapshot
  ✖ V2 SALES_AGREEMENT: commitment → agreement → release → SO
  ✖ customer can read own SO/agreement; IDOR blocked for other customer
  ✖ customer cannot create sales orders or releases
  ✖ rejects commitment on non-issued V2 quotation
  ✖ Direct MTS path works without quotation or commitment
  ✖ blocks over-release on agreement lines
  ✖ repository pins inquiryId on commitment from V2 quotation
✖ Task 05H — standalone commercial fulfillment (1.6185ms)
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
▶ V2 Advanced Cable Search
  ✖ requires sign-in
  ✖ finds an exact Material Number
  ✖ finds an Item Code
  ✖ filters by family
  ✖ filters by voltage
  ✖ filters by standard
  ✖ filters by conductor
  ✖ applies multiple filters
  ✖ returns no result for an unknown construction
  ✖ paginates server-side
  ✖ normalizes search input without rewriting stored values
  ✖ does not leak costing or price fields
  ✖ POST search is read-only 405 and does not create a Material Number
  ✖ customer cannot create Cable Master records
  ✖ internal users can search the same catalog
  ✖ customer can request Technical Office review and cannot list TO queues
✖ V2 Advanced Cable Search (1.4694ms)
▶ cable scrap template service
  ✔ exposes legacy template headers for backward compatibility (0.5849ms)
  ✔ defines separated workbook sheet names and headers (0.1414ms)
  ✔ resolves scrap import sheet from multi-sheet workbook names (0.1627ms)
  ✔ derives CU and AL metal codes from conductor text (0.0963ms)
  ✔ parses scrap percent from plain numbers and percent strings (0.5992ms)
  ✔ serializes template rows for Excel export (0.1347ms)
✔ cable scrap template service (4.4337ms)
▶ commercialFulfillmentApiService — error surfacing
  ✔ formats FulfillmentApiError with classified title (0.7501ms)
  ✔ formats generic Error without throwing (0.2766ms)
✔ commercialFulfillmentApiService — error surfacing (1.9095ms)
▶ commercialFulfillmentWorkflow — exception classification
  ✔ classifies MTO bypass / MTS eligibility / over-release / immutability / conflict (0.8716ms)
  ✔ maps operational status labels Sales expects (0.1187ms)
  ✔ labels order origins for cable sales paths (0.118ms)
  ✔ hides fulfillment actions from customers (0.1082ms)
  ✔ parses workspace view query (0.083ms)
  ✔ builds SO and agreement traceability including Direct MTS no-commitment (0.3188ms)
  ✔ exposes titles for each exception kind (0.1878ms)
✔ commercialFulfillmentWorkflow — exception classification (2.6248ms)
▶ commercial inquiry line length calculations
  ✔ uses drums times cutting length when cutting length is present (0.6295ms)
  ✔ shows 2 drums × 1500 m cutting length as 3000 m total on the inquiry line (0.1116ms)
  ✔ does not keep a 1500 m total when the line shows 2 drums and 1500 m cutting length (0.1923ms)
  ✔ falls back to persisted requested length when cutting length is absent (0.0852ms)
  ✔ aggregates total length and drum quantities authoritatively from multi-row drumSchedule (0.1696ms)
  ✔ sums line total lengths in inquiry summary and preview (10.5023ms)
  ✔ sums persisted line values for inquiry value and omits uncosted lines (0.1431ms)
  ✔ returns null value when no line has persisted materialCost (0.0935ms)
✔ commercial inquiry line length calculations (12.8028ms)
▶ commercial inquiry list columns
  ✔ places Value immediately before Currency and hides it from customers (0.1936ms)
✔ commercial inquiry list columns (0.306ms)
▶ commercial inquiry line columns
  ✔ places Value immediately before Currency after drum and hides Value from customers (0.3792ms)
  ✔ omits Value from customer line visibility while keeping Currency for both roles (0.1853ms)
  ✔ formats null materialCost as em dash not zero (0.2948ms)
✔ commercial inquiry line columns (0.9648ms)
▶ commercial inquiry API client uses httpClient
  ✔ lists inquiries through httpClient GET /api/inquiries (14.2818ms)
  ✔ loads one inquiry through httpClient GET /api/inquiries/:id (0.3386ms)
  ✔ lists quotations through httpClient GET /api/quotations (0.3138ms)
  ✔ creates an inquiry through httpClient POST /api/inquiries (0.764ms)
  ✔ updates an inquiry through httpClient PATCH /api/inquiries/:id (0.4254ms)
  ✔ submits an inquiry through httpClient POST /api/inquiries/:id/submit (0.3223ms)
  ✔ adds a line through httpClient POST /api/inquiries/:id/lines (0.3343ms)
  ✔ updates a line through httpClient PATCH /api/inquiries/:id/lines/:lineId (0.2849ms)
  ✔ deletes a line through httpClient DELETE /api/inquiries/:id/lines/:lineId (0.2932ms)
✔ commercial inquiry API client uses httpClient (17.6026ms)
▶ Increment 3 configurator regression
  ✔ Test G: V1 constraint engine still evaluates a catalog configuration (2.2038ms)
✔ Increment 3 configurator regression (2.8105ms)
▶ customerInquiryJourneyService
  ✔ maps inquiry statuses to customer-friendly labels (0.5574ms)
  ✔ guides draft inquiry toward configuration (0.4509ms)
  ✔ marks quotation complete when issued (13.3463ms)
  ✔ shows fulfillment in progress when documents exist (0.4207ms)
  ✔ imported catalog cable does not require a V2 configuration snapshot for engineering PASS (0.2835ms)
✔ customerInquiryJourneyService (16.0409ms)
▶ drumSelectionService
  ✔ does not auto-select when MaxLoad/clearance engineering data is missing (7.2747ms)
  ✔ does not run local automatic optimization when engineering fields are configured (0.2298ms)
  ✔ does not pick the first Drum Master row as a default without engineering data (0.1245ms)
  ✔ links a manual ACTIVE EWD code without replacing prototype type (0.1713ms)
  ✔ rejects unknown and inactive drums (0.1084ms)
  ✔ searches reference drums without ranking by invented capacity (0.1522ms)
  ✔ searches reference drums by description (0.082ms)
✔ drumSelectionService (8.9693ms)
▶ importPipelineService — raw material currency column
  ✔ maps Currency column and normalizes EGP to LE (1.4189ms)
✔ importPipelineService — raw material currency column (2.0019ms)
▶ Increment 2 import validation
  ✔ keeps a blank raw-material price as PRICE_NOT_CONFIGURED, never zero (1.7212ms)
  ✔ updates an existing Drum Code instead of creating a duplicate (1.0939ms)
  ✔ preview does not persist drums (0.3984ms)
  ✔ imports drum description from Excel or auto-generates when blank (0.3951ms)
  ✔ imports optional Clearance / Max Load / Empty weight; Capacity remains source reference (0.3045ms)
  ✔ TO rule: maps Capacity → MaxLoad and defaults Clearance 50 when engineering columns absent (0.3431ms)
  ✔ TO rule: blank Max Load Kg falls back to Capacity; blank Clearance defaults to 50 (0.2513ms)
  ✔ skips conflicting BOM cable+RM weights instead of auto-resolving or importing them (0.7649ms)
  ✔ rejects duplicate drum codes without a partial save (0.3724ms)
  ✔ imports unique BOM lines while skipping only the conflicting group (0.4254ms)
  ✔ rejects a BOM line that references a missing Cable Master (0.1996ms)
✔ Increment 2 import validation (7.463ms)
▶ resolveGridPreference
  ✔ keeps hidden columns hidden instead of merging defaults back in (0.7883ms)
  ✔ keeps hidden inquiry line columns hidden across reloads (0.1406ms)
  ✔ adds newly introduced default-visible columns that were not in the saved schema (0.1422ms)
  ✔ returns defaults when nothing is saved (0.5229ms)
✔ resolveGridPreference (2.5028ms)
▶ applyPlatformFieldOverrides
  ✔ hides a field when PlatformFieldDefinition sets visible false (0.1848ms)
  ✔ does not expose protected cost columns to customers via overlay (0.1025ms)
✔ applyPlatformFieldOverrides (0.3951ms)
▶ inquiry header form — incoterms, destination, metal rates
  ✔ marks Copper Price, Aluminium Price, Incoterms, and Destination on the header manifest (0.6802ms)
  ✔ buildUpdatePayloadFromForm persists dest, incoterm, and metal rates without inventing charges (0.5101ms)
  ✔ round-trips customer presentation metadata without inventing metal rates (0.1522ms)
  ✔ does not promote free-text Alexandria into a DestinationPort code (0.1555ms)
  ✔ A: selected NETHERLANDS / CIF / ROTTERDAM persists destinationPortCode, destination, and incoterms (0.1721ms)
  ✔ I: does not auto-select a default or first delivery combination (0.106ms)
  ✔ does not invent FOB when the inquiry Incoterm is empty (0.126ms)
  ✔ submit header codes block missing or non-positive metal rates (0.6444ms)
  ✔ keeps Submit visible for DRAFT even when metal rates and lines are missing (0.1465ms)
  ✔ lists missing submit parts without inventing values or treating logistics as a gate (0.2598ms)
  ✔ costing request payload includes header dest and incoterm (0.2813ms)
  ✔ clears metal prices when inquiry currency changes (0.1278ms)
✔ inquiry header form — incoterms, destination, metal rates (4.3548ms)
▶ inquiry quotation home mapper
  ✔ maps Customer Request to Inquiry (0.6728ms)
  ✔ maps Sales Quotation to Quotation (0.1133ms)
  ✔ computes commercial total from qty * unit price (0.1127ms)
  ✔ filters by customer and status (0.2822ms)
  ✔ sorts by total descending (0.7327ms)
  ✔ maps ELAND statuses to Open, Submitted, and Canceled only (0.1593ms)
  ✔ keeps Sent To Technical for non-ELAND customers (0.0801ms)
✔ inquiry quotation home mapper (2.9455ms)
▶ Task 04A master data API preference helpers
  ✔ marks local catalog/BOM/RM/Drum/ImportBatch stores as non-authoritative (0.5901ms)
  ✔ refuses LS-only Raw Material deactivate after SoT cutover (0.6421ms)
  ✔ refuses LS-only Cable catalog save after 04B-6 remediation (0.4165ms)
  ✔ resolveMasterListPreferringPostgres: empty PG wins over stale LS (0.561ms)
  ✔ resolveMasterListPreferringPostgres: PG failure is non-authoritative LS (0.124ms)
  ✔ resolveDrumListForSelect: empty PG active list is not replaced by LS (0.2024ms)
  ✔ quality without snapshot is explicitly non-authoritative fallback (0.5747ms)
  ✔ quality with PG snapshot is authoritative (0.111ms)
  ✔ preferPostgresMasterData exposes authoritative flag for callers (0.117ms)
✔ Task 04A master data API preference helpers (4.3014ms)
▶ V2 inquiry and cutting clients use httpClient
  ✔ createV2Inquiry posts projectName through httpClient (0.6705ms)
  ✔ preview and persist cutting plans use cutting-plans API paths (0.2258ms)
✔ V2 inquiry and cutting clients use httpClient (1.5601ms)
ℹ tests 1683
ℹ suites 251
ℹ pass 1004
ℹ fail 4
ℹ cancelled 675
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 96719.2443

✖ failing tests:

test at src\platform\cableBomConflictGovernance.test.ts:42:3
✖ Test A: all 81 official conflict groups preserved in PostgreSQL
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:50:3
✖ Test B: governance register lists every official conflict without loss
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:58:3
✖ Test C: every row uses lettered classification taxonomy A–L
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:67:3
✖ Test D: every row has an allowed governance disposition
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:75:3
✖ Test E: source CableBomLine volume preserved — no mass deletion
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:84:3
✖ Test F: no mass auto-approve — zero AUTO_RESOLVE_SAFE without explicit evidence
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:95:3
✖ Test G: cutover OUTCOME B — CableBomLine remains POSTGRESQL_PRIMARY
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:107:3
✖ Test H: import pipeline guard rejects silent conflict deletion or mass approval
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:145:3
✖ Test I: existing Technical Office governance register API remains authoritative
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:151:3
✖ Test J: workflow classifications remain on observations — governance is additive
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:162:3
✖ Test K: costing impact flagged BLOCKED or NO_SOURCE_LINE for unresolved conflicts
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:171:3
✖ Test L: bomVersion semantics unchanged — all conflicts at default version grain
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:180:3
✖ Test M: committed JSON register matches live PostgreSQL inventory
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:190:3
✖ Test N: promotion gates pass but entity not promoted — honest registry
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:197:3
✖ Test O: governance summary reports zero deleted records and OUTCOME B
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:206:3
✖ classifyBomConflictEvidence maps near-equal weights to TRUE_DUPLICATE
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:219:3
✖ dispositionForBomClassification never returns RETIRE_OBSOLETE without SOURCE_DATA_ERROR
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomConflictGovernance.test.ts:32:1
✖ Task 04B-13 Cable BOM conflict governance (1.4935ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\cableBomConflictGovernance.test.ts:35:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\cableBomPersistenceRemediation.test.ts:133:3
✖ persistCableBomExcelCommit validates CableMaster + RawMaterial FKs
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomPersistenceRemediation.test.ts:155:3
✖ persistCableBomExcelCommit writes whole-txn AuditEvent (entity CableBom)
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomPersistenceRemediation.test.ts:244:3
✖ listBoms returns PG-backed rows after excel commit
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomPersistenceRemediation.test.ts:249:3
✖ 81+ BomDuplicateObservation governance register preserved (not deleted)
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomPersistenceRemediation.test.ts:258:3
✖ promotion still blocked after gate remediation
  'test did not finish before its parent and was cancelled'

test at src\platform\cableBomPersistenceRemediation.test.ts:123:1
✖ Task 04B-9 Cable BOM PG write + audit evidence (1.0064ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\cableBomPersistenceRemediation.test.ts:126:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\cablePersistenceRemediation.test.ts:113:3
✖ createCable writes AuditEvent (TCR/Excel path uses same repository)
  'test did not finish before its parent and was cancelled'

test at src\platform\cablePersistenceRemediation.test.ts:146:3
✖ Gates A–J pass; CableMaster POSTGRESQL_SOT after 04B-7
  'test did not finish before its parent and was cancelled'

test at src\platform\cablePersistenceRemediation.test.ts:103:1
✖ Task 04B-6 Cable Master PG write + audit evidence (1.0416ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\cablePersistenceRemediation.test.ts:106:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\ceoDemoJourney.e2e.test.ts:195:3
✖ walks LOGIN→DASHBOARD→INQUIRY→CABLE→CUTTING→DRUM CONFIRMED→delivery→CS/costing/FO gates→isolation→low-code
  'test did not finish before its parent and was cancelled'

test at src\platform\ceoDemoJourney.e2e.test.ts:45:1
✖ CEO demo journey — login through quotation + security + low-code (1.6566ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\ceoDemoJourney.e2e.test.ts:63:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudy05i.e2e.test.ts:510:3
✖ A) STANDARD shipment required: saved combination → SG → confirmed drum → snapshot → CS result → pin → orchestrator readiness
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:552:3
✖ B) STANDARD no shipment: engineering/cutting/confirmed drum → costing/pricing path; CS not required
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:574:3
✖ C) fail-closed: missing SG, unconfirmed drum, snapshot missing, result missing, lineage mismatch, pin missing/mismatched
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:741:3
✖ D) historical: R1, CR1 pins R1, recalc R2, CR1 still R1, R1 immutable, R2 separate
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:780:3
✖ E) delivery authority: saved ROTTERDAM/CIF combination, not customer default, unsaved UI, Alexandria, or live metadata
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:839:3
✖ F) AUTH: customer cannot create/confirm SG, cannot advance Standard workflow, cannot list/get CostingRuns; Logistics owns SG
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:890:3
✖ G) VIP_FAST_TRACK: CS optional only without shipment; required when logistics active; metadata is not Standard SoT
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:966:3
✖ H) no live/latest: after snapshot/pin, live dest/drum/currentResultId changes do not rewrite CR1
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudy05i.e2e.test.ts:66:1
✖ Task 05I dedicated E2E — Container Study → Costing → Standard Workflow (2.9201ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudy05i.e2e.test.ts:321:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyB1.test.ts:285:3
✖ happy path: confirmed drum → shipment group → study → immutable input snapshot with lineage
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:368:3
✖ rejects DRAFT drum plan for input snapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:425:3
✖ rejects cross-customer container study input snapshot (IDOR)
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:459:3
✖ snapshot retains values after drum master change
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:509:3
✖ rejects missing shipment-group destination
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:524:3
✖ rejects client-declared container suitability
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:541:3
✖ rejects shipment group from another inquiry
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:567:3
✖ rejects drum plan from another inquiry
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:602:3
✖ rejects mismatched inquiry line vs drum plan
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:641:3
✖ rejects SUPERSEDED drum plan
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:680:3
✖ rejects client-supplied drum payload
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:717:3
✖ rejects snapshot mutation
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:759:3
✖ invalid configuration does not leave a snapshot pointer
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:798:3
✖ rejects missing drum packing/master geometry
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB1.test.ts:100:1
✖ Task 05I-DF-B1 — Shipment group + drum plan input snapshot (1.985ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyB1.test.ts:112:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyB2.test.ts:319:3
✖ ENTIRE_INQUIRY snapshots all confirmed plans without aggregating cutting lengths
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:435:3
✖ PER_INQUIRY_LINE isolates a single confirmed drum plan
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:483:3
✖ rejects ENTIRE_INQUIRY when a line has no CONFIRMED drum plan
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:524:3
✖ rejects cross-customer calculation and result access (IDOR)
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:568:3
✖ plans multiple cutting lengths on one inquiry line independently
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:627:3
✖ does not change drum type when only requested drum count changes
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:647:3
✖ preserves physical drum lineage across multiple CL counts on one line
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:702:3
✖ ENTIRE_INQUIRY includes all requirements on three lines and fails closed if one confirmed plan is removed
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:786:3
✖ PER_INQUIRY_LINE includes every requirement on one line and excludes the other line
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:834:3
✖ snapshot physical drums follow confirmed plan lines, not requestedDrumCount
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:914:3
✖ historical drum master change does not mutate a captured snapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB2.test.ts:58:1
✖ Task 05I-DF-B2 — ENTIRE_INQUIRY aggregation + Rolling calculation (1.7994ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyB2.test.ts:177:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyB3.test.ts:344:3
✖ rejects the legacy client-drum snapshot endpoint and keeps B2 input-snapshot authoritative
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:366:3
✖ keeps multiple requirements independent and rejects line-pointer-only population
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:409:3
✖ VALIDATE succeeds without a result, does not change to CALCULATED, and uses the pinned configuration
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:444:3
✖ calculation creates a new result without changing status; failed integrity does not persist
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:518:3
✖ unallocated drums are explicit, explained, and block confirm
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:557:3
✖ CONFIRM requires VALIDATED + current result; DRAFT cannot confirm; stale drum plan is blocked
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:695:3
✖ customers may VIEW own studies and cannot mutate; other customers are isolated
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:729:3
✖ Forklifting remains fail-closed and Rolling golden algorithm is unchanged
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB3.test.ts:40:1
✖ Task 05I-DF-B3 — Container Study validation and result hardening (2.0923ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyB3.test.ts:181:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyB4A.test.ts:343:3
✖ ENTIRE_INQUIRY rejects mixed shipment identity and a subset of lines
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4A.test.ts:378:3
✖ PER_INQUIRY_LINE contains exactly one line and dual-writes inquiryLineId
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4A.test.ts:412:3
✖ DESTINATION_CLUSTER groups Lines 1+3 while Line 2 belongs to another destination group
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4A.test.ts:479:3
✖ LOCKED group identity cannot be mutated; identity change requires a new group
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4A.test.ts:536:3
✖ LOCKED group can receive a successor Container Study snapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4A.test.ts:581:3
✖ stale Drum Plan still blocks Container Study confirmation
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4A.test.ts:614:3
✖ enforces customer isolation and RBAC on shipment-group commands
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4A.test.ts:35:1
✖ Task 05I-DF-B4-A — Shipment Group Foundation (1.8437ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyB4A.test.ts:185:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyB4B.test.ts:166:3
✖ canonicalizes destination port codes and rejects case/whitespace duplicates
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:185:3
✖ canonicalizes incoterm codes including dap / DAP / padded
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:201:3
✖ audits destination port and incoterm create
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:216:3
✖ creates a valid shipping cost rate and rejects unknown/inactive masters and invalid amounts
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:336:3
✖ rejects overlapping active rates and preserves history when closing then inserting
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:390:3
✖ resolves 0/1/>1, inclusive bounds, open-ended, inactive, and canonical codes
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:501:3
✖ audits rate create, date change, and deactivate
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:513:3
✖ rejects inactive destination on new rate writes and still resolves historical rates
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:541:3
✖ denies customers and container-study-only users
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4B.test.ts:32:1
✖ Task 05I-DF-B4-B — Shipping Cost Master (2.834ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyB4B.test.ts:47:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyB4C.test.ts:356:3
✖ creates a snapshot from confirmed-result container counts, ignoring client quantities
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:420:3
✖ is idempotent for the same confirmed result and rejects a competing as-of date
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:456:3
✖ rejects DRAFT, SUPERSEDED, non-current result, unallocated, and blank typeCode
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:530:3
✖ fails closed on RATE_NOT_FOUND, RATE_AMBIGUOUS, and mixed currencies without persisting
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:625:3
✖ denies customers, allows CONFIRM-only create, and has no PATCH/DELETE
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:676:3
✖ serializes concurrent creates to one snapshot via unique containerStudyResultId
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:699:3
✖ rejects a mismatched shipmentGroupId
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:719:3
✖ rolls back the snapshot when appendServerAuditTx throws inside the transaction
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4C.test.ts:36:1
✖ Task 05I-DF-B4-C — Shipment Cost Snapshot (1.8886ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyB4C.test.ts:200:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyB4D.test.ts:373:3
✖ aggregates copied pricing + B4-C totals and does not write commercialOfferSnapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:406:3
✖ is idempotent for the same pin set and freezes copied amounts if live pricing later changes
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:435:3
✖ refuses a pricing snapshot from another inquiry
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:453:3
✖ refuses a superseded shipment group and an unrelated B4-C snapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:487:3
✖ fails closed on mixed currencies and persists nothing
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:501:3
✖ treats a superseded quotation version pin as stale pricing
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:571:3
✖ stores VIP_SHIPMENT_NOT_CONFIGURED internally with shipment total 0
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:587:3
✖ STANDARD workflow calculates 0 + warning when an included group has no B4-C snapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:601:3
✖ sums multiple included groups without allocating freight into cable unit price
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:620:3
✖ enforces at most one isCurrent offer per inquiry at PostgreSQL
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:670:3
✖ denies customers and has no PATCH surface
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyB4D.test.ts:36:1
✖ Task 05I-DF-B4-D — Financial Offer Snapshot (1.8608ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyB4D.test.ts:238:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyDfb.test.ts:324:3
✖ 01 create SG from valid saved combination
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:338:3
✖ 02 destination from SAVED inquiry
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:350:3
✖ 03 customer default NOT used
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:374:3
✖ 04 unsaved UI destination cannot influence persisted SG
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:392:3
✖ 05 SG with confirmed Drum Plan → snapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:411:3
✖ 06 reject snapshot if drum plan not CONFIRMED
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:442:3
✖ 07 reject if drum plan missing
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:455:3
✖ 08 drum plan ID/version provenance
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:481:3
✖ 09 every physical drum has traceable provenance
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:508:3
✖ 10 copied drum/calculation inputs persisted
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:531:3
✖ 11 snapshot cannot be mutated after create
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:570:3
✖ 12 confirmed SG cannot be silently mutated
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:593:3
✖ 13 mixed destinations → separate SGs
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:638:3
✖ 14 ENTIRE_INQUIRY
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:659:3
✖ 15 PER_INQUIRY_LINE
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:684:3
✖ 16 auth: customer cannot authoritative SG lifecycle
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:705:3
✖ 17 audit events
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:747:3
✖ 18 regression INQ26-06065: saved ROTTERDAM/CIF; SG reads ROTTERDAM not Alexandria
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfb.test.ts:37:1
✖ Task 05I-DF-B — Shipment Group + confirmed Drum Plan → immutable input snapshot (2.1475ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyDfb.test.ts:194:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyDfc.test.ts:408:3
✖ calculation uses the immutable snapshot only after live dest, drums, packing, default, and preference change
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfc.test.ts:547:3
✖ missing shipping grain stays SHIPPING_COST_NOT_CONFIGURED with amount 0 and does not block packing
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfc.test.ts:568:3
✖ customer isolation is unchanged for calculate
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfc.test.ts:42:1
✖ Task 05I-DF-C — bind Container Study calculation + shipping to immutable snapshot (1.7263ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyDfc.test.ts:222:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyDfd.test.ts:435:3
✖ TEST 01 CostingRun can pin a valid ContainerStudyResult
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:474:3
✖ TEST 02 CostingRun stores the exact result ID
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:491:3
✖ TEST 03 CostingRun does not dynamically resolve latest result
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:512:3
✖ TEST 04 R1 pinned by C1 remains after CS recalc to R2
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:530:3
✖ TEST 05 New CostingRun may explicitly pin R2
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:547:3
✖ TEST 06 Missing required ContainerStudyResult blocks CostingRun
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:581:3
✖ TEST 07 Mismatched result/study is rejected
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:618:3
✖ TEST 08 Historical pinned result remains valid even when not current
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:639:3
✖ TEST 09 Live Inquiry destination changes do not affect an existing CostingRun
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:656:3
✖ TEST 10 Live Drum Plan changes do not affect an existing CostingRun
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:676:3
✖ TEST 11 Customer/default delivery changes do not affect an existing CostingRun
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:703:3
✖ TEST 12 Shipping dependency remains bound to the pinned result
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:773:3
✖ TEST 13 Customer cannot access internal costing
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:789:3
✖ TEST 14 Audit event is generated
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfd.test.ts:55:1
✖ Task 05I-DF-D — CostingRun pins immutable ContainerStudyResult (2.0711ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyDfd.test.ts:287:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyDfe.test.ts:606:3
✖ persisted shipment group without snapshot blocks Standard orchestrator (not metadata)
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfe.test.ts:635:3
✖ 7–9 persisted: pin required, no silent repoint, historical pin remains
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfe.test.ts:730:3
✖ 12. Customer cannot mutate Standard workflow readiness
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDfe.test.ts:351:1
✖ Task 05I-DF-E — persisted Standard gate + customer isolation (1.1837ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyDfe.test.ts:470:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyDff.test.ts:558:3
✖ immutable snapshot: PUT/PATCH/second capture are 409
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff.test.ts:586:3
✖ immutable historical result: recalc creates a new row; old result unchanged; pin write-once
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff.test.ts:658:3
✖ Standard no-shipment orchestrator is not CS-blocked; shipment without snapshot is
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff.test.ts:692:3
✖ customer cannot create/confirm SG, cannot access internal costing, cannot mutate workflow
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff.test.ts:248:1
✖ Task 05I-DF-F — persisted hardening (1.4979ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyDff.test.ts:402:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyDff2.test.ts:486:3
✖ creates FO pinning exact pricing and shipment snapshots with inquiry total
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:504:3
✖ customer-safe current FO hides internals and copies pinned commercial totals
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:549:3
✖ fails closed on mixed currency and does not persist an offer
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:567:3
✖ keeps F1 immutable when later pricing/shipping/CS facts change; F2 is a new snapshot
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:665:3
✖ pins shipment snapshots for PER_INQUIRY_LINE groups without live rate lookup
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:687:3
✖ creates STANDARD no-shipment FO without ShipmentCostSnapshot when no groups exist
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:712:3
✖ sums persisted shipment snapshots for DESTINATION_CLUSTER without regrouping
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:734:3
✖ VIP no-shipment stores zero + warning; customer sees notice, not internal costing
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:760:3
✖ customer auth: own FO/CS yes; mutate CS/SG no; costing and live shipment APIs no
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyDff2.test.ts:125:1
✖ Task 05I-DF-F2 — Financial Offer + customer visibility (1.1499ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyDff2.test.ts:328:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyPersistence.test.ts:238:3
✖ seeds catalog types without production dimensions and pending approval
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyPersistence.test.ts:254:3
✖ creates study, snapshots, and enforces lifecycle + missing master data
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyPersistence.test.ts:346:3
✖ versions container master, packing profile, and algorithm configuration with audit
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyPersistence.test.ts:402:3
✖ pins snapshot versions, refuses Forklifting calculate, and blocks confirmed mutation / referenced delete
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyPersistence.test.ts:537:3
✖ supersedes a study and allocates CONTAINER_STUDY numbers
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyPersistence.test.ts:64:1
✖ Task 05I-DD — Container Study persistence foundation (1.7468ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyPersistence.test.ts:75:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\containerStudyVersionACompatibility.test.ts:263:3
✖ confirmed Version A schedule loads physical drums without a V2 workflow error
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyVersionACompatibility.test.ts:277:3
✖ unconfirmed Version A drums are visible and calculate is blocked until confirm
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyVersionACompatibility.test.ts:298:3
✖ cutting without drums requires a confirmed drum plan
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyVersionACompatibility.test.ts:311:3
✖ empty inquiry returns no calculation and a missing-schedule message
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyVersionACompatibility.test.ts:353:3
✖ customer isolation blocks a foreign Version A inquiry
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyVersionACompatibility.test.ts:362:3
✖ confirmed Version A calculate produces container options from physical drums
  'test did not finish before its parent and was cancelled'

test at src\platform\containerStudyVersionACompatibility.test.ts:39:1
✖ Container Study Version A compatibility (1.6672ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\containerStudyVersionACompatibility.test.ts:56:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\customerPortalJourney.test.ts:119:3
✖ customer can login and list own V2 inquiries
  'test did not finish before its parent and was cancelled'

test at src\platform\customerPortalJourney.test.ts:128:3
✖ customer can fetch own inquiry detail
  'test did not finish before its parent and was cancelled'

test at src\platform\customerPortalJourney.test.ts:136:3
✖ IDOR: customer B cannot read customer A inquiry
  'test did not finish before its parent and was cancelled'

test at src\platform\customerPortalJourney.test.ts:143:3
✖ customer cannot access internal costing runs
  'test did not finish before its parent and was cancelled'

test at src\platform\customerPortalJourney.test.ts:161:3
✖ customer cannot mutate quotations
  'test did not finish before its parent and was cancelled'

test at src\platform\customerPortalJourney.test.ts:170:3
✖ customer quotation readiness is internal-only
  'test did not finish before its parent and was cancelled'

test at src\platform\customerPortalJourney.test.ts:177:3
✖ customer can list commitments scoped to own customer
  'test did not finish before its parent and was cancelled'

test at src\platform\customerPortalJourney.test.ts:32:1
✖ Task 05G — customer portal journey (1.5834ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\customerPortalJourney.test.ts:42:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\drumMasterPersistenceRemediation.test.ts:216:3
✖ I — createDrum writes AuditEvent (entity DrumMaster)
  'test did not finish before its parent and was cancelled'

test at src\platform\drumMasterPersistenceRemediation.test.ts:254:3
✖ listDrums returns PG-backed rows
  'test did not finish before its parent and was cancelled'

test at src\platform\drumMasterPersistenceRemediation.test.ts:206:1
✖ Task 04B-11 Drum Master PG write + audit evidence (0.933ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\drumMasterPersistenceRemediation.test.ts:209:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\inquiryProcessFoundation.test.ts:156:3
✖ V1 create resolves customer override and audits process assignment
  'test did not finish before its parent and was cancelled'

test at src\platform\inquiryProcessFoundation.test.ts:191:3
✖ V1 create uses customer group when no customer override
  'test did not finish before its parent and was cancelled'

test at src\platform\inquiryProcessFoundation.test.ts:206:3
✖ V2 create resolves process from customer scope (IDOR-safe)
  'test did not finish before its parent and was cancelled'

test at src\platform\inquiryProcessFoundation.test.ts:32:1
✖ Task 05I-A — inquiry process foundation (5003.0546ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\inquiryProcessFoundation.test.ts:41:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\standardWorkflowOrchestrator.test.ts:157:3
✖ seeds TEST-STANDARD-001 without modifying ELAND
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:173:3
✖ customer create stamps V2 channel and STANDARD process from master
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:189:3
✖ submit without lines is rejected; customer cannot approve or issue
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:218:3
✖ submit with snapshot starts workflow, records timing, and stops at real lineage gate
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:287:3
✖ customer cannot see another customer notifications and cannot retry email
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:316:3
✖ email queue stays QUEUED without SMTP and FAILED send does not throw
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:343:3
✖ duplicate customer decision is rejected; unissued quotation is hidden
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:367:3
✖ internal my-tasks returns only real pending tasks
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:375:3
✖ internal return requires a reason and customers cannot return
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:423:3
✖ customer accept of an issued quotation creates existing CommercialCommitment
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:465:3
✖ TO exception evaluation is additive and does not invent snapshots
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:482:3
✖ customer notifications list is scoped to the actor
  'test did not finish before its parent and was cancelled'

test at src\platform\standardWorkflowOrchestrator.test.ts:36:1
✖ STANDARD_WORKFLOW quotation V2 (5006.3341ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\standardWorkflowOrchestrator.test.ts:48:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2CostingRunPersistence.test.ts:283:3
✖ requires CONFIRMED drum plan for costing preview
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CostingRunPersistence.test.ts:313:3
✖ preview is blocked by BOM Gate 2 (81 conflicts) with structured reasons
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CostingRunPersistence.test.ts:331:3
✖ records appendServerAudit on gate-blocked preview
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CostingRunPersistence.test.ts:342:3
✖ blocks IDOR on costing preview
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CostingRunPersistence.test.ts:352:3
✖ returns current run null before persist
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CostingRunPersistence.test.ts:363:3
✖ calculate does not persist when gates fail (immutability guard)
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CostingRunPersistence.test.ts:126:1
✖ Task 05E — V2 costing run persistence (1.5959ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2CostingRunPersistence.test.ts:137:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2CuttingLengthPersistence.test.ts:179:3
✖ creates versioned cutting plan linked to snapshot FK
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CuttingLengthPersistence.test.ts:214:3
✖ increments version on second plan persist
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CuttingLengthPersistence.test.ts:254:3
✖ rejects without snapshot and blocks IDOR
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CuttingLengthPersistence.test.ts:284:3
✖ returns deterministic handoff DTO
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CuttingLengthPersistence.test.ts:322:3
✖ blocks READY_FOR_COMMERCIAL without cutting plan per line
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CuttingLengthPersistence.test.ts:372:3
✖ records appendServerAudit on persist
  'test did not finish before its parent and was cancelled'

test at src\platform\v2CuttingLengthPersistence.test.ts:66:1
✖ Task 05C — V2 cutting length persistence (1.8608ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2CuttingLengthPersistence.test.ts:76:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2DrumPlanPersistence.test.ts:226:3
✖ returns ephemeral drum selection candidates
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:238:3
✖ creates versioned draft drum plan (automatic)
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:253:3
✖ increments version on second drum plan
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:269:3
✖ validates and confirms drum plan lifecycle
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:304:3
✖ rejects drum plan without cutting plan
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:333:3
✖ blocks IDOR on drum plan persist
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:343:3
✖ records appendServerAudit on drum plan persist
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:357:3
✖ creates manual multi-drum draft plan
  'test did not finish before its parent and was cancelled'

test at src\platform\v2DrumPlanPersistence.test.ts:102:1
✖ Task 05D — V2 drum plan persistence (1.5681ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2DrumPlanPersistence.test.ts:111:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2InquiryConfigurationPersistence.test.ts:229:5
✖ creates V2 inquiry with server-generated number
  'test did not finish before its parent and was cancelled'

test at src\platform\v2InquiryConfigurationPersistence.test.ts:241:5
✖ persists line + snapshot in transaction and blocks cross-customer read (IDOR)
  'test did not finish before its parent and was cancelled'

test at src\platform\v2InquiryConfigurationPersistence.test.ts:304:5
✖ submit requires snapshots and records engineering status
  'test did not finish before its parent and was cancelled'

test at src\platform\v2InquiryConfigurationPersistence.test.ts:352:5
✖ POST /api/cables/evaluate applies customer scope from auth
  'test did not finish before its parent and was cancelled'

test at src\platform\v2InquiryConfigurationPersistence.test.ts:365:5
✖ internal can list V2 inquiries with engineering summary
  'test did not finish before its parent and was cancelled'

test at src\platform\v2InquiryConfigurationPersistence.test.ts:111:3
✖ API + IDOR (1.0624ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2InquiryConfigurationPersistence.test.ts:121:14)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2Phase12LowCode.test.ts:38:3
✖ refuses invented columns and costing entities
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase12LowCode.test.ts:45:3
✖ keeps protected cost fields hidden from customers after overlay
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase12LowCode.test.ts:117:3
✖ unauthenticated metadata mutation is 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase12LowCode.test.ts:131:3
✖ customer and sales cannot mutate metadata
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase12LowCode.test.ts:153:3
✖ admin can configure a typed field and runtime form/list metadata reflects it
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase12LowCode.test.ts:188:3
✖ protected fields and invented EAV columns fail closed
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase12LowCode.test.ts:37:1
✖ Phase 12 low-code — PlatformFieldDefinition (no EAV) (1.6972ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2Phase12LowCode.test.ts:71:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/v2/boundary returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/v2/modules returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/v2/audit/events returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/v2/workflows/presentation returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/admin/platform/dashboard/kpis returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/admin/platform/reports returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/admin/platform/fields returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:81:5
✖ unauthenticated GET /api/v2/metadata/fields returns 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:87:3
✖ missing permission on audit is 403 not 401
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:94:3
✖ customer is forbidden from platform KPIs
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:101:3
✖ authorized internal may read boundary and KPIs
  'test did not finish before its parent and was cancelled'

test at src\platform\v2Phase1PlatformFoundation.gate.test.ts:30:1
✖ Phase 1 platform foundation — V2 deny-by-default (1.5365ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2Phase1PlatformFoundation.gate.test.ts:38:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2PresentationPipeline.test.ts:120:3
✖ logs in and creates a VIP inquiry without a client process choice
  'test did not finish before its parent and was cancelled'

test at src\platform\v2PresentationPipeline.test.ts:131:3
✖ standard and advanced Cable Master search stay read-only
  'test did not finish before its parent and was cancelled'

test at src\platform\v2PresentationPipeline.test.ts:156:3
✖ runs automatic processing: engineering → costing → pricing → offer → quotation
  'test did not finish before its parent and was cancelled'

test at src\platform\v2PresentationPipeline.test.ts:33:1
✖ V2 presentation pipeline — customer to quotation (1.5985ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2PresentationPipeline.test.ts:42:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\v2QuotationPersistence.test.ts:269:3
✖ creates draft quotation with QUO_COMMERCIAL numbering and V2 lineage pins
  'test did not finish before its parent and was cancelled'

test at src\platform\v2QuotationPersistence.test.ts:295:3
✖ blocks pricing when BOM Gate 2 is open
  'test did not finish before its parent and was cancelled'

test at src\platform\v2QuotationPersistence.test.ts:311:3
✖ readiness reports Decision 5 status
  'test did not finish before its parent and was cancelled'

test at src\platform\v2QuotationPersistence.test.ts:324:3
✖ blocks issue until Decision 5 signed and gates pass
  'test did not finish before its parent and was cancelled'

test at src\platform\v2QuotationPersistence.test.ts:340:3
✖ rejects cross-customer IDOR on quotation fetch
  'test did not finish before its parent and was cancelled'

test at src\platform\v2QuotationPersistence.test.ts:348:3
✖ records appendServerAudit on quotation create
  'test did not finish before its parent and was cancelled'

test at src\platform\v2QuotationPersistence.test.ts:105:1
✖ Task 05F — V2 quotation persistence (1.6394ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\v2QuotationPersistence.test.ts:115:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\vipCalculateOrchestrator.test.ts:551:3
✖ 16. rejects STANDARD_WORKFLOW inquiry on VIP calculate route
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:578:3
✖ 20. container study no longer blocks VIP calculate (warns + proceeds)
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:601:3
✖ 21. blocks VIP calculate on BOM Gate 2 before costing
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:616:3
✖ 22. records VIP_CALCULATE_STARTED audit for container-warn path
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:627:3
✖ 23. container study alone does not produce CONTAINER_STUDY BLOCK gate
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:649:3
✖ 24. rejects cross-customer IDOR on VIP calculate
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:659:3
✖ 25. returns gate breakdown with Decision 5 info on response
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:671:3
✖ 26. pre-costing readiness passes when container study missing and BOM clear
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:725:3
✖ 27. VIP calculate advances to costing phase when pre-gates pass (may PARTIAL at costing)
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:740:3
✖ 28. warnings persisted on inquiry metadata when calculate completes
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:763:3
✖ 29. retry does not duplicate quotation draft
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:784:3
✖ 30. standard workflow submit path unchanged (regression)
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:826:3
✖ 31. completed calculate includes financialOffer when offer generation succeeds
  'test did not finish before its parent and was cancelled'

test at src\platform\vipCalculateOrchestrator.test.ts:272:1
✖ Task 05I-C — VIP calculate orchestrator (integration) (1.0923ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\vipCalculateOrchestrator.test.ts:285:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\platform\workflowRuntime.test.ts:110:3
✖ A — seeds STANDARD_INQUIRY_V1 template with version pin
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:122:3
✖ B — startWorkflow is idempotent for same entity
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:148:3
✖ C — rejects invalid transition from current step
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:172:3
✖ D — clarification loop transition path exists in template
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:183:3
✖ E — customer cannot perform internal transition
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:215:3
✖ F — customer isolation on workflow by-entity lookup
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:230:3
✖ G — inquiry submit starts workflow for STANDARD_WORKFLOW (integration hook)
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:253:3
✖ H — transition writes appendServerAudit trail
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:267:3
✖ I — getCurrentStep and getTasks endpoints
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:281:3
✖ J — assignTask updates assignment
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:294:3
✖ K — cancelWorkflow completes instance
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:305:3
✖ L — WORKFLOW_ADMIN lists templates
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:313:3
✖ M — pins template version on instance
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:319:3
✖ N — workflow events append-only history
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:325:3
✖ O — VIP fast track does not require workflow instance (boundary)
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:334:3
✖ P — RBAC WORKFLOW_VIEW for customer on own entity when scoped
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:366:3
✖ Q — completeTask with customer response auto-transitions
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:407:3
✖ R — inquiry business status separate from workflow step
  'test did not finish before its parent and was cancelled'

test at src\platform\workflowRuntime.test.ts:33:1
✖ Task 05I-B — workflow runtime foundation (2.0312ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\platform\workflowRuntime.test.ts:44:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\approvedMasterDataImport.test.ts:25:3
✖ 1-5 imported official cable+BOM+lines are VALIDATED and can calculate without V2 snapshot
  'test did not finish before its parent and was cancelled'

test at src\server\approvedMasterDataImport.test.ts:61:3
✖ 6 incomplete fixture import is not falsely validated
  'test did not finish before its parent and was cancelled'

test at src\server\approvedMasterDataImport.test.ts:96:3
✖ 7 audit records approved MD import provenance
  'test did not finish before its parent and was cancelled'

test at src\server\approvedMasterDataImport.test.ts:13:1
✖ Approved Cable Master import validation stamp (1.6121ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\approvedMasterDataImport.test.ts:18:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\cableAuthority.persistence.test.ts:10:3
✖ Test A/F: search and EXISTING_CABLE against persisted master (1.1909ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at TestContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\cableAuthority.persistence.test.ts:12:12)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1869:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\commercialOfferPdf.engine.test.ts:227:3
✖ 17-20, 22, 27: issued snapshot, isolation, costing hidden, print HTML, lifecycle unchanged (0.9292ms)
  AssertionError [ERR_ASSERTION]: database is required
      at TestContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\commercialOfferPdf.engine.test.ts:229:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at src\server\costingLineageDurability.test.ts:58:3
✖ deletes costing artifacts only for the named inquiry lines
  'test did not finish before its parent and was cancelled'

test at src\server\costingLineageDurability.test.ts:104:3
✖ keeps a new fixture CostingRun through pricing and quotation, and does not rebuild QUO26-00320
  'test did not finish before its parent and was cancelled'

test at src\server\costingLineageDurability.test.ts:33:1
✖ Costing lineage durability (1.4678ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\costingLineageDurability.test.ts:39:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\costingMetalCostComponents.test.ts:97:3
✖ customer cannot access metal cost components
  'test did not finish before its parent and was cancelled'

test at src\server\costingMetalCostComponents.test.ts:105:3
✖ creates a Draft component and writes CREATED audit
  'test did not finish before its parent and was cancelled'

test at src\server\costingMetalCostComponents.test.ts:129:3
✖ rejects negative values and invalid dates
  'test did not finish before its parent and was cancelled'

test at src\server\costingMetalCostComponents.test.ts:159:3
✖ rejects inactive currency
  'test did not finish before its parent and was cancelled'

test at src\server\costingMetalCostComponents.test.ts:181:3
✖ activates, then blocks overlapping active duplicate, then deactivates
  'test did not finish before its parent and was cancelled'

test at src\server\costingMetalCostComponents.test.ts:236:3
✖ bulk upload validates and commits Draft only
  'test did not finish before its parent and was cancelled'

test at src\server\costingMetalCostComponents.test.ts:276:3
✖ existing costing result is unchanged when Premium/Shipping/Clearance records exist
  'test did not finish before its parent and was cancelled'

test at src\server\costingMetalCostComponents.test.ts:31:1
✖ Metal Cost Components master data (1.6477ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\costingMetalCostComponents.test.ts:62:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\costingRunTeardownIsolation.test.ts:62:3
✖ removes only the test line and leaves a neighboring run, quotation link, and pricing snapshot
  'test did not finish before its parent and was cancelled'

test at src\server\costingRunTeardownIsolation.test.ts:12:1
✖ CostingRun test teardown isolation (1.5579ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\costingRunTeardownIsolation.test.ts:29:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\costingV2CommercialPricing.persistence.test.ts:152:3
✖ 4. Effective dating: 20% through 2026-09-30, 22% from 2026-10-01, test-owned customer
  'test did not finish before its parent and was cancelled'

test at src\server\costingV2CommercialPricing.persistence.test.ts:213:3
✖ 5. Snapshot immutability: 20% snapshot stays 20% after master versions to 25%
  'test did not finish before its parent and was cancelled'

test at src\server\costingV2CommercialPricing.persistence.test.ts:16:1
✖ Costing V2 commercial pricing — effective dating and snapshot immutability (1.5792ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\costingV2CommercialPricing.persistence.test.ts:42:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\customerCableCatalog.test.ts:113:3
✖ requires sign-in
  'test did not finish before its parent and was cancelled'

test at src\server\customerCableCatalog.test.ts:118:3
✖ lists Cable Master rows with server-side pagination and no costing leak
  'test did not finish before its parent and was cancelled'

test at src\server\customerCableCatalog.test.ts:134:3
✖ maps category=MV from family/voltage without rewriting masters
  'test did not finish before its parent and was cancelled'

test at src\server\customerCableCatalog.test.ts:150:3
✖ maps POWER as LV ∪ MV family keys
  'test did not finish before its parent and was cancelled'

test at src\server\customerCableCatalog.test.ts:160:3
✖ returns live facets from Cable Master and documents unmapped category field
  'test did not finish before its parent and was cancelled'

test at src\server\customerCableCatalog.test.ts:170:3
✖ exports customer-safe Excel without costing or BOM columns
  'test did not finish before its parent and was cancelled'

test at src\server\customerCableCatalog.test.ts:31:1
✖ Customer Cable Products catalog API (1.4687ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\customerCableCatalog.test.ts:90:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\customerServiceCase.test.ts:196:3
✖ creates a case from owned inquiry/line and rejects another customer inquiry
  'test did not finish before its parent and was cancelled'

test at src\server\customerServiceCase.test.ts:229:3
✖ blocks IDOR reads and keeps other-customer cases out of the list
  'test did not finish before its parent and was cancelled'

test at src\server\customerServiceCase.test.ts:246:3
✖ hides INTERNAL comments from the customer and allows customer comments
  'test did not finish before its parent and was cancelled'

test at src\server\customerServiceCase.test.ts:277:3
✖ rejects customer assignment and arbitrary status, then confirm/reopen
  'test did not finish before its parent and was cancelled'

test at src\server\customerServiceCase.test.ts:325:3
✖ does not list another customer inquiry on the reference endpoint
  'test did not finish before its parent and was cancelled'

test at src\server\customerServiceCase.test.ts:338:3
✖ opens scripted AI chat and blocks the other customer from that session
  'test did not finish before its parent and was cancelled'

test at src\server\customerServiceCase.test.ts:363:3
✖ requests an engineer by creating a Technical Support case
  'test did not finish before its parent and was cancelled'

test at src\server\customerServiceCase.test.ts:35:1
✖ Customer service cases — scope, visibility, commands (1.6634ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\customerServiceCase.test.ts:53:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\customerShippingCost.persistence.test.ts:126:3
✖ resolves the six current Eland rates and treats customer and incoterm as foreign keys
  'test did not finish before its parent and was cancelled'

test at src\server\customerShippingCost.persistence.test.ts:164:3
✖ versions, audits, rejects in-place edits, and keeps the commercial snapshot
  'test did not finish before its parent and was cancelled'

test at src\server\customerShippingCost.persistence.test.ts:364:3
✖ maps ROTTERDAM to Rotterdam and resolves live Eland CIF 20 SD 1800 and 40 SD/HC 2000
  'test did not finish before its parent and was cancelled'

test at src\server\customerShippingCost.persistence.test.ts:45:1
✖ customer shipping cost master (1.5553ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\customerShippingCost.persistence.test.ts:61:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\decision5Issue.test.ts:63:3
✖ refuses Decision 5 sign-off for a customer
  'test did not finish before its parent and was cancelled'

test at src\server\decision5Issue.test.ts:77:3
✖ blocks issue while unsigned, then issues from the persisted run after an explicit sign-off
  'test did not finish before its parent and was cancelled'

test at src\server\decision5Issue.test.ts:28:1
✖ Decision 5 sign-off then quotation issue (1.527ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\decision5Issue.test.ts:36:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\draftCommercialOffer.test.ts:88:3
✖ generates a draft from the current quotation without freezing, emailing, or changing status (0.7453ms)
  AssertionError [ERR_ASSERTION]: database is required for the draft offer test
      at TestContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\draftCommercialOffer.test.ts:90:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1869:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at src\server\iccIncotermMasterLoad.test.ts:112:3
✖ upserts exactly the 11 ICC codes, preserving CIF and DAP row identity
  'test did not finish before its parent and was cancelled'

test at src\server\iccIncotermMasterLoad.test.ts:169:3
✖ is idempotent and does not insert unexpected codes on a second run
  'test did not finish before its parent and was cancelled'

test at src\server\iccIncotermMasterLoad.test.ts:183:3
✖ GET /api/inquiries/:id shipmentMasters.incoterms uses listApprovedShipmentMasters and contains all 11
  'test did not finish before its parent and was cancelled'

test at src\server\iccIncotermMasterLoad.test.ts:231:3
✖ does not introduce a second Incoterm table or hardcoded selectable list
  'test did not finish before its parent and was cancelled'

test at src\server\iccIncotermMasterLoad.test.ts:44:1
✖ ICC Incoterms 2020 global master load (1.5422ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\iccIncotermMasterLoad.test.ts:59:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\identityAuthRoles.test.ts:82:5
✖ returns active roles with the public contract (0.9443ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at TestContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\identityAuthRoles.test.ts:84:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1869:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment10.costing.test.ts:115:3
✖ Test 1 & 2: Persist costing auto-approves DRAFT mapping; preview still reports ENGINEERING_NOT_APPROVED
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:159:3
✖ Test 3: Unresolved BOM conflict blocks costing calculation (Gate 2)
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:218:3
✖ Test 4: Consuming an unregistered raw material blocks costing (Gate 3)
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:260:3
✖ Test 5: Unpriced raw material blocks costing with PRICE_NOT_CONFIGURED (Gate 4)
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:272:3
✖ Test 6: Expired price relative to costing date blocks costing with PRICE_EXPIRED
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:299:3
✖ Test 7: Incompatible PCS price against kg BOM blocks without converting
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:330:3
✖ Test 8: EUR master price converts to USD inquiry currency via governed FX
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:358:3
✖ Test 9, 10, 11, 12, 13, 14, 15: Valid cable calculates material cost, aggregates multiple BOM lines, and captures exact revisions
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:439:3
✖ Test 16: Historical costing run snapshots remain immutable when master prices change
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:468:3
✖ Test 17: Recalculating a costing run creates a new run without overwriting historical run
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:484:3
✖ Test 18-22: Process/overhead remain NOT_CONFIGURED; Inc 13 orchestrator may apply governed scrap
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:495:3
✖ Test 23: Customer role is blocked with 403 UNAUTHORIZED from calculating costs
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:503:3
✖ Test 24: Costing calculation creates immutable AuditEvent entries
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:512:3
✖ Test 25: Master data, Cable Authority, BOM Governance, and Price Governance remain fully operational
  'test did not finish before its parent and was cancelled'

test at src\server\increment10.costing.test.ts:25:1
✖ Increment 10 — Costing Engine Calculation Foundation (2.0177ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment10.costing.test.ts:36:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment11.commercial.test.ts:221:3
✖ Test 1: Customer creates commercial inquiry successfully
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:242:3
✖ Test 2 & 3: Customer ownership is strictly enforced server-side
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:254:3
✖ Test 4: Internal Sales can list and access all inquiries
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:262:3
✖ Test 5: Approved Cable Master is validated by Cable Authority and added as EXISTING_CABLE
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:292:3
✖ Test 6: Unapproved cable is not treated as EXISTING_CABLE for structured parameters
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:316:3
✖ Test 7: Technically valid unmapped cable creates and links a TechnicalOfficeRequest
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:340:3
✖ Test 8: Invalid cable configuration is rejected and blocked from inquiry addition
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:362:3
✖ Test 9: CONFIGURATION_REQUIRED blocks commercial line validation
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:370:3
✖ Test 10: Customer Master VIP Fast Track denies Standard SUBMIT
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:380:3
✖ Test 11 & 12: Sales creates Quotation V1 with frozen material cost snapshots
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:411:3
✖ Test 13 & 14: Creating quotation revision generates V2 and marks V1 as SUPERSEDED and immutable
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:439:3
✖ Test 15 & 16: Material cost is retrieved from Increment 10 costing architecture with transparent blocking reasons
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:449:3
✖ Test 17-20: Quotation initially creates with unconfigured selling price and null commercial status
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:458:3
✖ Test 21: Customer role is blocked from creating quotations directly (403 UNAUTHORIZED)
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:466:3
✖ Test 22: Commercial inquiry and quotation actions create immutable AuditEvent entries
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:475:3
✖ Test 23: Existing Cable Authority, BOM Governance, Price Governance, and Costing Engine remain intact
  'test did not finish before its parent and was cancelled'

test at src\server\increment11.commercial.test.ts:33:1
✖ Increment 11 — Commercial Inquiry & Quotation Foundation (1.551ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment11.commercial.test.ts:48:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment12.inquiryUi.test.ts:71:3
✖ creates and reloads inquiry header from PostgreSQL
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:84:3
✖ updates inquiry header and persists changes
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:95:3
✖ persists incoterms and delivery destination on header update
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:119:3
✖ A: persists selected NETHERLANDS / CIF / ROTTERDAM combination through inquiry update
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:155:3
✖ internal user can update customer name on draft inquiry
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:161:3
✖ adds, duplicates, and deletes inquiry lines transactionally
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:175:3
✖ submits inquiry and creates immutable new version
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:204:3
✖ cancels inquiry and strips internal-only fields from customer projection
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:225:3
✖ submit snapshots published copper and aluminium when the header is empty
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:270:3
✖ customer create stamps scoped Customer Master name and ignores leftover client customerName
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:285:3
✖ clears and replaces the inquiry-line cable without deleting Cable Master
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.inquiryUi.test.ts:32:1
✖ Increment 12 — Inquiry UI persistence (1.5557ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment12.inquiryUi.test.ts:53:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment12.pricing.test.ts:180:3
✖ Test 1: Markup formula calculates Cost * (1 + Markup%) correctly
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:186:3
✖ Test 2: Gross margin formula calculates Cost / (1 - Margin%) correctly
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:192:3
✖ Test 3: Confirms Markup and Gross Margin produce mathematically distinct results for identical percentage
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:201:3
✖ Test 4: Invalid margin values >= 100% or < 0% are rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:208:3
✖ Test 5: Negative markup percentage is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:213:3
✖ Test 6: Governed discount is subtracted from base selling price accurately
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:220:3
✖ Test 7: Discount > 100% or negative is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:226:3
✖ Test 8, 9, 10: Pricing precedence strictly resolves Customer+Cable over Customer over Global
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:248:3
✖ Test 11: Multiple active rules sharing identical scope and priority trigger PRICING_RULE_CONFLICT
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:258:3
✖ Test 12 & 13: Pricing rule past effectiveTo returns PRICING_RULE_EXPIRED
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:267:3
✖ Test 14: Approving an overlapping pricing rule period is blocked with PRICING_RULE_PERIOD_OVERLAP
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:301:3
✖ Test 15: Currency mismatch blocks pricing resolution without automated FX conversion
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:310:3
✖ Test 16: No matching pricing rule returns PRICING_NOT_CONFIGURED (no arbitrary fallback)
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:316:3
✖ Test 17 & 18: Discount exceeding maxDiscountAllowed marks quotation as PRICING_APPROVAL_REQUIRED
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:352:3
✖ Test 19: Authorized manager can approve commercial pricing on quotation
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:359:3
✖ Test 20 & 21: Customer role is blocked from creating/approving pricing rules (403 UNAUTHORIZED)
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:365:3
✖ Test 22: Historical CommercialPricingSnapshot remains frozen and immutable
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:388:3
✖ Test 23, 24, 25: Creating Quotation V2 revision leaves V1 pricing snapshot immutable
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:401:3
✖ Test 26, 27, 28: Underlying CostingRun and material cost remain strictly separate from selling price and discounts
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:420:3
✖ Test 30: Commercial pricing operations generate immutable AuditEvent records
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:429:3
✖ Test 31: Master data, Cable Authority, BOM Governance, Price Governance, and Costing Engine remain intact
  'test did not finish before its parent and was cancelled'

test at src\server\increment12.pricing.test.ts:43:1
✖ Increment 12 — Commercial Pricing & Sales Margin Engine (1.5707ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment12.pricing.test.ts:56:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment12b1.hardening.test.ts:81:3
✖ revoked refresh token cannot mint a new access token
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:102:3
✖ rotated refresh token cannot be reused
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:123:3
✖ locking a user revokes refresh and blocks authorization
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:164:3
✖ password reset ticket is hashed, single-use, and expires after use
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:208:3
✖ forgot-password does not reveal whether an email exists
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:226:3
✖ user cannot grant themselves a role or permissions on their own role
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:244:3
✖ non-admin cannot modify another user or grant SYSTEM_ADMINISTRATOR
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:264:3
✖ admin APIs return 401 unauthenticated and 403 unauthorized
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:281:3
✖ customer A cannot read or steal customer B inquiry or quotation via URL, query, or body
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:360:3
✖ B1 security audit events never contain passwords, JWTs, or reset tokens
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:376:3
✖ AuditEvent has no update or delete admin API
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:395:3
✖ GET /api/master/cables requires JWT
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:406:3
✖ POST /api/ai/assistant requires JWT before Gemini
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.hardening.test.ts:36:1
✖ Increment 12 B1 — Hardening gate (1.6698ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment12b1.hardening.test.ts:47:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment12b1.identity.test.ts:86:3
✖ 1. Login with valid credentials
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:98:3
✖ 2. Invalid password returns 401
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:119:3
✖ 3. Inactive user cannot login
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:141:3
✖ 4. Locked user cannot login
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:163:3
✖ 5-6. Failed attempts increase and successful login resets them
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:192:3
✖ 7. Admin can create user
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:211:3
✖ 8. Non-admin receives 403
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:226:3
✖ 9. Admin can assign role
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:247:3
✖ 10. Unauthorized user cannot assign role
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:262:3
✖ 11. Permission enforcement works (granular codes)
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:272:3
✖ 12. User cannot elevate own role
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:281:3
✖ 13. Vertical privilege: ROLE_MANAGE without SYSTEM_ADMINISTRATOR cannot grant it
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:310:3
✖ 14. Password hash never appears in API response
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:321:3
✖ 15. Password hash never appears in audit
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:333:3
✖ 16. Existing customer isolation still works
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:343:3
✖ 17. Existing quotation authorization still works
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:362:3
✖ 18. Existing costing authorization still works
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:397:3
✖ 19. Existing BOM authorization still works
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:416:3
✖ 20. Existing Technical Office authorization still works
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:435:3
✖ Horizontal privilege escalation is blocked for customer isolation
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:446:3
✖ Unauthenticated admin API is 401
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:451:3
✖ Login accepts username as well as email
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:464:3
✖ Login without identifier or password is 400
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:473:3
✖ Expired access token cannot access /me
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:489:3
✖ Invalid token cannot access /me
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:494:3
✖ Customer session cannot access internal admin APIs
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:509:3
✖ Logout revokes refresh and /me for that session
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:538:3
✖ Change password requires authentication and current password
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b1.identity.test.ts:43:1
✖ Increment 12 B1 — Identity, login, and RBAC (2.0171ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment12b1.identity.test.ts:59:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment12b2.customerMaster.test.ts:163:3
✖ creates a customer
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:171:3
✖ updates a customer
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:181:3
✖ deactivates a customer
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:194:3
✖ assigns a user to a customer (already assigned in setup) and lists customer users
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:202:3
✖ unauthorized user cannot create customer
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:217:3
✖ customer user cannot modify customer master
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:232:3
✖ customer A cannot create inquiry for customer B or manipulate customerId
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:250:3
✖ customer A cannot read customer B inquiries or quotations via URL/query
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:303:3
✖ customer A cannot assign itself to another customer
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:312:3
✖ internal sales can access authorized customers commercial records
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:324:3
✖ AuditEvent is generated for customer master and assignment
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:341:3
✖ existing inquiries remain accessible after migration
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:364:3
✖ existing quotation isolation remains intact for in-memory actors
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2.customerMaster.test.ts:36:1
✖ Increment 12 B2 — Customer master & customer–user linkage (1.6235ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment12b2.customerMaster.test.ts:53:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment12b2_1.securityHardening.test.ts:137:3
✖ TEST 1-2: Customer A cannot read Customer B inquiry by id/URL
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:144:3
✖ TEST 3: Customer A POST body customerId for B stays scoped to A
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:157:3
✖ TEST 4: Customer A query customerId for B does not list B inquiries
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:167:3
✖ TEST 5-6: Customer A cannot modify assignments or assign itself to B
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:182:3
✖ TEST 7: CUSTOMER_USER with multiple active assignments is denied without guessing
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:210:3
✖ TEST 8-9 and JWT replay: logout revokes access JWT immediately
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:234:3
✖ TEST 10: lock revokes access JWT immediately
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:261:3
✖ TEST 11: deactivate revokes access JWT immediately
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:287:3
✖ TEST 12-14: revoke or delete UserSession invalidates access JWT
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:323:3
✖ TEST 15-17: revoked/locked/deactivated refresh tokens fail
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:342:3
✖ TEST 18: password reset revokes prior access JWT
  'test did not finish before its parent and was cancelled'

test at src\server\increment12b2_1.securityHardening.test.ts:34:1
✖ Increment 12 B2.1 — Customer scope and session revocation (1.6237ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment12b2_1.securityHardening.test.ts:49:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment13.bomScrap.test.ts:144:3
✖ lists cables with BOM for costing team
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:153:3
✖ returns governed BOM lines with consumption per km
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:166:3
✖ updates scrap percent on governed BOM line
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:184:3
✖ creates governed line from source BOM when saving scrap
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:200:3
✖ rejects invalid scrap rate
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:212:3
✖ denies customer from updating BOM scrap
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:224:3
✖ downloads cable scrap template and imports scrap by metal/family row
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:274:3
✖ uses BOM line scrap in costing preview when price and mapping exist
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.bomScrap.test.ts:29:1
✖ Increment 13 — BOM scrap per line (1.5245ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment13.bomScrap.test.ts:59:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment13.calculator.test.ts:77:3
✖ RBAC: admin can execute calculator preview permission
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.calculator.test.ts:81:3
✖ RBAC: customer cannot execute calculator preview
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.calculator.test.ts:90:3
✖ Calculator preview stacks scrap and margin on manual base
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.calculator.test.ts:113:3
✖ Rejects invalid row basis
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.calculator.test.ts:30:1
✖ Increment 13 — Costing Calculator preview API (1.5165ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment13.calculator.test.ts:58:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment13.costing.test.ts:109:3
✖ 24. RBAC: admin can view costing formulas
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:113:3
✖ 25. RBAC: customer cannot view costing formulas
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:117:3
✖ 26. RBAC: customer API request returns 403
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:124:3
✖ 27. Lists seeded system variables including MATERIAL_COST and EX_WORK_RATE
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:135:3
✖ 28. Lists seeded EX_WORK component (configurable, not hard-coded)
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:146:3
✖ 29. Creates costing configuration with initial version
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:157:3
✖ 30. Validates ex-work formula expression
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:173:3
✖ 31. Rejects unknown variable in validate
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:184:3
✖ 32. Preview evaluates without persisting
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:205:3
✖ 33. Creates formula with dependencies
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:222:3
✖ 34. Activates formula and creates audit event
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:237:3
✖ 35. Deactivates formula
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:246:3
✖ 36. Rejects malicious expression in validate
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:257:3
✖ 37. RBAC preview permission check
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:262:3
✖ 38. RBAC manage formulas permission
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:266:3
✖ 39. Creates custom variable in registry
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:281:3
✖ 40. Activates configuration version
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.costing.test.ts:35:1
✖ Increment 13 — Costing Formula Engine (Phase B+C) (2.3703ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment13.costing.test.ts:80:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment13.fx.test.ts:187:3
✖ converts USD RM price to LE inquiry currency via rawMaterialExchangeRate
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.fx.test.ts:200:3
✖ blocks costing when FX is not configured
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.fx.test.ts:216:3
✖ does not use DRAFT governed FX; APPROVED EGP→LE alias converts USD price to LE
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.fx.test.ts:23:1
✖ Increment 13 — multi-currency FX costing (1.5615ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment13.fx.test.ts:48:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment13.phaseD.test.ts:138:3
✖ 1. normalizeCostingDate defaults to today
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:142:3
✖ 2. buildCostingRequestFromPreviewPayload requires materialNumber
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:147:3
✖ 3. buildCostingRequestFromPreviewPayload builds valid request
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:155:3
✖ 4. buildCostingRequestFromInquiryLine fails without material
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:160:3
✖ 5. buildCostingRequestFromInquiryLine builds from line
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:169:3
✖ 6. buildCostingRequestFromPreviewPayload rejects invalid quantity
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:175:3
✖ 7. RBAC: admin can manage scrap rules
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:179:3
✖ 8. RBAC: admin can approve scrap rules
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:183:3
✖ 9. RBAC: admin can execute preview
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:187:3
✖ 10. RBAC: admin can view audit
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:191:3
✖ 11. RBAC: customer cannot execute preview API
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:201:3
✖ 12. GET /methods returns configurations
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:207:3
✖ 13. GET /layers returns components
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:214:3
✖ 14. Creates configuration for workflow tests
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:224:3
✖ 15. Validates configuration version workflow
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:233:3
✖ 16. Submits configuration version
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:242:3
✖ 17. Approves configuration version
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:251:3
✖ 18. Activates configuration version
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:261:3
✖ 19. Creates scrap rule without rate (governed)
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:277:3
✖ 20. Lists scrap rules
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:283:3
✖ 21. Updates draft scrap rule with rate
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:293:3
✖ 22. Submits scrap rule
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:302:3
✖ 23. Approves scrap rule
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:311:3
✖ 24. Activates scrap rule
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:320:3
✖ 25. Scrap rule GET by id
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:326:3
✖ 26. Customer cannot list scrap rules
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:332:3
✖ 27. Creates formula for workflow
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:348:3
✖ 28. Submits formula
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:357:3
✖ 29. Approves formula
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:367:3
✖ 30. Preview NOT_READY without engineering approval
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:380:3
✖ 31. Preview API returns NOT_READY for unready cable
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:390:3
✖ 32. Preview rejects missing materialNumber
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:399:3
✖ 33. Preview NOT_READY for unknown cable
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:412:3
✖ 34. Seeds approved engineering mapping
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:428:3
✖ 35. Seeds governed BOM with scrap
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:442:3
✖ 36. Seeds approved price
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:459:3
✖ 37. Preview READY with material breakdown
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:474:3
✖ 38. Preview applies BOM line scrap source
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:490:3
✖ 39. GET /audit returns costing events
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:496:3
✖ 40. GET /approval-queue returns structure
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:504:3
✖ 41. Scrap rule activation creates audit event
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:512:3
✖ 42. Preview with active config evaluates layers
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseD.test.ts:42:1
✖ Increment 13 — Phase D (Configuration UI + Orchestration) (1.6152ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment13.phaseD.test.ts:77:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment13.phaseE.test.ts:244:3
✖ buildLayerInputsFromCommercialMetadata snapshots header metal rates
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:253:3
✖ buildCostingRequestFromInquiryLine passes header incoterms and destination
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:271:3
✖ buildCostingRequestFromInquiryLine passes cutting length and drum to orchestrator metadata
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:288:3
✖ calculateInquiryLineCost persists CostingCalculation when READY
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:296:3
✖ calculateInquiryLineCost returns DRUM_CONFIGURATION_REQUIRED when drum is not on Drum Master
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:321:3
✖ calculateInquiryLineCost auto-approves DRAFT engineering mapping
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:340:3
✖ calculateInquiryLineCost still blocks REJECTED engineering mapping
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:360:3
✖ getInquiryLineCosting returns breakdown snapshot
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:381:3
✖ customer projection hides internal costing fields including material cost
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:394:3
✖ updateInquiryLine marks costing stale on qty change
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:405:3
✖ applies configured logistics rule cost and does not invent unmatched shipping
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:476:3
✖ calculate without material number returns BOM_NOT_READY
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:490:3
✖ calculateInquiryCost runs every line and reports structured codes
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:538:3
✖ submitInquiry locks recalculation
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:549:3
✖ submitInquiry rejects mapped lines without calculation
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:580:3
✖ createQuotationFromInquiry copies costingCalculationId snapshot per line
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:595:3
✖ POST /api/inquiries/:id/calculate-cost is registered and does not 404
  'test did not finish before its parent and was cancelled'

test at src\server\increment13.phaseE.test.ts:46:1
✖ Increment 13 — Phase E inquiry costing integration (1.8455ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment13.phaseE.test.ts:81:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment14.costingWorkspace.test.ts:82:3
✖ customer cannot view costing configuration
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:86:3
✖ customer receives 403 on costing readiness summary
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:93:3
✖ readiness summary uses evaluateCableCostingReadiness domain counts
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:109:3
✖ readiness cables list is paginated and shaped
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:125:3
✖ readiness cable detail merges governance and engine probe
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:138:3
✖ production readiness live control is not PRODUCTION READY
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:167:3
✖ golden regression probe covers ENERGYA probe cables
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:179:3
✖ customer receives 403 on costing readiness
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:186:3
✖ admin preview does not persist a CostingCalculation
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:205:3
✖ readiness matrix covers the four ELAND regression cables without inventing totals
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:223:3
✖ approval queue includes raw material prices for Costing Team
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:233:3
✖ scrap rules flag undefined overlap as BUSINESS_RULE_REQUIRED
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:241:3
✖ variables include usedBy without inventing formula links
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:252:3
✖ lookups expose families, ACTIVE cables, and official RM only
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:269:3
✖ auto-assigns unique SC26-##### scrap codes and keeps explicit test codes
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:320:3
✖ workspace KPIs are live counts, not mock 256/212
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:332:3
✖ BOM costing validate uses orchestrator and does not persist
  'test did not finish before its parent and was cancelled'

test at src\server\increment14.costingWorkspace.test.ts:31:1
✖ Increment 14 — Costing Team workspace APIs (1.5031ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment14.costingWorkspace.test.ts:66:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment4.readiness.test.ts:112:3
✖ imports the labeled fixture cable, searches it, and persists structured fields
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:136:3
✖ does not wipe family when Cable List reimport omits Family column
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:159:3
✖ Test A: fixture approved cable is EXISTING_CABLE
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:168:3
✖ Test A-official: identity-only lookup of a Cable List material is EXISTING_CABLE
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:176:3
✖ Test B: one valid parameter change is TECHNICALLY_VALID_NOT_MASTER
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:186:3
✖ Test C: invalid configuration is INVALID_CONFIGURATION
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:195:3
✖ Test D: missing FAMILY/CORE_COLOUR rule is CONFIGURATION_REQUIRED
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:203:3
✖ raw material CRUD, duplicate detection, blank price, and history without invented dates
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:252:3
✖ official Cable List is persisted (432) without fabricating rows
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:289:3
✖ BOM lines require Cable Master and Raw Material FKs
  'test did not finish before its parent and was cancelled'

test at src\server\increment4.readiness.test.ts:102:1
✖ Increment 4 PostgreSQL readiness (fixture data only) (1.3153ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment4.readiness.test.ts:105:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment5.governance.test.ts:68:3
✖ preserves all BOM conflict groups and does not overwrite weights on classification
  'test did not finish before its parent and was cancelled'

test at src\server\increment5.governance.test.ts:95:3
✖ rejects an unknown BOM classification and does not delete the group
  'test did not finish before its parent and was cancelled'

test at src\server\increment5.governance.test.ts:109:3
✖ does not match structured configurator fields against unmapped official cables
  'test did not finish before its parent and was cancelled'

test at src\server\increment5.governance.test.ts:122:3
✖ keeps blank RM prices as PRICE_NOT_CONFIGURED and never stores zero
  'test did not finish before its parent and was cancelled'

test at src\server\increment5.governance.test.ts:135:3
✖ reports material number unique and item/customer codes not unique
  'test did not finish before its parent and was cancelled'

test at src\server\increment5.governance.test.ts:48:1
✖ Increment 5 PostgreSQL governance (0.9568ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment5.governance.test.ts:51:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment6.approval.test.ts:92:3
✖ Test 1: Cable with no approved mapping (DRAFT) evaluates to CONFIGURATION_REQUIRED for structured search
  'test did not finish before its parent and was cancelled'

test at src\server\increment6.approval.test.ts:106:3
✖ Test 3: Draft mapping remains CONFIGURATION_REQUIRED and does not produce false EXISTING_CABLE
  'test did not finish before its parent and was cancelled'

test at src\server\increment6.approval.test.ts:136:3
✖ Test 5: Approving mapping with invalid parameter compatibility is blocked with error
  'test did not finish before its parent and was cancelled'

test at src\server\increment6.approval.test.ts:155:3
✖ Test 4: Rejected mapping evaluates to CONFIGURATION_REQUIRED
  'test did not finish before its parent and was cancelled'

test at src\server\increment6.approval.test.ts:174:3
✖ Test 6: Customer role cannot edit or approve engineering mapping (403 UNAUTHORIZED)
  'test did not finish before its parent and was cancelled'

test at src\server\increment6.approval.test.ts:186:3
✖ Test 7 & Test 2: Technical Office valid approval makes the mapping authoritative (EXISTING_CABLE)
  'test did not finish before its parent and was cancelled'

test at src\server\increment6.approval.test.ts:231:3
✖ Test 8: Editing an approved mapping creates an immutable revision history
  'test did not finish before its parent and was cancelled'

test at src\server\increment6.approval.test.ts:16:1
✖ Increment 6 — Engineering Mapping & Technical Office Approval Workflow (1.4845ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment6.approval.test.ts:24:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment7.workbench.test.ts:104:3
✖ Test 1: Excel mapping import parses and updates draft engineering mapping without changing CableMaster source values
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:139:3
✖ Test 2: Excel import with unknown Material Number fails validation and is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:156:3
✖ Test 3: Excel import with duplicate Material Number rows is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:179:3
✖ Test 4: Excel import with invalid parameter value is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:196:3
✖ Test 5: Excel import with incompatible Family/Voltage combination is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:213:3
✖ Test 6 & 7: Valid mappings in Draft status can be bulk validated and submitted
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:251:3
✖ Test 8: Customer attempting bulk approval is blocked with 403 UNAUTHORIZED
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:259:3
✖ Test 9 & 10: Authorized Technical Office Manager batch approval succeeds and creates one audit event per record
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:288:3
✖ Test 11 & 12: Updating an approved mapping creates Revision V2 while V1 remains immutable and approved
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:317:3
✖ Test 14: Cable Authority evaluates APPROVED mapping (testMat2) as EXISTING_CABLE
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:332:3
✖ Test 15: Cable in DRAFT status (testMat1 V2) evaluates to CONFIGURATION_REQUIRED
  'test did not finish before its parent and was cancelled'

test at src\server\increment7.workbench.test.ts:19:1
✖ Increment 7 — Technical Office Engineering Workbench & Batch Approval (1.5455ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment7.workbench.test.ts:28:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment8.bom.test.ts:90:3
✖ Test 1: All 81 conflict groups are preserved in BomDuplicateObservation without loss
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:99:3
✖ Test 2, 9, 10, 11: Original source weights and row counts remain preserved and immutable
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:114:3
✖ Test 3: Technical Office can classify conflict with governed category
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:129:3
✖ Test 4: Resolving conflict requires mandatory evidence according to classification category
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:165:3
✖ Test 5: Customer cannot approve BOM governance decision (403 UNAUTHORIZED)
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:173:3
✖ Test 6 & 7: Authorized Technical Office Manager approval creates GovernedBomLine and AuditEvent
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:203:3
✖ Test 8: Reopening an approved BOM conflict marks GovernedBomLine as UNDER_REVIEW
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:218:3
✖ Test 12: Source UOM (kg, PCS, m2) is preserved without fake conversions
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:227:3
✖ Test 13: Missing RM price (PRICE_NOT_CONFIGURED) blocks costing readiness
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:236:3
✖ Test 14: Cable with unapproved engineering mapping is NOT_READY or UNDER_REVIEW
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:244:3
✖ Test 15: Approved mapping + resolved BOM evaluated with transparent blocking reasons
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:291:3
✖ Test 16: Cable associated with an unresolved BOM conflict is flagged as CONFLICT_UNRESOLVED
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:318:3
✖ Test 17: Approved cable mapping continues evaluating to EXISTING_CABLE
  'test did not finish before its parent and was cancelled'

test at src\server\increment8.bom.test.ts:18:1
✖ Increment 8 — BOM Governance & Material Consumption Review (1.5205ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment8.bom.test.ts:27:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\increment9.price.test.ts:109:3
✖ Test 1: Create price draft proposals in DRAFT status
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:133:3
✖ Test 2: Blank price is rejected with PRICE_NOT_CONFIGURED
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:143:3
✖ Test 3: Zero price (price = 0) is rejected as INVALID_PRICE
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:153:3
✖ Test 4: Negative price is rejected as INVALID_PRICE
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:163:3
✖ Test 5: Unknown raw material code is rejected with RAW_MATERIAL_NOT_FOUND
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:173:3
✖ Test 6: Invalid currency string is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:183:3
✖ Test 7: Invalid UOM string is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:193:3
✖ Test 8: Effective From after Effective To is rejected
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:209:3
✖ Test 9: Overlapping approved price periods for identical parameters are detected
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:243:3
✖ Test 10: Submitting and approving a valid price updates workflowStatus to APPROVED
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:256:3
✖ Test 11: Adding a new price revision preserves historical approved price immutably
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:284:3
✖ Test 12: Price evaluation detects expired pricing when costing date is past effectiveTo
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:308:3
✖ Test 13: Correct price record selected matching specific costing date
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:352:3
✖ maps PCS BOM consumption to PER_PCS so piece items are not looked up as PER_KG
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:357:3
✖ Test 14: Unpriced raw material blocks costing readiness with PRICE_NOT_CONFIGURED
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:363:3
✖ mentions an existing DRAFT price instead of implying the material has no price row
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:388:3
✖ Test 15: Expired price blocks readiness evaluation
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:417:3
✖ Test 16: ton price is valid against kg BOM via governed MT→kg conversion
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:442:3
✖ Test 16b: PCS price is incompatible with kg BOM
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:465:3
✖ Test 17: Currency mismatch blocks readiness without automated FX conversion
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:489:3
✖ Test 18: Cable with unapproved engineering mapping is NOT_READY or UNDER_REVIEW
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:497:3
✖ Test 19: Cable with unapproved BOM conflict fails Gate 2 and is DATA_ISSUE
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:522:3
✖ Test 20: Cable satisfying all 4 gates is classified as READY_FOR_COSTING
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:576:3
✖ Test 21: Customer role blocked from modifying prices (403 UNAUTHORIZED)
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:584:3
✖ Test 22: Unauthorized role blocked from approving prices
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:592:3
✖ Test 23: Approving price creates immutable AuditEvent
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:601:3
✖ Test 24: Excel price import validates unknown RM and bad currency/price
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:611:3
✖ Test 25: Excel price import creates records in DRAFT status only
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:629:3
✖ Test 26: Platform components continue functioning with full governance integration
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:634:3
✖ Bulk approve only processes SUBMITTED prices and skips drafts
  'test did not finish before its parent and was cancelled'

test at src\server\increment9.price.test.ts:26:1
✖ Increment 9 — Raw Material Price Governance & Costing Readiness (1.6649ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\increment9.price.test.ts:37:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\marketMetalPriceDefaults.test.ts:129:3
✖ customer cannot access market metal price defaults
  'test did not finish before its parent and was cancelled'

test at src\server\marketMetalPriceDefaults.test.ts:137:3
✖ 1-2 GET active copper and aluminium defaults
  'test did not finish before its parent and was cancelled'

test at src\server\marketMetalPriceDefaults.test.ts:147:3
✖ 3-4 new inquiry does not inherit an arbitrary system default
  'test did not finish before its parent and was cancelled'

test at src\server\marketMetalPriceDefaults.test.ts:164:3
✖ 5 existing inquiry snapshot is unchanged when the system default changes
  'test did not finish before its parent and was cancelled'

test at src\server\marketMetalPriceDefaults.test.ts:186:3
✖ 6 header override stays on the inquiry and is not replaced by the system default
  'test did not finish before its parent and was cancelled'

test at src\server\marketMetalPriceDefaults.test.ts:207:3
✖ writes CREATED/ACTIVATED audit for market metal defaults
  'test did not finish before its parent and was cancelled'

test at src\server\marketMetalPriceDefaults.test.ts:31:1
✖ Market metal price defaults — admin + inquiry create (1.6064ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\marketMetalPriceDefaults.test.ts:72:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\masterData.persistence.test.ts:22:3
✖ reports database connectivity
  'test did not finish before its parent and was cancelled'

test at src\server\masterData.persistence.test.ts:28:3
✖ creates and reads a cable without inventing a sales price
  'test did not finish before its parent and was cancelled'

test at src\server\masterData.persistence.test.ts:59:3
✖ persists raw materials with PRICE_NOT_CONFIGURED and no zero price row
  'test did not finish before its parent and was cancelled'

test at src\server\masterData.persistence.test.ts:88:3
✖ Task 04: PostgreSQL cable wins over stale local payload
  'test did not finish before its parent and was cancelled'

test at src\server\masterData.persistence.test.ts:122:3
✖ Task 04: drum status update is PostgreSQL + AuditEvent
  'test did not finish before its parent and was cancelled'

test at src\server\masterData.persistence.test.ts:12:1
✖ Increment 2 PostgreSQL master data (1.414ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\masterData.persistence.test.ts:15:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\phase1.quoteToCash.test.ts:187:3
✖ rejects commercial approval without pricing approval
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:210:3
✖ DIRECT_ORDER: approve → commitment → multiple partial sales orders with remaining qty
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:272:3
✖ SALES_AGREEMENT: approve → commitment → agreement → releases with remaining qty tracking
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:339:3
✖ does not create commitment from non-approved quotation
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:351:3
✖ F: commercially approved revision is immutable (re-approve / reprice blocked)
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:376:3
✖ G: new revision after commercial approval resets approval on Vn+1; prior stays APPROVED
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:398:3
✖ H: SO snapshot independent of later quotation / line mutation
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:422:3
✖ I: duplicate direct-order create is idempotent (one document)
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:439:3
✖ J: duplicate agreement release is idempotent; over-release message includes qty breakdown
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:476:3
✖ K: fulfillment succeeds while D365 adapters remain NOT_IMPLEMENTED
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:518:3
✖ L: MTS → Direct Sales Order without quotation / Commercial Commitment
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:563:3
✖ M: prevent Direct MTS for MTO-only cables; allow MTS and MTO_MTS
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:605:3
✖ N: Direct MTS preserves drum/cutting; records DIRECT_MTS; idempotent; D365 NOT_IMPLEMENTED
  'test did not finish before its parent and was cancelled'

test at src\server\phase1.quoteToCash.test.ts:27:1
✖ Phase 1 — Quote-to-Cash domain (commitment / SO / agreement / release) (1.8455ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\phase1.quoteToCash.test.ts:118:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\quotationRevisionLookup.test.ts:91:3
✖ one revision returns that revision selling price
  'test did not finish before its parent and was cancelled'

test at src\server\quotationRevisionLookup.test.ts:97:3
✖ multiple revisions: number-only returns the original, and each versionNo returns its own price
  'test did not finish before its parent and was cancelled'

test at src\server\quotationRevisionLookup.test.ts:107:3
✖ Version A and V2 sharing a quotation number each return their own selling price
  'test did not finish before its parent and was cancelled'

test at src\server\quotationRevisionLookup.test.ts:116:3
✖ V2 with a pricing snapshot returns that snapshot price
  'test did not finish before its parent and was cancelled'

test at src\server\quotationRevisionLookup.test.ts:124:3
✖ older revision does not return the latest selling price
  'test did not finish before its parent and was cancelled'

test at src\server\quotationRevisionLookup.test.ts:130:3
✖ latest revision does not return the older selling price
  'test did not finish before its parent and was cancelled'

test at src\server\quotationRevisionLookup.test.ts:136:3
✖ missing snapshot does not borrow another revision selling price
  'test did not finish before its parent and was cancelled'

test at src\server\quotationRevisionLookup.test.ts:20:1
✖ Quotation revision lookup (1.6875ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\quotationRevisionLookup.test.ts:38:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\reportRuntime.persistence.test.ts:68:3
✖ rejects creating a report on a non-whitelisted entity
  'test did not finish before its parent and was cancelled'

test at src\server\reportRuntime.persistence.test.ts:83:3
✖ creates and runs a CommercialInquiry count report
  'test did not finish before its parent and was cancelled'

test at src\server\reportRuntime.persistence.test.ts:28:1
✖ Phase 10 report runtime persistence (1.5555ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\reportRuntime.persistence.test.ts:36:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\shippingCostMaster.e2e.test.ts:325:3
✖ freezes 3100 through Container Study and issued quotation while a later 3500 version does not rewrite history
  'test did not finish before its parent and was cancelled'

test at src\server\shippingCostMaster.e2e.test.ts:115:1
✖ shipping cost master e2e — study snapshot issue freeze (1.5368ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\shippingCostMaster.e2e.test.ts:238:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\standaloneCommercialFulfillment.test.ts:344:3
✖ V2 DIRECT_ORDER: customer commitment → internal SO with lineage snapshot
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:369:3
✖ V2 SALES_AGREEMENT: commitment → agreement → release → SO
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:397:3
✖ customer can read own SO/agreement; IDOR blocked for other customer
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:419:3
✖ customer cannot create sales orders or releases
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:446:3
✖ rejects commitment on non-issued V2 quotation
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:472:3
✖ Direct MTS path works without quotation or commitment
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:496:3
✖ blocks over-release on agreement lines
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:522:3
✖ repository pins inquiryId on commitment from V2 quotation
  'test did not finish before its parent and was cancelled'

test at src\server\standaloneCommercialFulfillment.test.ts:51:1
✖ Task 05H — standalone commercial fulfillment (1.6185ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\standaloneCommercialFulfillment.test.ts:158:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at src\server\v2CableSearch.test.ts:175:3
✖ requires sign-in
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:180:3
✖ finds an exact Material Number
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:193:3
✖ finds an Item Code
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:203:3
✖ filters by family
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:214:3
✖ filters by voltage
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:224:3
✖ filters by standard
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:234:3
✖ filters by conductor
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:244:3
✖ applies multiple filters
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:257:3
✖ returns no result for an unknown construction
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:266:3
✖ paginates server-side
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:285:3
✖ normalizes search input without rewriting stored values
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:302:3
✖ does not leak costing or price fields
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:314:3
✖ POST search is read-only 405 and does not create a Material Number
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:330:3
✖ customer cannot create Cable Master records
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:350:3
✖ internal users can search the same catalog
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:359:3
✖ customer can request Technical Office review and cannot list TO queues
  'test did not finish before its parent and was cancelled'

test at src\server\v2CableSearch.test.ts:33:1
✖ V2 Advanced Cable Search (1.4694ms)
  AssertionError [ERR_ASSERTION]: DATABASE_URL is not set
  
  false !== true
  
      at SuiteContext.<anonymous> (C:\Users\mahmoud.mohamed\Desktop\personal\ELAND-CABLES\energya-connect-platform-main\energya-connect-platform-main\src\server\v2CableSearch.test.ts:109:12)
      at async TestHook.run (node:internal/test_runner/test:1389:7)
      at async Suite.runHook (node:internal/test_runner/test:1269:9)
      at async Suite.run (node:internal/test_runner/test:1863:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
