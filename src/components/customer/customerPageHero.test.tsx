import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  CUSTOMER_PAGE_HERO_IMAGE,
  CUSTOMER_PAGE_HERO_SLOGAN_LINES,
  CustomerPageHero,
} from './CustomerPageHero';

function renderHero(node: React.ReactElement) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/customer'] }, node));
}

describe('CustomerPageHero', () => {
  it('uses the shared drums photo and stacked slogan on every page', () => {
    const html = renderHero(
      React.createElement(CustomerPageHero, {
        title: 'Inquiry / Quotation',
        subtitle: 'Create new inquiries, track your quotations and request updates.',
        breadcrumbs: [{ label: 'Home', to: '/customer' }, { label: 'Inquiry / Quotation' }],
      })
    );
    assert.match(html, new RegExp(CUSTOMER_PAGE_HERO_IMAGE.replace('/', '\\/')));
    for (const line of CUSTOMER_PAGE_HERO_SLOGAN_LINES) {
      assert.match(html, new RegExp(line));
    }
    assert.match(html, /Inquiry \/ Quotation/);
    assert.match(html, /Create new inquiries, track your quotations and request updates/);
    assert.match(html, /Home/);
    assert.equal(html.includes('eland'), false);
    assert.equal(html.includes('companyLogo'), false);
  });

  it('omits breadcrumb on Home and still shows the drums strip', () => {
    const html = renderHero(
      React.createElement(CustomerPageHero, {
        title: 'Welcome back, David!',
        subtitle: 'Manage your inquiries, quotations and orders.',
      })
    );
    assert.match(html, /Welcome back, David!/);
    assert.match(html, /Manage your inquiries, quotations and orders/);
    assert.equal(html.includes('aria-label="Breadcrumb"'), false);
    assert.match(html, new RegExp(CUSTOMER_PAGE_HERO_IMAGE.replace('/', '\\/')));
  });
});
