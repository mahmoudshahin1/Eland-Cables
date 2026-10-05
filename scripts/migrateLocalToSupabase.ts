/**
 * Controlled one-time data migration: local PostgreSQL → Supabase PostgreSQL.
 *
 * CRITICAL:
 * - Migrates the complete local Energya business database, INCLUDING Customer master
 *   and all customer satellites / business data.
 * - Match existing target customers by Customer.code:
 *     • match → preserve TARGET customer id; remap all dependent source FKs to it
 *     • no match → create customer in target (preserve source id when safe)
 *     • never create duplicate customers with the same code
 * - Match existing target Incoterms by Incoterm.code the same way; remap
 *   CustomerShippingCostRate.incotermId / ShippingCostTransactionSnapshot.incotermId.
 * - ALSO migrates authentication / security tables additively (upsert / skipDuplicates):
 *   UserAccount, CustomerUser, Role, Permission, RolePermission, SecurityGroup*,
 *   UserRole, UserNotification, UserSession, PasswordResetTicket.
 * - Production admin on target is reconciled by email/username and NEVER overwritten.
 * - Active UserSessions are invalidated on migrate; active PasswordResetTickets force-expired.
 * - Never logs passwordHash, reset/session tokens, JWTs, API keys, or DB passwords.
 * - Never resets, drops, truncates, or pg_restore --clean the target.
 * - Default mode is dry-run (read-only). Apply requires --apply AND MIGRATE_CONFIRM=YES.
 *
 * Env:
 *   SOURCE_DATABASE_URL  (fallback: DATABASE_URL) — local
 *   TARGET_DATABASE_URL  — Supabase production
 *
 * Usage:
 *   npx tsx scripts/migrateLocalToSupabase.ts
 *   npx tsx scripts/migrateLocalToSupabase.ts --dry-run
 *   MIGRATE_CONFIRM=YES npx tsx scripts/migrateLocalToSupabase.ts --apply
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  AUTH_MIGRATION_ORDER,
  AUTH_TABLES,
  DEFAULT_PRODUCTION_ADMIN_EMAIL,
  SYSTEM_ADMIN_ROLE_CODE,
  authOrderDependenciesOk,
  buildIdentitySummaryRows,
  buildPermissionMap,
  buildRoleMap,
  buildSecurityGroupMap,
  buildUserAccountMap,
  classifyAndPrepareResetTicket,
  classifyAndPrepareSession,
  collectAuthOrphans,
  redactSensitiveAuthText,
  remapAuthIdFields,
  summarizeResetTicketPlan,
  summarizeSessionPlan,
  type AuthReconciliationSummary,
  type AuthTable,
  type PermissionMap,
  type ProductionAdminDetail,
  type UserAccountIdentity,
  type UserAccountMap,
} from './migrateLocalToSupabaseAuth';
import {
  CUSTOMER_ID_COLUMNS,
  REQUIRED_CUSTOMER_COLUMNS,
  INCOTERM_ID_COLUMNS,
  REQUIRED_INCOTERM_COLUMNS,
  buildCodeMasterMap,
  collectOrphanFkAfterRemap,
  effectiveTargetParentIds,
  filterRowsToCreateByCode,
  isParentBeforeChild,
  prepareDependentRow,
  remapCustomerFieldsPure,
  remapIncotermFields,
  validateFkValuesAgainstMap,
  type CodeMasterMap,
  type FkRemapIssue,
} from './migrateLocalToSupabaseLib';

dotenv.config();

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

/** No tables are hard-excluded; auth is migrated additively after Customer. */
const EXCLUDE = new Set<string>();

const AUTH_TABLE_SET = new Set<string>(AUTH_TABLES);

/** Tables treated as master / reference data for reconciliation reporting. */
const MASTER_TABLES = new Set<string>([
  'CableParameter',
  'ParameterCompatibility',
  'CableMaster',
  'CableMasterAttachment',
  'RawMaterial',
  'RawMaterialPrice',
  'BomDuplicateObservation',
  'CableBomLine',
  'GovernedBomLine',
  'CableEngineeringMapping',
  'DrumMaster',
  'DrumCompatibility',
  'ImportBatch',
  'ImportBatchRow',
  'AuditEvent',
  'TechnicalOfficeRequest',
  'PlatformFieldDefinition',
  'NotificationRule',
  'ReportDefinition',
  'NumberSequence',
  'CostingDocumentSequence',
  'CustomerGroup',
  'PaymentTerm',
  'PaymentMethod',
  'CustomerClassification',
  'CustomerSegment',
  'CustomerPricingTier',
  'ComplaintCategory',
  'ComplaintSubcategory',
  'Customer',
  'CustomerAddress',
  'CustomerContact',
  'CustomerExternalMapping',
  'CustomerMigrationException',
  'CostingCurrency',
  'CostingConfiguration',
  'CostingConfigurationVersion',
  'CostingVariable',
  'CostingComponent',
  'CostingFormula',
  'CostingFormulaVersion',
  'CostingFormulaDependency',
  'CostingScrapRule',
  'CostingMetalCostComponent',
  'MarketMetalInstrument',
  'MarketMetalImportBatch',
  'MarketMetalPrice',
  'MarketMetalPriceDefault',
  'CostingExchangeRate',
  'CostingMetalRate',
  'CostingLogisticsRule',
  'CostingPackingRule',
  'ContainerType',
  'ContainerTypeVersion',
  'DestinationPort',
  'Incoterm',
  'ShippingCostRate',
  'AlgorithmVersionRegistry',
  'AlgorithmConfiguration',
  'AlgorithmConfigurationParameter',
  'DrumPackingProfile',
  'DrumPackingProfileVersion',
  'CommercialPricingRule',
  'CommercialDiscountRule',
  'CustomerDeliveryCombination',
  'CustomerShippingCostRate',
  'WorkflowTemplate',
  'WorkflowStep',
  'WorkflowTransition',
]);

/**
 * Nullable FK columns deferred on insert to break cycles, then patched after dependents exist.
 */
const DEFERRED_COLUMNS: Record<string, string[]> = {
  CommercialInquiryLine: ['costingCalculationId'],
  ContainerStudy: ['currentSnapshotId', 'currentResultId'],
  FinancialOfferSnapshot: ['supersedesOfferId'],
};

/**
 * Dependency-respecting insert order (Prisma model = PostgreSQL table name; no @@map in schema).
 */
const MIGRATION_ORDER: string[] = [
  // --- Engineering / master (roots) ---
  'CableParameter',
  'ParameterCompatibility',
  'CableMaster',
  'CableMasterAttachment',
  'RawMaterial',
  'RawMaterialPrice',
  'BomDuplicateObservation',
  'CableBomLine',
  'GovernedBomLine',
  'CableEngineeringMapping',
  'DrumMaster',
  'DrumCompatibility',
  'ImportBatch',
  'ImportBatchRow',
  'AuditEvent',
  'TechnicalOfficeRequest',
  'PlatformFieldDefinition',
  'NotificationRule',
  'ReportDefinition',
  'NumberSequence',
  'CostingDocumentSequence',

  // --- Customer lookup masters ---
  'CustomerGroup',
  'PaymentTerm',
  'PaymentMethod',
  'CustomerClassification',
  'CustomerSegment',
  'CustomerPricingTier',
  'ComplaintCategory',
  'ComplaintSubcategory',

  // --- Customer master + satellites (INCLUDED; matched by code) ---
  'Customer',
  'CustomerAddress',
  'CustomerContact',
  'CustomerExternalMapping',
  'CustomerMigrationException',

  // --- Costing configuration masters ---
  'CostingCurrency',
  'CostingConfiguration',
  'CostingConfigurationVersion',
  'CostingVariable',
  'CostingComponent',
  'CostingFormula',
  'CostingFormulaVersion',
  'CostingFormulaDependency',
  'CostingScrapRule',
  'CostingMetalCostComponent',
  'MarketMetalInstrument',
  'MarketMetalImportBatch',
  'MarketMetalPrice',
  'MarketMetalPriceDefault',
  'CostingExchangeRate',
  'CostingMetalRate',
  'CostingLogisticsRule',
  'CostingPackingRule',

  // --- Shipping / container masters ---
  'ContainerType',
  'ContainerTypeVersion',
  'DestinationPort',
  'Incoterm',
  'ShippingCostRate',
  'AlgorithmVersionRegistry',
  'AlgorithmConfiguration',
  'AlgorithmConfigurationParameter',
  'DrumPackingProfile',
  'DrumPackingProfileVersion',

  // --- Commercial pricing rules (customerId soft-ref remapped) ---
  'CommercialPricingRule',
  'CommercialDiscountRule',

  // --- Customer delivery / shipping rates (FK remapped) ---
  'CustomerDeliveryCombination',
  'CustomerShippingCostRate',

  // --- Workflow templates ---
  'WorkflowTemplate',
  'WorkflowStep',
  'WorkflowTransition',

  // --- Commercial inquiry tree ---
  'CommercialInquiry',
  'CommercialInquiryAttachment',
  'CommercialInquiryLine', // costingCalculationId deferred
  'CommercialInquiryLineAttachment',

  // --- V2 engineering evidence ---
  'V2ConfigurationSnapshot',
  'V2CuttingLengthRequirement',
  'V2CuttingLengthPlan',
  'V2DrumPlan',
  'V2DrumPlanLine',

  // --- Container study (current* deferred) ---
  'ContainerShipmentGroup',
  'ContainerShipmentGroupLine',
  'ContainerStudy',
  'ContainerStudyInputSnapshot',
  'ContainerStudyInputSnapshotContainerPin',
  'ContainerStudyInputDrum',
  'ContainerStudyResult',
  'ContainerStudyResultContainer',
  'ContainerStudyResultAllocation',
  'ContainerStudyResultUnallocated',

  // --- Costing runs / calculations (after V2 + container results) ---
  'CostingRun',
  'CostingLine',
  'CostingCalculation',
  'CostingCalculationSnapshot',

  // --- Quotations / commitments / orders ---
  'CommercialQuotation',
  'CommercialQuotationLine',
  'CommercialPricingSnapshot',
  'CommercialCommitment',
  'SalesAgreement',
  'SalesAgreementLine',
  'AgreementRelease',
  'AgreementReleaseLine',
  'EpcSalesOrder',
  'EpcSalesOrderLine',

  // --- Shipping snapshots / financial offers ---
  'ShippingCostTransactionSnapshot',
  'ShipmentCostSnapshot',
  'ShipmentCostSnapshotLine',
  'FinancialOfferSnapshot', // supersedesOfferId deferred
  'FinancialOfferProductLine',
  'FinancialOfferShipmentLine',
  'FinancialOfferShipmentTypeLine',

  // --- Workflow instances / notifications / outbox ---
  'WorkflowInstance',
  'WorkflowTask',
  'WorkflowAssignment',
  'WorkflowEvent',
  'WorkflowStageTiming',
  'EmailOutbox',

  // --- Customer service ---
  'CustomerServiceCase',
  'CaseComment',
  'CaseAttachment',
  'CaseAssignment',
  'CaseStatusHistory',
  'CaseResolution',
  'SupportChatSession',
  'SupportChatMessage',

  // --- Auth / security (additive; after Customer for customerId remap) ---
  ...AUTH_MIGRATION_ORDER,
];

type CustomerMatch = {
  code: string;
  sourceId: string;
  targetId: string;
};

type CustomerNew = {
  code: string;
  sourceId: string;
};

type CustomerMap = {
  sourceIdToCode: Map<string, string>;
  sourceCodeToId: Map<string, string>;
  targetCodeToId: Map<string, string>;
  /** source Customer.id → effective target Customer.id (match → target id; new → source id) */
  sourceIdToTargetId: Map<string, string>;
  matched: CustomerMatch[];
  toCreate: CustomerNew[];
  sourceDuplicateCodes: Array<{ code: string; sourceIds: string[] }>;
  conflictingCodes: Array<{
    code: string;
    sourceId: string;
    targetId: string;
    reason: string;
  }>;
};

type TableInventory = {
  model: string;
  category: 'master' | 'transaction' | 'auth' | 'excluded';
  sourceCount: number | null;
  targetCount: number | null;
  sourceError?: string;
  targetError?: string;
  duplicateIdCount: number | null;
  sampleDuplicateIds: string[];
  estimatedInserts: number | null;
};

type CustomerRefIssue = {
  model: string;
  column: string;
  sourceCustomerId: string;
  sourceCode: string | null;
  severity: 'blocking' | 'warning';
  reason: string;
  rowCount: number;
};

type RemapEstimate = {
  model: string;
  column: string;
  rowsRequiringRemap: number;
  distinctSourceCustomerIds: number;
};

type IncotermMappingSummary = {
  sourceCount: number;
  targetCount: number;
  matchedByCode: number;
  idRemaps: number;
  toCreate: number;
  duplicateSourceCodes: Array<{ code: string; sourceIds: string[] }>;
  idRemapSample: Array<{ code: string; sourceId: string; targetId: string }>;
};

type DryRunReport = {
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  sourceHost: string | null;
  targetHost: string | null;
  sourceConfigured: boolean;
  targetConfigured: boolean;
  exclude: string[];
  migrateOrder: string[];
  deferredColumns: Record<string, string[]>;
  /** 1–2. Per-table source/target counts */
  inventory: TableInventory[];
  /** 3. Customer migration / reconciliation */
  customerMapping: {
    sourceCustomerCount: number | null;
    targetCustomerCount: number | null;
    existingTargetMatches: number;
    newCustomers: number;
    duplicateSourceCodes: Array<{ code: string; sourceIds: string[] }>;
    conflictingCodes: Array<{
      code: string;
      sourceId: string;
      targetId: string;
      reason: string;
    }>;
    matchedSample: CustomerMatch[];
    newCustomerSample: CustomerNew[];
  };
  /** 4. Master-data reconciliation */
  masterDataReconciliation: {
    tables: number;
    sourceRows: number;
    targetRows: number | null;
    estimatedInserts: number;
    tablesWithDuplicateIds: number;
  };
  /** 5. Transaction reconciliation */
  transactionReconciliation: {
    tables: number;
    sourceRows: number;
    targetRows: number | null;
    estimatedInserts: number;
    tablesWithDuplicateIds: number;
  };
  /** 6. Duplicate IDs across migrate-order tables */
  duplicateIds: Array<{
    model: string;
    duplicateIdCount: number;
    sampleDuplicateIds: string[];
  }>;
  /** 7. Foreign-key / customer-ref issues */
  foreignKeyViolations: CustomerRefIssue[];
  /** 7b. Incoterm.id FK remapping plan (code-matched shared master) */
  incotermMapping: IncotermMappingSummary | null;
  /** 7c. Non-customer FK issues (Incoterm.id etc.) after remap simulation */
  sharedMasterFkIssues: FkRemapIssue[];
  /** 8. Rows requiring customer ID remapping */
  rowsRequiringIdRemapping: RemapEstimate[];
  /** 8b. Rows requiring Incoterm ID remapping */
  rowsRequiringIncotermIdRemapping: RemapEstimate[];
  /** 9. Tables that cannot safely be migrated */
  unsafeTables: Array<{ model: string; reason: string; sourceCount: number | null }>;
  /** 10. Final migration row estimate */
  finalMigrationRowEstimate: {
    totalSourceRowsInScope: number;
    estimatedInserts: number;
    estimatedSkippedDuplicatePks: number;
    estimatedCustomerCreates: number;
    estimatedCustomerMatchesPreserved: number;
    notes: string[];
  };
  customerReferenceIssues: CustomerRefIssue[];
  /** Auth / security additive reconciliation */
  authReconciliation: AuthReconciliationSummary | null;
  dependencyNotes: string[];
  blockingIssues: string[];
  warnings: string[];
  applyEligible: boolean;
};

