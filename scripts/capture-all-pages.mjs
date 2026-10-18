import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const UI = process.env.UI_URL || 'http://localhost:5173';
const PASSWORD = process.env.PARITY_PASSWORD || 'Password123!';
const screenshotsDir = 'docs/MIGRATION/screenshots';
const artifactDir = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722';

fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename);
  const artPath = path.join(artifactDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  fs.copyFileSync(localPath, artPath);
  console.log(`📸 Saved: ${filename}`);
}

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  
  // 1. Capture Login Page
  console.log('Capturing Login Page...');
  const anonContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await anonPage.waitForTimeout(2000);
  await saveScreenshot(anonPage, 'screen_login.png');
  await anonContext.close();

  // 2. Capture Customer Portal Screens
  console.log('\nCapturing Customer Portal Screens (custA@parity.test)...');
  const custContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const custPage = await custContext.newPage();
  await custPage.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await custPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'custA@parity.test');
  await custPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', PASSWORD);
  const custLogin = custPage.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30_000 });
  await custPage.click('button[type="submit"]');
  await custLogin;
  await custPage.waitForTimeout(3000);

  const customerScreens = [
    { url: '/customer', file: 'screen_customer_dashboard.png', name: 'Customer Dashboard' },
    { url: '/customer/products', file: 'screen_customer_products.png', name: 'Customer Products Catalog' },
    { url: '/customer/inquiries', file: 'screen_customer_inquiries.png', name: 'Customer Inquiries' },
    { url: '/customer/drum-optimizer', file: 'screen_customer_drum_optimizer.png', name: 'Customer Drum Optimizer' },
    { url: '/customer/statement', file: 'screen_customer_statement.png', name: 'Customer Statement' },
    { url: '/customer/support', file: 'screen_customer_support.png', name: 'Customer Support Desk' },
  ];

  for (const s of customerScreens) {
    console.log(`Navigating to ${s.name} (${s.url})...`);
    await custPage.goto(`${UI}${s.url}`, { waitUntil: 'domcontentloaded' });
    await custPage.waitForTimeout(2500);
    await saveScreenshot(custPage, s.file);
  }
  await custContext.close();

  // 3. Capture Internal Portal Screens
  console.log('\nCapturing Internal Portal Screens (admin@energya.com)...');
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await adminPage.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'admin@energya.com');
  await adminPage.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', PASSWORD);
  const adminLogin = adminPage.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30_000 });
  await adminPage.click('button[type="submit"]');
  await adminLogin;
  await adminPage.waitForTimeout(3000);

  const internalScreens = [
    { url: '/internal', file: 'screen_internal_dashboard.png', name: 'Internal Overview Dashboard' },
    { url: '/internal/technical-office', file: 'screen_internal_technical_office.png', name: 'Technical Office' },
    { url: '/internal/cable-parameters', file: 'screen_internal_cable_parameters.png', name: 'Cable Configurator' },
    { url: '/internal/costing', file: 'screen_internal_costing.png', name: 'Costing & Pricing Engine' },
    { url: '/internal/quotations', file: 'screen_internal_quotations.png', name: 'Sales Quotations Workspace' },
    { url: '/internal/sales-orders', file: 'screen_internal_sales_orders.png', name: 'Commercial Fulfillment & Orders' },
    { url: '/internal/production', file: 'screen_internal_production.png', name: 'Production Monitoring' },
    { url: '/internal/finance', file: 'screen_internal_finance.png', name: 'Finance & Collections' },
    { url: '/internal/master-data', file: 'screen_internal_master_data.png', name: 'Master Data Hub' },
    { url: '/internal/administration', file: 'screen_internal_administration.png', name: 'User Management & Security' },
    { url: '/internal/analytics', file: 'screen_internal_analytics.png', name: 'Reports & Analytics' },
  ];

  for (const s of internalScreens) {
    console.log(`Navigating to ${s.name} (${s.url})...`);
    await adminPage.goto(`${UI}${s.url}`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(2500);
    await saveScreenshot(adminPage, s.file);
  }
  await adminContext.close();

  await browser.close();
  console.log('\n🎉 All screenshots captured and copied to artifact directory successfully!');
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
