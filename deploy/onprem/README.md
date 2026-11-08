# تشغيل Energya Connect على سيرفر الشركة

الحزمة دي بتشتغل على سيرفر داخلي من غير إنترنت عام بعد ما الصور تتحمل. التطبيق على المنفذ 3000، وقاعدة PostgreSQL 18 جواه Docker ومعاها نسخة من البيانات.

## المتطلبات على السيرفر

- Docker Engine 24 أو أحدث، ومعاه Docker Compose.
- منفذ 3000 متاح للأجهزة اللي هتستخدم النظام داخل الشركة.
- ملف `.env` بالأسرار. متتحطش الأسرار جوه صورة Docker.

## 1) تجهيز الحزمة على جهاز فيه الكود وقاعدة البيانات الحالية

من جذر المشروع:

```powershell
node scripts/exportOnpremData.mjs
docker compose -f deploy/onprem/docker-compose.build.yml build
New-Item -ItemType Directory -Force deploy\bundle | Out-Null
docker save energya-connect:onprem postgres:18-alpine -o deploy\bundle\images.tar
Copy-Item deploy\onprem\docker-compose.yml deploy\bundle\
Copy-Item deploy\onprem\.env.example deploy\bundle\
Copy-Item deploy\onprem\README.md deploy\bundle\
if (Test-Path deploy\onprem\db-init\01-energya.sql) {
  New-Item -ItemType Directory -Force deploy\bundle\db-init | Out-Null
  Copy-Item deploy\onprem\db-init\01-energya.sql deploy\bundle\db-init\
}
```

انسخ مجلد `deploy\bundle` كاملًا إلى السيرفر (فلاشة أو مشاركة داخلية). الملف `images.tar` كبير لأنه فيه صورة التطبيق وصورة PostgreSQL.

## 2) التثبيت على السيرفر

```bash
cd bundle
docker load -i images.tar
cp .env.example .env
```

عدّل `.env` قبل التشغيل:

- `POSTGRES_PASSWORD`: كلمة سر طويلة لقاعدة البيانات.
- `JWT_SECRET`: 32 حرفًا على الأقل، ومختلف عن قيمة التطوير.

بعدين:

```bash
docker compose up -d
docker compose ps
```

أول تشغيل فقط يحمّل `db-init/01-energya.sql` في قاعدة فاضية. لو المجلد `db-init` فاضي، السيرفر يقوم بقاعدة جديدة ويطبّق ترحيلات Prisma من غير بيانات التشغيل الحالية.

افتح من أي جهاز على الشبكة:

`http://عنوان-السيرفر:3000`

## 3) أوامر المتابعة

```bash
docker compose logs -f app
docker compose restart app
docker compose down
```

`docker compose down` يوقف الحاويات ويبقي البيانات في volume اسمه `energya_pgdata`. عشان تمسح البيانات لازم تضيف `-v`، ومتستخدمش الأمر ده إلا لو عاوز تبدأ من الصفر.

## 4) تحديث نسخة لاحقة

على جهاز التجهيز ابنِ الصورة من جديد، انقل `images.tar` الجديد، وعلى السيرفر:

```bash
docker load -i images.tar
docker compose up -d
```

البيانات الموجودة في الـ volume تفضل. ملف SQL مش هيتعمله تحميل تاني طالما الـ volume موجود.

## 5) نسخة احتياطية من السيرفر

```bash
docker exec energya-connect-db pg_dump -U energya -d energya_connect --no-owner --no-acl > energya-backup.sql
```

لو غيّرت `POSTGRES_USER` أو `POSTGRES_DB` في `.env`، استخدم نفس الأسماء في أمر النسخ.
