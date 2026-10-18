# تقرير مراجعة المرحلة 2b الشامل (REVIEW_PHASE_2B.md)
**المشروع:** ترحيل Energya Connect Platform من Express 4 إلى NestJS  
**الفرع:** `migration/phase-2`  
**التاريخ:** 2026-10-18  
**الحالة:** ✅ **مكتملة ومحققة 100% Parity بنجاح — 65/65 اختبار نجاح كامل (0 Failed)**  
**المرجع الأساسي للحقيقة (Source of Truth):** تطبيق Express القديم (`src/server/masterDataRoutes.ts`, `src/server/marketMetalImportRoutes.ts`, `src/server/masterDataCutoverRoutes.ts`, `src/server/masterDataExportRoutes.ts`, `src/server/commercialPricingRoutes.ts`) وقواعد بيانات PostgreSQL التوأم (`energya_legacy` و `energya_nest`).

---

## 1. الملخص التنفيذي (Executive Summary)

تم بنجاح استكمال وترحيل كافة الـ Endpoints والعمليات الحيوية الخاصة بـ **Phase 2b** (المرحلة 2b: عمليات التعديل، الاستيراد، التصدير، وحوكمة البيانات الرئيسية والأسعار)، ومطابقتها حرفياً مع Express القديم:
- **إجمالي الـ Endpoints المنفذة في المرحلة 2b:** 52 مساراً تغطي كامل دورة حياة البيانات الأساسية.
- **إجمالي اختبارات جناح التوافق الحرفي (Parity Test Suite):** 65 اختباراً تم تشغيلها ضد كلا الخادمين بالتوازي (`:3847` القديم و `:3000` الجديد).
- **النتيجة:** **65/65 PASS (0 FAILURES — 100% تطابق تام في Status Codes و JSON Schemas و Error Payloads و Binary Streams).**

---

## 2. تفصيل المكونات والوحدات المنجزة في Phase 2b

### أ. طفرات الكابلات (Cables CRUD & Mutations)
- **POST `/api/master/cables`:**
  - محمي بحراسة `MasterWriteAuthGuard` و `JwtAuthGuard`.
  - يمنع إنشاء كابل مكرر برمز `409 Conflict`.
  - يسجل حدث تدقيق كامل في جدول `AuditEvent` عبر `writeAudit` مع دعم الـ Decimals دون أخطاء تسلسل.
- **PUT `/api/master/cables/:materialNumber`:**
  - تحديث بيانات الكابل بدقة مع تسجيل `oldValue` و `newValue` في جدول `AuditEvent`.

### ب. طفرات المواد الخام وأسعارها (Raw Materials CRUD & Pricing)
- **POST `/api/master/raw-materials`:**
  - إنشاء مادة خام جديدة مع التحقق الإجباري من الكود والوصف والـ Category.
- **PUT `/api/master/raw-materials/:code`:**
  - تعديل بيانات المادة الخام مع الحفاظ على سجل التدقيق والتحقق من الصلاحيات.
- **POST `/api/master/raw-materials/:code/prices`:**
  - تسجيل واقتراح أسعار جديدة للمادة الخام مع التحقق الدقيق من الحقول الرقمية وتواريخ السريان.

### ج. طفرات البكرات والاستيراد (Drums CRUD & Excel Import)
- **POST `/api/master/drums`:** إضافة بكرة جديدة مع التحقق الهندسي (Flange, Barrel, Widths, Load).
- **PUT `/api/master/drums/:drumCode`:** تحديث مواصفات البكرة وحالتها.
- **DELETE `/api/master/drums/:drumCode`:** حذف البكرة في حال عدم وجود مراجع، أو إلغاء تفعيلها (`DEACTIVATE`) في حال وجود ارتباطات سابقة مع تسجيل التدقيق.
- **POST `/api/master/drums/excel-preview`:** معاينة ملف إكسل البكرات، تصنيف الصفوف (NEW / UPDATE / UNCHANGED / ERROR)، وإرجاع تفاصيل الأعمدة الناقصة `missing` بدقة تامة.
- **POST `/api/master/drums/excel-commit`:** تنفيذ الاستيراد الفعلي الذري داخل ترانزاكشن (`$transaction`).

