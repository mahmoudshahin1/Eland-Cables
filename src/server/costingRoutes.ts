import { Router } from 'express';
import { CostingRunStatus } from '@prisma/client';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanCalculateCosting, assertCanRunV2Costing } from './rbac';
import {
  executeCostingRun,
  getCostingRunById,
  listCostingRuns,
  recalculateCostingRun,
} from './costingRepository';
import { evaluateCableCostingReadiness } from './governanceRepository';

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

async function requireCostingAuth(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required to perform costing actions.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanCalculateCosting(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

/** Customers must not list or fetch internal CostingRun records. */
async function requireInternalCostingReadAuth(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } }
) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required to view costing runs.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanRunV2Costing(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

export const costingRouter = Router();

costingRouter.get('/readiness/:materialNumber', async (req, res) => {
  try {
    const list = await evaluateCableCostingReadiness(req.params.materialNumber);
    if (!list.length) return res.status(404).json({ error: 'Cable not found.' });
    res.json({ readiness: list[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

costingRouter.get('/', async (req, res) => {
  const actor = await requireInternalCostingReadAuth(req, res);
  if (!actor) return;
  try {
    const materialNumber = typeof req.query.materialNumber === 'string' ? req.query.materialNumber : undefined;
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
    const status = statusRaw && (Object.values(CostingRunStatus) as string[]).includes(statusRaw)
      ? (statusRaw as CostingRunStatus)
      : undefined;
    const isCurrent = req.query.isCurrent !== undefined ? req.query.isCurrent === 'true' : undefined;

    const runs = await listCostingRuns({ materialNumber, status, isCurrent });
    res.json({ costingRuns: runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

costingRouter.get('/:id', async (req, res) => {
  const actor = await requireInternalCostingReadAuth(req, res);
  if (!actor) return;
  try {
    const run = await getCostingRunById(req.params.id);
    if (!run) return res.status(404).json({ error: 'Costing run not found.' });
    res.json({ costingRun: run });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

costingRouter.post('/calculate', async (req, res) => {
  const actor = await requireCostingAuth(req, res);
  if (!actor) return;

  const body = req.body || {};
  if (!body.materialNumber) {
    return res.status(400).json({ error: 'materialNumber is required for costing calculation.' });
  }

  try {
    const result = await executeCostingRun(
      {
        materialNumber: String(body.materialNumber),
        costingDate: body.costingDate,
        quantity: body.quantity != null ? Number(body.quantity) : 1,
        lengthMeters: body.lengthMeters != null ? Number(body.lengthMeters) : 1000,
        currency: body.currency || 'USD',
        comment: body.comment,
      },
      actor
    );

    res.status(201).json({
      costingRun: result,
      calculationId: (result as { calculationId?: string }).calculationId,
      engine: 'INCREMENT_13_ORCHESTRATOR',
      message: 'Manufacturing cost calculated via governed Increment 13 engine.',
    });
  } catch (err: any) {
    if (err.blockingReasons) {
      return res.status(422).json({
        error: err.message,
        code: err.code || 'COSTING_NOT_READY',
        blockingReasons: err.blockingReasons,
      });
    }
    if (err.code === 'CABLE_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

costingRouter.post('/:id/recalculate', async (req, res) => {
  const actor = await requireCostingAuth(req, res);
  if (!actor) return;

  try {
    const result = await recalculateCostingRun(req.params.id, actor);
    res.json({
      costingRun: result,
      message: 'New costing run calculated (historical snapshot preserved).',
    });
  } catch (err: any) {
    if (err.blockingReasons) {
      return res.status(422).json({
        error: err.message,
        code: err.code || 'COSTING_NOT_READY',
        blockingReasons: err.blockingReasons,
      });
    }
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message, code: err.code });
  }
});
