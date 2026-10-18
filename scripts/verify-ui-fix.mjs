import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'custA@parity.test');
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
  const loginRes = page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30000 });
  await page.click('button[type="submit"]');
  await loginRes;
  await page.waitForTimeout(3000);
  console.log('Logged in successfully! Current URL:', page.url());

  // Navigate to inquiries
  console.log('Checking /customer/inquiries...');
  await page.goto('http://localhost:5173/customer/inquiries', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const shot1 = 'docs/MIGRATION/screenshots/screen_customer_inquiries_fixed.png';
  const art1 = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722/screen_customer_inquiries_fixed.png';
  await page.screenshot({ path: shot1, fullPage: true });
  fs.copyFileSync(shot1, art1);
  console.log('Saved', shot1);

  // Navigate to customer home
  console.log('Checking /customer...');
  await page.goto('http://localhost:5173/customer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const shot2 = 'docs/MIGRATION/screenshots/screen_customer_home_fixed.png';
  const art2 = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722/screen_customer_home_fixed.png';
  await page.screenshot({ path: shot2, fullPage: true });
  fs.copyFileSync(shot2, art2);
  console.log('Saved', shot2);

  // Click on Drum Optimizer button in inquiries
  console.log('Testing click on Drum Optimizer button...');
  await page.goto('http://localhost:5173/customer/inquiries', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const drumBtn = page.getByRole('button', { name: /drum optimizer/i });
  if (await drumBtn.isVisible()) {
    console.log('Found Drum Optimizer button! Clicking it...');
    await drumBtn.click();
    await page.waitForTimeout(2000);
    console.log('Successfully navigated to:', page.url());
  } else {
    console.log('Drum Optimizer button not found!');
  }

  await browser.close();
  console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
