import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import {
  listModules,
  listNavigableModules,
  getModuleById,
  PLATFORM_MODULE_REGISTRY,
} from '../platform/moduleRegistry';
import { DATA_OWNERSHIP_MATRIX } from '../platform/dataOwnershipMatrix';
import {
  buildModuleWorkspaceContract,
  isOperationalModule,
  listInformationalModules,
  listNavigableModulesByCategory,
  ownershipSurfaceRows,
} from '../platform/moduleIa';
import {
  CUSTOMER_MASTER_BOUNDARY,
  ENGINEERING_MASTER_BOUNDARY,
  BOM_MASTER_BOUNDARY,
  COSTING_MASTER_BOUNDARY,
  PRICING_MASTER_BOUNDARY,
  SHARED_REFERENCE_BOUNDARY,
} from '../platform/services';
import {
  evaluateEffectiveAccess,
  formatAccessExplanation,
} from '../platform/security/effectiveAccess';
import {
  assertNotEavTransactionStore,
  inquiryManifestAsMetadata,
  mergeFieldMetadata,
  projectMetadataForActor,
  toPlatformMergeInput,
} from '../platform/metadata/metadataService';
import { resolveRequestActor } from './auth';
import { requirePermission } from '../domain/rbacEngine';
import { listPlatformFieldDefinitions, upsertPlatformFieldDefinition } from './platformConfigurationRepository';
import { assertCanManagePlatformMetadata } from './rbac';
import {
  allocateNextNumber,
  listNumberSequences,
  upsertNumberSequence,
} from './numberSequenceService';
import { AUDIT_MIGRATION_NOTE, listServerAuditEvents, appendServerAudit } from './serverAudit';
import { loadUserAccessProfile, resolveGroupPermissionCodes } from './securityAccessService';

export const v2PlatformRouter = Router();

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

async function requireAuth(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } }
) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  return actor;
}

function handleErr(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  if (err instanceof DomainError) {
    const status =
      err.code === 'UNAUTHORIZED' && /sign in/i.test(err.message)
        ? 401
        : err.code === 'UNAUTHORIZED'
          ? 403
          : err.code === 'NOT_FOUND'
            ? 404
            : err.code === 'VALIDATION_FAILED'
              ? 400
              : 403;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  const e = err as Error & { code?: string; http?: number };
  if (e.http === 401 || e.code === 'UNAUTHORIZED') {
    return res.status(401).json({ error: e.message, code: 'UNAUTHORIZED' });
  }
  return res.status(e.http || 400).json({ error: e.message, code: e.code || 'BAD_REQUEST' });
}

/** Runtime boundary + health for V2 namespace — authenticated (deny-by-default). */
v2PlatformRouter.get('/boundary', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  res.json({
    v1: {
      shells: ['/customer', '/internal'],
      apis: ['/api/* except /api/v2'],
      preserved: true,
    },
    v2: {
      shell: '/v2',
      apis: ['/api/v2'],
      coexistence: 'Same deployable monolith; shared PostgreSQL; V1 routes unchanged',
    },
    integrations: {
      d365: 'NOT_IMPLEMENTED',
      advaris: 'NOT_CONNECTED',
    },
    freezes: [
      'Phase 1 commercial fulfillment domain',
      'Costing Option B / Decision 5 metal semantics',
    ],
  });
});

v2PlatformRouter.get('/modules', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const navigableOnly = req.query.navigable === 'true';
    const modules = navigableOnly
      ? listNavigableModules()
      : status
        ? listModules({ status: status as never })
        : PLATFORM_MODULE_REGISTRY;
    res.json({ modules, count: modules.length });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/modules/navigable', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  res.json({ modules: listNavigableModules() });
});

v2PlatformRouter.get('/modules/:moduleId', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  const mod = getModuleById(req.params.moduleId.toUpperCase());
  if (!mod) return res.status(404).json({ error: 'Module not found.', code: 'NOT_FOUND' });
  res.json({ module: mod });
});

