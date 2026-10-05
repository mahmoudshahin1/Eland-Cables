import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanCreateShipmentCostSnapshot, assertCanViewShipmentCostSnapshot } from './rbac';
import { assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  createShipmentCostSnapshot,
  getShipmentCostSnapshot,
  getShipmentCostSnapshotByResult,
} from './shipmentCostSnapshotRepository';

export const shipmentCostSnapshotRouter = Router();

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

shipmentCostSnapshotRouter.post('/shipment-cost-snapshots', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateShipmentCostSnapshot);
  if (!actor) return;
  try {
    const body = req.body || {};
    const result = await createShipmentCostSnapshot(
      {
        containerStudyResultId: body.containerStudyResultId,
        shipmentGroupId: body.shipmentGroupId,
        rateAsOfDate: body.rateAsOfDate,
        containerQuantities: body.containerQuantities,
        customerId: body.customerId,
      },
      actor
    );
    res.status(result.created ? 201 : 200).json(result.snapshot);
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shipmentCostSnapshotRouter.get('/shipment-cost-snapshots/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCostSnapshot);
  if (!actor) return;
  try {
    res.json(await getShipmentCostSnapshot(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

shipmentCostSnapshotRouter.get('/container-study-results/:resultId/shipment-cost-snapshot', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewShipmentCostSnapshot);
  if (!actor) return;
  try {
    res.json(await getShipmentCostSnapshotByResult(req.params.resultId, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});
