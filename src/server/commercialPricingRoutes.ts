import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import {
  assertCanApprovePricingRules,
  assertCanManagePricingRules,
  assertCanManageQuotations,
} from './rbac';
import {
  createCommercialPricingRule,
  createCommercialPricingRuleVersion,
  listCommercialPricingRuleHistory,
  listCommercialPricingRuleOptions,
  listCommercialPricingRules,
  processPricingRuleWorkflowAction,
  priceQuotation,
  submitQuotationForApproval,
  approveQuotationPricing,
  loadPricingResolutionContext,
  toStoredPricingRule,
} from './commercialPricingRepository';
import {
  calculateCommercialSellingPrice,
} from '../domain/commercialPricingEngine';
import { getPrisma } from './db';

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

export const pricingMasterRouter = Router();
export const commercialPricingRouter = Router();

// ==========================================
// 1. MASTER PRICING RULES API (/api/master/commercial-pricing-rules)
// ==========================================

pricingMasterRouter.get('/', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePricingRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
    const workflowStatus = typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined;
    const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined;
    const isCurrent = req.query.isCurrent !== undefined ? req.query.isCurrent === 'true' : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;

    const rules = await listCommercialPricingRules({
      scope,
      workflowStatus,
      currency,
      isCurrent,
      q,
    });
    res.json({ rules });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

pricingMasterRouter.post('/', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePricingRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const created = await createCommercialPricingRule(req.body || {}, actor);
    res.status(201).json({ rule: created, message: 'Commercial pricing rule created in DRAFT status.' });
  } catch (err: any) {
    if (err.code === 'INVALID_MARGIN_VALUE' || err.code === 'INVALID_MARKUP_VALUE' || err.code === 'INVALID_DATE_RANGE' || err.code === 'INVALID_SCOPE_TARGET' || err.code === 'INVALID_PERCENTAGE' || err.code === 'CUSTOMER_GROUP_NOT_FOUND') {
      return res.status(422).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

pricingMasterRouter.get('/options', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePricingRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }
  try {
    const options = await listCommercialPricingRuleOptions();
    res.json(options);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

pricingMasterRouter.get('/:id/history', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePricingRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }
  try {
    const history = await listCommercialPricingRuleHistory(req.params.id);
    res.json({ history });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

pricingMasterRouter.post('/:id/versions', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePricingRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }
  try {
    const rule = await createCommercialPricingRuleVersion(req.params.id, req.body || {}, actor);
    res.status(201).json({ rule, message: 'New pricing rule version created. Prior version was superseded.' });
  } catch (err: any) {
    if (
      err.code === 'NOT_FOUND' ||
      err.code === 'INVALID_MARGIN_VALUE' ||
      err.code === 'INVALID_MARKUP_VALUE' ||
      err.code === 'INVALID_DATE_RANGE' ||
      err.code === 'EFFECTIVE_FROM_NOT_AFTER_CURRENT' ||
      err.code === 'PRICING_RULE_PERIOD_OVERLAP'
    ) {
      return res.status(err.code === 'NOT_FOUND' ? 404 : 422).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

pricingMasterRouter.post('/:id/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  const action = String(req.body?.action || '').toUpperCase() as 'SUBMIT' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'EXPIRE' | 'CANCEL';

  if (!['SUBMIT', 'REVIEW', 'APPROVE', 'REJECT', 'EXPIRE', 'CANCEL'].includes(action)) {
    return res.status(400).json({ error: `Invalid action "${action}".` });
  }

  try {
    if (action === 'APPROVE') {
      assertCanApprovePricingRules(actor);
    } else {
      assertCanManagePricingRules(actor);
    }
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const updated = await processPricingRuleWorkflowAction(
      req.params.id,
      action,
      req.body || {},
      actor
    );
    res.json({ rule: updated, action, message: `Pricing rule ${action} executed successfully.` });
  } catch (err: any) {
    if (err.code === 'PRICING_RULE_PERIOD_OVERLAP') {
      return res.status(422).json({ error: err.message, code: err.code });
    }
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

pricingMasterRouter.get('/export', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePricingRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const rules = await listCommercialPricingRules();
    const XLSX = await import('xlsx');
    const headers = [
      'Rule Code',
      'Rule Name',
      'Scope',
      'Rule Type',
      'Percentage Value (%)',
      'Currency',
      'Priority',
      'Customer ID',
      'Customer Group ID',
      'Customer Tier Code',
      'Cable Material Number',
      'Cable Family',
      'Effective From',
      'Effective To',
      'Workflow Status',
      'Record Status',
      'Revision',
      'Min Margin Threshold (%)',
      'Max Discount Allowed (%)',
      'Comment',
    ];

    const data = rules.map((r) => [
      r.ruleCode,
      r.ruleName,
      r.scope,
      r.ruleType,
      Number(r.percentageValue),
      r.currency,
      r.priority,
      r.customerId || '',
      r.customerGroupId || '',
      r.customerTierCode || '',
      r.cableMaterialNumber || '',
      r.cableFamily || '',
      r.effectiveFrom ? new Date(r.effectiveFrom).toISOString().slice(0, 10) : '',
      r.effectiveTo ? new Date(r.effectiveTo).toISOString().slice(0, 10) : '',
      r.workflowStatus,
      r.status,
      r.revision,
      r.minMarginThreshold != null ? Number(r.minMarginThreshold) : '',
      r.maxDiscountAllowed != null ? Number(r.maxDiscountAllowed) : '',
      r.comment || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pricing Rules');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Commercial_Pricing_Rules.xlsx"');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. COMMERCIAL PRICING ENGINE & SIMULATION (/api/commercial-pricing)
// ==========================================

commercialPricingRouter.post('/calculate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePricingRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  const prisma = getPrisma();
  if (!prisma) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const approvedRules = await prisma.commercialPricingRule.findMany({
      where: { workflowStatus: 'APPROVED' },
    });
    const storedRules = approvedRules.map(toStoredPricingRule);
    const customerId = req.body?.customerId;
    const materialNumber = req.body?.materialNumber;
    const loaded = await loadPricingResolutionContext(customerId, materialNumber);

    const result = calculateCommercialSellingPrice(
      {
        materialCost: req.body?.materialCost,
        currency: String(req.body?.currency || 'USD'),
        materialNumber,
        customerId,
        customerGroupId: req.body?.customerGroupId || loaded.customerGroupId,
        customerTierCode: req.body?.customerTierCode,
        cableFamily: req.body?.cableFamily || loaded.cableFamily,
        pricingDate: req.body?.pricingDate ? new Date(req.body.pricingDate) : new Date(),
        quantity: req.body?.quantity != null ? Number(req.body.quantity) : 1,
        lengthMeters: req.body?.lengthMeters != null ? Number(req.body.lengthMeters) : 1000,
        requestedDiscountPercentage: req.body?.requestedDiscountPercentage != null ? Number(req.body.requestedDiscountPercentage) : 0,
      },
      { approvedPricingRules: storedRules }
    );

    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. QUOTATION PRICING INTEGRATION ROUTES
// ==========================================

export async function attachQuotationPricingRoutes(quotationsRouter: Router) {
  quotationsRouter.post('/:id/price', async (req, res) => {
    const actor = await actorFromRequest(req);
    try {
      assertCanManageQuotations(actor);
    } catch (err) {
      if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
      return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
    }

    try {
      const outcome = await priceQuotation(
        req.params.id,
        {
          requestedDiscountPercentage: req.body?.requestedDiscountPercentage != null ? Number(req.body.requestedDiscountPercentage) : undefined,
          pricingDate: req.body?.pricingDate,
        },
        actor
      );

      res.json({
        quotation: outcome.quotation,
        pricedLines: outcome.pricedLines,
        totalSellingPrice: outcome.totalSellingPrice,
        commercialPricingStatus: outcome.commercialPricingStatus,
        message: 'Commercial selling price calculated and frozen in pricing snapshot.',
      });
    } catch (err: any) {
      if (err.code === 'PRICE_NOT_READY' || err.code === 'PRICING_NOT_CONFIGURED' || err.code === 'PRICING_RULE_CONFLICT' || err.code === 'PRICING_CURRENCY_MISMATCH') {
        return res.status(422).json({ error: err.message, code: err.code, blockingReasons: err.blockingReasons });
      }
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  quotationsRouter.post('/:id/submit-for-approval', async (req, res) => {
    const actor = await actorFromRequest(req);
    try {
      assertCanManageQuotations(actor);
    } catch (err) {
      if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
      return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
    }

    try {
      const updated = await submitQuotationForApproval(req.params.id, actor);
      res.json({ quotation: updated, message: 'Quotation submitted for management pricing approval.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  quotationsRouter.post('/:id/approve-pricing', async (req, res) => {
    const actor = await actorFromRequest(req);
    try {
      assertCanApprovePricingRules(actor);
    } catch (err) {
      if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
      return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
    }

    try {
      const approved = await approveQuotationPricing(req.params.id, req.body || {}, actor);
      res.json({ quotation: approved, message: 'Quotation commercial pricing approved successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
