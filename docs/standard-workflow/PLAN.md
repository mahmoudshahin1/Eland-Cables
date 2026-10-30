# Standard Workflow — خطة التنفيذ (موحّدة بعد المراجعة)

> آخر تحديث: 29 أكتوبر 2026
> البرانش: `feat/standard-workflow` (من `main`)
> النطاق: مسار STANDARD فقط. مسار VIP (`inquiryProcessCode === 'VIP_FAST_TRACK'`) معزول تماماً، ممنوع لمسه.
> هذا الملف يحل محل أي نسخة سابقة من خطة Antigravity. أي بند هنا غير مؤكد على الكود مُعلّم صراحة.

---

## 1) الوضع الحالي (متحقق منه على main)

### المراحل الـ 14 (`STANDARD_INQUIRY_V1`)
SUBMITTED → TECHNICAL_REVIEW → (NEEDS_INFORMATION / CUSTOMER_CLARIFICATION / CUSTOMER_RESPONSE) → TECHNICAL_COMPLETE → CONTAINER_STUDY → COSTING → SALES_REVIEW → QUOTATION_APPROVAL → QUOTATION_ISSUE → CUSTOMER_DECISION → COMMERCIAL_COMMITMENT → FULFILLMENT.

### الرجوع الحالي
حالتين بس، في `prisma/migrations/20260919200000_standard_workflow_quotation_v2/migration.sql` (~سطر 94 و100):
`QUOTATION_APPROVAL → SALES_REVIEW` و `QUOTATION_ISSUE → SALES_REVIEW`.
لا يوجد أي رجوع آخر في قاعدة البيانات.

### فرض الصلاحيات (`assertCanTransitionWorkflow`, `rbac.ts:801`)
يتحقق بس من: المستخدم مش عميل + عنده صلاحية `WORKFLOW.TRANSITION` العامة. **لا توجد مقارنة بين دور المستخدم والمرحلة الحالية للطلب.** أي مستخدم عنده الصلاحية يقدر يحرّك أي طلب من أي مرحلة.

### ⚠️ فجوة RBAC حرجة (جديد — متحقق منها)
من `src/domain/permissionCatalog.ts`، هذه الأدوار **ليس لديها** `WORKFLOW.TRANSITION`:

| الدور | الحالة |
|---|---|
| TECHNICAL_OFFICE_ENGINEER | ✅ عنده |
| SALES_MANAGER | ✅ عنده |
| **SALES_REPRESENTATIVE** | ❌ VIEW/COMPLETE بس |
| **TECHNICAL_OFFICE_MANAGER** | ❌ مفيش module WORKFLOW خالص |
| **COSTING_USER** | ❌ مفيش module WORKFLOW خالص |
| **COSTING_MANAGER** | ❌ VIEW/COMPLETE بس |

**أثر مباشر:** لو ما اتصلحتش، مندوب المبيعات وقسم الكوستنج ومدير المكتب الفني مش هيقدروا يضغطوا Submit على مراحلهم — هيطلع 401. هذا جزء أساسي من أي تاسك يضيف شريط الأزرار.

### `roleForStep` (`workflowRuntimeRepository.ts` ~790)
بترجع `undefined` لـ `CONTAINER_STUDY`. لا يوجد دور `LOGISTICS` ولا `QUALITY` في `permissionCatalog.ts` أصلاً.

### الأوركستريتور (`standardWorkflowOrchestrator.ts`)
`runStandardWorkflowAfterSubmit` بتمرّر الطلب آلياً في المسار السعيد (كابل معتمد) حتى مسودة العرض، مع بوابات إيقاف حقيقية داخلها (lineage، Container Study، costing pin — أسطر تقريبية 304-356، 424، 504). بتتنادى من `commercialRepository.ts:691` و`v2InquiryConfigurationRepository.ts:1016`. **يوجد اختبار e2e معتمد على هذا السلوك الآلي** (ملف يحتوي `containerStudy...test.ts`) — أي تعديل لازم يراجع هذا الاختبار.

