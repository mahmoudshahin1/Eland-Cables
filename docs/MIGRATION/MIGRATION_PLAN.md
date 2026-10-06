# Energya Connect: خطة الترحيل (Legacy → NestJS + Vue)

> **المبدأ:** Feature Parity أولًا. ممنوع أي Feature جديدة قبل ما كل Logic وكل Endpoint وكل شاشة في القديم تشتغل في الجديد بنفس النتيجة.

---

## 1. الوضع الحالي (أرقام مقاسة من الريبو)

| المكوّن | القديم (Legacy) | الجديد (Target) |
|---|---|---|
| Backend | Express 4 في `src/server/` + `server.ts` (111 ملف، حوالي 48 ألف سطر، **529 endpoint**) | NestJS في `energya-backend/` (حوالي 1.9 ألف سطر، 4 modules، **Skeleton**) |
| Domain / Services | `src/domain` + `src/services` + `src/platform` (حوالي 36 ألف سطر، TypeScript نقي) | غير منقول |
| Frontend | React 19 في `src/components` (209 ملف، حوالي 69 ألف سطر) | Vue 3 + Pinia في `energya-frontend/` (7 صفحات) |
| Database | PostgreSQL + Prisma: **135 model، 72 enum، 60+ migration** | نسخة مكررة من نفس الـ schema |
| Tests | 227 ملف (حوالي 55 ألف سطر) | ملف واحد فاضي تقريبًا |

**حالة الـ Nest الحالية:** الكود الموجود (auth / admin / master-data / inquiries) نسخة مبسطة ومش مطابقة للقديم، وفيها login تجريبي وبيانات وهمية. يُعتبر **مسودة**: لو اختلف عن القديم، نستبدله ونعيد كتابته ولا نبني عليه.

---

## 2. القواعد الثابتة

1. **القديم Frozen:** مجلدات `src/`، `server.ts`، `prisma/` (الجذر) مرجع للقراءة فقط. لا تعديل فيها إلا لإصلاح عائق تشغيل، ويتسجل في `MIGRATION_STATUS.md`.
2. **نفس الـ URLs ونفس شكل الـ Responses ونفس Status Codes ونفس رسائل الأخطاء.** أي اختلاف يعتبر Bug.
3. **ممنوع Mock Data وممنوع Demo Login** في الكود. الداتا الحقيقية من PostgreSQL فقط. (استثناء واحد: `DEMO_MODE=true` وبيتعطل لو `NODE_ENV=production`.)
4. **ممنوع أي Secret في الكود.** `JWT_SECRET` إلزامي والتطبيق يرفض يشتغل بدونه.
5. **كل Route محمي بـ Guard + Permission** بنفس صلاحيات القديم، وكل Body/Query له DTO فيه validation. ممنوع `any`.
6. **منطق الأعمال بيتنقل ولا يُعاد تصميمه.** نفس المعادلات ونفس الأسماء ونفس القرارات.
7. **module واحد في كل مرة.** لا بنبدأ module تاني قبل ما الأول يعدّي كل الـ Gates.
8. **مفيش Feature جديدة** قبل Phase 10.

---

## 3. الهيكل المستهدف

```
/
├─ src/ , server.ts , prisma/        ← Legacy (Frozen، مصدر الـ schema الوحيد أثناء الترحيل)
├─ energya-backend/
│   └─ src/
│       ├─ common/        ← guards, decorators, filters, pipes, config (env validation)
│       ├─ shared/domain/ ← منطق نقي منقول من src/domain (بدون Express/React)
│       └─ modules/<name>/
│            ├─ <name>.controller.ts   (رفيع: routing + DTO فقط)
│            ├─ <name>.service.ts      (منطق الأعمال)
│            ├─ <name>.repository.ts   (Prisma فقط)
│            ├─ dto/
│            └─ *.spec.ts              (اختبارات منقولة من القديم)
├─ energya-frontend/                 ← Vue 3 + Pinia + Tailwind
├─ scripts/parity/                   ← أدوات مقارنة القديم بالجديد
└─ docs/MIGRATION/
     ├─ MIGRATION_PLAN.md            (الملف ده)
     ├─ MIGRATION_STATUS.md          (التتبع، يتحدث بعد كل module)
     ├─ ENDPOINT_INVENTORY.md        (كل الـ 529 endpoint)
     └─ BASELINE_TESTS.md            (نتيجة اختبارات القديم قبل أي نقل)
```

**الـ Prisma:** مصدر واحد هو `prisma/` في الجذر. الـ Nest يشير له (`prisma.schema = "../prisma/schema.prisma"`) وتتحذف نسخة `energya-backend/prisma`. عند القطع النهائي (Phase 10) بيتنقل لمكانه النهائي.

---

