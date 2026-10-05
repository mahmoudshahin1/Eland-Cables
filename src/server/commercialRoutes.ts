import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { listApprovedShipmentMasters } from './shippingCostRepository';
import { exportInquiryExcel } from './inquiryExportService';
import { sendExcelResponse } from './excelWorkbook';
import {
  assertCanAccessInquiryOwnership,
  assertCanCalculateInquiryCost,
  assertCanManageInquiry,
  assertCanManageQuotations,
  assertCanExportInquiry,
} from './rbac';
import {
  addInquiryLine,
  addInquiryAttachment,
  cancelInquiry,
  calculateInquiryCost,
  calculateInquiryLineCost,
  createInquiry,
  createInquiryRevision,
  createQuotationFromInquiry,
  createQuotationRevision,
  deleteInquiryLine,
  deleteInquiryAttachment,
  duplicateInquiryLine,
  getInquiryAttachmentContent,
  getInquiryById,
  getInquiryLineCosting,
  getQuotationById,
  getQuotationCosting,
  listInquiries,
  listInquiryActivity,
  listInquiryAttachments,
  listInquiryVersions,
  listQuotations,
  reorderInquiryLines,
  submitInquiry,
  updateInquiry,
  updateInquiryLine,
  confirmInquiryDrumSchedule,
} from './commercialRepository';
import { listPlatformFieldDefinitions } from './platformConfigurationRepository';
import {
  inquiryManifestAsMetadata,
  mergeFieldMetadata,
  projectMetadataForActor,
  toPlatformMergeInput,
} from '../platform/metadata/metadataService';
import { projectInquiryForActor, projectInquiryListForActor, projectLineCostingForActor } from './commercialProjection';
import { resolveCustomerScope, assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  deleteInquiryLineAttachment,
  getInquiryLineAttachmentContent,
  listInquiryLineAttachments,
  upsertInquiryLineAttachment,
} from './attachmentRepository';

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

async function requireInquiryAuth(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanManageInquiry(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === 'CONFIGURATION_REQUIRED') {
        await auditAmbiguousCustomerScope(actor);
        res.status(403).json({ error: err.message, code: err.code });
        return null;
      }
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireQuotationAuth(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanManageQuotations(actor);
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

function parseListQuery(req: { query: Record<string, unknown> }) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 25;
  const sortBy =
    typeof req.query.sortBy === 'string'
      ? (req.query.sortBy as 'inquiryDate' | 'updatedAt' | 'customerName' | 'status')
      : 'updatedAt';
  const sortDir: 'asc' | 'desc' = req.query.sortDir === 'asc' ? 'asc' : 'desc';
  const isCurrent = req.query.isCurrent === 'false' ? false : true;
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
  return { status, q, page, pageSize, sortBy, sortDir, isCurrent, dateFrom, dateTo };
}

const COSTING_UNPROCESSABLE = new Set([
  'NOT_READY',
  'COSTING_NOT_READY',
  'BOM_NOT_READY',
  'PRICE_NOT_CONFIGURED',
  'ENGINEERING_NOT_APPROVED',
  'BOM_CONFLICT_UNRESOLVED',
  'RAW_MATERIAL_NOT_FOUND',
  'PRICE_EXPIRED',
  'PRICE_UOM_MISMATCH',
  'PRICE_UOM_INCOMPATIBLE',
  'PRICE_UOM_REQUIRED',
  'PRICE_CURRENCY_MISMATCH',
  'FX_NOT_CONFIGURED',
  'INQUIRY_COPPER_PRICE_REQUIRED',
  'INQUIRY_ALUMINIUM_PRICE_REQUIRED',
  'INQUIRY_METAL_UOM_INVALID',
  'DRUM_CONFIGURATION_REQUIRED',
  'INVALID_REQUEST_INPUTS',
]);

export const inquiriesRouter = Router();
export const quotationsRouter = Router();

inquiriesRouter.get('/', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    const query = parseListQuery(req);
    if (actor.userType === 'customer') {
      const scope = await resolveCustomerScope(actor);
      const result = await listInquiries({
        customerIds: scope.matchKeys,
        customerMasterIds: scope.masterIds,
        ...query,
      });
      res.json({
        ...result,
        inquiries: projectInquiryListForActor(result.inquiries, actor),
      });
      return;
    }
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const result = await listInquiries({ customerId, ...query });
    res.json({
      ...result,
      inquiries: projectInquiryListForActor(result.inquiries, actor),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

inquiriesRouter.get('/meta/field-definitions', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const [header, line] = await Promise.all([
      listPlatformFieldDefinitions('INQUIRY'),
      listPlatformFieldDefinitions('INQUIRY_LINE'),
    ]);
    const merged = projectMetadataForActor(
      mergeFieldMetadata(inquiryManifestAsMetadata(), toPlatformMergeInput([...header, ...line])),
      actor
    );
    const overlay = merged.filter(
      (f) => f.entityCode === 'INQUIRY' || f.entityCode === 'INQUIRY_LINE'
    );
    res.json({
      fields: overlay.map((f) => ({
        entityCode: f.entityCode,
        fieldCode: f.fieldCode,
        label: f.label,
        visible: f.visible,
        required: f.required,
        customerVisible: f.customerVisible,
        displayOrder: f.displayOrder,
        readOnly: f.readOnly,
        section: f.section,
        tab: f.tab,
        dataType: f.dataType,
        defaultValue: f.defaultValue,
        helpText: f.helpText,
        lookupEntity: f.lookupEntity,
        source: f.source,
      })),
      source: overlay.some((f) => f.source === 'PLATFORM_FIELD_DEFINITION')
        ? 'PlatformFieldDefinition'
        : 'CODE_MANIFEST',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

inquiriesRouter.get('/:id/versions', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const versions = await listInquiryVersions(req.params.id, actor);
    res.json({ versions: projectInquiryListForActor(versions, actor) });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message });
  }
});

inquiriesRouter.get('/:id', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    const inquiry = await getInquiryById(req.params.id);
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });

    try {
      assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
    } catch (err) {
      if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    }

    let shipmentMasters = {
      destinationPorts: [] as Array<{ code: string; name: string }>,
      incoterms: [] as Array<{ code: string; name: string }>,
      combinations: [] as Array<{
        countryCode: string;
        countryLabel: string;
        incotermCode: string;
        destinationPortCode: string;
        destinationPortName: string;
      }>,
    };
    try {
      shipmentMasters = await listApprovedShipmentMasters(inquiry.customerMasterId);
    } catch {
      shipmentMasters = { destinationPorts: [], incoterms: [], combinations: [] };
    }
    res.json({ inquiry: projectInquiryForActor(inquiry, actor), shipmentMasters });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

inquiriesRouter.get('/:id/export', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanExportInquiry(actor);
    const exported = await exportInquiryExcel(req.params.id, actor);
    sendExcelResponse(res, exported.filename, exported.buffer);
  } catch (err: any) {
    if (err instanceof DomainError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'UNAUTHORIZED' ? 403 : 400;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message });
  }
});

