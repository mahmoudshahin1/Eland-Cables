import {
  Prisma,
  WorkflowAssignmentType,
  WorkflowEventType,
  WorkflowInstanceStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { getPrisma } from './db';
import { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import {
  assertCanAssignWorkflow,
  assertCanCancelWorkflow,
  assertCanCompleteWorkflowTask,
  assertCanStartWorkflow,
  assertCanTransitionWorkflow,
  assertCanViewWorkflow,
  assertCanAdminWorkflow,
} from './rbac';
import { assertCanAccessInquiryOwnership } from './rbac';
import {
  STANDARD_INQUIRY_TEMPLATE_CODE,
  WORKFLOW_ENTITY_COMMERCIAL_INQUIRY,
  WorkflowTemplateView,
  assertTransitionAllowed,
  isTerminalStep,
  parseTransitionCondition,
  stepAllowsCustomerAction,
  taskTitleForStep,
} from '../domain/workflowRuntimeService';
import { getInquiryProcessCode } from '../domain/inquiryProcessCommands';
import { readInquiryProcessFromMetadata } from '../domain/inquiryProcessResolver';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) {
    const err = new Error('Database is not configured.');
    (err as Error & { code: string }).code = 'DB_UNAVAILABLE';
    throw err;
  }
  return prisma;
}

const instanceInclude = {
  template: { include: { steps: true, transitions: true } },
  tasks: { include: { assignments: true }, orderBy: { createdAt: 'asc' as const } },
  events: { orderBy: { createdAt: 'asc' as const } },
  stageTimings: { orderBy: { startedAt: 'asc' as const } },
} satisfies Prisma.WorkflowInstanceInclude;

