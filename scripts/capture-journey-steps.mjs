import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const UI = 'http://localhost:5173';
const artifactDir = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722';
const screenshotsDir = 'docs/MIGRATION/screenshots';

fs.mkdirSync(screenshotsDir, { recursive: true });

async function saveShot(page, filename) {
  const localP = path.join(screenshotsDir, filename);
  const artP = path.join(artifactDir, filename);
  await page.screenshot({ path: localP, fullPage: false });
  fs.copyFileSync(localP, artP);
  console.log(`Saved: ${filename}`);
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // 1. Customer Context
  const custContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const custPage = await custContext.newPage();

  // Step 1: Login
  console.log('Capturing Step 1: Login...');
  await custPage.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await custPage.waitForTimeout(1500);
  await saveShot(custPage, 'flow_step1_login.png');

  // Perform Customer Login
  await custPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'custA@parity.test');
  await custPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
  const custLogin = custPage.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30000 });
  await custPage.click('button[type="submit"]');
  await custLogin;
  await custPage.waitForTimeout(2000);

  // Step 2: Customer Home Dashboard
  console.log('Capturing Step 2: Customer Dashboard...');
  await custPage.goto(`${UI}/customer`, { waitUntil: 'domcontentloaded' });
  await custPage.waitForTimeout(2000);
  await saveShot(custPage, 'flow_step2_dashboard.png');

  // Step 3: Product Catalog
  console.log('Capturing Step 3: Product Catalog...');
  await custPage.goto(`${UI}/customer/products`, { waitUntil: 'domcontentloaded' });
  await custPage.waitForTimeout(2500);
  await saveShot(custPage, 'flow_step3_catalog.png');

  // Step 4: 3D Cable Configurator
  console.log('Capturing Step 4: 3D Cable Studio...');
  await custPage.goto(`${UI}/customer/3d-cable`, { waitUntil: 'domcontentloaded' });
  await custPage.waitForTimeout(3500);
  await saveShot(custPage, 'flow_step4_3d_studio.png');

  // Step 5: Drum Optimizer
  console.log('Capturing Step 5: Drum Optimizer...');
  await custPage.goto(`${UI}/customer/drum-optimizer`, { waitUntil: 'domcontentloaded' });
  await custPage.waitForTimeout(2500);
  await saveShot(custPage, 'flow_step5_drum_optimizer.png');

  // Step 6: Inquiries List
  console.log('Capturing Step 6: Inquiries List...');
  await custPage.goto(`${UI}/customer/inquiries`, { waitUntil: 'domcontentloaded' });
  await custPage.waitForTimeout(2500);
  await saveShot(custPage, 'flow_step6_inquiries_list.png');

  // Step 7: Inquiry Detail / Workspace
  console.log('Capturing Step 7: Inquiry Detail Workspace...');
  await custPage.goto(`${UI}/customer/inquiries/cmvd1ybu00001l5nsp3rxoq28`, { waitUntil: 'domcontentloaded' });
  await custPage.waitForTimeout(3000);
  await saveShot(custPage, 'flow_step7_inquiry_detail.png');

  await custContext.close();

  // 2. Internal Context (Admin/Sales Engineer)
  console.log('\nCapturing Internal Workflow Steps (admin@energya.com)...');
  const internalContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const internalPage = await internalContext.newPage();

  await internalPage.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await internalPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'admin@energya.com');
  await internalPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
  const adminLogin = internalPage.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30000 });
  await internalPage.click('button[type="submit"]');
  await adminLogin;
  await internalPage.waitForTimeout(2000);

  // Step 8: Technical Office
  console.log('Capturing Step 8: Technical Office...');
  await internalPage.goto(`${UI}/internal/technical-office`, { waitUntil: 'domcontentloaded' });
  await internalPage.waitForTimeout(2500);
  await saveShot(internalPage, 'flow_step8_technical_office.png');

  // Step 9: Costing Hub
  console.log('Capturing Step 9: Costing Hub...');
  await internalPage.goto(`${UI}/internal/costing`, { waitUntil: 'domcontentloaded' });
  await internalPage.waitForTimeout(2500);
  await saveShot(internalPage, 'flow_step9_costing_hub.png');

  // Step 10: Sales Quotations
  console.log('Capturing Step 10: Sales Quotations...');
  await internalPage.goto(`${UI}/internal/quotations`, { waitUntil: 'domcontentloaded' });
  await internalPage.waitForTimeout(2500);
  await saveShot(internalPage, 'flow_step10_sales_quotations.png');

  // Step 11: Production Monitoring
  console.log('Capturing Step 11: Production Monitoring...');
  await internalPage.goto(`${UI}/internal/production`, { waitUntil: 'domcontentloaded' });
  await internalPage.waitForTimeout(2500);
  await saveShot(internalPage, 'flow_step11_production.png');

  await internalContext.close();
  await browser.close();
  console.log('\nALL WORKFLOW FLOW SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
