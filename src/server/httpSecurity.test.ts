import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import http from 'node:http';
import { applySecurityHeaders, isLoginRateLimitEnabled, loginRateLimit, resetLoginRateLimitForTests } from './httpSecurity';

function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe('HTTP security headers and login rate limit', () => {
  it('sets nosniff and DENY frame headers', async () => {
    const app = express();
    app.use(applySecurityHeaders);
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    const { server, base } = await listen(app);
    try {
      const res = await fetch(`${base}/ping`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('rate-limits login when LOGIN_RATE_LIMIT=true', async () => {
    process.env.LOGIN_RATE_LIMIT = 'true';
    process.env.LOGIN_RATE_MAX = '2';
    process.env.LOGIN_RATE_WINDOW_MS = '60000';
    resetLoginRateLimitForTests();
    assert.equal(isLoginRateLimitEnabled(), true);
    const app = express();
    app.use(express.json());
    app.post('/login', loginRateLimit, (_req, res) => res.json({ ok: true }));
    const { server, base } = await listen(app);
    try {
      const post = () =>
        fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal((await post()).status, 200);
      assert.equal((await post()).status, 200);
      assert.equal((await post()).status, 429);
    } finally {
      delete process.env.LOGIN_RATE_LIMIT;
      delete process.env.LOGIN_RATE_MAX;
      resetLoginRateLimitForTests();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
