import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, httpClient } from './httpClient';
import {
  DRUM_PLAN_OPTIMIZE_PATH,
  describeDrumPlanApiError,
  optimizeDrumPlanViaApi,
  type AuthoritativeDrumPlanDto,
  type OptimizeDrumPlanRequest,
} from './drumPlanApi';
import { applyAutomaticPlanToCuttingRequirements } from '../domain/drumOptimizationPresentation';

const originalFetch = globalThis.fetch;
const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(
  impl: (url: string, init?: RequestInit) => Response | Promise<Response>
): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return impl(url, init);
  }) as typeof fetch;
  return { calls };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sampleRequest: OptimizeDrumPlanRequest = {
  cable: { cableDiameterMm: 20, approxWeightKgKm: 1000 },
  totalOrderLengthM: 400,
  requestedDrumCount: 2,
  requirements: [{ totalOrderLengthM: 400, requestedDrumCount: 2 }],
  cableTolerancePercent: 1,
  drumTolerancePercent: 0,
};

const validPlan: AuthoritativeDrumPlanDto = {
  method: 'AUTOMATIC',
  selectionMethod: 'AUTOMATIC',
  cableTolerancePercent: 1,
  totalLengthM: 800,
  isValid: true,
  blockingReasons: [],
  rankingNotes: ['Requirement 1: 2 × 400 m'],
  outcome: 'RECOMMENDED',
  lines: [
    {
      drumId: 'drm-1',
      drumCode: 'EWD1200-T',
      numberOfDrums: 2,
      cuttingLengthM: 400,
      nominalCuttingLengthM: 400,
      cableTolerancePercent: 1,
      drumTolerancePercent: 0,
      minimumAllowedLengthM: 396,
      maximumAllowedLengthM: 404,
      maximumUsableLengthM: 500,
      lengthUtilizationPercent: 80,
      loadUtilizationPercent: 40,
      cableWeightKg: 400,
      emptyDrumNetWeightKg: 140,
      grossLoadedDrumWeightKg: 540,
      validationStatus: 'VALID',
      validationReasons: [],
    },
  ],
};

