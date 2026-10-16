import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const artifactsDir = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722';
const docsDir = 'H:/Eland-Cables/docs/MIGRATION/screenshots';

fs.mkdirSync(docsDir, { recursive: true });

async function runG3Phase2aUI() {
  console.log('🚀 Starting G3 UI Verification for Phase 2a via Playwright...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const results = [];

  try {
    // -------------------------------------------------------------
    // Session 1: Customer (Catalog & Drum Optimizer)
    // -------------------------------------------------------------
    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const custPage = await customerContext.newPage();

    console.log('1️⃣ Logging in as Customer (custA@parity.test)...');
    await custPage.goto('http://localhost:3847/login', { waitUntil: 'domcontentloaded' });
    await custPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'custA@parity.test');
    await custPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
    await custPage.click('button[type="submit"]');
    await custPage.waitForTimeout(3000);

    console.log('2️⃣ Navigating to Customer Cable Catalog (/customer/products)...');
    await custPage.goto('http://localhost:3847/customer/products', { waitUntil: 'domcontentloaded' });
    await custPage.waitForTimeout(3000);

    const catalogPath = path.join(docsDir, 'phase2a_customer_cable_catalog.png');
    const catalogArtifactPath = path.join(artifactsDir, 'phase2a_customer_cable_catalog.png');
    await custPage.screenshot({ path: catalogPath, fullPage: true });
    fs.copyFileSync(catalogPath, catalogArtifactPath);
    console.log('  📸 Screenshot captured: phase2a_customer_cable_catalog.png');
    results.push({ screen: 'Customer Cable Catalog', path: catalogPath, ok: true });

    console.log('3️⃣ Navigating to Customer Drum Optimizer (/customer/drum-optimizer)...');
    await custPage.goto('http://localhost:3847/customer/drum-optimizer', { waitUntil: 'domcontentloaded' });
    await custPage.waitForTimeout(3000);

    const drumPath = path.join(docsDir, 'phase2a_customer_drum_optimizer.png');
    const drumArtifactPath = path.join(artifactsDir, 'phase2a_customer_drum_optimizer.png');
    await custPage.screenshot({ path: drumPath, fullPage: true });
    fs.copyFileSync(drumPath, drumArtifactPath);
    console.log('  📸 Screenshot captured: phase2a_customer_drum_optimizer.png');
    results.push({ screen: 'Customer Drum Optimizer', path: drumPath, ok: true });

    await customerContext.close();

    // -------------------------------------------------------------
    // Session 2: Internal Admin (Master Data Hub)
    // -------------------------------------------------------------
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();

    console.log('4️⃣ Logging in as Admin (admin@energya.com)...');
    await adminPage.goto('http://localhost:3847/login', { waitUntil: 'domcontentloaded' });
    await adminPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'admin@energya.com');
    await adminPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForTimeout(3000);

    console.log('5️⃣ Navigating to Internal Master Data Hub (/internal/master-data)...');
    await adminPage.goto('http://localhost:3847/internal/master-data', { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(3000);

    const masterDataPath = path.join(docsDir, 'phase2a_internal_master_data_hub.png');
    const masterDataArtifactPath = path.join(artifactsDir, 'phase2a_internal_master_data_hub.png');
    await adminPage.screenshot({ path: masterDataPath, fullPage: true });
    fs.copyFileSync(masterDataPath, masterDataArtifactPath);
    console.log('  📸 Screenshot captured: phase2a_internal_master_data_hub.png');
    results.push({ screen: 'Internal Master Data Hub', path: masterDataPath, ok: true });

    await adminContext.close();

    console.log('\n✨ G3 Playwright UI Verification completed successfully! All 3 screenshots saved.\n');
  } catch (err) {
    console.error('❌ G3 Verification error:', err);
    throw err;
  } finally {
    await browser.close();
  }

  return results;
}

runG3Phase2aUI()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
