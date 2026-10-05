/**
 * READ-ONLY post-migration reconciliation: local energya_connect vs Supabase.
 *
 * - Never writes / truncates / migrates / --apply
 * - Never logs credentials, connection strings, passwords, or JWTs
 *
 * Env: DATABASE_URL (source), TARGET_DATABASE_URL (target)
 * Usage: npx tsx scripts/postMigrationReconciliation.ts
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

dotenv.config();

const EXCLUDE_AUTH = [
  'UserAccount',
  'Role',
  'SecurityGroup',
  'SecurityGroupMember',
  'SecurityGroupRole',
  'Permission',
  'RolePermission',
  'UserRole',
  'UserSession',
  'PasswordResetTicket',
  'UserNotification',
  'CustomerUser',
] as const;

const MIGRATION_ORDER: string[] = [
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
  'CommercialInquiry',
  'CommercialInquiryAttachment',
  'CommercialInquiryLine',
  'CommercialInquiryLineAttachment',
  'V2ConfigurationSnapshot',
  'V2CuttingLengthRequirement',
  'V2CuttingLengthPlan',
  'V2DrumPlan',
  'V2DrumPlanLine',
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
  'CostingRun',
  'CostingLine',
  'CostingCalculation',
  'CostingCalculationSnapshot',
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
  'ShippingCostTransactionSnapshot',
  'ShipmentCostSnapshot',
  'ShipmentCostSnapshotLine',
  'FinancialOfferSnapshot',
  'FinancialOfferProductLine',
  'FinancialOfferShipmentLine',
  'FinancialOfferShipmentTypeLine',
  'WorkflowInstance',
  'WorkflowTask',
  'WorkflowAssignment',
  'WorkflowEvent',
  'WorkflowStageTiming',
  'EmailOutbox',
  'CustomerServiceCase',
  'CaseComment',
  'CaseAttachment',
  'CaseAssignment',
  'CaseStatusHistory',
  'CaseResolution',
  'SupportChatSession',
  'SupportChatMessage',
];

const PRIORITY_TABLES = new Set([
  'Customer',
  'CableMaster',
  'CableBomLine',
  'GovernedBomLine',
  'RawMaterial',
  'RawMaterialPrice',
  'DrumMaster',
  'TechnicalOfficeRequest',
  'CommercialInquiry',
  'CommercialInquiryLine',
  'V2ConfigurationSnapshot',
  'V2CuttingLengthRequirement',
  'V2CuttingLengthPlan',
  'V2DrumPlan',
  'V2DrumPlanLine',
  'ContainerStudy',
  'CostingRun',
  'CostingLine',
  'CostingCalculation',
  'CostingCalculationSnapshot',
  'CommercialQuotation',
  'CommercialQuotationLine',
  'CommercialCommitment',
  'EpcSalesOrder',
  'EpcSalesOrderLine',
  'ShippingCostTransactionSnapshot',
  'FinancialOfferSnapshot',
  'WorkflowInstance',
  'WorkflowTask',
  'WorkflowEvent',
  'AuditEvent',
]);

type DbEndpoint = {
  host: string | null;
  port: string | null;
  dbname: string | null;
  username: string | null;
};

function redactUrl(url: string | undefined): DbEndpoint {
  if (!url) return { host: null, port: null, dbname: null, username: null };
  try {
    const u = new URL(url);
    return {
      host: u.hostname || null,
      port: u.port || null,
      dbname: u.pathname?.replace(/^\//, '').split('?')[0] || null,
      username: u.username || null,
    };
  } catch {
    return { host: '(unparseable)', port: null, dbname: null, username: null };
  }
}

function modelToDelegate(client: PrismaClient, model: string) {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  return (client as unknown as Record<string, { count: () => Promise<number> }>)[name];
}

async function countTable(client: PrismaClient, model: string): Promise<number | null> {
  const d = modelToDelegate(client, model);
  if (!d?.count) return null;
  try {
    return await d.count();
  } catch {
    return null;
  }
}

type ApplyInventoryRow = {
  model: string;
  category?: string;
  sourceCount: number | null;
  targetCount: number | null;
  estimatedInserts?: number | null;
  duplicateIdCount?: number | null;
};

type ApplyReport = {
  generatedAt?: string;
  inventory?: ApplyInventoryRow[];
  applyResult?: { inserted?: Record<string, number>; patched?: Record<string, number> };
  customerMapping?: {
    matchedSample?: Array<{ code: string; sourceId: string; targetId: string }>;
    existingTargetMatches?: number;
    newCustomers?: number;
  };
  incotermMapping?: {
    matchedByCode?: number;
    idRemaps?: number;
    toCreate?: number;
    idRemapSample?: Array<{ code: string; sourceId: string; targetId: string }>;
  };
};

function loadApplyReport(): ApplyReport | null {
  const p = path.join(process.cwd(), 'logs', 'migrate-local-to-supabase-apply.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ApplyReport;
}

type OrphanRow = {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  orphanCount: number;
  sampleValues: string[];
};

async function listForeignKeys(client: PrismaClient): Promise<
  Array<{
    childTable: string;
    childColumn: string;
    parentTable: string;
    parentColumn: string;
    constraintName: string;
  }>
> {
  const rows = await client.$queryRaw<
    Array<{
      child_table: string;
      child_column: string;
      parent_table: string;
      parent_column: string;
      constraint_name: string;
    }>
  >(Prisma.sql`
    SELECT
      tc.table_name AS child_table,
      kcu.column_name AS child_column,
      ccu.table_name AS parent_table,
      ccu.column_name AS parent_column,
      tc.constraint_name AS constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name
  `);
  return rows.map((r) => ({
    childTable: r.child_table,
    childColumn: r.child_column,
    parentTable: r.parent_table,
    parentColumn: r.parent_column,
    constraintName: r.constraint_name,
  }));
}

async function countOrphans(
  client: PrismaClient,
  childTable: string,
  childColumn: string,
  parentTable: string,
  parentColumn: string
): Promise<{ count: number; samples: string[] }> {
  // Identifier quoting — tables/columns come from information_schema only.
  const q = Prisma.raw(`
    SELECT COUNT(*)::bigint AS cnt
    FROM "${childTable}" c
    WHERE c."${childColumn}" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "${parentTable}" p
        WHERE p."${parentColumn}" = c."${childColumn}"
      )
  `);
  const countRows = await client.$queryRaw<Array<{ cnt: bigint }>>`SELECT COUNT(*)::bigint AS cnt
    FROM ${Prisma.raw(`"${childTable}"`)} c
    WHERE c.${Prisma.raw(`"${childColumn}"`)} IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${Prisma.raw(`"${parentTable}"`)} p
        WHERE p.${Prisma.raw(`"${parentColumn}"`)} = c.${Prisma.raw(`"${childColumn}"`)}
      )`;
  const count = Number(countRows[0]?.cnt ?? 0);
  if (count === 0) return { count: 0, samples: [] };

  const sampleRows = await client.$queryRaw<Array<{ v: string }>>`
    SELECT DISTINCT c.${Prisma.raw(`"${childColumn}"`)}::text AS v
    FROM ${Prisma.raw(`"${childTable}"`)} c
    WHERE c.${Prisma.raw(`"${childColumn}"`)} IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${Prisma.raw(`"${parentTable}"`)} p
        WHERE p.${Prisma.raw(`"${parentColumn}"`)} = c.${Prisma.raw(`"${childColumn}"`)}
      )
    LIMIT 10
  `;
  void q;
  return { count, samples: sampleRows.map((r) => r.v) };
}

type ChainCheck = {
  name: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: Record<string, unknown>;
};

async function runChainChecks(target: PrismaClient): Promise<ChainCheck[]> {
  const checks: ChainCheck[] = [];

  async function orphanCount(sql: string): Promise<number> {
    const rows = await target.$queryRawUnsafe<Array<{ cnt: bigint }>>(sql);
    return Number(rows[0]?.cnt ?? 0);
  }

  const chains: Array<{ name: string; description: string; sql: string }> = [
    {
      name: 'CommercialInquiry → CommercialInquiryLine',
      description: 'Inquiry lines must reference existing inquiries',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "CommercialInquiryLine" l
            WHERE NOT EXISTS (SELECT 1 FROM "CommercialInquiry" i WHERE i.id = l."inquiryId")`,
    },
    {
      name: 'CommercialInquiryLine → V2ConfigurationSnapshot',
      description: 'V2 snapshots must reference existing inquiry lines',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "V2ConfigurationSnapshot" s
            WHERE NOT EXISTS (SELECT 1 FROM "CommercialInquiryLine" l WHERE l.id = s."inquiryLineId")`,
    },
    {
      name: 'V2CuttingLengthRequirement → V2CuttingLengthPlan',
      description: 'Cutting plans must reference existing requirements (when set)',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "V2CuttingLengthPlan" p
            WHERE p."cuttingLengthRequirementId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "V2CuttingLengthRequirement" r WHERE r.id = p."cuttingLengthRequirementId")`,
    },
    {
      name: 'V2DrumPlan → V2DrumPlanLine',
      description: 'Drum plan lines must reference existing drum plans',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "V2DrumPlanLine" l
            WHERE NOT EXISTS (SELECT 1 FROM "V2DrumPlan" p WHERE p.id = l."drumPlanId")`,
    },
    {
      name: 'CostingRun → CostingLine',
      description: 'Costing lines must reference existing runs',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "CostingLine" l
            WHERE NOT EXISTS (SELECT 1 FROM "CostingRun" r WHERE r.id = l."costingRunId")`,
    },
    {
      name: 'CostingCalculation → CostingCalculationSnapshot',
      description: 'Calculation snapshots must reference existing calculations',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "CostingCalculationSnapshot" s
            WHERE NOT EXISTS (SELECT 1 FROM "CostingCalculation" c WHERE c.id = s."calculationId")`,
    },
    {
      name: 'CommercialQuotation → CommercialQuotationLine',
      description: 'Quotation lines must reference existing quotations',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "CommercialQuotationLine" l
            WHERE NOT EXISTS (SELECT 1 FROM "CommercialQuotation" q WHERE q.id = l."quotationId")`,
    },
    {
      name: 'EpcSalesOrder → EpcSalesOrderLine',
      description: 'Order lines must reference existing orders',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "EpcSalesOrderLine" l
            WHERE NOT EXISTS (SELECT 1 FROM "EpcSalesOrder" o WHERE o.id = l."salesOrderId")`,
    },
    {
      name: 'ContainerStudy → ContainerStudyResult',
      description: 'Study results must reference existing studies',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "ContainerStudyResult" r
            WHERE NOT EXISTS (SELECT 1 FROM "ContainerStudy" s WHERE s.id = r."studyId")`,
    },
    {
      name: 'WorkflowInstance → WorkflowTask',
      description: 'Workflow tasks must reference existing instances',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "WorkflowTask" t
            WHERE NOT EXISTS (SELECT 1 FROM "WorkflowInstance" i WHERE i.id = t."instanceId")`,
    },
    {
      name: 'WorkflowInstance → WorkflowEvent',
      description: 'Workflow events must reference existing instances',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "WorkflowEvent" e
            WHERE NOT EXISTS (SELECT 1 FROM "WorkflowInstance" i WHERE i.id = e."instanceId")`,
    },
    {
      name: 'FinancialOfferSnapshot → FinancialOfferProductLine',
      description: 'Offer product lines must reference existing offers',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "FinancialOfferProductLine" l
            WHERE NOT EXISTS (SELECT 1 FROM "FinancialOfferSnapshot" o WHERE o.id = l."snapshotId")`,
    },
    {
      name: 'ShippingCostTransactionSnapshot customerId',
      description: 'Snapshot customerId (when set) must resolve to Customer',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "ShippingCostTransactionSnapshot" s
            WHERE s."customerId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = s."customerId")`,
    },
    {
      name: 'ShippingCostTransactionSnapshot incotermId',
      description: 'Snapshot incotermId (when set) must resolve to Incoterm',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "ShippingCostTransactionSnapshot" s
            WHERE s."incotermId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "Incoterm" i WHERE i.id = s."incotermId")`,
    },
    {
      name: 'CommercialCommitment customerMasterId',
      description: 'Commitment customerMasterId (when set) must resolve',
      sql: `SELECT COUNT(*)::bigint AS cnt FROM "CommercialCommitment" c
            WHERE c."customerMasterId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "Customer" x WHERE x.id = c."customerMasterId")`,
    },
  ];

  for (const c of chains) {
    try {
      const n = await orphanCount(c.sql);
      checks.push({
        name: c.name,
        description: c.description,
        status: n === 0 ? 'PASS' : 'FAIL',
        details: { orphanCount: n },
      });
    } catch (e) {
      checks.push({
        name: c.name,
        description: c.description,
        status: 'WARN',
        details: { error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  return checks;
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL || process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!sourceUrl || !targetUrl) {
    console.error('Missing DATABASE_URL and/or TARGET_DATABASE_URL');
    process.exit(1);
  }

  const sourceEp = redactUrl(sourceUrl);
  const targetEp = redactUrl(targetUrl);
  console.log('READ-ONLY post-migration reconciliation');
  console.log('Source:', sourceEp);
  console.log('Target:', targetEp);

  const apply = loadApplyReport();
  const applyInvByModel = new Map(
    (apply?.inventory || [])
      .filter((r) => r.category !== 'excluded' && !String(r.model).includes('[EXCLUDED]'))
      .map((r) => [r.model.replace(/\s*\[EXCLUDED\]$/, ''), r])
  );
  const inserted = apply?.applyResult?.inserted || {};

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

  const tableRows: Array<{
    model: string;
    priority: boolean;
    sourceCount: number | null;
    targetCount: number | null;
    expectedTargetCount: number | null;
    difference: number | null;
    preApplyTargetCount: number | null;
    insertedDuringApply: number | null;
    status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
    notes: string[];
  }> = [];

  try {
    await source.$queryRaw`SELECT 1`;
    await target.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error('Connectivity failed (details redacted):', e instanceof Error ? e.name : 'error');
    await source.$disconnect();
    await target.$disconnect();
    process.exit(1);
  }

  console.log('Counting migrated tables...');
  for (const model of MIGRATION_ORDER) {
    const src = await countTable(source, model);
    const tgt = await countTable(target, model);
    const pre = applyInvByModel.get(model)?.targetCount ?? null;
    const ins = inserted[model] ?? null;
    let expected: number | null = null;
    const notes: string[] = [];

    if (pre != null && ins != null) {
      expected = pre + ins;
      notes.push(`expected = preApply(${pre}) + inserted(${ins})`);
    } else if (ins != null) {
      expected = ins;
      notes.push(`expected = inserted(${ins}) (no pre-apply baseline)`);
    } else if (src != null) {
      expected = src;
      notes.push('expected fallback = sourceCount (no apply insert stats)');
    }

    // Customer: 1 match preserved + creates
    if (model === 'Customer' && apply?.customerMapping) {
      const matches = apply.customerMapping.existingTargetMatches ?? 1;
      const creates = apply.customerMapping.newCustomers ?? (ins ?? 0);
      expected = matches + creates;
      notes.push(`customer match-by-code: matches=${matches} creates=${creates}`);
    }
    // Incoterm: all matched, none created
    if (model === 'Incoterm' && apply?.incotermMapping) {
      expected = (applyInvByModel.get('Incoterm')?.targetCount ?? 11);
      notes.push(
        `incoterm match-by-code: matched=${apply.incotermMapping.matchedByCode} toCreate=${apply.incotermMapping.toCreate}`
      );
    }

    let status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' = 'SKIP';
    let difference: number | null = null;
    if (tgt != null && expected != null) {
      difference = tgt - expected;
      if (difference === 0) status = 'PASS';
      else status = 'FAIL';
    } else if (tgt != null && src != null) {
      difference = tgt - src;
      status = difference === 0 ? 'PASS' : 'WARN';
      notes.push('compared to source only');
    }

    // Soft note when target > source due to preserved pre-existing rows
    if (src != null && tgt != null && tgt > src && status === 'PASS') {
      notes.push(`target > source by ${tgt - src} (preserved pre-existing rows)`);
    }

    tableRows.push({
      model,
      priority: PRIORITY_TABLES.has(model),
      sourceCount: src,
      targetCount: tgt,
      expectedTargetCount: expected,
      difference,
      preApplyTargetCount: pre,
      insertedDuringApply: ins,
      status,
      notes,
    });
  }

  // Auth isolation
  console.log('Checking auth isolation...');
  const authRows: Array<{
    model: string;
    sourceCount: number | null;
    targetCount: number | null;
    preApplyTargetCount: number | null;
    status: 'PASS' | 'FAIL' | 'WARN';
    notes: string[];
  }> = [];

  const applyAuthPre = new Map<string, number | null>();
  for (const r of apply?.inventory || []) {
    const name = String(r.model).replace(/\s*\[EXCLUDED\]$/, '');
    if (EXCLUDE_AUTH.includes(name as (typeof EXCLUDE_AUTH)[number])) {
      applyAuthPre.set(name, r.targetCount);
    }
  }

  for (const model of EXCLUDE_AUTH) {
    const src = await countTable(source, model);
    const tgt = await countTable(target, model);
    const pre = applyAuthPre.get(model) ?? null;
    const notes: string[] = [];
    let status: 'PASS' | 'FAIL' | 'WARN' = 'PASS';

    if (pre != null && tgt != null) {
      if (tgt === pre) {
        notes.push('target count unchanged vs pre-apply baseline (auth not overwritten by migration row counts)');
      } else if (tgt > pre) {
        // Auth can grow independently after apply (logins etc.)
        notes.push(
          `target grew by ${tgt - pre} vs pre-apply — likely independent target auth activity, not migration`
        );
        status = 'WARN';
      } else {
        notes.push(`target SHRANK by ${pre - tgt} vs pre-apply — investigate possible overwrite`);
        status = 'FAIL';
      }
    } else if (tgt != null && src != null && tgt === src && src > 100) {
      notes.push('target count equals large source count — suspicious for excluded auth table');
      status = 'FAIL';
    } else {
      notes.push('auth tables excluded from migration; counts expected to remain independent');
    }

    // Strong signal: UserAccount / CustomerUser / UserNotification should NOT equal source
    if (
      ['UserAccount', 'CustomerUser', 'UserNotification', 'UserSession', 'PasswordResetTicket'].includes(
        model
      ) &&
      src != null &&
      tgt != null &&
      src > 0 &&
      tgt === src
    ) {
      status = 'FAIL';
      notes.push('identical large counts suggest accidental migration');
    }

    authRows.push({ model, sourceCount: src, targetCount: tgt, preApplyTargetCount: pre, status, notes });
  }

  // Customer deep checks
  console.log('Customer / Incoterm deep checks...');
  const cElandSourceId =
    apply?.customerMapping?.matchedSample?.find((m) => m.code === 'C-ELAND')?.sourceId ||
    'cmt2s3kda004itxtkr41fzgr0';
  const cElandTargetId =
    apply?.customerMapping?.matchedSample?.find((m) => m.code === 'C-ELAND')?.targetId ||
    'cmuk6t57k006rtx2cxzsdwzbd';

  const sourceEland = await source.customer.findUnique({
    where: { code: 'C-ELAND' },
    select: { id: true, code: true, name: true },
  });
  const targetEland = await target.customer.findUnique({
    where: { code: 'C-ELAND' },
    select: { id: true, code: true, name: true },
  });
  const targetHasSourceElandId = await target.customer.findUnique({
    where: { id: cElandSourceId },
    select: { id: true, code: true },
  });

  const sourceDupCodes = await source.$queryRaw<Array<{ code: string; cnt: bigint }>>`
    SELECT code, COUNT(*)::bigint AS cnt FROM "Customer" GROUP BY code HAVING COUNT(*) > 1 LIMIT 20
  `;
  const targetDupCodes = await target.$queryRaw<Array<{ code: string; cnt: bigint }>>`
    SELECT code, COUNT(*)::bigint AS cnt FROM "Customer" GROUP BY code HAVING COUNT(*) > 1 LIMIT 20
  `;

  const sampleCodes = await source.$queryRaw<Array<{ code: string }>>`
    SELECT code FROM "Customer" WHERE code <> 'C-ELAND' ORDER BY "createdAt" DESC LIMIT 8
  `;
  const sampleOnTarget: Array<{ code: string; present: boolean; targetId: string | null }> = [];
  for (const s of sampleCodes) {
    const t = await target.customer.findUnique({
      where: { code: s.code },
      select: { id: true },
    });
    sampleOnTarget.push({ code: s.code, present: !!t, targetId: t?.id ?? null });
  }

  const customerCheck = {
    sourceCount: tableRows.find((t) => t.model === 'Customer')?.sourceCount ?? null,
    targetCount: tableRows.find((t) => t.model === 'Customer')?.targetCount ?? null,
    expectedTargetCount: tableRows.find((t) => t.model === 'Customer')?.expectedTargetCount ?? null,
    cEland: {
      sourceId: sourceEland?.id ?? null,
      targetId: targetEland?.id ?? null,
      expectedSourceId: cElandSourceId,
      expectedTargetId: cElandTargetId,
      sourceIdAbsentOnTarget: !targetHasSourceElandId,
      idsMatchExpected:
        sourceEland?.id === cElandSourceId && targetEland?.id === cElandTargetId,
      remapApplied: targetEland?.id === cElandTargetId && targetEland?.id !== cElandSourceId,
    },
    sourceDuplicateCodes: sourceDupCodes.map((r) => ({ code: r.code, count: Number(r.cnt) })),
    targetDuplicateCodes: targetDupCodes.map((r) => ({ code: r.code, count: Number(r.cnt) })),
    sampleAdditionalCodes: sampleOnTarget,
    status: 'PASS' as 'PASS' | 'FAIL' | 'WARN',
    issues: [] as string[],
  };

  if (customerCheck.sourceCount !== customerCheck.targetCount) {
    customerCheck.issues.push(
      `source/target count mismatch: ${customerCheck.sourceCount} vs ${customerCheck.targetCount}`
    );
    customerCheck.status = 'FAIL';
  }
  if (!customerCheck.cEland.idsMatchExpected) {
    customerCheck.issues.push('C-ELAND source/target IDs do not match expected remap pair');
    customerCheck.status = 'FAIL';
  }
  if (!customerCheck.cEland.remapApplied && customerCheck.cEland.sourceId === customerCheck.cEland.targetId) {
    customerCheck.issues.push('C-ELAND IDs identical on both sides (unexpected if remap was planned)');
    customerCheck.status = 'WARN';
  }
  if (customerCheck.targetDuplicateCodes.length) {
    customerCheck.issues.push(`duplicate codes on target: ${customerCheck.targetDuplicateCodes.length}`);
    customerCheck.status = 'FAIL';
  }
  if (sampleOnTarget.some((s) => !s.present)) {
    customerCheck.issues.push('one or more sample source customer codes missing on target');
    customerCheck.status = 'FAIL';
  }

  // Incoterm checks
  const sourceIncoterms = await source.incoterm.findMany({
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });
  const targetIncoterms = await target.incoterm.findMany({
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });
  const remaps = apply?.incotermMapping?.idRemapSample || [
    { code: 'DAP', sourceId: 'cmtzjdddx0000tx60x78gc42q', targetId: 'incoterm-icc-dap' },
    { code: 'CIF', sourceId: 'cmtzjddeg0002tx60ylv86vva', targetId: 'incoterm-icc-cif' },
  ];

  const incotermCheck = {
    sourceCount: sourceIncoterms.length,
    targetCount: targetIncoterms.length,
    allCodesPresent:
      sourceIncoterms.every((s) => targetIncoterms.some((t) => t.code === s.code)) &&
      targetIncoterms.length === 11,
    byCode: sourceIncoterms.map((s) => {
      const t = targetIncoterms.find((x) => x.code === s.code);
      const remap = remaps.find((r) => r.code === s.code);
      return {
        code: s.code,
        sourceId: s.id,
        targetId: t?.id ?? null,
        usesTargetIdForRemap: remap ? t?.id === remap.targetId : t?.id === s.id || !!t,
        expectedTargetId: remap?.targetId ?? s.id,
      };
    }),
    dapCifUseTargetIds: remaps.every((r) => {
      const t = targetIncoterms.find((x) => x.code === r.code);
      return t?.id === r.targetId;
    }),
    orphanIncotermRefs: [] as OrphanRow[],
    status: 'PASS' as 'PASS' | 'FAIL' | 'WARN',
    issues: [] as string[],
  };

  if (incotermCheck.sourceCount !== 11 || incotermCheck.targetCount !== 11) {
    incotermCheck.issues.push(`expected 11 Incoterms each side; got src=${incotermCheck.sourceCount} tgt=${incotermCheck.targetCount}`);
    incotermCheck.status = 'FAIL';
  }
  if (!incotermCheck.dapCifUseTargetIds) {
    incotermCheck.issues.push('DAP/CIF do not use expected target Incoterm IDs');
    incotermCheck.status = 'FAIL';
  }

  // CustomerShippingCostRate
  const csrCount = await target.customerShippingCostRate.count();
  const csrOrphanCustomer = await target.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*)::bigint AS cnt FROM "CustomerShippingCostRate" r
    WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = r."customerId")
  `;
  const csrOrphanIncoterm = await target.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*)::bigint AS cnt FROM "CustomerShippingCostRate" r
    WHERE NOT EXISTS (SELECT 1 FROM "Incoterm" i WHERE i.id = r."incotermId")
  `;
  const csrSample = await target.customerShippingCostRate.findMany({
    take: 6,
    select: { id: true, customerId: true, incotermId: true, deliveryPoint: true, containerType: true },
  });
  const shippingRateCheck = {
    targetCount: csrCount,
    expectedCount: 6,
    orphanCustomerIds: Number(csrOrphanCustomer[0]?.cnt ?? 0),
    orphanIncotermIds: Number(csrOrphanIncoterm[0]?.cnt ?? 0),
    sample: csrSample,
    status: 'PASS' as 'PASS' | 'FAIL',
    issues: [] as string[],
  };
  if (csrCount !== 6) {
    shippingRateCheck.issues.push(`expected 6 CustomerShippingCostRate rows, found ${csrCount}`);
    shippingRateCheck.status = 'FAIL';
  }
  if (shippingRateCheck.orphanCustomerIds || shippingRateCheck.orphanIncotermIds) {
    shippingRateCheck.issues.push('orphan customerId or incotermId on CustomerShippingCostRate');
    shippingRateCheck.status = 'FAIL';
  }

  // FK integrity across migrated business tables
  console.log('Scanning FK orphans on target (business tables)...');
  const inScope = new Set(MIGRATION_ORDER);
  const fks = await listForeignKeys(target);
  const businessFks = fks.filter(
    (fk) => inScope.has(fk.childTable) && inScope.has(fk.parentTable)
  );

  const orphanFks: OrphanRow[] = [];
  let fkChecked = 0;
  for (const fk of businessFks) {
    fkChecked++;
    try {
      const { count, samples } = await countOrphans(
        target,
        fk.childTable,
        fk.childColumn,
        fk.parentTable,
        fk.parentColumn
      );
      if (count > 0) {
        orphanFks.push({
          childTable: fk.childTable,
          childColumn: fk.childColumn,
          parentTable: fk.parentTable,
          parentColumn: fk.parentColumn,
          orphanCount: count,
          sampleValues: samples,
        });
      }
    } catch (e) {
      orphanFks.push({
        childTable: fk.childTable,
        childColumn: fk.childColumn,
        parentTable: fk.parentTable,
        parentColumn: fk.parentColumn,
        orphanCount: -1,
        sampleValues: [e instanceof Error ? e.message : String(e)],
      });
    }
  }

  // Also check Incoterm orphans from shipping tables specifically
  for (const fk of businessFks.filter((f) => f.parentTable === 'Incoterm')) {
    const hit = orphanFks.find(
      (o) =>
        o.childTable === fk.childTable &&
        o.childColumn === fk.childColumn &&
        o.orphanCount > 0
    );
    if (hit) incotermCheck.orphanIncotermRefs.push(hit);
  }
  if (incotermCheck.orphanIncotermRefs.length) {
    incotermCheck.issues.push('orphan Incoterm FK refs found');
    incotermCheck.status = 'FAIL';
  }

  console.log('Running transaction integrity chains...');
  const chainChecks = await runChainChecks(target);

  // Auth timestamp probe (max updatedAt / createdAt)
  const authTimestamps: Array<{
    model: string;
    sourceMaxCreatedAt: string | null;
    targetMaxCreatedAt: string | null;
    sourceMaxUpdatedAt: string | null;
    targetMaxUpdatedAt: string | null;
  }> = [];
  for (const model of ['UserAccount', 'UserSession', 'CustomerUser', 'Role', 'Permission'] as const) {
    try {
      const srcRows = await source.$queryRawUnsafe<
        Array<{ max_c: Date | null; max_u: Date | null }>
      >(
        `SELECT MAX("createdAt") AS max_c, MAX("updatedAt") AS max_u FROM "${model}"`
      );
      const tgtRows = await target.$queryRawUnsafe<
        Array<{ max_c: Date | null; max_u: Date | null }>
      >(
        `SELECT MAX("createdAt") AS max_c, MAX("updatedAt") AS max_u FROM "${model}"`
      );
      authTimestamps.push({
        model,
        sourceMaxCreatedAt: srcRows[0]?.max_c?.toISOString?.() ?? null,
        targetMaxCreatedAt: tgtRows[0]?.max_c?.toISOString?.() ?? null,
        sourceMaxUpdatedAt: srcRows[0]?.max_u?.toISOString?.() ?? null,
        targetMaxUpdatedAt: tgtRows[0]?.max_u?.toISOString?.() ?? null,
      });
    } catch {
      authTimestamps.push({
        model,
        sourceMaxCreatedAt: null,
        targetMaxCreatedAt: null,
        sourceMaxUpdatedAt: null,
        targetMaxUpdatedAt: null,
      });
    }
  }

  await source.$disconnect();
  await target.$disconnect();

  const failTables = tableRows.filter((t) => t.status === 'FAIL');
  const warnTables = tableRows.filter((t) => t.status === 'WARN');
  const authFails = authRows.filter((a) => a.status === 'FAIL');
  const chainFails = chainChecks.filter((c) => c.status === 'FAIL');
  const realOrphans = orphanFks.filter((o) => o.orphanCount > 0);

  const overallPass =
    failTables.length === 0 &&
    authFails.length === 0 &&
    customerCheck.status !== 'FAIL' &&
    incotermCheck.status !== 'FAIL' &&
    shippingRateCheck.status !== 'FAIL' &&
    realOrphans.length === 0 &&
    chainFails.length === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only-post-migration-reconciliation',
    connectivity: { source: sourceEp, target: targetEp },
    applyReportRef: apply
      ? {
          generatedAt: apply.generatedAt ?? null,
          path: 'logs/migrate-local-to-supabase-apply.json',
        }
      : null,
    overall: overallPass ? 'PASS' : 'FAIL',
    summary: {
      migratedTables: tableRows.length,
      tablePass: tableRows.filter((t) => t.status === 'PASS').length,
      tableFail: failTables.length,
      tableWarn: warnTables.length,
      fkConstraintsChecked: fkChecked,
      fkOrphanGroups: realOrphans.length,
      fkOrphanRows: realOrphans.reduce((a, o) => a + Math.max(0, o.orphanCount), 0),
      chainPass: chainChecks.filter((c) => c.status === 'PASS').length,
      chainFail: chainFails.length,
      authPass: authRows.filter((a) => a.status === 'PASS').length,
      authFail: authFails.length,
      authWarn: authRows.filter((a) => a.status === 'WARN').length,
    },
    customerReconciliation: customerCheck,
    incotermReconciliation: incotermCheck,
    customerShippingCostRate: shippingRateCheck,
    tables: tableRows,
    priorityTables: tableRows.filter((t) => t.priority),
    discrepancies: failTables.map((t) => ({
      model: t.model,
      sourceCount: t.sourceCount,
      targetCount: t.targetCount,
      expectedTargetCount: t.expectedTargetCount,
      difference: t.difference,
      notes: t.notes,
    })),
    foreignKeyOrphans: realOrphans,
    foreignKeyScanErrors: orphanFks.filter((o) => o.orphanCount < 0),
    transactionIntegrityChains: chainChecks,
    authIsolation: { tables: authRows, timestamps: authTimestamps },
    investigationItems: [] as string[],
  };

  if (failTables.length) {
    report.investigationItems.push(
      `${failTables.length} migrated table(s) differ from expected target count: ${failTables.map((t) => t.model).join(', ')}`
    );
  }
  if (realOrphans.length) {
    report.investigationItems.push(
      `${realOrphans.length} FK orphan group(s) on target; see foreignKeyOrphans`
    );
  }
  if (chainFails.length) {
    report.investigationItems.push(
      `Transaction chain failures: ${chainFails.map((c) => c.name).join('; ')}`
    );
  }
  if (authFails.length) {
    report.investigationItems.push(
      `Auth isolation failures: ${authFails.map((a) => a.model).join(', ')}`
    );
  }
  if (customerCheck.status === 'FAIL') {
    report.investigationItems.push(...customerCheck.issues);
  }
  if (incotermCheck.status === 'FAIL') {
    report.investigationItems.push(...incotermCheck.issues);
  }
  if (shippingRateCheck.status === 'FAIL') {
    report.investigationItems.push(...shippingRateCheck.issues);
  }
  // Known post-apply data-quality notes from pre-migration recon
  report.investigationItems.push(
    'Known data-quality (not necessarily FAIL): ContainerTypeVersion may have dual isCurrent for 40HQ/40STD/40OT; AlgorithmConfiguration acfg-lff-v1 may remain DRAFT on target.'
  );

  const logsDir = path.join(process.cwd(), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const jsonPath = path.join(logsDir, 'post-migration-reconciliation.json');
  const mdPath = path.join(logsDir, 'post-migration-reconciliation.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md: string[] = [];
  md.push('# Post-Migration Reconciliation Report');
  md.push('');
  md.push(`- Generated: ${report.generatedAt}`);
  md.push(`- Mode: **READ-ONLY** (no writes, no --apply)`);
  md.push(
    `- Source: \`${sourceEp.host}:${sourceEp.port}\` db=\`${sourceEp.dbname}\` user=\`${sourceEp.username}\``
  );
  md.push(
    `- Target: \`${targetEp.host}:${targetEp.port}\` db=\`${targetEp.dbname}\` user=\`${targetEp.username}\``
  );
  md.push(`- Apply baseline: \`${report.applyReportRef?.path ?? 'n/a'}\` (${report.applyReportRef?.generatedAt ?? 'n/a'})`);
  md.push('');
  md.push(`## Overall: **${report.overall}**`);
  md.push('');
  md.push('| Metric | Value |');
  md.push('|---|---:|');
  md.push(`| Migrated tables | ${report.summary.migratedTables} |`);
  md.push(`| Table PASS | ${report.summary.tablePass} |`);
  md.push(`| Table FAIL | ${report.summary.tableFail} |`);
  md.push(`| Table WARN | ${report.summary.tableWarn} |`);
  md.push(`| FK constraints checked | ${report.summary.fkConstraintsChecked} |`);
  md.push(`| FK orphan groups | ${report.summary.fkOrphanGroups} |`);
  md.push(`| FK orphan rows | ${report.summary.fkOrphanRows} |`);
  md.push(`| Chain PASS / FAIL | ${report.summary.chainPass} / ${report.summary.chainFail} |`);
  md.push(`| Auth PASS / WARN / FAIL | ${report.summary.authPass} / ${report.summary.authWarn} / ${report.summary.authFail} |`);
  md.push('');

  md.push('## Customer reconciliation');
  md.push('');
  md.push(`- Status: **${customerCheck.status}**`);
  md.push(`- Counts: source=${customerCheck.sourceCount} target=${customerCheck.targetCount} expected=${customerCheck.expectedTargetCount}`);
  md.push(
    `- C-ELAND: sourceId=\`${customerCheck.cEland.sourceId}\` → targetId=\`${customerCheck.cEland.targetId}\` (remapApplied=${customerCheck.cEland.remapApplied})`
  );
  md.push(`- Source duplicate codes: ${customerCheck.sourceDuplicateCodes.length}`);
  md.push(`- Target duplicate codes: ${customerCheck.targetDuplicateCodes.length}`);
  md.push(
    `- Sample codes present on target: ${customerCheck.sampleAdditionalCodes.filter((s) => s.present).length}/${customerCheck.sampleAdditionalCodes.length}`
  );
  if (customerCheck.issues.length) {
    for (const i of customerCheck.issues) md.push(`- Issue: ${i}`);
  }
  md.push('');

  md.push('## Incoterm reconciliation');
  md.push('');
  md.push(`- Status: **${incotermCheck.status}**`);
  md.push(`- Counts: source=${incotermCheck.sourceCount} target=${incotermCheck.targetCount} (expect 11)`);
  md.push(`- DAP/CIF use target IDs: ${incotermCheck.dapCifUseTargetIds}`);
  md.push(`- Orphan Incoterm refs: ${incotermCheck.orphanIncotermRefs.length}`);
  for (const row of incotermCheck.byCode.filter((r) => ['DAP', 'CIF'].includes(r.code))) {
    md.push(
      `- ${row.code}: source=\`${row.sourceId}\` target=\`${row.targetId}\` expected=\`${row.expectedTargetId}\``
    );
  }
  md.push('');

  md.push('## CustomerShippingCostRate');
  md.push('');
  md.push(`- Status: **${shippingRateCheck.status}**`);
  md.push(`- Target count: ${shippingRateCheck.targetCount} (expected ${shippingRateCheck.expectedCount})`);
  md.push(`- Orphan customerIds: ${shippingRateCheck.orphanCustomerIds}`);
  md.push(`- Orphan incotermIds: ${shippingRateCheck.orphanIncotermIds}`);
  md.push('');

  md.push('## Priority table summary');
  md.push('');
  md.push('| Table | Source | Target | Expected | Diff | Status |');
  md.push('|---|---:|---:|---:|---:|---|');
  for (const t of report.priorityTables) {
    md.push(
      `| ${t.model} | ${t.sourceCount ?? 'n/a'} | ${t.targetCount ?? 'n/a'} | ${t.expectedTargetCount ?? 'n/a'} | ${t.difference ?? 'n/a'} | ${t.status} |`
    );
  }
  md.push('');

  md.push('## Full table summary');
  md.push('');
  md.push('| Table | Source | Target | Expected | Diff | Status |');
  md.push('|---|---:|---:|---:|---:|---|');
  for (const t of tableRows) {
    md.push(
      `| ${t.model} | ${t.sourceCount ?? 'n/a'} | ${t.targetCount ?? 'n/a'} | ${t.expectedTargetCount ?? 'n/a'} | ${t.difference ?? 'n/a'} | ${t.status} |`
    );
  }
  md.push('');

  md.push('## Discrepancies');
  md.push('');
  if (!report.discrepancies.length) {
    md.push('_None_');
  } else {
    for (const d of report.discrepancies) {
      md.push(
        `- **${d.model}**: source=${d.sourceCount} target=${d.targetCount} expected=${d.expectedTargetCount} diff=${d.difference} (${d.notes.join('; ')})`
      );
    }
  }
  md.push('');

  md.push('## FK orphan summary');
  md.push('');
  if (!realOrphans.length) {
    md.push('_No orphan FKs detected among in-scope business-table constraints._');
  } else {
    md.push('| Child | Column | Parent | Orphans | Sample |');
    md.push('|---|---|---|---:|---|');
    for (const o of realOrphans) {
      md.push(
        `| ${o.childTable} | ${o.childColumn} | ${o.parentTable}.${o.parentColumn} | ${o.orphanCount} | ${o.sampleValues.slice(0, 3).join(', ')} |`
      );
    }
  }
  md.push('');

  md.push('## Transaction integrity chains');
  md.push('');
  md.push('| Chain | Status | Details |');
  md.push('|---|---|---|');
  for (const c of chainChecks) {
    md.push(`| ${c.name} | ${c.status} | ${JSON.stringify(c.details)} |`);
  }
  md.push('');

  md.push('## Auth isolation');
  md.push('');
  md.push('| Table | Source | Target | Pre-apply target | Status | Notes |');
  md.push('|---|---:|---:|---:|---|---|');
  for (const a of authRows) {
    md.push(
      `| ${a.model} | ${a.sourceCount ?? 'n/a'} | ${a.targetCount ?? 'n/a'} | ${a.preApplyTargetCount ?? 'n/a'} | ${a.status} | ${a.notes.join('; ')} |`
    );
  }
  md.push('');
  md.push('### Auth timestamps (independence signal)');
  md.push('');
  for (const t of authTimestamps) {
    md.push(
      `- ${t.model}: source max createdAt=${t.sourceMaxCreatedAt ?? 'n/a'} / target=${t.targetMaxCreatedAt ?? 'n/a'}`
    );
  }
  md.push('');

  md.push('## Investigation items');
  md.push('');
  for (const item of report.investigationItems) {
    md.push(`- ${item}`);
  }
  md.push('');
  md.push('---');
  md.push('Credentials and connection strings intentionally omitted from this report.');

  fs.writeFileSync(mdPath, md.join('\n'));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`OVERALL: ${report.overall}`);
  console.log(
    `tables fail=${failTables.length} orphans=${realOrphans.length} chains fail=${chainFails.length} auth fail=${authFails.length}`
  );
}

main().catch(async (e) => {
  console.error('Reconciliation failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
