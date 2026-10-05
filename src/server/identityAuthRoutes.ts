import { Router } from 'express';
import { actorFromAuthorizationHeader, resolveRequestActor } from './auth';
import { loginWithPassword, refreshSession, getMe, seedDevelopmentUsers, isDevelopmentIdentitySeedAllowed, revokeRefreshToken, revokeSessionById, changeOwnPassword } from './identityService';
import { consumePasswordReset } from './identityAdminRepository';
import { loginRateLimit } from './httpSecurity';
import { getPrisma } from './db';

export const identityAuthRouter = Router();

let seedStarted = false;
async function ensureSeed() {
  if (seedStarted) return;
  seedStarted = true;
  try {
    await seedDevelopmentUsers();
  } catch {
    seedStarted = false;
  }
}

function sendAuthError(res: any, err: any) {
  const status = err.http || (err.code === 'UNAUTHORIZED' ? 401 : 400);
  return res.status(status).json({ error: err.message, code: err.code || 'UNAUTHORIZED' });
}

identityAuthRouter.post('/login', loginRateLimit, async (req, res) => {
  try {
    if (isDevelopmentIdentitySeedAllowed()) {
      await ensureSeed();
    }
    const identifier = String(req.body?.email || req.body?.username || req.body?.userName || '').trim();
    const password = req.body?.password;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email or username and password are required' });
    }
    const auth = await loginWithPassword(identifier, String(password));
    return res.json({ success: true, message: 'Authentication successful', ...auth });
  } catch (err: any) {
    return sendAuthError(res, err);
  }
});

identityAuthRouter.post('/logout', async (req, res) => {
  try {
    const headerActor = actorFromAuthorizationHeader(req.headers.authorization);
    if (headerActor.sessionId) await revokeSessionById(headerActor.sessionId);
    const { refreshToken } = req.body || {};
    if (refreshToken) await revokeRefreshToken(String(refreshToken));
    return res.json({ success: true, message: 'Signed out' });
  } catch (err: any) {
    return sendAuthError(res, err);
  }
});

identityAuthRouter.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });
    const auth = await refreshSession(String(refreshToken));
    return res.json({ success: true, message: 'Token refreshed', ...auth });
  } catch (err: any) {
    return sendAuthError(res, err);
  }
});

identityAuthRouter.post('/forgot-password', async (_req, res) => {
  return res.json({
    success: true,
    message: 'If the account exists, an administrator must issue a password reset ticket. Self-service email reset is not enabled in B1.',
  });
});

identityAuthRouter.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header with Bearer token is missing.', code: 'UNAUTHORIZED' });
  }
  const actor = await resolveRequestActor(header);
  if (!actor.id) {
    return res.status(401).json({ error: 'Invalid or expired session.', code: 'UNAUTHORIZED' });
  }
  try {
    const prisma = getPrisma();
    if (prisma) {
      const user = await getMe(actor.id);
      if (!user) return res.status(401).json({ error: 'Invalid or expired session.', code: 'UNAUTHORIZED' });
      return res.json({ authenticated: true, user, claims: actor });
    }
    return res.json({ authenticated: true, user: { ...actor, permissions: actor.permissions }, claims: actor });
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired session.', details: err.message, code: 'UNAUTHORIZED' });
  }
});

identityAuthRouter.post('/change-password', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header with Bearer token is missing.', code: 'UNAUTHORIZED' });
  }
  const actor = await resolveRequestActor(header);
  if (!actor.id) {
    return res.status(401).json({ error: 'Invalid or expired session.', code: 'UNAUTHORIZED' });
  }
  try {
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required', code: 'VALIDATION_FAILED' });
    }
    await changeOwnPassword(actor.id, String(currentPassword), String(newPassword), actor.sessionId);
    return res.json({ success: true, message: 'Password updated.' });
  } catch (err: any) {
    return sendAuthError(res, err);
  }
});

identityAuthRouter.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ error: 'Reset token and new password are required' });
    await consumePasswordReset(String(token), String(newPassword));
    return res.json({ success: true, message: 'Password updated. You may now sign in.' });
  } catch (err: any) {
    return sendAuthError(res, err);
  }
});

identityAuthRouter.post('/register', async (req, res) => {
  return res.status(403).json({
    error: 'Self-registration is disabled. Ask an administrator to create your account.',
    code: 'UNAUTHORIZED',
  });
});

identityAuthRouter.post('/roles', (_req, res) => {
  return res.status(403).json({ error: 'Use POST /api/admin/roles.', code: 'UNAUTHORIZED' });
});
identityAuthRouter.post('/assign-role', (_req, res) => {
  return res.status(403).json({ error: 'Use POST /api/admin/users/:id/roles.', code: 'UNAUTHORIZED' });
});
identityAuthRouter.get('/users', (_req, res) => {
  return res.status(403).json({ error: 'Use GET /api/admin/users.', code: 'UNAUTHORIZED' });
});

identityAuthRouter.get('/roles', async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: true, roles: [], totalRoles: 0 });
    const roles = await prisma.role.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    res.json({
      success: true,
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        normalizedName: r.code,
        description: r.description,
        userType: r.userType,
        isSystemRole: r.isSystem,
      })),
      totalRoles: roles.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
