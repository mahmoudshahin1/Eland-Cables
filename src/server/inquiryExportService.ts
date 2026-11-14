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
import { resolveInquiryCommercialTotals, resolveSubmittedProductsTotal } from '../domain/inquiryGrandTotal';
import {
  appendAoaSheet,
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
        ((line as { commercialPricingStatus?: string | null }).commercialPricingStatus as string) || null
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

  const headerFields = [
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
  ];
  const headerValues = [
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
  ];
  const sheetRows: Array<Array<string | number | boolean | Date | null>> = [
    ['Inquiry Summary'],
    headerFields,
    headerValues,
    [],
    ['Cable Lines'],
    lineHeaders,
    ...lineRows,
    [],
    ['Drum Schedule'],
    ['Inquiry Number', 'Line Number', 'Drum Code', 'Number of Drums', 'Cutting Length M'],
    ...scheduleRows,
  ];
  const wb = createWorkbook();
  const productsTotal = resolveSubmittedProductsTotal({
    commercialProductsTotal: (projected as { commercialProductsTotal?: number | null }).commercialProductsTotal,
    lines: lines.map((line) => {
      const priced = line as {
        commercialLineTotal?: number | string | null;
        sellingPrice?: number | string | null;
      };
      return includeInternal
        ? { commercialLineTotal: priced.commercialLineTotal, sellingPrice: priced.sellingPrice }
        : { commercialLineTotal: priced.commercialLineTotal };
    }),
  });
  const containerType = String(meta.preferredContainerType || '40HQ');
  const totals = resolveInquiryCommercialTotals({
    productsTotal,
    containerType,
    destination,
    containerCount: 1,
  });
  const studies = await prisma.containerStudy.findMany({
    where: { inquiryId: inquiry.id },
    orderBy: [{ versionNo: 'desc' }],
    select: {
      studyNumber: true,
      versionNo: true,
      status: true,
      stuffingMethod: true,
      currentResult: {
        select: {
          containers: {
            orderBy: { containerIndex: 'asc' },
            select: {
              containerIndex: true,
              typeCode: true,
              usableLengthMm: true,
              loadedWeightKg: true,
              remainingLengthMm: true,
              utilizationLengthPct: true,
            },
          },
        },
      },
    },
  });
  const studyRows = studies.flatMap((study) => {
    const containers = study.currentResult?.containers || [];
    if (containers.length === 0) {
      return [[
        projected.inquiryNumber as string,
        study.studyNumber,
        excelNumber(study.versionNo),
        study.status,
        study.stuffingMethod,
        null,
        null,
        null,
        null,
        null,
        null,
      ]];
    }
    return containers.map((container) => [
      projected.inquiryNumber as string,
      study.studyNumber,
      excelNumber(study.versionNo),
      study.status,
      study.stuffingMethod,
      excelNumber(container.containerIndex),
      container.typeCode,
      excelNumber(container.usableLengthMm),
      excelNumber(container.loadedWeightKg),
      excelNumber(container.remainingLengthMm),
      excelNumber(container.utilizationLengthPct),
    ]);
  });

  sheetRows.push(
    [],
    ['Commercial Totals'],
    ['Inquiry Number', 'Currency', 'Products Subtotal', 'Sea Freight', 'Grand Total', 'Container Type', 'Destination'],
    [
      projected.inquiryNumber as string,
      projected.currency as string,
      excelNumber(totals.productsTotal),
      excelNumber(totals.freightTotal),
      excelNumber(totals.grandTotal),
      containerType,
      destination,
    ],
    [],
    ['Container Study'],
    [
      'Inquiry Number',
      'Study Number',
      'Version',
      'Status',
      'Stuffing Method',
      'Container Index',
      'Container Type',
      'Usable Length mm',
      'Loaded Weight kg',
      'Remaining Length mm',
      'Length Utilization %',
    ],
    ...studyRows,
    [],
    ['Delivery'],
    ['Inquiry Number', 'Customer', 'Country / Destination', 'Destination Port', 'Incoterm'],
    [
      projected.inquiryNumber as string,
      projected.customerName as string,
      String(meta.deliveryDestination || '') || null,
      String(meta.destinationPortCode || '') || null,
      (projected.incoterms as string) || null,
    ]
  );
  appendAoaSheet(wb, 'Inquiry', sheetRows);

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
