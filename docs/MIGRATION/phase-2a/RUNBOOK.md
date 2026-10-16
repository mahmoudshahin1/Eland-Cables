# Phase 2a Operations Runbook (RUNBOOK.md)
**Module:** Master Data Read & Drum Engine (`migration/phase-2`)  
**Scope:** Phase 2a (36 endpoints)  
**Date:** 2026-10-16  
**Status:** ✅ **Verified & Tested on Local Environment**  
**Protocol:** Conforms to `docs/MIGRATION/PHASE_CLOSING_PROTOCOL.md` (Section 3.3)

---

## 1. المتطلبات الأساسية (Prerequisites)

- **Node.js:** الإصدار `v20.x` أو `v22.x` (تم التحقق على `v22.12.0`).
- **PostgreSQL:** الإصدار 15 أو 16 (يعمل محلياً على المنفذ `5432`).
- **مدير الحزم:** `npm` الإصدار `10.x` أو أحدث.
- **الأدوات المساندة:** `curl.exe` أو أي عميل HTTP، ومتصفح Chromium (للاختبار عبر Playwright).

---

## 2. متغيرات البيئة (Environment Variables)

> **قاعدة أمان:** الأسماء موضحة هنا بدون أي قيم سرية حقيقية. تُنشأ ملفات `.env` محلياً فقط.

### أ) ملف الجذر (`.env`):
```env
PORT=3847
DATABASE_URL="postgresql://energya:energya_dev@127.0.0.1:5432/energya_legacy?schema=public"
JWT_SECRET="<secret-min-32-characters>"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="7d"
NODE_ENV="development"
ADMIN_RESET_TOKEN_IN_RESPONSE="true"
```

### ب) ملف الباك إند (`energya-backend/.env`):
```env
PORT=3000
DATABASE_URL="postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public"
JWT_SECRET="<secret-min-32-characters>"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="7d"
NODE_ENV="development"
ADMIN_RESET_TOKEN_IN_RESPONSE="true"
```

---

## 3. إعداد قواعد البيانات والزراعة (Database Setup & Seeding)

### الخطوة 1: إنشاء قواعد البيانات في PostgreSQL:
```sql
CREATE DATABASE energya_legacy;
CREATE DATABASE energya_nest;
CREATE DATABASE energya_connect; -- قاعدة المصدر الأصلية
```

### الخطوة 2: تطبيق مخططات Prisma (Migrations):
```bash
# تطبيق المخطط على قاعدة النظام القديم:
npx prisma migrate deploy

# تطبيق المخطط على قاعدة NestJS:
cd energya-backend
npx prisma migrate deploy
cd ..
```

### الخطوة 3: زراعة بيانات الماستر داتا الكاملة (432 كابل، 74 خامة، 4,822 سطر BOM، 105 براميل):
```bash
node scripts/parity/seed-master-data.mjs
```
*يقوم هذا السكربت بمسح جداول الماستر داتا عبر `TRUNCATE CASCADE` وإعادة ملئها بنفس الترتيب الحرفي دون المساس بجداول المستخدمين.*

### الخطوة 4: زراعة مستخدمي الاختبار وحسابات الصلاحيات:
```bash
node scripts/parity/seed-auth.mjs
```

---

## 4. تشغيل الخوادم والواجهة (Running Servers & UI)

### 1) تشغيل خادم Express القديم (Legacy Port: 3847):
```powershell
$env:PORT=3847; npx tsx server.ts
```
*رابط الفحص:* `http://127.0.0.1:3847/api/platform/health`

### 2) تشغيل خادم NestJS الجديد (Target Port: 3000):
```powershell
cd energya-backend
$env:PORT=3000; npx tsx src/main.ts
```
*رابط الفحص:* `http://127.0.0.1:3000/api/platform/health`

### 3) تشغيل واجهة React (UI Port: 5173 مع الـ Proxy):
```powershell
npm run dev:legacy-ui
```
*رابط الواجهة:* `http://localhost:5173`  
*(الـ Proxy يوجه مسارات `/api/auth` و `/api/admin` و `/api/master` و `/api/v2` إلى NestJS، والباقي إلى Express القديم).*

---

## 5. حسابات الاختبار المحلية المجهزة (Local Test Personas)

| المستخدم | البريد الإلكتروني | كلمة المرور | الدور والصلاحيات |
|---|---|---|---|
| **مدير النظام (Admin)** | `admin@energya.com` | `Password123!` | كافة الصلاحيات (`SYSTEM_ADMINISTRATOR`) |
| **العميل (Customer)** | `custA@parity.test` | `Password123!` | مستخدم عميل مرتبط بشركة معتمدة |
| **داخلي محدود (Limited)** | `limited@parity.test` | `Password123!` | مستخدم داخلي بدون أي صلاحيات ماستر داتا (0 من 7) |
| **مستخدم القراءة (Viewer)**| `viewer@parity.test` | `Password123!` | صلاحية قراءة الماستر داتا فقط (VIEW) بدون كتابة |

---

## 6. أوامر تشغيل الاختبارات والتحقق (Verification Commands)

### أ) فحص تزامن منطق الـ Domain (SHA-256 Check):
```bash
npm run verify:domain
```

### ب) اختبارات الوحدة (Unit Tests):
```bash
cd energya-backend
npm test
cd ..
```

### ج) اختبارات التكامل وE2E:
```bash
cd energya-backend
npm run test:e2e
cd ..
```

### د) جناح مطابقة الـ Parity الكامل (34 فحصاً آلياً):
```bash
npm run test:parity:phase2a
```

### هـ) التحقق البصري من شاشات G3 بالـ Playwright:
```bash
node scripts/parity/verify-g3-phase2a-ui.mjs
```

---

## 7. إعادة الضبط والإيقاف (Reset & Teardown)

- **إيقاف الخوادم:** الضغط على `Ctrl + C` في نوافذ الأوامر النشطة.
- **إعادة تصفير البيانات:** تشغيل `node scripts/parity/seed-master-data.mjs` لإعادة ضبط الجداول إلى الحالة المصنعية الصفرية النظيفة.
