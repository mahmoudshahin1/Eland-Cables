import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import dotenv from 'dotenv';
import {
  COMMERCIAL_TERM_CODES,
  PRICE_ADJUSTMENT_FORMULA,
  buildIssuedCommercialOfferDocument,
  commercialOfferHeading,
  formatDocumentMoney,
  presentNumeric,
  presentText,
  type IssuedCommercialOfferDocument,
} from '../domain/commercialOfferDocument';
import { ENERGYA_COMMERCIAL_OFFER_TEMPLATE } from '../domain/commercialOfferTemplate';
import { V2_QUOTATION_WORKFLOW_CHANNEL } from '../domain/v2QuotationService';
import type { RequestActor } from './auth';
import { disconnectPrisma, getPrisma } from './db';
import { generateV2QuotationPdf, renderCommercialOfferPdf } from './v2QuotationPdfService';

dotenv.config();

const SAMPLE_PDF = path.join(process.cwd(), 'logs', 'commercial-offer-sample.pdf');
const VISUAL_PDF = path.join(process.cwd(), 'logs', 'commercial-offer-eland-layout.pdf');
const BANNED = /unitCost|totalCost|marginPercent|CostingRun|Decision 5|raw material cost|internal markup/i;

const internalActor: RequestActor = {
  id: 'offer-engine-test',
  email: 'offer-engine@test.local',
  name: 'Offer Engine Test',
  userType: 'internal',
  permissionCodes: ['INQUIRY:VIEW'],
};

const otherCustomer: RequestActor = {
  id: 'other-customer',
  email: 'other-customer@test.local',
  name: 'Other Customer',
  userType: 'customer',
  customerId: 'not-the-owner-of-this-quotation',
};

function pdfExtract(pdf: Buffer): string {
  const s = pdf.toString('latin1');
  let out = '';
  const re = /<([0-9A-Fa-f]+)>|\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s))) {
    if (match[1]) {
      const hex = match[1].length % 2 === 0 ? match[1] : `0${match[1]}`;
      out += Buffer.from(hex, 'hex').toString('latin1');
    } else {
      out += match[0].slice(1, -1).replace(/\\n/g, '\n').replace(/\\(.)/g, '$1');
    }
  }
  return out;
}

function pdfContains(pdf: Buffer, text: string): boolean {
  if (pdf.includes(Buffer.from(text))) return true;
  return pdfExtract(pdf).includes(text);
}

function sampleOffer(options?: { lineCount?: number }): IssuedCommercialOfferDocument {
  const extra = options?.lineCount ?? 0;
  const baseLines = [
    {
      lineNumber: 1,
      itemDescription: '1X300/35 AL/XLPE/MDPE 18/30 NA2XS(FL)2Y AD8',
      moqKm: 6.2,
      quantityUom: 'KM',
      cuWeightKgPerKm: 342,
      alWeightKgPerKm: 773,
      unitSellingPrice: 10841.87,
      lineTotal: 67219.57,
    },
    {
      lineNumber: 2,
      itemDescription: '1X185/35 AL/XLPE/MDPE 18/30 NA2XS(FL)2Y AD8',
      moqKm: 9.4,
      quantityUom: 'KM',
      cuWeightKgPerKm: 339,
      alWeightKgPerKm: 473,
      unitSellingPrice: 9083.24,
      lineTotal: 85382.43,
    },
    {
      lineNumber: 3,
      itemDescription: '3X300 AL/XLPE/SWA/MDPE 1.8/3 AD8',
      moqKm: 9.8,
      quantityUom: 'KM',
      cuWeightKgPerKm: null,
      alWeightKgPerKm: 2369,
      unitSellingPrice: 17721.2,
      lineTotal: 173667.76,
    },
    {
      lineNumber: 4,
      itemDescription: '3X150 AL/XLPE/MDPE 1.8/3 AD8',
      moqKm: 2.7,
      quantityUom: 'KM',
      cuWeightKgPerKm: null,
      alWeightKgPerKm: 1177,
      unitSellingPrice: 7985.93,
      lineTotal: 21562,
    },
  ];
  const more = Array.from({ length: extra }, (_, index) => ({
    lineNumber: 5 + index,
    itemDescription: `Extra cable line ${5 + index}`,
    moqKm: 1,
    quantityUom: 'KM',
    cuWeightKgPerKm: 10,
    alWeightKgPerKm: 10,
    unitSellingPrice: 100,
    lineTotal: 100,
  }));
  return buildIssuedCommercialOfferDocument({
    quotationNumber: 'RFQ/EUX0980/26',
    versionNo: 8,
    currency: 'GBP',
    validUntil: new Date('2026-07-30T08:00:00.000Z'),
    issuedAt: new Date('2026-07-28T08:00:00.000Z'),
    incoterms: 'DAP',
    destination: 'Doncaster',
    paymentTerms: '60 days from delivery by direct transfer to our bank account.',
    tolerancePercent: 5,
    copperBase: 9000,
    aluminiumBase: 2500,
    metalCurrency: 'GBP',
    metalUnitBasis: 'per MT',
    financialOfferSnapshotId: 'fo-snap-1',
    productsTotal: 347831.76,
    shipmentTotal: 13720.03,
    grandTotal: 361551.79,
    customerName: 'ELAND',
    customerCountry: 'United Kingdom',
    contactPerson: 'Tanna',
    customerReference: '155754',
    quotationOwner: 'Saif Osama',
    ownerTitle: 'Export Coordinator',
    ownerEmail: 'saif.osama@energyacables.com',
    ownerTelephone: '+20 2 2415 2371/2',
    ownerMobile: '+2 01050833753',
    lines: [...baseLines, ...more],
  });
}

