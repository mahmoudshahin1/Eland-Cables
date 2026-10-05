import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor, RequestActor } from './auth';
import { assertCanProcessTechnicalOffice, assertCanWriteCableMaster } from './rbac';
import { evaluateCableAuthority } from '../domain/cableAuthority';
import { toCanonicalTcrStatus } from '../domain/tcrStatus';
import { resolveCustomerScope } from './customerScope';
import {
  createTechnicalOfficeRequest,
  evaluatePersistedCable,
  listCompatibility,
  listTechnicalOfficeRequests,
  PersistenceUnavailableError,
  searchCables,
} from './masterDataRepository';

export const cableAuthorityRouter = Router();
export const technicalOfficeRouter = Router();

function sendDomain(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof PersistenceUnavailableError) {
    return res.status(503).json({ error: 'Cable Master is temporarily unavailable.', code: 'DATA_REQUIRED' });
  }
  if (err instanceof DomainError) {
    return res.status(err.code === 'UNAUTHORIZED' ? 403 : 400).json({ error: err.message, code: err.code, details: err.details });
  }
  return res.status(500).json({ error: 'A Cable Master request failed.', code: 'VALIDATION_FAILED' });
}

cableAuthorityRouter.get('/search', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    let customerCode = typeof req.query.customerCode === 'string' ? req.query.customerCode : undefined;
    if (actor.userType === 'customer' && actor.id) {
      const scope = await resolveCustomerScope(actor);
      customerCode = scope.primaryCode || actor.customerCode || customerCode;
    }
    const result = await searchCables({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      customerCode,
      itemCode: typeof req.query.itemCode === 'string' ? req.query.itemCode : undefined,
      materialNumber: typeof req.query.materialNumber === 'string' ? req.query.materialNumber : undefined,
      family: typeof req.query.family === 'string' ? req.query.family : undefined,
      voltage: typeof req.query.voltage === 'string' ? req.query.voltage : undefined,
      conductor: typeof req.query.conductor === 'string' ? req.query.conductor : undefined,
      cores: typeof req.query.cores === 'string' ? req.query.cores : undefined,
      diameter: typeof req.query.diameter === 'string' ? req.query.diameter : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 25,
    });
    res.json({
      ...result,
      customerScopeApplied: actor.userType === 'customer' ? customerCode || null : null,
    });
  } catch (err) {
    sendDomain(res, err);
  }
});

cableAuthorityRouter.get('/compatibility', async (_req, res) => {
  try {
    res.json({ rules: await listCompatibility() });
  } catch (err) {
    sendDomain(res, err);
  }
});

cableAuthorityRouter.post('/evaluate', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    const body = req.body?.config || req.body || {};
    const config = { ...body };
    if (actor.userType === 'customer' && actor.id) {
      const scope = await resolveCustomerScope(actor);
      config.customerCode = scope.primaryCode || actor.customerCode || config.customerCode;
    } else if (actor.userType === 'customer') {
      delete config.customerCode;
    }
    const decision = await evaluatePersistedCable(config);
    res.json({
      decision,
      evaluationMode: actor.id ? (actor.userType === 'customer' ? 'CUSTOMER_SCOPED' : 'AUTHENTICATED') : 'PUBLIC',
      customerScopeApplied:
        actor.userType === 'customer' ? config.customerCode || null : null,
    });
  } catch (err) {
    sendDomain(res, err);
  }
});

technicalOfficeRouter.post('/requests', async (req, res) => {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email) {
    return res.status(401).json({ error: 'Sign in is required to submit a Technical Office request.', code: 'UNAUTHORIZED' });
  }
  try {
    const body = req.body || {};
    const requestNumber = String(body.requestNumber || `TCR-${Date.now()}`);
    const displayStatus = String(body.status || 'Submitted');
    const row = await createTechnicalOfficeRequest({
      requestNumber,
      canonicalStatus: toCanonicalTcrStatus(displayStatus),
      displayStatus,
      configuration: body.configuration || {},
      customer: body.customer,
      quantity: body.quantity != null ? String(body.quantity) : undefined,
      cuttingLength: body.cuttingLength != null ? String(body.cuttingLength) : undefined,
      requestedDate: body.requestedDate,
      requesterId: actor.id,
      requesterName: body.requesterName || actor.name,
      requesterEmail: body.requesterEmail || actor.email,
      reason: String(body.reason || 'Technically valid configuration — Cable Master record not found.'),
    });
    res.status(201).json({ request: row });
  } catch (err) {
    sendDomain(res, err);
  }
});

technicalOfficeRouter.get('/requests', async (req, res) => {
  const actor = await resolveRequestActor(req.headers.authorization);
  try {
    assertCanProcessTechnicalOffice(actor);
    res.json({ requests: await listTechnicalOfficeRequests() });
  } catch (err) {
    sendDomain(res, err);
  }
});

export function evaluateOffline(config: Parameters<typeof evaluateCableAuthority>[0], ctx: Parameters<typeof evaluateCableAuthority>[1]) {
  return evaluateCableAuthority(config, ctx);
}

export function enforceCableMasterWrite(actor: RequestActor) {
  assertCanWriteCableMaster(actor);
}
