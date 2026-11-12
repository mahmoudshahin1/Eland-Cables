import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { portalLifecycleFromInquiry } from '../domain/inquiryPortalLifecycle';
import { projectInquiryForActor } from './commercialProjection';
import { acceptPortalInquiry, archiveInquirySnapshot } from './inquiryPortalLifecycleRepository';
import { countInquiryPortalStatuses, listInquiries, listQuotations } from './commercialRepository';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';

dotenv.config();

describe('inquiry portal status counts', () => {
  const stamp = `PSC${Date.now().toString(36)}`;
  const customerId = `cust-${stamp}`;
  const historyCustomerId = `cust-${stamp}-hist`;
  const approveCustomerId = `cust-${stamp}-appr`;
  const ids: string[] = [];

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      const customers = [customerId, historyCustomerId, approveCustomerId];
      await prisma.salesAgreement.deleteMany({ where: { customerId: { in: customers } } });
      await prisma.epcSalesOrder.deleteMany({ where: { customerId: { in: customers } } });
      await prisma.commercialCommitment.deleteMany({ where: { customerId: { in: customers } } });
      await prisma.commercialQuotation.deleteMany({ where: { customerId: { in: customers } } });
      await prisma.commercialInquiry.deleteMany({ where: { customerId: { in: customers } } });
    }
    await disconnectPrisma();
  });

  it('matches each card to the list, and every quotation belongs to that inquiry', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);

    async function addInquiry(input: {
      suffix: string;
      status: 'DRAFT' | 'QUOTED' | 'CANCELLED';
      lifecycle?: 'OPEN' | 'NOT_SUBMITTED' | 'CANCELED' | 'ACCEPTED';
      isCurrent?: boolean;
      groupKey?: string;
      supersedesInquiryId?: string;
      withQuotation?: boolean;
    }) {
      const inquiry = await prisma!.commercialInquiry.create({
        data: {
          inquiryNumber: `INQ-${stamp}-${input.suffix}`,
          customerId,
          customerName: `Portal Count ${stamp}`,
          status: input.status,
          currency: 'USD',
          isCurrent: input.isCurrent !== false,
          inquiryGroupKey: input.groupKey,
          supersedesInquiryId: input.supersedesInquiryId,
          commercialMetadata: input.lifecycle ? { portalLifecycle: input.lifecycle } : undefined,
        },
      });
      ids.push(inquiry.id);
      if (input.withQuotation) {
        await prisma!.commercialQuotation.create({
          data: {
            quotationNumber: `QUO-${stamp}-${input.suffix}`,
            inquiryId: inquiry.id,
            customerId,
            customerName: inquiry.customerName,
            status: 'DRAFT',
            currency: 'USD',
            isCurrent: true,
            materialCostTotal: 0,
          },
        });
      }
      return inquiry;
    }

    await addInquiry({ suffix: 'OPEN', status: 'DRAFT', lifecycle: 'OPEN' });
    await addInquiry({ suffix: 'SUB', status: 'DRAFT', lifecycle: 'NOT_SUBMITTED', withQuotation: true });
    const canceled = await addInquiry({
      suffix: 'V1',
      status: 'CANCELLED',
      lifecycle: 'CANCELED',
      isCurrent: false,
      groupKey: `GRP-${stamp}`,
      withQuotation: true,
    });
    await addInquiry({
      suffix: 'V2',
      status: 'DRAFT',
      lifecycle: 'NOT_SUBMITTED',
      groupKey: `GRP-${stamp}`,
      supersedesInquiryId: canceled.id,
      withQuotation: true,
    });
    await addInquiry({ suffix: 'OK', status: 'DRAFT', lifecycle: 'ACCEPTED', withQuotation: true });
    await addInquiry({ suffix: 'OLD', status: 'QUOTED', withQuotation: true });
    await addInquiry({
      suffix: 'META',
      status: 'DRAFT',
      withQuotation: false,
    });
    const metaOnly = ids[ids.length - 1];
    await prisma.commercialInquiry.update({
      where: { id: metaOnly },
      data: { commercialMetadata: { displayInquiryNumber: `INQ-${stamp}-META` } },
    });

    const scope = { customerId, isCurrent: undefined as boolean | undefined };
    const counts = await countInquiryPortalStatuses(scope);
    const cards = [
      ['OPEN', counts.draft],
      ['NOT_SUBMITTED', counts.submitted],
      ['CANCELED', counts.canceled],
      ['ACCEPTED', counts.approved],
    ] as const;

    for (const [status, expected] of cards) {
      const listed = await listInquiries({ ...scope, status, page: 1, pageSize: 100 });
      assert.equal(listed.total, expected, status);
    }
    const all = await listInquiries({ ...scope, page: 1, pageSize: 100 });
    assert.equal(all.total, counts.total);
    assert.equal(counts.total, counts.draft + counts.submitted + counts.canceled + counts.approved);
    assert.equal(counts.draft, 2);
    assert.equal(counts.submitted, 3);
    assert.equal(counts.canceled, 1);
    assert.equal(counts.approved, 1);

    const quotations = await listQuotations({ customerId, portalStatus: 'NOT_SUBMITTED', isCurrent: true });
    assert.equal(quotations.length, 3);
    const inquiryIds = new Set(all.inquiries.map((row) => row.id));
    for (const quotation of quotations) {
      assert.equal(portalLifecycleFromInquiry(quotation.inquiry), 'NOT_SUBMITTED');
      assert.equal(inquiryIds.has(quotation.inquiryId), true);
    }
  });

  it('keeps the previous status when the inquiry moves to the next one', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${stamp}-LIVE`,
        customerId: historyCustomerId,
        customerName: `Portal History ${stamp}`,
        status: 'DRAFT',
        currency: 'USD',
        isCurrent: true,
        versionNo: 1,
        commercialMetadata: { portalLifecycle: 'OPEN', displayInquiryNumber: `INQ-${stamp}-LIVE` },
      },
    });
    ids.push(inquiry.id);
    await archiveInquirySnapshot(inquiry.id);
    await prisma.commercialInquiry.update({
      where: { id: inquiry.id },
      data: { commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED', displayInquiryNumber: `INQ-${stamp}-LIVE` } },
    });
    const family = await listInquiries({
      customerId: historyCustomerId,
      isCurrent: undefined,
      page: 1,
      pageSize: 20,
    });
    const labels = family.inquiries.map((row) => portalLifecycleFromInquiry(row)).sort();
    assert.deepEqual(labels, ['NOT_SUBMITTED', 'OPEN']);
    const history = family.inquiries.find((row) => row.isCurrent === false);
    assert.equal(portalLifecycleFromInquiry(history || {}), 'OPEN');
  });

  it('keeps portal lifecycle on the customer projection', () => {
    const projected = projectInquiryForActor(
      {
        status: 'DRAFT',
        commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED', calculatedLineFingerprint: 'hidden' },
        lines: [{ materialCost: 9, commercialUnitPrice: 12 }],
      },
      { userType: 'customer' }
    );
    assert.equal(portalLifecycleFromInquiry(projected), 'NOT_SUBMITTED');
    const line = projected.lines?.[0] as Record<string, unknown>;
    assert.equal('materialCost' in line, false);
    assert.equal(line.commercialUnitPrice, 12);
  });

  it('approves a calculated inquiry as a direct order or a sales agreement and keeps the previous status', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const actor = { id: 'portal-approve-test', name: 'Portal Approve', email: 'portal-approve@example.com', userType: 'internal' };

    async function seed(suffix: string) {
      const number = `INQ-${stamp}-${suffix}`;
      const inquiry = await prisma!.commercialInquiry.create({
        data: {
          inquiryNumber: number,
          customerId: approveCustomerId,
          customerName: `Approve ${stamp}`,
          status: 'DRAFT',
          currency: 'USD',
          isCurrent: true,
          versionNo: 1,
          commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED', displayInquiryNumber: number },
        },
      });
      await prisma!.commercialQuotation.create({
        data: {
          quotationNumber: `QUO-${stamp}-${suffix}`,
          inquiryId: inquiry.id,
          customerId: approveCustomerId,
          customerName: `Approve ${stamp}`,
          versionNo: 1,
          isCurrent: true,
          status: 'OPEN',
          currency: 'USD',
          commercialPricingStatus: 'PRICING_APPROVED',
          sellingPrice: 100,
          lines: {
            create: [{ lineNumber: 1, itemDescription: 'Test cable', quantity: 1, sellingPrice: 100 }],
          },
        },
      });
      return inquiry.id;
    }

    const directId = await seed('SO');
    const direct = await acceptPortalInquiry(directId, actor, 'DIRECT_ORDER');
    assert.equal(portalLifecycleFromInquiry(direct), 'ACCEPTED');
    const directQuote = await prisma.commercialQuotation.findFirst({ where: { inquiryId: directId, isCurrent: true } });
    assert.equal(directQuote?.status, 'ACCEPTED');
    assert.equal(directQuote?.fulfillmentType, 'DIRECT_ORDER');
    assert.equal(await prisma.epcSalesOrder.count({ where: { inquiryId: directId, status: { not: 'CANCELLED' } } }), 1);
    await assert.rejects(() => acceptPortalInquiry(directId, actor, 'DIRECT_ORDER'), /already approved/);
    const directHistory = await prisma.commercialInquiry.findFirst({
      where: { customerId: approveCustomerId, inquiryGroupKey: direct.inquiryGroupKey, isCurrent: false },
    });
    assert.equal(portalLifecycleFromInquiry(directHistory || {}), 'NOT_SUBMITTED');

    const agreementId = await seed('SA');
    const agreement = await acceptPortalInquiry(agreementId, actor, 'SALES_AGREEMENT');
    assert.equal(portalLifecycleFromInquiry(agreement), 'ACCEPTED');
    const agreementQuote = await prisma.commercialQuotation.findFirst({ where: { inquiryId: agreementId, isCurrent: true } });
    assert.equal(agreementQuote?.status, 'ACCEPTED');
    assert.equal(agreementQuote?.fulfillmentType, 'SALES_AGREEMENT');
    assert.equal(await prisma.salesAgreement.count({ where: { quotationId: agreementQuote?.id } }), 1);
    await assert.rejects(() => acceptPortalInquiry(agreementId, actor, 'SALES_AGREEMENT'), /already approved/);
  });
});
