import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanApproveCommercialQuotation, assertCanCreateCustomerCommitment, assertCanManageQuotations, assertCanMutateCommercialFulfillment, assertCanViewCustomerCommitment, assertCanViewCustomerFulfillment } from './rbac';
import { assertCustomerBusinessScope, resolveCustomerScope } from './customerScope';
import {
  approveCommercialQuotation,
  createAgreementRelease,
  createCommitmentFromQuotation,
  createDirectMtsSalesOrder,
  createSalesAgreementFromApprovedQuotation,
  createSalesAgreementFromCommitment,
  createSalesOrderFromApprovedQuotation,
  createSalesOrderFromCommitment,
  getAgreementReleaseById,
  getCommitmentById,
  getSalesAgreementById,
  getSalesOrderById,
  listAgreementReleases,
  listCommitments,
  listSalesAgreements,
  listSalesOrders,
} from './commercialCommitmentRepository';

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

function sendDomainError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof DomainError) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'UNAUTHORIZED' ? 403 : err.code === 'CONFLICT' ? 409 : 422;
    return res.status(status).json({ error: err.message, code: err.code, details: err.details });
  }
  const anyErr = err as { code?: string; message?: string };
  if (anyErr?.code === 'NOT_FOUND') return res.status(404).json({ error: anyErr.message, code: anyErr.code });
  return res.status(500).json({ error: anyErr?.message || 'Unexpected error' });
}

