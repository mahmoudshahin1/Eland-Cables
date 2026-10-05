import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INQUIRY_LINE_COLUMNS,
  columnEligibleForActor,
  isColumnSelected,
  visibleFieldsForUser,
} from '../services/inquiryFieldManifest';
import {
  commercialValueSummary,
  formatCommercialPriceAmount,
  resolveCommercialLinePricing,
} from './commercialLinePricingDisplay';
import {
  COMMERCIAL_TERM_CODES,
  ENERGYA_COMMERCIAL_OFFER_TEMPLATE,
  PRICE_ADJUSTMENT_FORMULA,
  buildIssuedCommercialOfferDocument,
  commercialOfferDocumentActions,
  extractConductorWeightsKgPerKm,
  grandTotalLabel,
  presentNumeric,
  presentText,
} from './commercialOfferDocument';
import { buildQuotationIssuedEmail, runEmailWithoutRollback } from './quotationIssuedEmail';
import { shouldSubmitViaV2Inquiry } from './v2InquiryWorkflow';
import { projectInquiryForActor } from '../server/commercialProjection';

const COST_COLUMN_IDS = ['unitCost', 'totalCost', 'margin', 'marginPercent', 'Unit Cost', 'Total Cost', 'Margin'];

describe('inquiry line column registry', () => {
  it('hides a column in the same set the grid renders', () => {
    const hidden = 'voltage';
    const pref = {
      visibleFieldIds: INQUIRY_LINE_COLUMNS.map((col) => col.id).filter((id) => id !== hidden),
    };
    const rendered = visibleFieldsForUser(INQUIRY_LINE_COLUMNS, pref, false).map((col) => col.id);
    const selectable = INQUIRY_LINE_COLUMNS.filter((col) => columnEligibleForActor(col, false));
    assert.equal(selectable.some((col) => col.id === hidden), true);
    assert.equal(isColumnSelected(selectable.find((col) => col.id === hidden)!, pref), false);
    assert.equal(rendered.includes(hidden), false);
    const shown = { visibleFieldIds: [...pref.visibleFieldIds, hidden] };
    assert.equal(visibleFieldsForUser(INQUIRY_LINE_COLUMNS, shown, false).some((col) => col.id === hidden), true);
  });

  it('does not offer unit cost, total cost, or margin in the inquiry selector', () => {
    const ids = INQUIRY_LINE_COLUMNS.map((col) => col.id);
    const labels = INQUIRY_LINE_COLUMNS.map((col) => col.label);
    for (const banned of COST_COLUMN_IDS) {
      assert.equal(ids.includes(banned), false);
      assert.equal(labels.includes(banned), false);
    }
    assert.ok(ids.includes('unitPrice'));
    assert.ok(ids.includes('totalValue'));
    assert.equal(INQUIRY_LINE_COLUMNS.find((col) => col.id === 'unitPrice')?.customerVisible, undefined);
  });
});

describe('commercial line pricing display', () => {
  it('shows a dash before pricing and never a zero placeholder', () => {
    const view = resolveCommercialLinePricing({
      inquiryQuantity: 1,
      inquiryLengthMeters: 1000,
      hasSnapshot: false,
      unitPrice: 0,
      lineTotal: 0,
    });
    assert.equal(view.commercialPricingState, 'UNPRICED');
    assert.equal(formatCommercialPriceAmount(view.commercialPricingState, view.commercialUnitPrice), '—');
  });

  it('uses the server snapshot after pricing and dashes when inputs change', () => {
    const priced = resolveCommercialLinePricing({
      inquiryQuantity: 2,
      inquiryLengthMeters: 500,
      quotationQuantity: 2,
      quotationLengthMeters: 500,
      hasSnapshot: true,
      unitPrice: 10.5,
      lineTotal: 21,
    });
    assert.equal(priced.commercialPricingState, 'PRICED');
    assert.equal(priced.commercialUnitPrice, 10.5);
    const stale = resolveCommercialLinePricing({
      inquiryQuantity: 3,
      inquiryLengthMeters: 500,
      quotationQuantity: 2,
      quotationLengthMeters: 500,
      hasSnapshot: true,
      unitPrice: 10.5,
      lineTotal: 21,
    });
    assert.equal(stale.commercialPricingState, 'RECALCULATION_REQUIRED');
    assert.equal(stale.commercialUnitPrice, null);
    assert.equal(formatCommercialPriceAmount(stale.commercialPricingState, 10.5), '—');
  });

  it('keeps estimated value on the financial snapshot or a dash', () => {
    assert.deepEqual(
      commercialValueSummary({ productsTotal: 100, lineStates: ['PRICED', 'PRICED'] }),
      { amount: 100, recalculationRequired: false }
    );
    assert.equal(
      commercialValueSummary({ productsTotal: 100, lineStates: ['PRICED', 'UNPRICED'] }).amount,
      null
    );
    assert.equal(
      commercialValueSummary({ productsTotal: 100, lineStates: ['RECALCULATION_REQUIRED'] }).recalculationRequired,
      true
    );
  });
});

