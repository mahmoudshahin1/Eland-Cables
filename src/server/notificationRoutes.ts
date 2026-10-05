import { Router } from 'express';
import { resolveRequestActor } from './auth';
import { listUserNotifications, markAllNotificationsRead, markNotificationRead } from './userNotificationService';
import { listEmailOutbox, retryFailedEmail } from './emailOutboxService';
import { DomainError } from '../platform/errors/domainError';
import { MINIMUM_NOTIFICATION_EVENTS } from '../platform/notificationCatalog';

export const notificationRouter = Router();

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

function handleErr(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  if (err instanceof DomainError) {
    const status = err.code === 'UNAUTHORIZED' ? 403 : 400;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  const e = err as Error & { code?: string };
  if (e.code === 'NOT_FOUND') return res.status(404).json({ error: e.message, code: e.code });
  if (e.code === 'UNAUTHORIZED') return res.status(403).json({ error: e.message, code: e.code });
  return res.status(400).json({ error: e.message, code: e.code || 'BAD_REQUEST' });
}

notificationRouter.get('/catalog', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    if (!actor.id && !actor.email) {
      return res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    }
    res.json({
      events: MINIMUM_NOTIFICATION_EVENTS,
      note: 'Minimum in-app + email-queue catalog. Not an enterprise messaging platform.',
    });
  } catch (err) {
    handleErr(err, res);
  }
});

notificationRouter.get('/', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    if (!actor.id && !actor.email) {
      return res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
    }
    const rows = await listUserNotifications(actor);
    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        eventCode: n.eventCode,
        entityType: n.entityType,
        entityId: n.entityId,
        read: Boolean(n.readAt),
        timestamp: n.createdAt.toISOString(),
        type: n.eventCode.includes('EMAIL') ? 'email' : 'system',
      })),
    });
  } catch (err) {
    handleErr(err, res);
  }
});

notificationRouter.post('/:id/read', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    const row = await markNotificationRead(req.params.id, actor);
    res.json({ notification: row });
  } catch (err) {
    handleErr(err, res);
  }
});

notificationRouter.post('/read-all', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    await markAllNotificationsRead(actor);
    res.json({ ok: true });
  } catch (err) {
    handleErr(err, res);
  }
});

notificationRouter.get('/emails', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    if (actor.userType === 'customer') {
      return res.status(403).json({ error: 'Email outbox is internal-only.', code: 'UNAUTHORIZED' });
    }
    const rows = await listEmailOutbox({
      entityId: typeof req.query.entityId === 'string' ? req.query.entityId : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ emails: rows });
  } catch (err) {
    handleErr(err, res);
  }
});

notificationRouter.post('/emails/:id/retry', async (req, res) => {
  try {
    const actor = await actorFromRequest(req);
    if (actor.userType === 'customer') {
      return res.status(403).json({ error: 'Email retry is internal-only.', code: 'UNAUTHORIZED' });
    }
    const row = await retryFailedEmail(req.params.id);
    res.json({ email: row });
  } catch (err) {
    handleErr(err, res);
  }
});