type AuthMapsBundle = {
  userAccount: UserAccountMap;
  role: CodeMasterMap;
  permission: PermissionMap;
  securityGroup: CodeMasterMap;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const dryRun = !apply || argv.includes('--dry-run');
  const reportPathIdx = argv.indexOf('--report');
  const reportPath =
    reportPathIdx >= 0 && argv[reportPathIdx + 1]
      ? argv[reportPathIdx + 1]
      : path.join('logs', 'migrate-local-to-supabase-dry-run.json');
  return { apply, dryRun: apply ? false : dryRun, reportPath };
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgresql:/i, 'postgres:')).host;
  } catch {
    return '(unparseable)';
  }
}

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function createClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
    log: ['error'],
  });
}

async function tableCount(client: PrismaClient, model: string): Promise<number> {
  const rows = await client.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*)::bigint AS c FROM "${model}"`
  );
  return Number(rows[0]?.c ?? 0);
}

async function loadPrimaryKeyColumn(client: PrismaClient, model: string): Promise<string | null> {
  const rows = await client.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT a.attname AS column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary
     ORDER BY a.attnum`,
    `"${model}"`
  );
  if (rows.length === 1) return rows[0].column_name;
  if (rows.length > 1) return rows.map((r) => r.column_name).join(',');
  return null;
}

async function duplicateIdCount(
  source: PrismaClient,
  target: PrismaClient,
  model: string,
  idColumn: string
): Promise<{ count: number; samples: string[] }> {
  if (idColumn.includes(',')) {
    return { count: -1, samples: [] };
  }
  const sourceIds = await source.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "${idColumn}"::text AS id FROM "${model}"`
  );
  if (sourceIds.length === 0) return { count: 0, samples: [] };

  let dup = 0;
  const samples: string[] = [];
  const batchSize = 500;
  for (let i = 0; i < sourceIds.length; i += batchSize) {
    const batch = sourceIds.slice(i, i + batchSize).map((r) => r.id);
    const found = await target.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "${idColumn}"::text AS id FROM "${model}" WHERE "${idColumn}"::text = ANY($1::text[])`,
      batch
    );
    dup += found.length;
    for (const f of found) {
      if (samples.length < 8) samples.push(f.id);
    }
  }
  return { count: dup, samples };
}

async function buildCustomerMap(
  source: PrismaClient | null,
  target: PrismaClient | null
): Promise<CustomerMap> {
  const map: CustomerMap = {
    sourceIdToCode: new Map(),
    sourceCodeToId: new Map(),
    targetCodeToId: new Map(),
    sourceIdToTargetId: new Map(),
    matched: [],
    toCreate: [],
    sourceDuplicateCodes: [],
    conflictingCodes: [],
  };

  const sourceRows: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
  }> = [];
  const targetRows: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
  }> = [];

  if (source) {
    const src = await source.$queryRawUnsafe<
      Array<{ id: string; code: string; name: string; status: string }>
    >(`SELECT id, code, name, status::text AS status FROM "Customer"`);
    sourceRows.push(...src);
    const byCode = new Map<string, string[]>();
    for (const row of src) {
      map.sourceIdToCode.set(row.id, row.code);
      const ids = byCode.get(row.code) || [];
      ids.push(row.id);
      byCode.set(row.code, ids);
      // First wins for code→id; duplicates captured below
      if (!map.sourceCodeToId.has(row.code)) map.sourceCodeToId.set(row.code, row.id);
    }
    for (const [code, ids] of byCode) {
      if (ids.length > 1) map.sourceDuplicateCodes.push({ code, sourceIds: ids });
    }
  }

  if (target) {
    const tgt = await target.$queryRawUnsafe<
      Array<{ id: string; code: string; name: string; status: string }>
    >(`SELECT id, code, name, status::text AS status FROM "Customer"`);
    targetRows.push(...tgt);
    for (const row of tgt) {
      map.targetCodeToId.set(row.code, row.id);
    }
  }

  const targetByCode = new Map(targetRows.map((r) => [r.code, r]));

  for (const row of sourceRows) {
    const targetRow = targetByCode.get(row.code);
    if (targetRow) {
      map.sourceIdToTargetId.set(row.id, targetRow.id);
      map.matched.push({
        code: row.code,
        sourceId: row.id,
        targetId: targetRow.id,
      });
      // Flag soft conflicts (same code, materially different identity fields)
      if (row.name !== targetRow.name || row.status !== targetRow.status) {
        map.conflictingCodes.push({
          code: row.code,
          sourceId: row.id,
          targetId: targetRow.id,
          reason: `Matched by code but fields differ (source name/status="${row.name}"/${row.status}; target="${targetRow.name}"/${targetRow.status}). Target row preserved.`,
        });
      }
    } else {
      // New customer: preserve source id on create
      map.sourceIdToTargetId.set(row.id, row.id);
      map.toCreate.push({ code: row.code, sourceId: row.id });
    }
  }

  return map;
}

async function buildIncotermMap(
  source: PrismaClient | null,
  target: PrismaClient | null
): Promise<CodeMasterMap> {
  const sourceRows: Array<{ id: string; code: string }> = [];
  const targetRows: Array<{ id: string; code: string }> = [];
  if (source) {
    const src = await source.$queryRawUnsafe<Array<{ id: string; code: string }>>(
      `SELECT id, code FROM "Incoterm"`
    );
    sourceRows.push(...src);
  }
  if (target) {
    const tgt = await target.$queryRawUnsafe<Array<{ id: string; code: string }>>(
      `SELECT id, code FROM "Incoterm"`
    );
    targetRows.push(...tgt);
  }
  return buildCodeMasterMap(sourceRows, targetRows);
}

