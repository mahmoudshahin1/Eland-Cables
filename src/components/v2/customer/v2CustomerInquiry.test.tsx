import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { CommercialInquiryDto } from '../../../services/commercialInquiryApiService';
import { assertCanAccessInquiryOwnership } from '../../../server/rbac';
import { DomainError } from '../../../platform/errors/domainError';
import type { RequestActor } from '../../../server/auth';
import {
  V2_CUSTOMER_HOME_PATH,
  V2_CUSTOMER_INQUIRIES_PATH,
  V2_INTERNAL_HOME_PATH,
  CUSTOMER_HOME_PATH,
  INTERNAL_HOME_PATH,
  isV2CustomerProductPath,
  isV2PlatformPath,
  resolveShellNavigation,
  v2CustomerInquiryDetailPath,
  v2CustomerInquiryIdFromPath,
} from '../../../app/shellRoutes';
import { ModulePermissions, UserAccount } from '../../../types';
import {
  V2CustomerDashboardView,
  V2CustomerInquiryDetailView,
  V2CustomerInquiryListView,
} from './V2CustomerInquiryViews';
import {
  buildCustomerCreateInquiryInput,
  buildCustomerInquiryListQuery,
  classifyCustomerInquiryError,
  createInquiryInputContainsProcessChoice,
  customerInquiryJourneySteps,
  customerSafeLineSummary,
  formatInquiryProcessLabel,
  htmlContainsCustomerCostingLeak,
  readInquiryProcessCode,
} from './v2CustomerInquiryPresentation';
import {
  V2_DRUM_AUTOMATIC_CONTROL_LABEL,
  V2_DRUM_MANUAL_CONTROL_LABEL,
} from '../../cable-configurator/v2/components/DrumSelectionSectionV2';
import {
  CLEAR_SELECTED_CABLE_LABEL,
  OPEN_CABLE_SEARCH_LABEL,
  REPLACE_CABLE_LABEL,
} from '../../inquiry-quotation/InquiryLineEditorModal';

function user(partial: Partial<UserAccount> & Pick<UserAccount, 'userType'>): UserAccount {
  return {
    id: 'u-1',
    userName: 'user',
    fullName: 'Test User',
    email: 'user@example.com',
    department: 'QA',
    role: 'TEST',
    status: 'Active',
    permissions: {} as ModulePermissions,
    ...partial,
  };
}

function inquiry(overrides: Partial<CommercialInquiryDto> = {}): CommercialInquiryDto {
  return {
    id: 'inq-own',
    inquiryNumber: 'INQ-1001',
    customerId: 'cust-a',
    customerName: 'Customer A',
    inquiryDate: '2026-09-01T00:00:00.000Z',
    currency: 'USD',
    status: 'DRAFT',
    projectName: 'Cairo feeders',
    commercialMetadata: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
    lines: [
      {
        id: 'line-1',
        lineNumber: 1,
        cableDescription: '3x240 Cu XLPE',
        requestedQuantity: 2,
        requestedLengthMeters: 500,
        materialCost: 99999,
        costingReadinessStatus: 'COSTING_READY',
      },
    ],
    quotations: [{ quotationNumber: 'Q-1', status: 'DRAFT' }],
    ...overrides,
  };
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/v2/customer'] }, node));
}

const listHandlers = {
  onSearchChange: () => undefined,
  onStatusChange: () => undefined,
  onApplyFilters: () => undefined,
  onPageChange: () => undefined,
  onProjectNameChange: () => undefined,
  onCustomerReferenceChange: () => undefined,
  onCreate: () => undefined,
};