describe('issued commercial offer document', () => {
  const issuedAt = new Date('2026-07-28T08:00:00.000Z');

  it('stores the price adjustment formula and inquiry metal bases', () => {
    const doc = buildIssuedCommercialOfferDocument({
      quotationNumber: 'Q-100',
      versionNo: 2,
      currency: 'USD',
      validUntil: new Date('2026-07-30T08:00:00.000Z'),
      issuedAt,
      incoterms: 'CIF',
      destination: 'Alexandria',
      copperBase: 9100,
      aluminiumBase: 2400,
      metalCurrency: 'USD',
      metalUnitBasis: 'USD/MT',
      financialOfferSnapshotId: 'offer-1',
      productsTotal: '1000',
      shipmentTotal: '50',
      grandTotal: '1050',
      customerName: 'Example Buyer',
      lines: [],
    });
    assert.equal(doc.priceAdjustment.formula, PRICE_ADJUSTMENT_FORMULA);
    assert.equal(doc.priceAdjustment.copperBase, 9100);
    assert.equal(doc.priceAdjustment.aluminiumBase, 2400);
    assert.equal(doc.grandTotalLabel, 'Grand Total CIF Alexandria');
    assert.equal(doc.grandTotal, 1050);
    assert.equal(doc.productsTotal, 1000);
    assert.equal(doc.validityLabel, '48 Hours');
    assert.match(doc.greeting.salutation, /Dear /);
    assert.equal(doc.greeting.salutation.includes('Tanna'), false);
    assert.equal(ENERGYA_COMMERCIAL_OFFER_TEMPLATE.greeting.body.includes('ELAND'), false);
    assert.equal(ENERGYA_COMMERCIAL_OFFER_TEMPLATE.greeting.body.includes('Tanna'), false);
    assert.deepEqual(
      doc.terms.map((term) => term.code),
      [...COMMERCIAL_TERM_CODES]
    );
    const again = buildIssuedCommercialOfferDocument({
      quotationNumber: 'Q-100',
      versionNo: 2,
      currency: 'USD',
      validUntil: new Date('2026-07-30T08:00:00.000Z'),
      issuedAt,
      incoterms: 'CIF',
      destination: 'Alexandria',
      copperBase: 9100,
      aluminiumBase: 2400,
      metalCurrency: 'USD',
      metalUnitBasis: 'USD/MT',
      financialOfferSnapshotId: 'offer-1',
      productsTotal: '1000',
      shipmentTotal: '50',
      grandTotal: '1050',
      customerName: 'Example Buyer',
      lines: [],
    });
    assert.deepEqual(again, doc);
  });

  it('does not hardcode DAP Doncaster and leaves missing weights null', () => {
    assert.equal(grandTotalLabel('FOB', 'Jeddah'), 'Grand Total FOB Jeddah');
    assert.equal(grandTotalLabel('DAP', 'Doncaster').includes('DAP Doncaster'), true);
    assert.notEqual(grandTotalLabel('CIF', 'Rotterdam'), 'Grand Total DAP Doncaster');
    const weights = extractConductorWeightsKgPerKm([
      { metalType: 'COPPER', consumptionPerKm: 342, consumptionUom: 'kg' },
      { metalType: 'ALUMINIUM', consumptionPerKm: 10, consumptionUom: 'm' },
    ]);
    assert.equal(weights.cuWeightKgPerKm, 342);
    assert.equal(weights.alWeightKgPerKm, null);
  });

  it('maps missing numeric values to 0 and descriptive values to Not Set', () => {
    assert.equal(presentNumeric(null), 0);
    assert.equal(presentNumeric(undefined), 0);
    assert.equal(presentText(''), 'Not Set');
    assert.equal(presentText(null), 'Not Set');
    const empty = buildIssuedCommercialOfferDocument({
      quotationNumber: 'Q-EMPTY',
      versionNo: 1,
      currency: 'EUR',
      issuedAt,
      customerName: '',
      lines: [
        {
          lineNumber: 1,
          itemDescription: '',
          moqKm: null,
          quantityUom: 'KM',
          cuWeightKgPerKm: null,
          alWeightKgPerKm: null,
          unitSellingPrice: null,
          lineTotal: null,
        },
      ],
    });
    assert.equal(presentNumeric(empty.lines[0].unitSellingPrice), 0);
    assert.equal(presentText(empty.lines[0].itemDescription), 'Not Set');
    assert.equal(presentText(empty.customer.contactPerson), 'Not Set');
  });

  it('exposes print and export actions for draft and issued documents', () => {
    const draft = commercialOfferDocumentActions({ issued: false, isCustomer: false });
    assert.deepEqual(
      draft.map((row) => row.label),
      ['Print Commercial Offer', 'Export Commercial Offer PDF']
    );
    const issued = commercialOfferDocumentActions({ issued: true, isCustomer: true });
    assert.deepEqual(
      issued.map((row) => row.label),
      ['Print Final Commercial Offer', 'Export Final Commercial Offer PDF']
    );
    assert.equal(commercialOfferDocumentActions({ issued: false, isCustomer: true }).length, 0);
  });
});

