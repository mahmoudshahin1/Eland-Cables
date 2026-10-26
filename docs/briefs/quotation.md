# مواصفات فيتشر عروض الأسعار (docs/briefs/quotation.md)

## 1. الهدف (Feature Goal)
<!-- اكتب الهدف هنا / يملأه المطور أو مدير المنتج -->


---

## 2. الملفات التي يملكها هذا الفيتشر (Owned Files)
يتحمل مطور هذا الفيتشر المسؤولية الكاملة عن تطوير وصيانة هذه الملفات:
- `src/components/inquiry-quotation/*` (تشمل تفاصيل الاستفسارات، عروض الأسعار، وتوليد الـ PDF).
- `src/components/customer/PriceEstimation.tsx` (واجهة استفسارات وعروض أسعار العميل).
- `src/components/internal/SalesQuotations.tsx` (شاشة مراجعة واعتماد عروض الأسعار للمبيعات).
- `src/server/commercialQuotationRoutes.ts` (مسارات Express الخاصة بعروض الأسعار).
- `src/server/v2QuotationRepository.ts` (مستودع بيانات وعمليات عروض الأسعار V2).
- `src/server/v2InquiryConfigurationRoutes.ts` (مسارات تهيئة وحساب بنود الاستفسار).
- `src/services/quotationApiService.ts` (خدمة استدعاء الـ APIs لعروض الأسعار في الواجهة).

---

## 3. الملفات الممنوعة (Forbidden Files)
يُحظر على مطور هذا الفيتشر تعديل هذه الملفات لتجنب كسر فيتشر أوامر البيع أو القواعد العامة للنظام:
- `src/components/customer/CustomerCommitmentPanel.tsx` (مملوك لفيتشر أوامر البيع والتعهدات).
- `src/components/fulfillment/*` (مملوك لفيتشر أوامر البيع والتعهدات).
- `src/server/commercialCommitmentRoutes.ts` (مملوك لفيتشر أوامر البيع والتعهدات).
- `src/server/commercialCommitmentRepository.ts` (مملوك لفيتشر أوامر البيع والتعهدات).
- `src/server/salesOrderRoutes.ts` (مملوك لفيتشر أوامر البيع والتعهدات).
- `prisma/schema.prisma` (ممنوع التعديل؛ خاص بمالك المشروع).
- `prisma/migrations/*` (ممنوع التعديل؛ خاص بمالك المشروع).

---

## 4. نقطة الربط مع فيتشر أوامر البيع (Integration Point & Handshake)
- **آلية التسليم (Handshake Mechanism)**:
  - تنتهي مسؤولية فيتشر عروض الأسعار عند تسجيل قرار العميل بالقبول الرسمي (`customerDecision: 'ACCEPTED'`) عبر المسار `POST /api/quotations/:id/customer-decision`.
  - عند نجاح القبول، يتم تفعيل مكون `CustomerCommitmentPanel` ونقل كائن العرض المعتمد `CommercialQuotation` بكافة لقطات أسعاره وبنوده وشروطه إلى فيتشر أوامر البيع.
  - يستلم فيتشر أوامر البيع بيانات العرض ليقوم بإنشاء سجل التعهد التجاري `CommercialCommitment`، وتحديد نمط الاستيفاء (`DIRECT_ORDER` أو `SALES_AGREEMENT`)، ثم توليد أمر البيع التنفيذي `EpcSalesOrder`.

---

## 5. معيار الانتهاء والجاهزية (Definition of Done - DoD)
- [ ] إمكانية إنشاء الاستفسار وإدخال بنود الكابلات وأسعار المعادن اللحظية وتحديد شرط التسليم بنجاح.
- [ ] حساب التكلفة وتطبيق هوامش الربح بدقة وتوليد مسودة عرض السعر برقم تسلسلي فريد (`QUO26-XXXXX`).
- [ ] مراجعة واعتماد العرض تجارياً من المبيعات وإصداره رسمياً للعميل (`status: ISSUED`).
- [ ] إمكانية استعراض وتنزيل ملف PDF رسمي للعرض بصلاحية 48 ساعة وبدون فتح نافذة طباعة المتصفح.
- [ ] استلام وتسجيل قرار العميل (قبول / رفض / طلب استيضاح) وتحديث حالة السجل، مع إشعار إدارة المبيعات.
- [ ] اجتياز فحص مطابقة الأنواع البرمجية بدون أي أخطاء (`npm run lint`).
