# Migration Status (حالة الترحيل)

Last updated: 2026-10-16  
Active Branch: `migration/phase-2`  
Source of Truth Schema: `/prisma/schema.prisma`

---

## 1. جدول تتبع المراحل (Phase Progress Tracker)

| Phase | Module | Endpoints (done/total) | G1 (Contract) | G2 (Tests) | G3 (UI) | G4 (Quality) | G5 (Docs) | Notes |
|---|---|---|---|---|---|---|---|---|
| **Phase 0** | **Foundation & Security** | **2 / 2** | ⬜ | ✅ | ⬜ | ✅ | ✅ | الأساس، الأمان، تنظيف Mock، الفلاتر، توحيد Prisma |
| **Phase 1** | **Auth / RBAC / Identity** | **49 / 49** | ✅ | ✅ | ✅ | ✅ | ✅ | **مكتملة ومعتمدة**: Parity (150/150 + 45/45)، اختبارات G2 (27 unit + 70 e2e)، وUI مربوطة (7/7 شاشات 200 OK) |
| **Phase 2a** | **Master Data Read & Drums** | **36 / 36** | ✅ | ✅ | ✅ | ✅ | ✅ | **مكتملة 100%**: Parity موسع (95/95 فحصاً مطابقاً 100%)، 36 مساراً (/master و/platform)، 5 شخصيات، فلاتر وترقيم، ملف 5MB بايت ببايت، واختبارات كسر متعمد، وPlaywright على 5173 عبر Vite proxy مع X-Served-By: nest (55/103 طلب من Nest)، وحزمة الإغلاق الأربعة في phase-2a/ جاهزة للمراجعة |

| Phase 2b | Master Data CRUD, Imports, Metals | 0 / 52 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | بانتظار الاعتماد للبدء (ممنوع البدء قبل قرار المستخدم) |
| Phase 2c | Governance & Workflow Engines | 0 / 42 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | بانتظار الاعتماد للبدء (ممنوع البدء قبل قرار المستخدم) |
| Phase 3 | Cable Authority & Configurator | 0 / 16 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 4 | Commercial (Inquiries & Quotations) | 0 / 182 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | تشمل البنود المؤجلة من Phase 1 (عزل الاستفسارات TEST 1-4) |
| Phase 5 | Costing & Pricing Engine | 0 / 109 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | أعلى مخاطرة - Golden tests رقمية |
| Phase 6 | Container Study & Logistics | 0 / 54 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | يعيد استخدام منطق البراميل من `shared/domain` |
| Phase 7 | Workflows & Commitments | 0 / 39 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 8 | Integrations (D365, Advaris, AI) | 0 / 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| **الإجمالي** | **الكلي** | **87 / 585** | - | - | - | - | - | |

---

## 2. السجل الأمني المكتشف (Security Findings Log)

| الرمز | المسارات المعنية | نوع الثغرة / الخلل في القديم | حالة الـ Parity في 2a | التوصية والقرار |
|---|---|---|:---:|---|
| **SEC-MD-01** | `GET /api/master/boms`<br>`GET /api/master/raw-materials` | تسريب كامل للخلطات التصنيعية (4,822 سطر BOM) وكافة الخامات (74 خامة) لأي مستخدم من نوع `customer` بسبب غياب عزل العميل وسماح `assertCanViewMasterDataCatalog` الفوري للعميل. | منقولة 1:1 لضمان تطابق الـ Parity | موثقة رسمياً. تم الإثبات عملياً باسترجاع الـ 4,822 سطراً والـ 74 خامة بتوكن عميل (`custA@parity.test`) برمز 200 OK. يُقترح تشديدها مستقبلاً بحظر وصول العميل (403) وقصر اطلاعه على كتالوج الكابلات المنقى فقط (بانتظار قرار المستخدم). |
| **SEC-MD-02** | `GET /api/master/cables/:mat/attachments`<br>`GET .../:attachmentId` | مسارات قراءة وتحميل المرفقات الهندسية والملفات الثنائية متاحة للجميع بدون أي توكن مصادقة (Public No Auth) مع تخزين الملفات كـ Bytes. | منقولة 1:1 لضمان تطابق الـ Parity | موثقة رسمياً. إثبات عملي بدون توكن استرجع قائمة المرفقات بـ 200 OK وحمّل الملف كاملاً بـ 200 OK. يُقترح فرض المصادقة مستقبلاً (بانتظار قرار المستخدم). |

