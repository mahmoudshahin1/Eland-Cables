# Standard Workflow — جدول التحقق والمراجعة

> هذا سجل حي. كل سطر يُحدّث لما يتحقق بند جديد أو يتغير. ممنوع اعتبار أي بند "متحقق" بدون دليل مسار+سطر.

---

## حالة التحقق (29 أكتوبر 2026)

| # | الادعاء | الحالة | الدليل |
|---|---|---|---|
| 1 | `roleForStep` ترجع `undefined` لـ `CONTAINER_STUDY` | ✅ متحقق | `workflowRuntimeRepository.ts` ~790 |
| 2 | مفيش دور LOGISTICS ولا QUALITY | ✅ متحقق | `permissionCatalog.ts` (قائمة `code:` الكاملة، 14 دور) |
| 3 | الرجوع موجود في حالتين بس | ✅ متحقق (الدليل اتصحح) | `20260919200000_standard_workflow_quotation_v2/migration.sql` سطر ~94 و100 — مش `20260910120000` |
| 4 | الأوركستريتور بيمرّر آلياً | ✅ متحقق مع تحفظ | `standardWorkflowOrchestrator.ts` فيه بوابات إيقاف حقيقية (304-356, 424, 504)، مش تمرير أعمى بالكامل |
| 5 | `workflowApiService.ts` بدون transition | ✅ متحقق | فيه قراءة بس: `fetchWorkflowForInquiry`, `fetchMyWorkflowTasks` |
| 6 | `assertCanTransitionWorkflow` عامة ومش بتقارن دور-بمرحلة | ✅ متحقق | `rbac.ts:801-811` |
| 7 | **فجوة RBAC: SALES_REPRESENTATIVE / TECHNICAL_OFFICE_MANAGER / COSTING_USER / COSTING_MANAGER بدون `WORKFLOW.TRANSITION`** | ✅ متحقق — اكتشاف جديد حرج | `permissionCatalog.ts` سطور 161-169 (TO_MANAGER)، 170-181 (SALES_REP)، 226-236 (COSTING_USER)، 237-245 (COSTING_MANAGER) |
| 8 | `invalidateCostingRun` موجودة كآلية للتعامل مع تعديل السطور بعد Costing | ❌ **غير صحيح** | بحث شامل case-insensitive في `src` — صفر نتائج |
| 9 | أزرار متفرقة في `CommercialInquiryDetail.tsx` تحتاج توحيد | ❌ **غير صحيح كما ظُن** | الموجود فعلياً: `handleSubmit`/`confirmSubmit` و`handleCancel` بس |
| 10 | `fanOutRole` بتفلتر المستخدمين النشطين | ❌ **غير صحيح** | `userNotificationService.ts:29-48` — بتجيب كل أعضاء `UserRole` بدون فلتر |
| 11 | `EmailOutbox`/`enqueueEmail` بيمنع التكرار | ❌ **غير صحيح** | `emailOutboxService.ts:69-91` — insert مباشر كل مرة |
| 12 | `WorkflowStageTiming` فيها حقل "أول فتح" | ❌ **غير موجود** | `schema.prisma` — الحقول: `startedAt`/`completedAt`/`durationSeconds`/`owner` بس |
| 13 | قيمة `inquiryProcessCode` لمسار VIP `'VIP_FAST_TRACK'` ولمسار Standard `'STANDARD_WORKFLOW'` | ✅ متحقق، القيمتين صحيحتين (تراجع عن شك سابق بوجود تناقض) | `v2CustomerInquiryPresentation.ts:24`, `workflowRuntimeRepository.ts:962` |
| 14 | الكود متطابق بين `main` وبرانش `docs/project-context` | ✅ متحقق | `diff -rq` — صفر فرق في `src/` أو `prisma/`؛ الفرق فقط في `docs/*` و`AGENTS.md` (مبادرة NestJS منفصلة متوقفة) |
| 15 | `serializeInstance` بيرجّع `stageTimings` و `events` بالفعل في الباك إند | ✅ متحقق — اكتشاف Task 0 | `workflowRuntimeRepository.ts:874-953` و `workflowRoutes.ts:104-113` |
| 16 | `workflowApiService.ts` أسقطت `events` من الـ TypeScript interface فقط | ✅ متحقق — اكتشاف Task 0 | `src/services/workflowApiService.ts:20-34` — الباك إند بيرسلها والفرونت مش معرفها في الـ type |
| 17 | سجل `AuditEvent` للاستفسار متاح بالفعل عبر `fetchInquiryActivity` | ✅ متحقق — اكتشاف Task 0 | `src/services/commercialInquiryApiService.ts:462-471` و `CommercialInquiryDetail.tsx:456-463` |
| 18 | حجم `CommercialInquiryDetail.tsx` الفعلي ومدى عزله عن VIP | ✅ متحقق — اكتشاف Task 0 | الملف 3,469 سطراً. عزل VIP مضمون بشرط `isVipV2Inquiry || inquiry.commercialMetadata?.inquiryProcessCode === 'VIP_FAST_TRACK'` (سطور 587، 2402، 2567). استخراج مكون منفصل `WorkflowStatusWorkspaceTab.tsx` يحصر التعديل في ~15-20 سطراً فقط |
| 19 | **تاب `audit`/`activity` موجود مسبقاً والتكرار المقترح اتصحح** | ✅ متحقق ومُصحح — اكتشاف Task 0 | تاب 'audit' مُرندر بالفعل في `CommercialInquiryDetail.tsx:2778` بعنوان "Activity & Audit Trail" ويعرض نفس `AuditEvent`. تم حذف قسم التدقيق العام من المكون الجديد تماماً، والاكتفاء برابط بسيط "View full audit trail" يحوّل لتاب 'audit' الأصلي بدون تكرار داتا أو endpoints |
| 20 | **تنفيذ Task 0 واختبار الـ Typecheck واختبارات الـ Workflow** | ✅ مكتمل ومتحقق | `tsc --noEmit` يمر بنجاح (صفر أخطاء) مع `--max-old-space-size=4096` لتفادي حد ذاكرة V8 للمشروع الضخم، واجتياز اختبارات `workflowRuntimeService.test.ts` بنجاح تام |
| 21 | **استيراد `v2QuotationPdfUrl` في `CommercialInquiryDetail.tsx`** | ✅ متحقق ومُصحح — اكتشاف Task 0 أثناء الـ build | كان مفقوداً من الاستيرادات في `CommercialInquiryDetail.tsx` ويسبب خطأ تجميع؛ تم استيراده من `../../services/v2QuotationApiService` لضمان نظافة الـ build 100% |
| 22 | **سلوك المكون عند إرجاع 404 / null من `fetchWorkflowForInquiry`** | ⚠️ محدودية معروفة مقبولة لـ Task 0 | إذا لم يتم العثور على workflow instance (إرجاع null عند 404)، يعرض المكون حالة افتراضية صامتة مع زر إعادة المحاولة، ولا يعرض رسالة "not found" مخصصة تفاعلية؛ مقبول لـ Task 0 كقراءة فقط ومجدول كتحسين مستقبلي |

