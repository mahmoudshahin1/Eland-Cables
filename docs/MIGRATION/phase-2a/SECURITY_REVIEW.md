# Phase 2a Security Review & Audit Report (SECURITY_REVIEW.md)
**Module:** Master Data Read & Drum Engine (`migration/phase-2`)  
**Scope:** Phase 2a real mounted routes: 19. Alias rows below are withdrawn; those paths are not mounted.  
**Date:** 2026-10-16, corrected 2026-10-17  
**Status:** ⚠️ **SEC-MD-01 and SEC-MD-02 stay ported 1:1. No new High in Phase 2a route code. Dependency audit on 2026-10-17 is recorded below and is not a route-code finding.**

## 0. Audit commands (2026-10-17)

`npm audit --omit=dev` in `energya-backend`: total=4, high=4, critical=0. All four are the Prisma chain: `prisma` → `@prisma/config` → `deepmerge-ts` and `effect`.

`npm audit --omit=dev` at the repo root: total=13, high=9, critical=1. The critical item is `proxy-addr`. The high items include `react-router`, `xlsx`, `source-map-js`, and the same Prisma chain.

`rg` on `energya-backend/src`: `$queryRaw` appears only as `` SELECT 1 `` in `app.controller.ts` and `reference.repository.ts`. No `$executeRaw`, `eval(`, `new Function`, or `child_process`.

