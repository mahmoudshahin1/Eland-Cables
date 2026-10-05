/**
 * Scripted Help & Support chat. Replies are approved copy only.
 * Never invent cable sizes, voltages, constructions, or standards.
 */

export const SUPPORT_CHAT_CHANNELS = ['AI_ASSISTANT', 'ENGINEER'] as const;
export type SupportChatChannelCode = (typeof SUPPORT_CHAT_CHANNELS)[number];

export const SUPPORT_CHAT_ENGINEER_STATUSES = ['AVAILABLE', 'WAITING', 'ASSIGNED'] as const;
export type SupportChatEngineerStatusCode = (typeof SUPPORT_CHAT_ENGINEER_STATUSES)[number];

export const CUSTOMER_SERVICE_CASE_TYPES = [
  'COMPLAINT',
  'TECHNICAL_SUPPORT',
  'GENERAL_SUPPORT',
  'INFORMATION_REQUEST',
] as const;
export type CustomerServiceCaseTypeCode = (typeof CUSTOMER_SERVICE_CASE_TYPES)[number];

export const SUPPORT_CHAT_CHIPS = [
  { id: 'cable_selection', label: 'Cable selection guidance' },
  { id: 'technical_standards', label: 'Technical standards' },
  { id: 'track_inquiry', label: 'Track my inquiry' },
  { id: 'speak_engineer', label: 'Speak to an engineer' },
] as const;

export type SupportChatChipId = (typeof SUPPORT_CHAT_CHIPS)[number]['id'];

export type SupportChatReplyAction = 'open_engineer' | 'open_inquiries' | 'open_new_inquiry' | 'open_new_case';

export type SupportChatReply = {
  reply: string;
  action?: SupportChatReplyAction;
};

export const ENGINEER_FALLBACK =
  'Please speak with a Technical Office Engineer. I can only share approved guidance from this chat and cannot invent cable specifications.';

export const APPROVED_CHAT_REPLIES = {
  cable_selection:
    'I can help you start a cable selection. Open New Inquiry to configure voltage, cores, and installation against Energya master data. I cannot recommend a specific size or construction from this chat. A Technical Office Engineer can confirm the selection against your project.',
  technical_standards:
    'For IEC, BS, or project-standard questions, please speak with a Technical Office Engineer. They will confirm the applicable standard against your inquiry. I cannot quote or invent standard clauses here.',
  track_inquiry:
    'You can track every inquiry from My Inquiries — status, quotations, and documents stay on that page. If something looks wrong, raise a support request so Customer Service can investigate.',
  speak_engineer:
    'I can request a Technical Office Engineer for you. Open Talk to an Engineer and send the request. Your conversation will be linked to a support case.',
  urgent:
    'For urgent delivery, quality, or documentation issues, raise a support request so Customer Service can investigate against your inquiry.',
  greeting_fallback: ENGINEER_FALLBACK,
} as const;

export function isSupportChatChannel(value: string): value is SupportChatChannelCode {
  return (SUPPORT_CHAT_CHANNELS as readonly string[]).includes(value);
}

export function isCustomerServiceCaseType(value: string): value is CustomerServiceCaseTypeCode {
  return (CUSTOMER_SERVICE_CASE_TYPES as readonly string[]).includes(value);
}

export function caseTypeLabel(code: string | null | undefined): string {
  switch (code) {
    case 'COMPLAINT':
      return 'Complaint';
    case 'TECHNICAL_SUPPORT':
      return 'Technical Support';
    case 'GENERAL_SUPPORT':
      return 'General Support';
    case 'INFORMATION_REQUEST':
      return 'Information Request';
    default:
      return '';
  }
}

export function engineerStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'WAITING':
      return 'Waiting';
    case 'ASSIGNED':
      return 'Assigned';
    default:
      return 'Available';
  }
}

export function supportChatGreeting(firstName: string): string {
  const name = firstName.trim() || 'there';
  return `Hello ${name}! I'm the Energya Assistant. I can help you with technical questions about our cables, product information, standards, or guide you to the right support team.\n\nHow can I help you today?`;
}

const NAME_TITLES = new Set(['eng', 'eng.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.']);

function firstNameFromActor(fullName?: string | null): string {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const withoutTitle = parts.filter((part) => !NAME_TITLES.has(part.toLowerCase()));
  return (withoutTitle[0] || parts[0] || '').replace(/\.$/, '');
}

export function actorFirstName(fullName?: string | null): string {
  return firstNameFromActor(fullName);
}

export function replySupportChat(message: string, chipId?: string | null): SupportChatReply {
  const chip = (SUPPORT_CHAT_CHIPS as readonly { id: string }[]).find((row) => row.id === chipId);
  if (chip?.id === 'cable_selection') return { reply: APPROVED_CHAT_REPLIES.cable_selection, action: 'open_new_inquiry' };
  if (chip?.id === 'technical_standards') return { reply: APPROVED_CHAT_REPLIES.technical_standards, action: 'open_engineer' };
  if (chip?.id === 'track_inquiry') return { reply: APPROVED_CHAT_REPLIES.track_inquiry, action: 'open_inquiries' };
  if (chip?.id === 'speak_engineer') return { reply: APPROVED_CHAT_REPLIES.speak_engineer, action: 'open_engineer' };

  const text = message.trim().toLowerCase();
  if (!text) return { reply: ENGINEER_FALLBACK };

  if (/\b(urgent|complaint|damaged|damage|short(?:age)?|missing|wrong length)\b/.test(text)) {
    return { reply: APPROVED_CHAT_REPLIES.urgent, action: 'open_new_case' };
  }
  if (/\b(track|status|where is|my inquiry|quotation)\b/.test(text)) {
    return { reply: APPROVED_CHAT_REPLIES.track_inquiry, action: 'open_inquiries' };
  }
  if (/\b(engineer|technical office|speak to|talk to)\b/.test(text)) {
    return { reply: APPROVED_CHAT_REPLIES.speak_engineer, action: 'open_engineer' };
  }
  if (/\b(standard|iec|bs |bs-|ieee|specification|spec)\b/.test(text)) {
    return { reply: APPROVED_CHAT_REPLIES.technical_standards, action: 'open_engineer' };
  }
  if (/\b(select|selection|which cable|recommend|size|mm2|mm²|core|voltage|configur)\b/.test(text)) {
    return { reply: APPROVED_CHAT_REPLIES.cable_selection, action: 'open_new_inquiry' };
  }

  return { reply: ENGINEER_FALLBACK, action: 'open_engineer' };
}

export function engineerWaitingCopy(caseNumber?: string | null): string {
  if (caseNumber) {
    return `We've asked a Technical Office Engineer to join. Your request is on case ${caseNumber}. Status: Waiting.`;
  }
  return "We've asked a Technical Office Engineer to join. Status: Waiting.";
}

export function engineerAssignedCopy(name?: string | null, caseNumber?: string | null): string {
  const who = name?.trim() || 'a Technical Office Engineer';
  if (caseNumber) {
    return `${who} is assigned to case ${caseNumber}. Replies stay on that case — this chat does not invent live engineer messages.`;
  }
  return `${who} is assigned. Follow the linked support case for updates.`;
}