async function requireQuotationManager(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanMutateCommercialFulfillment(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireFulfillmentViewer(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanViewCustomerFulfillment(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireCommitmentActor(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanViewCustomerCommitment(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireCommitmentCreator(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanCreateCustomerCommitment(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireCommercialApprover(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanApproveCommercialQuotation(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function customerListFilter(actor: Awaited<ReturnType<typeof actorFromRequest>>) {
  if (actor.userType !== 'customer') return {};
  const scope = await resolveCustomerScope(actor);
  return { customerIds: scope.matchKeys, customerMasterIds: scope.masterIds };
}

export const commercialCommitmentsRouter = Router();
export const epcSalesOrdersRouter = Router();
export const salesAgreementsRouter = Router();
export const agreementReleasesRouter = Router();

/** Attach commercial-approve to existing quotations router (pricing approve stays separate). */
export function attachCommercialApprovalRoutes(quotationsRouter: Router) {
  quotationsRouter.post('/:id/approve-commercial', async (req, res) => {
    const actor = await requireCommercialApprover(req, res);
    if (!actor) return;
    try {
      const quotation = await approveCommercialQuotation(req.params.id, req.body || {}, actor);
      res.json({
        quotation,
        message: `Quotation commercially approved as ${quotation.fulfillmentType}. Pricing status unchanged.`,
      });
    } catch (err) {
      sendDomainError(res, err);
    }
  });

  quotationsRouter.post('/:id/commitments', async (req, res) => {
    const actor = await requireCommitmentCreator(req, res);
    if (!actor) return;
    try {
      const commitment = await createCommitmentFromQuotation(req.params.id, actor);
      res.status(201).json({ commitment, message: 'Commercial commitment created from approved quotation.' });
    } catch (err) {
      sendDomainError(res, err);
    }
  });
}

commercialCommitmentsRouter.get('/', async (req, res) => {
  const actor = await requireCommitmentActor(req, res);
  if (!actor) return;
  try {
    const scope = await customerListFilter(actor);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const inquiryId = typeof req.query.inquiryId === 'string' ? req.query.inquiryId : undefined;
    const commitments = await listCommitments(actor, { ...scope, status, inquiryId });
    res.json({ commitments });
  } catch (err) {
    sendDomainError(res, err);
  }
});

commercialCommitmentsRouter.post('/', async (req, res) => {
  const actor = await requireCommitmentCreator(req, res);
  if (!actor) return;
  try {
    const quotationId = String(req.body?.quotationId || req.body?.quotationRevisionId || '');
    if (!quotationId) {
      res.status(422).json({ error: 'quotationId is required.', code: 'VALIDATION_FAILED' });
      return;
    }
    const fulfillmentType = req.body?.fulfillmentType as 'DIRECT_ORDER' | 'SALES_AGREEMENT' | undefined;
    const commitment = await createCommitmentFromQuotation(quotationId, actor, { fulfillmentType });
    res.status(201).json({ commitment, message: 'Commercial commitment created from approved quotation.' });
  } catch (err) {
    sendDomainError(res, err);
  }
});

commercialCommitmentsRouter.get('/:id', async (req, res) => {
  const actor = await requireCommitmentActor(req, res);
  if (!actor) return;
  try {
    const commitment = await getCommitmentById(req.params.id, actor);
    res.json({ commitment });
  } catch (err) {
    sendDomainError(res, err);
  }
});

commercialCommitmentsRouter.post('/:id/sales-orders', async (req, res) => {
  const actor = await requireQuotationManager(req, res);
  if (!actor) return;
  try {
    const salesOrder = await createSalesOrderFromCommitment(req.params.id, req.body || {}, actor);
    res.status(201).json({
      salesOrder,
      message: 'EPC sales order created. D365 sync remains NOT_SENT / NOT_IMPLEMENTED.',
    });
  } catch (err) {
    sendDomainError(res, err);
  }
});

commercialCommitmentsRouter.post('/:id/sales-agreements', async (req, res) => {
  const actor = await requireQuotationManager(req, res);
  if (!actor) return;
  try {
    const agreement = await createSalesAgreementFromCommitment(req.params.id, req.body || {}, actor);
    res.status(201).json({
      agreement,
      message: 'Sales agreement created. D365 sync remains NOT_SENT / NOT_IMPLEMENTED.',
    });
  } catch (err) {
    sendDomainError(res, err);
  }
});

epcSalesOrdersRouter.get('/', async (req, res) => {
  const actor = await requireFulfillmentViewer(req, res);
  if (!actor) return;
  try {
    const scope = await customerListFilter(actor);
    const commitmentId = typeof req.query.commitmentId === 'string' ? req.query.commitmentId : undefined;
    const salesOrders = await listSalesOrders(actor, { ...scope, commitmentId });
    res.json({ salesOrders });
  } catch (err) {
    sendDomainError(res, err);
  }
});

epcSalesOrdersRouter.post('/from-quotation/:quotationRevisionId', async (req, res) => {
  const actor = await requireQuotationManager(req, res);
  if (!actor) return;
  try {
    const salesOrder = await createSalesOrderFromApprovedQuotation(
      req.params.quotationRevisionId,
      req.body || {},
      actor
    );
    res.status(201).json({
      salesOrder,
      message: 'EPC sales order created from approved quotation. D365 sync remains NOT_SENT / NOT_IMPLEMENTED.',
    });
  } catch (err) {
    sendDomainError(res, err);
  }
});

/** Direct MTS — no quotation / Commercial Commitment. Cable must be MTS-eligible. */
epcSalesOrdersRouter.post('/direct-mts', async (req, res) => {
  const actor = await requireQuotationManager(req, res);
  if (!actor) return;
  try {
    const salesOrder = await createDirectMtsSalesOrder(req.body || {}, actor);
    res.status(201).json({
      salesOrder,
      message:
        'Direct MTS EPC sales order created (no Commercial Commitment). D365 sync remains NOT_SENT / NOT_IMPLEMENTED.',
    });
  } catch (err) {
    sendDomainError(res, err);
  }
});

epcSalesOrdersRouter.get('/:id', async (req, res) => {
  const actor = await requireFulfillmentViewer(req, res);
  if (!actor) return;
  try {
    const salesOrder = await getSalesOrderById(req.params.id, actor);
    res.json({ salesOrder });
  } catch (err) {
    sendDomainError(res, err);
  }
});

salesAgreementsRouter.get('/', async (req, res) => {
  const actor = await requireFulfillmentViewer(req, res);
  if (!actor) return;
  try {
    const scope = await customerListFilter(actor);
    const commitmentId = typeof req.query.commitmentId === 'string' ? req.query.commitmentId : undefined;
    const agreements = await listSalesAgreements(actor, { ...scope, commitmentId });
    res.json({ agreements });
  } catch (err) {
    sendDomainError(res, err);
  }
});

salesAgreementsRouter.post('/from-quotation/:quotationRevisionId', async (req, res) => {
  const actor = await requireQuotationManager(req, res);
  if (!actor) return;
  try {
    const agreement = await createSalesAgreementFromApprovedQuotation(
      req.params.quotationRevisionId,
      req.body || {},
      actor
    );
    res.status(201).json({
      agreement,
      message: 'Sales agreement created from approved quotation. D365 sync remains NOT_SENT / NOT_IMPLEMENTED.',
    });
  } catch (err) {
    sendDomainError(res, err);
  }
});

salesAgreementsRouter.get('/:id', async (req, res) => {
  const actor = await requireFulfillmentViewer(req, res);
  if (!actor) return;
  try {
    const agreement = await getSalesAgreementById(req.params.id, actor);
    res.json({ agreement });
  } catch (err) {
    sendDomainError(res, err);
  }
});

salesAgreementsRouter.get('/:id/releases', async (req, res) => {
  const actor = await requireFulfillmentViewer(req, res);
  if (!actor) return;
  try {
    const releases = await listAgreementReleases(req.params.id, actor);
    res.json({ releases });
  } catch (err) {
    sendDomainError(res, err);
  }
});

salesAgreementsRouter.post('/:id/releases', async (req, res) => {
  const actor = await requireQuotationManager(req, res);
  if (!actor) return;
  try {
    const result = await createAgreementRelease(req.params.id, req.body || {}, actor);
    res.status(201).json({
      release: result.release,
      salesOrder: result.salesOrder,
      message: 'Agreement release created EPC sales order. D365 sync remains NOT_SENT / NOT_IMPLEMENTED.',
    });
  } catch (err) {
    sendDomainError(res, err);
  }
});

agreementReleasesRouter.get('/:id', async (req, res) => {
  const actor = await requireFulfillmentViewer(req, res);
  if (!actor) return;
  try {
    const release = await getAgreementReleaseById(req.params.id, actor);
    res.json({ release });
  } catch (err) {
    sendDomainError(res, err);
  }
});
