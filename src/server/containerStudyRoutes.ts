import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import {
  assertCanCalculateContainerStudy,
  assertCanConfirmContainerStudy,
  assertCanCreateContainerStudy,
  assertCanOperateInquiryContainerStudy,
  assertCanManageAlgorithmConfiguration,
  assertCanManageContainerMaster,
  assertCanManagePackingProfile,
  assertCanSupersedeContainerStudy,
  assertCanValidateContainerStudy,
  assertCanViewContainerStudy,
} from './rbac';
import { assertCustomerBusinessScope, auditAmbiguousCustomerScope } from './customerScope';
import {
  calculateContainerStudy,
  confirmContainerStudy,
  createContainerStudy,
  confirmShipmentGroup,
  createShipmentGroup,
  getContainerStudy,
  getContainerStudyResult,
  listContainerStudiesForInquiry,
  listContainerStudyResults,
  listShipmentGroupsForInquiry,
  supersedeContainerStudy,
  supersedeShipmentGroup,
  updateShipmentGroup,
  validateContainerStudy,
  validateShipmentGroup,
} from './containerStudyRepository';
import {
  createContainerStudyInputSnapshot,
  getContainerStudyInputSnapshot,
  getShipmentGroup,
} from './containerStudyB1Repository';
import { createContainerTypeVersion, listContainerTypes } from './containerMasterRepository';
import {
  activateAlgorithmConfiguration,
  listAlgorithmConfigurations,
  listAlgorithmVersions,
} from './algorithmConfigurationRepository';
import { createPackingProfile, createPackingProfileVersion, getPackingProfile } from './packingProfileRepository';
import {
  calculateInquiryContainerOptions,
  getInquiryContainerStudyWorkspace,
  selectInquiryContainerOption,
} from './inquiryContainerStudyService';

export const containerStudyRouter = Router();

function sendDomainError(
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  err: unknown
): boolean {
  if (!(err instanceof DomainError)) return false;
  const status =
    err.code === 'UNAUTHORIZED' ? 401 : err.code === 'NOT_FOUND' ? 404 : err.code === 'CONFLICT' ? 409 : 400;
  res.status(status).json({ error: err.message, code: err.code, details: err.details });
  return true;
}

async function requireActor(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  assertFn: (actor: Awaited<ReturnType<typeof resolveRequestActor>>) => void
) {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertFn(actor);
    assertCustomerBusinessScope(actor);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'CONFIGURATION_REQUIRED') {
      await auditAmbiguousCustomerScope(actor);
    }
    if (sendDomainError(res, err)) return null;
    throw err;
  }
  return actor;
}

