import { getPrisma } from './db';
import { RequestActor } from './auth';
import { issue } from '../platform/errors/domainError';
import { appendServerAudit } from './serverAudit';
import { assertCanCreateServiceCase, assertCanUpdateServiceCase, assertCanViewServiceCase } from './rbac';
import { resolveCustomerScope } from './customerScope';
import {
  actorFirstName,
  engineerAssignedCopy,
  engineerWaitingCopy,
  isSupportChatChannel,
  replySupportChat,
  supportChatGreeting,
  type SupportChatChannelCode,
} from '../domain/supportChat';
import { customerCanSeeComment } from '../domain/customerServiceCase';
import { createCustomerServiceCase, listCaseReferenceInquiries, listComplaintCategories } from './customerServiceRepository';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: RequestActor): string {
  return actor.name || actor.email || actor.id || 'unknown';
}

async function requireCustomerId(actor: RequestActor): Promise<string> {
  const scope = await resolveCustomerScope(actor);
  const id = scope.primaryMasterId || scope.masterIds[0];
  if (!id) {
    throw issue('CONFIGURATION_REQUIRED', 'Customer assignment is required before opening support chat.');
  }
  return id;
}

function projectMessage(row: { id: string; role: string; visibility: string; body: string; createdByName: string | null; createdAt: Date }) {
  return {
    id: row.id,
    role: row.role,
    visibility: row.visibility,
    body: row.body,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

function projectSession(row: {
  id: string;
  channel: string;
  engineerStatus: string;
  caseId: string | null;
  inquiryId: string | null;
  case?: { id: string; caseNumber: string; status: string; assignedRepresentativeName: string | null } | null;
  messages?: Array<{ id: string; role: string; visibility: string; body: string; createdByName: string | null; createdAt: Date }>;
}) {
  return {
    id: row.id,
    channel: row.channel,
    engineerStatus: row.engineerStatus,
    caseId: row.caseId,
    caseNumber: row.case?.caseNumber || null,
    caseStatus: row.case?.status || null,
    assignedRepresentativeName: row.case?.assignedRepresentativeName || null,
    inquiryId: row.inquiryId,
    messages: (row.messages || []).map(projectMessage),
  };
}

const sessionInclude = {
  case: { select: { id: true, caseNumber: true, status: true, assignedRepresentativeName: true } },
  messages: { orderBy: { createdAt: 'asc' as const } },
};

function filterSessionForActor<T extends { messages?: Array<{ visibility: string }> }>(row: T, actor: RequestActor): T {
  if (actor.userType !== 'customer' || !row.messages) return row;
  return {
    ...row,
    messages: row.messages.filter((m) => customerCanSeeComment(m.visibility)),
  };
}

export async function getOrCreateSupportChatSession(actor: RequestActor, channelRaw?: string) {
  assertCanViewServiceCase(actor);
  const requested = channelRaw || 'AI_ASSISTANT';
  const channel: SupportChatChannelCode = isSupportChatChannel(requested) ? requested : 'AI_ASSISTANT';
  const customerId = await requireCustomerId(actor);
  const prisma = requirePrisma();
  const existing = await prisma.supportChatSession.findUnique({
    where: { customerId_channel: { customerId, channel } },
    include: sessionInclude,
  });
  if (existing) {
    if (existing.channel === 'AI_ASSISTANT' && existing.messages[0]?.role === 'ASSISTANT') {
      const expected = supportChatGreeting(actorFirstName(actor.name));
      if (existing.messages[0].body !== expected && existing.messages[0].body.startsWith('Hello ')) {
        await prisma.supportChatMessage.update({
          where: { id: existing.messages[0].id },
          data: { body: expected },
        });
        existing.messages[0].body = expected;
      }
    }
    return projectSession(filterSessionForActor(existing, actor));
  }

  const created = await prisma.supportChatSession.create({
    data: {
      customerId,
      channel,
      engineerStatus: 'AVAILABLE',
      createdBy: actorLabel(actor),
      messages:
        channel === 'AI_ASSISTANT'
          ? {
              create: {
                role: 'ASSISTANT',
                visibility: 'CUSTOMER',
                body: supportChatGreeting(actorFirstName(actor.name)),
                createdByName: 'Energya Assistant',
              },
            }
          : undefined,
    },
    include: sessionInclude,
  });
  return projectSession(filterSessionForActor(created, actor));
}

export async function postSupportChatMessage(
  actor: RequestActor,
  input: { channel?: string; body?: string; chipId?: string | null }
) {
  assertCanUpdateServiceCase(actor);
  const requested = input.channel || 'AI_ASSISTANT';
  const channel: SupportChatChannelCode = isSupportChatChannel(requested) ? requested : 'AI_ASSISTANT';
  const body = String(input.body || '').trim();
  if (!body) throw issue('VALIDATION_FAILED', 'Message is required.');
  const session = await getOrCreateSupportChatSession(actor, channel);
  const prisma = requirePrisma();

  await prisma.supportChatMessage.create({
    data: {
      sessionId: session.id,
      role: 'CUSTOMER',
      visibility: 'CUSTOMER',
      body,
      createdBy: actor.id || actor.email,
      createdByName: actorLabel(actor),
    },
  });

  if (channel === 'AI_ASSISTANT') {
    const scripted = replySupportChat(body, input.chipId);
    await prisma.supportChatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        visibility: 'CUSTOMER',
        body: scripted.reply,
        createdByName: 'Energya Assistant',
      },
    });
    const updated = await prisma.supportChatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: sessionInclude,
    });
    return { ...projectSession(filterSessionForActor(updated, actor)), action: scripted.action || null };
  }

  if (session.caseId) {
    const { addCaseComment } = await import('./customerServiceRepository');
    await addCaseComment(session.caseId, { body }, actor);
    await prisma.supportChatMessage.create({
      data: {
        sessionId: session.id,
        role: 'SYSTEM',
        visibility: 'CUSTOMER',
        body: `Your message is attached to case ${session.caseNumber}. A Technical Office Engineer will respond on that case.`,
        createdByName: 'Energya Assistant',
      },
    });
  } else {
    await prisma.supportChatMessage.create({
      data: {
        sessionId: session.id,
        role: 'SYSTEM',
        visibility: 'CUSTOMER',
        body: 'Request an engineer to attach this conversation to a support case. Live Technical Office chat is not available in this panel.',
        createdByName: 'Energya Assistant',
      },
    });
  }

  const updated = await prisma.supportChatSession.findUniqueOrThrow({
    where: { id: session.id },
    include: sessionInclude,
  });
  return { ...projectSession(filterSessionForActor(updated, actor)), action: null };
}

