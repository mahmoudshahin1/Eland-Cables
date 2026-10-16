# Phase 2a Security Review & Audit Report (SECURITY_REVIEW.md)
**Module:** Master Data Read & Drum Engine (`migration/phase-2`)  
**Scope:** Phase 2a (36 endpoints)  
**Date:** 2026-10-16  
**Status:** ⚠️ **Findings Transferred for 1:1 Parity — No Silent Tightening — Ready for Review**  
**Protocol:** Conforms to `docs/MIGRATION/PHASE_CLOSING_PROTOCOL.md` (Section 3.2)

---

## أ. جدول مسارات المرحلة 2a والصلاحيات والحراس (Endpoints Security Matrix)

| # | Method | Path | Guard المستخدم في NestJS | الصلاحية المطلوبة | عام (بلا مصادقة)؟ | مسموح للعميل؟ | يطابق القديم؟ |
|---|:---:|---|---|---|:---:|:---:|:---:|
| 1 | `GET` | `/api/master/cables` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 2 | `GET` | `/api/master/cables/:materialNumber` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 3 | `GET` | `/api/master/cables/:materialNumber/attachments` | *(Public / No Auth)* | - | ⚠️ نعم (SEC-MD-02) | ✅ نعم | ✅ نعم (مطابق للقديم) |
| 4 | `GET` | `/api/master/cables/:materialNumber/attachments/:attachmentId` | *(Public / No Auth)* | - | ⚠️ نعم (SEC-MD-02) | ✅ نعم | ✅ نعم (مطابق للقديم) |
| 5 | `POST` | `/api/master/cables/:materialNumber/attachments` | `MasterWriteAuthGuard` | `CABLE_MASTER:CREATE/UPDATE` | لا | ❌ ممنوع (403) | ✅ نعم (مطابق 100%) |
| 6 | `DELETE`| `/api/master/cables/:materialNumber/attachments/:attachmentId` | `MasterWriteAuthGuard` | `CABLE_MASTER:DELETE` | لا | ❌ ممنوع (403) | ✅ نعم (مطابق 100%) |
| 7 | `GET` | `/api/master/raw-materials` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ⚠️ نعم (SEC-MD-01) | ✅ نعم (مطابق للقديم) |
| 8 | `GET` | `/api/master/boms` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ⚠️ نعم (SEC-MD-01) | ✅ نعم (مطابق للقديم) |
| 9 | `GET` | `/api/master/drums` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 10| `GET` | `/api/master/drums/:drumCode` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 11| `POST`| `/api/master/drums/capacity` | `DrumComputeAuthGuard` | SignedIn / Customer | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 12| `POST`| `/api/master/drums/candidates` | `DrumComputeAuthGuard` | SignedIn / Customer | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 13| `POST`| `/api/master/drums/optimize` | `DrumComputeAuthGuard` | SignedIn / Customer | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 14| `POST`| `/api/master/drums/validate` | `DrumComputeAuthGuard` | SignedIn / Customer | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 15| `GET` | `/api/master/reference` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 16| `GET` | `/api/master/keys` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 17| `GET` | `/api/master/uniqueness` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 18| `GET` | `/api/master/sot-status` | `MasterReadAuthGuard` | 1 of 7 master perms | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 19| `GET` | `/api/platform/db` | `JwtAuthGuard` | SignedIn | لا | ❌ ممنوع | ✅ نعم (مطابق 100%) |
| 20| `GET` | `/api/v2/cables/products` | `JwtAuthGuard` + Customer Scoping | SignedIn / Customer | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
| 21| `GET` | `/api/v2/cables/products/facets` | `JwtAuthGuard` + Customer Scoping | SignedIn / Customer | لا | ✅ نعم | ✅ نعم (مطابق 100%) |
*(بقية المسارات الـ 36 تشمل مسارات المخططات والـ sub-paths الداخلية المعرفة في جرد Phase 2a وكلها تتبع ذات الحراس والصلاحيات).*

---

## ب. قائمة المسارات العامة (بدون مصادقة) والمبرر

| المسار | النوع | المبرر والسلوك في القديم | القرار والتوصية |
|---|---|---|---|
| `GET /api/master/cables/:mat/attachments` | قراءة المرفقات | في الكود القديم (`src/server/masterDataRoutes.ts:326`)، لا يوجد أي استدعاء لحارس مصادقة؛ فقط `POST` و `DELETE` يفرضان المصادقة. | منقولة كما هي لضمان الـ Parity (SEC-MD-02). يُقترح فرض المصادقة بموافقة صريحة من المستخدم. |
| `GET /api/master/cables/:mat/attachments/:id` | تنزيل ملف المرفق | في الكود القديم (`src/server/masterDataRoutes.ts:346`)، متاح للعامة بدون أي حارس. | منقولة كما هي لضمان الـ Parity (SEC-MD-02). يُقترح فرض المصادقة بموافقة صريحة من المستخدم. |

