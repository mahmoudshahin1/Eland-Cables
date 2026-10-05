import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { httpClient } from '../api/httpClient';
import {
  CommercialInquiryDto,
  addCommercialInquiryLine,
  createCommercialInquiry,
  deleteCommercialInquiryLine,
  fetchCommercialInquiries,
  fetchCommercialInquiry,
  fetchCommercialQuotations,
  submitCommercialInquiry,
  updateCommercialInquiry,
  updateCommercialInquiryLine,
  formatInquiryLineValue,
  inquiryEstimatedValue,
  inquiryLinePreview,
  inquirySummary,
  resolveInquiryLineCurrency,
  resolveInquiryLineDrumsQuantity,
  resolveInquiryLineTotalLengthMeters,
} from './commercialInquiryApiService';
import { INQUIRY_LINE_COLUMNS, INQUIRY_LIST_COLUMNS, visibleFieldsForUser } from './inquiryFieldManifest';

function inquiry(lines: CommercialInquiryDto['lines']): CommercialInquiryDto {
  return {
    id: 'inq-1',
    inquiryNumber: 'INQ-1',
    customerId: 'cust-1',
    customerName: 'ELAND Cables',
    inquiryDate: '2026-08-22',
    currency: 'USD',
    status: 'DRAFT',
    lines,
  };
}

describe('commercial inquiry line length calculations', () => {
  it('uses drums times cutting length when cutting length is present', () => {
    assert.equal(
      resolveInquiryLineTotalLengthMeters({
        requestedQuantity: 3,
        requestedLengthMeters: 1000,
        cuttingLengthMeters: 500,
      }),
      1500
    );
  });

  it('shows 2 drums × 1500 m cutting length as 3000 m total on the inquiry line', () => {
    assert.equal(
      resolveInquiryLineTotalLengthMeters({
        requestedQuantity: 2,
        requestedLengthMeters: 1500,
        cuttingLengthMeters: 1500,
      }),
      3000
    );
  });

  it('does not keep a 1500 m total when the line shows 2 drums and 1500 m cutting length', () => {
    assert.equal(
      resolveInquiryLineTotalLengthMeters({
        requestedQuantity: 2,
        requestedLengthMeters: 1500,
        cuttingLengthMeters: 1500,
        drumSchedule: {
          cableTolerancePercent: 1,
          rows: [{ drumCode: 'EWD1200', noOfDrums: 1, cuttingLengthM: 1500, drumTolerancePercent: 0 }],
        },
      }),
      3000
    );
  });

  it('falls back to persisted requested length when cutting length is absent', () => {
    assert.equal(
      resolveInquiryLineTotalLengthMeters({
        requestedQuantity: 3,
        requestedLengthMeters: 1000,
        cuttingLengthMeters: null,
      }),
      1000
    );
  });

  it('aggregates total length and drum quantities authoritatively from multi-row drumSchedule', () => {
    const multiRowSchedule = {
      cableTolerancePercent: 5,
      rows: [
        { drumCode: 'DRUM-120', noOfDrums: 2, cuttingLengthM: 900, drumTolerancePercent: 2 },
        { drumCode: 'DRUM-140', noOfDrums: 2, cuttingLengthM: 2100, drumTolerancePercent: 2 },
      ],
    };

    const totalMeters = resolveInquiryLineTotalLengthMeters({
      requestedQuantity: 1,
      requestedLengthMeters: 1000,
      drumSchedule: multiRowSchedule,
    });
    const totalDrums = resolveInquiryLineDrumsQuantity({
      requestedQuantity: 1,
      drumSchedule: multiRowSchedule,
    });

    // 2 * 900 + 2 * 2100 = 1800 + 4200 = 6000m
    assert.equal(totalMeters, 6000);
    // 2 + 2 = 4 drums
    assert.equal(totalDrums, 4);
  });

  it('sums line total lengths in inquiry summary and preview', () => {
    const dto = inquiry([
      {
        id: 'line-1',
        lineNumber: 1,
        cableDescription: 'Cable A',
        requestedQuantity: 2,
        requestedLengthMeters: 1000,
        cuttingLengthMeters: 250,
      },
      {
        id: 'line-2',
        lineNumber: 2,
        cableDescription: 'Cable B',
        requestedQuantity: 1,
        requestedLengthMeters: 800,
      },
    ]);

    assert.equal(inquirySummary(dto).totalQty, 3);
    assert.equal(inquirySummary(dto).totalLength, 1300);
    assert.equal(inquiryLinePreview(dto).length, '1,300 m');
  });

  it('sums persisted line values for inquiry value and omits uncosted lines', () => {
    const dto = inquiry([
      {
        id: 'line-1',
        lineNumber: 1,
        cableDescription: 'Cable A',
        requestedQuantity: 2,
        requestedLengthMeters: 1000,
        materialCost: 1250.5,
      },
      {
        id: 'line-2',
        lineNumber: 2,
        cableDescription: 'Cable B',
        requestedQuantity: 1,
        requestedLengthMeters: 800,
        materialCost: null,
      },
      {
        id: 'line-3',
        lineNumber: 3,
        cableDescription: 'Cable C',
        requestedQuantity: 1,
        requestedLengthMeters: 200,
        materialCost: '40.25',
      },
    ]);

    assert.equal(inquiryEstimatedValue(dto), 1290.75);
    assert.equal(inquirySummary(dto).estimatedValue, 1290.75);
  });

  it('returns null value when no line has persisted materialCost', () => {
    const dto = inquiry([
      {
        id: 'line-1',
        lineNumber: 1,
        cableDescription: 'Cable A',
        requestedQuantity: 1,
        requestedLengthMeters: 100,
      },
    ]);
    assert.equal(inquiryEstimatedValue(dto), null);
  });
});

