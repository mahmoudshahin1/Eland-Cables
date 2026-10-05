import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import {
  parseAdvancedCableSearchQuery,
  cableSearchHitHasCostingLeak,
} from '../domain/v2AdvancedCableSearch';
import { catalogProductHasCostingLeak } from '../domain/customerCableCatalog';
import {
  PersistenceUnavailableError,
  advancedSearchCables,
  exportCustomerCableProducts,
  listCableSearchFacets,
  listCustomerCableProductFacets,
  listCustomerCableProducts,
  type CustomerCableProductQuery,
} from './masterDataRepository';
import {
  appendFrozenSheet,
  createWorkbook,
  sendExcelResponse,
  workbookToBuffer,
} from './excelWorkbook';

export const v2CableSearchRouter = Router();

function sendError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof PersistenceUnavailableError) {
    return res.status(503).json({ error: 'Cable Master is temporarily unavailable.', code: 'DATA_REQUIRED' });
  }
  if (err instanceof DomainError) {
    return res.status(err.code === 'UNAUTHORIZED' ? 403 : 400).json({ error: err.message, code: err.code });
  }
  return res.status(500).json({ error: 'Cable search failed.', code: 'VALIDATION_FAILED' });
}

function requireCatalogActor(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  return resolveRequestActor(req.headers.authorization).then((actor) => {
    if (!actor.id && !actor.email && !actor.name) {
      res.status(401).json({ error: 'Sign in is required to view Cable Products.', code: 'UNAUTHORIZED' });
      return null;
    }
    return actor;
  });
}

function parseProductQuery(query: Record<string, unknown>): CustomerCableProductQuery {
  const pick = (key: string) => (typeof query[key] === 'string' ? query[key] : undefined);
  return {
    category: pick('category'),
    q: pick('q') || pick('search'),
    voltageClass: pick('voltageClass'),
    voltage: pick('voltage'),
    conductor: pick('conductor'),
    conductorSize: pick('conductorSize') || pick('size'),
    cores: pick('cores'),
    insulation: pick('insulation'),
    screen: pick('screen'),
    armour: pick('armour'),
    sheath: pick('sheath'),
    standard: pick('standard'),
    sheathColour: pick('sheathColour'),
    coreColour: pick('coreColour'),
    diameter: pick('diameter'),
    weight: pick('weight'),
    specialAdditives: pick('specialAdditives'),
    page: pick('page') ? Number(pick('page')) : undefined,
    pageSize: pick('pageSize') ? Number(pick('pageSize')) : undefined,
    sortBy: pick('sortBy') || pick('sort'),
    sortDir: pick('sortDir'),
  };
}

/** Shared product catalog discovery. Commercial customer isolation applies to inquiries, not Cable Master rows. */

v2CableSearchRouter.get('/products/facets', async (req, res) => {
  try {
    const actor = await requireCatalogActor(req, res);
    if (!actor) return;
    res.json({ facets: await listCustomerCableProductFacets() });
  } catch (err) {
    sendError(res, err);
  }
});

v2CableSearchRouter.get('/products/export', async (req, res) => {
  try {
    const actor = await requireCatalogActor(req, res);
    if (!actor) return;
    const parsed = parseProductQuery(req.query as Record<string, unknown>);
    const exported = await exportCustomerCableProducts(parsed);
    if (exported.cables.some((c) => catalogProductHasCostingLeak(c))) {
      return res.status(500).json({ error: 'Export contained forbidden costing fields.', code: 'VALIDATION_FAILED' });
    }
    const wb = createWorkbook();
    appendFrozenSheet(
      wb,
      'Cable_Products',
      [
        'Material Number',
        'Item Code',
        'Customer Code',
        'Description',
        'Family',
        'Voltage',
        'Conductor',
        'Size',
        'Cores',
        'Insulation',
        'Screen',
        'Armour',
        'Sheath',
        'Standard',
      ],
      exported.cables.map((row) => [
        row.materialNumber,
        row.itemCode,
        row.customerCode,
        row.description,
        row.family,
        row.voltage,
        row.display.conductor,
        row.display.conductorSize,
        row.display.cores,
        row.display.insulation,
        row.display.screen,
        row.display.armour,
        row.display.sheath,
        row.display.standard,
      ])
    );
    const category = exported.category || 'ALL';
    sendExcelResponse(
      res,
      `Cable_Products_${category}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      workbookToBuffer(wb)
    );
  } catch (err) {
    sendError(res, err);
  }
});

v2CableSearchRouter.get('/products', async (req, res) => {
  try {
    const actor = await requireCatalogActor(req, res);
    if (!actor) return;
    const result = await listCustomerCableProducts(parseProductQuery(req.query as Record<string, unknown>));
    if (result.cables.some((c) => catalogProductHasCostingLeak(c))) {
      return res.status(500).json({ error: 'Catalog result contained forbidden costing fields.', code: 'VALIDATION_FAILED' });
    }
    res.json({
      ...result,
      actorKind: actor.userType === 'customer' ? 'customer' : 'internal',
      customerScopeApplied: actor.userType === 'customer',
    });
  } catch (err) {
    sendError(res, err);
  }
});

v2CableSearchRouter.get('/search', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    if (!actor.id && !actor.email && !actor.name) {
      return res.status(401).json({ error: 'Sign in is required to search Cable Master.', code: 'UNAUTHORIZED' });
    }
    const actorKind = actor.userType === 'customer' ? 'customer' : 'internal';
    const query = parseAdvancedCableSearchQuery(req.query as Record<string, unknown>, actorKind);
    const result = await advancedSearchCables(query);
    if (result.cables.some((c) => cableSearchHitHasCostingLeak(c))) {
      return res.status(500).json({ error: 'Search result contained forbidden costing fields.', code: 'VALIDATION_FAILED' });
    }
    res.json({
      ...result,
      actorKind,
      customerScopeApplied: actor.userType === 'customer',
    });
  } catch (err) {
    sendError(res, err);
  }
});

v2CableSearchRouter.get('/search/facets', async (req, res) => {
  try {
    const actor = await resolveRequestActor(req.headers.authorization);
    if (!actor.id && !actor.email && !actor.name) {
      return res.status(401).json({ error: 'Sign in is required to search Cable Master.', code: 'UNAUTHORIZED' });
    }
    res.json({ facets: await listCableSearchFacets() });
  } catch (err) {
    sendError(res, err);
  }
});

v2CableSearchRouter.post('/search', (_req, res) => {
  res.status(405).json({
    error: 'Advanced search is read-only. It does not create Cable Master records or Material Numbers.',
    code: 'VALIDATION_FAILED',
  });
});