describe('quotation issued email', () => {
  it('includes the commercial notice fields and does not throw when enqueue fails', async () => {
    const mail = buildQuotationIssuedEmail({
      customerName: 'Example Buyer',
      quotationNumber: 'Q-100',
      revision: 2,
      total: 1050,
      currency: 'USD',
      validityLabel: '48 Hours',
      portalLink: '/customer/inquiries/inq-1',
    });
    assert.match(mail.bodyText, /Example Buyer/);
    assert.match(mail.bodyText, /Q-100/);
    assert.match(mail.bodyText, /Revision: 2/);
    assert.match(mail.bodyText, /1,050\.00 USD/);
    assert.match(mail.bodyText, /USD/);
    assert.match(mail.bodyText, /48 Hours/);
    assert.match(mail.bodyText, /\/customer\/inquiries\/inq-1/);
    const ok = await runEmailWithoutRollback(async () => {
      throw new Error('smtp down');
    });
    assert.equal(ok, false);
  });
});

describe('customer commercial projection', () => {
  it('strips cost and margin fields and keeps selling price', () => {
    const projected = projectInquiryForActor(
      {
        lines: [
          {
            materialCost: 10,
            materialCostCurrency: 'USD',
            costingCalculationId: 'calc-1',
            unitCost: 4,
            totalCost: 8,
            margin: 2,
            marginPercent: 20,
            commercialUnitPrice: 15,
            commercialLineTotal: 30,
            commercialPricingState: 'PRICED',
          },
        ],
      },
      { userType: 'customer' }
    );
    const line = projected.lines?.[0] as Record<string, unknown>;
    assert.equal('materialCost' in line, false);
    assert.equal('unitCost' in line, false);
    assert.equal('totalCost' in line, false);
    assert.equal('margin' in line, false);
    assert.equal('marginPercent' in line, false);
    assert.equal('costingCalculationId' in line, false);
    assert.equal(line.commercialUnitPrice, 15);
    assert.equal(line.commercialLineTotal, 30);
  });
});

describe('Version A submit routing', () => {
  it('calls the V2 submit path only when a V2 snapshot already exists', () => {
    assert.equal(
      shouldSubmitViaV2Inquiry({
        commercialMetadata: { workflowChannel: 'V2_CONFIGURATION' },
        lines: [{ v2CurrentSnapshotId: null }],
      }),
      false
    );
    assert.equal(
      shouldSubmitViaV2Inquiry({
        commercialMetadata: { workflowChannel: 'V2_CONFIGURATION' },
        lines: [{ v2CurrentSnapshotId: 'snap-1' }],
      }),
      true
    );
    assert.equal(
      shouldSubmitViaV2Inquiry({
        commercialMetadata: { workflowChannel: 'VERSION_A' },
        lines: [{ v2CurrentSnapshotId: 'snap-1' }],
      }),
      false
    );
  });
});
