# Energya Connect — Demo Smoke Test Plan

This document defines the step-by-step smoke testing procedure to validate that Energya Connect is operating properly across all business domains and technical workflows.

---

## 1. Test Environment Prerequisites
- Platform running in production mode (`NODE_ENV=production` or `npm run start`).
- PostgreSQL database migrated (`npm run prisma:migrate`).
- Master data and costing readiness seeded (`npm run prisma:seed`, `npm run import:masters`, and `configureCostingOperationalReadiness.ts`).

---

## 2. End-to-End Commercial & Engineering Journey Checklist

### STEP 1: Authentication & Role Verification
- [ ] **1.1 Login as Sales Manager:**
  - Navigate to `/login`.
  - Enter `sales@energya.com` / `Sales@2026!`.
  - Verify successful authentication and redirection to the commercial dashboard (`/dashboard` or `/inquiries`).
  - Verify user banner shows Eng. Mohamed Ahmed (Sales Manager).
- [ ] **1.2 Verify Customer Role Isolation:**
  - Open private browsing window and navigate to `/login`.
  - Enter `david.smith@elandcables.com` / `Customer@2026!`.
  - Verify redirection to Customer Portal.
  - Verify internal navigation links (Costing Configuration, Master Data Admin, User Management) are hidden.
  - Log out customer session.

---

### STEP 2: Dashboard & Overview Probe
- [ ] **2.1 Internal Dashboard Validation:**
  - Under `sales@energya.com`, observe KPI widgets:
    - Active Commercial Inquiries counter.
    - Pending Quotations counter.
    - Recent activity feed.
  - Check platform health indicator (`/api/platform/health` returns `200 OK`).

---

### STEP 3: Commercial Inquiry Creation
- [ ] **3.1 Create New Inquiry:**
  - Navigate to `/inquiries` and click **"New Commercial Inquiry"**.
  - Select Customer: `ELAND Cables` (or enter customer code `CUST-ELD-101`).
  - Configure Commercial Parameters:
    - **Destination:** `United Kingdom (London Gateway)`
    - **Incoterms:** `CIF - Cost, Insurance and Freight`
    - **Currency:** `USD`
    - **LME Copper Baseline:** `9,850 USD/MT`
    - **LME Aluminium Baseline:** `2,650 USD/MT`
  - Click **Save Inquiry Header**.
  - Verify inquiry is generated with official identifier format (e.g. `INQ-20260830-XXXX`).

---

### STEP 4: Cable Selection & Authority Validation
- [ ] **4.1 Add Line Item with Existing Cable Master:**
  - In the Inquiry Line Items section, click **"Add Cable Item"**.
  - Select Cable by Material Number or Code (e.g., standard Low Voltage Copper Power Cable `4x240 mm² Cu/XLPE/PVC/SWA/PVC 0.6/1 kV`).
  - Enter Quantity: `10,000 Meters`.
  - Verify Cable Authority badge displays: **`EXISTING_CABLE` (Approved)**.
  - Verify BOM status shows: **`BOM_READY`**.

---

### STEP 5: Technical Offer & Attachment Management
- [ ] **5.1 Technical Datasheet Attachment:**
  - In the Line Item Technical Offer card, click **"Upload Datasheet"**.
  - Select a PDF or sample document (<= 8 MB).
  - Verify file upload completes with file name, byte size, and timestamp.
  - Download the attachment and verify binary integrity.

---

### STEP 6: Drum Selection & Cutting Schedule Workbench
- [ ] **6.1 Configure Drum Packaging:**
  - Navigate to the **Drum / Packaging** tab for the inquiry line.
  - Select Drum Type: `WD-22` (Wooden Drum 2.2m) or `Steel Drum SD-20`.
  - Configure Drum Cutting Schedule:
    - 10 Drums @ 1,000 meters each (Total: 10,000 meters).
    - Maximum tolerance: `± 5%`.
  - Verify drum weight and volume calculations update dynamically.

---

### STEP 7: Dynamic Costing Engine Calculation
- [ ] **7.1 Run Line Costing:**
  - Click the **Costing** tab or click **"Calculate Commercial Cost"**.
  - System calls `POST /api/inquiries/:id/calculate-cost`.
  - Verify calculation result status: **`READY` / `PERSISTED`**.
  - Review Cost Breakdown layers:
    - **Direct Raw Material Cost:** LME Copper + Polymers + Armouring.
    - **Scrap Layer:** Applied via governed scrap rules.
    - **Manufacturing / Overhead Layer:** Evaluated via active Costing Formula.
    - **Logistics & Packaging:** Drum cost + freight for UK destination.
    - **Gross Margin / Markup:** Target commercial margin applied.
    - **Final Unit Selling Price:** Output displayed in inquiry currency (USD/km).

---

### STEP 8: Quotation Generation & Cost Snapshot Lock
- [ ] **8.1 Convert Inquiry to Official Quotation:**
  - Click **"Generate Sales Quotation"**.
  - Verify Quotation generated with sequence (e.g., `QT-20260830-XXXX`).
  - Confirm Quotation copies and locks the exact `CostingCalculation` snapshot.
  - Confirm inquiry status updates to **`QUOTED`**.
- [ ] **8.2 Validate Customer View vs Internal View:**
  - In Customer session (`david.smith@elandcables.com`), view the generated Quotation.
  - Confirm Customer sees: Line Items, Selling Price, Commercial Terms, Technical Offer attachment.
  - Confirm Customer CANNOT see: Internal BOM breakdown, raw material unit costs, scrap percentages, or internal markup formulas.

---

### STEP 9: Session Termination & Revocation Check
- [ ] **9.1 Logout Verification:**
  - Click **"Sign Out"** in user profile menu.
  - Verify browser storage (`jwt_access_token`, `jwt_refresh_token`) is cleared.
  - Verify user is redirected to `/login`.
  - Attempt to navigate directly to `/inquiries` via URL bar -> Verify immediate redirect to `/login`.

---

## 3. Smoke Test Results Summary Sheet

> **2026-08-30 go-live session:** statuses below are **MANUAL REQUIRED** until an operator re-runs this checklist against a live production-mode instance. Do not treat historical PASS marks as verified go-live evidence.

| Step # | Scenario Tested | Persona | Expected Result | Status |
| :---: | :--- | :--- | :--- | :---: |
| 1 | RBAC Authentication & Isolation | Sales / Customer | Successful login & portal segregation | MANUAL REQUIRED |
| 2 | Executive Dashboard | Sales Manager | KPI tiles rendered & DB connected | MANUAL REQUIRED |
| 3 | Commercial Inquiry Header Creation | Sales Manager | Inquiry generated with valid incoterms & metal | MANUAL REQUIRED |
| 4 | Cable Authority & BOM Validation | Sales Manager | `EXISTING_CABLE` recognized and BOM ready | MANUAL REQUIRED |
| 5 | Attachment Upload & Download | Technical/Sales | Bytea storage in PostgreSQL (<=8MB) | MANUAL REQUIRED |
| 6 | Drum Cutting Schedule Workbench | Sales/Packaging | Drum capacity and cutting lengths computed | MANUAL REQUIRED |
| 7 | Dynamic Costing Engine Execution | Costing/Sales | Multi-layer formula costing evaluated | MANUAL REQUIRED |
| 8 | Quotation Generation & Snapshot Lock | Sales Manager | Immutable quotation generated with frozen snapshot | MANUAL REQUIRED |
| 9 | Secure Logout & Session Invalidation | All Users | Tokens cleared & deep links protected | MANUAL REQUIRED |
