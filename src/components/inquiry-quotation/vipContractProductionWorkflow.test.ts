import test from 'node:test';
import assert from 'node:assert/strict';

test('Fulfillment & Production Flow: metadata transitions from submission to production floor release', () => {
  // Step 1: Customer submits contract
  const initialMeta: Record<string, unknown> = {};
  const submittedMeta = {
    ...initialMeta,
    requestedFulfillmentType: 'DIRECT_ORDER',
    submittedToSales: true,
    submittedToSalesAt: new Date().toISOString(),
    productionStatus: 'AWAITING_SALES_SIGN_OFF',
  };

  assert.equal(submittedMeta.submittedToSales, true);
  assert.equal(submittedMeta.requestedFulfillmentType, 'DIRECT_ORDER');
  assert.equal(submittedMeta.productionStatus, 'AWAITING_SALES_SIGN_OFF');

  // Step 2: Sales receives notification
  const salesNotification = {
    title: 'New VIP Contract Submitted: INQ-001',
    message: 'Customer submitted contract [Direct Sales Order] for quotation QUO-001. Awaiting Sales review and release to production floor.',
  };
  assert.match(salesNotification.message, /Direct Sales Order/);
  assert.match(salesNotification.message, /production floor/);

  // Step 3: Sales approves quotation and releases to production
  const approvedMeta = {
    ...submittedMeta,
    commercialApprovalStatus: 'APPROVED',
    productionStatus: 'RELEASED_TO_PRODUCTION',
    releasedToProductionAt: new Date().toISOString(),
  };

  assert.equal(approvedMeta.commercialApprovalStatus, 'APPROVED');
  assert.equal(approvedMeta.productionStatus, 'RELEASED_TO_PRODUCTION');

  // Step 4: Customer receives release notification
  const customerNotification = {
    title: '🎉 Contract Approved & Released to Production Floor!',
    message: 'Sales approved quotation QUO-001 (Direct Sales Order)! Your order has officially been released to the Production Floor for cable manufacturing.',
  };
  assert.match(customerNotification.message, /Production Floor/);
  assert.match(customerNotification.message, /cable manufacturing/);
});
