import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_TOKEN_KEY } from '../auth/tokenStorage';
import { HttpError, del, get, getBlob, httpClient, patch, post } from './httpClient';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
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

describe('httpClient', () => {
  it('GET returns successful JSON', async () => {
    const { calls } = mockFetch((url) => {
      assert.equal(url, '/api/inquiries');
      return jsonResponse({ total: 1, inquiries: [{ id: 'inq-1' }] });
    });

    const data = await get<{ total: number; inquiries: Array<{ id: string }> }>('/api/inquiries', {
      token: 'tok-get',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, 'GET');
    assert.equal(data.total, 1);
    assert.equal(data.inquiries[0].id, 'inq-1');
  });

  it('POST sends JSON body and returns successful JSON', async () => {
    const { calls } = mockFetch((_url, init) => {
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, JSON.stringify({ customerName: 'ELAND' }));
      return jsonResponse({ inquiry: { id: 'inq-2' } }, 201);
    });

    const data = await post<{ inquiry: { id: string } }>(
      '/api/inquiries',
      { customerName: 'ELAND' },
      { token: 'tok-post' }
    );

    assert.equal(calls.length, 1);
    assert.equal(data.inquiry.id, 'inq-2');
  });

  it('attaches Authorization Bearer from the explicit token', async () => {
    const { calls } = mockFetch(() => jsonResponse({ ok: true }));

    await get('/api/inquiries', { token: 'jwt-123' });

    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer jwt-123');
    assert.equal(headers.get('Content-Type'), 'application/json');
  });

  it('falls back to tokenStorage when no token option is passed', async () => {
    const memory = new Map<string, string>([[ACCESS_TOKEN_KEY, 'stored-jwt']]);
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    };
    const previousWindow = (globalThis as { window?: unknown }).window;
    const previousLocal = (globalThis as { localStorage?: unknown }).localStorage;
    const previousSession = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    (globalThis as { window?: unknown }).window = { localStorage: storage, sessionStorage: storage };
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = storage;

    try {
      const { calls } = mockFetch(() => jsonResponse({ ok: true }));
      await get('/api/inquiries');
      const headers = new Headers(calls[0].init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer stored-jwt');
    } finally {
      if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previousWindow;
      if (previousLocal === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage?: unknown }).localStorage = previousLocal;
      if (previousSession === undefined) delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
      else (globalThis as { sessionStorage?: unknown }).sessionStorage = previousSession;
    }
  });

  it('preserves backend error, code, and HTTP status', async () => {
    mockFetch(() => jsonResponse({ error: 'Inquiry not found', code: 'NOT_FOUND' }, 404));

    await assert.rejects(
      () => get('/api/inquiries/missing', { token: 'tok' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        assert.equal(err.error, 'Inquiry not found');
        assert.equal(err.code, 'NOT_FOUND');
        assert.equal(err.message, 'Inquiry not found');
        return true;
      }
    );
  });

  it('preserves 401', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401));

    await assert.rejects(
      () => post('/api/inquiries', {}, { token: 'expired' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 401);
        assert.equal(err.error, 'Unauthorized');
        assert.equal(err.code, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('preserves 403', async () => {
    mockFetch(() => jsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403));

    await assert.rejects(
      () => get('/api/inquiries', { token: 'tok' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 403);
        assert.equal(err.error, 'Forbidden');
        assert.equal(err.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('preserves 409', async () => {
    mockFetch(() => jsonResponse({ error: 'Version conflict', code: 'CONFLICT' }, 409));

    await assert.rejects(
      () => patch('/api/inquiries/inq-1', { notes: 'x' }, { token: 'tok' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 409);
        assert.equal(err.error, 'Version conflict');
        assert.equal(err.code, 'CONFLICT');
        return true;
      }
    );
  });

  it('PATCH and DELETE use those verbs through the same client', async () => {
    const { calls } = mockFetch((url) => {
      if (url.includes('/lines/')) return jsonResponse({});
      return jsonResponse({ inquiry: { id: 'inq-1' } });
    });

    await patch('/api/inquiries/inq-1', { notes: 'updated' }, { token: 'tok' });
    await del('/api/inquiries/inq-1/lines/line-1', { token: 'tok' });

    assert.equal(calls[0].init?.method, 'PATCH');
    assert.equal(calls[1].init?.method, 'DELETE');
    assert.equal(httpClient.patch, patch);
    assert.equal(httpClient.del, del);
    assert.equal(httpClient.getBlob, getBlob);
  });
});
