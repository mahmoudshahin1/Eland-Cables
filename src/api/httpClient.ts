import { readAccessToken } from '../auth/tokenStorage';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type HttpClientOptions = {
  token?: string | null;
  headers?: HeadersInit;
  signal?: AbortSignal;
};

export class HttpError extends Error {
  readonly status: number;
  readonly error: string;
  readonly code?: string;

  constructor(message: string, opts: { status: number; error: string; code?: string }) {
    super(message);
    this.name = 'HttpError';
    this.status = opts.status;
    this.error = opts.error;
    this.code = opts.code;
  }
}

function resolveToken(explicit?: string | null): string | null {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  return readAccessToken();
}

function buildHeaders(options?: HttpClientOptions, jsonContentType = true): Headers {
  const headers = new Headers(options?.headers);
  const token = resolveToken(options?.token);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (jsonContentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function normalizeApiError(res: Response, data: unknown): HttpError {
  const payload = (data && typeof data === 'object' ? data : {}) as {
    error?: string;
    code?: string;
    hint?: string;
    method?: string;
    path?: string;
  };
  const fallback = `Request failed (${res.status})`;
  const parts = [payload.error || fallback];
  if (payload.hint) parts.push(payload.hint);
  if (payload.method && payload.path) {
    parts.push(`(${payload.method} ${payload.path})`);
  }
  return new HttpError(parts.join(' '), {
    status: res.status,
    error: payload.error || fallback,
    code: payload.code,
  });
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return {};
  return res.json().catch(() => ({}));
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throw normalizeApiError(res, data);
  }
  if (!contentType.includes('application/json')) {
    throw new Error('Unexpected server response. Restart the dev server (npm run dev) to load the latest API routes.');
  }
  return data as T;
}

async function requestJson<T>(
  method: HttpMethod,
  url: string,
  options?: HttpClientOptions & { body?: unknown }
): Promise<T> {
  const hasBody = options != null && 'body' in options && options.body !== undefined;
  const res = await fetch(url, {
    method,
    headers: buildHeaders(options, true),
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  return parseJson<T>(res);
}

export function get<T>(url: string, options?: HttpClientOptions): Promise<T> {
  return requestJson<T>('GET', url, options);
}

export function post<T>(url: string, body?: unknown, options?: HttpClientOptions): Promise<T> {
  return requestJson<T>('POST', url, body === undefined ? options : { ...options, body });
}

export function patch<T>(url: string, body?: unknown, options?: HttpClientOptions): Promise<T> {
  return requestJson<T>('PATCH', url, body === undefined ? options : { ...options, body });
}

export function del<T>(url: string, options?: HttpClientOptions): Promise<T> {
  return requestJson<T>('DELETE', url, options);
}

export async function getBlob(
  url: string,
  options?: HttpClientOptions
): Promise<{ blob: Blob; headers: Headers; status: number }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(options, false),
  });
  if (!res.ok) {
    const data = await parseJsonBody(res);
    throw normalizeApiError(res, data);
  }
  return { blob: await res.blob(), headers: res.headers, status: res.status };
}

export const httpClient = {
  get,
  post,
  patch,
  del,
  getBlob,
};