---

## 3. سجل نسخ الـ Domain والتحقق من التزامن (Domain Copies Registry)

لتفادي انحراف المنطق بين واجهة React ومخدم NestJS:
- **الملف 1**: `src/domain/drumOptimizationService.ts` ↔ `energya-backend/src/shared/domain/drumOptimizationService.ts`
- **الملف 2**: `src/domain/drumCapacityCalculator.ts` ↔ `energya-backend/src/shared/domain/drumCapacityCalculator.ts`
- **الملف 3**: `src/domain/drumOptimizationPresentation.ts` ↔ `energya-backend/src/shared/domain/drumOptimizationPresentation.ts`
- **آلية التحقق**: سكريبت `scripts/parity/verify-domain-sync.mjs` يفحص تطابق SHA256 للنسخ ويفشل عند وجود أي اختلاف، ومربوط ضمن `npm run verify`.
- **ملاحظة**: الملفات المنقولة كبيرة ومحمية من التضخم أو التعديل الأحادي، وموجودة في `src/shared/domain/` لإعادة استخدامها في Phase 6 (Container Study).

---

## 4. بنود مؤجلة رسمياً (Deferred Tests Log)

### أ) مؤجل من Phase 1 إلى Phase 4 (Commercial & Inquiries):
- **TEST 1-4: Customer Inquiry Scoping & Multi-Tenancy (عزل استفسارات العملاء):**  
  تم تسجيل الحالات الأربع كـ `it.todo(...)` داخل جناح اختبارات `increment12b2_1.securityHardening.e2e-spec.ts`. هذه الحالات تختبر عزل بيانات الاستفسارات على مسار `/api/inquiries`، وقد أُجّلت صراحة إلى Phase 4 (Commercial & Inquiries) لارتباطها بالـ Inquiries Controller و Inquiries Service والـ Scoping المنفصل للاستفسارات.

### ب) مؤجل من Phase 2a إلى Phase 2b (CRUD & Export):
- **TEST Customer Safe Excel Export (`exports customer-safe Excel`):**  
  مسجل كـ `it.todo(...)` في `customerCableCatalog.server.e2e-spec.ts`. السبب: مسارات تصدير ملفات الإكسل تنتمي تنظيمياً إلى Phase 2b (`/export/*`).

### ج) مؤجل من Phase 2a إلى Phase 2c (Governance & Workflows):
- **9 اختبارات حوكمة الـ BOM في `increment8.bom.e2e-spec.ts`:**  
  مسجلة كـ `it.todo(...)`، وتشمل:
  1. `creates BOM conflict observation on duplicate raw material`
  2. `requires sign-in to review conflicts`
  3. `allows TO Reviewer to assign and start review`
  4. `enforces state machine transitions on conflict review`
  5. `requires decision evidence when resolving`
  6. `allows TO Manager to approve resolved conflict`
  7. `blocks approval if governed weight is missing`
  8. `reopening returns conflict to UNDER_REVIEW`
  9. `calculates costing readiness with governed BOM weights`  
  **السبب**: محركات حوكمة وتصنيف النزاعات وسير عمل الاعتمادات لمدير المكتب الفني تنتمي صراحة إلى Phase 2c.

---

## 5. سجل تعديلات الكود القديم والواجهة (Legacy Modifications Log)

