import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanManageShipmentCost, assertCanViewShipmentCost } from './rbac';
import { assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  createDestinationPort,
  createIncoterm,
  createShippingCostRate,
  getDestinationPort,
  getIncoterm,
  getShippingCostRate,
  listDestinationPorts,
  listIncoterms,
  listShippingCostRates,
  resolveShippingCostRate,
  updateDestinationPort,
  updateIncoterm,
  updateShippingCostRate,
} from './shippingCostRepository';

export const shippingCostRouter = Router();

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

shippingCostRouter.get('/destination-ports', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    const active =
      req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    res.json({ ports: await listDestinationPorts({ active }) });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.post('/destination-ports', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    res.status(201).json(await createDestinationPort(req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.get('/destination-ports/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    res.json(await getDestinationPort(req.params.id));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.patch('/destination-ports/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    res.json(await updateDestinationPort(req.params.id, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.get('/incoterms', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    const active =
      req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    res.json({ incoterms: await listIncoterms({ active }) });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.post('/incoterms', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    res.status(201).json(await createIncoterm(req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.get('/incoterms/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    res.json(await getIncoterm(req.params.id));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.patch('/incoterms/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    res.json(await updateIncoterm(req.params.id, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.get('/shipping-cost-rates', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    const active =
      req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    res.json({
      rates: await listShippingCostRates({
        destinationPortCode: typeof req.query.destinationPortCode === 'string' ? req.query.destinationPortCode : undefined,
        incotermCode: typeof req.query.incotermCode === 'string' ? req.query.incotermCode : undefined,
        containerTypeCode: typeof req.query.containerTypeCode === 'string' ? req.query.containerTypeCode : undefined,
        active,
      }),
    });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.get('/shipping-cost-rates/resolve', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    const result = await resolveShippingCostRate({
      destinationPortCode: req.query.destinationPortCode,
      incotermCode: req.query.incotermCode,
      containerTypeCode: req.query.containerTypeCode,
      asOfDate: req.query.asOfDate,
    });
    res.json(result);
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.post('/shipping-cost-rates', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    res.status(201).json(await createShippingCostRate(req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.get('/shipping-cost-rates/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    res.json(await getShippingCostRate(req.params.id));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shippingCostRouter.patch('/shipping-cost-rates/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    const body = req.body || {};
    if (
      body.rateAmount !== undefined ||
      body.currencyCode !== undefined ||
      body.destinationPortCode !== undefined ||
      body.incotermCode !== undefined ||
      body.containerTypeCode !== undefined ||
      body.effectiveFrom !== undefined
    ) {
      res.status(400).json({
        error: 'Rate amount, currency, grain, and effectiveFrom cannot be changed. Close the period and create a new rate.',
        code: 'VALIDATION_FAILED',
        details: { issueCode: 'RATE_AMOUNT_IMMUTABLE' },
      });
      return;
    }
    res.json(await updateShippingCostRate(req.params.id, body, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});
