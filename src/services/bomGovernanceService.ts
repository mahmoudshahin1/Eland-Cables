import { BomInvestigationStatus } from '@prisma/client';

export const BOM_INVESTIGATION_STATUSES: BomInvestigationStatus[] = [
  'BUSINESS_DECISION_REQUIRED',
  'ASSIGNED',
  'UNDER_REVIEW',
  'DECISION_REQUIRED',
  'RESOLVED',
  'APPROVED',
  'REJECTED',
];

export const CONTROLLED_BOM_DECISION_CATEGORIES = [
  'TRUE_DUPLICATE',
  'DIFFERENT_BOM_VERSION',
  'DIFFERENT_PLANT',
  'DIFFERENT_ROUTE',
  'ALTERNATIVE_CONSUMPTION',
  'EFFECTIVE_DATE_DIFFERENCE',
  'MANUFACTURING_CONDITION',
  'SOURCE_DATA_ERROR',
  'INSUFFICIENT_INFORMATION',
  'OTHER',
  'BUSINESS_DECISION_REQUIRED',
] as const;

export type ControlledBomDecisionCategory = (typeof CONTROLLED_BOM_DECISION_CATEGORIES)[number];

export interface BomConflictEvidenceItem {
  sourceFile: string;
  sourceWorksheet: string;
  sourceRowNumber: number;
  cableMaterialNumber: string;
  itemCode?: string;
  customerCode?: string;
  rawMaterialCode: string;
  weight: number;
  uom: string;
}

export interface BomInvestigationInput {
  decisionCategory: ControlledBomDecisionCategory;
  comment: string;
  selectedWeight?: number;
  governedUom?: string;
  bomVersion?: number;
  plant?: string;
  manufacturingRoute?: string;
  machine?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export function validateBomInvestigationDecision(input: BomInvestigationInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input.decisionCategory || !CONTROLLED_BOM_DECISION_CATEGORIES.includes(input.decisionCategory)) {
    errors.push(`Invalid decision category: ${input.decisionCategory}`);
  }

  if (!input.comment || !input.comment.trim()) {
    errors.push('Comment / justification is mandatory for all BOM governance decisions.');
  }

  // Check category-specific evidence prerequisites
  if (input.decisionCategory === 'DIFFERENT_PLANT' && (!input.plant || !input.plant.trim())) {
    errors.push('Plant specification is mandatory when classifying as DIFFERENT_PLANT.');
  }

  if (input.decisionCategory === 'DIFFERENT_BOM_VERSION' && (input.bomVersion == null || input.bomVersion <= 0)) {
    errors.push('BOM Version number (> 0) is mandatory when classifying as DIFFERENT_BOM_VERSION.');
  }

  if (input.decisionCategory === 'DIFFERENT_ROUTE' && (!input.manufacturingRoute || !input.manufacturingRoute.trim())) {
    errors.push('Manufacturing Route specification is mandatory when classifying as DIFFERENT_ROUTE.');
  }

  if (input.decisionCategory === 'EFFECTIVE_DATE_DIFFERENCE' && !input.effectiveFrom) {
    errors.push('Effective From date is mandatory when classifying as EFFECTIVE_DATE_DIFFERENCE.');
  }

  if (input.selectedWeight != null && input.selectedWeight <= 0) {
    errors.push('Selected governed weight must be greater than zero.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateBomWorkflowTransition(
  currentStatus: BomInvestigationStatus,
  targetStatus: BomInvestigationStatus
): { valid: boolean; error?: string } {
  if (currentStatus === targetStatus) return { valid: true };

  const allowed: Record<BomInvestigationStatus, BomInvestigationStatus[]> = {
    BUSINESS_DECISION_REQUIRED: ['ASSIGNED', 'UNDER_REVIEW', 'DECISION_REQUIRED', 'RESOLVED', 'REJECTED'],
    ASSIGNED: ['UNDER_REVIEW', 'DECISION_REQUIRED', 'BUSINESS_DECISION_REQUIRED', 'REJECTED'],
    UNDER_REVIEW: ['DECISION_REQUIRED', 'RESOLVED', 'ASSIGNED', 'BUSINESS_DECISION_REQUIRED', 'REJECTED'],
    DECISION_REQUIRED: ['RESOLVED', 'UNDER_REVIEW', 'REJECTED', 'BUSINESS_DECISION_REQUIRED'],
    RESOLVED: ['APPROVED', 'REJECTED', 'UNDER_REVIEW', 'BUSINESS_DECISION_REQUIRED'],
    APPROVED: ['UNDER_REVIEW', 'BUSINESS_DECISION_REQUIRED'], // Reopen
    REJECTED: ['UNDER_REVIEW', 'BUSINESS_DECISION_REQUIRED'], // Reopen
  };

  const targets = allowed[currentStatus] || [];
  if (!targets.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid BOM workflow transition from ${currentStatus} to ${targetStatus}.`,
    };
  }

  return { valid: true };
}

export interface CableCostingReadiness {
  materialNumber: string;
  cableDescription: string;
  engineeringStatus: 'APPROVED' | 'PARTIAL' | 'DRAFT' | 'MISSING' | 'CONFIG_REQUIRED';
  bomStatus: 'RESOLVED' | 'CONFLICT_UNRESOLVED' | 'NO_BOM' | 'NOT_READY';
  rmPriceStatus: 'ALL_PRICED' | 'PRICE_NOT_CONFIGURED' | 'MISSING_METADATA';
  overallStatus: 'READY_FOR_COSTING' | 'UNDER_REVIEW' | 'DATA_ISSUE' | 'NOT_READY';
  blockingReasons: string[];
}
