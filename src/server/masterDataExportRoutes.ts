import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCanExportMasterData } from './rbac';
import { exportMasterDataExcel, type MasterExportEntity } from './masterDataExportService';
import { sendExcelResponse } from './excelWorkbook';

export const masterDataExportRouter = Router();

const ENTITIES = new Set<MasterExportEntity>([
  'customers',
  'drums',
  'cables',
  'cable-boms',
  'raw-materials',
  'raw-material-prices',
  'destination-ports',
  'incoterms',
  'payment-terms',
  'payment-methods',
  'classifications',
  'segments',
]);

function sendErr(res: any, err: any) {
  if (err instanceof DomainError) {
    const status = /sign in/i.test(err.message) ? 401 : (err as { http?: number }).http || (err.code === 'UNAUTHORIZED' ? 403 : 400);
    return res.status(status).json({ error: err.message, code: err.code });
  }
  const status = err.http || (err.code === 'NOT_FOUND' ? 404 : err.code === 'UNAUTHORIZED' ? 403 : 400);
  return res.status(status).json({ error: err.message, code: err.code || 'ERROR' });
}

masterDataExportRouter.get('/export/:entity', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    const entity = String(req.params.entity || '') as MasterExportEntity;
    if (!ENTITIES.has(entity)) {
      return res.status(400).json({ error: `Unknown export entity: ${entity}`, code: 'VALIDATION_FAILED' });
    }
    assertCanExportMasterData(actor, entity);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const exported = await exportMasterDataExcel(actor, entity, { q, status, type });
    sendExcelResponse(res, exported.filename, exported.buffer);
  } catch (err) {
    sendErr(res, err);
  }
});
