import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALUMINIUM_PRICE_REQUIRED,
  CALCULATION_REQUIRED,
  COPPER_PRICE_REQUIRED,
  DESTINATION_REQUIRED,
  INCOTERMS_REQUIRED,
  LINES_REQUIRED,
  applyInquiryCurrencyChange,
  applySelectedDeliveryCombination,
  buildHeaderFormFromInquiry,
  buildUpdatePayloadFromForm,
  canShowInquiryCalculate,
  canShowInquirySubmit,
  collectInquirySubmitHeaderCodes,
  collectInquirySubmitMissingItems,
  formatInquirySubmitHeaderMessage,
} from './inquiryHeaderFormService';
import { CommercialInquiryDto } from './commercialInquiryApiService';
import { INQUIRY_HEADER_FIELDS } from './inquiryFieldManifest';
import { buildCostingRequestFromInquiryLine } from './costingRequestService';

function inquiry(partial: Partial<CommercialInquiryDto> = {}): CommercialInquiryDto {
  return {
    id: 'inq-1',
    inquiryNumber: 'INQ-1',
    customerId: 'cust-1',
    customerName: 'ELAND Cables',
    inquiryDate: '2026-08-22',
    currency: 'USD',
    status: 'DRAFT',
    incoterms: 'FOB',
    lines: [],
    ...partial,
  };
}

