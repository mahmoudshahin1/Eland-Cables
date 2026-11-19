# مواصفات فيتشر أوامر البيع والتعهدات (docs/briefs/orders.md)

## 1. الهدف (Feature Goal)
<!-- اكتب الهدف هنا / يملأه المطور أو مدير المنتج -->


---

## 2. الملفات التي يملكها هذا الفيتشر (Owned Files)
يتحمل مطور هذا الفيتشر المسؤولية الكاملة عن تطوير وصيانة هذه الملفات:
- `src/components/customer/CustomerCommitmentPanel.tsx` (لوحة تحكم وإدخال تعهدات العميل).
- `src/components/common/SalesOrders.tsx` (شاشة عرض ومتابعة أوامر البيع للعميل والداخل).
- `src/components/fulfillment/*` (مساحة عمل استيفاء التعهدات وإدارة الاتفاقيات).
- `src/server/commercialCommitmentRoutes.ts` (مسارات Express الخاصة بالتعهدات التجارية).
- `src/server/commercialCommitmentRepository.ts` (مستودع بيانات التعهدات والكميات المحجوزة).
- `src/server/salesOrderRoutes.ts` (مسارات Express الخاصة بأوامر البيع).
- `src/server/salesAgreementRoutes.ts` (مسارات اتفاقيات البيع الإطارية).
- `src/server/agreementReleaseRoutes.ts` (مسارات إفراجات وسحوبات الاتفاقيات).
- `src/services/commercialCommitmentApiService.ts` (خدمات استدعاء APIs التعهدات وأوامر البيع).

---

## 3. الملفات الممنوعة (Forbidden Files)
يُحظر على مطور هذا الفيتشر تعديل هذه الملفات لتجنب كسر فيتشر عروض الأسعار أو استقرار النظام:
- `src/components/inquiry-quotation/*` (مملوك لفيتشر عروض الأسعار والاستفسارات).
- `src/components/internal/SalesQuotations.tsx` (مملوك لفيتشر عروض الأسعار).
- `src/server/commercialQuotationRoutes.ts` (مملوك لفيتشر عروض الأسعار).
- `src/server/v2QuotationRepository.ts` (مملوك لفيتشر عروض الأسعار).
- `src/server/v2InquiryConfigurationRoutes.ts` (مملوك لفيتشر عروض الأسعار).
- `prisma/schema.prisma` (ممنوع التعديل؛ خاص بمالك المشروع).
- `prisma/migrations/*` (ممنوع التعديل؛ خاص بمالك المشروع).

---

## 4. نقطة الربط مع فيتشر عروض الأسعار (Integration Point & Handshake)
- **آلية الاستلام والربط (Handshake Mechanism)**:
  - ينطلق فيتشر أوامر البيع والتعهدات لحظة قبول العميل لعرض السعر (`customerDecision: 'ACCEPTED'`).
  - تقوم واجهة `CustomerCommitmentPanel` باستلام كائن العرض المعتمد `CommercialQuotation` مع معرف العرض `quotationId` ومعرف الاستفسار `inquiryId`.
  - يتيح المكون للعميل تحديد نمط الاستيفاء:
    1. **أمر شراء مباشر (Direct Order)**: إنشاء أمر بيع فوري لتوريد كامل الكمية.
    2. **اتفاقية بيع إطارية (Sales Agreement)**: حجز كمية سنوية/مشروع والسحب منها تدريجياً عبر إفراجات (`AgreementRelease`).
  - يتم استدعاء مسار `POST /api/commercial-commitments` لإنشاء التعهد وتثبيت الكمية المحجوزة `totalCommittedQuantity`، ثم يُستدعى `POST /api/sales-orders` لتوليد أمر البيع `EpcSalesOrder` برقم رسمي وربطه بالتعهد والعرض.

---

## 5. معيار الانتهاء والجاهزية (Definition of Done - DoD)
- [ ] استلام العرض التجاري المعتمد وتفعيل لوحة التعهد `CustomerCommitmentPanel` بسلاسة.
- [ ] إنشاء سجل التعهد التجاري `CommercialCommitment` بنجاح وتحديث الكمية المطلوبة والمتبقية بدقة.
- [ ] توليد أمر البيع التنفيذي `EpcSalesOrder` بحالة مؤكدة (`status: CONFIRMED`) وتوليد رقم تسلسلي فريد.
- [ ] ظهور أمر البيع فورياً في شاشة أوامر العميل (`/customer/sales-orders`) وبوابة المبيعات الداخلية.
- [ ] بقاء حالة تكامل النظام الخارجي عند `integrationStatus: NOT_SENT` بدون أخطاء تزامن وهمية مع D365.
- [ ] اجتياز فحص الأنواع البرمجية بدون أي أخطاء (`npm run lint`).
