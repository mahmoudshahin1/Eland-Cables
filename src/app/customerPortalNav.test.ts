import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CUSTOMER_HOME_HIDDEN_NAV_LABELS,
  CUSTOMER_HOME_NAV_ITEMS,
  CUSTOMER_PORTAL_VISIBLE_TABS,
  customerCompanyDescriptor,
  customerCompanyDisplayName,
  customerFirstName,
  customerHeaderName,
  customerInitials,
  CUSTOMER_HOME_CATEGORY_TILES,
  customerLogoUrl,
  deriveCustomerProductCategories,
  isCustomerHomeNavHiddenLabel,
  resolveCustomerBrandLogo,
} from './customerPortalNav';

describe('Customer home presentation navigation', () => {
  it('keeps the approved customer functions and hides engineering tools', () => {
    const labels = CUSTOMER_HOME_NAV_ITEMS.map((item) => item.label);
    assert.deepEqual(labels, [
      'Home',
      'Products',
      'My Inquiries',
      'Quotations',
      'Orders',
      'Documents',
      'Help & Support',
    ]);
    assert.equal(labels.includes('Products'), true);
    assert.equal(labels.includes('New Inquiry'), false);
    assert.equal(
      CUSTOMER_HOME_NAV_ITEMS.some((item) => item.label === 'New Inquiry'),
      false
    );
    for (const hidden of CUSTOMER_HOME_HIDDEN_NAV_LABELS) {
      assert.equal(labels.includes(hidden), false);
      assert.equal(isCustomerHomeNavHiddenLabel(hidden), true);
    }
    assert.equal(CUSTOMER_PORTAL_VISIBLE_TABS.has('products'), true);
    assert.equal(CUSTOMER_PORTAL_VISIBLE_TABS.has('drum_optimizer'), false);
    assert.equal(CUSTOMER_PORTAL_VISIBLE_TABS.has('configurator'), false);
    assert.equal(CUSTOMER_PORTAL_VISIBLE_TABS.has('sales_orders'), true);
    assert.equal(CUSTOMER_PORTAL_VISIBLE_TABS.has('tds_library'), true);
    assert.equal(labels.includes('Pricing Rules'), false);
    assert.equal(labels.includes('Commercial Pricing Rules'), false);
    assert.equal(isCustomerHomeNavHiddenLabel('Pricing Rules'), true);
  });

  it('maps Quotations to the existing inquiry list, not a new destination', () => {
    const quoted = CUSTOMER_HOME_NAV_ITEMS.find((item) => item.id === 'quotations');
    const products = CUSTOMER_HOME_NAV_ITEMS.find((item) => item.id === 'products');
    assert.equal(quoted?.tab, 'price_estimation');
    assert.equal(quoted?.navState?.status, 'QUOTED');
    assert.equal(products?.label, 'Products');
    assert.equal(products?.tab, 'products');
    assert.equal(
      CUSTOMER_HOME_NAV_ITEMS.some((item) => item.label === 'New Inquiry'),
      false
    );
  });

  it('reads company name from master fields and uses the uploaded logo URL when present', () => {
    assert.equal(customerCompanyDisplayName({ companyName: 'ELAND Cables' }), 'ELAND Cables');
    assert.equal(customerCompanyDisplayName({ companyName: '  ' }), '');
    assert.equal(customerLogoUrl({ companyLogoUrl: '/customer-logos/eland-cables.png' }), '/customer-logos/eland-cables.png');
    assert.deepEqual(resolveCustomerBrandLogo({ companyLogoUrl: '/customer-logos/eland-cables.png' }), {
      kind: 'uploaded',
      url: '/customer-logos/eland-cables.png',
    });
    assert.equal(customerFirstName('Eng. David Smith'), 'David');
    assert.equal(customerFirstName('David Smith'), 'David');
    assert.equal(customerInitials('David Smith'), 'DS');
    assert.equal(customerHeaderName('Eng. David Smith'), 'David Smith');
  });

  it('uses a generic placeholder when the customer has no logo and never invents Energya artwork', () => {
    assert.equal(customerLogoUrl({ companyName: 'ELAND Cables' }), null);
    assert.equal(customerLogoUrl({ companyLogoUrl: '   ' }), null);
    assert.equal(customerLogoUrl(null), null);
    assert.deepEqual(resolveCustomerBrandLogo({ companyName: 'Acme' }), { kind: 'placeholder' });
    assert.deepEqual(resolveCustomerBrandLogo(null), { kind: 'placeholder' });
  });

  it('shows a legal-name descriptor only when master data differs from the trading name', () => {
    assert.equal(
      customerCompanyDescriptor({ companyName: 'ELAND Cables', companyLegalName: 'ELAND Cables' }),
      ''
    );
    assert.equal(customerCompanyDescriptor({ companyName: 'ELAND Cables' }), '');
    assert.equal(
      customerCompanyDescriptor({
        companyName: 'ELAND Cables',
        companyLegalName: 'ELAND Cables Limited',
      }),
      'ELAND Cables Limited'
    );
  });

  it('prefers the Customer Master tagline over legal name for the header subtitle', () => {
    assert.equal(
      customerCompanyDescriptor({
        companyName: 'ELAND Cables',
        companyLegalName: 'ELAND Cables Limited',
        companyTagline: 'A Member of ELSEWEDY HELAL Group',
      }),
      'A Member of ELSEWEDY HELAL Group'
    );
  });

  it('exposes six photographic product-category tiles as presentation assets', () => {
    assert.equal(CUSTOMER_HOME_CATEGORY_TILES.length, 6);
    assert.deepEqual(
      CUSTOMER_HOME_CATEGORY_TILES.map((row) => row.id),
      ['power', 'control', 'instrumentation', 'lv', 'mv', 'special']
    );
    assert.deepEqual(
      CUSTOMER_HOME_CATEGORY_TILES.map((row) => row.catalogCategory),
      ['POWER', 'CONTROL', 'INSTRUMENTATION', 'LV', 'MV', 'SPECIAL']
    );
    for (const tile of CUSTOMER_HOME_CATEGORY_TILES) {
      assert.match(tile.imageSrc || '', /^\/customer-home\/categories\/.+\.jpg$/);
    }
  });

  it('derives product categories from real catalog family/voltage fields without inventing rows', () => {
    assert.deepEqual(deriveCustomerProductCategories([]), []);
    const fromFamilies = deriveCustomerProductCategories([
      { family: 'LV', description: 'LV Power cable 0.6/1 kV' },
      { family: 'Control', description: 'Control cable' },
      { description: 'Instrumentation pair' },
      { family: 'MV', voltageClass: 'MV', description: '18/30 kV' },
      { description: 'Fire resistant special' },
    ]);
    assert.deepEqual(
      fromFamilies.map((row) => row.id),
      ['power', 'control', 'instrumentation', 'lv', 'mv', 'special']
    );
    const fallback = deriveCustomerProductCategories([{ family: 'HV' }, { family: 'HV' }]);
    assert.deepEqual(fallback, [{ id: 'hv', label: 'HV Cables', familyFilter: 'HV' }]);
  });
});