## 4. بوابات القبول (Gates): module ما يتقفلش إلا بعد الخمسة

| Gate | الشرط | الإثبات |
|---|---|---|
| **G1 Contract** | كل endpoint في الـ module بيرجع نفس الـ JSON والـ status code زي القديم | تقرير `scripts/parity` فيه 0 اختلاف |
| **G2 Tests** | اختبارات القديم الخاصة بالـ module اتنقلت وبتنجح | `npm test` في الـ backend أخضر + عدد الاختبارات المنقولة مذكور |
| **G3 UI** | شاشات React القديمة الخاصة بالـ module شغالة على Nest بدون خطأ | Checklist يدوي (قائمة الشاشات + نتيجة كل واحدة) |
| **G4 Quality** | build + lint ناجحين، لا `any` في DTOs، كل Route عليه Guard، لا mock، لا secret | مخرجات الأوامر |
| **G5 Docs** | `MIGRATION_STATUS.md` متحدّث وفيه أي اختلاف مقصود | الملف نفسه |

### طريقة الـ Parity Harness (`scripts/parity/`)
- يشغّل نفس قائمة الطلبات (fixtures) على Legacy (`:3847`) وعلى Nest (`:3000`).
- **القراءة (GET):** على نفس قاعدة البيانات.
- **الكتابة (POST/PUT/PATCH/DELETE):** على نسختين من الداتابيز (`energya_legacy` و`energya_nest`) من نفس الـ seed، وبعدها يقارن الـ responses وحالة الجداول.
- يطبّع الحقول المتغيرة (timestamps, generated ids, tokens) قبل المقارنة.
- الناتج: تقرير لكل endpoint (متطابق / مختلف + الـ diff).

---

## 5. المراحل

### Phase 0: الأساس والأمان
**الهدف:** أرضية نضيفة وآمنة وقابلة للقياس قبل نقل أي منطق.

1. فرع جديد `migration/phase-0`.
2. **Inventory:** سكربت يولّد `ENDPOINT_INVENTORY.md` (method, path, ملف الـ router، الـ middleware/permission، الـ module الهدف) من `server.ts` وملفات `src/server/*Routes.ts`.
3. **Baseline:** تشغيل `npm test` في القديم وتسجيل النتيجة (الناجح والفاشل) في `BASELINE_TESTS.md` قبل ما نلمس حاجة.
4. **البنية التحتية:** `docker-compose up` للداتابيز، `prisma migrate deploy`، seed، ووثّق الأوامر.
5. **تنظيف Nest الحالي:**
   - حذف الـ login التجريبي والـ mock data (أو حصرهم في `DEMO_MODE` المعطّل في production).
   - `ConfigModule` مع validation: `JWT_SECRET` (32+ حرف)، `DATABASE_URL`، `CORS_ORIGIN` كلها إلزامية.
   - `helmet`، CORS على origin محدد، rate limit على `/api/auth/login`.
   - `ValidationPipe` عام (`whitelist`, `forbidNonWhitelisted`, `transform`).
   - `ExceptionFilter` عام يرجّع **نفس شكل أخطاء القديم** (يُستخرج من `src/platform/errors`).
6. توحيد `prisma/` (انظر القسم 3).
7. بناء `scripts/parity/` (الهيكل + fixtures لـ `/api/platform/health` كاختبار أول).
8. **Legacy-React-on-Nest:** سكربت `dev:legacy-ui` يشغّل Vite للـ React القديم مع proxy لـ `/api` على Nest (`:3000`).
9. إنشاء `MIGRATION_STATUS.md`.

**Definition of Done:** Nest بيشتغل على داتابيز حقيقية بدون أي mock، الـ inventory كامل، الـ baseline متسجل، الـ parity harness بيشتغل على endpoint واحد على الأقل، والـ React القديم بيفتح صفحة الدخول على Nest.

---

### Phase 1: Auth / Identity / RBAC / Admin
**السبب:** كل حاجة بعدها بتعتمد عليه.

| Legacy | Nest module |
|---|---|
| `identityAuthRoutes`, `identityService`, `auth.ts` | `auth` |
| `rbac.ts` (1122 سطر), `customerScope.ts` | `common/rbac` (Guards + `@RequirePermission`) |
| `adminIdentityRoutes`, `identityAdminRepository` | `admin-identity` |
| `adminCustomerRoutes`, `customerAdminRepository`, `customerMigration` | `admin-customers` |
| `httpSecurity.ts` | `common` (helmet/CORS) |

**Mounts:** `/api/auth`, `/api/admin` (identity + customers).
**لازم يتطابق:** login / refresh / me / logout / change-password / reset-password، الـ lock بعد `LOGIN_LOCK_THRESHOLD`، الـ RBAC hydration من الداتابيز في كل طلب، عزل بيانات العميل (Customer isolation)، الـ audit.
**DoD:** G1–G5 + اختبارات identity/rbac/customerScope منقولة.