describe('V2 Wave 1 — Customer Inquiry', () => {
  it('builds create payload without process or customerId override', () => {
    const input = buildCustomerCreateInquiryInput({
      companyName: 'Acme Cables',
      fullName: 'Pat Buyer',
      projectName: 'Site A',
    });
    assert.equal(input.customerName, 'Acme Cables');
    assert.equal(input.contactPerson, 'Pat Buyer');
    assert.equal(input.projectName, 'Site A');
    assert.equal(input.currency, 'USD');
    assert.equal(input.customerId, undefined);
    assert.equal(input.commercialMetadata?.workflowChannel, 'V2_CONFIGURATION');
    assert.equal(createInquiryInputContainsProcessChoice(input), false);
  });

  it('does not let the list query send a client customerId', () => {
    const query = buildCustomerInquiryListQuery({ q: 'INQ', status: 'DRAFT', page: 2, pageSize: 25 });
    assert.equal(query.q, 'INQ');
    assert.equal(query.status, 'DRAFT');
    assert.equal(query.page, 2);
    assert.equal(query.customerId, undefined);
  });

  it('reads process from server metadata and formats it as a label', () => {
    assert.equal(readInquiryProcessCode(inquiry()), 'STANDARD_WORKFLOW');
    assert.equal(formatInquiryProcessLabel('VIP_FAST_TRACK'), 'VIP Fast Track');
    assert.equal(formatInquiryProcessLabel('STANDARD_WORKFLOW'), 'Standard');
  });

  it('derives journey steps from inquiry artifacts', () => {
    const steps = customerInquiryJourneySteps(
        inquiry({
        lines: [
          {
            id: 'line-1',
            lineNumber: 1,
            cableDescription: '3x240 Cu XLPE',
            materialNumber: '10001234',
            requestedQuantity: 10,
            requestedLengthMeters: 1000,
            cuttingLengthMeters: 1000,
            drumType: 'B2600',
          },
        ],
        incoterms: 'CIF',
        commercialMetadata: { inquiryProcessCode: 'VIP_FAST_TRACK', deliveryDestination: 'Alexandria' },
        quotations: [{ quotationNumber: 'QT-26-1', status: 'OPEN' }],
      }),
    );
    assert.equal(steps.find((s) => s.id === 'cable')?.state, 'complete');
    assert.equal(steps.find((s) => s.id === 'configure')?.state, 'complete');
    assert.equal(steps.find((s) => s.id === 'cutting')?.state, 'complete');
    assert.equal(steps.find((s) => s.id === 'drum')?.state, 'complete');
    assert.equal(steps.find((s) => s.id === 'quotation')?.state, 'complete');
  });

  it('omits costing fields from customer line summaries', () => {
    const summary = customerSafeLineSummary(inquiry().lines![0]);
    assert.equal(summary.description, '3x240 Cu XLPE');
    assert.equal('materialCost' in summary, false);
    assert.equal('costingReadinessStatus' in summary, false);
  });

  it('classifies IDOR and missing inquiry errors', () => {
    assert.equal(
      classifyCustomerInquiryError(new Error('Access denied: You can only view your own commercial inquiries.')),
      'forbidden',
    );
    assert.equal(classifyCustomerInquiryError(new Error('Inquiry not found.')), 'not_found');
    assert.equal(classifyCustomerInquiryError(new Error('Sign in is required.')), 'unauthorized');
  });

  it('enforces inquiry ownership on the server helper (not by hiding rows)', () => {
    const actorA: RequestActor = {
      userType: 'customer',
      customerScopeStatus: 'resolved',
      customerId: 'cust-a',
      customerScopeKeys: ['cust-a'],
      customerMasterIds: ['master-a'],
    };
    assert.doesNotThrow(() => assertCanAccessInquiryOwnership(actorA, 'cust-a', 'master-a'));
    assert.throws(
      () => assertCanAccessInquiryOwnership(actorA, 'cust-b', 'master-b'),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED',
    );
  });

  it('renders the customer dashboard with KPIs and recent inquiries', () => {
    const html = render(
      React.createElement(V2CustomerDashboardView, {
        greetingName: 'Pat',
        loadState: 'ready',
        total: 4,
        draftTotal: 2,
        submittedTotal: 1,
        quotedTotal: 1,
        recent: [inquiry()],
      }),
    );
    assert.match(html, /Dashboard/);
    assert.match(html, /My inquiries/);
    assert.match(html, />4</);
    assert.match(html, /INQ-1001/);
    assert.match(html, /New Inquiry/);
    assert.doesNotMatch(html, /Costing/);
  });

  it('renders dashboard empty and error states', () => {
    const empty = render(
      React.createElement(V2CustomerDashboardView, {
        greetingName: 'Pat',
        loadState: 'empty',
        total: 0,
        draftTotal: 0,
        submittedTotal: 0,
        quotedTotal: 0,
        recent: [],
      }),
    );
    assert.match(empty, /No inquiries yet/);

    const error = render(
      React.createElement(V2CustomerDashboardView, {
        greetingName: 'Pat',
        loadState: 'error',
        errorMessage: 'Database unavailable',
        total: 0,
        draftTotal: 0,
        submittedTotal: 0,
        quotedTotal: 0,
        recent: [],
      }),
    );
    assert.match(error, /Unable to load your inquiries/);
    assert.match(error, /Database unavailable/);
    assert.match(error, /What next/);
  });

  it('renders dashboard permission state when unsigned', () => {
    const html = render(
      React.createElement(V2CustomerDashboardView, {
        greetingName: '',
        loadState: 'unauthorized',
        total: 0,
        draftTotal: 0,
        submittedTotal: 0,
        quotedTotal: 0,
        recent: [],
      }),
    );
    assert.match(html, /Access denied/);
    assert.match(html, /Customer dashboard/);
  });

  it('renders the inquiry list without a process selector', () => {
    const html = render(
      React.createElement(V2CustomerInquiryListView, {
        loadState: 'ready',
        rows: [inquiry()],
        total: 1,
        page: 1,
        pageSize: 25,
        search: '',
        status: '',
        creating: false,
        projectName: '',
        customerReference: '',
        ...listHandlers,
      }),
    );
    assert.match(html, /My Inquiries/);
    assert.match(html, /INQ-1001/);
    assert.match(html, /Standard/);
    assert.match(html, /cannot be selected/);
    assert.doesNotMatch(html, /VIP_FAST_TRACK/);
    assert.doesNotMatch(html, /name="inquiryProcessCode"/);
    assert.doesNotMatch(html, /<option value="VIP_FAST_TRACK"/);
    assert.doesNotMatch(html, /<option value="STANDARD_WORKFLOW"/);
    assert.doesNotMatch(html, /Costing/);
    assert.equal(htmlContainsCustomerCostingLeak(html), false);
  });

  it('renders inquiry detail journey without deferred NOT_IMPLEMENTED stages and no costing UI', () => {
    const html = render(
      React.createElement(V2CustomerInquiryDetailView, {
        loadState: 'ready',
        inquiry: inquiry({
          commercialMetadata: { inquiryProcessCode: 'VIP_FAST_TRACK' },
        }),
      }),
    );
    assert.match(html, /INQ-1001/);
    assert.match(html, /VIP Fast Track/);
    assert.match(html, /Process \(read-only\)/);
    assert.match(html, /3x240 Cu XLPE/);
    assert.match(html, /Cable/);
    assert.match(html, /Configure/);
    assert.match(html, /Cutting/);
    assert.doesNotMatch(html, /NOT_IMPLEMENTED/);
    assert.doesNotMatch(html, />99999</);
    assert.doesNotMatch(html, /COSTING_READY/);
    assert.doesNotMatch(html, /materialCost/);
    assert.doesNotMatch(html, />Costing</);
    assert.doesNotMatch(html, /Costing tab/);
  });

  it('renders forbidden when another customer inquiry is not authorized', () => {
    const html = render(
      React.createElement(V2CustomerInquiryDetailView, {
        loadState: 'forbidden',
        errorMessage: 'Access denied: You can only view your own commercial inquiries.',
        inquiry: null,
      }),
    );
    assert.match(html, /Access denied/);
    assert.match(html, /this inquiry/);
  });

  it('keeps product inquiry routes distinct from platform /v2/modules/customer', () => {
    assert.equal(v2CustomerInquiryIdFromPath(`${V2_CUSTOMER_INQUIRIES_PATH}/inq-b`), 'inq-b');
    assert.equal(v2CustomerInquiryDetailPath('inq-b'), '/v2/customer/inquiries/inq-b');
    assert.equal(isV2CustomerProductPath('/v2/customer/inquiries/inq-b'), true);
    assert.equal(isV2CustomerProductPath('/v2/modules/customer'), false);
    assert.equal(isV2PlatformPath('/v2/modules/customer'), true);

    const customer = user({ userType: 'customer' });
    const internal = user({ userType: 'internal' });
    assert.deepEqual(
      resolveShellNavigation({
        isAuthenticated: true,
        user: customer,
        pathname: '/v2/customer/inquiries/inq-b',
      }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: V2_INTERNAL_HOME_PATH }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/v2' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/v2/modules/engineering' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({
        isAuthenticated: true,
        user: internal,
        pathname: '/v2/customer/inquiries/inq-b',
      }),
      { action: 'redirect', to: V2_INTERNAL_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/customer/inquiries' }),
      { action: 'allow' },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/internal/costing' }),
      { action: 'allow' },
    );
    assert.equal(CUSTOMER_HOME_PATH, '/customer');
    assert.equal(INTERNAL_HOME_PATH, '/internal');
    assert.equal(V2_CUSTOMER_HOME_PATH, '/v2/customer');
  });

  it('keeps customer journey control labels for cable clear/replace and both drum paths', () => {
    assert.equal(V2_DRUM_AUTOMATIC_CONTROL_LABEL, 'Automatic Drum Selection');
    assert.equal(V2_DRUM_MANUAL_CONTROL_LABEL, 'Manual Drum Selection');
    assert.equal(CLEAR_SELECTED_CABLE_LABEL, 'Clear selected cable');
    assert.equal(REPLACE_CABLE_LABEL, 'Replace cable');
    assert.equal(OPEN_CABLE_SEARCH_LABEL, 'Open Cable Search');
    const html = render(
      React.createElement(V2CustomerInquiryDetailView, {
        loadState: 'ready',
        inquiry: inquiry({
          commercialMetadata: { inquiryProcessCode: 'VIP_FAST_TRACK' },
        }),
      }),
    );
    assert.match(html, /Cable/);
    assert.match(html, /Configure/);
    assert.match(html, /Cutting/);
    assert.match(html, /Drum/);
    assert.match(html, /shipment|Shipment/i);
    assert.match(html, /submit|Submit/i);
  });
});