### الإشعارات والبريد
- `fanOutRole` (`userNotificationService.ts`): بتجيب كل أعضاء الدور من `UserRole` **من غير فلتر "نشط"**.
- `enqueueEmail` (`emailOutboxService.ts`): بتعمل insert في `EmailOutbox` كل مرة **من غير فحص تكرار (idempotency)**.
- `standardWorkflowNotifications.ts`: بترسل لقايمة مبيعات ثابتة (`NOTIFY_SALES_EMAIL`)، مش لدور المرحلة التالية ديناميكياً.

### `WorkflowStageTiming`
الحقول: `startedAt` / `completedAt` / `durationSeconds` / `owner` بس. **لا يوجد حقل "أول فتح/استلام"**. طلب المهندس (إرسال 8:00 → فتح 9:00 → بداية شغل بعدها بيومين) يحتاج تصميم جديد (حقل أو حدث إضافي).

### الأزرار الحالية في `CommercialInquiryDetail.tsx`
الموجود فعلياً: `handleSubmit`/`confirmSubmit` (إرسال الاستفسار الأول) و`handleCancel` بس. **لا توجد أزرار approve/reject/issue متفرقة** تحتاج توحيد (عكس ما كان مفترضاً سابقاً).

### `workflowApiService.ts`
قراءة بس: `fetchWorkflowForInquiry`, `fetchMyWorkflowTasks`. لا توجد دالة transition.

### ❌ ادعاء غير صحيح (محذوف من الخطة)
`invalidateCostingRun` — **غير موجودة في الكود خالص** (بحث شامل في `src`). أي اعتماد عليها في قرارات سابقة ملغي. لو فيه آلية فعلية للتعامل مع "السطور اتعدلت بعد التكلفة"، لازم تُكتشف أولاً باسمها الحقيقي قبل أي تصميم.

---

## 2) القرارات المفتوحة (في انتظار رد المهندس — لا تُفترض)

1. الترتيب الحالي للمراحل مطلوب؟ فيه قسم جودة أو أدمن؟
2. Change Request يرجع لفين بالظبط (تتابعي للقسم السابق / اختيار المستخدم / دايماً للمبيعات)؟
3. بعد التعديل: يمر على كل المراحل تاني ولا يرجع مباشرة؟
4. الإسناد: طابور القسم (Role Queue) ولا توزيع المدير؟
5. نسجل 3 أوقات (إرسال، أول فتح، بداية شغل)؟
6. الإيميل: نص بسيط ولا قالب رسمي؟ + تأكيد SMTP على البيئة الحقيقية.

**حتى يرد المهندس، أي افتراض في هذه النقاط يُكتب صراحة كـ "افتراض مؤقت" وليس قراراً نهائياً.**

---

## 3) ترتيب التنفيذ المتفق عليه

واحد تلو الآخر، كل واحد يحتاج موافقة صريحة قبل commit:

### **Task 0 — Workflow Status Tab (تم الـ commit (2 commits)، في انتظار الاختبار اليدوي قبل الـ push)**
أقل مخاطرة، يوري المهندس تقدم ملموس بسرعة. لا يحتاج حل فجوة RBAC ولا الانتظار على رد المهندس، وصفر تعديل في الباك إند. تم بناء المكون المنفصل وتوصيل زر الهيدر والتحقق بنجاح من npx tsc --noEmit وجميع اختبارات الـ workflow.

#### أ. موقع التاب في `inquiryWorkspaceTabs.ts` وشرط الظهور الصارم:
- **الملف:** `src/components/inquiry-quotation/inquiryWorkspaceTabs.ts`
  - إضافة `'workflow_status'` كمعرف تبويب في النوع `InquiryWorkspaceTab` (سطر 1-15).
  - إضافة التسمية في `TAB_LABELS`: `workflow_status: 'Workflow Status'` (سطر 31-45).
  - في دالة `resolveInquiryWorkspaceTabs`: إضافة المعامل `isStandardWorkflow?: boolean`.
  - **موقع التاب:** الموضع الثاني مباشرة بعد تبويب `'overview'` (بين Overview و Cables) ليكون واضحاً ومباشراً للمتابعة.