inquiriesRouter.post('/', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    const inquiry = await createInquiry(req.body || {}, actor);
    res.status(201).json({
      inquiry: projectInquiryForActor(inquiry, actor),
      message: 'Commercial inquiry created successfully.',
    });
  } catch (err: any) {
    if (err instanceof DomainError) {
      const status = err.code === 'UNAUTHORIZED' || err.code === 'CONFIGURATION_REQUIRED' ? 403 : 400;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

inquiriesRouter.patch('/:id', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const inquiry = await updateInquiry(req.params.id, req.body || {}, actor);
    res.json({ inquiry: projectInquiryForActor(inquiry, actor), message: 'Inquiry updated successfully.' });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/lines', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    const line = await addInquiryLine(req.params.id, req.body || {}, actor);
    const inquiry = await getInquiryById(req.params.id);
    res.status(201).json({
      line: projectInquiryForActor({ lines: [line] }, actor).lines?.[0] || line,
      inquiry: inquiry ? projectInquiryForActor(inquiry, actor) : undefined,
      message: 'Inquiry line added successfully.',
    });
  } catch (err: any) {
    if (err.code === 'INVALID_CONFIGURATION') {
      return res.status(422).json({ error: err.message, decision: err.decision, code: err.code });
    }
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/lines/reorder', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const lineIds = Array.isArray(req.body?.lineIds) ? req.body.lineIds : [];
    const inquiry = await reorderInquiryLines(req.params.id, lineIds, actor);
    res.json({ inquiry: inquiry ? projectInquiryForActor(inquiry, actor) : null });
  } catch (err: any) {
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.patch('/:id/lines/:lineId', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const line = await updateInquiryLine(req.params.id, req.params.lineId, req.body || {}, actor);
    res.json({ line, message: 'Inquiry line updated successfully.' });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/lines/:lineId/drum-schedule/confirm', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await confirmInquiryDrumSchedule(req.params.id, req.params.lineId, req.body || {}, actor);
    res.json({
      line: result.line,
      schedule: result.schedule,
      lifecycleStatus: result.schedule?.lifecycleStatus || 'CONFIRMED',
      message: 'Drum plan confirmed.',
    });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message, code: err.code });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    if (err.code === 'VALIDATION_FAILED') return res.status(422).json({ error: err.message, code: err.code, details: err.details });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.delete('/:id/lines/:lineId', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await deleteInquiryLine(req.params.id, req.params.lineId, actor);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/lines/:lineId/duplicate', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const line = await duplicateInquiryLine(req.params.id, req.params.lineId, actor);
    res.status(201).json({
      line: projectInquiryForActor({ lines: [line] }, actor).lines?.[0] || line,
      message: 'Inquiry line duplicated successfully.',
    });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.get('/:id/lines/:lineId/attachments', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const attachments = await listInquiryLineAttachments(req.params.lineId);
    res.json({ attachments });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/lines/:lineId/attachments', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const attachment = await upsertInquiryLineAttachment(req.params.lineId, req.body || {}, actor);
    res.status(201).json({ attachment });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    if (err.code === 'INVALID_REQUEST_INPUTS') return res.status(400).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.get('/:id/lines/:lineId/attachments/:attachmentId', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const row = await getInquiryLineAttachmentContent(req.params.lineId, req.params.attachmentId);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName.replace(/"/g, '')}"`);
    res.send(row.content);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.delete('/:id/lines/:lineId/attachments/:attachmentId', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await deleteInquiryLineAttachment(req.params.lineId, req.params.attachmentId, actor);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

/** Calculate button: POST /api/inquiries/:id/calculate-cost — loops calculateInquiryLineCost. Express does not hot-reload; restart npm run dev after adding this route. */
inquiriesRouter.post('/:id/calculate-cost', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    assertCanCalculateInquiryCost(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  try {
    const { inquiry, lines } = await calculateInquiryCost(req.params.id, actor);
    res.json({
      inquiry: inquiry ? projectInquiryForActor(inquiry, actor) : undefined,
      lines: lines.map((row) => ({
        ...row,
        result: row.result ? projectLineCostingForActor(row.result, actor) : undefined,
      })),
      message: 'Inquiry costing completed.',
    });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'COSTING_LOCKED') return res.status(409).json({ error: err.message, code: err.code });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/lines/:lineId/calculate-cost', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    assertCanCalculateInquiryCost(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  try {
    const { result, line } = await calculateInquiryLineCost(req.params.id, req.params.lineId, actor);
    const inquiry = await getInquiryById(req.params.id);
    res.json({
      result: projectLineCostingForActor(result, actor),
      line: projectInquiryForActor({ lines: [line] }, actor).lines?.[0] || line,
      inquiry: inquiry ? projectInquiryForActor(inquiry, actor) : undefined,
      message: 'Cost calculated successfully.',
    });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'COSTING_LOCKED') return res.status(409).json({ error: err.message, code: err.code });
    if (COSTING_UNPROCESSABLE.has(err.code)) {
      return res.status(422).json({
        error: err.message,
        code: err.code,
        blockingReasons: err.blockingReasons || [],
        result: err.result ? projectLineCostingForActor(err.result, actor) : undefined,
      });
    }
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.get('/:id/lines/:lineId/costing', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    const costing = await getInquiryLineCosting(req.params.id, req.params.lineId, actor);
    res.json({
      ...costing,
      breakdown: projectLineCostingForActor(costing.breakdown, actor),
      calculation: costing.calculation
        ? {
            ...costing.calculation,
            outputSnapshot: projectLineCostingForActor(costing.calculation.outputSnapshot, actor),
          }
        : null,
    });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.get('/:id/attachments', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const attachments = await listInquiryAttachments(req.params.id, actor);
    res.json({ attachments });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/attachments', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const attachment = await addInquiryAttachment(req.params.id, req.body || {}, actor);
    res.status(201).json({ attachment });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    if (err.code === 'INVALID_REQUEST_INPUTS') return res.status(400).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.get('/:id/attachments/:attachmentId', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const row = await getInquiryAttachmentContent(req.params.id, req.params.attachmentId, actor);
    res.setHeader('Content-Type', row.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName.replace(/"/g, '')}"`);
    res.send(Buffer.from(row.content));
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await deleteInquiryAttachment(req.params.id, req.params.attachmentId, actor);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.get('/:id/activity', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    const events = await listInquiryActivity(req.params.id, actor);
    res.json({ events });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/submit', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;

  try {
    const inquiry = await submitInquiry(req.params.id, actor);
    res.json({ inquiry: projectInquiryForActor(inquiry, actor), message: 'Commercial inquiry submitted successfully.' });
  } catch (err: any) {
    if (err.code === 'EMPTY_INQUIRY') return res.status(400).json({ error: err.message });
    if (
      err.code === 'SNAPSHOT_REQUIRED' ||
      err.code === 'CONFIGURATION_REQUIRED' ||
      err.code === 'INVALID_CONFIGURATION' ||
      err.code === 'INQUIRY_PROCESS_ACTION_DENIED'
    ) {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    if (err.code === 'CALCULATION_REQUIRED') {
      return res.status(422).json({ error: err.message, code: err.code, lineNumbers: err.lineNumbers });
    }
    if (err.code === 'TECHNICAL_OFFER_REQUIRED') {
      return res.status(422).json({ error: err.message, code: err.code, lineNumbers: err.lineNumbers });
    }
    if (
      err.code === 'COPPER_PRICE_REQUIRED' ||
      err.code === 'ALUMINIUM_PRICE_REQUIRED' ||
      err.code === 'METAL_PRICE_REQUIRED'
    ) {
      return res.status(422).json({ error: err.message, code: err.code, codes: err.codes });
    }
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/new-version', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const inquiry = await createInquiryRevision(req.params.id, actor);
    res.status(201).json({
      inquiry: projectInquiryForActor(inquiry, actor),
      message: `Inquiry version V${inquiry.versionNo} created successfully.`,
    });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/cancel', async (req, res) => {
  const actor = await requireInquiryAuth(req, res);
  if (!actor) return;
  try {
    const inquiry = await cancelInquiry(req.params.id, actor);
    res.json({ inquiry: projectInquiryForActor(inquiry, actor), message: 'Inquiry cancelled successfully.' });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

inquiriesRouter.post('/:id/quotation', async (req, res) => {
  const actor = await requireQuotationAuth(req, res);
  if (!actor) return;
  try {
    const quotation = await createQuotationFromInquiry({ inquiryId: req.params.id, ...(req.body || {}) }, actor);
    res.status(201).json({ quotation, message: 'Quotation generated from inquiry successfully.' });
  } catch (err: any) {
    if (err.code === 'EMPTY_INQUIRY') return res.status(400).json({ error: err.message });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    if (err.code === 'CONFIGURATION_REQUIRED' || err.code === 'INVALID_CONFIGURATION') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message, code: err.code });
  }
});

// ==========================================
// QUOTATION ROUTES (/api/quotations)
// ==========================================

quotationsRouter.get('/', async (req, res) => {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    return res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
  }
  try {
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      await auditAmbiguousCustomerScope(actor);
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const isCurrent = req.query.isCurrent !== undefined ? req.query.isCurrent === 'true' : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    if (actor.userType === 'customer') {
      const scope = await resolveCustomerScope(actor);
      const quotations = await listQuotations({
        customerIds: scope.matchKeys,
        customerMasterIds: scope.masterIds,
        status,
        isCurrent,
        q,
      });
      res.json({ quotations });
      return;
    }
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const quotations = await listQuotations({ customerId, status, isCurrent, q });
    res.json({ quotations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

quotationsRouter.get('/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    return res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
  }
  try {
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      await auditAmbiguousCustomerScope(actor);
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  try {
    const versionRaw = req.query.versionNo;
    const parsedVersion = typeof versionRaw === 'string' && versionRaw.trim() !== '' ? Number(versionRaw) : undefined;
    const quotation = await getQuotationById(
      req.params.id,
      parsedVersion != null && Number.isFinite(parsedVersion) ? { versionNo: parsedVersion } : undefined
    );
    if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });

    if (actor.userType === 'customer') {
      try {
        assertCanAccessInquiryOwnership(actor, quotation.customerId, quotation.customerMasterId);
      } catch (err) {
        if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
      }
    }

    res.json({ quotation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

quotationsRouter.post('/', async (req, res) => {
  const actor = await requireQuotationAuth(req, res);
  if (!actor) return;

  const body = req.body || {};
  if (!body.inquiryId) {
    return res.status(400).json({ error: 'inquiryId is required to create a quotation.' });
  }

  try {
    const quotation = await createQuotationFromInquiry(body, actor);
    res.status(201).json({ quotation, message: 'Commercial quotation Version 1 created successfully.' });
  } catch (err: any) {
    if (err.code === 'EMPTY_INQUIRY') return res.status(400).json({ error: err.message });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

quotationsRouter.post('/:id/versions', async (req, res) => {
  const actor = await requireQuotationAuth(req, res);
  if (!actor) return;

  try {
    const revised = await createQuotationRevision(req.params.id, req.body || {}, actor);
    res.status(201).json({ quotation: revised, message: `Quotation Version ${revised.versionNo} created (previous version preserved as immutable).` });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

quotationsRouter.get('/:id/costing', async (req, res) => {
  const actor = await requireQuotationAuth(req, res);
  if (!actor) return;

  try {
    const costing = await getQuotationCosting(req.params.id, actor);
    res.json({ costing });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});