describe('commercial inquiry list columns', () => {
  it('places Value immediately before Currency and hides it from customers', () => {
    const valueCol = INQUIRY_LIST_COLUMNS.find((c) => c.id === 'estimatedValue');
    const currencyCol = INQUIRY_LIST_COLUMNS.find((c) => c.id === 'currency');
    assert.ok(valueCol);
    assert.ok(currencyCol);
    assert.equal(valueCol.label, 'Value');
    assert.equal(valueCol.customerVisible, false);
    assert.equal(valueCol.displayOrder, currencyCol.displayOrder - 1);
  });
});

describe('commercial inquiry line columns', () => {
  it('places Value immediately before Currency after drum and hides Value from customers', () => {
    const drumCol = INQUIRY_LINE_COLUMNS.find((c) => c.id === 'drumType');
    const valueCol = INQUIRY_LINE_COLUMNS.find((c) => c.id === 'value');
    const currencyCol = INQUIRY_LINE_COLUMNS.find((c) => c.id === 'currency');
    assert.ok(drumCol);
    assert.ok(valueCol);
    assert.ok(currencyCol);
    assert.equal(valueCol.label, 'Value');
    assert.equal(currencyCol.label, 'Currency');
    assert.equal(valueCol.customerVisible, false);
    assert.equal(valueCol.systemProtected, true);
    assert.equal(valueCol.displayOrder, drumCol.displayOrder + 1);
    assert.equal(valueCol.displayOrder, currencyCol.displayOrder - 1);
    assert.notEqual(currencyCol.customerVisible, false);
  });

  it('omits Value from customer line visibility while keeping Currency for both roles', () => {
    const pref = { visibleFieldIds: INQUIRY_LINE_COLUMNS.map((c) => c.id) };
    const customerCols = visibleFieldsForUser(INQUIRY_LINE_COLUMNS, pref, true).map((c) => c.id);
    const internalCols = visibleFieldsForUser(INQUIRY_LINE_COLUMNS, pref, false).map((c) => c.id);
    assert.equal(customerCols.includes('value'), false);
    assert.equal(customerCols.includes('currency'), true);
    assert.equal(internalCols.includes('value'), true);
    assert.equal(internalCols.includes('currency'), true);
  });

  it('formats null materialCost as em dash not zero', () => {
    assert.equal(formatInquiryLineValue({ materialCost: null }), '—');
    assert.equal(formatInquiryLineValue({}), '—');
    assert.notEqual(formatInquiryLineValue({ materialCost: null }), '0');
    const formatted = formatInquiryLineValue({ materialCost: 1250.5 });
    assert.notEqual(formatted, '—');
    assert.notEqual(formatted, '0');
    assert.match(formatted, /1[,.]?250/);
    assert.equal(resolveInquiryLineCurrency({ materialCostCurrency: 'LE' }, 'USD'), 'USD');
    assert.equal(resolveInquiryLineCurrency({}, 'USD'), 'USD');
    assert.equal(resolveInquiryLineCurrency({ materialCostCurrency: null }, 'EUR'), 'EUR');
  });
});