async function recordStageExit(
  tx: Prisma.TransactionClient,
  instanceId: string,
  stepCode: string,
  owner?: string | null
) {
  const open = await tx.workflowStageTiming.findFirst({
    where: { instanceId, stepCode, completedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!open) return;
  const completedAt = new Date();
  const durationSeconds = Math.max(0, Math.round((completedAt.getTime() - open.startedAt.getTime()) / 1000));
  await tx.workflowStageTiming.update({
    where: { id: open.id },
    data: {
      completedAt,
      durationSeconds,
      owner: owner ?? open.owner,
    },
  });
}

async function recordStageEnter(
  tx: Prisma.TransactionClient,
  instanceId: string,
  stepCode: string,
  owner?: string | null
) {
  await tx.workflowStageTiming.create({
    data: {
      instanceId,
      stepCode,
      startedAt: new Date(),
      owner: owner ?? null,
    },
  });
}

function toTemplateView(template: {
  id: string;
  code: string;
  version: number;
  name: string;
  inquiryProcessCode: string | null;
  steps: Array<{
    stepCode: string;
    name: string;
    sortOrder: number;
    isTerminal: boolean;
    allowCustomerAction: boolean;
    requiredPermission: string | null;
  }>;
  transitions: Array<{
    transitionCode: string;
    fromStepCode: string;
    toStepCode: string;
    label: string | null;
    conditionJson: unknown;
  }>;
}): WorkflowTemplateView {
  return {
    id: template.id,
    code: template.code,
    version: template.version,
    name: template.name,
    inquiryProcessCode: template.inquiryProcessCode as WorkflowTemplateView['inquiryProcessCode'],
    steps: template.steps.map((s) => ({ ...s })),
    transitions: template.transitions.map((t) => ({
      ...t,
      conditionJson: parseTransitionCondition(t.conditionJson),
    })),
  };
}

async function appendWorkflowEvent(
  tx: Prisma.TransactionClient,
  input: {
    instanceId: string;
    eventType: WorkflowEventType;
    fromStepCode?: string | null;
    toStepCode?: string | null;
    taskId?: string | null;
    actor?: RequestActor;
    payloadJson?: unknown;
  }
) {
  await tx.workflowEvent.create({
    data: {
      instanceId: input.instanceId,
      eventType: input.eventType,
      fromStepCode: input.fromStepCode ?? null,
      toStepCode: input.toStepCode ?? null,
      taskId: input.taskId ?? null,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name || input.actor?.email || null,
      payloadJson: input.payloadJson === undefined ? undefined : (input.payloadJson as Prisma.InputJsonValue),
    },
  });
}

async function createStepTask(
  tx: Prisma.TransactionClient,
  input: {
    instanceId: string;
    stepCode: string;
    actor?: RequestActor;
    assignRole?: string;
  }
) {
  const task = await tx.workflowTask.create({
    data: {
      instanceId: input.instanceId,
      stepCode: input.stepCode,
      title: taskTitleForStep(input.stepCode),
      status: 'PENDING',
    },
    include: { assignments: true },
  });

  if (input.assignRole) {
    await tx.workflowAssignment.create({
      data: {
        taskId: task.id,
        assignmentType: 'ROLE',
        assigneeRef: input.assignRole,
      },
    });
  }

  await appendWorkflowEvent(tx, {
    instanceId: input.instanceId,
    eventType: 'TASK_CREATED',
    toStepCode: input.stepCode,
    taskId: task.id,
    actor: input.actor,
    payloadJson: { stepCode: input.stepCode, title: task.title },
  });

  return task;
}

async function assertWorkflowScope(actor: RequestActor, instance: { customerMasterId: string | null; entityType: string; entityId: string }) {
  if (instance.entityType === WORKFLOW_ENTITY_COMMERCIAL_INQUIRY) {
    const prisma = requirePrisma();
    const inquiry = await prisma.commercialInquiry.findFirst({
      where: { OR: [{ id: instance.entityId }, { inquiryNumber: instance.entityId }] },
      select: { customerId: true, customerMasterId: true },
    });
    if (inquiry) {
      assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
      return;
    }
  }
  if (actor.userType === 'customer' && instance.customerMasterId) {
    const keys = new Set(
      [
        actor.customerId,
        actor.customerCode,
        actor.id,
        actor.email,
        ...(actor.customerScopeKeys || []),
        ...(actor.customerMasterIds || []),
      ].filter((v): v is string => Boolean(v))
    );
    if (keys.has(instance.customerMasterId)) {
      return;
    }
  }
  if (actor.userType === 'customer') {
    const err = new Error('Access denied: workflow instance is outside your customer scope.') as Error & {
      code: string;
    };
    err.code = 'UNAUTHORIZED';
    throw err;
  }
}

export async function getWorkflowTemplateByCode(code: string, version?: number) {
  const prisma = requirePrisma();
  const template = await prisma.workflowTemplate.findFirst({
    where: version ? { code, version } : { code, isActive: true },
    orderBy: version ? undefined : { version: 'desc' },
    include: { steps: { orderBy: { sortOrder: 'asc' } }, transitions: true },
  });
  if (!template) {
    const err = new Error(`Workflow template ${code} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  return toTemplateView(template);
}

export async function listWorkflowTemplates(actor: RequestActor) {
  assertCanAdminWorkflow(actor);
  const prisma = requirePrisma();
  const templates = await prisma.workflowTemplate.findMany({
    include: { steps: { orderBy: { sortOrder: 'asc' } }, transitions: true },
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
  });
  return templates.map(toTemplateView);
}

export async function startWorkflow(input: {
  templateCode: string;
  entityType: string;
  entityId: string;
  customerMasterId?: string | null;
  contextJson?: Record<string, unknown>;
  actor: RequestActor;
  initialTransitionCode?: string;
}) {
  assertCanStartWorkflow(input.actor);
  return startWorkflowCore(input);
}

async function startWorkflowCore(input: {
  templateCode: string;
  entityType: string;
  entityId: string;
  customerMasterId?: string | null;
  contextJson?: Record<string, unknown>;
  actor: RequestActor;
  initialTransitionCode?: string;
}) {
  const prisma = requirePrisma();

  const existing = await prisma.workflowInstance.findFirst({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'ACTIVE',
    },
    include: instanceInclude,
  });
  if (existing) {
    return serializeInstance(existing);
  }

  const template = await getWorkflowTemplateByCode(input.templateCode);
  const templateView = template;
  const startTransition = assertTransitionAllowed(
    templateView,
    'SUBMITTED',
    input.initialTransitionCode ?? 'START',
    {
      inquiryProcessCode: (input.contextJson?.inquiryProcessCode as never) ?? null,
    }
  );

  const instance = await prisma.$transaction(async (tx) => {
    const created = await tx.workflowInstance.create({
      data: {
        templateId: template.id,
        templateCode: template.code,
        templateVersion: template.version,
        entityType: input.entityType,
        entityId: input.entityId,
        currentStepCode: 'SUBMITTED',
        status: 'ACTIVE',
        contextJson: input.contextJson as Prisma.InputJsonValue,
        customerMasterId: input.customerMasterId ?? null,
        startedBy: input.actor.id || input.actor.email || input.actor.name || null,
      },
    });

    await appendWorkflowEvent(tx, {
      instanceId: created.id,
      eventType: 'INSTANCE_STARTED',
      toStepCode: 'SUBMITTED',
      actor: input.actor,
      payloadJson: { templateCode: template.code, templateVersion: template.version },
    });
    await recordStageEnter(tx, created.id, 'SUBMITTED', input.actor.name || input.actor.email || null);
    await recordStageExit(tx, created.id, 'SUBMITTED', input.actor.name || input.actor.email || null);

    const updated = await tx.workflowInstance.update({
      where: { id: created.id },
      data: { currentStepCode: startTransition.toStepCode },
    });

    await appendWorkflowEvent(tx, {
      instanceId: created.id,
      eventType: 'TRANSITION',
      fromStepCode: 'SUBMITTED',
      toStepCode: startTransition.toStepCode,
      actor: input.actor,
      payloadJson: { transitionCode: startTransition.transitionCode },
    });
    await recordStageEnter(
      tx,
      created.id,
      startTransition.toStepCode,
      input.actor.name || input.actor.email || null
    );

    await createStepTask(tx, {
      instanceId: created.id,
      stepCode: startTransition.toStepCode,
      actor: input.actor,
      assignRole: startTransition.toStepCode === 'TECHNICAL_REVIEW' ? 'TECHNICAL_OFFICE_ENGINEER' : undefined,
    });

    return updated;
  });

  await appendServerAudit({
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email,
    entity: 'WorkflowInstance',
    entityId: instance.id,
    action: 'WORKFLOW_STARTED',
    newValue: {
      templateCode: template.code,
      templateVersion: template.version,
      entityType: input.entityType,
      entityId: input.entityId,
      currentStepCode: startTransition.toStepCode,
    },
    message: `Started workflow ${template.code} v${template.version} for ${input.entityType}:${input.entityId}`,
  });

  return getWorkflow(instance.id, input.actor);
}

export async function getWorkflow(instanceId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const instance = await prisma.workflowInstance.findFirst({
    where: { OR: [{ id: instanceId }, { entityId: instanceId, status: 'ACTIVE' }] },
    include: instanceInclude,
    orderBy: { createdAt: 'desc' },
  });
  if (!instance) {
    const err = new Error(`Workflow instance ${instanceId} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  assertCanViewWorkflow(actor);
  await assertWorkflowScope(actor, instance);
  return serializeInstance(instance);
}

export async function findActiveWorkflowForEntity(entityType: string, entityId: string) {
  const prisma = requirePrisma();
  return prisma.workflowInstance.findFirst({
    where: { entityType, entityId, status: 'ACTIVE' },
    include: instanceInclude,
  });
}

export async function getWorkflowForEntity(entityType: string, entityId: string, actor: RequestActor) {
  const instance = await findActiveWorkflowForEntity(entityType, entityId);
  if (!instance) return null;
  assertCanViewWorkflow(actor);
  await assertWorkflowScope(actor, instance);
  return serializeInstance(instance);
}

export async function getCurrentStep(instanceId: string, actor: RequestActor) {
  const wf = await getWorkflow(instanceId, actor);
  const step = wf.template.steps.find((s) => s.stepCode === wf.currentStepCode);
  return { instanceId: wf.id, currentStepCode: wf.currentStepCode, step: step ?? null };
}

export async function getTasks(instanceId: string, actor: RequestActor) {
  const wf = await getWorkflow(instanceId, actor);
  return wf.tasks;
}

export async function assignTask(
  taskId: string,
  input: { assignmentType: WorkflowAssignmentType; assigneeRef: string },
  actor: RequestActor
) {
  assertCanAssignWorkflow(actor);
  const prisma = requirePrisma();
  const task = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    include: { instance: true, assignments: true },
  });
  if (!task) {
    const err = new Error(`Workflow task ${taskId} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  await assertWorkflowScope(actor, task.instance);

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.workflowAssignment.deleteMany({ where: { taskId } });
    const created = await tx.workflowAssignment.create({
      data: {
        taskId,
        assignmentType: input.assignmentType,
        assigneeRef: input.assigneeRef,
      },
    });
    await tx.workflowTask.update({
      where: { id: taskId },
      data: { status: task.status === 'PENDING' ? 'IN_PROGRESS' : task.status },
    });
    await appendWorkflowEvent(tx, {
      instanceId: task.instanceId,
      eventType: 'TASK_ASSIGNED',
      taskId,
      actor,
      payloadJson: input,
    });
    return created;
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'WorkflowTask',
    entityId: taskId,
    action: 'WORKFLOW_TASK_ASSIGNED',
    newValue: input,
  });

  return assignment;
}

export async function completeTask(
  taskId: string,
  input: { result?: Record<string, unknown> },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const task = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    include: { instance: { include: { template: { include: { steps: true, transitions: true } } } } },
  });
  if (!task) {
    const err = new Error(`Workflow task ${taskId} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  await assertWorkflowScope(actor, task.instance);

  const templateView = toTemplateView(task.instance.template);
  const customerStep = stepAllowsCustomerAction(templateView, task.stepCode);
  if (customerStep) {
    assertCanCompleteWorkflowTask(actor, { customerAction: true });
    if (actor.userType !== 'customer') {
      const err = new Error('Only customer users may complete customer-action workflow tasks.') as Error & {
        code: string;
      };
      err.code = 'UNAUTHORIZED';
      throw err;
    }
  } else {
    assertCanCompleteWorkflowTask(actor, { customerAction: false });
  }

  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
    const err = new Error(`Task ${taskId} is already ${task.status}.`) as Error & { code: string };
    err.code = 'INVALID_STATE';
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflowTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: actor.id || actor.email || actor.name || null,
        resultJson: input.result as Prisma.InputJsonValue,
      },
    });
    await appendWorkflowEvent(tx, {
      instanceId: task.instanceId,
      eventType: 'TASK_COMPLETED',
      taskId,
      actor,
      payloadJson: input.result,
    });
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'WorkflowTask',
    entityId: taskId,
    action: 'WORKFLOW_TASK_COMPLETED',
    newValue: input.result,
  });

  const resultCode = typeof input.result?.result === 'string' ? input.result.result : null;
  if (task.stepCode === 'CUSTOMER_RESPONSE' && resultCode === 'RESPONDED') {
    return transitionWorkflow(task.instanceId, 'CUSTOMER_RESPONDED', actor, { taskResult: 'RESPONDED' });
  }
  if (task.stepCode === 'CUSTOMER_DECISION' && resultCode === 'ACCEPTED') {
    return transitionWorkflow(task.instanceId, 'TO_COMMITMENT', actor, { taskResult: 'ACCEPTED' });
  }

  return getWorkflow(task.instanceId, actor);
}