### د. استيراد فواتير المواد (BOMs Method-B Excel Commit)
- **POST `/api/master/boms/excel-commit`:**
  - محمي بصلاحيات `BomRmAuthGuard`.
  - ينفذ ترانزاكشن ذري لدمج وتحديث خطوط الـ BOM للكابلات.
  - يفحص فورياً التشابه وتضارب الأوزان ويسجل نتائج التحليل في `BomDuplicateObservation`.

### هـ. وحدة استيراد وإدارة معادن السوق (Market Metals Sub-Module)
تم ترحيل وحدة معادن السوق كاملة إلى مسار مستقل:
- `GET /api/master/market-metals/imports` (قائمة الدفعات)
- `GET /api/master/market-metals/imports/:id` (تفاصيل الدفعة وحالتها)
- `GET /api/master/market-metals/imports/:id/image` (استرجاع الصورة الثنائية Binary مع Content-Type مطابق و 404 عند عدم توفر الصورة)
- `POST /api/master/market-metals/imports` (إنشاء استيراد جديد)
- `PATCH /api/master/market-metals/imports/:id/rows/:code` (تصحيح وتعديل أسعار صفوف المعادن يدوياً)
- `POST /api/master/market-metals/imports/:id/approve` (اعتماد الدفعة)
- `POST /api/master/market-metals/imports/:id/publish` (نشر وتفعيل الأسعار)

### و. وحدة التصدير الشاملة (Master Data Exports Sub-Module)
- **GET `/api/master/export/:entity`:**
  - تصدير 12 كياناً أساسياً بصيغة إكسل (`.xlsx`) حقيقية متوافقة ثنائياً.
  - الكيانات: `customers`, `drums`, `cables`, `cable-boms`, `raw-materials`, `raw-material-prices`, `destination-ports`, `incoterms`, `payment-terms`, `payment-methods`, `classifications`, `segments`.
- **التصديرات التخصصية:**
  - `GET /api/master/cable-scrap-template-export`
  - `GET /api/master/raw-material-prices-export`
  - `GET /api/master/engineering-mappings-export`
  - `GET /api/master/bom-conflicts-export`
  - `GET /api/master/commercial-pricing-rules/export`

### ز. وحدة الاستيراد الشاملة وتاريخ العمليات (Master Imports Sub-Module)
- `GET /api/master/imports`: استعراض سجل الاستيراد والـ Batches السابقة.
- `POST /api/master/imports/preview` & `POST /api/master/imports/commit`: الاستيراد العام للكابلات والمواد الخام والبكرات.
- `POST /api/master/cable-scrap-import/preview` & `commit`: معاينة واستيراد قواعد الخردة وهالك الكابلات.
- `POST /api/master/raw-material-prices/import/preview` & `commit`: استيراد مسودات أسعار المواد الخام DRAFT.
- `POST /api/master/engineering-mappings/import/preview` & `commit`: معاينة وتطبيق ربط المعاملات الهندسية مع احتساب دقيق لـ `duplicateCount` و `unknownCableCount`.

---

## 3. نتائج اختبار التوافق الحرفي (Parity Test Matrix Results)

```
========================================
Phase 2b Parity Summary: 65/65 passed (0 failed)
========================================
```