export async function requestEngineerSupport(actor: RequestActor, input: { note?: string; inquiryId?: string | null }) {
  assertCanCreateServiceCase(actor);
  const session = await getOrCreateSupportChatSession(actor, 'ENGINEER');
  if (session.caseId && (session.engineerStatus === 'WAITING' || session.engineerStatus === 'ASSIGNED')) {
    return projectSession(
      filterSessionForActor(
        await requirePrisma().supportChatSession.findUniqueOrThrow({
          where: { id: session.id },
          include: sessionInclude,
        }),
        actor
      )
    );
  }

  const categories = await listComplaintCategories();
  const technical = categories.find((c) => c.code === 'TECHNICAL_SUPPORT');
  if (!technical) throw issue('CONFIGURATION_REQUIRED', 'Technical Support category is not available.');

  let inquiryId = input.inquiryId || session.inquiryId || undefined;
  if (!inquiryId) {
    const inquiries = await listCaseReferenceInquiries(actor);
    inquiryId = inquiries[0]?.id;
  }

  const recent = session.messages
    .filter((m) => m.role === 'CUSTOMER')
    .slice(-4)
    .map((m) => m.body)
    .join('\n');
  const note = input.note?.trim();
  const description = [
    'Customer requested to speak with a Technical Office Engineer from Help & Support chat.',
    note ? `Customer note: ${note}` : '',
    recent ? `Recent chat:\n${recent}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const created = await createCustomerServiceCase(
    {
      subject: 'Request to speak with a Technical Office Engineer',
      description,
      categoryId: technical.id,
      caseType: 'TECHNICAL_SUPPORT',
      inquiryId,
      origin: 'SUPPORT_CHAT',
    },
    actor
  );

  const prisma = requirePrisma();
  await prisma.supportChatSession.update({
    where: { id: session.id },
    data: {
      caseId: created.id,
      inquiryId: created.inquiry?.id || inquiryId || null,
      engineerStatus: created.assignedDepartment === 'TECHNICAL_OFFICE' && created.assignedRepresentativeName ? 'ASSIGNED' : 'WAITING',
    },
  });
  await prisma.customerServiceCase.update({
    where: { id: created.id },
    data: { assignedDepartment: 'TECHNICAL_OFFICE' },
  });
  await prisma.supportChatMessage.create({
    data: {
      sessionId: session.id,
      role: 'SYSTEM',
      visibility: 'CUSTOMER',
      body: created.assignedRepresentativeName
        ? engineerAssignedCopy(created.assignedRepresentativeName, created.caseNumber)
        : engineerWaitingCopy(created.caseNumber),
      createdByName: 'Energya Assistant',
    },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: created.id,
    action: 'ENGINEER_CHAT_REQUESTED',
    newValue: { caseNumber: created.caseNumber, sessionId: session.id },
    message: `Engineer chat requested for ${created.caseNumber}`,
  });

  const updated = await prisma.supportChatSession.findUniqueOrThrow({
    where: { id: session.id },
    include: sessionInclude,
  });
  return projectSession(filterSessionForActor(updated, actor));
}
