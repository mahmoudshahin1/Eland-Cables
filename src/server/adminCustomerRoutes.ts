import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { requirePermission, hasPermission } from '../domain/rbacEngine';
import { assertCanExportMasterData } from './rbac';
import {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  setCustomerActive,
  deleteOrDeactivateCustomer,
  listCustomerUsers,
  assignUserToCustomer,
  updateCustomerUser,
  listCustomerAudit,
  listCustomerReferenceMasters,
} from './customerAdminRepository';
import { exportMasterDataExcel } from './masterDataExportService';
import { sendExcelResponse } from './excelWorkbook';

export const adminCustomerRouter = Router();

function sendErr(res: any, err: any) {
  if (err instanceof DomainError && (err.code === 'UNAUTHORIZED' || err.code === 'CONFIGURATION_REQUIRED')) {
    const status = err.message.includes('Sign in') ? 401 : 403;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  const status = err.http || (err.code === 'NOT_FOUND' ? 404 : err.code === 'CONFLICT' ? 409 : err.code === 'UNAUTHORIZED' ? 403 : 400);
  return res.status(status).json({ error: err.message, code: err.code || 'ERROR' });
}

async function actorOf(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

adminCustomerRouter.get('/customers', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'VIEW');
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const skip = req.query.skip ? Number(req.query.skip) : 0;
    const take = req.query.take ? Number(req.query.take) : 50;
    res.json(await listCustomers({ q, status, type, skip, take }));
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.get('/customers/export', async (req, res) => {
  try {
    const actor = await actorOf(req);
    assertCanExportMasterData(actor, 'customers');
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const exported = await exportMasterDataExcel(actor, 'customers', { q, status, type });
    sendExcelResponse(res, exported.filename, exported.buffer);
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.get('/customer-reference-masters', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'VIEW');
    res.json(await listCustomerReferenceMasters());
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.post('/customers', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'CREATE');
    const customer = await createCustomer(actor, req.body || {});
    res.status(201).json({ customer });
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.get('/customers/:id/audit', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'VIEW');
    res.json(await listCustomerAudit(req.params.id));
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.get('/customers/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'VIEW');
    res.json(await getCustomerById(req.params.id));
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.patch('/customers/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'UPDATE');
    const customer = await updateCustomer(actor, req.params.id, req.body || {});
    res.json({ customer });
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.post('/customers/:id/activate', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'ACTIVATE');
    const customer = await setCustomerActive(actor, req.params.id, true);
    res.json({ customer });
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.post('/customers/:id/deactivate', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER', 'ACTIVATE');
    const customer = await setCustomerActive(actor, req.params.id, false);
    res.json({ customer });
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.delete('/customers/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    if (!hasPermission(actor, 'ADMIN', 'CUSTOMER', 'ACTIVATE') && !hasPermission(actor, 'ADMIN', 'CUSTOMER', 'UPDATE')) {
      requirePermission(actor, 'ADMIN', 'CUSTOMER', 'ACTIVATE');
    }
    res.json(await deleteOrDeactivateCustomer(actor, req.params.id));
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.get('/customer-users', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER_USER', 'VIEW');
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const skip = req.query.skip ? Number(req.query.skip) : 0;
    const take = req.query.take ? Number(req.query.take) : 50;
    res.json(await listCustomerUsers({ q, customerId, status, skip, take }));
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.post('/customer-users', async (req, res) => {
  try {
    const actor = await actorOf(req);
    if (!hasPermission(actor, 'ADMIN', 'CUSTOMER_USER', 'ASSIGN') && !hasPermission(actor, 'ADMIN', 'CUSTOMER_USER', 'CREATE')) {
      requirePermission(actor, 'ADMIN', 'CUSTOMER_USER', 'ASSIGN');
    }
    const assignment = await assignUserToCustomer(actor, {
      customerId: req.body?.customerId,
      userAccountId: req.body?.userAccountId || req.body?.userId,
    });
    res.status(201).json({ assignment });
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.patch('/customer-users/:id', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER_USER', 'UPDATE');
    const status = req.body?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const assignment = await updateCustomerUser(actor, req.params.id, status);
    res.json({ assignment });
  } catch (err) {
    sendErr(res, err);
  }
});

adminCustomerRouter.post('/customer-users/:id/unassign', async (req, res) => {
  try {
    const actor = await actorOf(req);
    requirePermission(actor, 'ADMIN', 'CUSTOMER_USER', 'UPDATE');
    const assignment = await updateCustomerUser(actor, req.params.id, 'INACTIVE');
    res.json({ assignment });
  } catch (err) {
    sendErr(res, err);
  }
});
