import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, httpClient } from './httpClient';
import {
  CABLE_AUTHORITY_EVALUATE_PATH,
  describeCableEvaluateError,
  evaluateCableViaApi,
  type CableAuthorityDecisionDto,
  type EvaluateCableAuthorityRequest,
} from './cableAuthorityApi';
import { presentCableAuthorityDecision } from '../components/cable-configurator/v2/services/technicalValidationPresentationV2';
import type { SelectionStateV2 } from '../components/cable-configurator/v2/types';

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

const sampleConfig: EvaluateCableAuthorityRequest = {
  config: {
    family: 'UGC',
    voltage: '6/10 kV (6.35/11 kV)',
    conductor: 'CU',
    conductorSize: '120 mm²',
    cores: 1,
    insulation: 'XLPE',
    screen: 'Copper Wire',
    armour: 'No Armour',
    sheath: 'MDPE',
  },
};

const baseSelections: SelectionStateV2 = {
  selectionMode: 'TECHNICAL',
  family: 'UGC',
  voltageClass: 'MV',
  voltage: '6/10 kV (6.35/11 kV)',
  conductorMaterial: 'CU',
  conductorClass: 'Class 2 — Stranded',
  conductorSize: '120 mm²',
  cores: '1 Core',
  coresCount: 1,
  coreColors: { 1: 'Black' },
  insulation: 'XLPE',
  outerSemiConductor: 'Strippable',
  screenType: 'Copper Wire',
  screenCSA: '16 mm²',
  armour: 'No Armour',
  sheathing: 'MDPE',
  sheathingColor: 'Black',
  specialAdditives: ['UV Resistant'],
  cpr: 'No',
};

const validDecision: CableAuthorityDecisionDto = {
  code: 'TECHNICALLY_VALID_NOT_MASTER',
  message: 'Configuration is technically valid but not in Cable Master.',
  technicalOfficeEligible: true,
  quotationAllowed: false,
  matches: [],
  failedRules: [],
  matchAttributesUsed: ['family', 'voltage'],
};

const validationDecision: CableAuthorityDecisionDto = {
  code: 'CONFIGURATION_REQUIRED',
  message: 'Additional configuration is required.',
  technicalOfficeEligible: false,
  quotationAllowed: false,
  matches: [],
  failedRules: [{ field: 'family', message: 'Cable Family is required.' }],
  matchAttributesUsed: [],
};

