import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgreementTraceability,
  buildSalesOrderTraceability,
  classifyFulfillmentException,
  fulfillmentExceptionTitle,
  operationalStatusLabel,
  orderOriginLabel,
  parseFulfillmentWorkspaceView,
  resolveFulfillmentActions,
} from './commercialFulfillmentWorkflow';

describe('commercialFulfillmentWorkflow — exception classification', () => {
  it('classifies MTO bypass / MTS eligibility / over-release / immutability / conflict', () => {
    assert.equal(
      classifyFulfillmentException({
        message:
          'Cable X has fulfillment policy MTO (MTO only). Direct MTS sales orders are not allowed. Use Quotation → Commercial Approval → Sales Order.',
      }),
      'mts_eligibility'
    );
    assert.equal(
      classifyFulfillmentException({
        message: 'Release quantity 50 exceeds remaining quantity 10 on agreement line.',
      }),
      'over_release'
    );
    assert.equal(
      classifyFulfillmentException({
        message: 'Only the current quotation revision can be commercially approved.',
      }),
      'immutable_revision'
    );
    assert.equal(
      classifyFulfillmentException({
        message: 'An active sales agreement already exists for commitment CC-1.',
        code: 'CONFLICT',
      }),
      'duplicate_idempotent'
    );
    assert.equal(
      classifyFulfillmentException({ message: 'Sign in is required.', code: 'UNAUTHORIZED', status: 403 }),
      'forbidden'
    );
  });

  it('maps operational status labels Sales expects', () => {
    assert.equal(operationalStatusLabel('DRAFT'), 'Draft');
    assert.equal(operationalStatusLabel('CONFIRMED'), 'Confirmed');
    assert.equal(operationalStatusLabel('ACTIVE'), 'Confirmed');
    assert.equal(operationalStatusLabel('COMPLETED'), 'Fulfilled');
    assert.equal(operationalStatusLabel('CANCELLED'), 'Cancelled');
  });

  it('labels order origins for cable sales paths', () => {
    assert.equal(orderOriginLabel('QUOTATION'), 'From quotation');
    assert.equal(orderOriginLabel('AGREEMENT_RELEASE'), 'Agreement release');
    assert.equal(orderOriginLabel('DIRECT_MTS'), 'Direct MTS');
  });

  it('hides fulfillment actions from customers', () => {
    const customer = resolveFulfillmentActions({ userType: 'customer', hasSalesQuotations: false });
    assert.equal(customer.canCreateDirectMts, false);
    assert.equal(customer.canCreateRelease, false);
    assert.equal(customer.canApproveCommercial, false);

    const sales = resolveFulfillmentActions({ userType: 'internal', hasSalesQuotations: true });
    assert.equal(sales.canCreateDirectMts, true);
    assert.equal(sales.canCreateSalesOrder, true);
  });

  it('parses workspace view query', () => {
    assert.equal(parseFulfillmentWorkspaceView('agreements'), 'agreements');
    assert.equal(parseFulfillmentWorkspaceView('direct-mts'), 'direct-mts');
    assert.equal(parseFulfillmentWorkspaceView('nope'), 'orders');
  });

  it('builds SO and agreement traceability including Direct MTS no-commitment', () => {
    const soSteps = buildSalesOrderTraceability({
      orderOrigin: 'DIRECT_MTS',
      lines: [
        {
          configurationId: 'CFG-1',
          engineeringRevision: 'R2',
          bomVersion: 'B1',
          costingRunId: 'CR-9',
        },
      ],
    });
    assert.ok(soSteps.some((s) => s.key === 'commitment' && /None/.test(s.value)));
    assert.ok(soSteps.some((s) => s.key === 'eng' && s.value === 'R2'));
    assert.ok(soSteps.some((s) => s.key === 'costing' && s.muted));

    const agSteps = buildAgreementTraceability({
      agreementNumber: 'SA-1',
      quotation: { quotationNumber: 'Q-1', versionNo: 2 },
      commitment: { commitmentNumber: 'CC-1' },
      releases: [{ releaseNumber: 'REL-1', salesOrder: { salesOrderNumber: 'SO-9' } }],
    });
    assert.ok(agSteps.some((s) => s.value === 'Q-1 V2'));
    assert.ok(agSteps.some((s) => s.value === 'REL-1 → SO-9'));
  });

  it('exposes titles for each exception kind', () => {
    assert.match(fulfillmentExceptionTitle('over_release'), /Over-release/i);
    assert.match(fulfillmentExceptionTitle('mto_bypass'), /MTO/i);
  });
});