---

### Phase 2: Master Data
| Legacy | Nest module |
|---|---|
| `masterDataRoutes`, `masterDataRepository`, `governanceRepository` | `master-data` |
| `marketMetalImportRoutes`, `marketMetalPriceDefaultRepository` | `market-metal` |
| `masterDataCutoverRoutes`, `masterDataExportRoutes/Service` | `master-data-export` |
| `drumMasterWriteRepository`, `bomConflictGovernanceService`, `rawMaterialPriceGovernance` | `drum-master`, `bom-governance` |
| `excelWorkbook`, `importPipelineService` | `import-center` |

**Mounts:** `/api/master`, `/api/master/commercial-pricing-rules`, `/api/platform` (db).
**ملاحظات:** `data/source/*.xlsx` هي مصدر الـ Import. المقارنة بعد Import كامل: Cable List (432) وRaw Materials (74) لازم يطلعوا بنفس الأعداد.
**DoD:** G1–G5 + Import كامل بنفس العدد والنتيجة على الـ workbooks الرسمية.

---

### Phase 3: Cable Authority / Technical Office / Cable Search
**Mounts:** `/api/cables`, `/api/technical-office`, `/api/v2/cables`.
**Legacy:** `cableAuthorityRoutes`, `v2CableSearchRoutes`، وأي domain متعلق بالـ configurator.
**DoD:** G1–G5 + `POST /api/cables/evaluate` بنفس النتائج على عينة كبيرة.

---

### Phase 4: Commercial (Inquiries / Quotations / Pricing)
| Legacy | Nest module |
|---|---|
| `commercialRoutes`, `commercialRepository` (2212 سطر) | `inquiries`, `quotations` |
| `commercialPricingRoutes/Repository` | `commercial-pricing` |
| `v2PlatformRoutes`, `v2QuotationRepository` | `v2-quotations` |
| `v2InquiryConfigurationRoutes/Repository` | `v2-inquiry-configuration` |
| `attachmentRepository`, `inquiryExportService` | `attachments`, `inquiry-export` |
| `v2QuotationPdfService`, `commercialOfferPdfRenderer` | `pdf` |

**Mounts:** `/api/inquiries`, `/api/quotations`, `/api/commercial-pricing`, `/api/v2/inquiries`, `/api/v2` (platform).
**DoD:** G1–G5 + مقارنة ملفات الـ PDF والـ Excel الناتجة (المحتوى والأرقام).

---

### Phase 5: Costing (أعلى مخاطرة)
**Legacy:** `costingRoutes`, `costingAdminRoutes` (1913), `costingOrchestrationService`, `costingFormulaRepository`, `costingCalculatorService`, `costingWorkspaceService`, `costingRepository`, `costingScrapRuleRepository`, `costingBomScrapRepository`, `costingExchangeRateRepository`, `costingCurrencyRepository`, `costingMetalCostComponentRepository`, `costingExtensionLayers`, `costingReadinessService`, `v2CostingRunRepository`, `costingContainerStudyPinService`, `vipCalculateService`, `platformConfigurationRepository`, `platformAdminRoutes`.
**Mounts:** `/api/costing`, `/api/admin/costing`, `/api/admin/platform`.
**شرط إضافي:** **Golden tests رقمية:** نختار 30 حالة تسعير حقيقية على الأقل (كابلات مختلفة، عملات، معادن، scrap) ونقارن **كل رقم** بين القديم والجديد بدقة التقريب نفسها. أي اختلاف رقمي = مرفوض.
**DoD:** G1–G5 + تقرير Golden tests بدون اختلاف.

---

### Phase 6: Container Study / Shipping / Financial Offer / Drum Plan
**Legacy:** `containerStudyRoutes/Repository`, `containerStudyB1Repository`, `containerStudyPhysicalDrumResolver`, `inquiryContainerStudyService`, `shippingCost*`, `customerShippingCost*`, `shipmentCostSnapshot*`, `financialOfferSnapshot*`, `v2DrumPlanRepository`, `v2CuttingLengthRepository`، و`src/domain/drumOptimizationService` (1103 سطر + 1305 سطر اختبارات).
**Mounts:** `/api/v2` (container-study, shipping, customer-shipping, shipment-cost-snapshot, financial-offer).
**DoD:** G1–G5 + اختبارات `drumOptimizationService` منقولة بالكامل وناجحة.

---

