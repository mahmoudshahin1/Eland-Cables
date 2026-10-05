/**
 * STANDARD_WORKFLOW notification adapter — in-app bell + email queue.
 * Email failure never throws to the orchestrator.
 */

import { getPrisma } from './db';
import { createUserNotification } from './userNotificationService';
import { enqueueEmail, resolveNotificationRecipients } from './emailOutboxService';

async function findCustomerUsers(customerMasterId: string | null | undefined): Promise<string[]> {
  if (!customerMasterId) return [];
  const prisma = getPrisma();
  if (!prisma) return [];
  const links = await prisma.customerUser.findMany({
    where: { customerId: customerMasterId, status: 'ACTIVE' },
    select: { userAccountId: true },
  });
  return links.map((l) => l.userAccountId);
}

async function enqueueSalesEmails(subject: string, body: string, eventCode: string, entityId?: string) {
  const recipients = resolveNotificationRecipients();
  if (recipients.length === 0) {
    await enqueueEmail({
      toAddress: 'unconfigured@localhost',
      subject,
      bodyText: body,
      eventCode,
      entityType: 'CommercialInquiry',
      entityId,
    });
    return;
  }
  for (const to of recipients) {
    try {
      await enqueueEmail({
        toAddress: to,
        subject,
        bodyText: body,
        eventCode,
        entityType: 'CommercialInquiry',
        entityId,
      });
    } catch (err) {
      console.warn('[notification] email enqueue failed (business not rolled back)', err);
    }
  }
}

export async function notifyStandardWorkflowEvent(input: {
  eventCode: string;
  title: string;
  message: string;
  inquiryId?: string;
  inquiryNumber?: string;
  customerMasterId?: string | null;
  notifyCustomer?: boolean;
  notifyRole?: string;
}) {
  try {
    if (input.notifyRole) {
      await createUserNotification({
        roleCode: input.notifyRole,
        title: input.title,
        message: input.message,
        eventCode: input.eventCode,
        entityType: 'CommercialInquiry',
        entityId: input.inquiryId,
      });
    }
    if (input.notifyCustomer) {
      const userIds = await findCustomerUsers(input.customerMasterId);
      for (const userAccountId of userIds) {
        await createUserNotification({
          userAccountId,
          title: input.title,
          message: input.message,
          eventCode: input.eventCode,
          entityType: 'CommercialInquiry',
          entityId: input.inquiryId,
        });
      }
    }
    await enqueueSalesEmails(
      input.title,
      [input.message, input.inquiryNumber ? `Inquiry: ${input.inquiryNumber}` : ''].filter(Boolean).join('\n'),
      input.eventCode,
      input.inquiryId
    );
  } catch (err) {
    console.warn('[notification] STANDARD_WORKFLOW notify failed (business not rolled back)', err);
  }
}