export async function transitionWorkflow(
  instanceId: string,
  transitionCode: string,
  actor: RequestActor,
  context: { taskResult?: string | null } = {},
  options?: { orchestrator?: boolean }
) {
  const prisma = requirePrisma();
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { template: { include: { steps: true, transitions: true } }, tasks: true },
  });
  if (!instance) {
    const err = new Error(`Workflow instance ${instanceId} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (instance.status !== 'ACTIVE') {
    const err = new Error(`Workflow instance ${instanceId} is ${instance.status}.`) as Error & { code: string };
    err.code = 'INVALID_STATE';
    throw err;
  }

  await assertWorkflowScope(actor, instance);

  const templateView = toTemplateView(instance.template);
  const currentStep = templateView.steps.find((s) => s.stepCode === instance.currentStepCode);
  const customerStep = currentStep?.allowCustomerAction === true;

  if (!options?.orchestrator) {
    if (customerStep) {
      if (actor.userType !== 'customer') {
        const err = new Error('Customer-action steps may only be advanced by customer users.') as Error & {
          code: string;
        };
        err.code = 'UNAUTHORIZED';
        throw err;
      }
      assertCanCompleteWorkflowTask(actor, { customerAction: true });
    } else {
      assertCanTransitionWorkflow(actor);
    }
  }

  const inquiryProcessCode =
    instance.entityType === WORKFLOW_ENTITY_COMMERCIAL_INQUIRY
      ? await resolveInquiryProcessForEntity(instance.entityId)
      : null;

  const transition = assertTransitionAllowed(templateView, instance.currentStepCode, transitionCode, {
    inquiryProcessCode,
    taskResult: context.taskResult ?? null,
  });

  const terminal = transition.transitionCode === 'COMPLETE' || isTerminalStep(templateView, transition.toStepCode);

  await prisma.$transaction(async (tx) => {
    await tx.workflowTask.updateMany({
      where: { instanceId, stepCode: instance.currentStepCode, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      data: { status: 'COMPLETED', completedAt: new Date(), completedBy: actor.id || actor.email || null },
    });
    await recordStageExit(tx, instanceId, instance.currentStepCode, actor.name || actor.email || actor.id || null);

    await appendWorkflowEvent(tx, {
      instanceId,
      eventType: 'TRANSITION',
      fromStepCode: instance.currentStepCode,
      toStepCode: transition.toStepCode,
      actor,
      payloadJson: { transitionCode, orchestrator: options?.orchestrator === true },
    });

    if (terminal) {
      await tx.workflowInstance.update({
        where: { id: instanceId },
        data: {
          currentStepCode: transition.toStepCode,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      await appendWorkflowEvent(tx, {
        instanceId,
        eventType: 'INSTANCE_COMPLETED',
        toStepCode: transition.toStepCode,
        actor,
      });
      await recordStageEnter(tx, instanceId, transition.toStepCode, actor.name || actor.email || null);
      await recordStageExit(tx, instanceId, transition.toStepCode, actor.name || actor.email || null);
    } else {
      await tx.workflowInstance.update({
        where: { id: instanceId },
        data: { currentStepCode: transition.toStepCode },
      });
      if (transition.toStepCode !== instance.currentStepCode) {
        await createStepTask(tx, {
          instanceId,
          stepCode: transition.toStepCode,
          actor,
          assignRole: roleForStep(transition.toStepCode),
        });
        await recordStageEnter(tx, instanceId, transition.toStepCode, actor.name || actor.email || null);
      }
    }
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'WorkflowInstance',
    entityId: instanceId,
    action: 'WORKFLOW_TRANSITION',
    oldValue: { fromStepCode: instance.currentStepCode },
    newValue: { toStepCode: transition.toStepCode, transitionCode, orchestrator: options?.orchestrator === true },
  });

  if (options?.orchestrator) {
    const refreshed = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: instanceInclude,
    });
    return serializeInstance(refreshed!);
  }

  return getWorkflow(instanceId, actor);
}

export async function cancelWorkflow(instanceId: string, actor: RequestActor, reason?: string) {
  assertCanCancelWorkflow(actor);
  const prisma = requirePrisma();
  const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
  if (!instance) {
    const err = new Error(`Workflow instance ${instanceId} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (instance.status !== 'ACTIVE') {
    const err = new Error(`Workflow instance ${instanceId} is already ${instance.status}.`) as Error & { code: string };
    err.code = 'INVALID_STATE';
    throw err;
  }
  await assertWorkflowScope(actor, instance);

  await prisma.$transaction(async (tx) => {
    await tx.workflowTask.updateMany({
      where: { instanceId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      data: { status: 'CANCELLED' },
    });
    await tx.workflowInstance.update({
      where: { id: instanceId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    await appendWorkflowEvent(tx, {
      instanceId,
      eventType: 'INSTANCE_CANCELLED',
      fromStepCode: instance.currentStepCode,
      actor,
      payloadJson: { reason },
    });
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'WorkflowInstance',
    entityId: instanceId,
    action: 'WORKFLOW_CANCELLED',
    newValue: { reason },
  });

  return getWorkflow(instanceId, actor);
}

export async function listMyWorkflowTasks(actor: RequestActor) {
  assertCanViewWorkflow(actor);
  const prisma = requirePrisma();
  const roleCodes = actor.roles?.filter(Boolean) || (actor.role ? [actor.role] : []);
  const assigneeRefs = [...roleCodes, actor.id, actor.email].filter((v): v is string => Boolean(v));
  const tasks = await prisma.workflowTask.findMany({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      instance: { status: 'ACTIVE' },
      ...(actor.userType === 'customer'
        ? {
            instance: {
              status: 'ACTIVE',
              customerMasterId: { in: actor.customerMasterIds || [] },
            },
            stepCode: { in: ['CUSTOMER_RESPONSE', 'CUSTOMER_DECISION'] },
          }
        : {
            OR: [
              { assignments: { some: { assigneeRef: { in: assigneeRefs } } } },
              { assignments: { none: {} } },
            ],
          }),
    },
    include: {
      assignments: true,
      instance: {
        select: {
          id: true,
          entityType: true,
          entityId: true,
          currentStepCode: true,
          customerMasterId: true,
          templateCode: true,
          startedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const scoped = [];
  for (const task of tasks) {
    try {
      await assertWorkflowScope(actor, task.instance);
      scoped.push(task);
    } catch {
      // skip out-of-scope
    }
  }

  return scoped.map((task) => ({
    id: task.id,
    stepCode: task.stepCode,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    assignments: task.assignments,
    instanceId: task.instance.id,
    entityType: task.instance.entityType,
    entityId: task.instance.entityId,
    currentStepCode: task.instance.currentStepCode,
    templateCode: task.instance.templateCode,
  }));
}

function roleForStep(stepCode: string): string | undefined {
  if (stepCode === 'TECHNICAL_REVIEW') return 'TECHNICAL_OFFICE_ENGINEER';
  if (stepCode === 'COSTING') return 'COSTING_USER';
  if (stepCode === 'SALES_REVIEW' || stepCode === 'QUOTATION_APPROVAL' || stepCode === 'QUOTATION_ISSUE') {
    return 'SALES_MANAGER';
  }
  return undefined;
}

async function resolveInquiryProcessForEntity(entityId: string) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: entityId }, { inquiryNumber: entityId }] },
    select: { commercialMetadata: true },
  });
  if (!inquiry) return null;
  return getInquiryProcessCode(inquiry);
}

function serializeInstance(instance: {
  id: string;
  templateId: string;
  templateCode: string;
  templateVersion: number;
  entityType: string;
  entityId: string;
  currentStepCode: string;
  status: WorkflowInstanceStatus;
  contextJson: unknown;
  customerMasterId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  startedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: {
    id: string;
    code: string;
    version: number;
    name: string;
    inquiryProcessCode: string | null;
    steps: Array<{
      stepCode: string;
      name: string;
      sortOrder: number;
      isTerminal: boolean;
      allowCustomerAction: boolean;
      requiredPermission: string | null;
    }>;
    transitions: Array<{
      transitionCode: string;
      fromStepCode: string;
      toStepCode: string;
      label: string | null;
      conditionJson: unknown;
    }>;
  };
  tasks: Array<{
    id: string;
    stepCode: string;
    title: string;
    status: WorkflowTaskStatus;
    resultJson: unknown;
    dueAt: Date | null;
    completedAt: Date | null;
    completedBy: string | null;
    createdAt: Date;
    assignments: Array<{
      id: string;
      assignmentType: WorkflowAssignmentType;
      assigneeRef: string;
    }>;
  }>;
  events: Array<{
    id: string;
    eventType: WorkflowEventType;
    fromStepCode: string | null;
    toStepCode: string | null;
    taskId: string | null;
    actorId: string | null;
    actorName: string | null;
    payloadJson: unknown;
    createdAt: Date;
  }>;
  stageTimings?: Array<{
    id: string;
    stepCode: string;
    startedAt: Date;
    completedAt: Date | null;
    durationSeconds: number | null;
    owner: string | null;
  }>;
}) {
  const template = toTemplateView(instance.template);
  const currentStep = template.steps.find((s) => s.stepCode === instance.currentStepCode) ?? null;
  const openTasks = instance.tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  const now = Date.now();
  const stageTimings = (instance.stageTimings || []).map((t) => {
    const elapsed =
      t.durationSeconds ??
      Math.max(0, Math.round((now - t.startedAt.getTime()) / 1000));
    return {
      id: t.id,
      stepCode: t.stepCode,
      name: template.steps.find((s) => s.stepCode === t.stepCode)?.name ?? t.stepCode,
      startedAt: t.startedAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      durationSeconds: t.completedAt ? t.durationSeconds : elapsed,
      owner: t.owner,
      isCurrent: t.stepCode === instance.currentStepCode && !t.completedAt,
    };
  });
  const totalDurationSeconds = Math.max(
    0,
    Math.round((now - instance.startedAt.getTime()) / 1000)
  );
  return {
    id: instance.id,
    templateCode: instance.templateCode,
    templateVersion: instance.templateVersion,
    entityType: instance.entityType,
    entityId: instance.entityId,
    currentStepCode: instance.currentStepCode,
    currentStep,
    status: instance.status,
    contextJson: instance.contextJson,
    customerMasterId: instance.customerMasterId,
    startedAt: instance.startedAt.toISOString(),
    completedAt: instance.completedAt?.toISOString() ?? null,
    startedBy: instance.startedBy,
    totalDurationSeconds,
    stageTimings,
    template,
    tasks: instance.tasks.map((t) => ({
      id: t.id,
      stepCode: t.stepCode,
      title: t.title,
      status: t.status,
      resultJson: t.resultJson,
      dueAt: t.dueAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      completedBy: t.completedBy,
      createdAt: t.createdAt.toISOString(),
      assignments: t.assignments,
    })),
    openTasks: openTasks.map((t) => ({
      id: t.id,
      stepCode: t.stepCode,
      title: t.title,
      status: t.status,
      assignments: t.assignments,
    })),
    events: instance.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      fromStepCode: e.fromStepCode,
      toStepCode: e.toStepCode,
      taskId: e.taskId,
      actorId: e.actorId,
      actorName: e.actorName,
      payloadJson: e.payloadJson,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Start STANDARD_INQUIRY_V1 for a submitted commercial inquiry (STANDARD_WORKFLOW only). */
export async function startStandardInquiryWorkflow(
  inquiry: { id: string; inquiryNumber: string; customerMasterId: string | null; commercialMetadata?: unknown },
  actor: RequestActor
) {
  const process = readInquiryProcessFromMetadata(inquiry.commercialMetadata);
  if (process?.processCode !== 'STANDARD_WORKFLOW') {
    return null;
  }
  return startWorkflowCore({
    templateCode: STANDARD_INQUIRY_TEMPLATE_CODE,
    entityType: WORKFLOW_ENTITY_COMMERCIAL_INQUIRY,
    entityId: inquiry.id,
    customerMasterId: inquiry.customerMasterId,
    contextJson: {
      inquiryProcessCode: 'STANDARD_WORKFLOW',
      inquiryNumber: inquiry.inquiryNumber,
    },
    actor,
  });
}

/** VIP_FAST_TRACK boundary — workflow runtime not started; audit stub only. */
export async function noteVipFastTrackWorkflowBoundary(
  inquiry: { id: string; inquiryNumber: string },
  actor: RequestActor
) {
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'VIP_FAST_TRACK_WORKFLOW_BOUNDARY',
    newValue: { workflowTemplate: null, note: 'VIP fast track bypasses STANDARD_INQUIRY_V1 runtime (05I-C orchestrator pending)' },
    message: `VIP fast track boundary recorded for ${inquiry.inquiryNumber}`,
  });
}