| الملف المعدل | طبيعة التعديل | السبب والضرورة |
|---|---|---|
| `src/components/internal/AdministrationHub.tsx` | حارس `token` ودوال `useEffect` وتمرير `readAccessToken()` ديناميكياً | منع حدوث استدعاءات غير مصرح بها (`401`) عند التحميل الأولي للواجهة قبل اكتمال استعادة الجلسة في `AuthContext`، وضمان تمرير التوكن الحي مع كافة طلبات إدارة المستخدمين والأدوار. |
| `vite.config.ts` | تصحيح الـ Regex لمسار البروكسي: `^/api/(auth\|admin/(users\|roles\|...))(\\?\|/\|$)` | إضافة دعم للـ Query Parameters (`?`). في السابق كان النمط `($\|/)` يسقط أي استدعاء يحوي معاملات استعلام (مثل `/api/admin/users?sort=createdAt`) ليتجه إلى خادم Express القديم بدلاً من NestJS. |
| `src/server/masterDataRoutes.ts:350` | تغليف `row.content` بـ `Buffer.from(row.content)` عند إرسال المرفقات الثنائية | تصحيح خلل في Express 4؛ حيث أن كائن `row.content` المسترجع من Prisma هو `Uint8Array` وليس Node.js `Buffer`. عدم التغليف جعل Express يعامله ككائن عادي ويسلسله بصيغة JSON (`{"0":197,"1":170,...}`) بحجم 70MB بدلاً من إرسال البايتات الثنائية الخام بحجم 5MB. |
| `.env` | توجيه `DATABASE_URL` القديم إلى قاعدة `energya_legacy` | عزل بيئة الاختبارات القديمة وقاعدة الـ Parity عن قاعدة NestJS (`energya_nest`) وقاعدة التشغيل الأساسية، وضمان تطابق كلمات المرور والبيانات المزروعة. |

---

## 6. إنجازات Phase 2a (Code & Parity Completion)

1. **نقل وتطوير مسارات Phase 2a الـ 36 بالكامل:**
   - **Cables (4 مسارات):** `GET /api/master/cables`، `GET /api/master/cables/:mat`، `GET /api/v2/cables/products`، `GET /api/v2/cables/products/facets`.
   - **Attachments (4 مسارات):** `GET .../attachments`، `GET .../attachments/:id`، `POST .../attachments`، `DELETE .../attachments/:id`.
   - **Raw Materials (مسار واحد):** `GET /api/master/raw-materials` (مع فحص حجب حقول التكلفة للعميل).
   - **BOMs (مسار واحد):** `GET /api/master/boms`.
   - **Drums & Calculations (6 مسارات):** `GET /api/master/drums`، `GET /api/master/drums/:code`، `POST /capacity`، `POST /candidates`، `POST /validate`، `POST /optimize`.
   - **Reference & System (5 مسارات):** `GET /api/master/reference`، `GET /api/master/keys`، `GET /api/master/uniqueness`، `GET /api/master/sot-status`، `GET /api/platform/db`.
2. **بنية الـ Sub-modules في NestJS:**
   - فصل كامل لطبقات Clean Architecture: Controller رفيع، Service للمنطق، وRepository لاستعلامات Prisma.
   - تحويل الـ Decimal إلى Number حصرياً في طبقة الـ Repository باستخدام دوال `dec()` و`decOrNull()`.
   - حجب حقول التكلفة (`costPerKm`, `salesPrice`, etc.) عن ردود العميل.
   - ضبط حد حجم الطلب على 10MB في NestJS `main.ts`.
3. **مطابقة الـ Parity (34 / 34 فحص ناجح بنسبة 100%):**
   - مطابقة القوائم الكاملة: 432 كابل، 74 خامة، 4,822 سطر BOM، 105 براميل، 60 معياراً مرجعياً.
   - رفع وتنزيل ملف ثنائي حقيقي 5MB والتحقق من التطابق التام للبايتات (`Buffer.compare === 0` بحجم 5,242,880 بايت).
   - مطابقة مصفوفة الصلاحيات (العميل، الداخلي المحدود، الأدمن).
   - اجتياز الفحص السلبي (Negative Parity Test).
4. **شاشات G3 بالـ Playwright:**
   - التقاط وحفظ لقطات الشاشة للشاشات الثلاث: الكتالوج، وحاسبة البراميل، ومركز الماستر داتا الداخلي.