async function loadUserAccountIdentities(
  client: PrismaClient,
  opts?: { includeAdminFlag?: boolean }
): Promise<UserAccountIdentity[]> {
  // Never SELECT passwordHash.
  const rows = await client.$queryRawUnsafe<
    Array<{
      id: string;
      username: string;
      email: string;
      customerId: string | null;
      userType: string | null;
      status: string | null;
      isActive: boolean | null;
      isLocked: boolean | null;
    }>
  >(
    `SELECT id, username, email, "customerId", "userType"::text AS "userType",
            status::text AS status, "isActive", "isLocked"
     FROM "UserAccount"`
  );
  const identities: UserAccountIdentity[] = rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email,
    customerId: r.customerId,
    userType: r.userType,
    status: r.status,
    isActive: r.isActive,
    isLocked: r.isLocked,
  }));

  if (opts?.includeAdminFlag) {
    const adminIds = await client.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT ur."userId"
       FROM "UserRole" ur
       JOIN "Role" r ON r.id = ur."roleId"
       WHERE r.code = $1`,
      SYSTEM_ADMIN_ROLE_CODE
    );
    const set = new Set(adminIds.map((a) => a.userId));
    const adminEmail = normAdminEmail(
      process.env.ADMIN_EMAIL || DEFAULT_PRODUCTION_ADMIN_EMAIL
    );
    for (const row of identities) {
      row.isProductionAdmin =
        set.has(row.id) || row.email.trim().toLowerCase() === adminEmail;
    }
  }
  return identities;
}

function normAdminEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

async function buildAuthMaps(
  source: PrismaClient | null,
  target: PrismaClient | null
): Promise<AuthMapsBundle> {
  const emptyUser = buildUserAccountMap([], []);
  const emptyRole = buildRoleMap([], []);
  const emptyPerm = buildPermissionMap([], []);
  const emptyGroup = buildSecurityGroupMap([], []);
  if (!source) {
    return {
      userAccount: emptyUser,
      role: emptyRole,
      permission: emptyPerm,
      securityGroup: emptyGroup,
    };
  }

  const sourceUsers = await loadUserAccountIdentities(source);
  const targetUsers = target
    ? await loadUserAccountIdentities(target, { includeAdminFlag: true })
    : [];

  const adminEmails = new Set<string>([
    normAdminEmail(DEFAULT_PRODUCTION_ADMIN_EMAIL),
    normAdminEmail(process.env.ADMIN_EMAIL || DEFAULT_PRODUCTION_ADMIN_EMAIL),
  ]);

  const userAccount = buildUserAccountMap(sourceUsers, targetUsers, {
    productionAdminEmails: adminEmails,
    productionAdminUserIds: targetUsers.filter((u) => u.isProductionAdmin).map((u) => u.id),
  });

  const sourceRoles = await source.$queryRawUnsafe<Array<{ id: string; code: string }>>(
    `SELECT id, code FROM "Role"`
  );
  const targetRoles = target
    ? await target.$queryRawUnsafe<Array<{ id: string; code: string }>>(
        `SELECT id, code FROM "Role"`
      )
    : [];
  const role = buildRoleMap(sourceRoles, targetRoles);

  const sourcePerms = await source.$queryRawUnsafe<
    Array<{ id: string; module: string; resource: string; action: string }>
  >(`SELECT id, module, resource, action FROM "Permission"`);
  const targetPerms = target
    ? await target.$queryRawUnsafe<
        Array<{ id: string; module: string; resource: string; action: string }>
      >(`SELECT id, module, resource, action FROM "Permission"`)
    : [];
  const permission = buildPermissionMap(sourcePerms, targetPerms);

  const sourceGroups = await source.$queryRawUnsafe<Array<{ id: string; code: string }>>(
    `SELECT id, code FROM "SecurityGroup"`
  );
  const targetGroups = target
    ? await target.$queryRawUnsafe<Array<{ id: string; code: string }>>(
        `SELECT id, code FROM "SecurityGroup"`
      )
    : [];
  const securityGroup = buildSecurityGroupMap(sourceGroups, targetGroups);

  return { userAccount, role, permission, securityGroup };
}

async function buildAuthReconciliation(
  source: PrismaClient | null,
  target: PrismaClient | null,
  customerMap: CustomerMap,
  authMaps: AuthMapsBundle,
  inventory: TableInventory[]
): Promise<AuthReconciliationSummary> {
  const now = new Date();
  const orphanFkIssues: FkRemapIssue[] = [];
  const dependencyProblems = authOrderDependenciesOk([...MIGRATION_ORDER]);

  const tables = AUTH_MIGRATION_ORDER.map((model) => {
    const inv = inventory.find((i) => i.model === model);
    return {
      model,
      sourceCount: inv?.sourceCount ?? null,
      targetCount: inv?.targetCount ?? null,
      estimatedInserts: inv?.estimatedInserts ?? null,
      estimatedSkipped:
        inv?.sourceCount != null && inv.estimatedInserts != null
          ? Math.max(0, inv.sourceCount - inv.estimatedInserts)
          : null,
    };
  });

  // Session / reset aggregates (never select token hashes)
  const sessionMechanism =
    'UserSession stores refreshTokenHash (SHA-256 of opaque refresh token); access via JWT + refresh. Active = expiresAt > now AND revokedAt IS NULL.';
  let sessionHandling: AuthReconciliationSummary['sessionHandling'] = {
    policy:
      'Active sessions (expiresAt > now AND revokedAt IS NULL) are migrated with revokedAt=migrationNow so local refresh tokens cannot authenticate against production. Historical expired/revoked sessions migrate as-is with userId remapped. Existing target sessions are never deleted (skipDuplicates). UserAccount passwords are preserved for normal login.',
    total: null,
    historical: null,
    activeInvalidated: null,
    orphanUserSkipped: null,
    mechanism: sessionMechanism,
  };
  let passwordResetHandling: AuthReconciliationSummary['passwordResetHandling'] = {
    policy:
      'Historical used/expired PasswordResetTicket rows migrate with userId remapped. Active unused tickets are force-expired (expiresAt=migrationNow) so local reset tokens cannot be redeemed in production. Tokens are never invented or logged; tokenHash is copied only at apply time and redacted in all reports.',
    total: null,
    historicalUsed: null,
    historicalExpired: null,
    activeExpiredOnMigrate: null,
    orphanUserSkipped: null,
    tokenEnvironmentIndependence:
      'Reset tokens are SHA-256 hashed opaque secrets stored as tokenHash — environment-independent if copied live. Dry-run/apply force-expires unused active tickets so local reset links cannot redeem against production.',
  };

  let customerUserCustomerRemaps = 0;
  let customerUserUnresolved = 0;
  let userAccountCustomerRemaps = 0;
  let userAccountCustomerCleared = 0;
  const orphanCounts: Partial<Record<AuthTable, number>> = {};

  const addOrphanCount = (model: AuthTable, n: number) => {
    orphanCounts[model] = (orphanCounts[model] || 0) + n;
  };

  if (source) {
    try {
      const sessionRows = await source.$queryRawUnsafe<
        Array<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null }>
      >(`SELECT id, "userId", "expiresAt", "revokedAt" FROM "UserSession"`);
      const sessionPlan = summarizeSessionPlan(
        sessionRows,
        authMaps.userAccount.sourceIdToTargetId,
        now
      );
      sessionHandling = {
        policy: sessionPlan.policy,
        total: sessionPlan.total,
        historical: sessionPlan.historical,
        activeInvalidated: sessionPlan.activeInvalidated,
        orphanUserSkipped: sessionPlan.orphanUserSkipped,
        mechanism: sessionMechanism,
      };
      if (sessionPlan.orphanUserSkipped) addOrphanCount('UserSession', sessionPlan.orphanUserSkipped);
    } catch (err) {
      orphanFkIssues.push({
        model: 'UserSession',
        column: '(scan)',
        sourceValue: '(n/a)',
        severity: 'blocking',
        reason: `Failed to scan sessions: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }

    try {
      const ticketRows = await source.$queryRawUnsafe<
        Array<{ id: string; userId: string; expiresAt: Date; usedAt: Date | null }>
      >(`SELECT id, "userId", "expiresAt", "usedAt" FROM "PasswordResetTicket"`);
      const ticketPlan = summarizeResetTicketPlan(
        ticketRows,
        authMaps.userAccount.sourceIdToTargetId,
        now
      );
      passwordResetHandling = {
        policy: ticketPlan.policy,
        total: ticketPlan.total,
        historicalUsed: ticketPlan.historicalUsed,
        historicalExpired: ticketPlan.historicalExpired,
        activeExpiredOnMigrate: ticketPlan.activeExpiredOnMigrate,
        orphanUserSkipped: ticketPlan.orphanUserSkipped,
        tokenEnvironmentIndependence: passwordResetHandling.tokenEnvironmentIndependence,
      };
      if (ticketPlan.orphanUserSkipped) {
        addOrphanCount('PasswordResetTicket', ticketPlan.orphanUserSkipped);
      }
    } catch (err) {
      orphanFkIssues.push({
        model: 'PasswordResetTicket',
        column: '(scan)',
        sourceValue: '(n/a)',
        severity: 'blocking',
        reason: `Failed to scan reset tickets: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }

    const effectiveUsers = new Set<string>([
      ...authMaps.userAccount.sourceIdToTargetId.values(),
      ...(target
        ? (
            await target.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "UserAccount"`)
          ).map((r) => r.id)
        : []),
      // Source ids that will be created keep their PK
      ...authMaps.userAccount.toCreate.map((e) => e.targetId),
    ]);
    const effectiveRoles = new Set<string>([
      ...authMaps.role.sourceIdToTargetId.values(),
      ...authMaps.role.toCreate.map((c) => c.sourceId),
    ]);
    const effectivePerms = new Set<string>([
      ...authMaps.permission.sourceIdToTargetId.values(),
      ...authMaps.permission.toCreate.map((c) => c.sourceId),
    ]);
    const effectiveGroups = new Set<string>([
      ...authMaps.securityGroup.sourceIdToTargetId.values(),
      ...authMaps.securityGroup.toCreate.map((c) => c.sourceId),
    ]);
    const effectiveCustomers = new Set<string>([
      ...customerMap.sourceIdToTargetId.values(),
      ...customerMap.targetCodeToId.values(),
    ]);

    // CustomerUser remap + orphan simulation
    try {
      const cuRows = await source.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT id, "customerId", "userAccountId", status::text AS status FROM "CustomerUser"`
      );
      const preparedCu: Record<string, unknown>[] = [];
      for (const raw of cuRows) {
        const customerRemapped = remapCustomerFieldsPure('CustomerUser', raw, customerMap);
        if (customerRemapped.errors.length) {
          customerUserUnresolved += 1;
          for (const e of customerRemapped.errors) {
            orphanFkIssues.push({
              model: 'CustomerUser',
              column: 'customerId',
              sourceValue: String(raw.id ?? '?'),
              severity: 'blocking',
              reason: e,
              rowCount: 1,
            });
          }
          continue;
        }
        if (String(raw.customerId) !== String(customerRemapped.row.customerId)) {
          customerUserCustomerRemaps += 1;
        }
        const authRemapped = remapAuthIdFields('CustomerUser', customerRemapped.row, {
          userAccount: authMaps.userAccount.sourceIdToTargetId,
          customer: customerMap.sourceIdToTargetId,
        });
        if (authRemapped.errors.length) {
          customerUserUnresolved += 1;
          for (const e of authRemapped.errors) {
            orphanFkIssues.push({
              model: 'CustomerUser',
              column: 'userAccountId',
              sourceValue: String(raw.id ?? '?'),
              severity: 'blocking',
              reason: e,
              rowCount: 1,
            });
          }
          continue;
        }
        preparedCu.push(authRemapped.row);
      }
      const cuOrphans = [
        ...collectAuthOrphans({
          model: 'CustomerUser',
          preparedRows: preparedCu,
          column: 'customerId',
          required: true,
          effectiveParentIds: effectiveCustomers,
        }),
        ...collectAuthOrphans({
          model: 'CustomerUser',
          preparedRows: preparedCu,
          column: 'userAccountId',
          required: true,
          effectiveParentIds: effectiveUsers,
        }),
      ];
      orphanFkIssues.push(...cuOrphans);
      addOrphanCount(
        'CustomerUser',
        cuOrphans.reduce((a, o) => a + o.rowCount, 0) + customerUserUnresolved
      );
    } catch (err) {
      orphanFkIssues.push({
        model: 'CustomerUser',
        column: '(prepare)',
        sourceValue: '(n/a)',
        severity: 'blocking',
        reason: `Failed CustomerUser remap simulation: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }

    // UserAccount.customerId nullable remap estimate (bounded sample of non-null)
    try {
      const uaCust = await source.$queryRawUnsafe<Array<{ id: string; customerId: string }>>(
        `SELECT id, "customerId" FROM "UserAccount" WHERE "customerId" IS NOT NULL`
      );
      for (const row of uaCust) {
        const remapped = remapCustomerFieldsPure(
          'UserAccount',
          { id: row.id, customerId: row.customerId },
          customerMap
        );
        if (remapped.errors.length) {
          userAccountCustomerCleared += 1;
          continue;
        }
        if (String(row.customerId) !== String(remapped.row.customerId)) {
          userAccountCustomerRemaps += 1;
        }
      }
    } catch {
      // non-blocking — nullable denormalized field
    }

    // UserRole orphan simulation (aggregate by distinct FKs)
    try {
      const urRows = await source.$queryRawUnsafe<
        Array<{ userId: string; roleId: string; cnt: bigint | number }>
      >(
        `SELECT "userId", "roleId", COUNT(*)::bigint AS cnt FROM "UserRole" GROUP BY "userId", "roleId"`
      );
      let orphanUr = 0;
      for (const r of urRows) {
        const uid = authMaps.userAccount.sourceIdToTargetId.get(r.userId);
        const rid = authMaps.role.sourceIdToTargetId.get(r.roleId);
        if (!uid || !rid) {
          orphanUr += Number(r.cnt);
          continue;
        }
        if (!effectiveUsers.has(uid) || !effectiveRoles.has(rid)) {
          orphanUr += Number(r.cnt);
        }
      }
      if (orphanUr > 0) {
        orphanFkIssues.push({
          model: 'UserRole',
          column: 'userId|roleId',
          sourceValue: '(aggregate)',
          severity: 'blocking',
          reason: 'UserRole rows lack UserAccount or Role remap — skipped on apply',
          rowCount: orphanUr,
        });
        addOrphanCount('UserRole', orphanUr);
      }
    } catch (err) {
      orphanFkIssues.push({
        model: 'UserRole',
        column: '(scan)',
        sourceValue: '(n/a)',
        severity: 'warning',
        reason: `Failed UserRole orphan scan: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }

    // RolePermission orphan simulation
    try {
      const rpRows = await source.$queryRawUnsafe<
        Array<{ roleId: string; permissionId: string; cnt: bigint | number }>
      >(
        `SELECT "roleId", "permissionId", COUNT(*)::bigint AS cnt FROM "RolePermission" GROUP BY "roleId", "permissionId"`
      );
      let orphanRp = 0;
      for (const r of rpRows) {
        const rid = authMaps.role.sourceIdToTargetId.get(r.roleId);
        const pid = authMaps.permission.sourceIdToTargetId.get(r.permissionId);
        if (!rid || !pid || !effectiveRoles.has(rid) || !effectivePerms.has(pid)) {
          orphanRp += Number(r.cnt);
        }
      }
      if (orphanRp > 0) {
        orphanFkIssues.push({
          model: 'RolePermission',
          column: 'roleId|permissionId',
          sourceValue: '(aggregate)',
          severity: 'blocking',
          reason: 'RolePermission rows lack Role or Permission remap — skipped on apply',
          rowCount: orphanRp,
        });
        addOrphanCount('RolePermission', orphanRp);
      }
    } catch (err) {
      orphanFkIssues.push({
        model: 'RolePermission',
        column: '(scan)',
        sourceValue: '(n/a)',
        severity: 'warning',
        reason: `Failed RolePermission orphan scan: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }

    // SecurityGroupMember / SecurityGroupRole (usually empty)
    try {
      const sgm = await source.$queryRawUnsafe<Array<{ groupId: string; userId: string }>>(
        `SELECT "groupId", "userId" FROM "SecurityGroupMember"`
      );
      const prepared: Record<string, unknown>[] = [];
      for (const raw of sgm) {
        const remapped = remapAuthIdFields('SecurityGroupMember', { ...raw }, {
          userAccount: authMaps.userAccount.sourceIdToTargetId,
          securityGroup: authMaps.securityGroup.sourceIdToTargetId,
        });
        if (remapped.errors.length) {
          addOrphanCount('SecurityGroupMember', 1);
          orphanFkIssues.push({
            model: 'SecurityGroupMember',
            column: 'groupId|userId',
            sourceValue: '(row)',
            severity: 'blocking',
            reason: remapped.errors.join('; '),
            rowCount: 1,
          });
          continue;
        }
        prepared.push(remapped.row);
      }
      const issues = [
        ...collectAuthOrphans({
          model: 'SecurityGroupMember',
          preparedRows: prepared,
          column: 'groupId',
          required: true,
          effectiveParentIds: effectiveGroups,
        }),
        ...collectAuthOrphans({
          model: 'SecurityGroupMember',
          preparedRows: prepared,
          column: 'userId',
          required: true,
          effectiveParentIds: effectiveUsers,
        }),
      ];
      orphanFkIssues.push(...issues);
      addOrphanCount(
        'SecurityGroupMember',
        issues.reduce((a, o) => a + o.rowCount, 0)
      );
    } catch (err) {
      orphanFkIssues.push({
        model: 'SecurityGroupMember',
        column: '(scan)',
        sourceValue: '(n/a)',
        severity: 'warning',
        reason: `Failed SecurityGroupMember scan: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }

    try {
      const sgr = await source.$queryRawUnsafe<Array<{ groupId: string; roleId: string }>>(
        `SELECT "groupId", "roleId" FROM "SecurityGroupRole"`
      );
      const prepared: Record<string, unknown>[] = [];
      for (const raw of sgr) {
        const remapped = remapAuthIdFields('SecurityGroupRole', { ...raw }, {
          role: authMaps.role.sourceIdToTargetId,
          securityGroup: authMaps.securityGroup.sourceIdToTargetId,
        });
        if (remapped.errors.length) {
          addOrphanCount('SecurityGroupRole', 1);
          orphanFkIssues.push({
            model: 'SecurityGroupRole',
            column: 'groupId|roleId',
            sourceValue: '(row)',
            severity: 'blocking',
            reason: remapped.errors.join('; '),
            rowCount: 1,
          });
          continue;
        }
        prepared.push(remapped.row);
      }
      const issues = [
        ...collectAuthOrphans({
          model: 'SecurityGroupRole',
          preparedRows: prepared,
          column: 'groupId',
          required: true,
          effectiveParentIds: effectiveGroups,
        }),
        ...collectAuthOrphans({
          model: 'SecurityGroupRole',
          preparedRows: prepared,
          column: 'roleId',
          required: true,
          effectiveParentIds: effectiveRoles,
        }),
      ];
      orphanFkIssues.push(...issues);
      addOrphanCount(
        'SecurityGroupRole',
        issues.reduce((a, o) => a + o.rowCount, 0)
      );
    } catch (err) {
      orphanFkIssues.push({
        model: 'SecurityGroupRole',
        column: '(scan)',
        sourceValue: '(n/a)',
        severity: 'warning',
        reason: `Failed SecurityGroupRole scan: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }

    // UserNotification orphan estimate via aggregate (avoid loading 650k+ rows)
    try {
      const distinctUsers = await source.$queryRawUnsafe<
        Array<{ userAccountId: string; cnt: bigint | number }>
      >(
        `SELECT "userAccountId"::text AS "userAccountId", COUNT(*)::bigint AS cnt
         FROM "UserNotification"
         WHERE "userAccountId" IS NOT NULL
         GROUP BY "userAccountId"`
      );
      let orphanNotifRows = 0;
      let orphanNotifUsers = 0;
      for (const d of distinctUsers) {
        if (authMaps.userAccount.sourceIdToTargetId.has(d.userAccountId)) continue;
        orphanNotifUsers += 1;
        orphanNotifRows += Number(d.cnt);
      }
      if (orphanNotifUsers > 0) {
        orphanFkIssues.push({
          model: 'UserNotification',
          column: 'userAccountId',
          sourceValue: `(${orphanNotifUsers} distinct unmapped users)`,
          severity: 'warning',
          reason:
            'Nullable userAccountId values lack UserAccount remap — will be set NULL on apply for those rows',
          rowCount: orphanNotifRows,
        });
        addOrphanCount('UserNotification', orphanNotifRows);
      }
    } catch (err) {
      orphanFkIssues.push({
        model: 'UserNotification',
        column: 'userAccountId',
        sourceValue: '(n/a)',
        severity: 'warning',
        reason: `Failed notification orphan scan: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
      });
    }
  }

  const matchingEmail = authMaps.userAccount.conflicts.filter(
    (c) => c.kind === 'email_match' || c.kind === 'production_admin_preserved'
  ).length;
  const matchingUsername = authMaps.userAccount.conflicts.filter(
    (c) => c.kind === 'username_match'
  ).length;
  const matchingIdSameIdentity = authMaps.userAccount.matched.filter(
    (e) => e.sourceId === e.targetId
  ).length;
  const duplicateSourceEmails = authMaps.userAccount.conflicts.filter(
    (c) => c.kind === 'duplicate_source_email'
  ).length;
  const duplicateSourceUsernames = authMaps.userAccount.conflicts.filter(
    (c) => c.kind === 'duplicate_source_username'
  ).length;

  const adminEmail = normAdminEmail(
    process.env.ADMIN_EMAIL || DEFAULT_PRODUCTION_ADMIN_EMAIL
  );
  const adminDetail = await loadProductionAdminDetail(source, target, authMaps, adminEmail);

  const identitySummary = buildIdentitySummaryRows({
    tables,
    userAccount: {
      matched: authMaps.userAccount.matched.length,
      toCreate: authMaps.userAccount.toCreate.length,
    },
    role: {
      matched: authMaps.role.matched.length,
      toCreate: authMaps.role.toCreate.length,
    },
    permission: {
      matched: authMaps.permission.matched.length,
      toCreate: authMaps.permission.toCreate.length,
    },
    securityGroup: {
      matched: authMaps.securityGroup.matched.length,
      toCreate: authMaps.securityGroup.toCreate.length,
    },
    session: {
      historical: sessionHandling.historical,
      activeInvalidated: sessionHandling.activeInvalidated,
    },
    reset: {
      historicalUsed: passwordResetHandling.historicalUsed,
      historicalExpired: passwordResetHandling.historicalExpired,
      activeExpiredOnMigrate: passwordResetHandling.activeExpiredOnMigrate,
    },
    orphanCounts,
  });

  return {
    included: true,
    migrationOrder: [...AUTH_MIGRATION_ORDER],
    identitySummary,
    tables,
    maps: {
      userAccount: {
        matched: authMaps.userAccount.matched.length,
        toCreate: authMaps.userAccount.toCreate.length,
        conflicts: authMaps.userAccount.conflicts.length,
        productionAdminsPreserved: authMaps.userAccount.productionAdminsPreserved.length,
        blockingIdCollisions: authMaps.userAccount.blockingIdCollisions.length,
        matchingEmail,
        matchingUsername,
        matchingIdSameIdentity,
        duplicateSourceEmails,
        duplicateSourceUsernames,
        idRemapSample: authMaps.userAccount.matched.slice(0, 25).map((e) => ({
          sourceId: e.sourceId,
          targetId: e.targetId,
          action: e.action,
          email: e.email,
        })),
      },
      role: {
        matched: authMaps.role.matched.length,
        toCreate: authMaps.role.toCreate.length,
        idRemaps: authMaps.role.idRemaps.length,
      },
      permission: {
        matched: authMaps.permission.matched.length,
        toCreate: authMaps.permission.toCreate.length,
        idRemaps: authMaps.permission.idRemaps.length,
      },
      securityGroup: {
        matched: authMaps.securityGroup.matched.length,
        toCreate: authMaps.securityGroup.toCreate.length,
        idRemaps: authMaps.securityGroup.idRemaps.length,
      },
      customer: {
        note: 'UserAccount.customerId and CustomerUser.customerId remap via Customer.code → TARGET Customer.id',
        remapsViaCustomerCode: true,
        customerUserCustomerRemaps,
        customerUserUnresolved,
        userAccountCustomerRemaps,
        userAccountCustomerClearedOrUnresolved: userAccountCustomerCleared,
      },
    },
    productionAdminHandling: {
      policy:
        'Target users with SYSTEM_ADMINISTRATOR role and/or ADMIN_EMAIL (default admin@energya.com) are matched by email/username; target id/passwordHash/status/lock are preserved. Source admin rows are not inserted or overwritten. Production admin remains usable after migration.',
      preserved: authMaps.userAccount.productionAdminsPreserved,
      detail: adminDetail,
    },
    sessionHandling,
    passwordResetHandling,
    passwordHandling: {
      policy:
        'New UserAccount rows insert with source passwordHash unchanged (never logged). Matched accounts including production admin preserve TARGET passwordHash — no overwrite. Users log in with existing target or migrated source credentials as applicable.',
      algorithm:
        'bcryptjs cost-10 ($2a/$2b/$2y) via src/domain/passwordService.ts — identical on source and target codepaths',
      sourceTargetCompatible: true,
    },
    conflicts: authMaps.userAccount.conflicts,
    orphanFkIssues,
    dependencyProblems,
    redaction: {
      policy:
        'passwordHash, refreshTokenHash, tokenHash, JWTs, API keys, and DB passwords are never written to dry-run reports or console output.',
      sensitiveFieldsNeverLogged: [
        'passwordHash',
        'refreshTokenHash',
        'tokenHash',
        'JWT_SECRET',
        'ADMIN_SEED_PASSWORD',
        'DATABASE_URL',
        'TARGET_DATABASE_URL',
      ],
    },
  };
}

async function loadProductionAdminDetail(
  source: PrismaClient | null,
  target: PrismaClient | null,
  authMaps: AuthMapsBundle,
  adminEmail: string
): Promise<ProductionAdminDetail> {
  const emptySide = {
    exists: false,
    id: null as string | null,
    email: null as string | null,
    username: null as string | null,
    customerId: null as string | null,
    status: null as string | null,
    isLocked: null as boolean | null,
    roleCodes: [] as string[],
  };

  async function loadSide(
    client: PrismaClient | null
  ): Promise<typeof emptySide> {
    if (!client) return { ...emptySide };
    const rows = await client.$queryRawUnsafe<
      Array<{
        id: string;
        email: string;
        username: string;
        customerId: string | null;
        status: string | null;
        isLocked: boolean | null;
      }>
    >(
      `SELECT id, email, username, "customerId", status::text AS status, "isLocked"
       FROM "UserAccount"
       WHERE lower(trim(email)) = $1
       LIMIT 1`,
      adminEmail
    );
    if (!rows.length) return { ...emptySide };
    const u = rows[0];
    const roles = await client.$queryRawUnsafe<Array<{ code: string }>>(
      `SELECT r.code FROM "UserRole" ur JOIN "Role" r ON r.id = ur."roleId" WHERE ur."userId" = $1`,
      u.id
    );
    return {
      exists: true,
      id: u.id,
      email: u.email,
      username: u.username,
      customerId: u.customerId,
      status: u.status,
      isLocked: u.isLocked,
      roleCodes: roles.map((r) => r.code),
    };
  }

  const sourceAdmin = await loadSide(source);
  const targetAdmin = await loadSide(target);
  const preserved = authMaps.userAccount.productionAdminsPreserved.find(
    (p) => normAdminEmail(p.email) === adminEmail
  );
  const mapped = authMaps.userAccount.sourceIdToTargetId.get(sourceAdmin.id || '');

  return {
    policy:
      'Match source admin@energya.com (or ADMIN_EMAIL) to target by email; preserve target id/passwordHash/status/lock/roles. Never delete, lock, or overwrite production admin.',
    sourceAdmin: {
      exists: sourceAdmin.exists,
      id: sourceAdmin.id,
      email: sourceAdmin.email,
      username: sourceAdmin.username,
      customerId: sourceAdmin.customerId,
      status: sourceAdmin.status,
      roleCodes: sourceAdmin.roleCodes,
    },
    targetAdmin: {
      exists: targetAdmin.exists,
      id: targetAdmin.id,
      email: targetAdmin.email,
      username: targetAdmin.username,
      status: targetAdmin.status,
      isLocked: targetAdmin.isLocked,
      roleCodes: targetAdmin.roleCodes,
    },
    mapping: {
      action: preserved
        ? 'match_preserve_production_admin'
        : mapped
          ? 'matched'
          : sourceAdmin.exists
            ? 'unmatched_source_admin'
            : 'target_only_or_absent',
      sourceId: sourceAdmin.id,
      targetId: targetAdmin.id || mapped || null,
      preserveTargetPasswordAndStatus: true,
      productionAdminRemainsUsable: true,
    },
  };
}

/** Resolve a stored customer ref to a canonical source Customer.code when possible. */
function resolveSourceCode(
  value: string,
  customerMap: CustomerMap
): { code: string | null; via: 'id' | 'code' | 'unknown' } {
  const byId = customerMap.sourceIdToCode.get(value);
  if (byId) return { code: byId, via: 'id' };
  if (customerMap.sourceCodeToId.has(value)) return { code: value, via: 'code' };
  return { code: null, via: 'unknown' };
}

function canResolveCustomerRef(
  value: string,
  customerMap: CustomerMap,
  targetAvailable: boolean
): boolean {
  // Known source customer → either matched to target or will be created
  if (customerMap.sourceIdToTargetId.has(value)) return true;
  if (customerMap.sourceCodeToId.has(value)) {
    const sourceId = customerMap.sourceCodeToId.get(value)!;
    return customerMap.sourceIdToTargetId.has(sourceId);
  }
  // Already a target id
  if (targetAvailable && [...customerMap.sourceIdToTargetId.values()].includes(value)) {
    return true;
  }
  if (targetAvailable && customerMap.targetCodeToId.has(value)) return true;
  return false;
}

async function validateCustomerReferences(
  source: PrismaClient,
  customerMap: CustomerMap,
  targetAvailable: boolean
): Promise<CustomerRefIssue[]> {
  const issues: CustomerRefIssue[] = [];

  for (const [model, columns] of Object.entries(CUSTOMER_ID_COLUMNS)) {
    if (EXCLUDE.has(model)) continue;
    if (model === 'Customer') continue; // Customer.id is the map itself
    for (const column of columns) {
      const required = (REQUIRED_CUSTOMER_COLUMNS[model] || []).includes(column);
      let distinct: Array<{ val: string; cnt: bigint | number }>;
      try {
        distinct = await source.$queryRawUnsafe(
          `SELECT "${column}"::text AS val, COUNT(*)::bigint AS cnt
           FROM "${model}"
           WHERE "${column}" IS NOT NULL
           GROUP BY "${column}"`
        );
      } catch (err) {
        issues.push({
          model,
          column,
          sourceCustomerId: '(n/a)',
          sourceCode: null,
          severity: 'blocking',
          reason: `Failed to scan column: ${err instanceof Error ? err.message : String(err)}`,
          rowCount: 0,
        });
        continue;
      }

      for (const row of distinct) {
        const value = row.val;
        const cnt = Number(row.cnt);
        const resolved = resolveSourceCode(value, customerMap);

        if (canResolveCustomerRef(value, customerMap, targetAvailable)) continue;

        if (resolved.code && !targetAvailable) {
          // Source knows the customer; without target we cannot confirm match vs create,
          // but migration will create-or-match by code — warn rather than block apply eligibility on target absence separately.
          issues.push({
            model,
            column,
            sourceCustomerId: value,
            sourceCode: resolved.code,
            severity: 'warning',
            reason: `Customer.code="${resolved.code}" referenced; TARGET_DATABASE_URL not set — match-vs-create cannot be confirmed against Supabase`,
            rowCount: cnt,
          });
          continue;
        }

        // Orphaned / legacy refs: required hard FKs block; nullable customerMasterId is nulled on apply;
        // soft customerId is left unchanged.
        if (required) {
          issues.push({
            model,
            column,
            sourceCustomerId: value,
            sourceCode: resolved.code,
            severity: 'blocking',
            reason:
              'Value is not a known source Customer.id/code and cannot be remapped or created (required FK)',
            rowCount: cnt,
          });
        } else if (column === 'customerMasterId') {
          issues.push({
            model,
            column,
            sourceCustomerId: value,
            sourceCode: resolved.code,
            severity: 'warning',
            reason:
              'Orphaned/legacy customerMasterId not in source Customer — will be set to NULL on apply to preserve insert integrity',
            rowCount: cnt,
          });
        } else {
          issues.push({
            model,
            column,
            sourceCustomerId: value,
            sourceCode: resolved.code,
            severity: 'warning',
            reason:
              'Soft customer ref is not a known Customer.id/code; left unchanged on apply (non-FK)',
            rowCount: cnt,
          });
        }
      }
    }
  }

  if (customerMap.sourceDuplicateCodes.length) {
    for (const dup of customerMap.sourceDuplicateCodes) {
      issues.push({
        model: 'Customer',
        column: 'code',
        sourceCustomerId: dup.sourceIds.join(','),
        sourceCode: dup.code,
        severity: 'blocking',
        reason: `Duplicate Customer.code in SOURCE — cannot uniquely map/create (ids=${dup.sourceIds.join(', ')})`,
        rowCount: dup.sourceIds.length,
      });
    }
  }

  return issues;
}

async function estimateCustomerRemaps(
  source: PrismaClient,
  customerMap: CustomerMap
): Promise<RemapEstimate[]> {
  const estimates: RemapEstimate[] = [];
  const remappedSourceIds = [...customerMap.sourceIdToTargetId.entries()]
    .filter(([src, tgt]) => src !== tgt)
    .map(([src]) => src);

  if (remappedSourceIds.length === 0) {
    for (const [model, columns] of Object.entries(CUSTOMER_ID_COLUMNS)) {
      if (model === 'Customer' || EXCLUDE.has(model)) continue;
      for (const column of columns) {
        estimates.push({
          model,
          column,
          rowsRequiringRemap: 0,
          distinctSourceCustomerIds: 0,
        });
      }
    }
    return estimates;
  }

  for (const [model, columns] of Object.entries(CUSTOMER_ID_COLUMNS)) {
    if (model === 'Customer' || EXCLUDE.has(model)) continue;
    for (const column of columns) {
      try {
        const rows = await source.$queryRawUnsafe<Array<{ c: bigint | number; d: bigint | number }>>(
          `SELECT COUNT(*)::bigint AS c, COUNT(DISTINCT "${column}")::bigint AS d
           FROM "${model}"
           WHERE "${column}"::text = ANY($1::text[])`,
          remappedSourceIds
        );
        estimates.push({
          model,
          column,
          rowsRequiringRemap: Number(rows[0]?.c ?? 0),
          distinctSourceCustomerIds: Number(rows[0]?.d ?? 0),
        });
      } catch (err) {
        estimates.push({
          model,
          column,
          rowsRequiringRemap: -1,
          distinctSourceCustomerIds: -1,
        });
      }
    }
  }
  return estimates;
}

function remapCustomerFields(
  model: string,
  row: Record<string, unknown>,
  customerMap: CustomerMap
): { row: Record<string, unknown>; errors: string[] } {
  return remapCustomerFieldsPure(model, row, customerMap);
}

function applyDeferredNulls(
  model: string,
  row: Record<string, unknown>
): { row: Record<string, unknown>; deferred: Record<string, unknown> } {
  const cols = DEFERRED_COLUMNS[model];
  if (!cols?.length) return { row, deferred: {} };
  const next = { ...row };
  const deferred: Record<string, unknown> = {};
  for (const col of cols) {
    if (next[col] != null) {
      deferred[col] = next[col];
      next[col] = null;
    }
  }
  return { row: next, deferred };
}

/**
 * Prepare auth rows for additive insert. Never mutates matched production admins.
 * Sessions: revoke active. Reset tickets: force-expire active. Secrets stay in-memory only.
 */
function prepareAuthRowsForApply(
  model: AuthTable,
  rows: Record<string, unknown>[],
  customerMap: CustomerMap,
  authMaps: AuthMapsBundle,
  now: Date
): Record<string, unknown>[] {
  const maps = {
    userAccount: authMaps.userAccount.sourceIdToTargetId,
    role: authMaps.role.sourceIdToTargetId,
    permission: authMaps.permission.sourceIdToTargetId,
    securityGroup: authMaps.securityGroup.sourceIdToTargetId,
    customer: customerMap.sourceIdToTargetId,
  };

  if (model === 'Permission') {
    const createIds = new Set(authMaps.permission.toCreate.map((c) => c.sourceId));
    return rows.filter((r) => createIds.has(String(r.id)));
  }
  if (model === 'Role') {
    return filterRowsToCreateByCode(rows, authMaps.role);
  }
  if (model === 'SecurityGroup') {
    return filterRowsToCreateByCode(rows, authMaps.securityGroup);
  }
  if (model === 'UserAccount') {
    const createIds = new Set(authMaps.userAccount.toCreate.map((c) => c.sourceId));
    const out: Record<string, unknown>[] = [];
    for (const raw of rows) {
      if (!createIds.has(String(raw.id))) continue;
      const customerRemapped = remapCustomerFieldsPure('UserAccount', raw, customerMap);
      if (customerRemapped.errors.length) {
        throw new Error(customerRemapped.errors.join('; '));
      }
      // passwordHash preserved exactly from source — never logged
      out.push(customerRemapped.row);
    }
    return out;
  }

  const prepared: Record<string, unknown>[] = [];
  for (const raw of rows) {
    let row = { ...raw };

    if (model === 'CustomerUser' || model === 'UserAccount') {
      const customerRemapped = remapCustomerFieldsPure(model, row, customerMap);
      if (customerRemapped.errors.length) {
        throw new Error(customerRemapped.errors.join('; '));
      }
      row = customerRemapped.row;
    }

    if (model === 'UserSession') {
      const uid = maps.userAccount.get(String(row.userId));
      if (!uid) continue;
      const classified = classifyAndPrepareSession(
        {
          id: String(row.id),
          userId: String(row.userId),
          expiresAt: row.expiresAt as Date | string,
          revokedAt: (row.revokedAt as Date | string | null) ?? null,
        },
        uid,
        now
      );
      prepared.push({
        ...row,
        userId: classified.safeFields.userId,
        expiresAt: classified.safeFields.expiresAt,
        revokedAt: classified.safeFields.revokedAt,
        // refreshTokenHash kept from source row for historical insert; session is revoked if active
      });
      continue;
    }

    if (model === 'PasswordResetTicket') {
      const uid = maps.userAccount.get(String(row.userId));
      if (!uid) continue;
      const classified = classifyAndPrepareResetTicket(
        {
          id: String(row.id),
          userId: String(row.userId),
          expiresAt: row.expiresAt as Date | string,
          usedAt: (row.usedAt as Date | string | null) ?? null,
        },
        uid,
        now
      );
      prepared.push({
        ...row,
        userId: classified.safeFields.userId,
        expiresAt: classified.safeFields.expiresAt,
        usedAt: classified.safeFields.usedAt,
        // tokenHash kept from source; active tickets already force-expired
      });
      continue;
    }

    const remapped = remapAuthIdFields(model, row, maps);
    if (remapped.errors.length) {
      // Skip orphan junction rows rather than abort entire business migration
      if (
        model === 'UserRole' ||
        model === 'RolePermission' ||
        model === 'SecurityGroupMember' ||
        model === 'SecurityGroupRole' ||
        model === 'CustomerUser' ||
        model === 'UserNotification'
      ) {
        continue;
      }
      throw new Error(remapped.errors.join('; '));
    }
    prepared.push(remapped.row);
  }
  return prepared;
}

async function fetchAllRows(
  client: PrismaClient,
  model: string
): Promise<Record<string, unknown>[]> {
  return client.$queryRawUnsafe(`SELECT * FROM "${model}"`);
}

function serializeCell(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

async function insertRows(
  target: PrismaClient,
  model: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const name = delegateName(model);
  const delegate = (target as unknown as Record<string, { createMany: Function }>)[name];
  if (!delegate?.createMany) {
    throw new Error(`No Prisma delegate for model ${model} (${name})`);
  }
  const prepared = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[k] = serializeCell(v);
    return out;
  });
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < prepared.length; i += batchSize) {
    const chunk = prepared.slice(i, i + batchSize);
    const result = await delegate.createMany({ data: chunk, skipDuplicates: true });
    inserted += result.count ?? chunk.length;
  }
  return inserted;
}

async function patchDeferred(
  target: PrismaClient,
  model: string,
  idColumn: string,
  patches: Array<{ id: string; fields: Record<string, unknown> }>
): Promise<void> {
  const name = delegateName(model);
  const delegate = (target as unknown as Record<string, { update: Function }>)[name];
  for (const p of patches) {
    if (!Object.keys(p.fields).length) continue;
    await delegate.update({
      where: { [idColumn]: p.id },
      data: p.fields,
    });
  }
}

// ---------------------------------------------------------------------------
// Dry-run / apply
// ---------------------------------------------------------------------------

async function runDryRun(
  source: PrismaClient | null,
  target: PrismaClient | null,
  sourceUrl: string | undefined,
  targetUrl: string | undefined
): Promise<DryRunReport> {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const dependencyNotes = [
    'Insert order follows FK edges from prisma/schema.prisma (no @@map; table name = model name).',
    'Customer master + satellites ARE migrated. Match existing target customers by Customer.code; preserve target IDs; create missing codes; never duplicate codes.',
    'Dependent customerMasterId/customerId columns remapped via Customer.code when source id ≠ target id.',
    'Incoterm matched by code like Customer: preserve target Incoterm IDs; create missing codes; remap CustomerShippingCostRate.incotermId / ShippingCostTransactionSnapshot.incotermId.',
    'Auth/security tables ARE migrated additively after Customer: Permission → Role → RolePermission → SecurityGroup* → UserAccount → UserRole/CustomerUser/sessions/tickets/notifications.',
    'UserAccount matched by email/username; production admin (SYSTEM_ADMINISTRATOR / ADMIN_EMAIL) preserved on target — never overwritten.',
    'Active UserSessions revoked on migrate; active PasswordResetTickets force-expired; passwordHash preserved for creates, never logged.',
    'CommercialInquiryLine.costingCalculationId deferred until CostingCalculation exists.',
    'ContainerStudy.currentSnapshotId/currentResultId deferred until snapshots/results exist.',
    'FinancialOfferSnapshot.supersedesOfferId deferred then patched for self-lineage.',
    'Apply uses controlled upsert/merge (skipDuplicates); never truncate/drop/pg_restore --clean.',
  ];

  if (!sourceUrl) blockingIssues.push('SOURCE_DATABASE_URL / DATABASE_URL is not set.');
  if (!targetUrl) {
    warnings.push(
      'TARGET_DATABASE_URL is not set — target counts, duplicate-ID detection, and Customer.code match-vs-create cannot be validated against Supabase. Dry-run continues with source-only analysis.'
    );
  }

  const customerMap = await buildCustomerMap(source, target);
  const incotermMap = await buildIncotermMap(source, target);
  const authMaps = await buildAuthMaps(source, target);
  const inventory: TableInventory[] = [];

  for (const model of MIGRATION_ORDER) {
    const entry: TableInventory = {
      model,
      category: AUTH_TABLE_SET.has(model)
        ? 'auth'
        : MASTER_TABLES.has(model)
          ? 'master'
          : 'transaction',
      sourceCount: null,
      targetCount: null,
      duplicateIdCount: null,
      sampleDuplicateIds: [],
      estimatedInserts: null,
    };
    if (source) {
      try {
        entry.sourceCount = await tableCount(source, model);
      } catch (err) {
        entry.sourceError = err instanceof Error ? err.message : String(err);
        blockingIssues.push(`Source count failed for ${model}: ${entry.sourceError}`);
      }
    }
    if (target) {
      try {
        entry.targetCount = await tableCount(target, model);
      } catch (err) {
        entry.targetError = err instanceof Error ? err.message : String(err);
        blockingIssues.push(`Target count failed for ${model}: ${entry.targetError}`);
      }
    }

    if (model === 'Customer' && entry.sourceCount != null) {
      // Matched customers are not inserted; only toCreate are
      entry.estimatedInserts = customerMap.toCreate.length;
      entry.duplicateIdCount = customerMap.matched.length;
      entry.sampleDuplicateIds = customerMap.matched.slice(0, 8).map((m) => m.targetId);
    } else if (model === 'Incoterm' && entry.sourceCount != null) {
      // Matched-by-code Incoterms are not inserted; only missing codes are created.
      // PK overlap alone is insufficient — unique code conflicts also skip inserts.
      entry.estimatedInserts = incotermMap.toCreate.length;
      entry.duplicateIdCount = incotermMap.matched.length;
      entry.sampleDuplicateIds = incotermMap.idRemaps.slice(0, 8).map((m) => m.sourceId);
      if (incotermMap.idRemaps.length > 0) {
        warnings.push(
          `Incoterm: ${incotermMap.idRemaps.length} source id(s) differ from target for the same code — dependents remapped via code (sample: ${incotermMap.idRemaps
            .slice(0, 4)
            .map((m) => `${m.code}:${m.sourceId}→${m.targetId}`)
            .join(', ')}).`
        );
      }
    } else if (model === 'UserAccount' && entry.sourceCount != null) {
      entry.estimatedInserts = authMaps.userAccount.toCreate.length;
      entry.duplicateIdCount = authMaps.userAccount.matched.length;
      entry.sampleDuplicateIds = authMaps.userAccount.matched
        .slice(0, 8)
        .map((m) => m.targetId);
      if (authMaps.userAccount.productionAdminsPreserved.length) {
        warnings.push(
          `UserAccount: ${authMaps.userAccount.productionAdminsPreserved.length} production admin match(es) preserved on target (password/status not overwritten).`
        );
      }
      if (authMaps.userAccount.blockingIdCollisions.length) {
        blockingIssues.push(
          `UserAccount: ${authMaps.userAccount.blockingIdCollisions.length} source id collision(s) with different identity — cannot create without inventing ids.`
        );
      }
    } else if (model === 'Role' && entry.sourceCount != null) {
      entry.estimatedInserts = authMaps.role.toCreate.length;
      entry.duplicateIdCount = authMaps.role.matched.length;
      entry.sampleDuplicateIds = authMaps.role.idRemaps.slice(0, 8).map((m) => m.sourceId);
    } else if (model === 'Permission' && entry.sourceCount != null) {
      entry.estimatedInserts = authMaps.permission.toCreate.length;
      entry.duplicateIdCount = authMaps.permission.matched.length;
      entry.sampleDuplicateIds = authMaps.permission.idRemaps
        .slice(0, 8)
        .map((m) => m.sourceId);
    } else if (model === 'SecurityGroup' && entry.sourceCount != null) {
      entry.estimatedInserts = authMaps.securityGroup.toCreate.length;
      entry.duplicateIdCount = authMaps.securityGroup.matched.length;
      entry.sampleDuplicateIds = authMaps.securityGroup.idRemaps
        .slice(0, 8)
        .map((m) => m.sourceId);
    } else if (source && target && entry.sourceCount && entry.sourceCount > 0) {
      try {
        const pk = await loadPrimaryKeyColumn(source, model);
        if (pk && !pk.includes(',')) {
          const dups = await duplicateIdCount(source, target, model, pk);
          entry.duplicateIdCount = dups.count;
          entry.sampleDuplicateIds = dups.samples;
          entry.estimatedInserts = Math.max(0, entry.sourceCount - dups.count);
          if (dups.count > 0) {
            warnings.push(
              `${model}: ${dups.count} source primary key(s) already exist on target (apply uses skipDuplicates / will not overwrite).`
            );
          }
        } else if (pk?.includes(',')) {
          entry.duplicateIdCount = -1;
          entry.estimatedInserts = entry.sourceCount;
          warnings.push(`${model}: composite PK — duplicate probe skipped; estimate assumes all source rows attempt insert.`);
        } else {
          entry.estimatedInserts = entry.sourceCount;
        }
      } catch (err) {
        entry.estimatedInserts = entry.sourceCount;
        warnings.push(
          `${model}: duplicate detection failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if (entry.sourceCount != null) {
      entry.estimatedInserts = entry.sourceCount;
    }

    inventory.push(entry);
  }

  // Auth tables are in-scope (additive). No hard-excluded auth tables remain.
  const unsafeTables: Array<{ model: string; reason: string; sourceCount: number | null }> = [];
  for (const conflict of authMaps.userAccount.blockingIdCollisions) {
    unsafeTables.push({
      model: 'UserAccount',
      reason: conflict.detail,
      sourceCount: 1,
    });
  }

  let customerReferenceIssues: CustomerRefIssue[] = [];
  let remapEstimates: RemapEstimate[] = [];
  let sharedMasterFkIssues: FkRemapIssue[] = [];
  let incotermRemapEstimates: RemapEstimate[] = [];
  const effectiveIncotermParents = effectiveTargetParentIds(incotermMap);

  if (source) {
    customerReferenceIssues = await validateCustomerReferences(
      source,
      customerMap,
      Boolean(target)
    );
    remapEstimates = await estimateCustomerRemaps(source, customerMap);

    // Incoterm.id FK validation + remap estimates + prepared-row orphan check
    for (const [model, columns] of Object.entries(INCOTERM_ID_COLUMNS)) {
      for (const column of columns) {
        const required = (REQUIRED_INCOTERM_COLUMNS[model] || []).includes(column);
        let distinct: Array<{ val: string; cnt: bigint | number }> = [];
        try {
          distinct = await source.$queryRawUnsafe(
            `SELECT "${column}"::text AS val, COUNT(*)::bigint AS cnt
             FROM "${model}"
             WHERE "${column}" IS NOT NULL
             GROUP BY "${column}"`
          );
        } catch (err) {
          sharedMasterFkIssues.push({
            model,
            column,
            sourceValue: '(n/a)',
            severity: 'blocking',
            reason: `Failed to scan column: ${err instanceof Error ? err.message : String(err)}`,
            rowCount: 0,
          });
          continue;
        }

        const distinctValues = distinct.map((d) => ({
          value: d.val,
          rowCount: Number(d.cnt),
        }));

        if (!target) {
          // Without target we can only confirm source Incoterm parents exist.
          for (const { value, rowCount } of distinctValues) {
            if (incotermMap.sourceIdToTargetId.has(value)) continue;
            sharedMasterFkIssues.push({
              model,
              column,
              sourceValue: value,
              severity: required ? 'blocking' : 'warning',
              reason: required
                ? 'incotermId is not a known source Incoterm.id (required FK)'
                : 'Nullable incotermId is not a known source Incoterm.id — will be set to NULL on apply',
              rowCount,
            });
          }
        } else {
          sharedMasterFkIssues.push(
            ...validateFkValuesAgainstMap({
              model,
              column,
              distinctValues,
              sourceIdToTargetId: incotermMap.sourceIdToTargetId,
              effectiveParentIds: effectiveIncotermParents,
              required,
            })
          );
        }

        const remappedIds = [...incotermMap.sourceIdToTargetId.entries()]
          .filter(([src, tgt]) => src !== tgt)
          .map(([src]) => src);
        if (remappedIds.length === 0) {
          incotermRemapEstimates.push({
            model,
            column,
            rowsRequiringRemap: 0,
            distinctSourceCustomerIds: 0,
          });
        } else {
          try {
            const rows = await source.$queryRawUnsafe<
              Array<{ c: bigint | number; d: bigint | number }>
            >(
              `SELECT COUNT(*)::bigint AS c, COUNT(DISTINCT "${column}")::bigint AS d
               FROM "${model}"
               WHERE "${column}"::text = ANY($1::text[])`,
              remappedIds
            );
            incotermRemapEstimates.push({
              model,
              column,
              rowsRequiringRemap: Number(rows[0]?.c ?? 0),
              distinctSourceCustomerIds: Number(rows[0]?.d ?? 0),
            });
          } catch {
            incotermRemapEstimates.push({
              model,
              column,
              rowsRequiringRemap: -1,
              distinctSourceCustomerIds: -1,
            });
          }
        }
      }
    }

    // Simulate prepared CustomerShippingCostRate rows and confirm no orphan FKs remain
    if (target) {
      try {
        const rateRows = await source.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM "CustomerShippingCostRate"`
        );
        const preparedRates: Record<string, unknown>[] = [];
        for (const raw of rateRows) {
          const prepared = prepareDependentRow(
            'CustomerShippingCostRate',
            raw,
            customerMap,
            incotermMap
          );
          if (prepared.errors.length) {
            for (const err of prepared.errors) {
              sharedMasterFkIssues.push({
                model: 'CustomerShippingCostRate',
                column: 'prepare',
                sourceValue: String(raw.id ?? '?'),
                severity: 'blocking',
                reason: err,
                rowCount: 1,
              });
            }
            continue;
          }
          preparedRates.push(prepared.row);
        }
        const effectiveCustomerParents = new Set<string>([
          ...customerMap.sourceIdToTargetId.values(),
          ...customerMap.targetCodeToId.values(),
        ]);
        sharedMasterFkIssues.push(
          ...collectOrphanFkAfterRemap({
            model: 'CustomerShippingCostRate',
            preparedRows: preparedRates,
            columns: ['customerId'],
            requiredColumns: ['customerId'],
            effectiveParentIds: effectiveCustomerParents,
          }),
          ...collectOrphanFkAfterRemap({
            model: 'CustomerShippingCostRate',
            preparedRows: preparedRates,
            columns: ['incotermId'],
            requiredColumns: ['incotermId'],
            effectiveParentIds: effectiveIncotermParents,
          })
        );
      } catch (err) {
        sharedMasterFkIssues.push({
          model: 'CustomerShippingCostRate',
          column: '(prepare)',
          sourceValue: '(n/a)',
          severity: 'blocking',
          reason: `Failed to simulate prepared rows: ${err instanceof Error ? err.message : String(err)}`,
          rowCount: 0,
        });
      }
    }
  }

  // Dependency ordering: Incoterm must precede dependents that reference Incoterm.id
  if (!isParentBeforeChild(MIGRATION_ORDER, 'Incoterm', 'CustomerShippingCostRate')) {
    blockingIssues.push(
      'Dependency order error: Incoterm must be inserted before CustomerShippingCostRate'
    );
  }
  if (!isParentBeforeChild(MIGRATION_ORDER, 'Incoterm', 'ShippingCostTransactionSnapshot')) {
    blockingIssues.push(
      'Dependency order error: Incoterm must be inserted before ShippingCostTransactionSnapshot'
    );
  }
  if (!isParentBeforeChild(MIGRATION_ORDER, 'Customer', 'CustomerShippingCostRate')) {
    blockingIssues.push(
      'Dependency order error: Customer must be inserted before CustomerShippingCostRate'
    );
  }

  for (const depProblem of authOrderDependenciesOk([...MIGRATION_ORDER])) {
    blockingIssues.push(`Auth dependency order error: ${depProblem}`);
  }

  for (const dup of incotermMap.sourceDuplicateCodes) {
    blockingIssues.push(
      `Incoterm: duplicate code in SOURCE — cannot uniquely map/create (code=${dup.code}, ids=${dup.sourceIds.join(', ')})`
    );
  }

  for (const issue of customerReferenceIssues) {
    if (issue.severity === 'blocking') {
      blockingIssues.push(
        `${issue.model}.${issue.column}: ${issue.reason} (id=${issue.sourceCustomerId}, code=${issue.sourceCode ?? 'n/a'}, rows=${issue.rowCount})`
      );
    } else {
      warnings.push(
        `${issue.model}.${issue.column}: ${issue.reason} (id=${issue.sourceCustomerId}, rows=${issue.rowCount})`
      );
    }
  }

  for (const issue of sharedMasterFkIssues) {
    if (issue.severity === 'blocking') {
      blockingIssues.push(
        `${issue.model}.${issue.column}: ${issue.reason} (id=${issue.sourceValue}, rows=${issue.rowCount})`
      );
    } else {
      warnings.push(
        `${issue.model}.${issue.column}: ${issue.reason} (id=${issue.sourceValue}, rows=${issue.rowCount})`
      );
    }
  }

  for (const conflict of customerMap.conflictingCodes) {
    warnings.push(`Customer code="${conflict.code}": ${conflict.reason}`);
  }

  if (!targetUrl) {
    blockingIssues.push(
      'TARGET_DATABASE_URL is not set — apply is blocked until target is configured and dry-run is re-validated against Supabase.'
    );
  }

  const masterInv = inventory.filter((i) => i.category === 'master');
  const txnInv = inventory.filter((i) => i.category === 'transaction');
  const authInv = inventory.filter((i) => i.category === 'auth');
  const sum = (rows: TableInventory[], key: 'sourceCount' | 'targetCount' | 'estimatedInserts') =>
    rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);

  const duplicateIds = inventory
    .filter((i) => i.category !== 'excluded' && (i.duplicateIdCount ?? 0) > 0)
    .map((i) => ({
      model: i.model,
      duplicateIdCount: i.duplicateIdCount!,
      sampleDuplicateIds: i.sampleDuplicateIds,
    }));

  const totalSource = sum(
    inventory.filter((i) => i.category !== 'excluded'),
    'sourceCount'
  );
  const estimatedInserts = sum(
    inventory.filter((i) => i.category !== 'excluded'),
    'estimatedInserts'
  );
  const estimatedSkipped = inventory
    .filter((i) => i.category !== 'excluded')
    .reduce((acc, r) => {
      if (r.model === 'Customer') return acc + customerMap.matched.length;
      if (r.model === 'Incoterm') return acc + incotermMap.matched.length;
      if (r.model === 'UserAccount') return acc + authMaps.userAccount.matched.length;
      if (r.model === 'Role') return acc + authMaps.role.matched.length;
      if (r.model === 'Permission') return acc + authMaps.permission.matched.length;
      if (r.model === 'SecurityGroup') return acc + authMaps.securityGroup.matched.length;
      if (r.duplicateIdCount && r.duplicateIdCount > 0) return acc + r.duplicateIdCount;
      return acc;
    }, 0);

  const authReconciliation = await buildAuthReconciliation(
    source,
    target,
    customerMap,
    authMaps,
    inventory
  );

  for (const issue of authReconciliation.orphanFkIssues) {
    if (issue.severity === 'blocking') {
      blockingIssues.push(
        `auth ${issue.model}.${issue.column}: ${issue.reason} (id=${issue.sourceValue}, rows=${issue.rowCount})`
      );
    } else {
      warnings.push(
        `auth ${issue.model}.${issue.column}: ${issue.reason} (id=${issue.sourceValue}, rows=${issue.rowCount})`
      );
    }
  }
  for (const dep of authReconciliation.dependencyProblems) {
    if (!blockingIssues.includes(`Auth dependency order error: ${dep}`)) {
      blockingIssues.push(`Auth dependency order error: ${dep}`);
    }
  }

  const applyEligible =
    blockingIssues.length === 0 && Boolean(source) && Boolean(target);

  const incotermMapping: IncotermMappingSummary | null = source
    ? {
        sourceCount: incotermMap.sourceIdToCode.size,
        targetCount: incotermMap.targetCodeToId.size,
        matchedByCode: incotermMap.matched.length,
        idRemaps: incotermMap.idRemaps.length,
        toCreate: incotermMap.toCreate.length,
        duplicateSourceCodes: incotermMap.sourceDuplicateCodes,
        idRemapSample: incotermMap.idRemaps.slice(0, 25),
      }
    : null;

  return {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    sourceHost: hostOf(sourceUrl),
    targetHost: hostOf(targetUrl),
    sourceConfigured: Boolean(sourceUrl),
    targetConfigured: Boolean(targetUrl),
    exclude: [...EXCLUDE].sort(),
    migrateOrder: [...MIGRATION_ORDER],
    deferredColumns: { ...DEFERRED_COLUMNS },
    inventory,
    customerMapping: {
      sourceCustomerCount: source ? customerMap.sourceIdToCode.size : null,
      targetCustomerCount: target ? customerMap.targetCodeToId.size : null,
      existingTargetMatches: customerMap.matched.length,
      newCustomers: customerMap.toCreate.length,
      duplicateSourceCodes: customerMap.sourceDuplicateCodes,
      conflictingCodes: customerMap.conflictingCodes,
      matchedSample: customerMap.matched.slice(0, 25),
      newCustomerSample: customerMap.toCreate.slice(0, 25),
    },
    masterDataReconciliation: {
      tables: masterInv.length,
      sourceRows: sum(masterInv, 'sourceCount'),
      targetRows: target ? sum(masterInv, 'targetCount') : null,
      estimatedInserts: sum(masterInv, 'estimatedInserts'),
      tablesWithDuplicateIds: masterInv.filter((i) => (i.duplicateIdCount ?? 0) > 0).length,
    },
    transactionReconciliation: {
      tables: txnInv.length,
      sourceRows: sum(txnInv, 'sourceCount'),
      targetRows: target ? sum(txnInv, 'targetCount') : null,
      estimatedInserts: sum(txnInv, 'estimatedInserts'),
      tablesWithDuplicateIds: txnInv.filter((i) => (i.duplicateIdCount ?? 0) > 0).length,
    },
    duplicateIds,
    foreignKeyViolations: customerReferenceIssues.filter((i) => i.severity === 'blocking'),
    incotermMapping,
    sharedMasterFkIssues,
    rowsRequiringIdRemapping: remapEstimates.filter((e) => e.rowsRequiringRemap !== 0),
    rowsRequiringIncotermIdRemapping: incotermRemapEstimates.filter(
      (e) => e.rowsRequiringRemap !== 0
    ),
    unsafeTables,
    finalMigrationRowEstimate: {
      totalSourceRowsInScope: totalSource,
      estimatedInserts,
      estimatedSkippedDuplicatePks: estimatedSkipped,
      estimatedCustomerCreates: customerMap.toCreate.length,
      estimatedCustomerMatchesPreserved: customerMap.matched.length,
      notes: [
        'estimatedInserts uses skipDuplicates semantics (PK already on target → skip).',
        'Customer matched-by-code rows preserve target IDs and are not re-inserted.',
        'Incoterm matched-by-code rows preserve target IDs and are not re-inserted; dependents remap incotermId.',
        'Auth: UserAccount matched by email/username; Role/Permission/SecurityGroup by natural keys; production admin preserved.',
        'Auth sessions invalidated when active; reset tickets force-expired when active; secrets redacted in reports.',
        `Auth inventory: ${authInv.length} tables, estInserts=${sum(authInv, 'estimatedInserts')}.`,
        'Unique non-PK conflicts (e.g. CustomerAddress [customerId,code]) are also skipped on apply.',
        !targetUrl
          ? 'Without TARGET_DATABASE_URL, estimatedInserts ≈ all source rows (except Customer creates use toCreate count only when target was readable).'
          : 'Target was reachable; duplicate PK / code-match probes informed estimates.',
      ],
    },
    customerReferenceIssues,
    authReconciliation,
    dependencyNotes,
    blockingIssues,
    warnings,
    applyEligible,
  };
}

async function runApply(
  source: PrismaClient,
  target: PrismaClient,
  customerMap: CustomerMap,
  incotermMap: CodeMasterMap,
  authMaps: AuthMapsBundle
): Promise<{ inserted: Record<string, number>; patched: Record<string, number> }> {
  const inserted: Record<string, number> = {};
  const patched: Record<string, number> = {};
  const deferredPatches: Array<{
    model: string;
    id: string;
    fields: Record<string, unknown>;
  }> = [];
  const migrationNow = new Date();

  await target.$transaction(
    async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      for (const model of MIGRATION_ORDER) {
        const rows = await fetchAllRows(source, model);
        if (rows.length === 0) {
          inserted[model] = 0;
          continue;
        }

        let prepared: Record<string, unknown>[] = [];

        if (model === 'Customer') {
          // Only create customers whose code is absent on target; preserve source id.
          const createIds = new Set(customerMap.toCreate.map((c) => c.sourceId));
          prepared = rows.filter((r) => createIds.has(String((r as { id: unknown }).id)));
        } else if (model === 'Incoterm') {
          // Match by code like Customer: skip codes already on target; insert only missing codes.
          // Prevents unique(code) skipDuplicates from leaving source Incoterm ids absent while
          // dependents still reference those source ids.
          prepared = filterRowsToCreateByCode(rows as Record<string, unknown>[], incotermMap);
        } else if (AUTH_TABLE_SET.has(model)) {
          prepared = prepareAuthRowsForApply(
            model as AuthTable,
            rows as Record<string, unknown>[],
            customerMap,
            authMaps,
            migrationNow
          );
        } else {
          for (const raw of rows) {
            const customerRemapped = remapCustomerFields(
              model,
              raw as Record<string, unknown>,
              customerMap
            );
            if (customerRemapped.errors.length) {
              throw new Error(customerRemapped.errors.join('; '));
            }
            const incotermRemapped = remapIncotermFields(
              model,
              customerRemapped.row,
              incotermMap
            );
            if (incotermRemapped.errors.length) {
              throw new Error(incotermRemapped.errors.join('; '));
            }
            const { row, deferred } = applyDeferredNulls(model, incotermRemapped.row);
            prepared.push(row);
            if (Object.keys(deferred).length) {
              const id = String(row.id);
              deferredPatches.push({ model, id, fields: deferred });
            }
          }
        }

        inserted[model] = await insertRows(txClient, model, prepared);
      }

      const byModel = new Map<string, Array<{ id: string; fields: Record<string, unknown> }>>();
      for (const p of deferredPatches) {
        const list = byModel.get(p.model) || [];
        list.push({ id: p.id, fields: p.fields });
        byModel.set(p.model, list);
      }
      for (const [model, patches] of byModel) {
        await patchDeferred(txClient, model, 'id', patches);
        patched[model] = patches.length;
      }
    },
    { timeout: 600_000, maxWait: 60_000 }
  );

  return { inserted, patched };
}

function writeIdentityDryRunReports(report: DryRunReport): { jsonPath: string; mdPath: string } {
  const ar = report.authReconciliation;
  const authBlocking = report.blockingIssues.filter((b) =>
    /auth |Auth |UserAccount|CustomerUser|RolePermission|UserRole|PasswordReset|UserSession|SecurityGroup|Permission|identity/i.test(
      b
    )
  );
  const identityPayload = {
    generatedAt: report.generatedAt,
    mode: report.mode,
    sourceHost: report.sourceHost,
    targetHost: report.targetHost,
    applyEligible: report.applyEligible,
    sections: {
      A_sourceIdentityCounts: ar?.tables.map((t) => ({
        model: t.model,
        sourceCount: t.sourceCount,
      })),
      B_targetIdentityCounts: ar?.tables.map((t) => ({
        model: t.model,
        targetCount: t.targetCount,
      })),
      C_userAccountReconciliation: ar
        ? {
            ...ar.maps.userAccount,
            conflicts: ar.conflicts,
            passwordHandling: ar.passwordHandling,
          }
        : null,
      D_customerUserReconciliation: ar
        ? {
            table: ar.tables.find((t) => t.model === 'CustomerUser'),
            customerRemaps: ar.maps.customer,
            orphaned: ar.identitySummary.find((r) => r.model === 'CustomerUser')?.orphaned ?? 0,
          }
        : null,
      E_rolePermissionReconciliation: ar
        ? {
            role: ar.maps.role,
            permission: ar.maps.permission,
            rolePermission: ar.tables.find((t) => t.model === 'RolePermission'),
            userRole: ar.tables.find((t) => t.model === 'UserRole'),
          }
        : null,
      F_securityGroupReconciliation: ar
        ? {
            securityGroup: ar.maps.securityGroup,
            member: ar.tables.find((t) => t.model === 'SecurityGroupMember'),
            groupRole: ar.tables.find((t) => t.model === 'SecurityGroupRole'),
          }
        : null,
      G_userNotificationReconciliation: ar?.tables.find((t) => t.model === 'UserNotification'),
      H_passwordResetTicketHandling: ar?.passwordResetHandling,
      I_userSessionHandling: ar?.sessionHandling,
      J_existingAdminHandling: ar?.productionAdminHandling,
      K_fkIntegrity: {
        orphanFkIssues: ar?.orphanFkIssues ?? [],
        dependencyProblems: ar?.dependencyProblems ?? [],
        migrationOrder: ar?.migrationOrder ?? [],
      },
      L_conflicts: ar?.conflicts ?? [],
      M_securityRedaction: ar?.redaction,
      N_tests: {
        note: 'Covered by scripts/migrateLocalToSupabaseAuth.test.ts (registered); run via npm test',
      },
      O_build: { note: 'Verified separately via npm run build' },
      P_dryRunResult: {
        applyEligible: report.applyEligible,
        identitySummary: ar?.identitySummary,
        authBlockingIssueCount: authBlocking.length,
        totalBlockingIssueCount: report.blockingIssues.length,
      },
      Q_remainingBlockers: authBlocking.length
        ? authBlocking
        : report.applyEligible
          ? []
          : report.blockingIssues.slice(0, 50),
    },
    authReconciliation: ar,
    identitySummary: ar?.identitySummary,
    redaction: ar?.redaction,
  };

  const jsonPath = path.join('logs', 'identity-migration-dry-run.json');
  const mdPath = path.join('logs', 'identity-migration-dry-run.md');
  fs.mkdirSync('logs', { recursive: true });
  fs.writeFileSync(
    jsonPath,
    redactSensitiveAuthText(JSON.stringify(identityPayload, null, 2)),
    'utf8'
  );

  const md: string[] = [];
  md.push('# Identity / Auth Migration Dry-Run Report');
  md.push('');
  md.push(`- Generated: ${report.generatedAt}`);
  md.push(`- Source: \`${report.sourceHost}\``);
  md.push(`- Target: \`${report.targetHost}\``);
  md.push(`- Mode: **dry-run** (no \`--apply\`)`);
  md.push(`- Apply eligible: **${report.applyEligible}**`);
  md.push('');
  md.push('## A. Source identity counts');
  md.push('');
  md.push('| Table | Source |');
  md.push('|---|---:|');
  for (const t of ar?.tables || []) {
    md.push(`| ${t.model} | ${t.sourceCount ?? 'n/a'} |`);
  }
  md.push('');
  md.push('## B. Target identity counts');
  md.push('');
  md.push('| Table | Target |');
  md.push('|---|---:|');
  for (const t of ar?.tables || []) {
    md.push(`| ${t.model} | ${t.targetCount ?? 'n/a'} |`);
  }
  md.push('');
  md.push('## C. UserAccount reconciliation');
  md.push('');
  if (ar) {
    const ua = ar.maps.userAccount;
    md.push(
      `- matched=${ua.matched}, toCreate=${ua.toCreate}, conflicts=${ua.conflicts}, adminsPreserved=${ua.productionAdminsPreserved}, blockingIdCollisions=${ua.blockingIdCollisions}`
    );
    md.push(
      `- matchingEmail≈${ua.matchingEmail}, matchingUsername=${ua.matchingUsername}, matchingIdSameIdentity=${ua.matchingIdSameIdentity}`
    );
    md.push(
      `- duplicateSourceEmails=${ua.duplicateSourceEmails}, duplicateSourceUsernames=${ua.duplicateSourceUsernames}`
    );
    md.push(
      `- Hash algorithm: ${ar.passwordHandling.algorithm}; compatible=${ar.passwordHandling.sourceTargetCompatible}`
    );
    md.push(`- Policy: ${ar.passwordHandling.policy}`);
    for (const s of ua.idRemapSample.slice(0, 10)) {
      md.push(`  - ${s.email}: ${s.sourceId} → ${s.targetId} (${s.action})`);
    }
  }
  md.push('');
  md.push('## D. CustomerUser reconciliation');
  md.push('');
  if (ar) {
    const cu = ar.tables.find((t) => t.model === 'CustomerUser');
    md.push(
      `- source=${cu?.sourceCount ?? 'n/a'} target=${cu?.targetCount ?? 'n/a'} estInserts=${cu?.estimatedInserts ?? 'n/a'}`
    );
    md.push(
      `- customerId remaps=${ar.maps.customer.customerUserCustomerRemaps ?? 0}, unresolved=${ar.maps.customer.customerUserUnresolved ?? 0}`
    );
    md.push(`- Note: ${ar.maps.customer.note}`);
  }
  md.push('');
  md.push('## E. Role / Permission reconciliation');
  md.push('');
  if (ar) {
    md.push(
      `- Role: matched=${ar.maps.role.matched} toCreate=${ar.maps.role.toCreate} idRemaps=${ar.maps.role.idRemaps}`
    );
    md.push(
      `- Permission: matched=${ar.maps.permission.matched} toCreate=${ar.maps.permission.toCreate} idRemaps=${ar.maps.permission.idRemaps}`
    );
    const rp = ar.tables.find((t) => t.model === 'RolePermission');
    const ur = ar.tables.find((t) => t.model === 'UserRole');
    md.push(
      `- RolePermission: src=${rp?.sourceCount ?? 'n/a'} tgt=${rp?.targetCount ?? 'n/a'} estIns=${rp?.estimatedInserts ?? 'n/a'}`
    );
    md.push(
      `- UserRole: src=${ur?.sourceCount ?? 'n/a'} tgt=${ur?.targetCount ?? 'n/a'} estIns=${ur?.estimatedInserts ?? 'n/a'}`
    );
  }
  md.push('');
  md.push('## F. Security group reconciliation');
  md.push('');
  if (ar) {
    md.push(
      `- SecurityGroup: matched=${ar.maps.securityGroup.matched} toCreate=${ar.maps.securityGroup.toCreate}`
    );
    for (const name of ['SecurityGroupMember', 'SecurityGroupRole'] as const) {
      const t = ar.tables.find((x) => x.model === name);
      md.push(
        `- ${name}: src=${t?.sourceCount ?? 0} tgt=${t?.targetCount ?? 0} estIns=${t?.estimatedInserts ?? 0}`
      );
    }
  }
  md.push('');
  md.push('## G. UserNotification reconciliation');
  md.push('');
  {
    const n = ar?.tables.find((t) => t.model === 'UserNotification');
    md.push(
      `- source=${n?.sourceCount ?? 'n/a'} target=${n?.targetCount ?? 'n/a'} estInserts=${n?.estimatedInserts ?? 'n/a'}`
    );
    const orphan = ar?.identitySummary.find((r) => r.model === 'UserNotification')?.orphaned ?? 0;
    md.push(`- orphaned userAccountId rows (nullable → NULL on apply): ${orphan}`);
  }
  md.push('');
  md.push('## H. PasswordResetTicket handling');
  md.push('');
  if (ar) {
    const p = ar.passwordResetHandling;
    md.push(
      `- total=${p.total} used=${p.historicalUsed} expired=${p.historicalExpired} activeForceExpire=${p.activeExpiredOnMigrate} orphanSkipped=${p.orphanUserSkipped}`
    );
    md.push(`- ${p.policy}`);
    md.push(`- Token independence: ${p.tokenEnvironmentIndependence}`);
  }
  md.push('');
  md.push('## I. UserSession handling');
  md.push('');
  if (ar) {
    const s = ar.sessionHandling;
    md.push(
      `- total=${s.total} historical=${s.historical} activeInvalidated=${s.activeInvalidated} orphanSkipped=${s.orphanUserSkipped}`
    );
    md.push(`- Mechanism: ${s.mechanism}`);
    md.push(`- ${s.policy}`);
  }
  md.push('');
  md.push('## J. Existing admin handling');
  md.push('');
  if (ar) {
    const d = ar.productionAdminHandling.detail;
    md.push(`- Policy: ${d.policy}`);
    md.push(
      `- Source admin: exists=${d.sourceAdmin.exists} id=${d.sourceAdmin.id ?? '-'} email=${d.sourceAdmin.email ?? '-'} username=${d.sourceAdmin.username ?? '-'} status=${d.sourceAdmin.status ?? '-'} roles=[${d.sourceAdmin.roleCodes.join(', ')}]`
    );
    md.push(
      `- Target admin: exists=${d.targetAdmin.exists} id=${d.targetAdmin.id ?? '-'} email=${d.targetAdmin.email ?? '-'} username=${d.targetAdmin.username ?? '-'} status=${d.targetAdmin.status ?? '-'} locked=${d.targetAdmin.isLocked ?? '-'} roles=[${d.targetAdmin.roleCodes.join(', ')}]`
    );
    md.push(
      `- Mapping: ${d.mapping.action} ${d.mapping.sourceId ?? '-'} → ${d.mapping.targetId ?? '-'} (preserveTargetPasswordAndStatus=${d.mapping.preserveTargetPasswordAndStatus}, remainsUsable=${d.mapping.productionAdminRemainsUsable})`
    );
  }
  md.push('');
  md.push('## K. FK integrity');
  md.push('');
  md.push(`- Auth order: ${(ar?.migrationOrder || []).join(' → ')}`);
  md.push(`- Dependency problems: ${(ar?.dependencyProblems || []).length}`);
  md.push(`- Orphan FK issues: ${(ar?.orphanFkIssues || []).length}`);
  for (const o of (ar?.orphanFkIssues || []).slice(0, 20)) {
    md.push(`  - [${o.severity}] ${o.model}.${o.column}: ${o.reason} (rows=${o.rowCount})`);
  }
  md.push('');
  md.push('## L. Conflicts');
  md.push('');
  for (const c of (ar?.conflicts || []).slice(0, 30)) {
    md.push(
      `- ${c.kind}: email=${c.email ?? '-'} username=${c.username ?? '-'} ${c.sourceId}→${c.targetId ?? '-'} — ${c.detail}`
    );
  }
  if (!(ar?.conflicts || []).length) md.push('- (none)');
  md.push('');
  md.push('## M. Security / redaction validation');
  md.push('');
  md.push(`- ${ar?.redaction.policy ?? ''}`);
  md.push(`- Never logged: ${(ar?.redaction.sensitiveFieldsNeverLogged || []).join(', ')}`);
  md.push('');
  md.push('## N. Tests');
  md.push('');
  md.push('- `scripts/migrateLocalToSupabaseAuth.test.ts` covers mapping, sessions, resets, orphans, redaction, admin protect (tests 1–14).');
  md.push('- Registered in `scripts/registered-tests.txt`.');
  md.push('');
  md.push('## O. Build');
  md.push('');
  md.push('- Run `npm run build` as part of validation gate (separate step).');
  md.push('');
  md.push('## P. Dry-run result');
  md.push('');
  md.push(`- **applyEligible=${report.applyEligible}**`);
  md.push('- Identity summary:');
  md.push('');
  md.push('| Model | Source | Target | Matched | New/Inserts | Orphans | Notes |');
  md.push('|---|---:|---:|---:|---:|---:|---|');
  for (const r of ar?.identitySummary || []) {
    md.push(
      `| ${r.model} | ${r.source ?? '-'} | ${r.target ?? '-'} | ${r.matched ?? '-'} | ${r.newOrInserts ?? '-'} | ${r.orphaned ?? 0} | ${r.notes} |`
    );
  }
  md.push('');
  md.push('## Q. Exact remaining blockers');
  md.push('');
  if (authBlocking.length) {
    for (const b of authBlocking) md.push(`- ! ${b}`);
  } else if (report.applyEligible) {
    md.push('- **None for identity apply.** Dry-run is apply-eligible. Do not run `--apply` until explicitly requested.');
  } else {
    md.push('- Apply not eligible (non-auth or env blockers):');
    for (const b of report.blockingIssues.slice(0, 30)) md.push(`- ! ${b}`);
  }
  md.push('');
  md.push('---');
  md.push('STOP. No `--apply`. No database writes from this dry-run.');

  fs.writeFileSync(mdPath, redactSensitiveAuthText(md.join('\n')), 'utf8');
  return { jsonPath, mdPath };
}

function printSummary(report: DryRunReport) {
  const lines: string[] = [];
  lines.push('=== Local → Supabase migration dry-run ===');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Source: ${report.sourceConfigured ? report.sourceHost : '(missing)'}`);
  lines.push(`Target: ${report.targetConfigured ? report.targetHost : '(missing)'}`);
  lines.push(`Migrate tables: ${report.migrateOrder.length}`);
  lines.push(`Hard-excluded tables: ${report.exclude.length}`);
  lines.push(`Auth tables in scope: ${AUTH_MIGRATION_ORDER.length}`);
  lines.push(`Apply eligible: ${report.applyEligible}`);
  lines.push('');

  // Auth reconciliation
  lines.push('--- Auth / security reconciliation ---');
  const ar = report.authReconciliation;
  if (!ar) {
    lines.push('(n/a)');
  } else {
    lines.push(`order: ${ar.migrationOrder.join(' → ')}`);
    lines.push('IDENTITY SUMMARY:');
    for (const row of ar.identitySummary) {
      lines.push(
        `  ${row.model.padEnd(22)} src=${String(row.source ?? '-').padStart(8)} tgt=${String(row.target ?? '-').padStart(8)} matched=${String(row.matched ?? '-').padStart(6)} new=${String(row.newOrInserts ?? '-').padStart(8)} orphan=${row.orphaned ?? 0}`
      );
    }
    lines.push(
      `UserAccount: matched=${ar.maps.userAccount.matched} toCreate=${ar.maps.userAccount.toCreate} conflicts=${ar.maps.userAccount.conflicts} adminsPreserved=${ar.maps.userAccount.productionAdminsPreserved} blockingIdCollisions=${ar.maps.userAccount.blockingIdCollisions} dupEmail=${ar.maps.userAccount.duplicateSourceEmails} dupUser=${ar.maps.userAccount.duplicateSourceUsernames}`
    );
    lines.push(
      `Role: matched=${ar.maps.role.matched} toCreate=${ar.maps.role.toCreate} idRemaps=${ar.maps.role.idRemaps}`
    );
    lines.push(
      `Permission: matched=${ar.maps.permission.matched} toCreate=${ar.maps.permission.toCreate} idRemaps=${ar.maps.permission.idRemaps}`
    );
    lines.push(
      `SecurityGroup: matched=${ar.maps.securityGroup.matched} toCreate=${ar.maps.securityGroup.toCreate} idRemaps=${ar.maps.securityGroup.idRemaps}`
    );
    lines.push(`Customer auth remap: ${ar.maps.customer.note}`);
    lines.push(`Production admin policy: ${ar.productionAdminHandling.policy}`);
    if (ar.productionAdminHandling.preserved.length) {
      lines.push(
        `admins preserved: ${ar.productionAdminHandling.preserved
          .map((p) => `${p.email} (${p.sourceId.slice(0, 8)}→${p.targetId.slice(0, 8)})`)
          .join(', ')}`
      );
    }
    lines.push(`Session policy: ${ar.sessionHandling.policy}`);
    lines.push(
      `sessions: total=${ar.sessionHandling.total ?? 'n/a'} historical=${ar.sessionHandling.historical ?? 'n/a'} activeInvalidated=${ar.sessionHandling.activeInvalidated ?? 'n/a'} orphanSkipped=${ar.sessionHandling.orphanUserSkipped ?? 'n/a'}`
    );
    lines.push(`Password/reset policy: ${ar.passwordHandling.policy}`);
    lines.push(`Reset ticket policy: ${ar.passwordResetHandling.policy}`);
    lines.push(
      `reset tickets: total=${ar.passwordResetHandling.total ?? 'n/a'} used=${ar.passwordResetHandling.historicalUsed ?? 'n/a'} expired=${ar.passwordResetHandling.historicalExpired ?? 'n/a'} activeForceExpired=${ar.passwordResetHandling.activeExpiredOnMigrate ?? 'n/a'} orphanSkipped=${ar.passwordResetHandling.orphanUserSkipped ?? 'n/a'}`
    );
    lines.push(`Redaction: ${ar.redaction.policy}`);
    lines.push('Auth table inventory:');
    for (const t of ar.tables) {
      lines.push(
        `  ${t.model.padEnd(24)} src=${String(t.sourceCount ?? 'n/a').padStart(8)} tgt=${String(t.targetCount ?? 'n/a').padStart(8)} estIns=${String(t.estimatedInserts ?? '-').padStart(8)}`
      );
    }
    if (ar.conflicts.length) {
      lines.push(`Auth conflicts (${ar.conflicts.length}):`);
      for (const c of ar.conflicts.slice(0, 15)) {
        lines.push(
          `  ~ ${c.kind}: email=${c.email ?? '-'} user=${c.username ?? '-'} ${c.detail}`
        );
      }
      if (ar.conflicts.length > 15) lines.push(`  ~ ... ${ar.conflicts.length - 15} more`);
    }
    if (ar.orphanFkIssues.length) {
      lines.push(`Auth orphan FK issues (${ar.orphanFkIssues.length}):`);
      for (const o of ar.orphanFkIssues.slice(0, 12)) {
        lines.push(
          `  ${o.severity === 'blocking' ? '!' : '~'} ${o.model}.${o.column}: ${o.reason} (rows=${o.rowCount})`
        );
      }
    }
  }
  lines.push('');

  // 3. Customers
  const cm = report.customerMapping;
  lines.push('--- 3. Customers ---');
  lines.push(
    `source=${cm.sourceCustomerCount ?? 'n/a'} target=${cm.targetCustomerCount ?? 'n/a'} matches=${cm.existingTargetMatches} new=${cm.newCustomers} sourceDupCodes=${cm.duplicateSourceCodes.length} conflicts=${cm.conflictingCodes.length}`
  );
  if (cm.matchedSample.length) {
    lines.push(
      `matched sample: ${cm.matchedSample
        .slice(0, 5)
        .map((m) => `${m.code}:${m.sourceId.slice(0, 8)}→${m.targetId.slice(0, 8)}`)
        .join(', ')}`
    );
  }
  if (cm.newCustomerSample.length) {
    lines.push(
      `new sample: ${cm.newCustomerSample
        .slice(0, 5)
        .map((n) => `${n.code}:${n.sourceId.slice(0, 8)}`)
        .join(', ')}`
    );
  }

  // Incoterm shared-master mapping
  lines.push('');
  lines.push('--- Incoterm mapping (code-matched shared master) ---');
  const im = report.incotermMapping;
  if (!im) {
    lines.push('(n/a)');
  } else {
    lines.push(
      `source=${im.sourceCount} target=${im.targetCount} matchedByCode=${im.matchedByCode} idRemaps=${im.idRemaps} toCreate=${im.toCreate}`
    );
    if (im.idRemapSample.length) {
      lines.push(
        `id remap sample: ${im.idRemapSample
          .slice(0, 8)
          .map((m) => `${m.code}:${m.sourceId}→${m.targetId}`)
          .join(', ')}`
      );
    }
  }
  if (report.rowsRequiringIncotermIdRemapping.length) {
    lines.push('rows requiring incotermId remap:');
    for (const r of report.rowsRequiringIncotermIdRemapping) {
      lines.push(
        `  ${r.model}.${r.column}: rows=${r.rowsRequiringRemap} distinct=${r.distinctSourceCustomerIds}`
      );
    }
  } else {
    lines.push('rows requiring incotermId remap: (none)');
  }

  // Explicit CustomerShippingCostRate parent resolution confirmation
  lines.push('');
  lines.push('--- CustomerShippingCostRate parent FK resolution ---');
  const cscrIssues = report.sharedMasterFkIssues.filter(
    (i) => i.model === 'CustomerShippingCostRate'
  );
  const orderOk =
    report.migrateOrder.indexOf('Incoterm') >= 0 &&
    report.migrateOrder.indexOf('CustomerShippingCostRate') >
      report.migrateOrder.indexOf('Incoterm') &&
    report.migrateOrder.indexOf('Customer') >= 0 &&
    report.migrateOrder.indexOf('CustomerShippingCostRate') >
      report.migrateOrder.indexOf('Customer');
  lines.push(
    `dependency order Incoterm→CustomerShippingCostRate and Customer→CustomerShippingCostRate: ${orderOk ? 'OK' : 'FAIL'}`
  );
  if (!report.targetConfigured) {
    lines.push(
      'customerId + incotermId prepared-row verification DEFERRED — TARGET_DATABASE_URL required to confirm remaps against Supabase parents'
    );
  } else if (!cscrIssues.length) {
    lines.push(
      'customerId + incotermId: all prepared refs resolve to target parents (existing or scheduled create); no blocking FK orphans'
    );
  } else {
    for (const i of cscrIssues) {
      lines.push(
        `! ${i.column}: ${i.reason} (id=${i.sourceValue}, rows=${i.rowCount}, ${i.severity})`
      );
    }
  }

  // 4–5
  lines.push('');
  lines.push('--- 4. Master-data reconciliation ---');
  const m = report.masterDataReconciliation;
  lines.push(
    `tables=${m.tables} srcRows=${m.sourceRows} tgtRows=${m.targetRows ?? 'n/a'} estInserts=${m.estimatedInserts} tablesWithDupIds=${m.tablesWithDuplicateIds}`
  );
  lines.push('');
  lines.push('--- 5. Transaction reconciliation ---');
  const t = report.transactionReconciliation;
  lines.push(
    `tables=${t.tables} srcRows=${t.sourceRows} tgtRows=${t.targetRows ?? 'n/a'} estInserts=${t.estimatedInserts} tablesWithDupIds=${t.tablesWithDuplicateIds}`
  );

  // 1–2 inventory
  lines.push('');
  lines.push('--- 1–2. Inventory (source / target counts) ---');
  for (const row of report.inventory.filter((i) => i.category !== 'excluded')) {
    const dup =
      row.duplicateIdCount == null
        ? '-'
        : row.duplicateIdCount < 0
          ? 'composite'
          : String(row.duplicateIdCount);
    lines.push(
      `${row.model.padEnd(42)} src=${String(row.sourceCount ?? 'err').padStart(6)} tgt=${String(row.targetCount ?? 'n/a').padStart(6)} dupIds=${dup.padStart(6)} estIns=${String(row.estimatedInserts ?? '-').padStart(6)} [${row.category}]`
    );
  }

  // 6
  lines.push('');
  lines.push(`--- 6. Duplicate IDs (${report.duplicateIds.length} tables) ---`);
  for (const d of report.duplicateIds.slice(0, 30)) {
    lines.push(
      `${d.model}: ${d.duplicateIdCount} (sample: ${d.sampleDuplicateIds.slice(0, 3).join(', ') || '-'})`
    );
  }
  if (report.duplicateIds.length > 30) {
    lines.push(`… ${report.duplicateIds.length - 30} more tables`);
  }

  // 7
  lines.push('');
  lines.push(`--- 7. Foreign-key / customer-ref violations (${report.foreignKeyViolations.length}) ---`);
  {
    const byCol = new Map<string, { reason: string; rows: number; distinct: number }>();
    for (const v of report.foreignKeyViolations) {
      const key = `${v.model}.${v.column}`;
      const prev = byCol.get(key);
      if (prev) {
        prev.rows += v.rowCount;
        prev.distinct += 1;
      } else {
        byCol.set(key, { reason: v.reason, rows: v.rowCount, distinct: 1 });
      }
    }
    if (!byCol.size) lines.push('(none blocking)');
    for (const [key, agg] of byCol) {
      lines.push(
        `! ${key}: ${agg.reason} (rows=${agg.rows}, distinctValues=${agg.distinct})`
      );
    }
  }

  // 8
  lines.push('');
  lines.push('--- 8. Rows requiring customer ID remapping ---');
  const remaps = report.rowsRequiringIdRemapping.filter((r) => r.rowsRequiringRemap > 0);
  if (!remaps.length) {
    lines.push(
      report.targetConfigured
        ? '(none — all customer refs keep source id or no matched remaps)'
        : '(no remaps computed without target matches; new customers keep source ids)'
    );
  } else {
    for (const r of remaps) {
      lines.push(
        `${r.model}.${r.column}: ${r.rowsRequiringRemap} rows (${r.distinctSourceCustomerIds} distinct source customer ids)`
      );
    }
  }

  // 9
  lines.push('');
  lines.push('--- 9. Tables that cannot safely be migrated ---');
  if (!report.unsafeTables.length) {
    lines.push('(none — auth is in-scope additively; only blocking id-collision UserAccounts listed if any)');
  } else {
    for (const u of report.unsafeTables) {
      lines.push(`${u.model.padEnd(28)} src=${String(u.sourceCount ?? 'n/a').padStart(6)} — ${u.reason}`);
    }
  }

  // 10
  lines.push('');
  lines.push('--- 10. Final migration row estimate ---');
  const f = report.finalMigrationRowEstimate;
  lines.push(`totalSourceRowsInScope=${f.totalSourceRowsInScope}`);
  lines.push(`estimatedInserts=${f.estimatedInserts}`);
  lines.push(`estimatedSkippedDuplicatePks=${f.estimatedSkippedDuplicatePks}`);
  lines.push(`estimatedCustomerCreates=${f.estimatedCustomerCreates}`);
  lines.push(`estimatedCustomerMatchesPreserved=${f.estimatedCustomerMatchesPreserved}`);
  for (const n of f.notes) lines.push(`note: ${n}`);

  if (report.blockingIssues.length) {
    lines.push('');
    lines.push(`--- BLOCKING (${report.blockingIssues.length}) ---`);
    for (const b of report.blockingIssues) lines.push(`! ${b}`);
  }
  if (report.warnings.length) {
    lines.push('');
    lines.push(`--- Warnings (${report.warnings.length}) ---`);
    for (const w of report.warnings.slice(0, 40)) lines.push(`~ ${w}`);
    if (report.warnings.length > 40) lines.push(`~ ... ${report.warnings.length - 40} more`);
  }

  lines.push('');
  lines.push('--- Dependency order ---');
  lines.push(report.migrateOrder.join(' → '));
  console.log(redactSensitiveAuthText(lines.join('\n')));
}

async function main() {
  const { apply, reportPath } = parseArgs(process.argv.slice(2));
  const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (apply) {
    if (process.env.MIGRATE_CONFIRM !== 'YES') {
      console.error(
        'Refuse apply: set MIGRATE_CONFIRM=YES and pass --apply only after a clean dry-run.'
      );
      process.exit(2);
    }
    if (!sourceUrl || !targetUrl) {
      console.error('Apply requires SOURCE_DATABASE_URL/DATABASE_URL and TARGET_DATABASE_URL.');
      process.exit(2);
    }
  }

  let source: PrismaClient | null = null;
  let target: PrismaClient | null = null;

  try {
    if (sourceUrl) {
      source = createClient(sourceUrl);
      await source.$queryRaw`SELECT 1`;
    }
    if (targetUrl) {
      target = createClient(targetUrl);
      await target.$queryRaw`SELECT 1`;
    }

    const report = await runDryRun(source, target, sourceUrl, targetUrl);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const reportJson = redactSensitiveAuthText(JSON.stringify(report, null, 2));
    fs.writeFileSync(reportPath, reportJson, 'utf8');
    printSummary(report);
    console.log(`\nFull report written to ${reportPath}`);

    const identityPaths = writeIdentityDryRunReports(report);
    console.log(`Identity JSON report: ${identityPaths.jsonPath}`);
    console.log(`Identity MD report: ${identityPaths.mdPath}`);

    if (!apply) {
      if (!report.applyEligible) {
        console.log('\nDry-run complete. Apply is NOT eligible until blocking issues are resolved.');
        process.exitCode = report.sourceConfigured ? 0 : 1;
      } else {
        console.log(
          '\nDry-run PASSED. To apply later (NOT run in this task):\n  MIGRATE_CONFIRM=YES npx tsx scripts/migrateLocalToSupabase.ts --apply'
        );
      }
      return;
    }

    if (!report.applyEligible || !source || !target) {
      console.error('Cannot apply: dry-run is not eligible.');
      process.exit(1);
    }
    const customerMap = await buildCustomerMap(source, target);
    const incotermMap = await buildIncotermMap(source, target);
    const authMaps = await buildAuthMaps(source, target);
    console.log('\nStarting transactional apply...');
    console.log(
      `Customer plan: preserve ${customerMap.matched.length} matched target IDs; create ${customerMap.toCreate.length} new customers.`
    );
    console.log(
      `Incoterm plan: preserve ${incotermMap.matched.length} matched-by-code target IDs (${incotermMap.idRemaps.length} id remaps); create ${incotermMap.toCreate.length} missing codes.`
    );
    console.log(
      `Auth plan: UserAccount create=${authMaps.userAccount.toCreate.length} match/preserve=${authMaps.userAccount.matched.length} (adminsPreserved=${authMaps.userAccount.productionAdminsPreserved.length}); Role create=${authMaps.role.toCreate.length}; Permission create=${authMaps.permission.toCreate.length}. Active sessions will be revoked; active reset tickets force-expired.`
    );
    const result = await runApply(source, target, customerMap, incotermMap, authMaps);
    const applyReport = {
      ...report,
      mode: 'apply' as const,
      applyResult: result,
    };
    const applyPath = reportPath.replace(/dry-run/i, 'apply');
    fs.writeFileSync(
      applyPath,
      redactSensitiveAuthText(JSON.stringify(applyReport, null, 2)),
      'utf8'
    );
    console.log('Apply committed. Result counts written (secrets redacted).');
    console.log(`Apply report: ${applyPath}`);
  } catch (err) {
    console.error('Migration utility failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await Promise.all([source?.$disconnect(), target?.$disconnect()]);
  }
}

main();
