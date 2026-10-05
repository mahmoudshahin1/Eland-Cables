import type { V2InquiryDto, V2InquiryLineDto } from './v2InquiryConfigurationApiService';
import type { V2QuotationDto } from './v2QuotationApiService';

export type CustomerJourneyStageId =
  | 'inquiry'
  | 'configuration'
  | 'cutting'
  | 'drum'
  | 'engineering'
  | 'commercial'
  | 'quotation'
  | 'commitment'
  | 'fulfillment';

export type CustomerJourneyStageState =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'waiting'
  | 'ready'
  | 'complete';

export interface CustomerJourneyStage {
  id: CustomerJourneyStageId;
  label: string;
  state: CustomerJourneyStageState;
  statusLabel: string;
  detail?: string;
}

export interface CustomerInquiryJourney {
  inquiryId: string;
  inquiryNumber: string;
  inquiryStatus: string;
  headline: string;
  nextAction: string;
  stages: CustomerJourneyStage[];
  activeStageId: CustomerJourneyStageId;
  canConfigure: boolean;
  canSubmit: boolean;
  quotationIssued: boolean;
  commitmentActive: boolean;
}

export interface CustomerCommitmentSummary {
  id: string;
  commitmentNumber: string;
  status: string;
  fulfillmentType?: string | null;
}

export interface CustomerFulfillmentSummary {
  salesOrderCount: number;
  agreementCount: number;
  releaseCount: number;
  hasActiveDocuments: boolean;
}

function primaryLine(inquiry: V2InquiryDto): V2InquiryLineDto | null {
  return inquiry.lines[0] ?? null;
}

function lineHasImportedCatalogAuthority(line: V2InquiryLineDto | null): boolean {
  if (!line?.materialNumber) return false;
  const authority = String(line.cableAuthorityStatus || '').toUpperCase();
  const status = String(line.status || '').toUpperCase();
  return (
    authority === 'EXISTING_CABLE' ||
    status === 'CABLE_VALIDATED' ||
    status === 'COSTING_READY'
  );
}

function lineHasCutting(line: V2InquiryLineDto | null): boolean {
  return Boolean(line?.v2CurrentCuttingPlanId || line?.currentCuttingPlan);
}

function lineHasDrum(line: V2InquiryLineDto | null): boolean {
  return Boolean(line?.v2CurrentDrumPlanId || line?.currentDrumPlan);
}

function drumConfirmed(line: V2InquiryLineDto | null): boolean {
  return line?.currentDrumPlan?.lifecycleStatus === 'CONFIRMED';
}

function bomBlocked(line: V2InquiryLineDto | null): boolean {
  const snap = line?.snapshots?.[0];
  return Boolean(snap?.bomGovernanceBlocked);
}

function engineeringBlocked(inquiry: V2InquiryDto, line: V2InquiryLineDto | null): boolean {
  if (inquiry.status === 'ENGINEERING_BLOCKED') return true;
  const snap = line?.snapshots?.[0];
  return snap?.engineeringStatus === 'ENGINEERING_BLOCKED';
}

