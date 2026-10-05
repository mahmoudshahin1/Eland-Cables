/** Production-readiness sign-off rules. Does not change costingEngine or Option B. */

export const PRODUCTION_READY = 'PRODUCTION_READY' as const;
export const NOT_PRODUCTION_READY = 'NOT_PRODUCTION_READY' as const;

export type ProductionOverallStatus = typeof PRODUCTION_READY | typeof NOT_PRODUCTION_READY;

export type ProductionCheckStatus = 'PASS' | 'FAIL' | 'NOT_VERIFIED' | 'UNSIGNED';

export type ProductionReadinessSummaryKpis = {
  total: number;
  ready: number;
  blocked: number;
  warning: number;
  notChecked: number;
  gate1Failures: number;
  gate2Failures: number;
  gate3Failures: number;
  gate4Failures: number;
  topBlockers: Array<{ reason: string; count: number }>;
};

export type ProductionGoldenCable = {
  materialNumber: string;
  governanceStatus: string;
  engineStatus: string;
  gate4Blocked?: boolean;
  missing?: string[];
};

export type Decision5State = {
  signed: boolean;
  status: 'SIGNED' | 'UNSIGNED' | 'PENDING';
  option: 'B';
  optionLabel: string;
  signedAt?: string | null;
  signedBy?: string | null;
  source?: string;
};

export type ProductionCiVerification = {
  tests: ProductionCheckStatus;
  typescript: ProductionCheckStatus;
};

export type ProductionChecklistItem = {
  id: string;
  label: string;
  status: ProductionCheckStatus;
  mandatory: boolean;
  detail?: string;
};

export type ProductionAreaStatus = {
  id: string;
  label: string;
  status: ProductionCheckStatus;
  detail?: string;
};

export type ProductionReadinessComputeInput = {
  summary: ProductionReadinessSummaryKpis;
  golden: ProductionGoldenCable[];
  fxActiveCount: number;
  scrapActiveCount: number;
  decision5: Decision5State;
  ci?: ProductionCiVerification;
};

export type ProductionReadinessComputed = {
  overallStatus: ProductionOverallStatus;
  productionReady: boolean;
  blockers: string[];
  checklist: ProductionChecklistItem[];
  areas: ProductionAreaStatus[];
  masterData: {
    total: number;
    ready: number;
    blocked: number;
    warning: number;
    notChecked: number;
    gate1Failures: number;
    gate2Failures: number;
    gate3Failures: number;
    gate4Failures: number;
  };
};

export const DECISION5_OPTION_B_LABEL = 'OPTION B — LME / BASE METAL ONLY';

export function unsignedDecision5(): Decision5State {
  return {
    signed: false,
    status: 'UNSIGNED',
    option: 'B',
    optionLabel: DECISION5_OPTION_B_LABEL,
    source: 'none',
  };
}

function statusPass(ok: boolean): ProductionCheckStatus {
  return ok ? 'PASS' : 'FAIL';
}

