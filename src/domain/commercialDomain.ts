import {
  InquiryStatus,
  InquiryLineStatus,
  QuotationStatus,
} from '@prisma/client';
import { CableDecision, CableConfigInput } from './cableAuthority';
import { InquiryDrumSchedule } from './inquiryDrumSchedule';

export interface CreateInquiryInput {
  customerId?: string;
  customerName?: string;
  contactPerson?: string;
  customerReference?: string;
  inquiryDate?: string | Date;
  requestedDeliveryDate?: string | Date;
  currency?: string;
  incoterms?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  projectName?: string;
  notes?: string;
  salesAgent?: string;
  quotationOwner?: string;
  commercialMetadata?: Record<string, unknown>;
}

export interface UpdateInquiryInput {
  customerName?: string;
  contactPerson?: string;
  customerReference?: string;
  inquiryDate?: string | Date;
  requestedDeliveryDate?: string | Date;
  currency?: string;
  incoterms?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  projectName?: string;
  notes?: string;
  salesAgent?: string;
  quotationOwner?: string;
  commercialMetadata?: Record<string, unknown>;
}

export interface UpdateInquiryLineInput {
  materialNumber?: string | null;
  customerCode?: string;
  itemCode?: string;
  cableDescription?: string;
  requestedQuantity?: number;
  quantityUom?: string;
  requestedLengthMeters?: number;
  cuttingLengthMeters?: number;
  drumType?: string;
  cableTolerancePercent?: number;
  drumSchedule?: InquiryDrumSchedule | null;
  configurationPayload?: CableConfigInput | null;
  notes?: string;
  lineNumber?: number;
}

export interface AddInquiryLineInput {
  materialNumber?: string;
  customerCode?: string;
  itemCode?: string;
  cableDescription?: string;
  requestedQuantity?: number;
  quantityUom?: string;
  requestedLengthMeters?: number;
  cuttingLengthMeters?: number;
  drumType?: string;
  cableTolerancePercent?: number;
  drumSchedule?: InquiryDrumSchedule | null;
  configurationPayload?: CableConfigInput | null;
  notes?: string;
}

export interface CreateQuotationInput {
  inquiryId: string;
  quotationNumber?: string;
  currency?: string;
  incoterms?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  validUntil?: string | Date;
  remarks?: string;
}

export interface LineCableValidationSummary {
  cableAuthorityStatus: string;
  materialNumber?: string;
  isExistingCable: boolean;
  technicalOfficeRequired: boolean;
  technicalOfficeRequestId?: string;
  costingReadinessStatus: string;
  materialCost?: number | null;
  materialCostCurrency?: string;
  blockingReasons: string[];
}