describe('drumPlanApi client', () => {
  it('1. successful optimization request POSTs the existing optimize route', async () => {
    const { calls } = mockFetch((url, init) => {
      assert.equal(url, DRUM_PLAN_OPTIMIZE_PATH);
      assert.equal(url, '/api/master/drums/optimize');
      assert.equal(init?.method, 'POST');
      return jsonResponse({ plan: validPlan });
    });

    await optimizeDrumPlanViaApi(sampleRequest, { token: 'tok-opt' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/master/drums/optimize');
    assert.equal(calls[0].init?.body, JSON.stringify(sampleRequest));
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer tok-opt');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(httpClient.post.name, 'post');
  });

  it('2. validation failure (400) is preserved', async () => {
    mockFetch(() => jsonResponse({ error: 'Total order length must be greater than zero.', code: 'VALIDATION_FAILED' }, 400));

    await assert.rejects(
      () => optimizeDrumPlanViaApi(sampleRequest, { token: 'tok' }),
      (err: unknown) => {
        const described = describeDrumPlanApiError(err);
        assert.equal(described.status, 400);
        assert.equal(described.message, 'Total order length must be greater than zero.');
        assert.equal(described.code, 'VALIDATION_FAILED');
        return true;
      }
    );
  });

  it('3. authorization failure (401 / 403) is preserved', async () => {
    mockFetch(() => jsonResponse({ error: 'Sign in is required for drum optimization.', code: 'UNAUTHORIZED' }, 401));
    await assert.rejects(
      () => optimizeDrumPlanViaApi(sampleRequest, { token: null }),
      (err: unknown) => {
        const described = describeDrumPlanApiError(err);
        assert.equal(described.status, 401);
        assert.equal(described.code, 'UNAUTHORIZED');
        return true;
      }
    );

    mockFetch(() => jsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403));
    await assert.rejects(
      () => optimizeDrumPlanViaApi(sampleRequest, { token: 'tok' }),
      (err: unknown) => {
        const described = describeDrumPlanApiError(err);
        assert.equal(described.status, 403);
        assert.equal(described.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('4. backend error (500) is preserved', async () => {
    mockFetch(() => jsonResponse({ error: 'A Drum Master request failed.', code: 'INTERNAL' }, 500));

    await assert.rejects(
      () => optimizeDrumPlanViaApi(sampleRequest, { token: 'tok' }),
      (err: unknown) => {
        const described = describeDrumPlanApiError(err);
        assert.equal(described.status, 500);
        assert.equal(described.message, 'A Drum Master request failed.');
        assert.equal(described.code, 'INTERNAL');
        return true;
      }
    );
    assert.ok(HttpError);
  });

  it('5. response mapping returns the backend Drum Plan unchanged', async () => {
    mockFetch(() => jsonResponse({ plan: validPlan }));

    const payload = await optimizeDrumPlanViaApi(sampleRequest, { token: 'tok' });
    assert.equal(payload.plan.selectionMethod, 'AUTOMATIC');
    assert.equal(payload.plan.isValid, true);
    assert.equal(payload.plan.lines[0].drumCode, 'EWD1200-T');
    assert.equal(payload.plan.lines[0].numberOfDrums, 2);
    assert.equal(payload.plan.lines[0].cuttingLengthM, 400);
    assert.equal(payload.plan.lines[0].lengthUtilizationPercent, 80);
    assert.equal(payload.plan.totalLengthM, 800);

    const applied = applyAutomaticPlanToCuttingRequirements(
      [
        {
          id: 'r1',
          drumCode: '',
          noOfDrums: 2,
          cuttingLengthM: 400,
          drumTolerancePercent: '0',
        },
      ],
      payload.plan
    );
    assert.equal(applied[0].drumCode, 'EWD1200-T');
    assert.equal(applied[0].noOfDrums, 2);
    assert.equal(applied[0].cuttingLengthM, 400);
  });
});

const VALUE_IMPORT_RE = /(?:import|export)\s+(?!type\s)(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g;

function collectValueImports(source: string): string[] {
  const specs: string[] = [];
  VALUE_IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VALUE_IMPORT_RE.exec(source))) {
    specs.push(match[1]);
  }
  return specs;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@prisma/') || spec === '@prisma/client') return null;
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const base = join(dirname(fromFile), spec);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    base,
  ];
  for (const candidate of candidates) {
    if (isFile(candidate)) return normalize(candidate);
  }
  return null;
}

function walkFrontendGraph(entryRel: string): string[] {
  const entry = normalize(join(srcRoot, entryRel));
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    if (!isFile(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const spec of collectValueImports(source)) {
      const resolved = resolveImport(file, spec);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

describe('frontend graph does not import Drum Optimization engine', () => {
  const roots = [
    'components/common/DrumSelectionWorkflowPanel.tsx',
    'components/common/DrumMasterReferencePanel.tsx',
    'components/inquiry-quotation/InquiryDrumPlanWorkflow.tsx',
    'components/common/CableSearchSelectModal.tsx',
    'services/drumSelectionService.ts',
    'api/drumPlanApi.ts',
    'domain/drumOptimizationPresentation.ts',
  ];

  it('static assert: FE callers do not reach optimizeDrumPlanForSchedule or drumOptimizationService', () => {
    const graph = new Set<string>();
    for (const root of roots) {
      for (const file of walkFrontendGraph(root)) graph.add(file);
    }

    const engineFile = normalize(join(srcRoot, 'domain/drumOptimizationService.ts'));
    assert.equal(graph.has(engineFile), false, 'domain/drumOptimizationService reached from FE graph');

    for (const file of graph) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(
        source,
        /import\s+(?!type\s)[^;]*optimizeDrumPlanForSchedule/,
        `${file} value-imports optimizeDrumPlanForSchedule`
      );
      assert.doesNotMatch(
        source,
        /import\s+(?!type\s)[^;]*optimizeDrumPlan[^A-Za-z]/,
        `${file} value-imports optimizeDrumPlan`
      );
      assert.doesNotMatch(
        source,
        /from ['"][^'"]*domain\/drumOptimizationService['"]/,
        `${file} imports src/domain/drumOptimizationService`
      );
    }
  });

  it('API client source contains no Drum Optimization engine, Prisma, or domain import', () => {
    const client = readFileSync(join(srcRoot, 'api/drumPlanApi.ts'), 'utf8');
    assert.match(client, /\/api\/master\/drums\/optimize/);
    assert.doesNotMatch(client, /optimizeDrumPlanForSchedule/);
    assert.doesNotMatch(client, /domain\/drumOptimizationService/);
    assert.doesNotMatch(client, /@prisma\/client/);
    assert.doesNotMatch(client, /from ['"].*server\//);
    assert.doesNotMatch(client, /rankScoreForSuitableDrum/);
    assert.doesNotMatch(client, /calculateDrumCapacity/);
  });
});
