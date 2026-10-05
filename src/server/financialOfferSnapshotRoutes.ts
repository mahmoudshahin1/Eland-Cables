import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import {
  assertCanCreateFinancialOfferSnapshot,
  assertCanViewCustomerContainerStudy,
  assertCanViewCustomerFinancialOffer,
  assertCanViewFinancialOfferSnapshot,
} from './rbac';
import { assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  createFinancialOfferSnapshot,
  getCurrentCustomerFinancialOfferSnapshot,
  getCurrentFinancialOfferSnapshot,
  getCustomerContainerStudyVisibility,
  getCustomerFinancialOfferSnapshot,
  getFinancialOfferSnapshot,
} from './financialOfferSnapshotRepository';

export const financialOfferSnapshotRouter = Router();

function sendDomainError(
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  err: unknown
): boolean {
  if (!(err instanceof DomainError)) return false;
  const status =
    err.code === 'UNAUTHORIZED' ? 401 : err.code === 'NOT_FOUND' ? 404 : err.code === 'CONFLICT' ? 409 : 400;
  res.status(status).json({ error: err.message, code: err.code, details: err.details });
  return true;
}

async function requireActor(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  assertFn: (actor: Awaited<ReturnType<typeof resolveRequestActor>>) => void
) {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertFn(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'CONFIGURATION_REQUIRED') {
      await auditAmbiguousCustomerScope(actor);
    }
    if (sendDomainError(res, err)) return null;
    throw err;
  }
  return actor;
}

financialOfferSnapshotRouter.post('/financial-offer-snapshots', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateFinancialOfferSnapshot);
  if (!actor) return;
  try {
    const body = req.body || {};
    const result = await createFinancialOfferSnapshot(
      {
        inquiryId: body.inquiryId,
        commercialPricingSnapshotIds: body.commercialPricingSnapshotIds,
        shipmentCostSnapshotIds: body.shipmentCostSnapshotIds,
        customerId: body.customerId,
      },
      actor
    );
    res.status(result.created ? 201 : 200).json(result.snapshot);
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

financialOfferSnapshotRouter.get('/financial-offer-snapshots/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewFinancialOfferSnapshot);
  if (!actor) return;
  try {
    res.json(await getFinancialOfferSnapshot(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

financialOfferSnapshotRouter.get('/inquiries/:inquiryId/financial-offer-snapshot', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewFinancialOfferSnapshot);
  if (!actor) return;
  try {
    res.json(await getCurrentFinancialOfferSnapshot(req.params.inquiryId, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

financialOfferSnapshotRouter.get('/customer-financial-offers/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewCustomerFinancialOffer);
  if (!actor) return;
  try {
    res.json(await getCustomerFinancialOfferSnapshot(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

financialOfferSnapshotRouter.get('/inquiries/:inquiryId/customer-financial-offer', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewCustomerFinancialOffer);
  if (!actor) return;
  try {
    res.json(await getCurrentCustomerFinancialOfferSnapshot(req.params.inquiryId, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

financialOfferSnapshotRouter.get('/inquiries/:inquiryId/customer-container-study', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewCustomerContainerStudy);
  if (!actor) return;
  try {
    res.json(await getCustomerContainerStudyVisibility(req.params.inquiryId, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});
