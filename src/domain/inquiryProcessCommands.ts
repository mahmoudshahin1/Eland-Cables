import { InquiryProcessCode } from '@prisma/client';
import {
  readInquiryProcessFromMetadata,
  SYSTEM_DEFAULT_INQUIRY_PROCESS,
} from './inquiryProcessResolver';

export interface InquiryProcessCarrier {
  commercialMetadata?: unknown;
}

export function getInquiryProcessCode(inquiry: InquiryProcessCarrier): InquiryProcessCode {
  const resolved = readInquiryProcessFromMetadata(inquiry.commercialMetadata);
  return resolved?.processCode ?? SYSTEM_DEFAULT_INQUIRY_PROCESS.processCode;
}

export function canSubmitInquiry(inquiry: InquiryProcessCarrier): boolean {
  return getInquiryProcessCode(inquiry) === 'STANDARD_WORKFLOW';
}

export function canCalculateInquiry(inquiry: InquiryProcessCarrier): boolean {
  return getInquiryProcessCode(inquiry) === 'VIP_FAST_TRACK';
}

export function assertVipCalculateAllowed(inquiry: InquiryProcessCarrier): void {
  if (!canCalculateInquiry(inquiry)) {
    const err = new Error(
      'CALCULATE is only available for VIP Fast Track inquiries. This inquiry uses Standard Workflow — use SUBMIT instead.'
    ) as Error & { code: string };
    err.code = 'INQUIRY_PROCESS_ACTION_DENIED';
    throw err;
  }
}

export function assertStandardSubmitAllowed(inquiry: InquiryProcessCarrier): void {
  if (!canSubmitInquiry(inquiry)) {
    const err = new Error(
      'SUBMIT is only available for Standard Workflow inquiries. This inquiry uses VIP Fast Track — use CALCULATE instead.'
    ) as Error & { code: string };
    err.code = 'INQUIRY_PROCESS_ACTION_DENIED';
    throw err;
  }
}
