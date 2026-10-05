import { writeAudit, requirePrisma } from './identityService';
import type { RequestActor } from './auth';
import { getInquiryById } from './commercialRepository';
import { assertCanAccessInquiryOwnership } from './rbac';
import { canViewInternalInquiryCosts, projectInquiryForActor } from './commercialProjection';
import {
  CUSTOMER_HIDDEN_INQUIRY_EXPORT_FIELDS,
  expandInquiryDrumScheduleRows,
  formatInquiryCuttingLengthDisplay,
  formatInquiryDrumCodes,
  formatInquiryDrumDescriptions,
  inquiryLineTotalLengthMeters,
} from '../domain/inquiryLineExcelExport';
import { issue } from '../platform/errors/domainError';
import {
  appendFrozenSheet,
  createWorkbook,
  excelDate,
  excelNumber,
  workbookToBuffer,
} from './excelWorkbook';

export async function exportInquiryExcel(inquiryId: string, actor: RequestActor) {
  const inquiry = await getInquiryById(inquiryId);
  if (!inquiry) throw issue('NOT_FOUND', 'Inquiry not found.');
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  const projected = projectInquiryForActor(inquiry, actor);
  const includeInternal = canViewInternalInquiryCosts(actor);
  const prisma = requirePrisma();
  const drums = await prisma.drumMaster.findMany({ select: { drumCode: true, description: true } });
  const drumsByCode = new Map(drums.map((row) => [row.drumCode, row]));
  const lines = Array.isArray(projected.lines) ? projected.lines : [];
  const meta =
    projected.commercialMetadata && typeof projected.commercialMetadata === 'object'
      ? (projected.commercialMetadata as Record<string, unknown>)
      : {};
  const destination =
    String(meta.destinationPortCode || meta.deliveryDestination || '').trim() || null;
  const quotationStatus =
    Array.isArray(projected.quotations) && projected.quotations.length
      ? String((projected.quotations[0] as { status?: string }).status || '')
      : '';

  const lineHeaders = [
    'Inquiry Number',
    'Line Number',
    'Customer',
    'Cable Material Number',
    'Cable Description',
    'Cable Family',
    'Voltage',
    'Conductor',
    'Size',
    'Core Count',
    'Number of Drums',
    'Cutting Length',
    'Total Length',
    'Drum Codes',
    'Drum Descriptions',
    'Shipment/Destination',
    'Incoterm',
    'Line Status',
    'Engineering Status',
    'Quotation Status',
  ];
  if (includeInternal) {
    lineHeaders.push('Costing Status', 'Pricing Status');
  }

  const lineRows = lines.map((line) => {
    const payload =
      line.configurationPayload && typeof line.configurationPayload === 'object'
        ? (line.configurationPayload as Record<string, unknown>)
        : {};
    const row: Array<string | number | boolean | Date | null> = [
      projected.inquiryNumber as string,
      excelNumber(line.lineNumber),
      projected.customerName as string,
      (line.materialNumber as string) || null,
      (line.cableDescription as string) || null,
      String(payload.family || payload.cableFamily || '') || null,
      String(payload.voltage || payload.voltageClass || '') || null,
      String(payload.conductor || '') || null,
      String(payload.conductorSize || payload.size || '') || null,
      String(payload.cores || payload.coreCount || '') || null,
      excelNumber(line.requestedQuantity),
      formatInquiryCuttingLengthDisplay(line),
      inquiryLineTotalLengthMeters(line),
      formatInquiryDrumCodes(line),
      formatInquiryDrumDescriptions(line, drumsByCode),
      destination,
      (projected.incoterms as string) || null,
      (line.status as string) || null,
      (line.cableAuthorityStatus as string) || null,
      quotationStatus || null,
    ];
    if (includeInternal) {
      row.push(
        (line.costingReadinessStatus as string) || null,
        (line.commercialPricingStatus as string) || null
      );
    }
    for (const hidden of CUSTOMER_HIDDEN_INQUIRY_EXPORT_FIELDS) {
      if (!includeInternal && hidden in line) {
        // projected inquiry already stripped these; keep the export contract explicit.
      }
    }
    return row;
  });

  const scheduleRows = lines.flatMap((line) =>
    expandInquiryDrumScheduleRows(line).map((row) => [
      projected.inquiryNumber as string,
      excelNumber(row.lineNumber),
      row.drumCode,
      excelNumber(row.noOfDrums),
      excelNumber(row.cuttingLengthM),
    ])
  );

  const wb = createWorkbook();
  appendFrozenSheet(
    wb,
    'Inquiry_Header',
    [
      'Inquiry Number',
      'Customer',
      'Customer Reference',
      'Status',
      'Currency',
      'Incoterm',
      'Payment Terms',
      'Destination',
      'Inquiry Date',
      'Requested Delivery Date',
    ],
    [
      [
        projected.inquiryNumber as string,
        projected.customerName as string,
        (projected.customerReference as string) || null,
        projected.status as string,
        projected.currency as string,
        (projected.incoterms as string) || null,
        (projected.paymentTerms as string) || null,
        destination,
        excelDate(projected.inquiryDate as Date | string),
        excelDate(projected.requestedDeliveryDate as Date | string | null),
      ],
    ]
  );
  appendFrozenSheet(wb, 'Inquiry_Lines', lineHeaders, lineRows);
  appendFrozenSheet(
    wb,
    'Drum_Schedule',
    ['Inquiry Number', 'Line Number', 'Drum Code', 'Number of Drums', 'Cutting Length M'],
    scheduleRows
  );
  appendFrozenSheet(
    wb,
    'Delivery',
    ['Inquiry Number', 'Customer', 'Country / Destination', 'Destination Port', 'Incoterm'],
    [
      [
        projected.inquiryNumber as string,
        projected.customerName as string,
        String(meta.deliveryDestination || '') || null,
        String(meta.destinationPortCode || '') || null,
        (projected.incoterms as string) || null,
      ],
    ]
  );

  await writeAudit({
    actor,
    entity: 'Export',
    entityId: inquiry.id,
    action: 'EXPORT_EXCEL',
    newValue: {
      entity: 'inquiry',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      lineCount: lines.length,
      includeInternal,
      scope: actor.userType,
    },
    message: `Exported inquiry ${inquiry.inquiryNumber}`,
  });

  return {
    buffer: workbookToBuffer(wb),
    filename: `Inquiry_${String(inquiry.inquiryNumber).replace(/[^\w.-]+/g, '_')}.xlsx`,
    lineCount: lines.length,
    includeInternal,
  };
}
