import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { requirePermission } from '../domain/rbacEngine';
import { PERMISSION_CATALOG } from '../domain/permissionCatalog';
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  setUserActive,
  setUserLocked,
  issueAdminPasswordReset,
  assignRole,
  removeRole,
  listRoles,
  getRoleDetail,
  createRole,
  updateRole,
  setRoleActive,
  setRolePermissions,
  securitySummary,
} from './identityAdminRepository';

export const adminIdentityRouter = Router();

function sendErr(res: any, err: any) {
  if (err instanceof DomainError && err.code === 'UNAUTHORIZED') {
    const status = err.message.includes('Sign in') ? 401 : 403;
    return res.status(status).json({ error: err.message, code: 'UNAUTHORIZED' });
  }
  const status = err.http || (err.code === 'NOT_FOUND' ? 404 : err.code === 'CONFLICT' ? 409 : err.code === 'UNAUTHORIZED' ? 403 : 400);
  return res.status(status).json({ error: err.message, code: err.code || 'ERROR' });
}

async function actorOf(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

adminIdentityRouter.get('/users', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'USER', 'VIEW');
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const userType = typeof req.query.userType === 'string' ? req.query.userType : undefined;
    const skip = req.query.skip != null ? Number(req.query.skip) : 0;
    const take = req.query.take != null ? Number(req.query.take) : 50;
    const department = typeof req.query.department === 'string' ? req.query.department : undefined;
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    res.json(await listUsers({ q, status, userType, department, customerId, role, sort, skip, take }));
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/users', async (req, res) => {
  try {
    const actor = await actorOf(req);
    const body = req.body || {};
    const user = await createUser(
      {
        username: String(body.username || body.email),
        email: String(body.email),
        fullName: String(body.fullName),
        password: String(body.password),
        userType: body.userType,
        department: body.department,
        jobTitle: body.jobTitle,
        mobile: body.mobile,
        employeeNumber: body.employeeNumber,
        customerId: body.customerId,
        roleCodes: body.roleCodes,
      },
      actor
    );
    res.status(201).json({ user });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/users/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'USER', 'VIEW');
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.patch('/users/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    const user = await updateUser(req.params.id, req.body || {}, actor);
    res.json({ user });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/users/:id/activate', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ user: await setUserActive(req.params.id, true, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/users/:id/deactivate', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ user: await setUserActive(req.params.id, false, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/users/:id/lock', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ user: await setUserLocked(req.params.id, true, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/users/:id/unlock', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ user: await setUserLocked(req.params.id, false, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/users/:id/reset-password', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json(await issueAdminPasswordReset(req.params.id, actor));
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/users/:id/roles', async (req, res) => {
  try {
    const actor = await actorOf(req);
    const roleCode = String(req.body?.roleCode || req.body?.role);
    res.json({ user: await assignRole(req.params.id, roleCode, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.delete('/users/:id/roles/:roleCode', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ user: await removeRole(req.params.id, req.params.roleCode, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/roles', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'ROLE', 'VIEW');
    res.json({ roles: await listRoles() });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/roles', async (req, res) => {
  try {
    const actor = await actorOf(req);
    const role = await createRole(req.body || {}, actor);
    res.status(201).json({ role });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/roles/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'ROLE', 'VIEW');
    const role = await getRoleDetail(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    res.json({ role });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.patch('/roles/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ role: await updateRole(req.params.id, req.body || {}, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/roles/:id/activate', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ role: await setRoleActive(req.params.id, true, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.post('/roles/:id/deactivate', async (req, res) => {
  try {
    const actor = await actorOf(req);
    res.json({ role: await setRoleActive(req.params.id, false, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/roles/:id/users', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'ROLE', 'VIEW');
    const role = await getRoleDetail(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    res.json({ users: role.users });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/roles/:id/permissions', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'ROLE', 'VIEW');
    const role = await getRoleDetail(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    res.json({ permissions: role.permissions });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.put('/roles/:id/permissions', async (req, res) => {
  try {
    const actor = await actorOf(req);
    const list = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    res.json({ role: await setRolePermissions(req.params.id, list, actor) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/permissions', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'PERMISSION', 'VIEW');
    res.json({ permissions: PERMISSION_CATALOG });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/permissions/matrix', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'PERMISSION', 'VIEW');
    const canManage = actor.permissionCodes?.includes('ADMIN:ROLE:MANAGE') || actor.permissions?.userManagement === true;
    res.json({
      permissions: PERMISSION_CATALOG,
      canAssign: Boolean(canManage),
    });
  } catch (err: any) {
    sendErr(res, err);
  }
});

adminIdentityRouter.get('/security', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'SECURITY', 'VIEW');
    res.json({ summary: await securitySummary() });
  } catch (err: any) {
    sendErr(res, err);
  }
});
