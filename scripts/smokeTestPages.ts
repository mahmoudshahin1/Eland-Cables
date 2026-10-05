const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3847';

const LOGIN_ROUTES = ['/login', '/login/customer', '/login/users', '/login/admin'];

const CUSTOMER_ROUTES = [
  '/customer',
  '/customer/products',
  '/customer/inquiries',
  '/customer/sales-orders',
  '/customer/drum-optimizer',
  '/customer/statement',
  '/customer/invoices',
  '/customer/shipments',
  '/customer/documents',
  '/customer/support',
  '/customer/process',
  '/customer/journey',
  '/customer/profile',
];

const INTERNAL_ROUTES = [
  '/internal',
  '/internal/technical-office',
  '/internal/cable-parameters',
  '/internal/costing',
  '/internal/quotations',
  '/internal/sales-orders',
  '/internal/production',
  '/internal/logistics',
  '/internal/finance',
  '/internal/master-data',
  '/internal/analytics',
  '/internal/administration',
  '/internal/profile',
];

const API_CHECKS = [
  { name: 'auth/me', path: '/api/auth/me', needsAuth: true },
  { name: 'inquiries list', path: '/api/inquiries?page=1&pageSize=5', needsAuth: true },
  { name: 'master db health', path: '/api/platform/db', needsAuth: false },
  { name: 'field definitions', path: '/api/inquiries/meta/field-definitions', needsAuth: true },
];

interface Row {
  kind: string;
  path: string;
  status: number;
  ok: boolean;
  detail?: string;
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username: email, password }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string; accessToken?: string };
  return data.accessToken || data.token || null;
}

async function checkPage(path: string): Promise<Row> {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    const text = await res.text();
    const isHtml = text.includes('<!DOCTYPE html') || text.includes('<html');
    const hasRoot = text.includes('id="root"');
    const ok = res.status >= 200 && res.status < 400 && isHtml && hasRoot;
    return {
      kind: 'page',
      path,
      status: res.status,
      ok,
      detail: ok ? undefined : !isHtml ? 'not html' : !hasRoot ? 'missing #root' : `status ${res.status}`,
    };
  } catch (err) {
    return {
      kind: 'page',
      path,
      status: 0,
      ok: false,
      detail: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

async function checkApi(path: string, token?: string | null): Promise<Row> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, { headers });
    return {
      kind: 'api',
      path,
      status: res.status,
      ok: res.ok,
      detail: res.ok ? undefined : (await res.text()).slice(0, 120),
    };
  } catch (err) {
    return {
      kind: 'api',
      path,
      status: 0,
      ok: false,
      detail: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

async function main() {
  const results: Row[] = [];

  for (const path of [...LOGIN_ROUTES, ...CUSTOMER_ROUTES, ...INTERNAL_ROUTES]) {
    results.push(await checkPage(path));
  }

  const customerToken = await login('david.smith@elandcables.com', 'Customer@2026!');
  const internalToken = await login('m.ahmed@energya.com', 'Sales@2026!');

  for (const check of API_CHECKS) {
    const token = check.needsAuth ? internalToken || customerToken : null;
    results.push({
      ...(await checkApi(check.path, token)),
      path: `${check.name} (${check.path})`,
    });
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);

  console.log('\n=== Page & API Smoke Test ===');
  console.log(`Base URL: ${BASE}`);
  console.log(`Passed: ${passed.length}/${results.length}`);
  console.log(`Customer login: ${customerToken ? 'OK' : 'FAILED'}`);
  console.log(`Internal login: ${internalToken ? 'OK' : 'FAILED'}`);

  if (failed.length) {
    console.log('\n--- FAILURES ---');
    for (const row of failed) {
      console.log(`[${row.kind}] ${row.path} -> ${row.status} ${row.detail || ''}`);
    }
  }

  console.log('\n--- ALL PAGES ---');
  for (const row of results.filter((r) => r.kind === 'page')) {
    console.log(`${row.ok ? 'OK' : 'FAIL'} ${row.status} ${row.path}${row.detail ? ` (${row.detail})` : ''}`);
  }

  process.exit(failed.length ? 1 : 0);
}

main();
