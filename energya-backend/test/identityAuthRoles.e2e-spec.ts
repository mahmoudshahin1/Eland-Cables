import assert from 'node:assert/strict';
import { describe, it, beforeAll as before, afterAll as after } from 'vitest';
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../../src/server/db';
import { identityAuthRouter } from './identityAuthRoutes';

dotenv.config();

const dir = dirname(fileURLToPath(import.meta.url));

function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function extractRouteHandler(source: string, method: 'get' | 'post', path: string): string {
  const marker = `identityAuthRouter.${method}('${path}'`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `expected ${marker}`);
  const openBrace = source.indexOf('{', start);
  assert.ok(openBrace >= 0, `expected body for ${marker}`);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`unbalanced braces for ${marker}`);
}

describe('GET /api/auth/roles - pure read (no identity seed)', () => {
  

  

  describe('HTTP behavior', () => {
    let base = '';
    let nestApp: INestApplication;

    before(async () => {
          const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    nestApp = moduleFixture.createNestApplication();
    await nestApp.listen(0, '127.0.0.1');
    base = await nestApp.getUrl();
    });

    after(async () => {
      if (nestApp) await nestApp.close();
    });

    it('returns active roles with the public contract', async () => {
      const health = await checkDatabase();
      assert.equal(health.ok, true, health.error);
      const prisma = getPrisma();
      assert.ok(prisma);

      const res = await fetch(`${base}/api/auth/roles`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.roles));
      assert.equal(body.totalRoles, body.roles.length);

      const active = await prisma.role.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
      assert.equal(body.totalRoles, active.length);
      if (body.roles.length > 0) {
        const sample = body.roles[0];
        assert.ok(sample.id);
        assert.ok(sample.name);
        assert.ok(sample.normalizedName);
        assert.equal(typeof sample.description === 'string' || sample.description === null, true);
      }
      for (let i = 0; i < body.roles.length; i++) {
        assert.equal(body.roles[i].normalizedName, active[i].code);
        assert.equal(body.roles[i].id, active[i].id);
        assert.equal(body.roles[i].name, active[i].name);
      }
    });

    it('returns empty roles when Prisma is unavailable', async () => {
      const previous = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const res = await fetch(`${base}/api/auth/roles`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.deepEqual(body, { success: true, roles: [], totalRoles: 0 });
      } finally {
        if (previous === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previous;
      }
    });
  });
});