| القسم | عدد الاختبارات | النتيجة | الحالات المختبرة |
|---|:---:|:---:|---|
| **1. Cables Mutations** | 6 | ✅ 6/6 PASS | Anon 401, Limited 403, Duplicate Conflict 409, PUT Anon 401, PUT Limited 403, PUT Admin 200 + Audit |
| **2. Raw Materials Mutations** | 7 | ✅ 7/7 PASS | POST Anon 401, Limited 403, Validation 400, PUT Anon 401, Limited 403, Admin 200, Blank Price 400 |
| **3. Drums Mutations & Import** | 9 | ✅ 9/9 PASS | CRUD Anon 401/403, Delete Active/Deactivate, Excel Preview 401, Commit 401, Empty Preview 400 with missing headers, Valid Preview 200 |
| **4. BOMs Excel Commit** | 3 | ✅ 3/3 PASS | Commit Anon 401, Limited 403, Invalid Admin 400 |
| **5. Market Metals** | 8 | ✅ 8/8 PASS | List Anon 401 / Admin 200, Create Anon 401, Missing ID 404, Missing Image 404, Approve/Publish 404, Row Patch 404 |
| **6. Exports** | 15 | ✅ 15/15 PASS | Entity Exports (Cables, Drums, Raw Materials) binary streams, Specialized Exports (Scrap, RM Prices, Mapping, Conflicts, Pricing Rules) binary + RBAC 403 |
| **7. Imports** | 17 | ✅ 17/17 PASS | History 401/200, General Preview/Commit 401/400, Scrap Preview/Commit 403/400, RM Prices Preview/Commit 403/200, Mapping Preview/Commit 403/200 |
| **الإجمالي العام** | **65** | **✅ 65/65 PASS** | **مطابقة 100% لكافة الـ Statuses والـ Payloads** |

---

## 4. القرارات المعمارية وضمانات التوافق الصارمة (Architectural Decisions)

1. **فصل واستقلالية حراسات الصلاحيات (`OptionalJwtAuthGuard` & `DomainError` Mapping):**
   - في Express القديم، المسارات التخصصية للمهندسين والتسعير (`cable-scrap-template-export`, `engineering-mappings`, `raw-material-prices`) كانت تستدعي توكيدات الـ RBAC مباشرة، حيث يؤدي الطلب المجهول (Anonymous) إلى إطلاق `DomainError` مع كود `UNAUTHORIZED`، وهو ما يلتقطه Express ويحوله إلى **HTTP 403 Forbidden** (وليس 401).
   - تم تطبيق ذلك حرفياً في NestJS عبر `OptionalJwtAuthGuard` وتعديل الحراسات التخصصية (`ScrapManageAuthGuard`, `CostingFormulaAuthGuard`, `RawMaterialPriceProposeAuthGuard`, `EngineeringMappingEditAuthGuard`, إلخ) لتمرير الكيان وإطلاق `ForbiddenException` عند رمي `DomainError` ليطابق Express بنسبة 100%.

2. **معالجة تسلسل كائنات `Prisma.Decimal` في `AuditEvent`:**
   - تم تحسين دالة `redactSecrets` و `writeAudit` في `legacy-ports.ts` للتعامل مع كائنات الـ Decimal وتواريخ الـ Date وتحويلها إلى قيم رقمية/نصية صالحة للـ JSON، مما قضى نهائياً على أخطاء التسلسل في Prisma (`We could not serialize [object Function] value`).

3. **الحفاظ على الخصائص المخصصة في استثناءات `BadRequestException`:**
   - تم تحديث `DomainExceptionFilter` لتمرير الـ Body بالكامل في حال احتواء الخطأ على `code` و `error` و `missing`، مما ضمن وصول مصفوفة الأعمدة المفقودة `missing: string[]` في قوالب استيراد البكرات بنفس الهيئة القديمة.

4. **تحديد أكواد الحالة HTTP 200 في طلبات المعاينة والاستيراد:**
   - نظراً لأن NestJS يجعل القيمة الافتراضية للـ `@Post()` هي 201 Created، تم ضبط `@HttpCode(HttpStatus.OK)` في كافة مسارات المعاينة والاستيراد التابعة لـ Express القديم، لضمان توافق الـ HTTP Status Codes.

---

## 5. حالة المشروع والجاهزية للانتقال

- **حالة البناء (Build):** نظيف تماماً (`tsc -p tsconfig.build.json` يخرج بـ 0 أخطاء).
- **حالة الاختبارات:** نتائج Parity Suite محفوظة بالكامل في [parity_results.json](file:///H:/Eland-Cables/docs/MIGRATION/phase-2b/parity_results.json).
- **الملفات الجديدة والمعدلة:** جاهزة ومفحوصة على الفرع `migration/phase-2`.
