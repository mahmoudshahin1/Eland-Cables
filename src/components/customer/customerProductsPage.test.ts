import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, 'src', rel), 'utf8');
}

describe('Customer Cable Products page wiring', () => {
  it('uses the shared hero, existing advanced search, and existing New Inquiry + add-line APIs', () => {
    const page = readSrc('components/customer/CustomerProductsPage.tsx');
    assert.match(page, /CustomerPageHero/);
    assert.match(page, /AdvancedCableSearchPanel/);
    assert.match(page, /createCommercialInquiry/);
    assert.match(page, /addCommercialInquiryLine/);
    assert.match(page, /Add to Inquiry/);
    assert.match(page, /Table View/);
    assert.match(page, /Card View/);
    assert.match(page, /Export Excel/);
    assert.match(page, /filterDrawerOpen/);
    assert.doesNotMatch(page, /Compare\(0\)/);
    assert.doesNotMatch(page, /standardPriceUsdPerM/);
    assert.doesNotMatch(page, /unitPriceUsd/);
    assert.doesNotMatch(page, /array\.slice/);
  });

  it('keeps Cable Search modal and inquiry list as separate entry points', () => {
    const modal = readSrc('components/common/CableSearchSelectModal.tsx');
    const list = readSrc('components/customer/CustomerInquiryList.tsx');
    assert.match(modal, /Search & Select Cable Master Code/);
    assert.match(list, /New Inquiry/);
    const page = readSrc('components/customer/CustomerProductsPage.tsx');
    assert.doesNotMatch(page, /CableSearchSelectModal/);
  });

  it('adds Products to customer nav without restoring New Inquiry in the sidebar', () => {
    const nav = readSrc('app/customerPortalNav.ts');
    assert.match(nav, /id: 'products'/);
    assert.match(nav, /label: 'Products'/);
    assert.doesNotMatch(nav, /New Inquiry/);
    const sidebar = readSrc('components/layout/Sidebar.tsx');
    assert.match(sidebar, /CUSTOMER_HOME_NAV_ITEMS/);
    assert.doesNotMatch(sidebar, /New Inquiry/);
  });
});