---

## لسه محتاج تحقق (لو ظهر في نطاق التاسكات القادمة)

- مين بالظبط بيستدعي `transitionWorkflow` غير الـ route الرئيسي — جرد كامل لكل route في `workflowRoutes.ts` وهل عليه فحص دور (مؤجل لـ Task 2).
- الآلية الحقيقية (لو موجودة) للتعامل مع تعديل السطور بعد حساب Costing (بديل `invalidateCostingRun` الوهمية) (مؤجل لـ Task 2).

---

## أسئلة مفتوحة للمهندس (لم يُرد عليها بعد)

1. الترتيب الحالي للمراحل هو المطلوب؟ فيه قسم جودة أو أدمن؟
2. Change Request يرجع لمين بالظبط؟
3. بعد التعديل: يمر على كل المراحل تاني ولا يرجع مباشرة؟
4. الإسناد: طابور القسم ولا توزيع المدير؟
5. نسجل 3 أوقات (إرسال/أول فتح/بداية شغل)؟
6. الإيميل: نص بسيط ولا قالب رسمي؟ + تأكيد SMTP.

---

## قاعدة العمل لهذا البرانش

- كل تاسك (0 إلى 5 في `PLAN.md`) يُنفذ داخل نفس البرانش `feat/standard-workflow`، بـ commit منفصل لكل تاسك.
- Plan Mode (قراءة بس) → موافقة صريحة → تنفيذ → `git diff` → اختبار يدوي → موافقة على الـ commit → commit.
- ممنوع push/merge بدون إذن صريح.
- أي بند في هذا الملف يتغير من "غير متحقق" لـ "متحقق" أو العكس، لازم يُحدّث هنا فوراً مع الدليل.
