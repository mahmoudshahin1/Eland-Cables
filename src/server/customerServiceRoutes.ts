import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  assertCanCreateServiceCase,
  assertCanUpdateServiceCase,
  assertCanViewServiceCase,
} from './rbac';
import {
  addCaseAttachment,
  addCaseComment,
  assignCase,
  changeCaseStatus,
  confirmCaseResolution,
  createCustomerServiceCase,
  customerServiceMeta,
  getCaseAttachmentContent,
  getCustomerServiceCase,
  listCaseReferenceInquiries,
  listCaseReferenceLines,
  listComplaintCategories,
  listCustomerServiceCases,
  requestCaseReopen,
  resolveCase,
  resolveCaseReferences,
  summarizeCustomerServiceCases,
} from './customerServiceRepository';
import { getOrCreateSupportChatSession, postSupportChatMessage, requestEngineerSupport } from './supportChatRepository';

export const customerServiceRouter = Router();

async function requireServiceAuth(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  mode: 'view' | 'create' | 'update'
) {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    if (mode === 'create') assertCanCreateServiceCase(actor);
    else if (mode === 'update') assertCanUpdateServiceCase(actor);
    else assertCanViewServiceCase(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === 'CONFIGURATION_REQUIRED') {
        await auditAmbiguousCustomerScope(actor);
      }
      res.status(err.code === 'UNAUTHORIZED' ? 403 : 403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

function sendDomainError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof DomainError) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'UNAUTHORIZED' ? 403 : err.code === 'VALIDATION_FAILED' ? 400 : 409;
    res.status(status).json({ error: err.message, code: err.code, details: err.details });
    return true;
  }
  return false;
}

customerServiceRouter.get('/categories', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const categories = await listComplaintCategories();
    res.json({ categories });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/meta', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const [categories, meta] = await Promise.all([listComplaintCategories(), Promise.resolve(customerServiceMeta())]);
    res.json({ ...meta, categories });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/references/inquiries', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const inquiries = await listCaseReferenceInquiries(actor);
    res.json({
      inquiries: inquiries.map((row) => ({
        ...row,
        inquiryDate: row.inquiryDate.toISOString(),
      })),
    });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/references/inquiries/:inquiryId/lines', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const lines = await listCaseReferenceLines(req.params.inquiryId, actor);
    res.json({
      lines: lines.map((line) => ({
        ...line,
        requestedQuantity: Number(line.requestedQuantity),
        requestedLengthMeters: Number(line.requestedLengthMeters),
      })),
    });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/references/resolve', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  const inquiryId = typeof req.query.inquiryId === 'string' ? req.query.inquiryId : '';
  const inquiryLineId = typeof req.query.inquiryLineId === 'string' ? req.query.inquiryLineId : undefined;
  if (!inquiryId) {
    res.status(400).json({ error: 'inquiryId is required.', code: 'VALIDATION_FAILED' });
    return;
  }
  try {
    const related = await resolveCaseReferences({ inquiryId, inquiryLineId }, actor);
    res.json({ related });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/chat', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const session = await getOrCreateSupportChatSession(
      actor,
      typeof req.query.channel === 'string' ? req.query.channel : undefined
    );
    res.json({ session });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/chat/messages', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const session = await postSupportChatMessage(actor, req.body || {});
    res.status(201).json({ session });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/chat/request-engineer', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'create');
  if (!actor) return;
  try {
    const session = await requestEngineerSupport(actor, req.body || {});
    res.status(201).json({ session });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/cases/summary', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const summary = await summarizeCustomerServiceCases(actor);
    res.json({ summary });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/cases', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const result = await listCustomerServiceCases(actor, {
      tab: typeof req.query.tab === 'string' ? req.query.tab : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 5,
    });
    res.json(result);
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'create');
  if (!actor) return;
  try {
    const created = await createCustomerServiceCase(req.body || {}, actor);
    res.status(201).json({ case: created });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/cases/:id', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const row = await getCustomerServiceCase(req.params.id, actor);
    res.json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases/:id/comments', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const row = await addCaseComment(req.params.id, req.body || {}, actor);
    res.status(201).json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases/:id/attachments', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const row = await addCaseAttachment(req.params.id, req.body || {}, actor);
    res.status(201).json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.get('/cases/:id/attachments/:attachmentId', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'view');
  if (!actor) return;
  try {
    const attachment = await getCaseAttachmentContent(req.params.id, req.params.attachmentId, actor);
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName.replace(/"/g, '')}"`);
    res.send(Buffer.from(attachment.content));
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases/:id/status', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const row = await changeCaseStatus(req.params.id, req.body || {}, actor);
    res.json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases/:id/assign', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const row = await assignCase(req.params.id, req.body || {}, actor);
    res.json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases/:id/resolve', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const row = await resolveCase(req.params.id, req.body || {}, actor);
    res.json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases/:id/confirm-resolution', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const accepted = req.body?.accepted !== false && req.body?.accepted !== 'false';
    const row = await confirmCaseResolution(req.params.id, accepted, actor);
    res.json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

customerServiceRouter.post('/cases/:id/request-reopen', async (req, res) => {
  const actor = await requireServiceAuth(req, res, 'update');
  if (!actor) return;
  try {
    const row = await requestCaseReopen(req.params.id, actor, req.body?.note);
    res.json({ case: row });
  } catch (err: any) {
    if (sendDomainError(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});
