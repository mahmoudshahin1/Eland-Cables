# Migration Status (حالة الترحيل)

Last updated: 2026-10-06  
Active Branch: `migration/phase-0`  
Source of Truth Schema: `/prisma/schema.prisma`

---

## 1. جدول تتبع المراحل (Phase Progress Tracker)

| Phase | Module | Endpoints (done/total) | G1 (Contract) | G2 (Tests) | G3 (UI) | G4 (Quality) | G5 (Docs) | Notes |
|---|---|---|---|---|---|---|---|---|
| **Phase 0** | **Foundation & Security** | **2 / 2** | ✅ | ✅ | ✅ | ✅ | ✅ | الأساس، الأمان، تنظيف Mock، الفلاتر، توحيد Prisma |
| Phase 1 | Auth / RBAC / Identity | 0 / 49 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | مستعد للبدء بعد اعتماد Phase 0 |
| Phase 2 | Master Data & Metals | 0 / 130 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 3 | Cable Authority & Configurator | 0 / 16 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 4 | Commercial (Inquiries & Quotations) | 0 / 182 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 5 | Costing & Pricing Engine | 0 / 109 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | أعلى مخاطرة - Golden tests رقمية |
| Phase 6 | Container Study & Logistics | 0 / 54 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 7 | Workflows & Commitments | 0 / 39 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Phase 8 | Integrations (D365, Advaris, AI) | 0 / 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| **الإجمالي** | **الكلي** | **2 / 585** | - | - | - | - | - | |

---

## 2. إنجازات المرحلة 0 (Phase 0 Definition of Done)

1. **حصر الـ Endpoints:** تم إنشاء سكربت آلي وتوليد [`docs/MIGRATION/ENDPOINT_INVENTORY.md`](file:///c:/Users/mahmoud.mohamed/Desktop/personal/ELAND-CABLES/energya-connect-platform-main/energya-connect-platform-main/docs/MIGRATION/ENDPOINT_INVENTORY.md) بإجمالي **585 endpoint** مصنفة وموزعة على المراحل.
2. **خط الأساس للاختبارات (Baseline Tests):** تشغيل جميع الاختبارات المسجلة (202 ملف اختبار) وحفظ النتائج في [`docs/MIGRATION/BASELINE_TESTS.md`](file:///c:/Users/mahmoud.mohamed/Desktop/personal/ELAND-CABLES/energya-connect-platform-main/energya-connect-platform-main/docs/MIGRATION/BASELINE_TESTS.md).
3. **تنظيف NestJS وحذف الـ Mock Data:**
   - حذف الـ demo login والـ fallback من `AuthService`.
   - حذف `sampleInquiries` من `InquiriesService`.
   - حذف `sampleCables` من `MasterDataService`.
   - تعديل `PrismaService` ليفشل صراحة (Fail Loudly) عند انقطاع الاتصال بقاعدة البيانات ومنع أي fallback وهمي في الذاكرة.
4. **الأمان والتحقق (Security Hardening):**
   - تثبيت `helmet`، `class-validator`، `class-transformer`، `@nestjs/throttler`.
   - تفعيل `ConfigModule` مع فحص إلزامي صارم لـ `DATABASE_URL` و`JWT_SECRET` (32 حرف على الأقل).
   - تفعيل Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
   - تفعيل Global `DomainExceptionFilter` يطابق بنية أخطاء Express القديمة بدقة.
5. **توحيد الـ Prisma Schema:**
   - حذف مجلد `energya-backend/prisma` بالكامل.
   - توجيه NestJS إلى المرجع الوحيد الموحد `../prisma/schema.prisma`.
6. **Parity Harness:**
   - إنشاء [`scripts/parity/parityHarness.mjs`](file:///c:/Users/mahmoud.mohamed/Desktop/personal/ELAND-CABLES/energya-connect-platform-main/energya-connect-platform-main/scripts/parity/parityHarness.mjs) وملف fixtures لـ Phase 0.
7. **ربط واجهة React القديمة (dev:legacy-ui):**
   - إضافة سكربت `dev:legacy-ui` في `package.json`.
   - تهيئة Vite Proxy لتوجيه طلبات `/api` إلى NestJS (`:3000`).

---

## 3. اختلافات مقصودة عن القديم (Intentional differences)
- تم إضافة مهلة افتراضية (`--test-timeout=5000`) في `scripts/runRegisteredTests.mjs` حتى لا تتجمد فحوصات التكامل عند غياب الاتصال بقاعدة البيانات.
- تم ضبط `AppController` في NestJS على مسار `/api/platform/health` و`/api/platform/status` لتتطابق بنيتها مع Express.

---

## 4. العوائق والمسائل المفتوحة (Open Issues & Blockers)
- قاعدة بيانات PostgreSQL المحلية غير مشغلة حالياً (بيئة ويندوز لا تحتوي على Docker Desktop مثبت). سنحتاج تشغيل PostgreSQL محلياً أو الاتصال بقاعدة بيانات تطويرية قبل بدء اختبارات التكامل لـ Phase 1.
