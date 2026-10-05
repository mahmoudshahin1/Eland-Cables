import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanManageCostingConfiguration, assertCanViewMasterDataCatalog } from './rbac';
import {
  approveMarketMetalImport,
  correctMarketMetalImportRow,
  createMarketMetalImport,
  getMarketMetalImport,
  listMarketMetalImports,
  publishMarketMetalImport,
} from './marketMetalImportRepository';

export const marketMetalImportRouter = Router();

function handle(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const error = err as Error & { code?: string };
  if (error instanceof DomainError) {
    return res.status(error.code === 'UNAUTHORIZED' ? 401 : 403).json({ error: error.message, code: error.code });
  }
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: error.message, code: error.code });
  if (error.code === 'BUSINESS_RULE_REQUIRED') {
    return res.status(409).json({ error: error.message, code: error.code });
  }
  return res.status(400).json({ error: error.message || 'Request failed.', code: error.code || 'BAD_REQUEST' });
}

marketMetalImportRouter.get('/market-metals/imports', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    assertCanViewMasterDataCatalog(actor);
    res.json({ imports: await listMarketMetalImports() });
  } catch (err) {
    handle(err, res);
  }
});

marketMetalImportRouter.get('/market-metals/imports/:id', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    assertCanViewMasterDataCatalog(actor);
    const batch = await getMarketMetalImport(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Import not found.', code: 'NOT_FOUND' });
    res.json({
      import: {
        ...batch,
        image: undefined,
        hasImage: Boolean(batch.image),
      },
    });
  } catch (err) {
    handle(err, res);
  }
});

marketMetalImportRouter.get('/market-metals/imports/:id/image', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    assertCanViewMasterDataCatalog(actor);
    const batch = await getMarketMetalImport(req.params.id);
    if (!batch?.image) return res.status(404).json({ error: 'No image stored.', code: 'NOT_FOUND' });
    res.setHeader('Content-Type', batch.mimeType || 'application/octet-stream');
    return res.send(batch.image);
  } catch (err) {
    handle(err, res);
  }
});

marketMetalImportRouter.post('/market-metals/imports', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    assertCanManageCostingConfiguration(actor);
    const batch = await createMarketMetalImport(req.body || {}, actor);
    res.status(201).json({
      import: { ...batch, image: undefined, hasImage: Boolean(batch.image) },
    });
  } catch (err) {
    handle(err, res);
  }
});

marketMetalImportRouter.patch('/market-metals/imports/:id/rows/:code', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    assertCanManageCostingConfiguration(actor);
    const row = await correctMarketMetalImportRow(req.params.id, req.params.code, req.body || {});
    res.json({ row });
  } catch (err) {
    handle(err, res);
  }
});

marketMetalImportRouter.post('/market-metals/imports/:id/approve', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    assertCanManageCostingConfiguration(actor);
    const batch = await approveMarketMetalImport(req.params.id, actor);
    res.json({ import: { ...batch, image: undefined } });
  } catch (err) {
    handle(err, res);
  }
});

marketMetalImportRouter.post('/market-metals/imports/:id/publish', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    assertCanManageCostingConfiguration(actor);
    const batch = await publishMarketMetalImport(req.params.id, actor);
    res.json({ import: batch ? { ...batch, image: undefined } : null });
  } catch (err) {
    handle(err, res);
  }
});
