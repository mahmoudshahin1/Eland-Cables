# Energya Connect — Free Tier Deployment Guide (Render + Neon)

This guide documents the deployment configuration for hosting **Energya Connect** on 100% free-tier cloud infrastructure for prototype testing with real customers.

---

## 1. Architecture & Free Tier Specs

| Component | Platform | Plan | Specs / Limits | Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Web Service** | [Render](https://render.com) | Free Web Service | 512 MB RAM, 0.1 CPU, spins down after 15m inactivity | $0 / month |
| **Database** | [Neon](https://neon.tech) | Free Serverless Postgres | 0.5 GB storage, autoscaling compute, SSL enabled | $0 / month |
| **Source Branch** | GitHub | `deploy/free-test` | Dedicated deployment branch without touching main | Free |

---

## 2. Pre-requisites Already Completed

- [x] **Database Migration**: All 63 Prisma migrations have been successfully applied to Neon PostgreSQL (`ep-twilight-sun-b4q3sdni`).
- [x] **Master Data Seeded**:
  - 74 Raw Materials
  - 432 Cables
  - 4,822 BOM Lines (with tracked duplicate pairs)
  - 103 Standard Drums
- [x] **Demo Personas Seeded**: Admin, Technical Office, Costing, Production, and VIP Customer (`david.smith@elandcables.com` / `C-ELAND`).
- [x] **Build Verification**: Local production build test (`npm run build`) succeeded with 0 errors.

---

## 3. Step-by-Step Render Deployment

### Step A: Push Branch to GitHub
Make sure the branch `deploy/free-test` is pushed to your GitHub repository:
```bash
git push -u origin deploy/free-test
```

### Step B: Create Web Service on Render
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Select your repository: `mahmoudshahin1/Eland-Cables` (or connect your GitHub account if not already linked).
4. Fill in the service configuration:
   - **Name**: `energya-connect`
   - **Region**: Frankfurt (EU Central) or closest region
   - **Branch**: `deploy/free-test`
   - **Root Directory**: *(Leave empty)*
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm ci --include=dev && npx prisma generate && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Instance Type**: **Free**

### Step C: Configure Environment Variables
Under the **Environment** section, add the following variables:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and static asset serving |
| `DATABASE_URL` | `postgresql://...` | Your Neon connection string (include `?sslmode=require&connect_timeout=15`) |
| `JWT_SECRET` | *(Render can auto-generate or use 32+ random chars)* | JWT signing token |
| `ALLOW_DEMO_USERS` | `true` | Allows test user personas to log in |

### Step D: Advanced Settings (Health Check)
Under **Advanced**:
- **Health Check Path**: `/`
  > **Note**: Do NOT use `/api/platform/health` as the Render health check path. The root `/` path is served directly by Express static middleware without querying PostgreSQL. Pinging `/api/platform/health` repeatedly keeps the Neon database continuously awake, exhausting free tier compute hours.

5. Click **Create Web Service**.

---

## 4. Post-Deployment Verification

Once Render finishes building and marks the service **Live**:

1. **Root SPA Check**:
   Open `https://<your-service-name>.onrender.com/` in your browser.
   - The React 19 single-page application should render immediately.
2. **Platform Health API**:
   Open `https://<your-service-name>.onrender.com/api/platform/health`.
   - Expected JSON:
     ```json
     {
       "ok": true,
       "service": "energya-connect",
       "architecture": "modular-monolith",
       "database": { "ok": true }
     }
     ```
3. **Platform Status API**:
   Open `https://<your-service-name>.onrender.com/api/platform/status`.
   - Expected JSON includes:
     ```json
     {
       "persistence": "POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT",
       "postgresql": true,
       "prisma": true
     }
     ```
4. **Persona Logins**:
   - Customer Portal: `david.smith@elandcables.com`
   - Admin Portal: `admin@energya-connect.local`
   - Technical Office: `tech@energya-connect.local`
   - Costing Office: `costing@energya-connect.local`

---

## 5. Free Tier Operational Tips

1. **Cold Starts**: Render free web services spin down after 15 minutes of inactivity. The first request after a period of inactivity may take ~30–50 seconds to wake up.
2. **Optional Uptime Monitor**: During testing days with customers, you can set up a free monitor (e.g. [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org)) to ping `https://<your-service-name>.onrender.com/` (root path) every 10–14 minutes to prevent sleep during working hours.
3. **Storage Quotas**: Neon free tier provides 512 MB of PostgreSQL storage. Ensure cable attachments and uploaded files are limited to 2–5 MB to avoid filling the database disk.

---

## 6. Teardown & Rollback Plan

When testing is finished or if you want to cleanly dismantle the test environment:
1. **Render**:
   - Go to `dashboard.render.com` -> Select `energya-connect` -> **Settings** -> Scroll to bottom -> **Delete Web Service**.
2. **Neon**:
   - Go to `console.neon.tech` -> Select project `blue-credit-15812009` -> Delete project or delete the `production` branch.
3. **Git**:
   - The `deploy/free-test` branch is isolated and was never merged into `main`. You can delete it or keep it for future deployments:
     ```bash
     git push origin --delete deploy/free-test
     ```
