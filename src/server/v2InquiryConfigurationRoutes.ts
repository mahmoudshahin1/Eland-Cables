import { Router } from 'express';
import { InquiryStatus } from '@prisma/client';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import {
  assertCanManageInquiry,
  assertCanMutateV2Quotation,
  assertCanRunV2Costing,
  assertCanViewCustomerQuotation,
} from './rbac';
import { assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  addV2InquiryLine,
  createV2Inquiry,
  getV2Inquiry,
  listV2Inquiries,
  listV2LineSnapshots,
  persistV2ConfigurationSnapshot,
  submitV2Inquiry,
  transitionV2InquiryEngineeringStatus,
} from './v2InquiryConfigurationRepository';
import {
  getV2CurrentCuttingPlan,
  getV2CuttingPlanHandoff,
  listV2LineCuttingPlans,
  persistV2CuttingLengthPlan,
  previewV2CuttingLengthPlan,
  listV2LineCuttingRequirements,
} from './v2CuttingLengthRepository';
import {
  confirmV2DrumPlan,
  createDraftV2DrumPlan,
  getV2CurrentDrumPlan,
  getV2DrumPlanById,
  getV2DrumPlanHandoff,
  getV2DrumSelectionContext,
  listV2DrumSelectionCandidatesForLine,
  listV2LineDrumPlans,
  previewV2DrumPlan,
  validateV2DrumPlan,
} from './v2DrumPlanRepository';
import {
  calculateV2CostingRun,
  getV2CostingRunLineage,
  getV2CurrentCostingRun,
  previewV2CostingRun,
} from './v2CostingRunRepository';
import { previewV2CommercialPricing } from './v2CommercialPricingService';
import {
  approveV2Quotation,
  createV2QuotationDraft,
  getV2CurrentQuotation,
  getV2QuotationReadiness,
  issueV2Quotation,
  persistV2QuotationPricing,
  recordCustomerQuotationDecision,
  returnV2Quotation,
  reviseV2Quotation,
} from './v2QuotationRepository';
import { generateV2QuotationPdf } from './v2QuotationPdfService';
import { calculateInquiry } from './vipCalculateService';
import {
  assertCanCalculateVipInquiry,
  assertCanCreateContainerStudy,
  assertCanViewContainerStudy,
} from './rbac';
import {
  createContainerStudy,
  createShipmentGroup,
  listContainerStudiesForInquiry,
} from './containerStudyRepository';

export const v2InquiryConfigurationRouter = Router();

async function requireV2InquiryAuth(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } }
) {
  const actor = await resolveRequestActor(req.headers.authorization);
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
      }
      res.status(err.code === 'UNAUTHORIZED' ? 401 : 403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

function projectCustomerQuotation(quotation: Record<string, unknown> | null) {
  if (!quotation) return null;
  const lines = Array.isArray(quotation.lines) ? quotation.lines : [];
  return {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    versionNo: quotation.versionNo,
    status: quotation.status,
    issuedAt: quotation.issuedAt,
    validUntil: quotation.validUntil,
    validityDays: quotation.validityDays,
    commercialPricingStatus: quotation.commercialPricingStatus,
    technicalOfferStatus: quotation.technicalOfferStatus,
    commercialOfferStatus: quotation.commercialOfferStatus,
    sellingPrice: quotation.sellingPrice,
    customerDecision: quotation.customerDecision,
    customerDecisionReason: quotation.customerDecisionReason,
    customerDecisionAt: quotation.customerDecisionAt,
    lines: lines.map((line: Record<string, unknown>) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemDescription: line.itemDescription,
      plannedLengthM: line.plannedLengthM,
      sellingPrice: line.sellingPrice,
    })),
  };
}