export function mapInquiryStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'SUBMITTED':
      return 'Submitted';
    case 'ENGINEERING_REVIEW':
      return 'Engineering Review';
    case 'ENGINEERING_BLOCKED':
      return 'Engineering Blocked';
    case 'READY_FOR_COMMERCIAL':
      return 'Ready for Commercial';
    case 'QUOTED':
      return 'Quotation Issued';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function buildCustomerInquiryJourney(
  inquiry: V2InquiryDto,
  quotation?: V2QuotationDto | null,
  commitment?: CustomerCommitmentSummary | null,
  fulfillment?: CustomerFulfillmentSummary | null
): CustomerInquiryJourney {
  const line = primaryLine(inquiry);
  const importedCatalog = lineHasImportedCatalogAuthority(line);
  const hasSnapshot = Boolean(line?.v2CurrentSnapshotId || line?.snapshots?.length) || importedCatalog;
  const hasCutting = lineHasCutting(line);
  const hasDrum = lineHasDrum(line);
  const drumOk = drumConfirmed(line);
  const bomBlock = bomBlocked(line);
  const engBlock = engineeringBlocked(inquiry, line);
  const submitted = inquiry.status !== 'DRAFT';
  const quotationIssued = Boolean(quotation?.issuedAt);
  const commitmentActive = Boolean(commitment && ['ACTIVE', 'COMPLETED'].includes(commitment.status));
  const fulfillmentStarted = Boolean(
    fulfillment?.hasActiveDocuments ||
      (fulfillment?.salesOrderCount ?? 0) > 0 ||
      (fulfillment?.agreementCount ?? 0) > 0
  );
  const fulfillmentComplete = Boolean(
    commitment?.status === 'COMPLETED' && (fulfillmentStarted || commitmentActive)
  );

  const configurationState: CustomerJourneyStageState = !line
    ? 'not_started'
    : !hasSnapshot
      ? 'in_progress'
      : bomBlock
        ? 'blocked'
        : 'complete';

  const cuttingState: CustomerJourneyStageState = !hasSnapshot
    ? 'not_started'
    : !hasCutting
      ? submitted
        ? 'in_progress'
        : 'not_started'
      : 'complete';

  const drumState: CustomerJourneyStageState = !hasCutting
    ? 'not_started'
    : !hasDrum
      ? 'in_progress'
      : drumOk
        ? 'complete'
        : 'in_progress';

  const engineeringState: CustomerJourneyStageState = importedCatalog && !engBlock
    ? 'complete'
    : !submitted
      ? 'not_started'
      : engBlock
        ? 'blocked'
        : ['ENGINEERING_REVIEW', 'SUBMITTED'].includes(inquiry.status)
          ? 'waiting'
          : ['READY_FOR_COMMERCIAL', 'QUOTED'].includes(inquiry.status)
            ? 'complete'
            : 'in_progress';

  const commercialState: CustomerJourneyStageState = !drumOk
    ? 'not_started'
    : engBlock
      ? 'blocked'
      : inquiry.status === 'READY_FOR_COMMERCIAL' || quotation
        ? quotation?.commercialPricingStatus === 'PRICING_APPROVED' || quotationIssued
          ? 'complete'
          : 'waiting'
        : 'waiting';

  const quotationState: CustomerJourneyStageState = !quotation
    ? commercialState === 'complete' || inquiry.status === 'QUOTED'
      ? 'waiting'
      : 'not_started'
    : quotationIssued
      ? 'complete'
      : 'waiting';

  const commitmentState: CustomerJourneyStageState = !quotationIssued
    ? 'not_started'
    : commitmentActive
      ? 'complete'
      : 'ready';

  const fulfillmentState: CustomerJourneyStageState = !commitmentActive
    ? 'not_started'
    : fulfillmentComplete
      ? 'complete'
      : fulfillmentStarted
        ? 'in_progress'
        : 'waiting';

  const stages: CustomerJourneyStage[] = [
    {
      id: 'inquiry',
      label: 'Inquiry',
      state: inquiry.status === 'DRAFT' && !line ? 'in_progress' : 'complete',
      statusLabel: inquiry.status === 'DRAFT' && !line ? 'Draft' : 'Created',
    },
    {
      id: 'configuration',
      label: 'Cable Config',
      state: configurationState,
      statusLabel:
        configurationState === 'complete'
          ? importedCatalog
            ? 'Imported Cable Master'
            : 'Snapshot Saved'
          : configurationState === 'blocked'
            ? 'Engineering Blocked'
            : configurationState === 'in_progress'
              ? 'Configure Cable'
              : 'Not Started',
      detail: bomBlock ? 'Engineering review required before commercial steps.' : undefined,
    },
    {
      id: 'cutting',
      label: 'Cutting Plan',
      state: cuttingState,
      statusLabel:
        cuttingState === 'complete'
          ? 'Plan Saved'
          : cuttingState === 'in_progress'
            ? 'Add Cutting Length'
            : 'Not Started',
    },
    {
      id: 'drum',
      label: 'Drum Plan',
      state: drumState,
      statusLabel:
        drumState === 'complete'
          ? 'Drums Confirmed'
          : drumState === 'in_progress'
            ? 'Select Drums'
            : 'Not Started',
    },
    {
      id: 'engineering',
      label: 'Engineering',
      state: engineeringState,
      statusLabel:
        engineeringState === 'blocked'
          ? 'Blocked'
          : engineeringState === 'waiting'
            ? 'Under Review'
            : engineeringState === 'complete'
              ? importedCatalog
                ? 'PASS'
                : 'Cleared'
              : 'Pending Submit',
    },
    {
      id: 'commercial',
      label: 'Commercial Pricing',
      state: commercialState,
      statusLabel:
        commercialState === 'complete'
          ? 'Pricing Ready'
          : commercialState === 'waiting'
            ? 'Energya Processing'
            : commercialState === 'blocked'
              ? 'Costing Blocked'
              : 'Not Started',
    },
    {
      id: 'quotation',
      label: 'Quotation',
      state: quotationState,
      statusLabel: quotationIssued
        ? 'Issued'
        : quotation
          ? 'In Preparation'
          : 'Not Ready',
      detail: quotation?.validUntil
        ? `Valid until ${new Date(quotation.validUntil).toLocaleDateString()}`
        : undefined,
    },
    {
      id: 'commitment',
      label: 'Commitment',
      state: commitmentState,
      statusLabel: commitmentActive
        ? commitment!.status
        : quotationIssued
          ? 'Ready to Commit'
          : 'Awaiting Quotation',
    },
    {
      id: 'fulfillment',
      label: 'Fulfillment',
      state: fulfillmentState,
      statusLabel: fulfillmentComplete
        ? 'Fulfilled'
        : fulfillmentStarted
          ? 'In Progress'
          : commitmentActive
            ? 'Awaiting Energya'
            : 'Not Started',
      detail:
        fulfillmentStarted && fulfillment
          ? `${fulfillment.salesOrderCount} SO · ${fulfillment.agreementCount} agreement · ${fulfillment.releaseCount} release`
          : undefined,
    },
  ];

  const activeStageId =
    stages.find((s) => ['in_progress', 'blocked', 'ready', 'waiting'].includes(s.state))?.id ??
    (fulfillmentComplete ? 'fulfillment' : commitmentActive ? 'commitment' : quotationIssued ? 'quotation' : 'configuration');

  let nextAction = 'Continue your cable configuration.';
  if (!line) nextAction = 'Add a cable line to this inquiry.';
  else if (!hasSnapshot) nextAction = 'Complete cable parameters and save a configuration snapshot.';
  else if (!hasCutting) nextAction = 'Define cutting lengths for your cable line.';
  else if (!drumOk) nextAction = 'Confirm a drum plan for dispatch-ready lengths.';
  else if (!submitted) nextAction = 'Submit the inquiry for Energya engineering review.';
  else if (engBlock) nextAction = 'Engineering review is in progress. You will be notified when cleared.';
  else if (!quotationIssued) nextAction = 'Energya is preparing your commercial quotation.';
  else if (!commitmentActive) nextAction = 'Review your issued quotation and start a commercial commitment.';
  else if (!fulfillmentStarted) nextAction = 'Your commitment is active. Energya is preparing fulfillment documents.';
  else if (!fulfillmentComplete) nextAction = 'Fulfillment is in progress. Track sales orders and releases below.';
  else nextAction = 'Your order fulfillment is complete for this commitment.';

  const headline = mapInquiryStatusLabel(inquiry.status);

  return {
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    inquiryStatus: inquiry.status,
    headline,
    nextAction,
    stages,
    activeStageId,
    canConfigure: inquiry.status === 'DRAFT' || inquiry.status === 'SUBMITTED',
    canSubmit: inquiry.status === 'DRAFT' && hasSnapshot && hasCutting && drumOk && !bomBlock,
    quotationIssued,
    commitmentActive,
  };
}

export function sanitizeCustomerQuotation(quotation: V2QuotationDto): V2QuotationDto {
  return {
    ...quotation,
    commercialPricingStatus: quotation.issuedAt ? quotation.commercialOfferStatus || 'ISSUED' : quotation.commercialPricingStatus,
    lines: quotation.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemDescription: line.itemDescription,
      plannedLengthM: line.plannedLengthM,
      sellingPrice: line.sellingPrice,
      v2DrumPlanId: undefined,
      costingCalculationId: undefined,
    })),
  };
}
