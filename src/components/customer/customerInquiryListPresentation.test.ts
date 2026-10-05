import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommercialInquiryDto } from '../../services/commercialInquiryApiService';
import {
  buildCustomerInquiryListRow,
  customerCableTypeLabel,
  customerApplicationLabel,
  customerFacingInquiryStatusLabel,
  customerFacingLineStatusLabel,
  customerInquiryKpiBucket,
  customerInquiryRowActions,
  customerInquiryTimelineState,
  exportInquiryListCsv,
  formatCustomerQuantityMeters,
  inquiryMatchesCableTypeFilter,
  presentationContainsCostingLeak,
  sanitizeCustomerQuotationListItem,
} from './customerInquiryListPresentation';

function inquiry(overrides: Partial<CommercialInquiryDto> = {}): CommercialInquiryDto {
  return {
    id: 'inq-1',
    inquiryNumber: 'INQ-2026-0012',
    customerId: 'cust-a',
    customerName: 'ELAND Cables',
    inquiryDate: '2026-09-15T00:00:00.000Z',
    currency: 'USD',
    status: 'DRAFT',
    projectName: 'New Port Project',
    customerReference: 'NP-2026-001',
    updatedAt: '2026-09-15T12:00:00.000Z',
    lines: [
      {
        id: 'line-1',
        lineNumber: 1,
        cableDescription: 'CU/XLPE/PVC Power Cable 4C x 240 mm² 0.6/1 kV',
        requestedQuantity: 5,
        requestedLengthMeters: 5000,
        quantityUom: 'm',
        status: 'DRAFT',
      },
    ],
    ...overrides,
  };
}

describe('customer inquiry list presentation', () => {
  it('maps backend statuses to customer-facing labels without costing language', () => {
    assert.equal(customerFacingInquiryStatusLabel('ENGINEERING_REVIEW'), 'Under Technical Review');
    assert.equal(customerFacingInquiryStatusLabel('ENGINEERING_BLOCKED'), 'Action Required');
    assert.equal(customerFacingInquiryStatusLabel('READY_FOR_COMMERCIAL'), 'Ready for Quotation');
    assert.equal(customerFacingInquiryStatusLabel('QUOTED'), 'Quotation Sent');
    assert.equal(customerFacingInquiryStatusLabel('DRAFT'), 'Draft');
    assert.equal(customerFacingLineStatusLabel('COSTING_NOT_READY'), 'In Progress');
    assert.equal(customerFacingLineStatusLabel('COSTING_READY'), 'Ready for Quotation');
    assert.equal(presentationContainsCostingLeak(customerFacingLineStatusLabel('COSTING_NOT_READY')), false);
  });

  it('buckets KPI statuses from real inquiry workflow states', () => {
    assert.equal(customerInquiryKpiBucket('DRAFT'), 'draft');
    assert.equal(customerInquiryKpiBucket('SUBMITTED'), 'submitted');
    assert.equal(customerInquiryKpiBucket('ENGINEERING_REVIEW'), 'inProgress');
    assert.equal(customerInquiryKpiBucket('QUOTED'), 'quoted');
    assert.equal(customerInquiryKpiBucket('CLOSED'), 'other');
  });

  it('derives cable type, application and quantity from live line data', () => {
    const row = buildCustomerInquiryListRow(inquiry());
    assert.equal(row.inquiryNumber, 'INQ-2026-0012');
    assert.equal(row.projectName, 'New Port Project');
    assert.equal(customerCableTypeLabel(inquiry()), 'Power Cable');
    assert.equal(customerApplicationLabel(inquiry()), 'LV');
    assert.equal(row.quantityLabel, formatCustomerQuantityMeters(5000));
    assert.equal(inquiryMatchesCableTypeFilter(inquiry(), 'power'), true);
    assert.equal(inquiryMatchesCableTypeFilter(inquiry(), 'mv'), false);
  });

  it('only offers quotation actions when a quotation exists', () => {
    assert.deepEqual(customerInquiryRowActions(inquiry()), ['view', 'continue']);
    assert.deepEqual(
      customerInquiryRowActions(inquiry({ status: 'SUBMITTED' })),
      ['view']
    );
    assert.deepEqual(
      customerInquiryRowActions(
        inquiry({
          status: 'QUOTED',
          quotations: [{ quotationNumber: 'QUO-26-00015', status: 'SUBMITTED' }],
        })
      ),
      ['view', 'view_quotation', 'download_pdf']
    );
  });

  it('builds a customer timeline without a costing stage', () => {
    const steps = customerInquiryTimelineState('ENGINEERING_REVIEW');
    assert.deepEqual(
      steps.map((step) => step.label),
      ['Draft', 'Submitted', 'Technical Review', 'Quotation', 'Closed']
    );
    assert.equal(
      steps.some((step) => presentationContainsCostingLeak(step.label)),
      false
    );
    assert.equal(steps.find((step) => step.id === 'review')?.state, 'current');
  });

  it('sanitizes quotation list rows to commercial-offer fields', () => {
    const row = sanitizeCustomerQuotationListItem({
      id: 'q-1',
      quotationNumber: 'QUO-26-00015',
      inquiryId: 'inq-1',
      status: 'SUBMITTED',
      issuedAt: '2026-09-15T00:00:00.000Z',
      validUntil: '2026-10-15T00:00:00.000Z',
      sellingPrice: 12500,
      currency: 'USD',
      commercialOfferStatus: 'ISSUED',
      inquiry: { inquiryNumber: 'INQ-2026-0012', projectName: 'New Port Project' },
    });
    assert.equal(row.quotationNumber, 'QUO-26-00015');
    assert.equal(row.statusLabel, 'Quotation Sent');
    assert.match(row.totalLabel, /12,500/);
    assert.equal('materialCostTotal' in row, false);
  });

  it('exports the visible list as CSV without inventing rows', () => {
    const csv = exportInquiryListCsv([buildCustomerInquiryListRow(inquiry())]);
    assert.match(csv, /INQ-2026-0012/);
    assert.match(csv, /New Port Project/);
    assert.equal(csv.split('\n').length, 2);
  });
});