function handleErr(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const e = err as Error & { code?: string };
  if (e.code === 'NOT_FOUND') return res.status(404).json({ error: e.message, code: e.code });
  if (
    e.code === 'INVALID_STATE' ||
    e.code === 'SNAPSHOT_REQUIRED' ||
    e.code === 'CONFIGURATION_REQUIRED' ||
    e.code === 'INVALID_CONFIGURATION' ||
    e.code === 'EMPTY_INQUIRY'
  ) {
    return res.status(409).json({ error: e.message, code: e.code });
  }
  if (
    e.code === 'STALE_CONFIGURATION_SNAPSHOT' ||
    e.code === 'CUTTING_PLAN_REQUIRED' ||
    e.code === 'STALE_CUTTING_PLAN' ||
    e.code === 'HANDOFF_NOT_READY'
  ) {
    return res.status(409).json({ error: e.message, code: e.code });
  }
  if (e.code === 'VALIDATION_FAILED') {
    return res.status(400).json({ error: e.message, code: e.code, details: (e as Error & { details?: unknown }).details });
  }
  if (e.code === 'VALIDATION') {
    return res.status(400).json({ error: e.message, code: e.code });
  }
  if (e.code === 'UNAUTHORIZED') return res.status(403).json({ error: e.message, code: e.code });
  if (e.code === 'COSTING_LOCKED' || e.code === 'DRUM_PLAN_REQUIRED' || e.code === 'COSTING_REQUIRED' || e.code === 'INQUIRY_PROCESS_ACTION_DENIED') {
    return res.status(409).json({ error: e.message, code: e.code });
  }
  if (e.code === 'QUOTATION_NOT_READY' || e.code === 'BUSINESS_RULE_REQUIRED' || e.code === 'CONFLICT' || e.code === 'PRICE_NOT_READY') {
    return res.status(409).json({ error: e.message, code: e.code });
  }
  return res.status(400).json({ error: e.message || 'Request failed.', code: e.code || 'BAD_REQUEST' });
}

