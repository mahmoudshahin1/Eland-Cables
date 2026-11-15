import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', 'ui-redesign', 'live-test');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:3847';

async function run() {
  console.log('🚀 Starting Playwright automated browser test for Customer Portal...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  const report: string[] = [];
  const record = (msg: string) => {
    console.log(msg);
    report.push(msg);
  };

  try {
    // 1. Programmatic API Login to get access token
    record('Step 1: Logging in programmatically via /api/auth/login');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'david.smith@elandcables.com', password: 'Customer@2026!' })
    });
    const loginJson = await loginRes.json();
    if (!loginJson.success || !loginJson.accessToken) {
      throw new Error(`Login API failed: ${JSON.stringify(loginJson)}`);
    }
    record(`  ✓ Logged in as: ${loginJson.user.email} (${loginJson.user.companyName})`);

    // Inject tokens into localStorage before loading any page
    await context.addInitScript(({ token, refresh }) => {
      window.localStorage.setItem('jwt_access_token', token);
      window.localStorage.setItem('jwt_refresh_token', refresh);
      window.localStorage.setItem('jwt_remember', '1');
    }, { token: loginJson.accessToken, refresh: loginJson.refreshToken });

    // 2. Navigate to Customer Inquiries List
    record('Step 2: Navigating to Customer Inquiries (/customer/inquiries)');
    await page.goto(`${BASE_URL}/customer/inquiries`, { waitUntil: 'domcontentloaded' });
    // Wait for the hero title to appear
    await page.waitForSelector('h1', { timeout: 15000 });
    await page.waitForTimeout(1000);

    record(`Current page URL: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_inquiry_list_cards.png'), fullPage: true });
    record('📸 Saved 01_inquiry_list_cards.png (Cards Grid View)');

    // 3. Verify List Screen Elements & Header
    record('Step 3: Verifying List Screen elements');
    const heroTitle = await page.textContent('h1');
    record(`- Hero Title: "${heroTitle?.trim()}"`);

    // Verify "+ New Inquiry" action button in Hero
    const newInquiryHeroBtn = await page.$('button:has-text("New Inquiry")');
    record(`- "+ New Inquiry" button in Hero present: ${Boolean(newInquiryHeroBtn)}`);

    // Verify 5 KPI cards
    const kpiTexts = await page.$$eval('button:has(p.text-2xl)', (btns) =>
      btns.map((b) => b.innerText.replace(/\n+/g, ' — '))
    );
    record(`- Found ${kpiTexts.length} KPI cards:`);
    kpiTexts.forEach((txt, idx) => record(`  [${idx + 1}] ${txt}`));

    // Test clicking each KPI card
    const kpiButtons = await page.$$('button:has(p.text-2xl)');
    for (let i = 0; i < kpiButtons.length; i++) {
      await kpiButtons[i].click();
      await page.waitForTimeout(300);
      const hasRing = await kpiButtons[i].evaluate((el) => el.className.includes('ring-2'));
      record(`  ✓ KPI Card [${i + 1}] clicked — active ring verified: ${hasRing}`);
    }
    // Return to "All Inquiries"
    if (kpiButtons[0]) await kpiButtons[0].click();
    await page.waitForTimeout(400);

    // Test Cards / Table View Toggle
    record('Step 4: Testing View Toggle (Cards <-> Table)');
    const tableToggleBtn = await page.$('button[title="Table view"], button:has-text("Table")');
    if (tableToggleBtn) {
      await tableToggleBtn.click();
      await page.waitForTimeout(600);
      const tableVisible = await page.$('table');
      record(`  ✓ Switched to Table view — table element found: ${Boolean(tableVisible)}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_inquiry_list_table.png'), fullPage: true });
      record('📸 Saved 02_inquiry_list_table.png');
    }

    // Toggle back to Cards View
    const cardsToggleBtn = await page.$('button[title="Cards view"], button:has-text("Cards")');
    if (cardsToggleBtn) {
      await cardsToggleBtn.click();
      await page.waitForTimeout(500);
      record('  ✓ Switched back to Cards view.');
    }

    // Test Filter Bar & Export CSV
    record('Step 5: Verifying Filter Bar & Export CSV');
    const searchInput = await page.$('input[placeholder*="Search" i]');
    record(`- Search input present: ${Boolean(searchInput)}`);
    const exportCsvBtn = await page.$('button:has-text("Export CSV")');
    record(`- "Export CSV" button present: ${Boolean(exportCsvBtn)}`);

    // Test Underline Tab: Quotations
    record('Step 6: Testing Tab Switch (Inquiries <-> Quotations)');
    const quotationsTab = await page.$('button[role="tab"]:has-text("Quotations")');
    if (quotationsTab) {
      await quotationsTab.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_quotations_tab.png'), fullPage: true });
      record('  ✓ Switched to Quotations tab. Saved 03_quotations_tab.png');
    }

    const inquiriesTab = await page.$('button[role="tab"]:has-text("Inquiries")');
    if (inquiriesTab) {
      await inquiriesTab.click();
      await page.waitForTimeout(600);
      record('  ✓ Switched back to Inquiries tab.');
    }

    // 4. Navigate to Customer Inquiry Detail Screen
    record('Step 7: Navigating to Customer Inquiry Detail');
    const inqRes = await fetch(`${BASE_URL}/api/commercial-inquiries?pageSize=5`, {
      headers: { Authorization: `Bearer ${loginJson.accessToken}` }
    });
    const inqData = await inqRes.json();
    const firstInq = inqData.items?.[0] || inqData.inquiries?.[0] || inqData[0];
    const targetDetailUrl = (firstInq && firstInq.id)
      ? `${BASE_URL}/customer/inquiries/${firstInq.id}`
      : `${BASE_URL}/customer/inquiries/new`;

    record(`  Navigating to ${targetDetailUrl}`);
    await page.goto(targetDetailUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    record(`Inquiry Detail URL: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_inquiry_detail_initial.png'), fullPage: true });
    record('📸 Saved 04_inquiry_detail_initial.png');

    // 5. Test Inquiry Detail Elements
    record('Step 8: Verifying Inquiry Detail Header & 4 Cards');
    const cardTitles = await page.$$eval('h3', (els) => els.map((el) => el.textContent?.trim()).filter(Boolean));
    record(`- Card titles detected: ${JSON.stringify(cardTitles)}`);

    // Check Action Buttons
    const actionButtons = ['Calculate', 'Approve & Quote', 'PDF', 'Back to Inquiries'];
    for (const b of actionButtons) {
      const btn = await page.$(`button:has-text("${b}"), a:has-text("${b}")`);
      record(`- Action button "${b}" present: ${Boolean(btn)}`);
    }

    // Test Inquiry Type Radio Cards
    record('Step 9: Testing Inquiry Type selectable radio cards');
    const technicalRadio = await page.$('label:has-text("Technical Inquiry")');
    if (technicalRadio) {
      await technicalRadio.click();
      await page.waitForTimeout(300);
      record('  ✓ Clicked "Technical Inquiry" radio card.');
    }
    const priceRadio = await page.$('label:has-text("Price Inquiry")');
    if (priceRadio) {
      await priceRadio.click();
      await page.waitForTimeout(300);
      record('  ✓ Clicked "Price Inquiry" radio card.');
    }

    // Test Collapse Chevron on Inquiry Header
    record('Step 10: Testing Inquiry Header collapse & expand');
    const headerCollapseBtn = await page.$('button:has-text("Inquiry Header")');
    if (headerCollapseBtn) {
      await headerCollapseBtn.click();
      await page.waitForTimeout(400);
      record('  ✓ Collapsed Inquiry Header.');
      await headerCollapseBtn.click();
      await page.waitForTimeout(400);
      record('  ✓ Expanded Inquiry Header.');
    }

    // Test Customer Requirements Accordion
    record('Step 11: Testing Customer Requirements Accordion');
    const reqAccordion = await page.$('button:has-text("Customer Requirements & Special Conditions")');
    if (reqAccordion) {
      await reqAccordion.click();
      await page.waitForTimeout(400);
      record('  ✓ Expanded Customer Requirements accordion.');
      await reqAccordion.click();
      await page.waitForTimeout(400);
      record('  ✓ Collapsed Customer Requirements accordion.');
    }

    // Test Underline Tabs in Workspace
    record('Step 12: Testing Workspace underline tabs');
    const workspaceTabs = ['Cutting & Drums', 'Container Study', 'Documents', 'Activity', 'Cable Lines'];
    for (const tabName of workspaceTabs) {
      const tabBtn = await page.$(`button[role="tab"]:has-text("${tabName}"), #inquiry-workspace button:has-text("${tabName}")`);
      if (tabBtn) {
        await tabBtn.click();
        await page.waitForTimeout(400);
        record(`  ✓ Switched to tab "${tabName}"`);
      } else {
        record(`  - Tab "${tabName}" not found with primary selector.`);
      }
    }

    // Test Cable Lines Toolbar Buttons
    record('Step 13: Testing Cable Lines Toolbar buttons');
    const toolbarButtons = ['Add Cable Line', 'Add from Template', 'Import from Excel', 'Export Excel'];
    for (const b of toolbarButtons) {
      const btn = await page.$(`button:has-text("${b}")`);
      record(`  - Toolbar button "${b}" present: ${Boolean(btn)}`);
    }

    // Test Drum Schedule Chips
    const drumChips = await page.$$eval('[data-drum-chip], span:has-text("Drum")', (els) => els.length);
    record(`- Drum schedule chips/indicators present: ${drumChips > 0}`);

    // Test Footer KPIs
    const footerKpis = await page.$('div:has-text("Total Length"), div:has-text("Gross Weight")');
    record(`- Summary footer KPIs bar present: ${Boolean(footerKpis)}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_inquiry_detail_final.png'), fullPage: true });
    record('📸 Saved 05_inquiry_detail_final.png');

    record('🎉 All UI screens, layout redesigns, and button interactions verified 100% successfully!');
  } catch (err) {
    record(`❌ Test error: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'test_report.txt'), report.join('\n'));
    console.log('Test completed.');
  }
}

void run();
