/**
 * Domain event emitter abstraction — no SMTP/WhatsApp (Task 05I-C).
 * Notification adapters subscribe in later tasks (05I-G).
 */

export type InquiryDomainEventType =
  | 'INQUIRY_CALCULATION_STARTED'
  | 'INQUIRY_CALCULATION_BLOCKED'
  | 'INQUIRY_CALCULATION_COMPLETED'
  | 'QUOTATION_DRAFT_CREATED'
  | 'STANDARD_WORKFLOW_SUBMITTED'
  | 'STANDARD_ENGINEERING_APPROVED'
  | 'STANDARD_TO_REQUIRED'
  | 'STANDARD_QUOTATION_DRAFT_CREATED'
  | 'STANDARD_QUOTATION_RETURNED'
  | 'STANDARD_QUOTATION_APPROVED'
  | 'STANDARD_QUOTATION_ISSUED'
  | 'STANDARD_CUSTOMER_DECISION';

export interface InquiryDomainEvent {
  type: InquiryDomainEventType;
  inquiryId: string;
  inquiryNumber?: string;
  actorId?: string | null;
  actorName?: string | null;
  payload?: Record<string, unknown>;
  at: string;
}

type DomainEventListener = (event: InquiryDomainEvent) => void;

const listeners: DomainEventListener[] = [];

export function onDomainEvent(listener: DomainEventListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function emitDomainEvent(
  event: Omit<InquiryDomainEvent, 'at'> & { at?: string }
): InquiryDomainEvent {
  const full: InquiryDomainEvent = {
    ...event,
    at: event.at ?? new Date().toISOString(),
  };
  for (const listener of listeners) {
    try {
      listener(full);
    } catch {
      // Listeners must not break orchestration
    }
  }
  return full;
}

export function clearDomainEventListeners(): void {
  listeners.length = 0;
}
