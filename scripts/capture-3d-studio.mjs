import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'custA@parity.test');
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Password123!');
  const loginRes = page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30000 });
  await page.click('button[type="submit"]');
  await loginRes;
  await page.waitForTimeout(2000);

  // 1. Capture customer dashboard with new 3D Quick Action and Product Categories 3D link
  console.log('Capturing customer dashboard with 3D entry points...');
  await page.goto('http://localhost:5173/customer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const homeShot = 'docs/MIGRATION/screenshots/screen_customer_home_with_3d.png';
  const homeArt = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722/screen_customer_home_with_3d.png';
  await page.screenshot({ path: homeShot, fullPage: false });
  fs.copyFileSync(homeShot, homeArt);
  console.log('Saved', homeShot);

  // 2. Navigate to 3D Cable Studio (/customer/3d-cable)
  console.log('Navigating to 3D Cable Studio (/customer/3d-cable)...');
  await page.goto('http://localhost:5173/customer/3d-cable', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500); // Allow Three.js canvas to render and compile shaders

  const studioShot1 = 'docs/MIGRATION/screenshots/screen_3d_cable_studio.png';
  const studioArt1 = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722/screen_3d_cable_studio.png';
  await page.screenshot({ path: studioShot1, fullPage: false });
  fs.copyFileSync(studioShot1, studioArt1);
  console.log('Saved', studioShot1);

  // 3. Test Exploded View Mode
  console.log('Switching to Exploded View...');
  const explodedBtn = page.getByRole('button', { name: /exploded/i });
  if (await explodedBtn.isVisible()) {
    await explodedBtn.click();
    await page.waitForTimeout(1500);
    const explodedShot = 'docs/MIGRATION/screenshots/screen_3d_cable_exploded.png';
    const explodedArt = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722/screen_3d_cable_exploded.png';
    await page.screenshot({ path: explodedShot, fullPage: false });
    fs.copyFileSync(explodedShot, explodedArt);
    console.log('Saved', explodedShot);
  }

  // 4. Test Selecting a Different Preset (MV Single Core 1x240)
  console.log('Testing MV 1x240 Preset...');
  const presetSelect = page.locator('select').first();
  if (await presetSelect.isVisible()) {
    await presetSelect.selectOption({ label: 'MV Single Core 1x240 mm² 11/33 kV' });
    await page.waitForTimeout(2000);
    const mvShot = 'docs/MIGRATION/screenshots/screen_3d_cable_mv_preset.png';
    const mvArt = 'C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722/screen_3d_cable_mv_preset.png';
    await page.screenshot({ path: mvShot, fullPage: false });
    fs.copyFileSync(mvShot, mvArt);
    console.log('Saved', mvShot);
  }

  await browser.close();
  console.log('ALL 3D SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
