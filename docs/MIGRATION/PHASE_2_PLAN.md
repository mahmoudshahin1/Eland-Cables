# خطة تنفيذ المرحلة الثانية: البيانات الأساسية والمعادن (Phase 2 Master Plan)
## التركيز التنفيذي الحالي: Phase 2a (قراءة الماستر داتا ومحرك البراميل)

> **تاريخ التحديث**: 2026-10-16  
> **الفرع الحالي**: `migration/phase-2`  
> **الحالة**: معتمدة من المستخدم لبدء تنفيذ Phase 2a فقط. يمنع البدء في 2b أو 2c قبل المراجعة والاعتماد الصريح.

---

## 1. ملخص المرحلة والتقسيم المعتمد (130 Endpoint)

تنقسم المرحلة الثانية إلى ثلاث مراحل فرعية واضحة المعالم:
1. **Phase 2a (36 مساراً)**: مسارات القراءة الأساسية لكافة كروت الصنف (Cables, Raw Materials, BOMs, Drums, Reference, Keys, Uniqueness, DB) بالاسمين `/api/master/*` و`/api/platform/*` + ملحقات الكابلات (قراءة، رفع، حذف) + محرك حسابات واختيار البراميل (POSTs).
2. **Phase 2b (52 مساراً)**: التعديلات المباشرة على الجداول (Cables/RM/Drums CRUD) + استيراد وتصدير الملفات والإكسل وقوالب نسب الهالك + أسعار معادن السوق (`market-metals`) + الـ Cutover.
3. **Phase 2c (42 مساراً)**: محركات الحوكمة وسير العمل (Engineering Mappings, BOM Conflicts, Governed RM Prices, Commercial Pricing Rules, Costing Readiness).

---

## 2. مصفوفة الصلاحيات المعتمدة (Permission Matrix)