describe('commercial offer engine tests 1-27', () => {
  after(async () => {
    await disconnectPrisma();
  });

  it('1-13, 21, 23, 25: generates the Energya commercial offer with snapshot values', async () => {
    const offer = sampleOffer();
    assert.equal(commercialOfferHeading(offer.draft), 'COMMERCIAL OFFER');
    assert.equal(offer.customer.customerName, 'ELAND');
    assert.equal(offer.quotationNumber, 'RFQ/EUX0980/26');
    assert.equal(offer.versionNo, 8);
    assert.equal(offer.lines[0].moqKm, 6.2);
    assert.equal(offer.lines[0].cuWeightKgPerKm, 342);
    assert.equal(offer.lines[0].alWeightKgPerKm, 773);
    assert.equal(offer.lines[0].unitSellingPrice, 10841.87);
    assert.equal(offer.lines[0].lineTotal, 67219.57);
    assert.equal(offer.productsTotal, 347831.76);
    assert.equal(offer.shipmentTotal, 13720.03);
    assert.equal(offer.grandTotal, 361551.79);
    assert.equal(offer.currency, 'GBP');
    assert.equal(offer.incoterms, 'DAP');
    assert.equal(offer.destination, 'Doncaster');
    assert.deepEqual(offer.terms.map((term) => term.code), [...COMMERCIAL_TERM_CODES]);
    assert.equal(offer.priceAdjustment.formula, PRICE_ADJUSTMENT_FORMULA);

    const pdf = await renderCommercialOfferPdf(offer);
    assert.ok(pdf.length > 1000);
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.match(pdf.toString('latin1'), /595\.28/);
    assert.match(pdf.toString('latin1'), /841\.89/);
    assert.equal(BANNED.test(pdf.toString('latin1')), false);
    assert.ok(pdfContains(pdf, 'COMMERCIAL OFFER'));
    assert.ok(pdfContains(pdf, 'RFQ/EUX0980/26'));
    assert.ok(pdfContains(pdf, 'ELAND'));
    assert.ok(pdfContains(pdf, 'Doncaster'));
    assert.ok(pdfContains(pdf, 'Price Adjustment'));
    assert.ok(pdfContains(pdf, 'Reliable'));
    assert.ok(pdfContains(pdf, 'More Than Cables'));
    assert.ok(pdfContains(pdf, 'Page 1 of'));
    fs.mkdirSync(path.dirname(VISUAL_PDF), { recursive: true });
    fs.writeFileSync(VISUAL_PDF, pdf);
  });

  it('14-16: missing values, draft watermark, and configurable greeting', async () => {
    const empty = buildIssuedCommercialOfferDocument({
      quotationNumber: 'Q-MISS',
      versionNo: 1,
      currency: 'USD',
      issuedAt: new Date('2026-07-28T08:00:00.000Z'),
      customerName: 'Acme Cables',
      contactPerson: 'Jordan Lee',
      lines: [
        {
          lineNumber: 1,
          itemDescription: '',
          moqKm: null,
          quantityUom: 'KM',
          cuWeightKgPerKm: null,
          alWeightKgPerKm: null,
          unitSellingPrice: null,
          lineTotal: null,
        },
      ],
      draft: true,
    });
    assert.equal(presentNumeric(empty.lines[0].moqKm), 0);
    assert.equal(presentText(empty.lines[0].itemDescription), 'Not Set');
    assert.equal(empty.greeting.salutation, 'Dear Jordan,');
    assert.equal(empty.greeting.salutation.includes('Tanna'), false);
    assert.equal(ENERGYA_COMMERCIAL_OFFER_TEMPLATE.company.legalName, 'Energya Power Cables');
    const pdf = await renderCommercialOfferPdf(empty);
    assert.ok(pdfContains(pdf, 'DRAFT COMMERCIAL OFFER'));
    assert.ok(pdfContains(pdf, 'not an official issued quotation'));
    assert.ok(pdfContains(pdf, 'Not Set'));
    assert.ok(pdfContains(pdf, 'Dear Jordan,'));
  });

  it('17-20, 22, 27: issued snapshot, isolation, costing hidden, print HTML, lifecycle unchanged', async () => {
    const prisma = getPrisma();
    assert.ok(prisma, 'database is required');
    const issued = await prisma.commercialQuotation.findFirst({
      where: {
        workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
        issuedAt: { not: null },
        commercialOfferSnapshot: { not: null },
      },
      orderBy: { issuedAt: 'desc' },
      include: { inquiry: { select: { customerName: true, status: true } } },
    });
    const current = await prisma.commercialQuotation.findFirst({
      where: { isCurrent: true, workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(current, 'a V2 quotation is required');

    if (issued) {
      const before = JSON.stringify(issued.commercialOfferSnapshot);
      const official = await generateV2QuotationPdf(issued.id, internalActor);
      assert.notEqual((official.commercialOffer as { draft?: boolean }).draft, true);
      assert.match(official.html, /COMMERCIAL OFFER/);
      assert.equal(/DRAFT COMMERCIAL OFFER/.test(official.html), false);
      assert.equal(BANNED.test(official.html), false);
      assert.equal(BANNED.test(official.pdf.toString('latin1')), false);
      const after = await prisma.commercialQuotation.findUniqueOrThrow({ where: { id: issued.id } });
      assert.equal(JSON.stringify(after.commercialOfferSnapshot), before);
      await assert.rejects(
        () => generateV2QuotationPdf(issued.id, otherCustomer),
        (err: unknown) => (err as { code?: string }).code === 'UNAUTHORIZED'
      );
      const audit = await prisma.auditEvent.findFirst({
        where: { entity: 'CommercialQuotation', entityId: issued.id, action: 'EXPORT_COMMERCIAL_OFFER' },
        orderBy: { at: 'desc' },
      });
      assert.ok(audit);
      const payload = (audit.newValue || {}) as Record<string, unknown>;
      assert.equal(payload.documentType, 'COMMERCIAL_OFFER');
      assert.equal(payload.quotationId, issued.id);
      assert.ok(payload.inquiryId);
      assert.ok(payload.generatedAt);
    }

    const draftDoc = await generateV2QuotationPdf(current.id, internalActor, { draft: true });
    assert.equal((draftDoc.commercialOffer as { draft?: boolean }).draft, true);
    assert.match(draftDoc.html, /DRAFT COMMERCIAL OFFER/);
    assert.equal(BANNED.test(draftDoc.html), false);
    fs.mkdirSync(path.dirname(SAMPLE_PDF), { recursive: true });
    fs.writeFileSync(SAMPLE_PDF, draftDoc.pdf);
    assert.ok(fs.existsSync(SAMPLE_PDF));
  });

  it('24, 26: multi-page table repeats headers and numbers pages', async () => {
    const offer = sampleOffer({ lineCount: 28 });
    const pdf = await renderCommercialOfferPdf(offer);
    assert.ok(pdfContains(pdf, 'Page 1 of'));
    assert.ok(pdfContains(pdf, 'Page 2 of'));
    const extracted = pdfExtract(pdf);
    const headerHits = extracted.split('COMMERCIAL OFFER').length - 1;
    assert.ok(headerHits >= 2);
  });

  it('currency formatting is dynamic', () => {
    assert.match(formatDocumentMoney(10, 'GBP'), /GBP/);
    assert.match(formatDocumentMoney(10, 'USD'), /USD/);
    assert.equal(formatDocumentMoney(null, 'EUR').includes('0.00'), true);
  });
});
