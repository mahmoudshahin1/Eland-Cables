# Migration Status (حالة الترحيل)

Last updated: 2026-10-16  
Active Branch: `migration/phase-2`  
Source of Truth Schema: `/prisma/schema.prisma`

---

## 1. جدول تتبع المراحل (Phase Progress Tracker)

| Phase | Module | Endpoints (done/total) | G1 (Contract) | G2 (Tests) | G3 (UI) | G4 (Quality) | G5 (Docs) | Notes |
|---|---|---|---|---|---|---|---|---|
| **Phase 0** | **Foundation & Security** | **2 / 2** | ⬜ | ✅ | ⬜ | ✅ | ✅ | الأساس، الأمان، تنظيف Mock، الفلاتر، توحيد Prisma |
| **Phase 1** | **Auth / RBAC / Identity** | **49 / 49** | ✅ | ✅ | ✅ | ✅ | ✅ | **مكتملة ومقبولة مبدئيًا**: Parity (150/150 + 45/45)، اختبارات G2 (27 unit + 70 e2e)، وUI مربوطة (7/7 شاشات 200 OK) |
| **Phase 2** | **Master Data & Metals** | **0 / 130** | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | **جاري التنفيذ**: مقسمة إلى 2a (36 مسار قراءة وبراميل)، 2b (52 مسار تعديل واستيراد/تصدير ومعادن)، 2c (42 مسار حوكمة) |
| Phase 3 | Cable Authority & Configurator | 0 / 16 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 4 | Commercial (Inquiries & Quotations) | 0 / 182 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | تشمل البنود المؤجلة من Phase 1 (عزل الاستفسارات TEST 1-4) |
| Phase 5 | Costing & Pricing Engine | 0 / 109 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | أعلى مخاطرة - Golden tests رقمية |
| Phase 6 | Container Study & Logistics | 0 / 54 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | يعيد استخدام منطق البراميل من `shared/domain` |
| Phase 7 | Workflows & Commitments | 0 / 39 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 8 | Integrations (D365, Advaris, AI) | 0 / 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| **الإجمالي** | **الكلي** | **51 / 585** | - | - | - | - | - | |

---

## 2. السجل الأمني المكتشف (Security Findings Log)

| الرمز | المسارات المعنية | نوع الثغرة / الخلل في القديم | حالة الـ Parity في 2a | التوصية والقرار |
|---|---|---|:---:|---|
| **SEC-MD-01** | `GET /api/master/boms`<br>`GET /api/master/raw-materials` | تسريب كامل للخلطات التصنيعية (4,822 سطر BOM) وكافة الخامات (74 خامة) لأي مستخدم من نوع `customer` بسبب غياب عزل العميل وسماح `assertCanViewMasterDataCatalog` الفوري للعميل. | منقولة 1:1 لضمان تطابق الـ Parity | موثقة رسمياً. يُقترح تشديدها مستقبلاً بحظر وصول العميل (403) وقصر اطلاعه على كالوج الكابلات المنقى فقط. (بانتظار قرار المستخدم). |
| **SEC-MD-02** | `GET /api/master/cables/:mat/attachments`<br>`GET .../:attachmentId` | مسارات قراءة وتحميل المرفقات الهندسية والملفات الثنائية متاحة للجميع بدون أي توكن مصادقة (Public No Auth) مع تخزين الملفات كـ Bytes. | منقولة 1:1 لضمان تطابق الـ Parity | موثقة رسمياً. إثبات عملي بدون توكن استرجع الملفات كاملاً. يُقترح فرض المصادقة مستقبلاً. (بانتظار قرار المستخدم). |

---

## 3. سجل نسخ الـ Domain والتحقق من التزامن (Domain Copies Registry)

لتفادي انحراف المنطق بين واجهة React ومخدم NestJS:
- **الملف 1**: `src/domain/drumOptimizationService.ts` ↔ `energya-backend/src/shared/domain/drumOptimizationService.ts`
- **الملف 2**: `src/domain/drumCapacityCalculator.ts` ↔ `energya-backend/src/shared/domain/drumCapacityCalculator.ts`
- **آلية التحقق**: سكريبت `scripts/parity/verify-domain-sync.mjs` يفحص تطابق SHA256 للنسختين ويفشل عند وجود أي اختلاف، ومربوط ضمن `npm run verify`.
- **ملاحظة**: الملفات المنقولة كبيرة ومحمية من التضخم أو التعديل الأحادي.


---