### Phase 7: Workflow / Notifications / Customer Service / Commitments
**Legacy:** `workflowRoutes`, `workflowRuntimeRepository`, `standardWorkflowOrchestrator`, `notificationRoutes`, `emailOutboxService`, `customerServiceRoutes/Repository`, `supportChatRepository`, `commercialCommitmentRoutes/Repository`, + Sales Orders / Agreements / Releases.
**Mounts:** `/api/v2/workflows`, `/api/notifications`, `/api/customer-service`, `/api/commercial-commitments`, `/api/sales-orders`, `/api/sales-agreements`, `/api/agreement-releases`.
**DoD:** G1–G5.

---

### Phase 8: التكاملات والخدمات المساندة
- `aiAssistantHandler` (Gemini): `POST /api/ai/assistant`، المفتاح من الـ env فقط.
- Stubs: `/api/d365/sync-status` و`/api/advaris/mes-status` (تفضل `NOT_CONNECTED` صريحة).
- `/api/platform/health` و`/api/platform/status`.
- `productionReadiness`، سكربتات `scripts/` المهمة (import / reconciliation).
- الـ 404 الموحّد لأي `/api/*` غير موجود (بنفس شكل القديم).
**DoD:** G1–G5. **عند نهاية Phase 8: الباك إند الجديد = القديم 100%**، وكل شاشات React القديمة شغالة عليه.

---

### Phase 9: الفرونت Vue (بالتوازي مع Phases 1–8)
كل module بيخلص في الباك، شاشاته بتتبني في Vue قبل ما نبدأ اللي بعده.

| مجلد React القديم | حجمه | يتبنى مع |
|---|---|---|
| `auth`, `layout`, `ui`, `common` (الأساسيات) | حوالي 13 ألف | Phase 1 |
| `internal` (Master Data, Admin) | 7.2 ألف | Phase 1–2 |
| `cable-configurator`, `v2` | 14 ألف | Phase 3 |
| `customer`, `inquiry-quotation` | 21.5 ألف | Phase 4 |
| `costing` | 10.8 ألف | Phase 5 |
| `fulfillment` + شاشات container/shipping | 1.2 ألف + | Phase 6–7 |

**قواعد الفرونت:**
- API Client واحد (axios) بـ typed responses، والـ types تتولّد/تتشارك من الباك (DTOs).
- Pinia للـ state، Vue Router مع Guards بنفس صلاحيات الباك.
- التوكن: access token في الذاكرة، والـ refresh في `httpOnly` cookie (يتطلب تعديل صغير في الباك مسجّل كـ "اختلاف مقصود").
- كل شاشة Vue لها Checklist مقارنة مع شاشة React (نفس الحقول، نفس الأزرار، نفس النتائج).
- ممنوع بيانات ثابتة داخل الـ views.

**DoD لكل شاشة:** مطابقة وظيفية للقديمة + تعمل على الباك الجديد + مسجّلة في `MIGRATION_STATUS.md`.

---

### Phase 10: القطع النهائي (Cutover)
1. تشغيل Parity الكامل (كل الـ 529 endpoint) وGolden tests: **0 اختلاف**.
2. UAT: مستخدمو الأعمال بيجربوا السيناريوهات الأساسية (Inquiry → Costing → Quotation → PDF).
3. مراجعة أمنية نهائية (secrets, CORS, rate limit, headers, dependencies audit).
4. `Dockerfile` للباك والفرونت + CI (build + lint + test).
5. نقل `prisma/` لمكانه النهائي، وأرشفة القديم (`legacy/` أو tag في Git)، وتحديث README.
6. **بعد التوقيع فقط تبدأ الـ Features الجديدة (Phase 11).**

---

## 6. قالب التتبع `MIGRATION_STATUS.md`

```md
# Migration Status
Last updated: YYYY-MM-DD

| Phase | Module | Endpoints (done/total) | G1 | G2 | G3 | G4 | G5 | Notes |
|---|---|---|---|---|---|---|---|---|
| 0 | Foundation | - | ✅ | - | - | ✅ | ✅ | |
| 1 | Auth/RBAC | 0/NN | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## Intentional differences from legacy
- (none yet)

## Open issues / blockers
- (none yet)
```

---

## 7. المخاطر

| الخطر | الحل |
|---|---|
| ملفات ضخمة (2000+ سطر) بتتقسم غلط وتتغير النتيجة | نقسم **بعد** ما الاختبارات تنجح، مش أثناء النقل |
| اختلافات رقمية خفية في Costing (تقريب، ترتيب عمليات) | Golden tests برقم مقابل رقم |
| الاعتماد على `localStorage` في القديم | نحدد كل استخدام ونحوّله لـ API قبل ما نبني شاشته في Vue |
| تعارض الـ schema بين النسختين | مصدر واحد للـ Prisma من Phase 0 |
| الـ AI agent يخترع Endpoints أو يبسّط المنطق | الـ Prompt الملزم + الـ Gates + مراجعتك بعد كل Phase |
