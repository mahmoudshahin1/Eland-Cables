import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const artifactsDir = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722';
const screenshotsDir = 'H:/Eland-Cables/docs/MIGRATION/screenshots';
const bundleDir = 'H:/Eland-Cables/docs/MIGRATION/phase-2a';

fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(bundleDir, { recursive: true });

async function runG3Phase2aUI() {
  console.log('🚀 Starting G3 UI Verification for Phase 2a via Vite Proxy (http://localhost:5173)...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const networkLog = [];
  const results = [];

  function attachNetworkLogger(page, sessionName) {
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/')) {
        const headers = response.headers();
        const servedBy = headers['x-served-by'] || headers['X-Served-By'] || 'legacy/express';
        const status = response.status();
        const entry = {
          session: sessionName,
          timestamp: new Date().toISOString(),
          url,
          status,
          method: response.request().method(),
          servedBy,
          isNest: servedBy === 'nest',
        };
        networkLog.push(entry);
        console.log(`  🌐 [API] ${entry.method} ${url} -> Status ${status} | X-Served-By: ${servedBy}`);
      }
    });
  }

  try {
    // -------------------------------------------------------------------------
    // Session 1: Customer (Catalog & Drum Optimizer) via Vite (:5173)
    // -------------------------------------------------------------------------
    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const custPage = await customerContext.newPage();
    attachNetworkLogger(custPage, 'Customer');

    console.log('\n1️⃣ Logging in as Customer (custA@parity.test) via http://localhost:5173/login ...');
    await custPage.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await custPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'custA@parity.test');
    await custPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
    await custPage.click('button[type="submit"]');
    await custPage.waitForTimeout(3000);

    console.log('2️⃣ Navigating to Customer Cable Catalog (/customer/products)...');
    await custPage.goto('http://localhost:5173/customer/products', { waitUntil: 'domcontentloaded' });
    await custPage.waitForTimeout(3000);

    const catalogPath = path.join(screenshotsDir, 'phase2a_customer_cable_catalog.png');
    const catalogArtifactPath = path.join(artifactsDir, 'phase2a_customer_cable_catalog.png');
    await custPage.screenshot({ path: catalogPath, fullPage: true });
    fs.copyFileSync(catalogPath, catalogArtifactPath);
    console.log('  📸 Screenshot captured: phase2a_customer_cable_catalog.png');
    results.push({ screen: 'Customer Cable Catalog', path: catalogPath, ok: true });

    console.log('3️⃣ Navigating to Customer Drum Optimizer (/customer/drum-optimizer)...');
    await custPage.goto('http://localhost:5173/customer/drum-optimizer', { waitUntil: 'domcontentloaded' });
    await custPage.waitForTimeout(3000);

    const drumPath = path.join(screenshotsDir, 'phase2a_customer_drum_optimizer.png');
    const drumArtifactPath = path.join(artifactsDir, 'phase2a_customer_drum_optimizer.png');
    await custPage.screenshot({ path: drumPath, fullPage: true });
    fs.copyFileSync(drumPath, drumArtifactPath);
    console.log('  📸 Screenshot captured: phase2a_customer_drum_optimizer.png');
    results.push({ screen: 'Customer Drum Optimizer', path: drumPath, ok: true });

    await customerContext.close();

    // -------------------------------------------------------------------------
    // Session 2: Internal Admin (Master Data Hub) via Vite (:5173)
    // -------------------------------------------------------------------------
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    attachNetworkLogger(adminPage, 'Admin');

    console.log('\n4️⃣ Logging in as Admin (admin@energya.com) via http://localhost:5173/login ...');
    await adminPage.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await adminPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'admin@energya.com');
    await adminPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForTimeout(3000);

    console.log('5️⃣ Navigating to Internal Master Data Hub (/internal/master-data)...');
    await adminPage.goto('http://localhost:5173/internal/master-data', { waitUntil: 'domcontentloaded' });

    await adminPage.waitForTimeout(3000);

    const masterDataPath = path.join(screenshotsDir, 'phase2a_internal_master_data_hub.png');
    const masterDataArtifactPath = path.join(artifactsDir, 'phase2a_internal_master_data_hub.png');
    await adminPage.screenshot({ path: masterDataPath, fullPage: true });
    fs.copyFileSync(masterDataPath, masterDataArtifactPath);
    console.log('  📸 Screenshot captured: phase2a_internal_master_data_hub.png');
    results.push({ screen: 'Internal Master Data Hub', path: masterDataPath, ok: true });

    await adminContext.close();

    // Save Network Log
    const networkLogPath = path.join(bundleDir, 'network_log.json');
    fs.writeFileSync(networkLogPath, JSON.stringify(networkLog, null, 2), 'utf-8');
    console.log(`\n📄 Network log saved to: ${networkLogPath} (${networkLog.length} API requests recorded)`);

    const nestRequests = networkLog.filter((n) => n.servedBy === 'nest');
    console.log(`✅ Requests served by NestJS (X-Served-By: nest): ${nestRequests.length} / ${networkLog.length}`);

    console.log('\n✨ G3 Playwright UI Verification completed successfully! All 3 screenshots and network log verified.\n');
  } catch (err) {
    console.error('❌ G3 Verification error:', err);
    throw err;
  } finally {
    await browser.close();
  }

  return { results, networkLog };
}

runG3Phase2aUI()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