export function computeProductionReadiness(input: ProductionReadinessComputeInput): ProductionReadinessComputed {
  const s = input.summary;
  const golden = input.golden || [];
  const ci: ProductionCiVerification = {
    tests: input.ci?.tests ?? 'NOT_VERIFIED',
    typescript: input.ci?.typescript ?? 'NOT_VERIFIED',
  };

  const masterDataPass = s.total > 0 && s.ready === s.total;
  const fxPass = input.fxActiveCount > 0;
  const scrapPass = input.scrapActiveCount > 0;
  const engineeringPass = s.total > 0 && s.gate1Failures === 0;
  const bomPass = s.total > 0 && s.gate2Failures === 0;
  const rmPass = s.total > 0 && s.gate3Failures === 0;
  const rmPricesPass = s.total > 0 && s.gate4Failures === 0;
  const goldenPass =
    golden.length > 0 && golden.every((c) => c.governanceStatus === 'READY_FOR_COSTING');
  const engineRegressionPass = golden.length > 0 && golden.every((c) => c.engineStatus === 'READY');
  const decisionPass = input.decision5.signed === true && input.decision5.status === 'SIGNED';
  const testsPass = ci.tests === 'PASS';
  const tscPass = ci.typescript === 'PASS';

  const notReadyCables = Math.max(0, s.total - s.ready);
  const goldenNotReady = golden.filter((c) => c.governanceStatus !== 'READY_FOR_COSTING');

  const areas: ProductionAreaStatus[] = [
    {
      id: 'engineering',
      label: 'Engineering mapping',
      status: statusPass(engineeringPass),
      detail: engineeringPass ? 'No Gate 1 failures.' : `${s.gate1Failures} cables fail Gate 1.`,
    },
    {
      id: 'bom',
      label: 'Governed BOM',
      status: statusPass(bomPass),
      detail: bomPass ? 'No Gate 2 failures.' : `${s.gate2Failures} cables fail Gate 2.`,
    },
    {
      id: 'raw_materials',
      label: 'Raw materials',
      status: statusPass(rmPass),
      detail: rmPass ? 'No Gate 3 failures.' : `${s.gate3Failures} cables fail Gate 3.`,
    },
    {
      id: 'rm_prices',
      label: 'Raw material prices',
      status: statusPass(rmPricesPass),
      detail: rmPricesPass ? 'No Gate 4 failures.' : `${s.gate4Failures} cables have unresolved RM pricing.`,
    },
    {
      id: 'fx',
      label: 'Exchange rates (FX)',
      status: statusPass(fxPass),
      detail: fxPass ? `${input.fxActiveCount} active exchange rate(s).` : 'No active exchange rates.',
    },
    {
      id: 'scrap',
      label: 'Scrap rules',
      status: statusPass(scrapPass),
      detail: scrapPass ? `${input.scrapActiveCount} active scrap rule(s).` : 'No active scrap rules.',
    },
    {
      id: 'golden',
      label: 'Golden regression cables',
      status: statusPass(goldenPass),
      detail: goldenPass
        ? `All ${golden.length} probe cables are READY_FOR_COSTING.`
        : golden.length === 0
          ? 'Golden probe set is empty.'
          : `${goldenNotReady.length} of ${golden.length} golden cables are not READY_FOR_COSTING.`,
    },
    {
      id: 'decision5',
      label: 'Decision 5 (metal in Direct RM)',
      status: decisionPass ? 'PASS' : 'UNSIGNED',
      detail: decisionPass
        ? `Signed. Engine remains ${DECISION5_OPTION_B_LABEL} until a separate Option A programme.`
        : `Business Decision 5: Pending. Current application: ${DECISION5_OPTION_B_LABEL}. Status UNSIGNED.`,
    },
  ];

  const checklist: ProductionChecklistItem[] = [
    {
      id: 'fx_required',
      label: 'Required FX exists',
      status: statusPass(fxPass),
      mandatory: true,
      detail: areas.find((a) => a.id === 'fx')?.detail,
    },
    {
      id: 'master_data',
      label: 'Master-data readiness (all platform cables READY_FOR_COSTING)',
      status: statusPass(masterDataPass),
      mandatory: true,
      detail: masterDataPass
        ? `${s.ready}/${s.total} cables READY_FOR_COSTING.`
        : `${s.ready} of ${s.total} cables READY_FOR_COSTING — required master-data readiness is not satisfied.`,
    },
    {
      id: 'golden_regression',
      label: 'Golden regression (live governance statuses)',
      status: statusPass(goldenPass),
      mandatory: true,
      detail: areas.find((a) => a.id === 'golden')?.detail,
    },
    {
      id: 'decision5',
      label: 'Decision 5 signed',
      status: decisionPass ? 'PASS' : 'UNSIGNED',
      mandatory: true,
      detail: areas.find((a) => a.id === 'decision5')?.detail,
    },
    {
      id: 'engine_regression',
      label: 'Costing engine probe (golden cables)',
      status: statusPass(engineRegressionPass),
      mandatory: false,
      detail: engineRegressionPass
        ? 'Live engine probe READY for all golden cables.'
        : 'Engine probe is READY only when inquiry header metals are supplied. Live probe without metals is not treated as a stored UAT PASS.',
    },
    {
      id: 'automated_tests',
      label: 'Automated tests',
      status: testsPass ? 'PASS' : ci.tests === 'FAIL' ? 'FAIL' : 'NOT_VERIFIED',
      mandatory: true,
      detail: testsPass
        ? 'Stored CI artifact reports PASS.'
        : 'Not measured from this database. No stored CI artifact — NOT VERIFIED (cannot assume PASS).',
    },
    {
      id: 'typescript',
      label: 'TypeScript (tsc --noEmit)',
      status: tscPass ? 'PASS' : ci.typescript === 'FAIL' ? 'FAIL' : 'NOT_VERIFIED',
      mandatory: true,
      detail: tscPass
        ? 'Stored CI artifact reports PASS.'
        : 'Not measured from this database. No stored CI artifact — NOT VERIFIED (cannot assume PASS).',
    },
  ];

  const blockers: string[] = [];
  if (notReadyCables > 0) {
    blockers.push(
      `${notReadyCables} of ${s.total} cables are not READY_FOR_COSTING (${s.ready} ready, ${s.blocked} blocked, ${s.warning} warning).`
    );
  }
  if (s.gate4Failures > 0) {
    blockers.push(`${s.gate4Failures} cables have unresolved RM pricing.`);
  }
  if (s.gate1Failures > 0) {
    blockers.push(`${s.gate1Failures} cables fail engineering mapping (Gate 1).`);
  }
  if (s.gate2Failures > 0) {
    blockers.push(`${s.gate2Failures} cables have unresolved BOM (Gate 2).`);
  }
  if (s.gate3Failures > 0) {
    blockers.push(`${s.gate3Failures} cables have unresolved raw materials (Gate 3).`);
  }
  if (!fxPass) blockers.push('Required FX is missing (no active exchange rates).');
  if (!scrapPass) blockers.push('No active scrap rules.');
  if (!goldenPass) {
    blockers.push(
      golden.length === 0
        ? 'Golden regression set is empty.'
        : `${goldenNotReady.map((c) => c.materialNumber).join(', ') || golden.length} golden cable(s) are not READY_FOR_COSTING.`
    );
  }
  if (!decisionPass) {
    blockers.push(`Decision 5 is UNSIGNED (${DECISION5_OPTION_B_LABEL}).`);
  }
  if (!testsPass) {
    blockers.push('Automated tests are NOT VERIFIED (no stored CI artifact).');
  }
  if (!tscPass) {
    blockers.push('TypeScript is NOT VERIFIED (no stored CI artifact).');
  }

  const mandatoryUnsatisfied = checklist.filter((item) => item.mandatory && item.status !== 'PASS');
  const productionReady = mandatoryUnsatisfied.length === 0;
  const overallStatus: ProductionOverallStatus = productionReady ? PRODUCTION_READY : NOT_PRODUCTION_READY;

  if (productionReady && blockers.length === 0) {
    // keep blockers empty on true ready
  } else if (productionReady) {
    blockers.length = 0;
  }

  return {
    overallStatus,
    productionReady,
    blockers,
    checklist,
    areas,
    masterData: {
      total: s.total,
      ready: s.ready,
      blocked: s.blocked,
      warning: s.warning,
      notChecked: s.notChecked,
      gate1Failures: s.gate1Failures,
      gate2Failures: s.gate2Failures,
      gate3Failures: s.gate3Failures,
      gate4Failures: s.gate4Failures,
    },
  };
}