describe('commercial inquiry API client uses httpClient', () => {
  const originalHttp = {
    get: httpClient.get,
    post: httpClient.post,
    patch: httpClient.patch,
    del: httpClient.del,
    getBlob: httpClient.getBlob,
  };
  const originalFetch = globalThis.fetch;
  const httpCalls: Array<{ verb: string; url: string; body?: unknown; token?: string | null }> = [];

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function installTransportSpies(): void {
    httpCalls.length = 0;
    httpClient.get = async (url, options) => {
      httpCalls.push({ verb: 'GET', url, token: options?.token });
      return originalHttp.get(url, options);
    };
    httpClient.post = async (url, body, options) => {
      httpCalls.push({ verb: 'POST', url, body, token: options?.token });
      return originalHttp.post(url, body, options);
    };
    httpClient.patch = async (url, body, options) => {
      httpCalls.push({ verb: 'PATCH', url, body, token: options?.token });
      return originalHttp.patch(url, body, options);
    };
    httpClient.del = async (url, options) => {
      httpCalls.push({ verb: 'DELETE', url, token: options?.token });
      return originalHttp.del(url, options);
    };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/quotations')) {
        return jsonResponse({ quotations: [] });
      }
      if (url.includes('/lines/') && init?.method === 'DELETE') {
        return jsonResponse({});
      }
      if (url.includes('/lines') && init?.method === 'POST') {
        return jsonResponse({
          inquiry: {
            id: 'inq-1',
            inquiryNumber: 'INQ-1',
            customerId: 'cust-1',
            customerName: 'ELAND',
            inquiryDate: '2026-09-24',
            currency: 'USD',
            status: 'DRAFT',
            lines: [],
          },
          line: { id: 'line-1', lineNumber: 1, cableDescription: 'Cable', requestedQuantity: 1, requestedLengthMeters: 100 },
        });
      }
      if (url.includes('/submit')) {
        return jsonResponse({
          inquiry: {
            id: 'inq-1',
            inquiryNumber: 'INQ-1',
            customerId: 'cust-1',
            customerName: 'ELAND',
            inquiryDate: '2026-09-24',
            currency: 'USD',
            status: 'SUBMITTED',
          },
        });
      }
      if (url === '/api/inquiries' && init?.method === 'POST') {
        return jsonResponse({
          inquiry: {
            id: 'inq-new',
            inquiryNumber: 'INQ-2',
            customerId: 'cust-1',
            customerName: 'ELAND',
            inquiryDate: '2026-09-24',
            currency: 'USD',
            status: 'DRAFT',
          },
        });
      }
      return jsonResponse({
        id: 'inq-1',
        inquiryNumber: 'INQ-1',
        customerId: 'cust-1',
        customerName: 'ELAND',
        inquiryDate: '2026-09-24',
        currency: 'USD',
        status: 'DRAFT',
        total: 0,
        page: 1,
        pageSize: 20,
        inquiries: [],
        inquiry: {
          id: 'inq-1',
          inquiryNumber: 'INQ-1',
          customerId: 'cust-1',
          customerName: 'ELAND',
          inquiryDate: '2026-09-24',
          currency: 'USD',
          status: 'DRAFT',
        },
        line: { id: 'line-1', lineNumber: 1, cableDescription: 'Cable', requestedQuantity: 1, requestedLengthMeters: 100 },
      });
    }) as typeof fetch;
  }

  afterEach(() => {
    httpClient.get = originalHttp.get;
    httpClient.post = originalHttp.post;
    httpClient.patch = originalHttp.patch;
    httpClient.del = originalHttp.del;
    httpClient.getBlob = originalHttp.getBlob;
    globalThis.fetch = originalFetch;
  });

  it('lists inquiries through httpClient GET /api/inquiries', async () => {
    installTransportSpies();
    await fetchCommercialInquiries('jwt-token', { q: 'eland', page: 1, pageSize: 20 });
    assert.equal(httpCalls.length, 1);
    assert.equal(httpCalls[0].verb, 'GET');
    assert.equal(httpCalls[0].token, 'jwt-token');
    assert.match(httpCalls[0].url, /^\/api\/inquiries\?/);
    assert.match(httpCalls[0].url, /q=eland/);
    assert.match(httpCalls[0].url, /page=1/);
  });

  it('loads one inquiry through httpClient GET /api/inquiries/:id', async () => {
    installTransportSpies();
    const inquiry = await fetchCommercialInquiry('jwt-token', 'inq-1');
    assert.equal(inquiry.id, 'inq-1');
    assert.equal(httpCalls[0].verb, 'GET');
    assert.equal(httpCalls[0].url, '/api/inquiries/inq-1');
  });

  it('lists quotations through httpClient GET /api/quotations', async () => {
    installTransportSpies();
    const result = await fetchCommercialQuotations('jwt-token', { status: 'ISSUED' });
    assert.ok(Array.isArray(result.quotations));
    assert.equal(httpCalls[0].verb, 'GET');
    assert.equal(httpCalls[0].url, '/api/quotations?status=ISSUED');
  });

  it('creates an inquiry through httpClient POST /api/inquiries', async () => {
    installTransportSpies();
    const created = await createCommercialInquiry('jwt-token', { customerName: 'ELAND' });
    assert.equal(created.id, 'inq-new');
    assert.equal(httpCalls[0].verb, 'POST');
    assert.equal(httpCalls[0].url, '/api/inquiries');
    assert.deepEqual(httpCalls[0].body, { customerName: 'ELAND' });
  });

  it('updates an inquiry through httpClient PATCH /api/inquiries/:id', async () => {
    installTransportSpies();
    await updateCommercialInquiry('jwt-token', 'inq-1', { notes: 'updated' });
    assert.equal(httpCalls[0].verb, 'PATCH');
    assert.equal(httpCalls[0].url, '/api/inquiries/inq-1');
    assert.deepEqual(httpCalls[0].body, { notes: 'updated' });
  });

  it('submits an inquiry through httpClient POST /api/inquiries/:id/submit', async () => {
    installTransportSpies();
    const submitted = await submitCommercialInquiry('jwt-token', 'inq-1');
    assert.equal(submitted.status, 'SUBMITTED');
    assert.equal(httpCalls[0].verb, 'POST');
    assert.equal(httpCalls[0].url, '/api/inquiries/inq-1/submit');
    assert.equal(httpCalls[0].body, undefined);
  });

  it('adds a line through httpClient POST /api/inquiries/:id/lines', async () => {
    installTransportSpies();
    await addCommercialInquiryLine('jwt-token', 'inq-1', { cableDescription: 'Cable', requestedQuantity: 1 });
    assert.equal(httpCalls[0].verb, 'POST');
    assert.equal(httpCalls[0].url, '/api/inquiries/inq-1/lines');
    assert.deepEqual(httpCalls[0].body, { cableDescription: 'Cable', requestedQuantity: 1 });
  });

  it('updates a line through httpClient PATCH /api/inquiries/:id/lines/:lineId', async () => {
    installTransportSpies();
    await updateCommercialInquiryLine('jwt-token', 'inq-1', 'line-1', { notes: 'line note' });
    assert.equal(httpCalls[0].verb, 'PATCH');
    assert.equal(httpCalls[0].url, '/api/inquiries/inq-1/lines/line-1');
    assert.deepEqual(httpCalls[0].body, { notes: 'line note' });
  });

  it('deletes a line through httpClient DELETE /api/inquiries/:id/lines/:lineId', async () => {
    installTransportSpies();
    await deleteCommercialInquiryLine('jwt-token', 'inq-1', 'line-1');
    assert.equal(httpCalls[0].verb, 'DELETE');
    assert.equal(httpCalls[0].url, '/api/inquiries/inq-1/lines/line-1');
  });
});