describe('cableAuthorityApi client', () => {
  it('A: POST /api/cables/evaluate sends the existing request body', async () => {
    const { calls } = mockFetch((url, init) => {
      assert.equal(url, CABLE_AUTHORITY_EVALUATE_PATH);
      assert.equal(url, '/api/cables/evaluate');
      assert.equal(init?.method, 'POST');
      return jsonResponse({ decision: validDecision, evaluationMode: 'AUTHENTICATED' });
    });

    await evaluateCableViaApi(sampleConfig, { token: 'tok-eval' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/cables/evaluate');
    assert.equal(calls[0].init?.body, JSON.stringify(sampleConfig));
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer tok-eval');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(httpClient.post.name, 'post');
  });

  it('B: successful response returns backend decision unchanged', async () => {
    mockFetch(() =>
      jsonResponse({
        decision: validDecision,
        evaluationMode: 'CUSTOMER_SCOPED',
        customerScopeApplied: 'N2XS2Y',
      })
    );

    const payload = await evaluateCableViaApi(sampleConfig, { token: 'tok' });
    assert.equal(payload.decision.code, 'TECHNICALLY_VALID_NOT_MASTER');
    assert.equal(payload.decision.message, validDecision.message);
    assert.equal(payload.evaluationMode, 'CUSTOMER_SCOPED');
    assert.equal(payload.customerScopeApplied, 'N2XS2Y');

    const presented = presentCableAuthorityDecision(baseSelections, payload.decision);
    assert.equal(presented.status, 'VALID_NEW_CABLE');
    assert.equal(presented.isValid, true);
  });

  it('C: validation response preserves failedRules and CONFIGURATION_REQUIRED', async () => {
    mockFetch(() => jsonResponse({ decision: validationDecision, evaluationMode: 'PUBLIC' }));

    const payload = await evaluateCableViaApi(sampleConfig, { token: 'tok' });
    assert.equal(payload.decision.code, 'CONFIGURATION_REQUIRED');
    assert.equal(payload.decision.failedRules[0].message, 'Cable Family is required.');

    const presented = presentCableAuthorityDecision(baseSelections, payload.decision);
    assert.equal(presented.status, 'CONFIGURATION_REQUIRED');
    assert.equal(presented.isValid, false);
    assert.equal(presented.errors[0].message, 'Cable Family is required.');
  });

  it('C: HTTP 400 validation error is preserved', async () => {
    mockFetch(() => jsonResponse({ error: 'Invalid cable configuration', code: 'VALIDATION_FAILED' }, 400));

    await assert.rejects(
      () => evaluateCableViaApi(sampleConfig, { token: 'tok' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.error, 'Invalid cable configuration');
        assert.equal(err.code, 'VALIDATION_FAILED');
        const described = describeCableEvaluateError(err);
        assert.equal(described.status, 400);
        assert.equal(described.message, 'Invalid cable configuration');
        return true;
      }
    );
  });

  it('preserves 401 / 403 / 409 / 500', async () => {
    const cases: Array<{ status: number; error: string; code: string }> = [
      { status: 401, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 403, error: 'Forbidden', code: 'FORBIDDEN' },
      { status: 409, error: 'Version conflict', code: 'CONFLICT' },
      { status: 500, error: 'A Cable Master request failed.', code: 'VALIDATION_FAILED' },
    ];
    for (const c of cases) {
      mockFetch(() => jsonResponse({ error: c.error, code: c.code }, c.status));
      await assert.rejects(
        () => evaluateCableViaApi(sampleConfig, { token: 'tok' }),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, c.status);
          assert.equal(err.error, c.error);
          assert.equal(err.code, c.code);
          return true;
        }
      );
    }
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

describe('D: frontend graph does not import Cable Authority engine', () => {
  const roots = [
    'components/cable-configurator/v2/components/CableConfiguratorV2.tsx',
    'components/cable-configurator/v2/services/technicalValidationPresentationV2.ts',
    'components/cable-configurator/v2/services/v2CableConfigurationService.ts',
    'components/cable-configurator/v2/services/technicalOfficeServiceV2.ts',
    'api/cableAuthorityApi.ts',
  ];

  it('static assert: FE callers do not import evaluateCableAuthority or domain/cableAuthority', () => {
    const graph = new Set<string>();
    for (const root of roots) {
      for (const file of walkFrontendGraph(root)) graph.add(file);
    }

    const engineFile = normalize(join(srcRoot, 'domain/cableAuthority.ts'));
    const evaluateWrapper = normalize(
      join(srcRoot, 'components/cable-configurator/v2/services/technicalValidationEngineV2.ts')
    );

    assert.equal(graph.has(engineFile), false, 'domain/cableAuthority reached from FE graph');
    assert.equal(graph.has(evaluateWrapper), false, 'technicalValidationEngineV2 reached from FE graph');

    for (const file of graph) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(
        source,
        /import\s+(?!type\s)[^;]*evaluateCableAuthority/,
        `${file} value-imports evaluateCableAuthority`
      );
      assert.doesNotMatch(
        source,
        /from ['"][^'"]*domain\/cableAuthority['"]/,
        `${file} imports src/domain/cableAuthority`
      );
    }
  });

  it('API client source contains no Cable Authority engine, Prisma, or domain import', () => {
    const client = readFileSync(join(srcRoot, 'api/cableAuthorityApi.ts'), 'utf8');
    assert.match(client, /\/api\/cables\/evaluate/);
    assert.doesNotMatch(client, /evaluateCableAuthority/);
    assert.doesNotMatch(client, /domain\/cableAuthority/);
    assert.doesNotMatch(client, /@prisma\/client/);
    assert.doesNotMatch(client, /from ['"].*server\//);
  });
});