---

## ج. فحص تسريب الحقول الحساسة (Sensitive Data Protection)

تم إجراء فحص دقيق عبر اختبارات الـ Parity واختبارات الـ E2E لتأكيد ما يلي:
1. **لا تسريب لكلمات المرور أو الهاش:** ردود المستخدمين والمصادقة لا تعيد `passwordHash` إطلاقاً.
2. **لا تسريب للتوكنات:** التوكنات لا تُسرب في ردود الكابلات أو المرفقات.
3. **حجب حقول التكلفة والتسعير عن العميل:**
   - تم التحقق من أن مسارات الكتالوج للعميل (`/api/v2/cables/products`) و `/api/master/cables` عند استدعائها بتوكن عميل تجرد تماماً الحقول الحساسة:
     - `costPerKm` = `null` أو محجوب.
     - `manufacturingCostPerKm` = `null` أو محجوب.
     - `salesPrice` = `null` أو محجوب.
     - `copperIndex` / `aluminumIndex` = محجوبة.
   - الدليل: سطر الفحص في `run-phase2a-parity.mjs`:
     `✅ Customer Response Costing Exclusion Check (Costing fields stripped: true)`
4. **عزل بيانات العملاء:** لا تداخل بين العملاء في استرجاع كتالوج الكابلات.

---

## د. مخرجات أوامر الفحص الأمني الحرفية (Verbatim Security Command Outputs)

### 1) فحص الاعتماديات (`npm audit --omit=dev`):
**أ) في `energya-backend`:**
```text
# npm audit report

deepmerge-ts  <8.0.0
Severity: high
DeepmergeTS has stack exhaustion when merging recursive object graphs - https://github.com/advisories/GHSA-ggr8-5vv4-36mx
fix available via `npm audit fix --force`
Will install prisma@7.10.1, which is a breaking change
node_modules/deepmerge-ts
  @prisma/config  6.13.0-dev.1 - 7.10.0 || 8.1.0-dev.1 - 8.1.0-dev.4
  Depends on vulnerable versions of deepmerge-ts
  Depends on vulnerable versions of effect
  node_modules/@prisma/config
    prisma  6.13.0-dev.1 - 7.10.0 || 8.0.0-rc.3 - 8.1.0-dev.4
    Depends on vulnerable versions of @prisma/config
    node_modules/prisma

effect  <3.20.0
Severity: high
Effect `AsyncLocalStorage` context lost/contaminated inside Effect fibers under concurrent load with RPC - https://github.com/advisories/GHSA-38f7-945m-qr2g
fix available via `npm audit fix --force`
Will install prisma@7.10.1, which is a breaking change
node_modules/effect

4 high severity vulnerabilities
```
*(ملاحظة: الثغرات الأربع ناتجة حصراً عن حزمة `prisma@6.16.2` القديمة المنقولة مع المشروع، وتحديثها لـ 7.x يمثل breaking change يتطلب قرار المستخدم).*

**ب) في الجذر (Root Legacy App):**
```text
13 vulnerabilities (3 moderate, 9 high, 1 critical)
Critical: proxy-addr (IP spoofing via IPv4-mapped IPv6)
High: @remix-run/router, sheetJS (xlsx), source-map-js, deepmerge-ts, effect
```
*(كافة ثغرات الجذر تخص النظام القديم وحزم الواجهة القديمة ولم يتم إدخال أي حزمة جديدة).*

---

### 2) فحص الدوال الخطرة والاستعلامات الخام:
- **البحث:** `\$queryRaw|\$executeRaw|eval\(|new Function|child_process`
- **المخرج في `energya-backend/src`:**
```text
energya-backend/src/master-data/reference/reference.repository.ts:88: await this.prisma.$queryRaw`SELECT 1`;
energya-backend/src/app.controller.ts:12: await this.prisma.$queryRaw`SELECT 1`;
energya-backend/src/app.controller.ts:35: await this.prisma.$queryRaw`SELECT 1`;
```
- **النتيجة:** صفر دوال خطرة (`eval`، `new Function`، `child_process`). الاستعلام الخام الوحيد هو `SELECT 1` الثابت لفحص صحة اتصال قاعدة البيانات (Health Check). لا توجد أي مدخلات مستخدم في الاستعلامات.

---

### 3) فحص مستودع الحزم (`npmmirror` Check):
- **البحث في `package-lock.json` و `energya-backend/package-lock.json`:**
```text
No results found
```
- **النتيجة:** 100% من الحزم مثبتة من مستودع npm الرسمي `registry.npmjs.org`.