v2PlatformRouter.get('/data-ownership', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  res.json({ matrix: DATA_OWNERSHIP_MATRIX });
});

v2PlatformRouter.get('/master-data-sot', async (req, res) => {
  const actor = await requireAuth(req, res);
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
    persistenceMode: 'POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT',
    policy: MASTER_DATA_CUTOVER_FRAMEWORK.policy,
    task: '04B-1',
  });
});

v2PlatformRouter.get('/metadata/fields', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined;
    const dbRows = await listPlatformFieldDefinitions(entity);
    const manifest = inquiryManifestAsMetadata().filter(
      (f) => !entity || f.entityCode === entity
    );
    const fields = projectMetadataForActor(
      mergeFieldMetadata(manifest, toPlatformMergeInput(dbRows)),
      actor
    );
    res.json({
      fields,
      eav: assertNotEavTransactionStore(),
      sourceOfTruth: 'PlatformFieldDefinition overlays CODE_MANIFEST for inquiry fields',
    });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.post('/metadata/fields', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    assertCanManagePlatformMetadata(actor);
    const field = await upsertPlatformFieldDefinition(req.body || {}, actor);
    res.json({ field });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/number-sequences', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    requirePermission(actor, 'ADMIN', 'SECURITY', 'VIEW');
    const sequences = await listNumberSequences({
      moduleId: typeof req.query.moduleId === 'string' ? req.query.moduleId : undefined,
      active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
    });
    res.json({
      sequences,
      costingWrappedPrefixes: ['SC', 'FM', 'FX'],
      note: 'SC/FM/FX allocate via CostingDocumentSequence wrapper — do not dual-increment.',
    });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.post('/number-sequences', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    requirePermission(actor, 'ADMIN', 'ROLE', 'MANAGE');
    const row = await upsertNumberSequence(req.body || {}, actor);
    res.status(201).json({ sequence: row });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.post('/number-sequences/:code/allocate', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    requirePermission(actor, 'ADMIN', 'ROLE', 'MANAGE');
    const allocated = await allocateNextNumber(req.params.code, actor);
    res.status(201).json({ allocated });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.post('/security/effective-access/evaluate', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    const body = req.body || {};
    const groupCodes = await resolveGroupPermissionCodes(actor.id);
    const result = evaluateEffectiveAccess({
      actor,
      module: String(body.module || ''),
      resource: String(body.resource || ''),
      action: String(body.action || ''),
      record: body.record,
      field: body.field,
      groupPermissionCodes: groupCodes,
    });
    res.status(result.allowed ? 200 : result.httpStatus).json({
      result,
      explanation: formatAccessExplanation(result),
    });
  } catch (err) {
    handleErr(err, res);
  }
});

/** Admin: “Why does this user have access?” */
v2PlatformRouter.get('/security/effective-access/explain', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    requirePermission(actor, 'ADMIN', 'SECURITY', 'VIEW');
    const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
    const module = typeof req.query.module === 'string' ? req.query.module : '';
    const resource = typeof req.query.resource === 'string' ? req.query.resource : '';
    const action = typeof req.query.action === 'string' ? req.query.action : '';
    if (!userId || !module || !resource || !action) {
      return res.status(400).json({
        error: 'userId, module, resource, and action are required.',
        code: 'BAD_REQUEST',
      });
    }
    const profile = await loadUserAccessProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'User not found.', code: 'NOT_FOUND' });
    }
    const subjectActor = {
      id: profile.userId,
      email: profile.email,
      name: profile.fullName,
      userType: profile.userType,
      permissionCodes: profile.permissionCodes,
      customerId: profile.customerScope[0]?.customerId,
      customerCode: profile.customerScope[0]?.customerCode,
      customerMasterIds: profile.customerScope.map((c) => c.customerId),
    };
    const result = evaluateEffectiveAccess({
      actor: subjectActor,
      module,
      resource,
      action,
      record: {
        customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
        customerMasterId:
          typeof req.query.customerMasterId === 'string' ? req.query.customerMasterId : undefined,
        ownerUserId: typeof req.query.ownerUserId === 'string' ? req.query.ownerUserId : undefined,
        workflowStatus:
          typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined,
      },
      groupPermissionCodes: profile.permissionCodes,
    });
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'EffectiveAccess',
      entityId: userId,
      action: 'EXPLAIN',
      newValue: { module, resource, action, code: result.code },
      message: `Explained access for ${profile.email}`,
    });
    res.json({
      profile: {
        userId: profile.userId,
        email: profile.email,
        roles: profile.roles,
        groups: profile.groups,
        permissionSets: profile.permissionSets,
        chain: profile.chain,
      },
      result,
      explanation: formatAccessExplanation(result),
    });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/security/users/:userId/access-profile', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    requirePermission(actor, 'ADMIN', 'SECURITY', 'VIEW');
    const profile = await loadUserAccessProfile(req.params.userId);
    if (!profile) return res.status(404).json({ error: 'User not found.', code: 'NOT_FOUND' });
    res.json({ profile });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/audit/events', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    requirePermission(actor, 'ADMIN', 'SECURITY', 'VIEW');
    const events = await listServerAuditEvents({
      entity: typeof req.query.entity === 'string' ? req.query.entity : undefined,
      entityId: typeof req.query.entityId === 'string' ? req.query.entityId : undefined,
      actorId: typeof req.query.actorId === 'string' ? req.query.actorId : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    res.json({ events, migration: AUDIT_MIGRATION_NOTE });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/audit/migration', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  res.json(AUDIT_MIGRATION_NOTE);
});

