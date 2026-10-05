import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import {
  addInquiryLine,
  cancelInquiry,
  createInquiry,
  createInquiryRevision,
  deleteInquiryLine,
  duplicateInquiryLine,
  getInquiryById,
  submitInquiry,
  updateInquiry,
  updateInquiryLine,
} from './commercialRepository';
import { projectInquiryForActor } from './commercialProjection';
import {
  attachTechnicalOfferToAllInquiryLines,
  clearInquiryHeaderMetalRates,
} from './attachTechnicalOfferTestHelper';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';
import {
  applySelectedDeliveryCombination,
  buildHeaderFormFromInquiry,
  buildUpdatePayloadFromForm,
} from '../services/inquiryHeaderFormService';
import type { CommercialInquiryDto } from '../services/commercialInquiryApiService';

dotenv.config();

describe('Increment 12 — Inquiry UI persistence', () => {
  const customer = {
    id: 'u-cust-eland-ui',
    name: 'David Smith',
    email: 'david.smith@elandcables.com',
    userType: 'customer',
    permissions: { salesQuotations: false },
  };

  const salesUser = {
    id: 'u-sales-ui',
    name: 'Sales Officer',
    email: 'sales@energya.com',
    userType: 'internal',
    permissions: { salesQuotations: true },
  };

  let inquiryId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);
    await deleteCommercialInquiriesMatching(prisma, {
      customerId: { in: [customer.id, salesUser.id] },
    });
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCommercialInquiriesMatching(prisma, {
        customerId: { in: [customer.id, salesUser.id] },
      });
    }
    await disconnectPrisma();
  });

  it('creates and reloads inquiry header from PostgreSQL', async () => {
    const created = await createInquiry(
      { customerName: 'ELAND Cables', projectName: 'UI Persistence Test', customerReference: '26/009999' },
      customer
    );
    inquiryId = created.id;
    const loaded = await getInquiryById(created.id);
    assert.ok(loaded);
    assert.equal(loaded?.projectName, 'UI Persistence Test');
    assert.equal(loaded?.versionNo, 1);
    assert.equal(loaded?.isCurrent, true);
  });

  it('updates inquiry header and persists changes', async () => {
    const updated = await updateInquiry(
      inquiryId,
      { projectName: 'Updated Project', notes: 'Updated remarks' },
      customer
    );
    assert.equal(updated.projectName, 'Updated Project');
    const loaded = await getInquiryById(inquiryId);
    assert.equal(loaded?.notes, 'Updated remarks');
  });

  it('persists incoterms and delivery destination on header update', async () => {
    const updated = await updateInquiry(
      inquiryId,
      {
        incoterms: 'CIF',
        commercialMetadata: {
          deliveryDestination: 'Alexandria',
          copperPriceRate: 9500,
          aluminiumPriceRate: 2400,
          incoterms: 'CIF',
        },
      },
      customer
    );
    assert.equal(updated.incoterms, 'CIF');
    const meta = (updated.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(meta.deliveryDestination, 'Alexandria');
    assert.equal(meta.incoterms, 'CIF');
    const loaded = await getInquiryById(inquiryId);
    assert.equal(loaded?.incoterms, 'CIF');
    const loadedMeta = (loaded?.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(loadedMeta.deliveryDestination, 'Alexandria');
  });

  it('A: persists selected NETHERLANDS / CIF / ROTTERDAM combination through inquiry update', async () => {
    const created = await createInquiry(
      {
        customerName: 'ELAND Cables',
        projectName: 'Delivery combination persistence',
        customerReference: `26/DELIV-${Date.now().toString(36).toUpperCase()}`,
        incoterms: 'CIF',
        deliveryTerms: 'CIF Alexandria',
        commercialMetadata: { deliveryDestination: 'Alexandria' },
      },
      customer
    );
    const form = buildHeaderFormFromInquiry(created as unknown as CommercialInquiryDto);
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
    const updated = await updateInquiry(created.id, payload, customer);
    const meta = (updated.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(meta.destinationPortCode, 'ROTTERDAM');
    assert.equal(meta.deliveryDestination, 'NETHERLANDS / CIF / ROTTERDAM');
    assert.equal(updated.incoterms, 'CIF');
    assert.equal(updated.deliveryTerms, 'CIF Alexandria');
    const loaded = await getInquiryById(created.id);
    const loadedMeta = (loaded?.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(loadedMeta.destinationPortCode, 'ROTTERDAM');
    assert.equal(loadedMeta.deliveryDestination, 'NETHERLANDS / CIF / ROTTERDAM');
    assert.equal(loaded?.incoterms, 'CIF');
  });

  it('internal user can update customer name on draft inquiry', async () => {
    const created = await createInquiry({ customerName: 'Original Customer' }, salesUser);
    const updated = await updateInquiry(created.id, { customerName: 'Updated Customer' }, salesUser);
    assert.equal(updated.customerName, 'Updated Customer');
  });

  it('adds, duplicates, and deletes inquiry lines transactionally', async () => {
    const line = await addInquiryLine(
      inquiryId,
      { cableDescription: 'MV Cable Line', requestedQuantity: 2, requestedLengthMeters: 500 },
      customer
    );
    assert.equal(line.lineNumber, 1);
    const dup = await duplicateInquiryLine(inquiryId, line.id, customer);
    assert.equal(dup.lineNumber, 2);
    await deleteInquiryLine(inquiryId, line.id, customer);
    const loaded = await getInquiryById(inquiryId);
    assert.equal(loaded?.lines.length, 1);
  });

  it('submits inquiry and creates immutable new version', async () => {
    const created = await createInquiry(
      {
        customerName: 'Energya Client',
        projectName: 'Standard Submit',
        commercialMetadata: {
          copperPriceRate: 9500,
          aluminiumPriceRate: 2400,
          incoterms: 'CIF',
        },
      },
      salesUser
    );
    await addInquiryLine(
      created.id,
      { cableDescription: 'Submit line', requestedQuantity: 1, requestedLengthMeters: 100 },
      salesUser
    );
    await attachTechnicalOfferToAllInquiryLines(created.id);
    const submitted = await submitInquiry(created.id, salesUser);
    assert.equal(submitted.status, 'SUBMITTED');
    const revised = await createInquiryRevision(created.id, salesUser);
    assert.equal(revised.versionNo, 2);
    assert.equal(revised.status, 'DRAFT');
    const prior = await getInquiryById(created.id);
    assert.equal(prior?.isCurrent, false);
    assert.equal(prior?.status, 'SUBMITTED');
  });

  it('cancels inquiry and strips internal-only fields from customer projection', async () => {
    const created = await createInquiry({ customerName: 'ELAND Cables' }, customer);
    await addInquiryLine(
      created.id,
      { cableDescription: 'Cost line', requestedQuantity: 1, requestedLengthMeters: 100, materialNumber: 'X' },
      customer
    );
    const cancelled = await cancelInquiry(created.id, customer);
    assert.equal(cancelled.status, 'CANCELLED');
    const projected = projectInquiryForActor(cancelled, customer);
    const line = projected.lines?.[0] as Record<string, unknown> | undefined;
    assert.ok(line);
    assert.equal('costingReadinessStatus' in line, false);
    assert.equal('materialCost' in line, false);
    assert.equal('materialCostCurrency' in line, false);
    const meta = (projected.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal('incotermChargeStatus' in meta, false);
    assert.equal('incotermChargeNote' in meta, false);
    assert.equal('extensionLayers' in meta, false);
  });

  it('submit snapshots published copper and aluminium when the header is empty', async () => {
    const { getPublishedCableMetalQuotes } = await import('./marketMetalPriceDefaultRepository');
    const published = await getPublishedCableMetalQuotes();
    const created = await createInquiry({ customerName: 'Energya Client' }, salesUser);
    await clearInquiryHeaderMetalRates(created.id);
    await addInquiryLine(
      created.id,
      { cableDescription: 'Metal rate gate', requestedQuantity: 1, requestedLengthMeters: 100 },
      salesUser
    );
    const metalBlocked = (err: Error & { codes?: string[] }) =>
      Array.isArray(err.codes) &&
      err.codes.includes('COPPER_PRICE_REQUIRED') &&
      err.codes.includes('ALUMINIUM_PRICE_REQUIRED');

    if (published.copper && published.aluminium) {
      await assert.rejects(() => submitInquiry(created.id, salesUser), (err: Error & { codes?: string[] }) => {
        return !metalBlocked(err);
      });
      const after = await getInquiryById(created.id);
      const meta = (after?.commercialMetadata || {}) as Record<string, unknown>;
      assert.equal(Number(meta.copperPriceRate), Number(published.copper.cashAsk));
      assert.equal(Number(meta.aluminiumPriceRate), Number(published.aluminium.cashAsk));
      assert.equal(meta.copperPriceUom, 'MT');
      assert.equal(meta.aluminiumPriceUom, 'MT');
    } else {
      await assert.rejects(() => submitInquiry(created.id, salesUser), metalBlocked);
    }

    await clearInquiryHeaderMetalRates(created.id);
    await updateInquiry(created.id, { commercialMetadata: { copperPriceRate: 9500 } }, salesUser);
    await assert.rejects(() => submitInquiry(created.id, salesUser), (err: Error & { codes?: string[] }) => {
      if (!published.aluminium) {
        return Array.isArray(err.codes) && err.codes.includes('ALUMINIUM_PRICE_REQUIRED') && !err.codes.includes('COPPER_PRICE_REQUIRED');
      }
      return !Array.isArray(err.codes) || !err.codes.includes('COPPER_PRICE_REQUIRED');
    });
    const kept = await getInquiryById(created.id);
    const keptMeta = (kept?.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(Number(keptMeta.copperPriceRate), 9500);
    if (published.aluminium) {
      assert.equal(Number(keptMeta.aluminiumPriceRate), Number(published.aluminium.cashAsk));
    }
  });

  it('customer create stamps scoped Customer Master name and ignores leftover client customerName', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const eland = await prisma.customer.findUnique({ where: { code: 'C-ELAND' }, select: { id: true, name: true } });
    assert.ok(eland);
    const created = await createInquiry(
      { customerId: 'not-in-scope', customerName: 'Cable selection recovery' },
      customer
    );
    assert.equal(created.customerMasterId, eland.id);
    assert.equal(created.customerName, eland.name);
    assert.notEqual(created.customerName, 'Cable selection recovery');
    assert.notEqual(created.customerId, 'not-in-scope');
  });

  it('clears and replaces the inquiry-line cable without deleting Cable Master', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const master = await prisma.cableMaster.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, materialNumber: true },
    });
    assert.ok(master, 'An ACTIVE Cable Master row is required for this regression.');
    const created = await createInquiry({ customerName: 'Cable selection recovery' }, customer);
    const line = await addInquiryLine(
      created.id,
      {
        materialNumber: master.materialNumber,
        cableDescription: 'Selected cable',
        requestedQuantity: 1,
        requestedLengthMeters: 100,
      },
      customer
    );
    assert.equal(line.materialNumber, master.materialNumber);

    const cleared = await updateInquiryLine(created.id, line.id, { materialNumber: null }, customer);
    assert.equal(cleared.materialNumber, null);
    assert.equal(cleared.v2CurrentSnapshotId, null);
    assert.equal(cleared.v2CurrentCuttingPlanId, null);
    assert.equal(cleared.v2CurrentDrumPlanId, null);

    const afterClear = await prisma.cableMaster.findUnique({ where: { id: master.id } });
    assert.ok(afterClear);
    assert.equal(afterClear.materialNumber, master.materialNumber);

    const replaced = await updateInquiryLine(
      created.id,
      line.id,
      { materialNumber: master.materialNumber, cableDescription: 'Replaced cable' },
      customer
    );
    assert.equal(replaced.materialNumber, master.materialNumber);
    assert.equal(replaced.cableDescription, 'Replaced cable');

    const afterReplace = await prisma.cableMaster.findUnique({ where: { id: master.id } });
    assert.ok(afterReplace);
    assert.equal(afterReplace.id, master.id);
  });
});
