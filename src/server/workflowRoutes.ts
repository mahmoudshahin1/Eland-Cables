import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import {
  assignTask,
  cancelWorkflow,
  completeTask,
  getCurrentStep,
  getTasks,
  getWorkflow,
  getWorkflowForEntity,
  listMyWorkflowTasks,
  listWorkflowTemplates,
  startWorkflow,
  transitionWorkflow,
} from './workflowRuntimeRepository';
import {
  isGenericWorkflowEngineEnabled,
  STANDARD_WORKFLOW_STEP_PRESENTATION,
  vipUsesStandardInquiryTemplate,
  workflowQueues,
} from '../platform/workflow/workflowPresentationMetadata';

export const workflowRouter = Router();

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

function handleErr(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  if (err instanceof DomainError) {
    const status = err.code === 'UNAUTHORIZED' && /sign in/i.test(err.message) ? 401 : 403;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  const e = err as Error & { code?: string; http?: number };
  if (e.code === 'NOT_FOUND') return res.status(404).json({ error: e.message, code: e.code });
  if (e.code === 'UNAUTHORIZED' || e.http === 401) {
    return res.status(401).json({ error: e.message, code: 'UNAUTHORIZED' });
  }
  if (e.code === 'INVALID_WORKFLOW_TRANSITION' || e.code === 'WORKFLOW_CONDITION_FAILED' || e.code === 'INVALID_STATE') {
    return res.status(409).json({ error: e.message, code: e.code });
  }
  return res.status(e.http || 400).json({ error: e.message, code: e.code || 'BAD_REQUEST' });
}

workflowRouter.post('/start', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await startWorkflow({
      templateCode: String(req.body.templateCode || ''),
      entityType: String(req.body.entityType || ''),
      entityId: String(req.body.entityId || ''),
      customerMasterId: req.body.customerMasterId ?? null,
      contextJson: req.body.contextJson,
      actor,
      initialTransitionCode: req.body.initialTransitionCode,
    });
    res.status(201).json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.get('/instances/:instanceId', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await getWorkflow(req.params.instanceId, actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.get('/instances/:instanceId/current-step', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await getCurrentStep(req.params.instanceId, actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.get('/instances/:instanceId/tasks', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await getTasks(req.params.instanceId, actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.get('/my-tasks', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const tasks = await listMyWorkflowTasks(actor);
    res.json({ tasks });
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.get('/by-entity/:entityType/:entityId', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await getWorkflowForEntity(req.params.entityType, req.params.entityId, actor);
    if (!result) return res.status(404).json({ error: 'No active workflow instance.', code: 'NOT_FOUND' });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.post('/instances/:instanceId/transition', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await transitionWorkflow(
      req.params.instanceId,
      String(req.body.transitionCode || ''),
      actor,
      { taskResult: req.body.taskResult ?? null }
    );
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.post('/tasks/:taskId/assign', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await assignTask(
      req.params.taskId,
      {
        assignmentType: req.body.assignmentType,
        assigneeRef: String(req.body.assigneeRef || ''),
      },
      actor
    );
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.post('/tasks/:taskId/complete', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await completeTask(req.params.taskId, { result: req.body.result }, actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.post('/instances/:instanceId/cancel', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await cancelWorkflow(req.params.instanceId, actor, req.body?.reason);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.get('/templates', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const result = await listWorkflowTemplates(actor);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.post('/templates', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    await listWorkflowTemplates(actor);
    res.status(501).json({
      error: 'Template authoring is read-only in 05I-B. Use migration seed for STANDARD_INQUIRY_V1.',
      code: 'NOT_IMPLEMENTED',
    });
  } catch (err) {
    handleErr(err, res);
  }
});

workflowRouter.get('/presentation', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    if (!actor.id && !actor.email && !actor.name) {
      return res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    }
    res.json({
      genericEngine: isGenericWorkflowEngineEnabled(),
      vipUsesStandardTemplate: vipUsesStandardInquiryTemplate(),
      steps: STANDARD_WORKFLOW_STEP_PRESENTATION,
      queues: workflowQueues(),
    });
  } catch (err) {
    handleErr(err, res);
  }
});
