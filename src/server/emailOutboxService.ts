/**
 * Durable email queue. SMTP env only — never commit secrets.
 * Failure must not roll back business (ISSUED stays issued).
 * Without SMTP: log "Email queued / provider not configured" and leave QUEUED.
 */

import { getPrisma } from './db';

export type EmailEventCode =
  | 'INQUIRY_SUBMITTED'
  | 'STANDARD_TO_REQUIRED'
  | 'STANDARD_QUOTATION_RETURNED'
  | 'STANDARD_QUOTATION_ISSUED'
  | 'QUOTATION_ISSUED'
  | 'STANDARD_CUSTOMER_DECISION'
  | 'STANDARD_CLARIFICATION_REQUESTED';

export interface EnqueueEmailInput {
  toAddress: string;
  subject: string;
  bodyText: string;
  eventCode: string;
  entityType?: string;
  entityId?: string;
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function sendSmtp(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!smtpConfigured()) {
    return { ok: false, error: 'SMTP not configured' };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodemailer = (await import('nodemailer' as string)) as any;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) {
    const err = new Error('Database is not configured.') as Error & { code: string };
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  return prisma;
}

export async function enqueueEmail(input: EnqueueEmailInput) {
  const prisma = requirePrisma();
  const configured = smtpConfigured();
  const row = await prisma.emailOutbox.create({
    data: {
      toAddress: input.toAddress,
      subject: input.subject,
      bodyText: input.bodyText,
      eventCode: input.eventCode,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      status: 'QUEUED',
      providerConfigured: configured,
    },
  });

  if (!configured) {
    console.info('[email] Email queued / provider not configured', {
      id: row.id,
      to: input.toAddress,
      subject: input.subject,
      eventCode: input.eventCode,
    });
    return row;
  }

  return attemptSendEmail(row.id);
}

export async function attemptSendEmail(id: string) {
  const prisma = requirePrisma();
  const row = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!row) {
    const err = new Error(`Email ${id} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }

  const configured = smtpConfigured();
  const result = await sendSmtp(row.toAddress, row.subject, row.bodyText);
  const attempts = row.attempts + 1;

  if (result.ok) {
    return prisma.emailOutbox.update({
      where: { id },
      data: {
        status: 'SENT',
        attempts,
        sentAt: new Date(),
        lastError: null,
        providerConfigured: configured,
      },
    });
  }

  const failed = await prisma.emailOutbox.update({
    where: { id },
    data: {
      status: configured ? 'FAILED' : 'QUEUED',
      attempts,
      lastError: result.error || 'SMTP send failed',
      providerConfigured: configured,
    },
  });

  if (configured) {
    console.warn('[email] SMTP send failed — business transaction not rolled back', {
      id,
      to: row.toAddress,
      error: result.error,
    });
  } else {
    console.info('[email] Email queued / provider not configured', {
      id,
      to: row.toAddress,
      subject: row.subject,
    });
  }
  return failed;
}

export async function retryFailedEmail(id: string) {
  const prisma = requirePrisma();
  const row = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!row) {
    const err = new Error(`Email ${id} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (row.status === 'SENT') return row;
  await prisma.emailOutbox.update({
    where: { id },
    data: { status: 'QUEUED', lastError: null },
  });
  return attemptSendEmail(id);
}

export async function listEmailOutbox(filter?: { entityId?: string; status?: string }) {
  const prisma = requirePrisma();
  return prisma.emailOutbox.findMany({
    where: {
      ...(filter?.entityId ? { entityId: filter.entityId } : {}),
      ...(filter?.status ? { status: filter.status as 'QUEUED' | 'SENT' | 'FAILED' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export function resolveNotificationRecipients(): string[] {
  return (process.env.NOTIFY_SALES_EMAIL || process.env.SMTP_FROM || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}
