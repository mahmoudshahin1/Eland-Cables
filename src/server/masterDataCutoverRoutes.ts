/**
 * Additive Task 04 cutover routes — mounted beside masterDataRouter.
 * Avoids editing WIP-heavy masterDataRoutes.ts.
 */

import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanImportMasterData, assertCanWriteCableMaster, assertCanViewMasterDataCatalog } from './rbac';
import {
  commitDrumExcel,
  createDrum,
  deactivateOrDeleteDrum,
  getDrum,
  previewDrumExcel,
  updateDrum,
  updateDrumStatus,
} from './drumMasterWriteRepository';
import { PersistenceUnavailableError } from './masterDataRepository';

export const masterDataCutoverRouter = Router();

function pgError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof PersistenceUnavailableError) {
    return res.status(503).json({ error: err.message, code: 'PERSISTENCE_UNAVAILABLE' });
  }
  const code = (err as Error & { code?: string })?.code;
  if (code === 'DUPLICATE_DRUM_CODE' || code === 'VALIDATION' || code === 'INVALID_TEMPLATE_HEADERS') {
    return res.status(400).json({
      error: (err as Error).message,
      code,
      missing: (err as Error & { missing?: string[] }).missing,
    });
  }
  console.error(err);
  return res.status(500).json({ error: 'Master data operation failed.' });
}

async function requireCableWrite(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } }
) {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required to change Drum Master.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanWriteCableMaster(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireMasterRead(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } }
) {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanViewMasterDataCatalog(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      const status = /sign in/i.test(err.message) ? 401 : 403;
      res.status(status).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireImportWrite(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } }
) {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required to import Drum Master.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanImportMasterData(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

masterDataCutoverRouter.get('/sot-status', async (req, res) => {
  const actor = await requireMasterRead(req, res);
  if (!actor) return;
  const {
    MASTER_DATA_KEY_CLASSIFICATION,
    MASTER_DATA_SOT_STATUS,
    MASTER_DATA_CUTOVER_MATRIX,
    MASTER_DATA_CUTOVER_FRAMEWORK,
    MASTER_DATA_CUTOVER_GATE_DEFINITIONS,
    MASTER_DATA_CUTOVER_ORDER,
  } = await import('../platform/masterDataSoT');
  res.json({
    entities: MASTER_DATA_SOT_STATUS,
    keyClassification: MASTER_DATA_KEY_CLASSIFICATION,
    cutoverMatrix: MASTER_DATA_CUTOVER_MATRIX,
    cutoverGates: MASTER_DATA_CUTOVER_GATE_DEFINITIONS,
    cutoverOrder: MASTER_DATA_CUTOVER_ORDER,
    framework: MASTER_DATA_CUTOVER_FRAMEWORK,
    policy: MASTER_DATA_CUTOVER_FRAMEWORK.policy,
    task: '04B-1',
  });
});

masterDataCutoverRouter.post('/drums/excel-preview', async (req, res) => {
  const actor = await requireImportWrite(req, res);
  if (!actor) return;
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows[] is required.', code: 'VALIDATION' });
  }
  try {
    const preview = await previewDrumExcel(rows);
    res.json({ preview, wrote: false });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataCutoverRouter.post('/drums/excel-commit', async (req, res) => {
  const actor = await requireImportWrite(req, res);
  if (!actor) return;
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows[] is required.', code: 'VALIDATION' });
  }
  try {
    const result = await commitDrumExcel(rows, actor, req.body?.sourceFile);
    res.json({
      committed: true,
      postgresql: true,
      ...result,
    });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataCutoverRouter.delete('/drums/:drumCode', async (req, res) => {
  const actor = await requireCableWrite(req, res);
  if (!actor) return;
  try {
    const result = await deactivateOrDeleteDrum(req.params.drumCode, actor);
    if (!result) return res.status(404).json({ error: 'Drum not found.' });
    res.json(result);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataCutoverRouter.get('/drums/:drumCode', async (req, res) => {
  const actor = await requireMasterRead(req, res);
  if (!actor) return;
  try {
    const drum = await getDrum(req.params.drumCode);
    if (!drum) return res.status(404).json({ error: 'Drum not found.' });
    res.json({ drum });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataCutoverRouter.post('/drums', async (req, res) => {
  const actor = await requireCableWrite(req, res);
  if (!actor) return;
  const body = req.body || {};
  if (!body.drumCode) {
    return res.status(400).json({ error: 'drumCode is required.' });
  }
  for (const field of ['flange', 'barrel', 'innerWidth', 'outerWidth', 'capacity'] as const) {
    if (body[field] == null || Number(body[field]) <= 0) {
      return res.status(400).json({ error: `${field} is required and must be greater than zero.` });
    }
  }
  try {
    const drum = await createDrum(
      {
        id: `drm-${body.drumCode}`,
        drumCode: String(body.drumCode),
        drumType: body.drumType,
        description: body.description,
        flange: Number(body.flange),
        barrel: Number(body.barrel),
        innerWidth: Number(body.innerWidth),
        outerWidth: Number(body.outerWidth),
        capacity: Number(body.capacity),
        clearanceMm: body.clearanceMm != null ? Number(body.clearanceMm) : null,
        maxWeight: body.maxWeight != null ? Number(body.maxWeight) : null,
        emptyDrumNetWeightKg:
          body.emptyDrumNetWeightKg != null ? Number(body.emptyDrumNetWeightKg) : null,
        dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
        capacityUom: 'CONFIGURATION_REQUIRED',
        status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      actor
    );
    res.status(201).json({ drum });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataCutoverRouter.put('/drums/:drumCode', async (req, res) => {
  const actor = await requireCableWrite(req, res);
  if (!actor) return;
  const body = req.body || {};
  const hasDimensions =
    body.flange != null ||
    body.barrel != null ||
    body.innerWidth != null ||
    body.outerWidth != null ||
    body.capacity != null ||
    body.clearanceMm != null ||
    body.maxWeight != null ||
    body.emptyDrumNetWeightKg != null ||
    body.description != null ||
    body.drumType != null;
  try {
    if (hasDimensions) {
      const drum = await updateDrum(req.params.drumCode, body, actor);
      if (!drum) return res.status(404).json({ error: 'Drum not found.' });
      return res.json({ drum });
    }
    const status = body.status;
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      return res.status(400).json({ error: 'status must be ACTIVE or INACTIVE when no dimension fields are provided.' });
    }
    const drum = await updateDrumStatus(req.params.drumCode, status, actor);
    if (!drum) return res.status(404).json({ error: 'Drum not found.' });
    res.json({ drum });
  } catch (err) {
    pgError(res, err);
  }
});