## 2. بنود مؤجلة رسمياً إلى المرحلة الرابعة (Deferred to Phase 4)

- **TEST 1-4: Customer Inquiry Scoping & Multi-Tenancy (عزل استفسارات العملاء):**  
  تم تسجيل الحالات الأربع كـ `it.todo(...)` داخل جناح اختبارات `increment12b2_1.securityHardening.e2e-spec.ts`. هذه الحالات تختبر عزل بيانات الاستفسارات على مسار `/api/inquiries`، وقد أُجّلت صراحة إلى Phase 4 (Commercial & Inquiries) لارتباطها بالـ Inquiries Controller و Inquiries Service والـ Scoping المنفصل للاستفسارات.

---

## 3. سجل تعديلات الكود القديم والواجهة (Legacy Modifications Log)

| الملف المعدل | طبيعة التعديل | السبب والضرورة |
|---|---|---|
| `src/components/internal/AdministrationHub.tsx` | حارس `token` ودوال `useEffect` وتمرير `readAccessToken()` ديناميكياً | منع حدوث استدعاءات غير مصرح بها (`401`) عند التحميل الأولي للواجهة قبل اكتمال استعادة الجلسة في `AuthContext`، وضمان تمرير التوكن الحي مع كافة طلبات إدارة المستخدمين والأدوار. |
| `vite.config.ts` | تصحيح الـ Regex لمسار البروكسي: `^/api/(auth\|admin/(users\|roles\|...))(\\?\|/\|$)` | إضافة دعم للـ Query Parameters (`?`). في السابق كان النمط `($\|/)` يسقط أي استدعاء يحوي معاملات استعلام (مثل `/api/admin/users?sort=createdAt`) ليتجه إلى خادم Express القديم بدلاً من NestJS. |

---

## 4. إنجازات المرحلة 1 (Phase 1 Code Completion)

1. **نقل وتطوير الـ 49 Endpoint المستهدفة بالكامل:**
   - **AuthModule (12 endpoints):** `login`, `logout`, `refresh-token`, `me`, `change-password`, `reset-password`, `forgot-password`, `register`, `roles`, `assign-role`, `users`.
   - **AdminIdentityModule (23 endpoints):** إدارة المستخدمين (CRUD، القفل، التفعيل، إعادة تعيين كلمة المرور، تعيين الأدوار)، إدارة الأدوار (CRUD، التفعيل، الصلاحيات، المستخدمين)، عرض الصلاحيات و`permissions/matrix` و`security`.
   - **AdminCustomersModule (14 endpoints):** إدارة العملاء (CRUD، التفعيل، التعطيل، السجلات، التصدير لـ Excel)، إدارة مراجع العملاء (`customer-reference-masters`)، إدارة ارتباطات مستخدمي العملاء (`customer-users`، التعيين، التحديث، الإلغاء).
2. **نقل طبقة المنطق النقي (Shared Domain):**
   - نقل `permission-catalog.ts` وسجل الصلاحيات الكامل (128 تصريحاً دقيقاً).
   - نقل `password-service.ts` (دوال SHA-256 opaque tokens والتجزئة والتوليد).
   - نقل `rbac-compatibility.ts` واشتقاق `deriveLegacyPermissions` لضمان توافق شاشات الواجهة القديمة.
   - نقل `rbac-engine.ts` وتطبيقه داخل `RbacGuard` مع Decorator `@RequirePermission()`.
   - نقل `safe-user.ts` لضمان تطابق كائن المستخدم المرجع (`user`) مع ما تنتظره الواجهة.
3. **فصل الاستعلامات إلى طبقة الـ Repository:**
   - نقل استعلام التحقق من فاعلية الجلسة `sessionIsActive` بالكامل من `JwtAuthGuard` إلى `AuthRepository`.
4. **اختبارات G2:**
   - **Unit Tests:** 27 اختباراً ناجحاً عبر 3 ملفات.
   - **E2E Tests:** 70 اختباراً حقيقياً ناجحاً عبر 7 ملفات (مطابقة تامة لـ 28 اختبار هوية قديمة و18 حالة أمان وعزل).
5. **شاشات G3:**
   - توثيق 7 شاشات رئيسية برمز استجابة 200 OK عبر اختبار متصفح آلي (Playwright على MS Edge).
6. **الجودة والـ Build:**
   - نجاح البناء `npm run build` بنسبة 100% بدون أي أخطاء TypeScript وبدون أي mock data، وخلو كامل لـ `package-lock.json` من أي مراجع لـ `npmmirror`.