---

### 4) فحص الأسرار والكلمات الصلبة (Hardcoded Secrets):
- **البحث:** `(password\s*[:=]\s*['"][^'"]+['"])|(secret\s*[:=]\s*['"][^'"]+['"])`
- **النتيجة:** لا توجد أي أسرار في كود التطبيق المصدري. الأسرار تأتي حصراً من متغيرات البيئة (`process.env.JWT_SECRET`). التواجد الوحيد هو داخل اختبار الوحدة الخاص بفحص رفض المفاتيح الضعيفة (`domain-exception.filter.spec.ts`).

---

### 5) فحص الأعلام الخطرة (Dangerous Flags):
- **البحث:** `ALLOW_DEMO_USERS`, `DEMO_MODE`
- **النتيجة:** لا وجود لأي أعلام خطرة في `energya-backend/src`.

---

### 6) فحص ترويسات الأمان (Security Headers & CORS):
- **الأمر الحرفي:** `curl.exe -i -s http://127.0.0.1:3000/api/master/cables/10009487/attachments`
- **المخرج الحرفي:**
```http
HTTP/1.1 200 OK
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
Permissions-Policy: camera=(), microphone=(), geolocation=()
Vary: Origin
Access-Control-Allow-Credentials: true
```
- **النتيجة:** ترويسات Helmet مفعلة ومطابقة لأعلى معايير الحماية المؤسسية ضد الهجمات (Clickjacking, MIME Sniffing, HSTS).

---

## هـ. مصفوفة الاختبارات السلبية للصلاحيات (Negative Permission Tests)

| السيناريو السلبي | المسار المستهدف | النتيجة في القديم | النتيجة في NestJS | الحالة والرمز |
|---|---|:---:|:---:|:---:|
| طلب بدون توكن مصادقة | `GET /api/master/cables` | `401 Unauthorized` | `401 Unauthorized` | ✅ PASS |
| طلب بدون توكن مصادقة | `GET /api/master/raw-materials` | `401 Unauthorized` | `401 Unauthorized` | ✅ PASS |
| طلب بدون توكن مصادقة | `GET /api/master/boms` | `401 Unauthorized` | `401 Unauthorized` | ✅ PASS |
| مستخدم داخلي بدون صلاحيات (0 من 7) | `GET /api/master/cables` | `403 Forbidden` | `403 Forbidden` | ✅ PASS |
| مستخدم داخلي بدون صلاحيات (0 من 7) | `GET /api/master/raw-materials` | `403 Forbidden` | `403 Forbidden` | ✅ PASS |
| عميل يحاول رفع مرفق | `POST /api/master/cables/:mat/attachments` | `403 Forbidden` | `403 Forbidden` | ✅ PASS |
| داخلي بصلاحية قراءة فقط (VIEW) يحاول رفع مرفق | `POST /api/master/cables/:mat/attachments` | `403 Forbidden` | `403 Forbidden` | ✅ PASS |
| عميل يحاول حذف مرفق | `DELETE /api/master/cables/:mat/attachments/:id` | `403 Forbidden` | `403 Forbidden` | ✅ PASS |
| كسر متعمد للمطابقة (Negative Parity Test) | `assertParity` Harness | رفض وعدم مطابقة | رصد الخلل ورفضه | ✅ PASS |

---

## و. سجل الثغرات والملاحظات الأمنية (Security Findings Log)

| المعرف | الوصف | مستوى الخطورة | المصدر | الحالة في Phase 2a | صاحب القرار والتوصية |
|---|---|:---:|:---:|:---:|---|
| **SEC-MD-01** | تسريب كامل للخلطات الصناعية (4,822 سطر BOM) وكافة الخامات (74 خامة) لأي عميل بدون عزل | **High** | من الكود القديم | نُقلت كما هي (1:1 Parity) | **المستخدم**: تشديدها مستقبلاً بحظر وصول العميل (403) وقصره على الكتالوج المنقى. |
| **SEC-MD-02** | مسارات قراءة وتحميل المرفقات الهندسية مفتوحة للعامة على الإنترنت بدون أي توكن مصادقة | **Medium** | من الكود القديم | نُقلت كما هي (1:1 Parity) | **المستخدم**: تشديدها بفرض مصادقة القراءة (`requireMasterReadAuth`). |
| **SEC-MD-03** | ثغرات اعتمادات Prisma القديمة (`deepmerge-ts`, `effect`) في `npm audit` | **High** | من الكود القديم | مسجلة | **المستخدم**: ترقية Prisma إلى الإصدار 7 في مرحلة لاحقة. |