### أ) القاعدة البرمجية الثابتة من الكود القديم:
- دالة `assertCanViewMasterDataCatalog(actor)` في [src/server/rbac.ts:706-736](../../src/server/rbac.ts#L706-L736):
  1. **العميل (`actor.userType === 'customer'`)**: يتم إرجاع الدالة فوراً (`return`)، وبالتالي مسارات الكتالوج والخامات والـ BOM والبراميل والـ Reference مفتوحة للعميل.
  2. **الداخلي (`actor.userType === 'internal'`)**: تتطلب الدالة أي **واحدة** من 7 صلاحيات دقيقة (`denyIfMissingGranular` تستخدم `!allowed.some(...)`):
     - `CABLE:CABLE_MASTER:VIEW`
     - `RAW_MATERIAL:RAW_MATERIAL:VIEW`
     - `ENGINEERING:MAPPING:VIEW`
     - `BOM:BOM_CONFLICT:VIEW`
     - `COMMERCIAL:INQUIRY:VIEW`
     - `COMMERCIAL:INQUIRY:CREATE`
     - `COMMERCIAL:INQUIRY:UPDATE`
- دالة `assertCanUseDrumOptimization(actor)` في [src/server/rbac.ts:739-741](../../src/server/rbac.ts#L739-L741) تنادي `assertCanViewMasterDataCatalog(actor)` بنفس الشروط.
- مسار `GET /reference` يستخدم `requireMasterReadAuth` (السطر 1041 في `masterDataRoutes.ts`) وليس `requireSignedIn`.
- مسارات مرفقات الكابل:
  - `GET /cables/:mat/attachments` و `GET .../:attachmentId`: مفتوحة للجميع (Public بدون فحص مصادقة).
  - `POST /cables/:mat/attachments` و `DELETE .../:attachmentId`: تتطلب `requireWriteAuth` (صلاحية `CABLE_MASTER:CREATE/UPDATE` ومرفوضة للعميل 403).

---

## 3. السجل الأمني المعتمد (Security Findings)

### Finding 1: SEC-MD-01 (قراءة العميل لقوائم الـ BOM والمواد الخام)
- **الوصف**: لا توجد فلترة لعزل العميل في `listBoms()` و`listRawMaterials()`، وحارس `assertCanViewMasterDataCatalog` يمرر العميل فوراً.
- **الإثبات التجريبي الفعلي**: تم تشغيل السيرفر بتوكن عميل (`custA@parity.test`) واسترجع **74 خامة** بكامل تفاصيلها و**4,822 سطر BOM** بكامل أسرار الخلطات والأوزان التصنيعية بـ Status `200 OK`.
- **قرار الـ Parity**: يُنقل السلوك كما هو في Phase 2a لضمان تطابق الـ Parity 100% مع القديم، ويُسجل كـ Finding أمني رسمي في `MIGRATION_STATUS.md` مع اقتراح تشديده لاحقاً (بمنع العميل 403 وحصره في كتالوج الكابلات المنقى).

### Finding 2: SEC-MD-02 (مسارات قراءة وتحميل المرفقات مفتوحة بلا توكن)
- **الوصف**: المسارات `GET /api/master/cables/:mat/attachments` و `GET .../:attachmentId` لا تحتوي على أي فحص مصادقة (Public)، والملفات مخزنة كـ Bytes في قاعدة البيانات.
- **الإثبات التجريبي الفعلي**: تم إرسال طلب بدون أي Header مصادقة واسترجع السيرفر القديم قائمة المرفقات بـ `200 OK` ثم حمّل محتوى الملف كاملاً (`application/pdf`) بـ `200 OK` وبنفس الـ Bytes المخزنة.
- **قرار الـ Parity**: تُنقل بدون حارس في Phase 2a لتطابق الـ Parity مع القديم، وتُسجل كـ Finding أمني لانتظار قرار المستخدم بالتشديد لاحقاً.

---

## 4. الهيكل المعماري في NestJS (Sub-modules Structure)

### أ) حذف واستبدال المسودة القديمة
حذف الملفات الأحادية في `energya-backend/src/master-data/`:
- `master-data.controller.ts`
- `master-data.service.ts`
- `master-data.module.ts`

### ب) الهيكل الجديد المقسم إلى Sub-modules:
```
energya-backend/src/
├── shared/
│   └── domain/
│       ├── drumOptimizationService.ts      ← نسخة domain مطابقة للأصل
│       └── drumCapacityCalculator.ts       ← نسخة domain مطابقة للأصل
└── master-data/
    ├── master-data.module.ts               ← موديول يجمع الـ Sub-modules
    ├── cables/
    │   ├── cables.controller.ts           ← مسارات الكابلات (/master و /platform)
    │   ├── cables.service.ts              ← محرك البحث والفلاتر والترقيم
    │   ├── cables.repository.ts           ← استعلامات Prisma لكروت الكابلات
    │   ├── attachments.controller.ts      ← مسارات المرفقات وتنزيلها
    │   ├── attachments.service.ts         ← إدارة وتخزين المرفقات
    │   ├── attachments.repository.ts      ← استعلامات CableMasterAttachment
    │   └── dto/
    ├── raw-materials/
    │   ├── raw-materials.controller.ts    ← مسار المواد الخام
    │   ├── raw-materials.service.ts       ← خدمة المواد الخام وتصنيفاتها
    │   ├── raw-materials.repository.ts    ← استعلامات RawMaterial
    │   └── dto/
    ├── boms/
    │   ├── boms.controller.ts             ← مسار الـ BOMs
    │   ├── boms.service.ts                ← خدمة الـ BOM lines
    │   ├── boms.repository.ts             ← استعلامات CableBomLine
    │   └── dto/
    ├── drums/
    │   ├── drums.controller.ts            ← مسارات البراميل وحساباتها
    │   ├── drums.service.ts               ← خدمة البراميل
    │   ├── drums.repository.ts            ← استعلامات DrumMaster
    │   ├── drum-capacity.service.ts       ← موائم خدمة حساب السعة
    │   ├── drum-optimization.service.ts   ← موائم خدمة التحسين
    │   └── dto/
    └── reference/
        ├── reference.controller.ts        ← مسارات Reference, Keys, Uniqueness, DB, SoT
        ├── reference.service.ts           ← المعايير وتقارير التفرد
        ├── reference.repository.ts        ← استعلامات ReferenceParameter وفحص الصحة
        └── dto/
```

### ج) سجل نسخ الـ Domain (Domain Copy Registry & Sync Hash)
- **المصدر القديم**: `src/domain/drumOptimizationService.ts` ↔ **الوجهة**: `energya-backend/src/shared/domain/drumOptimizationService.ts`
- **المصدر القديم**: `src/domain/drumCapacityCalculator.ts` ↔ **الوجهة**: `energya-backend/src/shared/domain/drumCapacityCalculator.ts`
- **سكريبت التحقق الآلي**: `scripts/parity/verify-domain-sync.mjs` مدمج ضمن فحص الـ verify لضمان تطابق SHA256 للنسخ وعدم تعديل أي ملف بمعزل عن الآخر.

---

## 5. خطة الاختبارات ونقل الـ 95 اختباراً إلى Phase 2a

تم تصحيح القائمة بعد حذف اختباري خدمات واجهة React (`drumMasterService.test.ts` و`masterDataApiService.test.ts`):
- **إجمالي اختبارات الباك إند المستهدفة**: **105 اختبارات**.
- **المنقول والمنفذ في Phase 2a**: **95 اختباراً**.
- **المؤجل لـ 2b و 2c**: **10 اختبارات**.

### جدول مطابقة الاختبارات (قديم -> جديد):

| الملف القديم | العدد | الملف الجديد في NestJS | عدد 2a | المؤجل لـ 2b / 2c مع السبب |
|---|:---:|---|:---:|---|
| `src/domain/drumOptimizationService.test.ts` | 60 | `test/master-data/drumOptimizationService.spec.ts` | **60** | لا يوجد تأجيل (كلها حسابات براميل تنتمي لـ 2a). |
| `src/domain/drumCapacityCalculator.test.ts` | 14 | `test/master-data/drumCapacityCalculator.spec.ts` | **14** | لا يوجد تأجيل (كلها معادلات سعة تنتمي لـ 2a). |
| `src/domain/customerCableCatalog.test.ts` | 7 | `test/master-data/customerCableCatalog.domain.spec.ts` | **7** | لا يوجد تأجيل (فلاتر وترقيم وتصنيف الكتالوج). |
| `src/server/customerCableCatalog.test.ts` | 6 | `test/master-data/customerCableCatalog.server.e2e-spec.ts` | **5** | **اختبار رقم 6**: `exports customer-safe Excel` مؤجل لـ **2b** (تصدير إكسل). |
| `src/server/masterData.persistence.test.ts` | 5 | `test/master-data/masterData.persistence.e2e-spec.ts` | **5** | لا يوجد تأجيل (فحص الاتصال وقراءة الكابل والخامات وتحديث البرميل). |
| `src/server/increment8.bom.test.ts` | 13 | `test/master-data/increment8.bom.e2e-spec.ts` | **4** | **9 اختبارات** مؤجلة لـ **2c** (حوكمة تعارضات الـ BOM، تصنيف النزاع، واعتماد TO Manager، وحساب الـ Costing Readiness). |
| **المجموع** | **105** | - | **95** | **10 اختبارات مؤجلة موثقة**. |

---

## 6. التفاصيل التقنية الدقيقة

### أ) الترتيب الفعلي من الكود القديم (Exact OrderBy)
- **الكابلات** (`listCables` و `searchCables`): `{ materialNumber: 'asc' }`
- **المواد الخام** (`listRawMaterials`): `{ code: 'asc' }`
- **الـ BOMs** (`listBoms`): `[{ cableMaterialNumber: 'asc' }, { rawMaterialCode: 'asc' }]`
- **البراميل** (`listDrums`): `{ drumCode: 'asc' }`
- **المعايير المرجعية** (`listReference`): `[{ kind: 'asc' }, { code: 'asc' }]`
- **مرفقات الكابل** (`listCableMasterAttachments`): `{ kind: 'asc' }`

### ب) تحويل الـ Decimal إلى Number (طبقة Repository فقط)
استخدام دوال التحويل الصريحة `dec(value)` و `decOrNull(value)` في الـ Repository DTO mapping كما في القديم تماماً، لمنع إرجاع كائنات `Prisma.Decimal` أو نصوص، وضمان مطابقة JSON حرفياً.

### ج) حجب حقول التكلفة عن العميل
التأكد الصارم عبر فحص كائنات DTO أن استجابات كالوج الكابلات للعميل لا تُرجع:
`costPerKm`, `manufacturingCostPerKm`, `salesPrice`, `margin`, `copperIndex`, `rawMaterialCost`.

### د) سعة الطلب والملفات الثنائية (10MB Payload & 5MB Binary)
- ضبط `app.use(json({ limit: '10mb' }))` في NestJS.
- اختبار Parity متقدم يرفع ملفاً ثنائياً فعلياً بحجم **5MB** (`crypto.randomBytes(5 * 1024 * 1024)`)، ثم ينزله ويقارن الـ Buffer للتأكد من التطابق التام `Buffer.compare(bufA, bufB) === 0`.

### هـ) استراتيجية تجهيز وتطابق البيانات (Data Parity Strategy)
- سكريبت `scripts/parity/seed-master-data.mjs` يقرأ ملفات الإكسل الأصلية من `data/source/` ويزرع القاعدتين `energya_legacy` و `energya_nest` بنفس السجلات الكاملة:
  - **432 كابل**.
  - **74 خامة**.
  - **4,822 سطر BOM**.
  - **كافة البراميل**.
- **التعايش مع Phase 1**: سكريبت الماستر داتا لا يمسح ولا يعدل جداول المستخدمين أو الصلاحيات الخاصة بـ `seed-auth.mjs`.

---

## 7. جدول جرد الـ 130 Endpoint بالكامل

| # | Method | المسار الكامل | ملف المعالج الأصلي | المرحلة | الموديول المستهدف |
|---|---|---|---|:---:|---|
| 233 | `GET` | `/api/master/bom-conflicts` | masterDataRoutes.ts:1305 | 2c | governance/boms |
| 234 | `GET` | `/api/master/bom-conflicts-export` | masterDataRoutes.ts:1330 | 2b | export/boms |
| 235 | `POST` | `/api/master/bom-conflicts/:conflictId/actions` | masterDataRoutes.ts:1411 | 2c | governance/boms |
| 236 | `GET` | `/api/master/bom-duplicate-observations` | masterDataRoutes.ts:1512 | 2c | governance/boms |
| 237 | `GET` | `/api/master/boms` | masterDataRoutes.ts:370 | **2a** | master-data/boms |
| 238 | `POST` | `/api/master/boms/excel-commit` | masterDataRoutes.ts:380 | 2b | import/boms |
| 239 | `POST` | `/api/master/cable-scrap-import/commit` | masterDataRoutes.ts:625 | 2b | import/scrap |
| 240 | `POST` | `/api/master/cable-scrap-import/preview` | masterDataRoutes.ts:605 | 2b | import/scrap |
| 241 | `GET` | `/api/master/cable-scrap-template-export` | masterDataRoutes.ts:582 | 2b | export/scrap |
| 242 | `GET` | `/api/master/cables` | masterDataRoutes.ts:217 | **2a** | master-data/cables |
| 243 | `POST` | `/api/master/cables` | masterDataRoutes.ts:272 | 2b | master-data/cables |
| 244 | `GET` | `/api/master/cables/:materialNumber` | masterDataRoutes.ts:260 | **2a** | master-data/cables |
| 245 | `PUT` | `/api/master/cables/:materialNumber` | masterDataRoutes.ts:310 | 2b | master-data/cables |
| 246 | `GET` | `/api/master/cables/:materialNumber/attachments` | masterDataRoutes.ts:322 | **2a** | master-data/attachments |
| 247 | `POST` | `/api/master/cables/:materialNumber/attachments` | masterDataRoutes.ts:331 | **2a** | master-data/attachments |
| 248 | `DELETE` | `/api/master/cables/:materialNumber/attachments/:attachmentId` | masterDataRoutes.ts:357 | **2a** | master-data/attachments |
| 249 | `GET` | `/api/master/cables/:materialNumber/attachments/:attachmentId` | masterDataRoutes.ts:345 | **2a** | master-data/attachments |
| 250 | `GET` | `/api/master/commercial-pricing-rules` | commercialPricingRoutes.ts:38 | 2c | commercial-pricing |
| 251 | `POST` | `/api/master/commercial-pricing-rules` | commercialPricingRoutes.ts:67 | 2c | commercial-pricing |
| 252 | `POST` | `/api/master/commercial-pricing-rules/:id/actions` | commercialPricingRoutes.ts:146 | 2c | commercial-pricing |
| 253 | `POST` | `/api/master/commercial-pricing-rules/:id/approve-pricing` | commercialPricingRoutes.ts:182 | 2c | commercial-pricing |
| 254 | `GET` | `/api/master/commercial-pricing-rules/:id/history` | commercialPricingRoutes.ts:133 | 2c | commercial-pricing |
| 255 | `POST` | `/api/master/commercial-pricing-rules/:id/price` | commercialPricingRoutes.ts:109 | 2c | commercial-pricing |
| 256 | `POST` | `/api/master/commercial-pricing-rules/:id/submit-for-approval` | commercialPricingRoutes.ts:164 | 2c | commercial-pricing |
| 257 | `POST` | `/api/master/commercial-pricing-rules/:id/versions` | commercialPricingRoutes.ts:89 | 2c | commercial-pricing |
| 258 | `POST` | `/api/master/commercial-pricing-rules/calculate` | commercialPricingRoutes.ts:245 | 2c | commercial-pricing |
| 259 | `GET` | `/api/master/commercial-pricing-rules/export` | commercialPricingRoutes.ts:212 | 2b | commercial-pricing |
| 260 | `GET` | `/api/master/commercial-pricing-rules/options` | commercialPricingRoutes.ts:229 | 2c | commercial-pricing |
| 261 | `GET` | `/api/master/costing-readiness` | masterDataRoutes.ts:1450 | 2c | readiness/costing |
| 262 | `GET` | `/api/master/db` | masterDataRoutes.ts:208 | **2a** | reference/health |
| 263 | `GET` | `/api/master/drums` | masterDataRoutes.ts:833 | **2a** | master-data/drums |
| 264 | `POST` | `/api/master/drums` | masterDataRoutes.ts:833 | 2b | master-data/drums |
| 265 | `DELETE` | `/api/master/drums/:drumCode` | masterDataRoutes.ts:833 | 2b | master-data/drums |
| 266 | `GET` | `/api/master/drums/:drumCode` | masterDataRoutes.ts:833 | **2a** | master-data/drums |
| 267 | `PUT` | `/api/master/drums/:drumCode` | masterDataRoutes.ts:833 | 2b | master-data/drums |
| 268 | `POST` | `/api/master/drums/candidates` | masterDataRoutes.ts:874 | **2a** | master-data/drums |
| 269 | `POST` | `/api/master/drums/capacity` | masterDataRoutes.ts:843 | **2a** | master-data/drums |
| 270 | `POST` | `/api/master/drums/excel-commit` | masterDataRoutes.ts:833 | 2b | import/drums |
| 271 | `POST` | `/api/master/drums/excel-preview` | masterDataRoutes.ts:833 | 2b | import/drums |
| 272 | `POST` | `/api/master/drums/optimize` | masterDataRoutes.ts:982 | **2a** | master-data/drums |
| 273 | `POST` | `/api/master/drums/validate` | masterDataRoutes.ts:951 | **2a** | master-data/drums |
| 274 | `GET` | `/api/master/engineering-mappings` | masterDataRoutes.ts:1060 | 2c | governance/mapping |
| 275 | `GET` | `/api/master/engineering-mappings-export` | masterDataRoutes.ts:1073 | 2b | export/mapping |
| 276 | `GET` | `/api/master/engineering-mappings/:materialNumber` | masterDataRoutes.ts:1119 | 2c | governance/mapping |
| 277 | `PUT` | `/api/master/engineering-mappings/:materialNumber` | masterDataRoutes.ts:1131 | 2c | governance/mapping |
| 278 | `POST` | `/api/master/engineering-mappings/:materialNumber/actions` | masterDataRoutes.ts:1263 | 2c | governance/mapping |
| 279 | `POST` | `/api/master/engineering-mappings/bulk/actions` | masterDataRoutes.ts:1166 | 2c | governance/mapping |
| 280 | `POST` | `/api/master/engineering-mappings/bulk/validate` | masterDataRoutes.ts:1149 | 2c | governance/mapping |
| 281 | `POST` | `/api/master/engineering-mappings/import/commit` | masterDataRoutes.ts:1240 | 2b | import/mapping |
| 282 | `POST` | `/api/master/engineering-mappings/import/preview` | masterDataRoutes.ts:1206 | 2b | import/mapping |
| 283 | `GET` | `/api/master/export/:entity` | masterDataExportRoutes.ts:15 | 2b | export/general |
| 284 | `GET` | `/api/master/imports` | masterDataRoutes.ts:1522 | 2b | import/history |
| 285 | `POST` | `/api/master/imports/commit` | masterDataRoutes.ts:1679 | 2b | import/general |
| 286 | `POST` | `/api/master/imports/preview` | masterDataRoutes.ts:1652 | 2b | import/general |
| 287 | `GET` | `/api/master/keys` | masterDataRoutes.ts:1491 | **2a** | reference/keys |
| 288 | `GET` | `/api/master/market-metals/imports` | marketMetalImportRoutes.ts:25 | 2b | market-metals |
| 289 | `POST` | `/api/master/market-metals/imports` | marketMetalImportRoutes.ts:35 | 2b | market-metals |
| 290 | `GET` | `/api/master/market-metals/imports/:id` | marketMetalImportRoutes.ts:50 | 2b | market-metals |
| 291 | `POST` | `/api/master/market-metals/imports/:id/approve` | marketMetalImportRoutes.ts:80 | 2b | market-metals |
| 292 | `GET` | `/api/master/market-metals/imports/:id/image` | marketMetalImportRoutes.ts:65 | 2b | market-metals |
| 293 | `POST` | `/api/master/market-metals/imports/:id/publish` | marketMetalImportRoutes.ts:95 | 2b | market-metals |
| 294 | `PATCH` | `/api/master/market-metals/imports/:id/rows/:code` | marketMetalImportRoutes.ts:110 | 2b | market-metals |
| 295 | `GET` | `/api/master/raw-material-price-readiness` | masterDataRoutes.ts:1469 | 2c | readiness/prices |
| 296 | `GET` | `/api/master/raw-material-prices` | masterDataRoutes.ts:431 | 2c | governance/prices |
| 297 | `POST` | `/api/master/raw-material-prices` | masterDataRoutes.ts:465 | 2c | governance/prices |
| 298 | `GET` | `/api/master/raw-material-prices-export` | masterDataRoutes.ts:522 | 2b | export/prices |
| 299 | `POST` | `/api/master/raw-material-prices/:id/actions` | masterDataRoutes.ts:483 | 2c | governance/prices |
| 300 | `GET` | `/api/master/raw-material-prices/:rawMaterialCode` | masterDataRoutes.ts:452 | 2c | governance/prices |
| 301 | `POST` | `/api/master/raw-material-prices/import/commit` | masterDataRoutes.ts:799 | 2b | import/prices |
| 302 | `POST` | `/api/master/raw-material-prices/import/preview` | masterDataRoutes.ts:645 | 2b | import/prices |
| 303 | `GET` | `/api/master/raw-materials` | masterDataRoutes.ts:421 | **2a** | master-data/raw-materials |
| 304 | `POST` | `/api/master/raw-materials` | masterDataRoutes.ts:1532 | 2b | master-data/raw-materials |
| 305 | `PUT` | `/api/master/raw-materials/:code` | masterDataRoutes.ts:1564 | 2b | master-data/raw-materials |
| 306 | `POST` | `/api/master/raw-materials/:code/prices` | masterDataRoutes.ts:1576 | 2b | master-data/raw-materials |
| 307 | `GET` | `/api/master/readiness` | masterDataRoutes.ts:1050 | 2c | readiness/master |
| 308 | `GET` | `/api/master/reference` | masterDataRoutes.ts:1040 | **2a** | reference/params |
| 309 | `GET` | `/api/master/sot-status` | masterDataCutoverRoutes.ts:103 | **2a** | reference/sot |
| 310 | `GET` | `/api/master/uniqueness` | masterDataRoutes.ts:1502 | **2a** | reference/uniqueness |
| 317 | `GET` | `/api/platform/bom-conflicts` | masterDataRoutes.ts:1305 | 2c | platform/boms |
| 318 | `GET` | `/api/platform/bom-conflicts-export` | masterDataRoutes.ts:1330 | 2b | platform/export |
| 319 | `POST` | `/api/platform/bom-conflicts/:conflictId/actions` | masterDataRoutes.ts:1411 | 2c | platform/boms |
| 320 | `GET` | `/api/platform/bom-duplicate-observations` | masterDataRoutes.ts:1512 | 2c | platform/boms |
| 321 | `GET` | `/api/platform/boms` | masterDataRoutes.ts:370 | **2a** | platform/boms |
| 322 | `POST` | `/api/platform/boms/excel-commit` | masterDataRoutes.ts:380 | 2b | platform/boms |
| 323 | `POST` | `/api/platform/cable-scrap-import/commit` | masterDataRoutes.ts:625 | 2b | platform/scrap |
| 324 | `POST` | `/api/platform/cable-scrap-import/preview` | masterDataRoutes.ts:605 | 2b | platform/scrap |
| 325 | `GET` | `/api/platform/cable-scrap-template-export` | masterDataRoutes.ts:582 | 2b | platform/scrap |
| 326 | `GET` | `/api/platform/cables` | masterDataRoutes.ts:217 | **2a** | platform/cables |
| 327 | `POST` | `/api/platform/cables` | masterDataRoutes.ts:272 | 2b | platform/cables |
| 328 | `GET` | `/api/platform/cables/:materialNumber` | masterDataRoutes.ts:260 | **2a** | platform/cables |
| 329 | `PUT` | `/api/platform/cables/:materialNumber` | masterDataRoutes.ts:310 | 2b | platform/cables |
| 330 | `GET` | `/api/platform/cables/:materialNumber/attachments` | masterDataRoutes.ts:322 | **2a** | platform/attachments |
| 331 | `POST` | `/api/platform/cables/:materialNumber/attachments` | masterDataRoutes.ts:331 | **2a** | platform/attachments |
| 332 | `DELETE` | `/api/platform/cables/:materialNumber/attachments/:attachmentId` | masterDataRoutes.ts:357 | **2a** | platform/attachments |
| 333 | `GET` | `/api/platform/cables/:materialNumber/attachments/:attachmentId` | masterDataRoutes.ts:345 | **2a** | platform/attachments |
| 334 | `GET` | `/api/platform/costing-readiness` | masterDataRoutes.ts:1450 | 2c | platform/readiness |
| 335 | `GET` | `/api/platform/db` | masterDataRoutes.ts:208 | **2a** | platform/db |
| 336 | `GET` | `/api/platform/drums` | masterDataRoutes.ts:833 | **2a** | platform/drums |
| 337 | `POST` | `/api/platform/drums/candidates` | masterDataRoutes.ts:874 | **2a** | platform/drums |
| 338 | `POST` | `/api/platform/drums/capacity` | masterDataRoutes.ts:843 | **2a** | platform/drums |
| 339 | `POST` | `/api/platform/drums/optimize` | masterDataRoutes.ts:982 | **2a** | platform/drums |
| 340 | `POST` | `/api/platform/drums/validate` | masterDataRoutes.ts:951 | **2a** | platform/drums |
| 341 | `GET` | `/api/platform/engineering-mappings` | masterDataRoutes.ts:1060 | 2c | platform/mapping |
| 342 | `GET` | `/api/platform/engineering-mappings-export` | masterDataRoutes.ts:1073 | 2b | platform/export |
| 343 | `GET` | `/api/platform/engineering-mappings/:materialNumber` | masterDataRoutes.ts:1119 | 2c | platform/mapping |
| 344 | `PUT` | `/api/platform/engineering-mappings/:materialNumber` | masterDataRoutes.ts:1131 | 2c | platform/mapping |
| 345 | `POST` | `/api/platform/engineering-mappings/:materialNumber/actions` | masterDataRoutes.ts:1263 | 2c | platform/mapping |
| 346 | `POST` | `/api/platform/engineering-mappings/bulk/actions` | masterDataRoutes.ts:1166 | 2c | platform/mapping |
| 347 | `POST` | `/api/platform/engineering-mappings/bulk/validate` | masterDataRoutes.ts:1149 | 2c | platform/mapping |
| 348 | `POST` | `/api/platform/engineering-mappings/import/commit` | masterDataRoutes.ts:1240 | 2b | platform/mapping |
| 349 | `POST` | `/api/platform/engineering-mappings/import/preview` | masterDataRoutes.ts:1206 | 2b | platform/mapping |
| 351 | `GET` | `/api/platform/imports` | masterDataRoutes.ts:1522 | 2b | platform/imports |
| 352 | `POST` | `/api/platform/imports/commit` | masterDataRoutes.ts:1679 | 2b | platform/imports |
| 353 | `POST` | `/api/platform/imports/preview` | masterDataRoutes.ts:1652 | 2b | platform/imports |
| 354 | `GET` | `/api/platform/keys` | masterDataRoutes.ts:1491 | **2a** | platform/keys |
| 355 | `GET` | `/api/platform/raw-material-price-readiness` | masterDataRoutes.ts:1469 | 2c | platform/readiness |
| 356 | `GET` | `/api/platform/raw-material-prices` | masterDataRoutes.ts:431 | 2c | platform/prices |
| 357 | `POST` | `/api/platform/raw-material-prices` | masterDataRoutes.ts:465 | 2c | platform/prices |
| 358 | `GET` | `/api/platform/raw-material-prices-export` | masterDataRoutes.ts:522 | 2b | platform/export |
| 359 | `POST` | `/api/platform/raw-material-prices/:id/actions` | masterDataRoutes.ts:483 | 2c | platform/prices |
| 360 | `GET` | `/api/platform/raw-material-prices/:rawMaterialCode` | masterDataRoutes.ts:452 | 2c | platform/prices |
| 361 | `POST` | `/api/platform/raw-material-prices/import/commit` | masterDataRoutes.ts:799 | 2b | platform/prices |
| 362 | `POST` | `/api/platform/raw-material-prices/import/preview` | masterDataRoutes.ts:645 | 2b | platform/prices |
| 363 | `GET` | `/api/platform/raw-materials` | masterDataRoutes.ts:421 | **2a** | platform/raw-materials |
| 364 | `POST` | `/api/platform/raw-materials` | masterDataRoutes.ts:1532 | 2b | platform/raw-materials |
| 365 | `PUT` | `/api/platform/raw-materials/:code` | masterDataRoutes.ts:1564 | 2b | platform/raw-materials |
| 366 | `POST` | `/api/platform/raw-materials/:code/prices` | masterDataRoutes.ts:1576 | 2b | platform/raw-materials |
| 367 | `GET` | `/api/platform/readiness` | masterDataRoutes.ts:1050 | 2c | platform/readiness |
| 368 | `GET` | `/api/platform/reference` | masterDataRoutes.ts:1040 | **2a** | platform/reference |
| 370 | `GET` | `/api/platform/uniqueness` | masterDataRoutes.ts:1502 | **2a** | platform/uniqueness |