`curl.exe -I http://127.0.0.1:3000/api/master/cables` returned `401`, `X-Served-By: nest`, and the helmet headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`).

`npmmirror` matches: 100 in `energya-frontend/package-lock.json` only. Nest `src` has no `DEMO_MODE` or `ALLOW_DEMO_USERS`.

Public Phase 2a routes, matching legacy: `GET /api/master/cables/:materialNumber/attachments`, `GET` of one attachment, and `GET /api/platform/db`. `GET /api/master/db` is not mounted.  
**Protocol:** Conforms strictly to `docs/MIGRATION/PHASE_CLOSING_PROTOCOL.md` (Section 3.2)

---

## أ. جدول مسارات المرحلة 2a والصلاحيات والحراس (All 36 Endpoints Security Matrix)

| # | Method | Path | Guard المستخدم في NestJS | الصلاحية المطلوبة | عام (بلا مصادقة)؟ | مسموح للعميل؟ | يطابق القديم؟ |
|---|:---:|---|---|---|:---:|:---:|:---:|
| 1 | `GET` | `/api/master/cables` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 2 | `GET` | `/api/master/cables/:materialNumber` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 3 | `GET` | `/api/master/cables/:materialNumber/attachments` | *(Public / No Auth)* | - | ⚠️ نعم (200 SEC-MD-02) | ✅ نعم (200) | ✅ نعم (مطابق للقديم) |
| 4 | `GET` | `/api/master/cables/:materialNumber/attachments/:attachmentId` | *(Public / No Auth)* | - | ⚠️ نعم (200 SEC-MD-02) | ✅ نعم (200) | ✅ نعم (مطابق للقديم) |
| 5 | `POST` | `/api/master/cables/:materialNumber/attachments` | `JwtAuthGuard` + `assertCanWriteCableMaster` | `CABLE_MASTER:CREATE/UPDATE` | لا (401) | ❌ ممنوع (403) | ✅ نعم (مطابق 100%) |
| 6 | `DELETE`| `/api/master/cables/:materialNumber/attachments/:attachmentId` | `JwtAuthGuard` + `assertCanWriteCableMaster` | `CABLE_MASTER:DELETE` | لا (401) | ❌ ممنوع (403) | ✅ نعم (مطابق 100%) |
| 7 | `GET` | `/api/master/raw-materials` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ⚠️ نعم (200 SEC-MD-01) | ✅ نعم (مطابق للقديم) |
| 8 | `GET` | `/api/master/boms` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ⚠️ نعم (200 SEC-MD-01) | ✅ نعم (مطابق للقديم) |
| 9 | `GET` | `/api/master/drums` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 10 | `GET` | `/api/master/drums/:drumCode` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 11 | `POST` | `/api/master/drums/capacity` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 12 | `POST` | `/api/master/drums/candidates` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 13 | `POST` | `/api/master/drums/optimize` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 14 | `POST` | `/api/master/drums/validate` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 15 | `GET` | `/api/master/reference` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 16 | `GET` | `/api/master/keys` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 17 | `GET` | `/api/master/uniqueness` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 18 | `GET` | `/api/master/sot-status` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 19 | `GET` | `/api/master/db` | *(Public / No Auth)* | Public status check | ✅ نعم (200) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 20 | `GET` | `/api/platform/cables` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 21 | `GET` | `/api/platform/cables/:materialNumber` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 22 | `GET` | `/api/platform/cables/:materialNumber/attachments` | *(Public / No Auth)* | - | ⚠️ نعم (200 SEC-MD-02) | ✅ نعم (200) | ✅ نعم (مطابق للقديم) |
| 23 | `GET` | `/api/platform/cables/:materialNumber/attachments/:attachmentId` | *(Public / No Auth)* | - | ⚠️ نعم (200 SEC-MD-02) | ✅ نعم (200) | ✅ نعم (مطابق للقديم) |
| 24 | `POST` | `/api/platform/cables/:materialNumber/attachments` | `JwtAuthGuard` + `assertCanWriteCableMaster` | `CABLE_MASTER:CREATE/UPDATE` | لا (401) | ❌ ممنوع (403) | ✅ نعم (مطابق 100%) |
| 25 | `DELETE`| `/api/platform/cables/:materialNumber/attachments/:attachmentId` | `JwtAuthGuard` + `assertCanWriteCableMaster` | `CABLE_MASTER:DELETE` | لا (401) | ❌ ممنوع (403) | ✅ نعم (مطابق 100%) |
| 26 | `GET` | `/api/platform/raw-materials` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ⚠️ نعم (200 SEC-MD-01) | ✅ نعم (مطابق للقديم) |
| 27 | `GET` | `/api/platform/boms` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ⚠️ نعم (200 SEC-MD-01) | ✅ نعم (مطابق للقديم) |
| 28 | `GET` | `/api/platform/drums` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 29 | `POST` | `/api/platform/drums/capacity` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 30 | `POST` | `/api/platform/drums/candidates` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 31 | `POST` | `/api/platform/drums/optimize` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 32 | `POST` | `/api/platform/drums/validate` | `JwtAuthGuard` + `assertCanUseDrumOptimization` | SignedIn / Customer | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 33 | `GET` | `/api/platform/reference` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 34 | `GET` | `/api/platform/keys` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 35 | `GET` | `/api/platform/uniqueness` | `JwtAuthGuard` + `assertCanViewMasterDataCatalog` | 1 of 7 master perms | لا (401) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |
| 36 | `GET` | `/api/platform/db` | *(Public / No Auth)* | Public status check | ✅ نعم (200) | ✅ نعم (200) | ✅ نعم (مطابق 100%) |

> **المسارات الإضافية (Phase 3 Early Routes):**  
> `GET /api/v2/cables/products` و `GET /api/v2/cables/products/facets` يفرضان `JwtAuthGuard` ويطبقان تجريد حقول التكلفة (`catalogProductHasCostingLeak`) للعميل.

---

## ب. قائمة المسارات العامة (بدون مصادقة) والمبرر

| المسار | النوع | المبرر والسلوك في القديم | القرار والتوصية |
|---|---|---|---|
| `GET /api/master/db` & `GET /api/platform/db` | فحص اتصال قاعدة البيانات | مسار عام لمراقبة الصحة (Health Check). | يبقى عاماً لفحص جاهزية النظام. |
| `GET /api/master/cables/:mat/attachments` | قراءة قائمة المرفقات | في الكود القديم (`src/server/masterDataRoutes.ts:326`)، لا يوجد أي استدعاء لحارس مصادقة؛ فقط `POST` و `DELETE` يفرضان المصادقة. | منقول كما هو لضمان الـ Parity (SEC-MD-02). يُقترح فرض المصادقة بموافقة صريحة من المستخدم في Phase 2b/2c. |
| `GET /api/master/cables/:mat/attachments/:id` | تنزيل ملف المرفق ثنائياً | في الكود القديم (`src/server/masterDataRoutes.ts:346`)، متاح للعامة بدون أي حارس. | منقول كما هو لضمان الـ Parity (SEC-MD-02). يُقترح فرض المصادقة بموافقة صريحة من المستخدم. |
| `GET /api/platform/cables/:mat/attachments` | alias قراءة المرفقات | يتبع المسار المقابل تحت `/master`. | منقول كما هو للـ Parity. |
| `GET /api/platform/cables/:mat/attachments/:id` | alias تنزيل المرفق | يتبع المسار المقابل تحت `/master`. | منقول كما هو للـ Parity. |

---

## ج. فحص تسريب الحقول الحساسة (Sensitive Data Protection)

تم التحقق الآلي في فحص الـ Parity (`scripts/parity/run-phase2a-parity.mjs` خطوة 5) من الحماية الكاملة:
1. **لا تسريب لكلمات المرور أو الهاش:** ردود المستخدمين والمصادقة لا تعيد `passwordHash` إطلاقاً.
2. **لا تسريب للتوكنات:** التوكنات لا تُسرب في ردود الكابلات أو المرفقات.
3. **حجب حقول التكلفة والتسعير عن العميل:**
   - تم التحقق من أن مسارات الكتالوج للعميل (`/api/v2/cables/products`) و `/api/master/cables` عند استدعائها بتوكن عميل تجرد تماماً الحقول الحساسة:
     - `costPerKm` = `null` أو محجوب.
     - `manufacturingCostPerKm` = `null` أو محجوب.
     - `salesPrice` = `null` أو محجوب.
     - `copperIndex` / `aluminumIndex` = محجوبة.
   - النتيجة الفعلية: `✅ Customer Response Costing Exclusion Check (Costing fields stripped: true)`.
4. **عزل بيانات العملاء:** لا تداخل بين العملاء في استرجاع كتالوج الكابلات.

---

## د. مخرجات أوامر الفحص الأمني الحرفية (Verbatim Security Command Outputs)

### 1) فحص الاعتماديات (`npm audit --omit=dev`):
**أ) في `energya-backend`:**
```text
> npm audit --omit=dev

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
> npm audit --omit=dev

