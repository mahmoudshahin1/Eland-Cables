// G3 for Phase 2a: drive the React UI through the Vite proxy (:5173) and assert that
//  - every request the proxy table routes to Nest carries X-Served-By: nest, and no other request does;
//  - no API request returns 5xx, and no signed-in request returns 401/403;
//  - each screen triggers at least one Nest-served request.
// Hybrid mode prerequisite: legacy and Nest must share the same DATABASE_URL and JWT_SECRET,
// otherwise a session issued by one server is rejected by the other (see phase-2a/RUNBOOK.md).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { isNestRoute } from './nestRoutes.mjs';

const UI = process.env.UI_URL || 'http://localhost:5173';
const PASSWORD = process.env.PARITY_PASSWORD || 'Password123!';
const screenshotsDir = 'docs/MIGRATION/screenshots';
const bundleDir = 'docs/MIGRATION/phase-2a';

const SESSIONS = [
  {
    name: 'customer',
    email: 'custA@parity.test',
    screens: [
      { name: 'Customer Cable Catalog', url: '/customer/products', shot: 'phase2a_customer_cable_catalog.png' },
      { name: 'Customer Drum Optimizer', url: '/customer/drum-optimizer', shot: 'phase2a_customer_drum_optimizer.png' },
    ],
  },
  {
    name: 'admin',
    email: 'admin@energya.com',
    screens: [{ name: 'Internal Master Data Hub', url: '/internal/master-data', shot: 'phase2a_internal_master_data_hub.png' }],
  },
];

const networkLog = [];
const failures = [];

function attachNetworkLogger(page, session, getScreen) {
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/')) return;
    const method = response.request().method();
    const servedBy = response.headers()['x-served-by'] || null;
    const entry = {
      session,
      screen: getScreen(),
      method,
      path: url.pathname + url.search,
      status: response.status(),
      servedBy,
      expectedNest: isNestRoute(method, url.pathname),
    };
    networkLog.push(entry);
    console.log(`  ${entry.method} ${entry.path} -> ${entry.status} (${servedBy || 'legacy'})`);
  });
}

function assertNetwork() {
  for (const e of networkLog) {
    const label = `[${e.session}/${e.screen}] ${e.method} ${e.path}`;
    if (e.expectedNest && e.servedBy !== 'nest') failures.push(`${label}: migrated route not served by Nest`);
    if (!e.expectedNest && e.servedBy === 'nest') failures.push(`${label}: unmigrated route served by Nest`);
    if (e.status >= 500) failures.push(`${label}: ${e.status}`);
    const isLogin = e.path.startsWith('/api/auth/login');
    if (!isLogin && (e.status === 401 || e.status === 403)) failures.push(`${label}: ${e.status} for a signed-in session`);
  }
  for (const session of SESSIONS) {
    for (const screen of session.screens) {
      const nest = networkLog.filter((e) => e.session === session.name && e.screen === screen.name && e.servedBy === 'nest');
      if (nest.length === 0) failures.push(`[${session.name}/${screen.name}]: no Nest-served request`);
    }
  }
}

async function runSession(browser, session) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let current = 'login';
  attachNetworkLogger(page, session.name, () => current);

  console.log(`\nLogin as ${session.email}`);
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', session.email);
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', PASSWORD);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30_000 });
  await page.click('button[type="submit"]');
  const login = await loginResponse;
  if (login.status() !== 200) failures.push(`[${session.name}] login returned ${login.status()}`);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

  for (const screen of session.screens) {
    current = screen.name;
    console.log(`Screen: ${screen.name} (${screen.url})`);
    await page.goto(`${UI}${screen.url}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.screenshot({ path: path.join(screenshotsDir, screen.shot), fullPage: true });
  }
  await context.close();
}

async function main() {
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(bundleDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const session of SESSIONS) await runSession(browser, session);
  } finally {
    await browser.close();
  }

  assertNetwork();
  const nestCount = networkLog.filter((e) => e.servedBy === 'nest').length;
  fs.writeFileSync(
    path.join(bundleDir, 'network_log.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), ui: UI, total: networkLog.length, nest: nestCount, failures, requests: networkLog }, null, 2)
  );
  console.log(`\nAPI requests: ${networkLog.length}, served by Nest: ${nestCount}`);
  if (failures.length) {
    console.error(`G3 FAILED with ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('G3 passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
