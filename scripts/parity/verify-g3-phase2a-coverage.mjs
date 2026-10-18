// Extra G3 coverage. Does not replace or edit verify-g3-phase2a-ui.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const UI = process.env.UI_URL || 'http://localhost:5173';
const PASSWORD = process.env.PARITY_PASSWORD || 'Password123!';
const outDir = 'docs/MIGRATION/phase-2a/g3-screenshots';
const requests = [];
const consoleErrors = [];
const findings = [];

function attach(page, session, getScreen) {
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/master/drums/')) return;
    console.log(`  REQ ${request.method()} ${url.pathname}`);
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    console.log(`  REQFAIL ${request.method()} ${url.pathname} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/')) return;
    const entry = {
      session,
      screen: getScreen(),
      method: response.request().method(),
      path: url.pathname + url.search,
      status: response.status(),
      servedBy: response.headers()['x-served-by'] || null,
    };
    requests.push(entry);
    console.log(`  ${entry.method} ${entry.path} -> ${entry.status} (${entry.servedBy || 'legacy'})`);
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`${session}: ${err.message}`);
  });
}

async function login(page, email) {
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email);
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', PASSWORD);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30_000 });
  await page.click('button[type="submit"]');
  const login = await loginResponse;
  console.log(`Login ${email} -> ${login.status()}`);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  return login.status();
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`screenshot ${file}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const customer = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const customerPage = await customer.newPage();
    let screen = 'login';
    attach(customerPage, 'custA@parity.test', () => screen);
    await login(customerPage, 'custA@parity.test');
    screen = 'Customer Products';
    await customerPage.goto(`${UI}/customer/products`, { waitUntil: 'domcontentloaded' });
    await customerPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    const search = customerPage.locator('input[placeholder*="Search" i], input[type="search"]').first();
    if (await search.count()) {
      await search.fill('Cu');
      await customerPage.waitForTimeout(800);
    }
    await shot(customerPage, 'custA-customer-products.png');

    screen = 'Drum Optimizer';
    await customerPage.goto(`${UI}/customer/drum-optimizer`, { waitUntil: 'domcontentloaded' });
    await customerPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    const preset = customerPage.getByRole('button', { name: /33kV Substation Project/i });
    if (await preset.count()) await preset.click();
    await customerPage.waitForTimeout(1000);
    await shot(customerPage, 'custA-drum-optimizer.png');
    await customer.close();

    const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await admin.newPage();
    screen = 'login';
    attach(adminPage, 'admin@energya.com', () => screen);
    await login(adminPage, 'admin@energya.com');
    screen = 'Cable Master';
    await adminPage.goto(`${UI}/internal/master-data`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    const cableTab = adminPage.getByRole('button', { name: 'Cable Master' });
    if (await cableTab.count()) await cableTab.click();
    await adminPage.waitForTimeout(500);
    const cableSearch = adminPage.locator('input[placeholder*="Search material" i]').first();
    if (await cableSearch.count()) {
      await cableSearch.fill('1000');
      await adminPage.waitForTimeout(500);
    }
    await shot(adminPage, 'admin-cable-master-search.png');
    const firstMaterial = adminPage.locator('tbody tr').first();
    if (await firstMaterial.count()) await firstMaterial.click();
    await adminPage.waitForTimeout(500);
    await shot(adminPage, 'admin-cable-master-open.png');
    await admin.close();

    const limited = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const limitedPage = await limited.newPage();
    screen = 'login';
    attach(limitedPage, 'limited@parity.test', () => screen);
    await login(limitedPage, 'limited@parity.test');
    screen = 'Cable Master limited';
    await limitedPage.goto(`${UI}/internal/master-data`, { waitUntil: 'domcontentloaded' });
    await limitedPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    const limitedTab = limitedPage.getByRole('button', { name: 'Cable Master' });
    if (await limitedTab.count()) await limitedTab.click();
    await limitedPage.waitForTimeout(800);
    await shot(limitedPage, 'limited-cable-master.png');
    await limited.close();

    const technical = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const techPage = await technical.newPage();
    screen = 'Technical Office drum plan';
    attach(techPage, 'admin@energya.com', () => screen);
    const techLogin = await login(techPage, 'admin@energya.com');
    if (techLogin !== 200) findings.push(`technical office login status ${techLogin}`);
    await techPage.goto(`${UI}/internal/technical-office`, { waitUntil: 'domcontentloaded' });
    await techPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    const searchBtn = techPage.getByRole('button', { name: 'Search', exact: true });
    if (!(await searchBtn.count())) {
      findings.push('Technical Office has no Search button, so DrumSelectionWorkflowPanel was not opened.');
    } else {
      await searchBtn.click();
      const codeSearch = techPage.getByPlaceholder('e.g. N2XH, N2XS2Y, BS5467...');
      if (await codeSearch.count()) {
        await codeSearch.fill('10009487');
        await techPage.waitForTimeout(600);
      }
      const selectBtn = techPage.getByRole('button', { name: 'Select', exact: true }).first();
      if (!(await selectBtn.count())) {
        findings.push('Cable search modal did not show a Select button for 10009487.');
      } else {
        await selectBtn.click();
        await techPage.waitForTimeout(500);
        const tol = techPage.getByText('Cable Tolerance').locator('xpath=following::input[1]');
        if (await tol.count()) await tol.fill('2');
        const cutting = techPage.locator('table input[type="number"]').nth(1);
        if (await cutting.count()) await cutting.fill('1000');
        const candidatesWait = techPage.waitForResponse((r) => r.url().includes('/api/master/drums/candidates'), { timeout: 12_000 }).catch(() => null);
        await candidatesWait;
        const drumSelect = techPage.locator('select').first();
        if (await drumSelect.count()) {
          const value = await drumSelect.locator('option').nth(1).getAttribute('value');
          if (value) {
            const validateWait = techPage.waitForResponse((r) => r.url().includes('/api/master/drums/validate'), { timeout: 12_000 }).catch(() => null);
            await drumSelect.selectOption(value);
            await validateWait;
          } else {
            findings.push('Drum select has no selectable option, so validate was not triggered.');
          }
        } else {
          findings.push('Manual drum row has no select, so validate was not triggered from the UI.');
        }
        const auto = techPage.getByRole('button', { name: 'Automatic Optimization' });
        if (await auto.count()) {
          const optimizeWait = techPage.waitForResponse((r) => r.url().includes('/api/master/drums/optimize'), { timeout: 12_000 }).catch(() => null);
          await auto.click();
          const optimizeRes = await optimizeWait;
          if (!optimizeRes) findings.push('Automatic Optimization was clicked and no /api/master/drums/optimize response arrived.');
        } else {
          findings.push('Automatic Optimization button was not visible.');
        }
        await shot(techPage, 'admin-technical-office-drum-plan.png');
      }
    }
    await technical.close();

    const watched = [
      ['POST', '/api/master/drums/optimize'],
      ['POST', '/api/master/drums/candidates'],
      ['POST', '/api/master/drums/validate'],
      ['POST', '/api/master/drums/capacity'],
    ];
    for (const [method, path] of watched) {
      const hit = requests.find((r) => r.method === method && r.path.split('?')[0] === path);
      if (!hit) {
        console.log(`MISSING ${method} ${path}`);
      } else {
        console.log(`WATCH ${method} ${path} -> ${hit.status} (${hit.servedBy || 'legacy'})`);
      }
    }
    const detail = requests.find((r) => r.method === 'GET' && /^\/api\/master\/cables\/[^/]+$/.test(r.path.split('?')[0]));
    console.log(detail ? `WATCH GET ${detail.path} -> ${detail.status} (${detail.servedBy || 'legacy'})` : 'MISSING GET /api/master/cables/:materialNumber');
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outDir, 'coverage-requests.json');
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), requests, consoleErrors, findings }, null, 2));
  console.log(`coverage requests=${requests.length} consoleErrors=${consoleErrors.length}`);
  console.log(`wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