containerStudyRouter.get('/container-types', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json({ types: await listContainerTypes() });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/container-types/:id/versions', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageContainerMaster);
  if (!actor) return;
  try {
    const version = await createContainerTypeVersion(req.params.id, req.body || {}, actor);
    res.status(201).json(version);
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/algorithm-versions', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json({ versions: await listAlgorithmVersions() });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/algorithm-configurations', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json({ configurations: await listAlgorithmConfigurations() });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/algorithm-configurations/:id/activate', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManageAlgorithmConfiguration);
  if (!actor) return;
  try {
    res.json(await activateAlgorithmConfiguration(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/packing-profiles', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManagePackingProfile);
  if (!actor) return;
  try {
    res.status(201).json(await createPackingProfile(req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/packing-profiles/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json(await getPackingProfile(req.params.id));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/packing-profiles/:id/versions', async (req, res) => {
  const actor = await requireActor(req, res, assertCanManagePackingProfile);
  if (!actor) return;
  try {
    res.status(201).json(await createPackingProfileVersion(req.params.id, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/inquiries/:inquiryId/shipment-groups', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json({ groups: await listShipmentGroupsForInquiry(req.params.inquiryId, actor) });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.patch('/shipment-groups/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  try {
    res.json(await updateShipmentGroup(req.params.id, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/shipment-groups/:id/supersede', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  try {
    res.status(201).json(await supersedeShipmentGroup(req.params.id, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/shipment-groups/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json(await getShipmentGroup(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/shipment-groups', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  const inquiryId = (req.body as { inquiryId?: string })?.inquiryId;
  if (!inquiryId) {
    res.status(400).json({ error: 'inquiryId is required.', code: 'VALIDATION_FAILED' });
    return;
  }
  try {
    res.status(201).json(await createShipmentGroup(inquiryId, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/inquiries/:inquiryId/shipment-groups', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  try {
    res.status(201).json(await createShipmentGroup(req.params.inquiryId, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/shipment-groups/:id/validate', async (req, res) => {
  const actor = await requireActor(req, res, assertCanValidateContainerStudy);
  if (!actor) return;
  try {
    res.json(await validateShipmentGroup(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/shipment-groups/:id/confirm', async (req, res) => {
  const actor = await requireActor(req, res, assertCanConfirmContainerStudy);
  if (!actor) return;
  try {
    res.json(await confirmShipmentGroup(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/inquiries/:inquiryId/container-study-workspace', async (req, res) => {
  const actor = await requireActor(req, res, assertCanOperateInquiryContainerStudy);
  if (!actor) return;
  try {
    const region = req.query.region === 'Europe' || req.query.region === 'Africa' ? req.query.region : undefined;
    res.json(await getInquiryContainerStudyWorkspace(req.params.inquiryId, actor, { region }));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/inquiries/:inquiryId/container-study-workspace/calculate', async (req, res) => {
  const actor = await requireActor(req, res, assertCanOperateInquiryContainerStudy);
  if (!actor) return;
  try {
    const region = (req.body as { region?: 'Europe' | 'Africa' })?.region;
    res.json(await calculateInquiryContainerOptions(req.params.inquiryId, actor, { region }));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/inquiries/:inquiryId/container-study-workspace/select', async (req, res) => {
  const actor = await requireActor(req, res, assertCanOperateInquiryContainerStudy);
  if (!actor) return;
  const typeCode = (req.body as { typeCode?: string })?.typeCode;
  if (!typeCode) {
    res.status(400).json({ error: 'typeCode is required.', code: 'VALIDATION_FAILED' });
    return;
  }
  try {
    const region = (req.body as { region?: 'Europe' | 'Africa' })?.region;
    res.json(await selectInquiryContainerOption(req.params.inquiryId, actor, { typeCode, region }));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/inquiries/:inquiryId/container-studies', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  try {
    res.status(201).json(await createContainerStudy(req.params.inquiryId, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/container-studies', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  const inquiryId = (req.body as { inquiryId?: string })?.inquiryId;
  if (!inquiryId) {
    res.status(400).json({ error: 'inquiryId is required.', code: 'VALIDATION_FAILED' });
    return;
  }
  try {
    res.status(201).json(await createContainerStudy(inquiryId, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/inquiries/:inquiryId/container-studies', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json({ studies: await listContainerStudiesForInquiry(req.params.inquiryId, actor) });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/container-studies/:id', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json(await getContainerStudy(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/container-studies/:id/input-snapshot', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  try {
    res.status(201).json(await createContainerStudyInputSnapshot(req.params.id, req.body || {}, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/container-studies/:id/input-snapshot', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json(await getContainerStudyInputSnapshot(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.put('/container-studies/:id/input-snapshot', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  res.status(409).json({ error: 'Input snapshots are immutable.', code: 'CONFLICT' });
});

containerStudyRouter.patch('/container-studies/:id/input-snapshot', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  res.status(409).json({ error: 'Input snapshots are immutable.', code: 'CONFLICT' });
});

containerStudyRouter.post('/container-studies/:id/snapshots', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCreateContainerStudy);
  if (!actor) return;
  res.status(409).json({
    error:
      'Authoritative input snapshots must be created through POST /container-studies/:id/input-snapshot. Client-supplied drums are not accepted. Population changes require SUPERSEDE.',
    code: 'CONFLICT',
    details: {
      issues: [
        {
          code: 'CLIENT_DRUM_SNAPSHOT_NOT_ALLOWED',
          message: 'The legacy client-drum snapshot path is closed. Use the B2 input-snapshot resolver.',
        },
      ],
    },
  });
});

containerStudyRouter.post('/container-studies/:id/validate', async (req, res) => {
  const actor = await requireActor(req, res, assertCanValidateContainerStudy);
  if (!actor) return;
  try {
    res.json(await validateContainerStudy(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/container-studies/:id/confirm', async (req, res) => {
  const actor = await requireActor(req, res, assertCanConfirmContainerStudy);
  if (!actor) return;
  try {
    res.json(await confirmContainerStudy(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.post('/container-studies/:id/supersede', async (req, res) => {
  const actor = await requireActor(req, res, assertCanSupersedeContainerStudy);
  if (!actor) return;
  try {
    res.status(201).json(await supersedeContainerStudy(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/container-studies/:id/results', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json({ results: await listContainerStudyResults(req.params.id, actor) });
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.get('/container-studies/:id/results/:resultId', async (req, res) => {
  const actor = await requireActor(req, res, assertCanViewContainerStudy);
  if (!actor) return;
  try {
    res.json(await getContainerStudyResult(req.params.id, req.params.resultId, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});

containerStudyRouter.put('/container-studies/:id/results/:resultId', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCalculateContainerStudy);
  if (!actor) return;
  res.status(409).json({ error: 'Container Study results are immutable.', code: 'CONFLICT' });
});

containerStudyRouter.patch('/container-studies/:id/results/:resultId', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCalculateContainerStudy);
  if (!actor) return;
  res.status(409).json({ error: 'Container Study results are immutable.', code: 'CONFLICT' });
});

containerStudyRouter.post('/container-studies/:id/calculate', async (req, res) => {
  const actor = await requireActor(req, res, assertCanCalculateContainerStudy);
  if (!actor) return;
  try {
    res.json(await calculateContainerStudy(req.params.id, actor));
  } catch (err) {
    if (!sendDomainError(res, err)) res.status(500).json({ error: (err as Error).message });
  }
});
