export const LINE_ATTACHMENT_KIND_TECHNICAL_OFFER = 'TECHNICAL_OFFER';

export const LINE_ATTACHMENT_KIND_LABELS: Record<string, string> = {
  TECHNICAL_OFFER: 'Technical Offer',
};

export const ATTACHMENT_SOURCE_CABLE_MASTER = 'CABLE_MASTER_DEFAULT';
export const ATTACHMENT_SOURCE_MANUAL = 'MANUAL_UPLOAD';
export const ATTACHMENT_SOURCE_REPORT_TAILOR = 'REPORT_TAILOR';

export interface InquiryLineAttachmentSummary {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  source: string;
  uploadedBy?: string | null;
  createdAt: string;
}

export function lineHasRequiredTechnicalOffer(
  attachments: InquiryLineAttachmentSummary[] | undefined | null
): boolean {
  return (attachments || []).some((a) => a.kind === LINE_ATTACHMENT_KIND_TECHNICAL_OFFER);
}

export function canEditLineTechnicalAttachments(actor: {
  userType?: string;
  permissions?: Record<string, boolean> | { technicalOffice?: boolean };
}): boolean {
  if (actor.userType !== 'internal') return false;
  if (!actor.permissions) return true;
  return actor.permissions.technicalOffice !== false;
}