v2PlatformRouter.get('/integrations/status', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  res.json({
    d365: { status: 'NOT_IMPLEMENTED', adapters: 'src/platform/integration/d365Adapters.ts' },
    advaris: { status: 'NOT_CONNECTED' },
    note: 'No live HTTP calls to D365/Advaris from domain.',
  });
});

/** Task 03 — Module IA: workspace contract + surface nav */
v2PlatformRouter.get('/ia/modules/:moduleId/workspace', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    const moduleId = req.params.moduleId.toUpperCase();
    const mod = getModuleById(moduleId);
    if (!mod) return res.status(404).json({ error: 'Module not found.', code: 'NOT_FOUND' });
    if (!isOperationalModule(moduleId) && !mod.navDefault) {
      return res.status(404).json({
        error: 'Module is informational only (PLANNED/STUB/NOT_IMPLEMENTED).',
        code: 'NOT_OPERATIONAL',
        status: mod.status,
      });
    }
    const contract = buildModuleWorkspaceContract(moduleId);
    res.json({ contract });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/ia/navigator', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    res.json({
      groups: listNavigableModulesByCategory(),
      informational: listInformationalModules().map((m) => ({
        moduleId: m.moduleId,
        displayName: m.displayName,
        status: m.status,
        category: m.category,
      })),
      policy: {
        operational: ['LIVE', 'PARTIAL', 'FROZEN'],
        informationalOnly: ['PLANNED', 'STUB', 'NOT_IMPLEMENTED'],
      },
    });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/ia/master-data/ownership', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  try {
    res.json({
      rows: ownershipSurfaceRows(),
      matrix: DATA_OWNERSHIP_MATRIX,
      note: 'Write ownership exclusive; customer commercial reads use customerScope.',
    });
  } catch (err) {
    handleErr(err, res);
  }
});

v2PlatformRouter.get('/ia/service-boundaries', async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor) return;
  res.json({
    boundaries: [
      CUSTOMER_MASTER_BOUNDARY,
      ENGINEERING_MASTER_BOUNDARY,
      BOM_MASTER_BOUNDARY,
      COSTING_MASTER_BOUNDARY,
      PRICING_MASTER_BOUNDARY,
      SHARED_REFERENCE_BOUNDARY,
    ],
    note: 'Modular monolith boundaries — no duplicate Customer/Costing/Pricing/Engineering authorities.',
  });
});