- **شرط الظهور (STANDARD فقط بدليل كود قاطع):**
  - في `CommercialInquiryDetail.tsx:587`:  
    `const isVipV2Inquiry = Boolean(inquiry && canCalculateInquiry(inquiry) && isV2InquiryMetadata(inquiry.commercialMetadata));`
  - في `CommercialInquiryDetail.tsx:2402, 2567, 2607`:  
    `inquiry.commercialMetadata?.inquiryProcessCode === 'VIP_FAST_TRACK'`
  - **الشرط الحصري المعزول تماماً:**  
    `const isStandardWorkflow = Boolean(!isVipV2Inquiry && inquiry?.commercialMetadata?.inquiryProcessCode !== 'VIP_FAST_TRACK');`
  - يُمرر هذا المتغير لدالة `resolveInquiryWorkspaceTabs({ ..., isStandardWorkflow })` لمنع ظهور التاب نهائياً لمسار VIP.

#### ب. تحليل الـ Endpoint وجلب البيانات (صفر تعديل في الباك إند):
- **الواقع الفعلي المتحقق بالكود:**
  - الـ Endpoint الحالي: `GET /api/v2/workflows/by-entity/CommercialInquiry/:inquiryId` في `src/server/workflowRoutes.ts:104-113` عبر `serializeInstance` في `src/server/workflowRuntimeRepository.ts:874-953` **يُرجع بالفعل**:
    1. `stageTimings`: مصفوفة بكافة المراحل وتوقيت الدخول `startedAt` وتوقيت الخروج `completedAt` والمدة `durationSeconds` واسم المسؤول `owner`.
    2. `events`: مصفوفة بكافة الانتقالات والأحداث متضمنة `transitionCode` و `actorName` و `createdAt` و `payloadJson` (طلبات الرجوع مسجلة هنا كـ `RETURN_*`).
    3. `currentStep`, `openTasks`, `totalDurationSeconds`.
    - محمي بـ `assertCanViewWorkflow(actor)` و `assertWorkflowScope(actor, instance)`.
- **التنفيذ**:
  - تحديث واجهة `WorkflowInstanceSummary` في `src/services/workflowApiService.ts:20-35` لتشمل تعريف حقل `events?: WorkflowEventSummary[]` الذي يرجعه السيرفر حالياً بالفعل.
  - استدعاء `fetchWorkflowForInquiry` فقط داخل التاب الجديد، بدون الحاجة لكتابة أو تعديل أي مسار في الباك إند!
- **عدم تكرار سجل التدقيق (Audit Trail)**:
  - تاب `'audit'` (و `'activity'`) موجود مسبقاً في `CommercialInquiryDetail.tsx:2778` بعنوان "Activity & Audit Trail" ويعرض نفس `AuditEvent`، لذلك **تم حذف قسم سجل التدقيق العام من التاب الجديد تماماً منعاً للتكرار**، مع الاكتفاء بزر/رابط بسيط يحوّل المستخدم لتاب التدقيق الأصلي.

#### ج. تفصيل محتوى المكون الجديد `WorkflowStatusWorkspaceTab.tsx`:
1. **بطاقة الوضع الحالي (Current Status Card):**
   - المرحلة الحالية (`currentStep.name` و `currentStepCode`).
   - المسؤول المباشر الحالي عن الخطوة (`owner` أو `openTasks[0].assignments[0].assigneeRef`).
   - تاريخ وتوقيت الاستلام والبدء (`startedAt`).
   - عداد زمني حي للمدة المنقضية في المرحلة الحالية (`Elapsed`) يُحدث كل 15 ثانية، مع إجمالي زمن الطلب (`Total`).
2. **جدول سجل المراحل السابقة (Stage Timing History Table):**
   - استعراض صفوف مصفوفة `stageTimings`:
     - المرحلة / القسم (`name` / `stepCode`).
     - المسؤول المنفذ (`owner`).
     - تاريخ ووقت الإرسال والبدء (`startedAt`).
     - تاريخ ووقت الرد والخروج (`completedAt`).
     - فترة الإنجاز والانتظار (`durationSeconds` منسقة كـ `Xh Ym Zs`).
     - شارة الحالة (منتهية مكتملة / جارية حالياً).
   - **تنبيه صريح بالمحدودية المعروفة (من REVIEW_CHECKLIST.md بند 12):**
     تنبيه بارز أسفل الجدول:
     > ℹ️ **ملاحظة تشغيلية:** النظام يسجل حالياً توقيت إرسال الطلب للقسم وتوقيت الرد بالثانية عبر الخادم؛ خاصية تسجيل وقت 'أول فتح أو استلام للطلب' غير مسجلة حالياً في قاعدة البيانات وسيتم جدولتها في تحديث قادم.