describe('inquiry header form — incoterms, destination, metal rates', () => {
  it('marks Copper Price, Aluminium Price, Incoterms, and Destination on the header manifest', () => {
    const copper = INQUIRY_HEADER_FIELDS.find((f) => f.id === 'copperPriceRate');
    const aluminium = INQUIRY_HEADER_FIELDS.find((f) => f.id === 'aluminiumPriceRate');
    const incoterms = INQUIRY_HEADER_FIELDS.find((f) => f.id === 'incoterms');
    const destination = INQUIRY_HEADER_FIELDS.find((f) => f.id === 'deliveryDestination');
    assert.equal(copper?.label, 'Copper Price');
    assert.equal(copper?.required, true);
    assert.equal(aluminium?.label, 'Aluminium Price');
    assert.equal(aluminium?.required, true);
    assert.equal(incoterms?.label, 'Incoterm');
    assert.equal(incoterms?.defaultVisible, true);
    assert.equal(destination?.label, 'Destination');
    assert.equal(destination?.defaultVisible, true);
  });

  it('buildUpdatePayloadFromForm persists dest, incoterm, and metal rates without inventing charges', () => {
    const form = buildHeaderFormFromInquiry(
      inquiry({
        incoterms: 'CIF',
        commercialMetadata: {
          copperPriceRate: 9500,
          aluminiumPriceRate: 2400,
          deliveryDestination: 'Alexandria',
        },
      })
    );
    form.incoterms = 'DAP';
    form.deliveryDestination = 'UK';
    form.copperPriceRate = '9100.5';
    form.aluminiumPriceRate = '2500';

    const payload = buildUpdatePayloadFromForm(form);
    assert.equal(payload.incoterms, 'DAP');
    assert.equal(payload.commercialMetadata?.incoterms, 'DAP');
    assert.equal(payload.commercialMetadata?.deliveryDestination, 'UK');
    assert.equal(payload.commercialMetadata?.destinationPortCode, null);
    assert.equal(payload.commercialMetadata?.copperPriceRate, 9100.5);
    assert.equal(payload.commercialMetadata?.aluminiumPriceRate, 2500);
    assert.equal(payload.commercialMetadata?.incotermChargeStatus, undefined);
  });

  it('round-trips customer presentation metadata without inventing metal rates', () => {
    const form = buildHeaderFormFromInquiry(
      inquiry({
        commercialMetadata: {
          endUser: 'Alexandria Port Authority',
          priceBasis: 'LME',
          requiredQuotationDate: '2026-10-15',
        },
      })
    );
    assert.equal(form.endUser, 'Alexandria Port Authority');
    assert.equal(form.priceBasis, 'LME');
    form.inquiryKind = 'PRICE';
    form.deliveryAddress = 'Alexandria Port Authority';
    const payload = buildUpdatePayloadFromForm(form);
    assert.equal(payload.commercialMetadata?.endUser, 'Alexandria Port Authority');
    assert.equal(payload.commercialMetadata?.priceBasis, 'LME');
    assert.equal(payload.commercialMetadata?.inquiryKind, 'PRICE');
    assert.equal(payload.commercialMetadata?.deliveryAddress, 'Alexandria Port Authority');
  });

  it('does not promote free-text Alexandria into a DestinationPort code', () => {
    const form = buildHeaderFormFromInquiry(
      inquiry({
        incoterms: 'FOB',
        commercialMetadata: { deliveryDestination: 'Alexandria' },
      })
    );
    const payload = buildUpdatePayloadFromForm(form);
    assert.equal(payload.commercialMetadata?.deliveryDestination, 'Alexandria');
    assert.equal(payload.commercialMetadata?.destinationPortCode, null);
  });

  it('A: selected NETHERLANDS / CIF / ROTTERDAM persists destinationPortCode, destination, and incoterms', () => {
    const form = buildHeaderFormFromInquiry(
      inquiry({
        incoterms: 'CIF',
        deliveryTerms: 'CIF Alexandria',
        commercialMetadata: { deliveryDestination: 'Alexandria' },
      })
    );
    assert.equal(form.destinationPortCode, '');
    const next = {
      ...form,
      ...applySelectedDeliveryCombination({
        countryLabel: 'NETHERLANDS',
        incotermCode: 'CIF',
        destinationPortCode: 'ROTTERDAM',
        destinationPortName: 'ROTTERDAM',
      }),
    };
    const payload = buildUpdatePayloadFromForm(next);
    assert.equal(payload.commercialMetadata?.destinationPortCode, 'ROTTERDAM');
    assert.equal(payload.commercialMetadata?.deliveryDestination, 'NETHERLANDS / CIF / ROTTERDAM');
    assert.equal(payload.incoterms, 'CIF');
    assert.equal(payload.deliveryTerms, 'CIF Alexandria');
  });

  it('I: does not auto-select a default or first delivery combination', () => {
    const form = buildHeaderFormFromInquiry(
      inquiry({
        incoterms: 'CIF',
        commercialMetadata: { deliveryDestination: 'Alexandria' },
      })
    );
    assert.equal(form.destinationPortCode, '');
    assert.equal(form.deliveryDestination, 'Alexandria');
    const cleared = applySelectedDeliveryCombination(null);
    assert.equal(cleared.destinationPortCode, '');
    assert.equal(cleared.deliveryDestination, '');
    assert.equal(cleared.incoterms, undefined);
  });

  it('does not invent FOB when the inquiry Incoterm is empty', () => {
    const form = buildHeaderFormFromInquiry(inquiry({ incoterms: '' }));
    assert.equal(form.incoterms, '');
  });

  it('submit header codes block missing or non-positive metal rates', () => {
    assert.deepEqual(collectInquirySubmitHeaderCodes({}), [
      COPPER_PRICE_REQUIRED,
      ALUMINIUM_PRICE_REQUIRED,
    ]);
    assert.deepEqual(collectInquirySubmitHeaderCodes({ copperPriceRate: 0, aluminiumPriceRate: -1 }), [
      COPPER_PRICE_REQUIRED,
      ALUMINIUM_PRICE_REQUIRED,
    ]);
    assert.deepEqual(collectInquirySubmitHeaderCodes({ copperPriceRate: 9500 }), [ALUMINIUM_PRICE_REQUIRED]);
    assert.deepEqual(collectInquirySubmitHeaderCodes({ copperPriceRate: 9500, aluminiumPriceRate: 2400 }), []);
    assert.match(
      formatInquirySubmitHeaderMessage([COPPER_PRICE_REQUIRED, ALUMINIUM_PRICE_REQUIRED]),
      /COPPER_PRICE_REQUIRED/
    );
  });

  it('keeps Submit visible for DRAFT even when metal rates and lines are missing', () => {
    assert.equal(canShowInquirySubmit('DRAFT'), true);
    assert.equal(canShowInquirySubmit('SUBMITTED'), false);
    assert.equal(canShowInquiryCalculate('DRAFT', 2), true);
    assert.equal(canShowInquiryCalculate('UNDER_REVIEW', 1), true);
    assert.equal(canShowInquiryCalculate('DRAFT', 0), false);
    assert.equal(canShowInquiryCalculate('SUBMITTED', 3), false);
  });

  it('lists missing submit parts without inventing values or treating logistics as a gate', () => {
    const missing = collectInquirySubmitMissingItems({
      copperPriceRate: '',
      aluminiumPriceRate: 0,
      deliveryDestination: '  ',
      incoterms: '',
      lineCount: 0,
      mappedLinesNeedingCalc: [{ lineNumber: 2 }],
    });
    assert.deepEqual(
      missing.map((item) => item.code),
      [
        COPPER_PRICE_REQUIRED,
        ALUMINIUM_PRICE_REQUIRED,
        DESTINATION_REQUIRED,
        INCOTERMS_REQUIRED,
        LINES_REQUIRED,
        CALCULATION_REQUIRED,
      ]
    );
    assert.equal(
      collectInquirySubmitMissingItems({
        copperPriceRate: 9500,
        aluminiumPriceRate: 2400,
        deliveryDestination: 'Alexandria',
        incoterms: 'FOB',
        lineCount: 1,
        mappedLinesNeedingCalc: [],
      }).length,
      0
    );
    assert.equal(
      collectInquirySubmitMissingItems({
        copperPriceRate: 9500,
        aluminiumPriceRate: 2400,
        deliveryDestination: 'UK',
        incoterms: 'DAP',
        lineCount: 1,
      }).some((item) => item.code.includes('LOGISTICS')),
      false
    );
  });

  it('costing request payload includes header dest and incoterm', () => {
    const request = buildCostingRequestFromInquiryLine(
      { materialNumber: 'CABLE-1', requestedQuantity: 1, requestedLengthMeters: 100 },
      {
        currency: 'USD',
        incoterms: 'CIF',
        commercialMetadata: {
          deliveryDestination: 'Rotterdam',
          copperPriceRate: 9500,
          aluminiumPriceRate: 2400,
        },
      }
    );
    assert.ok(!('error' in request));
    assert.equal(request.commercialMetadata?.incoterms, 'CIF');
    assert.equal(request.commercialMetadata?.deliveryDestination, 'Rotterdam');
    assert.equal(request.layerInputs?.COPPER_PRICE_RATE, '9500');
    assert.equal(request.layerInputs?.ALUMINIUM_PRICE_RATE, '2400');
  });

  it('clears metal prices when inquiry currency changes', () => {
    const form = buildHeaderFormFromInquiry(
      inquiry({
        currency: 'USD',
        commercialMetadata: { copperPriceRate: 9500, aluminiumPriceRate: 2400, copperPriceUom: 'MT' },
      })
    );
    const patch = applyInquiryCurrencyChange(form, 'EUR');
    assert.equal(patch.currency, 'EUR');
    assert.equal(patch.copperPriceRate, '');
    assert.equal(patch.aluminiumPriceRate, '');
    assert.equal(patch.rawMaterialCurrency, 'EUR');
    assert.equal(patch.copperPriceUom, 'USD/MT');
  });
});