v2InquiryConfigurationRouter.post('/', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const inquiry = await createV2Inquiry(req.body || {}, actor);
    res.status(201).json({ inquiry });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await listV2Inquiries(actor, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const inquiry = await getV2Inquiry(req.params.id, actor);
    res.json({ inquiry });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await addV2InquiryLine(req.params.id, req.body || {}, actor);
    res.status(201).json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const inquiry = await getV2Inquiry(req.params.id, actor);
    res.json({ lines: inquiry.lines });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/snapshots', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await persistV2ConfigurationSnapshot(
      req.params.id,
      req.params.lineId,
      req.body || {},
      actor
    );
    res.status(201).json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/snapshots', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const snapshots = await listV2LineSnapshots(req.params.id, req.params.lineId, actor);
    res.json({ snapshots });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/submit', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const inquiry = await submitV2Inquiry(req.params.id, actor);
    res.json({ inquiry });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/engineering-status', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const status = String(req.body?.status || '') as InquiryStatus;
    const inquiry = await transitionV2InquiryEngineeringStatus(req.params.id, status, actor);
    res.json({ inquiry });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/cutting-plans', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await persistV2CuttingLengthPlan(
      req.params.id,
      req.params.lineId,
      req.body || {},
      actor
    );
    res.status(201).json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/cutting-plans/preview', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await previewV2CuttingLengthPlan(
      req.params.id,
      req.params.lineId,
      req.body || {},
      actor
    );
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/cutting-requirements', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await persistV2CuttingLengthPlan(
      req.params.id,
      req.params.lineId,
      { ...(req.body || {}), addRequirement: true },
      actor
    );
    res.status(201).json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/cutting-requirements', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const requirements = await listV2LineCuttingRequirements(req.params.id, req.params.lineId, actor);
    res.json({ requirements });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/cutting-plans', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const plans = await listV2LineCuttingPlans(req.params.id, req.params.lineId, actor);
    res.json({ plans });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/cutting-plans/current', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const plan = await getV2CurrentCuttingPlan(req.params.id, req.params.lineId, actor);
    res.json({ plan });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/cutting-plans/:planId/handoff', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const handoff = await getV2CuttingPlanHandoff(
      req.params.id,
      req.params.lineId,
      req.params.planId,
      actor
    );
    res.json({ handoff });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/drum-selection/context', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await getV2DrumSelectionContext(req.params.id, req.params.lineId, actor, {
      cuttingLengthRequirementId:
        typeof req.query.cuttingLengthRequirementId === 'string'
          ? req.query.cuttingLengthRequirementId
          : undefined,
      cuttingLengthPlanId:
        typeof req.query.cuttingLengthPlanId === 'string' ? req.query.cuttingLengthPlanId : undefined,
    });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/drum-selection/candidates', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await listV2DrumSelectionCandidatesForLine(
      req.params.id,
      req.params.lineId,
      actor,
      {
        cuttingLengthRequirementId: req.body?.cuttingLengthRequirementId,
        cuttingLengthPlanId: req.body?.cuttingLengthPlanId,
      }
    );
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/drum-selection/preview', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await previewV2DrumPlan(req.params.id, req.params.lineId, req.body || {}, actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/drum-plans', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await createDraftV2DrumPlan(
      req.params.id,
      req.params.lineId,
      req.body || {},
      actor
    );
    res.status(201).json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/drum-plans/:planId/validate', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await validateV2DrumPlan(
      req.params.id,
      req.params.lineId,
      req.params.planId,
      actor
    );
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/drum-plans/:planId/confirm', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const result = await confirmV2DrumPlan(
      req.params.id,
      req.params.lineId,
      req.params.planId,
      actor
    );
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/drum-plans', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const plans = await listV2LineDrumPlans(req.params.id, req.params.lineId, actor);
    res.json({ plans });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/drum-plans/current', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const plan = await getV2CurrentDrumPlan(req.params.id, req.params.lineId, actor);
    res.json({ plan });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/drum-plans/:planId', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const plan = await getV2DrumPlanById(req.params.id, req.params.lineId, req.params.planId, actor);
    res.json({ plan });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/drum-plans/:planId/handoff', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const handoff = await getV2DrumPlanHandoff(
      req.params.id,
      req.params.lineId,
      req.params.planId,
      actor
    );
    res.json({ handoff });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/costing-runs/preview', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanRunV2Costing(actor);
    const result = await previewV2CostingRun(req.params.id, req.params.lineId, actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/costing-runs/calculate', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanRunV2Costing(actor);
    const requestedResultId =
      typeof req.body?.containerStudyResultId === 'string' ? req.body.containerStudyResultId : undefined;
    const result = await calculateV2CostingRun(req.params.id, req.params.lineId, actor, {
      containerStudyResultId: requestedResultId,
    });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/lines/:lineId/costing-runs/current', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanRunV2Costing(actor);
    const result = await getV2CurrentCostingRun(req.params.id, req.params.lineId, actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get(
  '/:id/lines/:lineId/costing-runs/:calculationId/lineage',
  async (req, res) => {
    const actor = await requireV2InquiryAuth(req, res);
    if (!actor) return;
    try {
      assertCanRunV2Costing(actor);
      const result = await getV2CostingRunLineage(
        req.params.id,
        req.params.lineId,
        req.params.calculationId,
        actor
      );
      res.json(result);
    } catch (err) {
      handleErr(err, res);
    }
  }
);

v2InquiryConfigurationRouter.post('/:id/lines/:lineId/commercial-pricing/preview', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanRunV2Costing(actor);
    const body = (req.body || {}) as { pricingCurrency?: string; requestedDiscountPercentage?: number };
    const result = await previewV2CommercialPricing(req.params.id, req.params.lineId, actor, body);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/quotation/readiness', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    if (actor.userType === 'customer') {
      res.status(403).json({ error: 'Quotation readiness is internal-only.', code: 'UNAUTHORIZED' });
      return;
    }
    const stage = (req.query.stage as string) || 'ISSUE';
    const result = await getV2QuotationReadiness(req.params.id, actor, stage as 'CREATE_DRAFT' | 'PRICE' | 'ISSUE');
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/quotation', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanViewCustomerQuotation(actor);
    const quotation = await getV2CurrentQuotation(req.params.id, actor);
    if (actor.userType === 'customer') {
      if (!quotation?.issuedAt) {
        return res.json({ quotation: null });
      }
      return res.json({ quotation: projectCustomerQuotation(quotation as Record<string, unknown>) });
    }
    res.json({ quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/calculate', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanCalculateVipInquiry(actor);
    const body = (req.body || {}) as { recalculate?: boolean };
    const result = await calculateInquiry(req.params.id, actor, { recalculate: body.recalculate === true });
    const status = result.status === 'COMPLETED' ? 200 : 409;
    res.status(status).json({ result });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/quotation', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanMutateV2Quotation(actor);
    const body = (req.body || {}) as { validityDays?: number };
    const quotation = await createV2QuotationDraft(req.params.id, actor, body);
    res.status(201).json({ quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/quotation/price', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanMutateV2Quotation(actor);
    const body = (req.body || {}) as { requestedDiscountPercentage?: number };
    const quotation = await persistV2QuotationPricing(req.params.id, actor, body);
    res.json({ quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/quotation/approve', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanMutateV2Quotation(actor);
    const quotation = await approveV2Quotation(req.params.id, actor);
    res.json({ quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/quotation/return', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanMutateV2Quotation(actor);
    const body = (req.body || {}) as { reason?: string };
    const quotation = await returnV2Quotation(req.params.id, actor, String(body.reason || ''));
    res.json({ quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/quotation/customer-decision', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const body = (req.body || {}) as { decision?: string; reason?: string };
    const decision = body.decision;
    if (decision !== 'ACCEPT' && decision !== 'REJECT' && decision !== 'CLARIFICATION') {
      return res.status(400).json({ error: 'decision must be ACCEPT, REJECT, or CLARIFICATION.', code: 'VALIDATION' });
    }
    const quotation = await recordCustomerQuotationDecision(req.params.id, actor, {
      decision,
      reason: body.reason,
    });
    res.json({ quotation: actor.userType === 'customer' ? projectCustomerQuotation(quotation as unknown as Record<string, unknown>) : quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/quotation/issue', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanMutateV2Quotation(actor);
    const quotation = await issueV2Quotation(req.params.id, actor);
    res.json({ quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/quotation/revise', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanMutateV2Quotation(actor);
    const quotation = await reviseV2Quotation(req.params.id, actor);
    res.status(201).json({ quotation });
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/quotation/pdf', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    const quotation = await getV2CurrentQuotation(req.params.id, actor);
    if (!quotation) {
      return res.status(404).json({ error: 'No quotation found.', code: 'NOT_FOUND' });
    }
    const draft = req.query.draft === '1' || req.query.draft === 'true';
    if (draft && actor.userType === 'customer') {
      return res.status(403).json({
        error: 'Draft commercial offers are internal only.',
        code: 'UNAUTHORIZED',
      });
    }
    if (!draft && actor.userType === 'customer' && !quotation.issuedAt) {
      return res.status(403).json({ error: 'Quotation PDF is available after issue.', code: 'UNAUTHORIZED' });
    }
    const doc = await generateV2QuotationPdf(quotation.id, actor, { draft });
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const printScript =
        req.query.print === '1'
          ? '<script>window.addEventListener("load",function(){window.print()})</script>'
          : '';
      return res.send(doc.html + printScript);
    }
    const fileName = `${draft ? 'DRAFT-' : ''}${doc.quotationNumber}-REV${doc.versionNo}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(doc.pdf);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/shipment-groups', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanCreateContainerStudy(actor);
    const group = await createShipmentGroup(req.params.id, req.body || {}, actor);
    res.status(201).json(group);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.post('/:id/container-studies', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanCreateContainerStudy(actor);
    const study = await createContainerStudy(req.params.id, req.body || {}, actor);
    res.status(201).json(study);
  } catch (err) {
    handleErr(err, res);
  }
});

v2InquiryConfigurationRouter.get('/:id/container-studies', async (req, res) => {
  const actor = await requireV2InquiryAuth(req, res);
  if (!actor) return;
  try {
    assertCanViewContainerStudy(actor);
    const studies = await listContainerStudiesForInquiry(req.params.id, actor);
    res.json({ studies });
  } catch (err) {
    handleErr(err, res);
  }
});