3. **سجل طلبات التعديل (Change Requests Log):**
   - تصفية أحداث مصفوفة `events` لجميع الانتقالات التي تحوي `transitionCode` يبدأ بـ `RETURN_` أو `taskResult === 'RETURNED'`.
   - إظهار حالة فارغة أنيقة (Empty State) توضح: *"لا توجد طلبات تعديل مسجلة على هذا الطلب حتى الآن"* (نظراً لأن مسارات الرجوع لم تُضف بعد في Task 1).
4. **رابط الانتقال لسجل التدقيق الكامل (Audit Trail Link):**
   - رابط/زر بسيط أسفل التاب:  
     `[ View full audit trail → ]`  
     عند النقر عليه يحوّل المستخدم مباشرة لتاب `'audit'` الموجود مسبقاً في الشاشة.

#### د. زر "Workflow" في أعلى الشاشة:
- **الموضع:** شريط الأزرار العلوي في `CommercialInquiryDetail.tsx` بجوار رقم الاستفسار وأزرار الحفظ (سطور 1486-1510).
- **الشرط:** `isStandardWorkflow` حصراً.
- **التصميم والسلوك:**
  ```tsx
  {isStandardWorkflow && (
    <button
      type="button"
      onClick={() => {
        setTab('workflow_status');
        const el = document.getElementById('inquiry-workspace');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-200 text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 transition-colors shadow-xs"
      title="Open Workflow Status Tab"
    >
      <GitBranch className="h-3.5 w-3.5 text-indigo-600" />
      <span>Workflow</span>
    </button>
  )}
  ```

#### هـ. مخاطر الحجم وعزل مسار VIP (Safe Component Extraction):
- ملف `CommercialInquiryDetail.tsx` ضخم (3,469 سطراً).
- خطة تقليل المخاطر:
  1. عزل كافة منطق العرض والتصميم والـ state في ملف جديد مستقل:  
     `src/components/inquiry-quotation/WorkflowStatusWorkspaceTab.tsx`.
  2. التعديل في `CommercialInquiryDetail.tsx` يقتصر على ~15 سطراً فقط:
     - استيراد `WorkflowStatusWorkspaceTab`.
     - إضافة زر `Workflow` العلوي المشروط بـ `isStandardWorkflow`.
     - رندر المكون عند `tab === 'workflow_status'`.
  3. مسار VIP معزول 100% ولن يتأثر به أي سطر.

---

### **Task 1 — قالب V2 + مسارات الرجوع**
قالب `STANDARD_INQUIRY_V2` جديد (وليس تعديل V1 المستخدم في الطلبات الجارية). مسارات رجوع صريحة بجدول (من → إلى → الدور المسؤول)، بما فيها حسم مسار Container Study.

### **Task 2 — الأوركستريتور + فرض الدور من السيرفر + إصلاح فجوة RBAC**
تعديل `runStandardWorkflowAfterSubmit` (مع مراعاة الاختبار الحالي المعتمد عليه)، وإضافة فحص دور-بمرحلة داخل `transitionWorkflow`، وإضافة `WORKFLOW.TRANSITION` للأدوار الناقصة.

### **Task 3 — الإشعارات والبريد الديناميكي**
توجيه لدور المرحلة التالية (مش قايمة ثابتة)، فلترة المستخدمين النشطين في `fanOutRole`، ومنع تكرار البريد.

### **Task 4/5 — شريط الأزرار (Submit/Change Request) + واجهة المكتب الفني**
زرين بس حسب طلب المهندس. الـ Validate يكون جزء من منطق Submit نفسه، مش زرار تالت منفصل.

---

## 4) قاعدة العزل من VIP
`CommercialInquiryDetail.tsx` مشترك بين STANDARD وVIP. أي مكون جديد (Status Tab، Action Bar) يُشترط بـ `inquiryProcessCode === 'STANDARD_WORKFLOW'` بشكل صريح، ويُفضّل استخراجه كمكون منفصل بدل تضخيم الملف الأصلي (3,469 سطر).