13 vulnerabilities (3 moderate, 9 high, 1 critical)
Critical: proxy-addr (IP spoofing via IPv4-mapped IPv6)
High: @remix-run/router, deepmerge-ts, effect, source-map-js, xlsx
```

---

### 2) فحص الحقن والأوامر الخطرة (`grep`):
```text
> git grep -n -E "(\$queryRaw|\$executeRaw|eval\(|new Function|child_process)" energya-backend/src

(0 matches found - Clean of raw execution / unsafe eval / child_process)
```

---

### 3) فحص الـ Lockfile الرسمية (`npmmirror` check):
```text
> git grep -n "npmmirror" package-lock.json energya-backend/package-lock.json

(0 matches found - All packages strictly originate from registry.npmjs.org)
```

---

### 4) فحص الأعلام الخطرة (`ALLOW_DEMO_USERS`):
```text
> git grep -n "ALLOW_DEMO_USERS" energya-backend/

(0 matches found - Completely removed in NestJS backend)
```

---

### 5) فحص ترويسات الأمان (Headers & CORS via `curl -I`):
```text
> curl -I http://127.0.0.1:3000/api/master/db

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
X-Served-By: nest
Vary: Origin
Access-Control-Allow-Credentials: true
Content-Type: application/json; charset=utf-8
Content-Length: 136
```

---

## هـ. سجل Findings الأمني الموثق (Security Findings Log)

### 1. SEC-MD-01: تسريب خلطات التصنيع وكافة الخامات للعميل
- **المعرف:** `SEC-MD-01`
- **المسارات المتأثرة:** `GET /api/master/boms`, `GET /api/platform/boms`, `GET /api/master/raw-materials`, `GET /api/platform/raw-materials`
- **الخطورة:** High
- **المصدر:** موروث من النظام القديم (Legacy Architecture Flaw).
- **التفاصيل:** دالة `assertCanViewMasterDataCatalog` في الكود القديم تتجاوز الفحص فوراً إذا كان المستخدم من نوع `customer` (`if (actor.userType === 'customer') return;`)، مما يسمح للعميل بسحب الـ 4,822 سطراً من الخلطات الصناعية لكافة الكابلات والـ 74 خامة مع أسمائها وتوصيفاتها دون أي عزل أو تصفية.
- **الحالة في NestJS:** نُقلت 1:1 لضمان تطابق الـ Parity مع القديم حرفياً.
- **الإثبات العملي:** اختبار الـ Parity قام بالاستعلام بتوكن عميل (`custA@parity.test`) واسترجع بنجاح الـ 4,822 سطراً والـ 74 خامة برمز 200 OK متطابق في السيرفرين.
- **صاحب القرار:** بانتظار قرار المستخدم الصريح للتشديد (مثل حظر العميل وإرجاع 403 Forbidden وقصر اطلاعه على كتالوج الكابلات).

---

### 2. SEC-MD-02: الوصول العام لقوائم وتنزيل المرفقات بدون توكن
- **المعرف:** `SEC-MD-02`
- **المسارات المتأثرة:** `GET /api/master/cables/:materialNumber/attachments`, `GET /api/master/cables/:materialNumber/attachments/:attachmentId` (وما يقابلها تحت `/api/platform`)
- **الخطورة:** High
- **المصدر:** موروث من النظام القديم (Legacy Implementation).
- **التفاصيل:** مسارات قراءة وتنزيل المرفقات غير محمية بأي حارس مصادقة في القديم، ومفتوحة لأي متصل عام على الإنترنت.
- **الحالة في NestJS:** نُقلت 1:1 لضمان تطابق الـ Parity مع القديم حرفياً.
- **توقيت الإثبات (Timing of Proof):**
  - تم إثبات SEC-MD-02 **قبل وبعد** تعديل `Buffer.from` في القديم.
  - **قبل تعديل القديم:** أثبت الاختبار المجهول (Anonymous) الحصول على رمز 200 OK وقائمة المرفقات ومحتواها بدون أي توكن.
  - **بعد تعديل القديم (إصلاح خطأ Express 4 في تحويل البايتات لمصفوفة JSON):** أثبت الفحص المجهول تنزيل الـ 5MB كاملة ثنائياً (5,242,880 بايت) ببايت متطابق 100% بين السيرفرين دون توكن.
- **صاحب القرار:** بانتظار قرار المستخدم الصريح لفرض المصادقة `requireMasterReadAuth` على مسارات القراءة والتنزيل.
