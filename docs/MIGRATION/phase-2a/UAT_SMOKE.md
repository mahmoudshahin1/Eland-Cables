# تجربة دخان Phase 2a

افتح الواجهة على `http://localhost:5173/`. القديم على `3847` وNest على `3000`. كلمات السر مش مكتوبة هنا.

## الحسابات

| البريد | الدور |
|---|---|
| `custA@parity.test` | عميل |
| `admin@energya.com` | أدمن |
| `limited@parity.test` | داخلي بصلاحية ناقصة |

## 1. منتجات العميل

1. ادخل بحساب `custA@parity.test`.
2. افتح Products.
3. المتوقع: قائمة كابلات، من غير أسعار.
4. في Network: `GET /api/v2/cables/products` و`GET /api/v2/cables/products/facets` يرجعوا `200` ومن غير `X-Served-By: nest`.
5. علامة الفشل: `404` أو `401` أو ظهور حقل سعر.

## 2. Drum Optimizer للعميل

1. من نفس حساب العميل افتح Drum Optimizer.
2. اضغط `33kV Substation Project`.
3. المتوقع: أرقام الأطوال والبراميل تظهر على الشاشة.
4. في Network: `GET /api/master/drums` يرجع `200` ومعاه `X-Served-By: nest`.
5. علامة الفشل: القائمة فاضية و`GET /api/master/drums` مش `200`.
6. الشاشة دي بتحسب محليًا. مش المفروض تشوف `POST /api/master/drums/optimize`.

## 3. حساب البراميل من المكتب الفني

1. ادخل بحساب `admin@energya.com`.
2. افتح Technical Office ثم اضغط **Search**.
3. ابحث عن `10009487` واضغط **Select**.
4. في النافذة اكتب Cable Tolerance `2` وCutting Length `1000`.
5. المتوقع: `POST /api/master/drums/candidates` يرجع `200` ومعاه `X-Served-By: nest`. ده وضع **Manual Selection**.
6. لو القائمة فيها برميل مناسب، اختاره.
7. المتوقع بعد الاختيار: `POST /api/master/drums/validate` يرجع `200` ومعاه `X-Served-By: nest`.
8. اضغط **Automatic Optimization**.
9. المتوقع: `POST /api/master/drums/optimize` يرجع `200` ومعاه `X-Served-By: nest`.
10. علامة الفشل: الطلب طلع من غير `X-Served-By: nest`، أو رجع `5xx`.
11. `POST /api/master/drums/capacity` مالوش زر في الواجهة. لو ظهر في Network يبقى حاجة جديدة.

## 4. Cable Master

1. من حساب الأدمن افتح Master Data ثم تبويب **Cable Master**.
2. اكتب `1000` في البحث.
3. المتوقع: الجدول يتفلتر، و`GET /api/master/cables` يرجع `200` ومعاه `X-Served-By: nest`.
4. اضغط على صف.
5. المتوقع الحالي: مفيش `GET /api/master/cables/رقم-الكابل`. الفتح مش بيعمل طلب تفاصيل.
6. علامة الفشل: قائمة الكابلات ترجع `401` أو `403` للأدمن، أو `X-Served-By` مش `nest`.

## 5. المستخدم الناقص

1. ادخل بحساب `limited@parity.test`.
2. الشاشة اللي بتفتح هي Administration مش Cable Master.
3. المتوقع: `GET /api/admin/security` يرجع `403`، والنص `Not authorized for ADMIN:SECURITY:VIEW.`
4. علامة الفشل: يفتح Cable Master ويشوف كل الكابلات من غير `403`.

## النتيجة

| الرقم | الشاشة | Pass/Fail | ملاحظة |
|---|---|---|---|
| 1 | منتجات العميل |  |  |
| 2 | Drum Optimizer |  |  |
| 3 | Candidates |  |  |
| 4 | Validate |  |  |
| 5 | Optimize |  |  |
| 6 | Cable Master |  |  |
| 7 | المستخدم الناقص |  |  |
