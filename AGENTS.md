# AGENTS.md — Energya Connect AI Assistant & Agent Guidelines

## 1. Project Overview (نظرة عامة على المشروع في 5 أسطر)
- **Energya Connect** هي منصة تجارة B2B متخصصة في صناعة الكابلات تربط بين عملاء الشركة (مثل Eland Cables) والأقسام الداخلية (المبيعات، المكتب الفني، التكاليف، الإنتاج).
- تدعم المنصة مسارين رئيسيين للاستفسارات: مسار **VIP Fast Track** للطلب والتسعير الآلي السريع، ومسار **Standard Workflow** التقليدي متعدد المراحل والموافقات.
- النظام مبني بمعمارية هجينة: واجهة React 19 + Vite، وقاعدة بيانات PostgreSQL عبر Prisma ORM موحدة لجميع الخدمات.
- الواجهة الخلفية الحالية تعتمد على خادم Express 4 أحادي كمرجع تشغيلي ومحدد للمواصفات (`server.ts` على المنفذ `3847`).
- يجري ترحيل تدريجي منظم للواجهة الخلفية إلى إطار عمل NestJS 12 (`energya-backend/` على المنفذ `3000`) دون المساس ببيانات العملاء أو كود الواجهة.

---

## 2. Mandatory Workflow (أمر صريح وإلزامي لكل عميل ومساعد ذكي)
> [!IMPORTANT]
> 1. **قبل بدء أي مهمة إطلاقاً**: يجب عليك قراءة الملفين [PROJECT_CONTEXT.md](file:///docs/PROJECT_CONTEXT.md) و [HANDOFF.md](file:///docs/HANDOFF.md) لفهم السياق الهندسي، والقيود الحالية، وما تم إنجازه مؤخراً.
> 2. **في نهاية كل جلسة عمل أو تسليم**: يجب عليك تحديث [HANDOFF.md](file:///docs/HANDOFF.md) بتسجيل ما تم إنجازه، وما هو قيد العمل، والخطوات التالية، وأي تحذيرات ظهرت.

---

## 3. Strict Rules & Operational Boundaries (قواعد صارمة غير قابلة للتفاوض)
1. **ممنوع الـ Commit أو رفع ملفات البناء (Build Artifacts)**:
   - يُحظر تماماً عمل commit للمجلدات والملفات الناتجة عن البناء: `dist/`، `app_dist/`، `api/index.js`، `server.js`.
2. **ممنوع إضافة أي حزم برمجية جديدة (No New Packages)**:
   - لا تقم بتثبيت أي مكتبة عبر `npm install` في جذر المشروع أو داخل `energya-backend/` إلا بإذن صريح ومباشر من المستخدم.
3. **ممنوع تعديل مخطط قاعدة البيانات أو ملفات الترحيل (Schema & Migrations Locked)**:
   - يُمنع لمس `prisma/schema.prisma` أو مجلد `prisma/migrations/` نهائياً؛ هذه التعديلات حصرية لمالك المشروع.
4. **حظر كامل للأسرار والبيانات الحساسة (Zero Secrets Policy)**:
   - يُمنع إدراج أي كلمات سر، أو توكنات JWT، أو روابط قواعد بيانات (Connection Strings)، أو مفاتيح API داخل أي كود أو توثيق أو رسائل شات. استخدم أسماء المتغيرات البيئية فقط (مثل `DATABASE_URL`، `JWT_SECRET`).
5. **ممنوع اختراع بيانات عملاء أو أسعار وهمية**:
   - لا تستخدم أسعاراً حقيقية للعملاء، ولا تفترض أي ميزة هندسية من غير التحقق من الكود المصدري. الكود هو المرجع الصريح لأي توثيق.

---

## 4. Run, Build & Test Commands (الأوامر الفعلية المعتمدة)

### Root Project (Legacy Express & React 19 Frontend)
- **تشغيل بيئة التطوير الموحدة**: `npm run dev` (يشغل `tsx server.ts` على المنفذ `3847` ويشمل وسيط Vite).
- **تشغيل واجهة التطوير الهجينة (Hybrid UI)**: `npm run dev:legacy-ui` (يشغل Vite على المنفذ `5173`).
- **بناء حزمة الإنتاج (Production Build)**: `npm run build` (`vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`).
- **تشغيل الإنتاج**: `npm start` (يشغل `node dist/server.cjs`) أو `npm run start:prod` (يشغل `node scripts/deployStartup.mjs`).
- **فحص الأنواع البرمجية (TypeScript Check)**: `npm run lint` (`tsc --noEmit`).
- **تشغيل الاختبارات القديمة المسجلة**: `npm test` (`node scripts/runRegisteredTests.mjs`).
- **التحقق من تطابق نسخ المنطق (Domain Sync)**: `npm run verify:domain` (`node scripts/parity/verify-domain-sync.mjs`).
- **اختبار التطابق للمرحلة 2a (Parity 2a)**: `npm run test:parity:phase2a` (*تحذير: يستخدم TRUNCATE CASCADE على قواعد بيانات الاختبار؛ يتطلب إذناً*).
- **قواعد البيانات (Prisma)**: `npm run prisma:migrate` و `npm run prisma:seed`.

### Modern Target Backend (`energya-backend/` - NestJS 12)
- **تشغيل خادم التطوير (Nest Watch)**: `npm run start:dev` (داخل `energya-backend/` عبر `npx tsx watch src/main.ts` على المنفذ `3000`).
- **بناء المشروع (Nest Build)**: `npm run build` (`tsc -p tsconfig.build.json`).
- **تشغيل اختبارات الوحدة (Unit Tests)**: `npm test` (`vitest run`).
- **تشغيل اختبارات التكامل (E2E Tests)**: `npm run test:e2e` (`vitest run --config ./vitest.config.e2e.ts`).
- **فحص الجودة والكود (Linter)**: `npm run lint` (`oxlint --type-aware src/ test/`).

---

## 5. Feature Ownership Map (خريطة ملكية الميزات)

| المجال الوظيفي | فيتشر عروض الأسعار (Quotations Feature) | فيتشر أوامر البيع والتعهدات (Orders Feature) |
|---|---|---|
| **نطاق العمل** | إنشاء الاستفسار، التهيئة الفنية، حساب التكلفة والهامش، إصدار العرض واعتماده، قرار العميل. | تسجيل تعهد العميل التجاري، إنشاء وتأكيد أمر البيع، إفراجات الاتفاقيات، والتجهيز للإنتاج. |
| **الملفات المملوكة بالكامل** | - `src/components/inquiry-quotation/*`<br>- `src/server/v2QuotationRepository.ts`<br>- `src/server/commercialQuotationRoutes.ts`<br>- `src/server/v2InquiryConfigurationRoutes.ts`<br>- `src/services/quotationApiService.ts` | - `src/components/customer/CustomerCommitmentPanel.tsx`<br>- `src/components/fulfillment/*`<br>- `src/components/common/SalesOrders.tsx`<br>- `src/server/commercialCommitmentRoutes.ts`<br>- `src/server/commercialCommitmentRepository.ts`<br>- `src/server/salesOrderRoutes.ts` |
| **الملفات المشتركة (تتطلب حذراً)** | - `src/server/commercialRepository.ts`<br>- `src/server/rbac.ts`<br>- `src/server/customerScope.ts`<br>- `src/types.ts` | - `src/server/commercialRepository.ts`<br>- `src/server/rbac.ts`<br>- `src/server/customerScope.ts`<br>- `src/types.ts` |
| **نقطة التسليم والربط (Handshake)** | عند موافقة العميل (`customerDecision === 'ACCEPTED'`) على العرض `CommercialQuotation`، يُفعّل واجهة `CustomerCommitmentPanel`. | تستلم `CustomerCommitmentPanel` العرض المعتمد وتنشئ سجل `CommercialCommitment`، وتصدر منه `EpcSalesOrder`. |
| **الوثائق المرجعية للبريف** | [docs/briefs/quotation.md](file:///docs/briefs/quotation.md) | [docs/briefs/orders.md](file:///docs/briefs/orders.md) |
