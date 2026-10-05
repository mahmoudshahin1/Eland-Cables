import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanManageShipmentCost, assertCanViewShipmentCost } from './rbac';
import { assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  createCustomerShippingCostRate,
  listCustomerShippingCostHistory,
  listCustomerShippingCostOptions,
  listCustomerShippingCostRates,
  rejectInPlaceShippingCostEdit,
  resolveCustomerShippingCostRate,
} from './customerShippingCostRepository';

export const customerShippingCostRouter = Router();

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

customerShippingCostRouter.get('/customer-shipping-cost-rates/options', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    res.json(await listCustomerShippingCostOptions());
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

customerShippingCostRouter.get('/customer-shipping-cost-rates/history', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    const customerId = String(req.query.customerId ?? '');
    const deliveryPoint = String(req.query.deliveryPoint ?? '');
    const incotermId = String(req.query.incotermId ?? '');
    const containerType = String(req.query.containerType ?? '');
    res.json({
      versions: await listCustomerShippingCostHistory({ customerId, deliveryPoint, incotermId, containerType }),
    });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

customerShippingCostRouter.get('/customer-shipping-cost-rates/resolve', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    res.json(
      await resolveCustomerShippingCostRate({
        customerId: req.query.customerId,
        deliveryPoint: req.query.deliveryPoint,
        incotermId: req.query.incotermId,
        containerType: req.query.containerType,
        effectiveDate: req.query.effectiveDate,
      })
    );
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

customerShippingCostRouter.get('/customer-shipping-cost-rates', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCost);
  if (!actor) return;
  try {
    const status = req.query.status === 'SUPERSEDED' ? 'SUPERSEDED' : req.query.status === 'ALL' ? undefined : 'ACTIVE';
    res.json({
      rates: await listCustomerShippingCostRates(status ? { status } : undefined),
    });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

customerShippingCostRouter.post('/customer-shipping-cost-rates', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    res.status(201).json(await createCustomerShippingCostRate(req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

customerShippingCostRouter.patch('/customer-shipping-cost-rates/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageShipmentCost);
  if (!actor) return;
  try {
    await rejectInPlaceShippingCostEdit(req.params.id, req.body || {});
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});
