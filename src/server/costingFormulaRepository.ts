import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import {
  assertSafeExpression,
  detectCircularDependencies,
  extractVariableReferences,
  FormulaError,
  parseExpression,
  previewFormula,
  validateFormula,
  VariableDefinition,
  FormulaGraphNode,
} from '../domain/costingFormulaEngine';
import { resolveFormulaCode } from './costingDocumentSequence';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

async function appendCostingAudit(
  entity: string,
  entityId: string,
  action: string,
  actor: { id?: string; name?: string; email?: string },
  oldValue?: unknown,
  newValue?: unknown,
  message?: string
) {
  const prisma = requirePrisma();
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      actorName: actorLabel(actor),
      entity,
      entityId,
      action,
      oldValue: oldValue != null ? (oldValue as Prisma.InputJsonValue) : undefined,
      newValue: newValue != null ? (newValue as Prisma.InputJsonValue) : undefined,
      message,
    },
  });
}

// ---------------------------------------------------------------------------
// Variable registry
// ---------------------------------------------------------------------------

export async function listCostingVariables(filter?: { status?: string; kind?: string }) {
  const prisma = requirePrisma();
  const rows = await prisma.costingVariable.findMany({
    where: {
      ...(filter?.status ? { status: filter.status as 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED' } : {}),
      ...(filter?.kind ? { kind: filter.kind as never } : {}),
    },
    include: {
      dependencies: {
        select: {
          formulaVersion: { select: { formula: { select: { code: true } } } },
        },
      },
    },
    orderBy: { code: 'asc' },
  });
  return rows.map((row) => {
    const usedBy = [...new Set(row.dependencies.map((d) => d.formulaVersion?.formula?.code).filter(Boolean))] as string[];
    const { dependencies, ...rest } = row;
    return { ...rest, usedBy };
  });
}

export async function createCostingVariable(
  data: {
    code: string;
    name: string;
    description?: string;
    kind: string;
    dataType?: string;
    unit?: string;
    sourceModule?: string;
    defaultValue?: number | string | null;
    metadata?: unknown;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const code = data.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
    const err = new Error('Variable code must be UPPER_SNAKE_CASE.');
    (err as Error & { code: string }).code = 'INVALID_VARIABLE_CODE';
    throw err;
  }

  const created = await prisma.costingVariable.create({
    data: {
      code,
      name: data.name,
      description: data.description,
      kind: data.kind as never,
      dataType: data.dataType || 'DECIMAL',
      unit: data.unit,
      sourceModule: data.sourceModule,
      defaultValue: data.defaultValue != null ? new Prisma.Decimal(String(data.defaultValue)) : null,
      metadata: data.metadata as Prisma.InputJsonValue,
      createdBy: actorLabel(actor),
    },
  });

  await appendCostingAudit('CostingVariable', created.id, 'COSTING_VARIABLE_CREATED', actor, undefined, { code });
  return created;
}

export async function updateCostingVariable(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    status: string;
    defaultValue: number | string | null;
    metadata: unknown;
  }>,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingVariable.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Costing variable not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (existing.isSystem && data.status === 'INACTIVE') {
    const err = new Error('System variables cannot be deactivated.');
    (err as Error & { code: string }).code = 'SYSTEM_VARIABLE_PROTECTED';
    throw err;
  }

  const updated = await prisma.costingVariable.update({
    where: { id },
    data: {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.description != null ? { description: data.description } : {}),
      ...(data.status != null ? { status: data.status as never } : {}),
      ...(data.defaultValue !== undefined
        ? { defaultValue: data.defaultValue != null ? new Prisma.Decimal(String(data.defaultValue)) : null }
        : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata as Prisma.InputJsonValue } : {}),
      updatedBy: actorLabel(actor),
    },
  });

  await appendCostingAudit('CostingVariable', id, 'COSTING_VARIABLE_UPDATED', actor, existing, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export async function listCostingComponents(filter?: { status?: string; kind?: string }) {
  const prisma = requirePrisma();
  return prisma.costingComponent.findMany({
    where: {
      ...(filter?.status ? { status: filter.status as never } : {}),
      ...(filter?.kind ? { kind: filter.kind as never } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}

export async function createCostingComponent(
  data: {
    code: string;
    name: string;
    description?: string;
    kind: string;
    sortOrder?: number;
    isConfigurable?: boolean;
    metadata?: unknown;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const code = data.code.trim().toUpperCase();

  const created = await prisma.costingComponent.create({
    data: {
      code,
      name: data.name,
      description: data.description,
      kind: data.kind as never,
      sortOrder: data.sortOrder ?? 0,
      isConfigurable: data.isConfigurable ?? true,
      metadata: data.metadata as Prisma.InputJsonValue,
      createdBy: actorLabel(actor),
    },
  });

  await appendCostingAudit('CostingComponent', created.id, 'COSTING_COMPONENT_CREATED', actor, undefined, { code });
  return created;
}

export async function updateCostingComponent(
  id: string,
  data: Partial<{ name: string; description: string; status: string; sortOrder: number; metadata: unknown }>,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingComponent.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Costing component not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const updated = await prisma.costingComponent.update({
    where: { id },
    data: {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.description != null ? { description: data.description } : {}),
      ...(data.status != null ? { status: data.status as never } : {}),
      ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata as Prisma.InputJsonValue } : {}),
      updatedBy: actorLabel(actor),
    },
  });

  await appendCostingAudit('CostingComponent', id, 'COSTING_COMPONENT_UPDATED', actor, existing, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function listCostingConfigurations() {
  const prisma = requirePrisma();
  return prisma.costingConfiguration.findMany({
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 5 } },
    orderBy: { code: 'asc' },
  });
}

export async function createCostingConfiguration(
  data: { code: string; name: string; description?: string },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const code = data.code.trim().toUpperCase();

  const config = await prisma.costingConfiguration.create({
    data: {
      code,
      name: data.name,
      description: data.description,
      createdBy: actorLabel(actor),
      versions: {
        create: {
          versionNo: 1,
          status: 'DRAFT',
          workflowStatus: 'DRAFT',
          createdBy: actorLabel(actor),
        },
      },
    },
    include: { versions: true },
  });

  await appendCostingAudit('CostingConfiguration', config.id, 'COSTING_CONFIG_CREATED', actor, undefined, { code });
  return config;
}

export async function createConfigurationVersion(
  configurationId: string,
  actor: { id?: string; name?: string; email?: string },
  changeNotes?: string
) {
  const prisma = requirePrisma();
  const config = await prisma.costingConfiguration.findUnique({
    where: { id: configurationId },
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
  });
  if (!config) {
    const err = new Error('Costing configuration not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const nextVersion = (config.versions[0]?.versionNo ?? 0) + 1;
  const version = await prisma.costingConfigurationVersion.create({
    data: {
      configurationId,
      versionNo: nextVersion,
      status: 'DRAFT',
      workflowStatus: 'DRAFT',
      changeNotes,
      createdBy: actorLabel(actor),
    },
  });

  await appendCostingAudit('CostingConfigurationVersion', version.id, 'COSTING_CONFIG_VERSION_CREATED', actor, undefined, {
    configurationId,
    versionNo: nextVersion,
  });
  return version;
}

export async function activateConfigurationVersion(
  versionId: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const version = await prisma.costingConfigurationVersion.findUnique({
    where: { id: versionId },
    include: { configuration: true },
  });
  if (!version) {
    const err = new Error('Configuration version not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    const previous = await tx.costingConfigurationVersion.findMany({
      where: { configurationId: version.configurationId, isCurrent: true },
    });
    for (const prev of previous) {
      await tx.costingConfigurationVersion.update({
        where: { id: prev.id },
        data: { isCurrent: false, status: 'SUPERSEDED', workflowStatus: 'SUPERSEDED', deactivatedAt: new Date() },
      });
    }
    await tx.costingConfigurationVersion.update({
      where: { id: versionId },
      data: {
        status: 'ACTIVE',
        workflowStatus: 'ACTIVE',
        isCurrent: true,
        activatedAt: new Date(),
        approvedBy: actorLabel(actor),
        approvedAt: new Date(),
      },
    });
    await tx.costingConfiguration.update({
      where: { id: version.configurationId },
      data: { status: 'ACTIVE', updatedBy: actorLabel(actor) },
    });
  });

  await appendCostingAudit('CostingConfigurationVersion', versionId, 'COSTING_CONFIG_VERSION_ACTIVATED', actor);
  return prisma.costingConfigurationVersion.findUnique({ where: { id: versionId } });
}

async function transitionConfigVersion(
  versionId: string,
  from: string[],
  to: string,
  actor: { id?: string; name?: string; email?: string },
  action: string
) {
  const prisma = requirePrisma();
  const version = await prisma.costingConfigurationVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    const err = new Error('Configuration version not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!from.includes(version.workflowStatus)) {
    const err = new Error(`Cannot transition workflow from ${version.workflowStatus} to ${to}.`);
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }
  const updated = await prisma.costingConfigurationVersion.update({
    where: { id: versionId },
    data: { workflowStatus: to as never, status: to as never, updatedBy: actorLabel(actor) },
  });
  await appendCostingAudit('CostingConfigurationVersion', versionId, action, actor, { workflowStatus: version.workflowStatus }, { workflowStatus: to });
  return updated;
}

export function submitConfigurationVersion(versionId: string, actor: { id?: string; name?: string; email?: string }) {
  return transitionConfigVersion(versionId, ['DRAFT', 'VALIDATION'], 'SUBMITTED', actor, 'COSTING_CONFIG_VERSION_SUBMITTED');
}

export function validateConfigurationVersion(versionId: string, actor: { id?: string; name?: string; email?: string }) {
  return transitionConfigVersion(versionId, ['DRAFT'], 'VALIDATION', actor, 'COSTING_CONFIG_VERSION_VALIDATED');
}

export function approveConfigurationVersion(versionId: string, actor: { id?: string; name?: string; email?: string }) {
  return transitionConfigVersion(versionId, ['SUBMITTED'], 'APPROVED', actor, 'COSTING_CONFIG_VERSION_APPROVED');
}

export async function submitCostingFormula(formulaId: string, actor: { id?: string; name?: string; email?: string }) {
  const prisma = requirePrisma();
  const formula = await prisma.costingFormula.findUnique({ where: { id: formulaId } });
  if (!formula) {
    const err = new Error('Costing formula not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!['DRAFT', 'VALIDATION'].includes(formula.status)) {
    const err = new Error('Only DRAFT formulas can be submitted.');
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }
  const updated = await prisma.costingFormula.update({
    where: { id: formulaId },
    data: { status: 'SUBMITTED', updatedBy: actorLabel(actor) },
  });
  await appendCostingAudit('CostingFormula', formulaId, 'COSTING_FORMULA_SUBMITTED', actor);
  return updated;
}

export async function approveCostingFormula(formulaId: string, actor: { id?: string; name?: string; email?: string }) {
  const prisma = requirePrisma();
  const formula = await prisma.costingFormula.findUnique({ where: { id: formulaId } });
  if (!formula) {
    const err = new Error('Costing formula not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (formula.status !== 'SUBMITTED') {
    const err = new Error('Only SUBMITTED formulas can be approved.');
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }
  const updated = await prisma.costingFormula.update({
    where: { id: formulaId },
    data: { status: 'APPROVED', updatedBy: actorLabel(actor) },
  });
  await appendCostingAudit('CostingFormula', formulaId, 'COSTING_FORMULA_APPROVED', actor);
  return updated;
}

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

async function loadVariableRegistry(): Promise<VariableDefinition[]> {
  const prisma = requirePrisma();
  const vars = await prisma.costingVariable.findMany();
  return vars.map((v) => ({
    code: v.code,
    name: v.name,
    kind: v.kind,
    status: v.status,
    defaultValue: v.defaultValue != null ? v.defaultValue.toString() : null,
  }));
}

async function loadFormulaGraph(configurationVersionId: string, excludeFormulaId?: string): Promise<FormulaGraphNode[]> {
  const prisma = requirePrisma();
  const formulas = await prisma.costingFormula.findMany({
    where: {
      configurationVersionId,
      ...(excludeFormulaId ? { id: { not: excludeFormulaId } } : {}),
    },
    include: {
      versions: {
        where: { status: { in: ['DRAFT', 'ACTIVE'] } },
        orderBy: { versionNo: 'desc' },
        take: 1,
        include: { dependencies: true },
      },
    },
  });

  return formulas
    .filter((f) => f.versions.length > 0)
    .map((f) => ({
      outputVariable: f.outputVariableCode,
      dependencies: f.versions[0].dependencies.map((d) => d.variableCode),
    }));
}

export async function listCostingFormulas(filter?: { configurationVersionId?: string; status?: string }) {
  const prisma = requirePrisma();
  return prisma.costingFormula.findMany({
    where: {
      ...(filter?.configurationVersionId ? { configurationVersionId: filter.configurationVersionId } : {}),
      ...(filter?.status ? { status: filter.status as never } : {}),
    },
    include: {
      component: true,
      versions: { orderBy: { versionNo: 'desc' }, take: 3, include: { dependencies: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}

export async function getCostingFormulaById(id: string) {
  const prisma = requirePrisma();
  return prisma.costingFormula.findUnique({
    where: { id },
    include: {
      component: true,
      configurationVersion: { include: { configuration: true } },
      versions: { orderBy: { versionNo: 'desc' }, include: { dependencies: true } },
    },
  });
}

export async function createCostingFormula(
  data: {
    configurationVersionId: string;
    componentId?: string;
    code?: string;
    name: string;
    description?: string;
    outputVariableCode: string;
    expression: string;
    sortOrder?: number;
    changeNotes?: string;
    assignmentScope?: string;
    assignmentValue?: string;
    assignmentPriority?: number;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  assertSafeExpression(data.expression);

  const registry = await loadVariableRegistry();
  const graph = await loadFormulaGraph(data.configurationVersionId);
  const validation = validateFormula({
    expression: data.expression,
    outputVariable: data.outputVariableCode,
    registry,
    existingFormulas: graph,
  });

  if (!validation.valid) {
    const err = new Error(validation.errors.map((e) => e.message).join('; '));
    (err as Error & { code: string; errors: typeof validation.errors }).code = validation.errors[0]?.code || 'INVALID_SYNTAX';
    (err as Error & { errors: typeof validation.errors }).errors = validation.errors;
    throw err;
  }

  const code = await resolveFormulaCode(data.code);
  const outputVar = data.outputVariableCode.trim().toUpperCase();

  const formula = await prisma.$transaction(async (tx) => {
    const created = await tx.costingFormula.create({
      data: {
        configurationVersionId: data.configurationVersionId,
        componentId: data.componentId,
        code,
        name: data.name,
        description: data.description,
        outputVariableCode: outputVar,
        assignmentScope: (data.assignmentScope || 'GLOBAL').trim().toUpperCase(),
        assignmentValue: data.assignmentValue?.trim() || null,
        assignmentPriority: data.assignmentPriority ?? 100,
        sortOrder: data.sortOrder ?? 0,
        createdBy: actorLabel(actor),
        versions: {
          create: {
            versionNo: 1,
            expression: data.expression.trim(),
            changeNotes: data.changeNotes,
            createdBy: actorLabel(actor),
            dependencies: {
              create: validation.dependencies.map((variableCode) => ({
                variableCode,
                dependencyType: 'VARIABLE',
              })),
            },
          },
        },
      },
      include: { versions: { include: { dependencies: true } } },
    });
    return created;
  });

  await appendCostingAudit('CostingFormula', formula.id, 'COSTING_FORMULA_CREATED', actor, undefined, { code });
  return formula;
}

export async function updateCostingFormulaDraft(
  formulaId: string,
  data: { expression?: string; changeNotes?: string },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const formula = await prisma.costingFormula.findUnique({
    where: { id: formulaId },
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
  });
  if (!formula) {
    const err = new Error('Costing formula not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const latest = formula.versions[0];
  if (!latest || latest.status !== 'DRAFT') {
    const err = new Error('Only DRAFT formula versions can be edited. Create a new version instead.');
    (err as Error & { code: string }).code = 'FORMULA_NOT_EDITABLE';
    throw err;
  }

  const expression = data.expression?.trim() ?? latest.expression;
  assertSafeExpression(expression);

  const registry = await loadVariableRegistry();
  const graph = await loadFormulaGraph(formula.configurationVersionId, formulaId);
  const validation = validateFormula({
    expression,
    outputVariable: formula.outputVariableCode,
    registry,
    existingFormulas: graph,
  });

  if (!validation.valid) {
    const err = new Error(validation.errors.map((e) => e.message).join('; '));
    (err as Error & { code: string; errors: typeof validation.errors }).code = validation.errors[0]?.code || 'INVALID_SYNTAX';
    (err as Error & { errors: typeof validation.errors }).errors = validation.errors;
    throw err;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.costingFormulaDependency.deleteMany({ where: { formulaVersionId: latest.id } });
    return tx.costingFormulaVersion.update({
      where: { id: latest.id },
      data: {
        expression,
        changeNotes: data.changeNotes ?? latest.changeNotes,
        updatedBy: actorLabel(actor),
        dependencies: {
          create: validation.dependencies.map((variableCode) => ({
            variableCode,
            dependencyType: 'VARIABLE',
          })),
        },
      },
      include: { dependencies: true },
    });
  });

  await appendCostingAudit('CostingFormulaVersion', latest.id, 'COSTING_FORMULA_UPDATED', actor);
  return updated;
}

export async function updateCostingFormulaAssignment(
  formulaId: string,
  data: {
    assignmentScope?: string;
    assignmentValue?: string | null;
    assignmentPriority?: number;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const formula = await prisma.costingFormula.findUnique({ where: { id: formulaId } });
  if (!formula) {
    const err = new Error('Costing formula not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const scope = (data.assignmentScope || formula.assignmentScope || 'GLOBAL').trim().toUpperCase();
  if (!['GLOBAL', 'FAMILY', 'CABLE'].includes(scope)) {
    const err = new Error('assignmentScope must be GLOBAL, FAMILY, or CABLE.');
    (err as Error & { code: string }).code = 'INVALID_ASSIGNMENT';
    throw err;
  }
  const updated = await prisma.costingFormula.update({
    where: { id: formulaId },
    data: {
      assignmentScope: scope,
      assignmentValue:
        data.assignmentValue !== undefined ? data.assignmentValue?.trim() || null : formula.assignmentValue,
      assignmentPriority: data.assignmentPriority ?? formula.assignmentPriority,
      updatedBy: actorLabel(actor),
    },
  });
  await appendCostingAudit('CostingFormula', formulaId, 'COSTING_FORMULA_ASSIGNMENT_UPDATED', actor, formula, {
    assignmentScope: scope,
    assignmentValue: updated.assignmentValue,
  });
  return updated;
}

export async function activateCostingFormula(
  formulaId: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const formula = await prisma.costingFormula.findUnique({
    where: { id: formulaId },
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
  });
  if (!formula) {
    const err = new Error('Costing formula not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const latest = formula.versions[0];
  if (!latest) {
    const err = new Error('Formula has no versions.');
    (err as Error & { code: string }).code = 'NO_VERSION';
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    const activeVersions = await tx.costingFormulaVersion.findMany({
      where: { formulaId, status: 'ACTIVE' },
    });
    for (const v of activeVersions) {
      await tx.costingFormulaVersion.update({
        where: { id: v.id },
        data: { status: 'SUPERSEDED', deactivatedAt: new Date() },
      });
    }
    await tx.costingFormulaVersion.update({
      where: { id: latest.id },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        approvedBy: actorLabel(actor),
        approvedAt: new Date(),
      },
    });
    await tx.costingFormula.update({
      where: { id: formulaId },
      data: { status: 'ACTIVE', updatedBy: actorLabel(actor) },
    });
  });

  await appendCostingAudit('CostingFormula', formulaId, 'COSTING_FORMULA_ACTIVATED', actor);
  return getCostingFormulaById(formulaId);
}

export async function deactivateCostingFormula(
  formulaId: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const formula = await prisma.costingFormula.findUnique({ where: { id: formulaId } });
  if (!formula) {
    const err = new Error('Costing formula not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await tx.costingFormulaVersion.updateMany({
      where: { formulaId, status: 'ACTIVE' },
      data: { status: 'INACTIVE', deactivatedAt: new Date() },
    });
    await tx.costingFormula.update({
      where: { id: formulaId },
      data: { status: 'INACTIVE', updatedBy: actorLabel(actor) },
    });
  });

  await appendCostingAudit('CostingFormula', formulaId, 'COSTING_FORMULA_DEACTIVATED', actor);
  return getCostingFormulaById(formulaId);
}

export async function validateFormulaExpression(
  expression: string,
  outputVariable?: string,
  configurationVersionId?: string
) {
  try {
    assertSafeExpression(expression);
  } catch (err) {
    if (err instanceof FormulaError) {
      return {
        valid: false,
        dependencies: [],
        errors: [{ code: err.code, message: err.message }],
      };
    }
    throw err;
  }
  const registry = await loadVariableRegistry();
  const graph = configurationVersionId ? await loadFormulaGraph(configurationVersionId) : [];
  return validateFormula({ expression, outputVariable, registry, existingFormulas: graph });
}

export async function previewFormulaExpression(
  expression: string,
  variableValues: Record<string, string | number>,
  outputVariable?: string,
  configurationVersionId?: string
) {
  assertSafeExpression(expression);
  const registry = await loadVariableRegistry();
  const graph = configurationVersionId ? await loadFormulaGraph(configurationVersionId) : [];
  return previewFormula({ expression, outputVariable, registry, existingFormulas: graph, variableValues });
}

export async function seedCostingRegistry(actor: { id?: string; name?: string; email?: string }) {
  const prisma = requirePrisma();

  const systemVariables = [
    { code: 'MATERIAL_COST', name: 'Material Cost', kind: 'REFERENCE' as const, sourceModule: 'COSTING_RUN', description: 'Increment 10 material cost aggregate' },
    { code: 'EX_WORK_RATE', name: 'Ex-Work Rate', kind: 'INPUT' as const, sourceModule: 'CONFIG', description: 'Configurable ex-work loading rate (not hard-coded)' },
    { code: 'EX_WORK_COST', name: 'Ex-Work Cost', kind: 'OUTPUT' as const, sourceModule: 'FORMULA', description: 'Calculated ex-work component cost' },
    { code: 'SCRAP_RATE', name: 'Scrap Rate', kind: 'INPUT' as const, sourceModule: 'CONFIG', description: 'Scrap rate placeholder — Phase E' },
    { code: 'QUANTITY', name: 'Order Quantity', kind: 'INPUT' as const, sourceModule: 'INQUIRY', description: 'Inquiry line quantity' },
    { code: 'LENGTH_METERS', name: 'Length (meters)', kind: 'INPUT' as const, sourceModule: 'INQUIRY', description: 'Requested cable length in meters' },
  ];

  for (const v of systemVariables) {
    await prisma.costingVariable.upsert({
      where: { code: v.code },
      create: {
        ...v,
        isSystem: true,
        status: 'ACTIVE',
        createdBy: actorLabel(actor),
      },
      update: {},
    });
  }

  const systemComponents = [
    { code: 'MATERIAL', name: 'Material Cost', kind: 'MATERIAL' as const, sortOrder: 10, description: 'Increment 10 BOM × price layer' },
    { code: 'EX_WORK', name: 'Ex-Work Loading', kind: 'EX_WORK' as const, sortOrder: 20, description: 'Configurable ex-work uplift — not hard-coded 6%' },
    { code: 'SCRAP', name: 'Scrap Adjustment', kind: 'SCRAP' as const, sortOrder: 15, description: 'Phase E — not active' },
  ];

  for (const c of systemComponents) {
    await prisma.costingComponent.upsert({
      where: { code: c.code },
      create: {
        ...c,
        isConfigurable: true,
        createdBy: actorLabel(actor),
      },
      update: {},
    });
  }
}

export { parseExpression, extractVariableReferences, detectCircularDependencies };
