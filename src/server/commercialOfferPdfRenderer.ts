/**
 * Energya Commercial Offer PDF renderer (pdfkit). Presentation only.
 */

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {
  ENERGYA_COMMERCIAL_OFFER_TEMPLATE,
  commercialOfferHeading,
  draftOfferDisclaimer,
  formatDocumentMoney,
  formatDocumentNumber,
  hydrateCommercialOfferDocument,
  presentText,
  type IssuedCommercialOfferDocument,
} from '../domain/commercialOfferDocument';
import { FORMULA_DEFINITIONS } from '../domain/commercialOfferTemplate';

const NAVY = '#0B3D6E';
const NAVY_DEEP = '#072A4C';
const RED = '#C8102E';
const TEAL = '#1B8A9A';
const MUTED = '#5B6B7C';
const INK = '#122033';
const RULE = '#D5DDE8';
const BAND = '#E8EEF6';
const PAGE_BOTTOM = 742;
const LEFT = 28;
const RIGHT = 567;
const WIDTH = RIGHT - LEFT;

function logoPath(): string {
  return path.join(process.cwd(), 'public', 'logo.png');
}

function heroPath(): string {
  return path.join(process.cwd(), 'public', 'customer-home', 'hero-drums.jpg');
}

function offerDateLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function drawCircleIcon(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  glyph: string,
  color = TEAL
) {
  doc.circle(x + 6, y + 6, 7).fill(color);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(7).text(glyph, x, y + 2.5, {
    width: 12,
    align: 'center',
  });
}

function drawHeader(doc: PDFKit.PDFDocument, offer: IssuedCommercialOfferDocument, compact: boolean) {
  const company = offer.company;
  doc.rect(0, 0, 595.28, compact ? 52 : 92).fill('#FFFFFF');
  const logo = logoPath();
  if (fs.existsSync(logo)) {
    try {
        doc.image(logo, LEFT, compact ? 10 : 16, { fit: compact ? [86, 28] : [108, 40] });
    } catch {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(company.legalName, LEFT, 18);
    }
  } else {
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(company.legalName, LEFT, 18);
  }

  const infoX = 128;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(compact ? 8 : 10).text(company.legalName, infoX, compact ? 12 : 14, {
    width: 250,
  });
  doc.fillColor(MUTED).font('Helvetica').fontSize(6.5);
  if (!compact) {
    doc.text(company.addressLines.join(', '), infoX, 28, { width: 270 });
    doc.text(`Tel: ${company.telephone}   |   Fax: ${company.fax}`, infoX, 38, { width: 270 });
    doc.text(`${company.email}   |   ${company.website}`, infoX, 48, { width: 270 });
  }

  const bannerX = 400;
  const bannerW = 195;
  const bannerH = compact ? 40 : 78;
  const hero = heroPath();
  if (fs.existsSync(hero)) {
    try {
      doc.save();
      doc.rect(bannerX, 0, bannerW, bannerH).clip();
      doc.image(hero, bannerX, 0, { width: bannerW, height: bannerH });
      doc.restore();
    } catch {
      doc.rect(bannerX, 0, bannerW, bannerH).fill(NAVY_DEEP);
    }
  } else {
    doc.rect(bannerX, 0, bannerW, bannerH).fill(NAVY_DEEP);
  }
  doc.save();
  doc.rect(bannerX, 0, bannerW, bannerH).fillOpacity(0.45).fill(NAVY_DEEP);
  doc.restore();
  doc.fillOpacity(1);
  doc
    .polygon([bannerX - 18, 0], [bannerX + 8, 0], [bannerX - 2, bannerH], [bannerX - 28, bannerH])
    .fill(RED);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(compact ? 7 : 9);
  const heroLines = ENERGYA_COMMERCIAL_OFFER_TEMPLATE.hero.lines;
  let hy = compact ? 6 : 10;
  for (const line of heroLines) {
    doc.text(line, bannerX + 22, hy, { width: 160 });
    hy += compact ? 7 : 11;
  }
  if (!compact) {
    doc.font('Helvetica').fontSize(5.5).fillColor('#E8EEF6').text(
      ENERGYA_COMMERCIAL_OFFER_TEMPLATE.hero.caption,
      bannerX + 22,
      68,
      { width: 160 }
    );
  }
  doc.moveTo(LEFT, compact ? 50 : 90).lineTo(RIGHT, compact ? 50 : 90).lineWidth(2.2).strokeColor(RED).stroke();
  return compact ? 58 : 98;
}

function drawFooter(doc: PDFKit.PDFDocument, offer: IssuedCommercialOfferDocument, page: number, pages: number) {
  const top = 758;
  doc.moveTo(LEFT, top).lineTo(RIGHT, top).lineWidth(0.6).strokeColor(RULE).stroke();
  const pillars = offer.footer.pillars;
  const slot = WIDTH / 5;
  pillars.forEach((pillar, index) => {
    const x = LEFT + index * slot;
    drawCircleIcon(doc, x, top + 8, ['Q', 'E', 'S', 'P'][index] || '•', TEAL);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7).text(pillar.title, x + 16, top + 7, { width: slot - 20 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(pillar.subtitle, x + 16, top + 16, { width: slot - 20 });
  });
  const sloganX = LEFT + 4 * slot;
  doc.fillColor(NAVY).font('Helvetica-Oblique').fontSize(8).text(offer.footer.sloganLines[0], sloganX, top + 6, {
    width: slot,
  });
  doc.font('Helvetica-Bold').fontSize(8).text(offer.footer.sloganLines[1], sloganX, top + 16, { width: slot });

  const label = offer.draft ? 'DRAFT Commercial Offer — not an official issued quotation' : offer.footer.documentLabel;
  doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(`${offer.company.legalName}  |  ${label}`, LEFT, 818, {
    width: 380,
  });
  doc.text(`Page ${page} of ${pages}`, 430, 818, { width: 137, align: 'right' });
}

function tableWidths() {
  return [22, 168, 52, 58, 58, 90, 91] as const;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, currency: string) {
  const widths = tableWidths();
  const headers = [
    '#',
    'Description',
    'MOQ\n(Km)',
    'CU Weight\n(kg/km)',
    'AL Weight\n(kg/km)',
    `Unit Price\n(${currency}/Km)`,
    `Total Value\n(${currency})`,
  ];
  doc.rect(LEFT, y, WIDTH, 22).fill(NAVY);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(6.2);
  let x = LEFT + 3;
  headers.forEach((header, index) => {
    const align = index >= 2 ? 'right' : 'left';
    doc.text(header, x, y + 3, { width: widths[index] - 6, align, lineGap: 1 });
    x += widths[index];
  });
  return y + 24;
}

export function renderCommercialOfferPdf(offerInput: IssuedCommercialOfferDocument): Promise<Buffer> {
  const offer = hydrateCommercialOfferDocument(offerInput);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let y = drawHeader(doc, offer, false);

    const heading = commercialOfferHeading(offer.draft);
    doc.fillColor(offer.draft ? RED : NAVY).font('Helvetica-Bold').fontSize(18).text(heading, LEFT, y, { width: 300 });
    doc.fillColor(NAVY).font('Helvetica').fontSize(8).text(ENERGYA_COMMERCIAL_OFFER_TEMPLATE.subtitle, LEFT, y + 22, {
      width: 300,
    });
    if (offer.draft) {
      doc.save();
      doc.rotate(-18, { origin: [300, 420] });
      doc.fillColor(RED).fillOpacity(0.08).font('Helvetica-Bold').fontSize(72).text('DRAFT', 80, 360, { width: 500 });
      doc.restore();
      doc.fillOpacity(1);
      doc.fillColor(RED).font('Helvetica-Bold').fontSize(8).text(draftOfferDisclaimer(), LEFT, y + 34, { width: 300 });
    }

    const boxY = y;
    const boxW = 78;
    const boxes = [
      ['Quotation No.', `${presentText(offer.quotationNumber)} REV.${offer.versionNo}`],
      ['Date', offerDateLabel(offer.generatedAt)],
      ['Validity', presentText(offer.validityLabel)],
    ];
    boxes.forEach((box, index) => {
      const x = 318 + index * (boxW + 6);
      doc.roundedRect(x, boxY, boxW, 36, 3).lineWidth(0.7).strokeColor(NAVY).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(box[0], x + 4, boxY + 5, { width: boxW - 8, align: 'center' });
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7).text(box[1], x + 3, boxY + 16, {
        width: boxW - 6,
        align: 'center',
      });
    });
    y += offer.draft ? 58 : 48;

    const colW = (WIDTH - 12) / 3;
    const partyH = 108;
    doc.roundedRect(LEFT, y, colW, partyH, 4).fillAndStroke('#F7FAFC', RULE);
    doc.roundedRect(LEFT + colW + 6, y, colW, partyH, 4).fillAndStroke('#F7FAFC', RULE);
    doc.roundedRect(LEFT + 2 * (colW + 6), y, colW, partyH, 4).fillAndStroke('#EEF5FA', TEAL);

    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(8).text('To', LEFT + 8, y + 6);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(presentText(offer.customer.customerName), LEFT + 8, y + 18, {
      width: colW - 16,
    });
    const destLine = [offer.destination, offer.customer.country].filter(Boolean).join('\n');
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(presentText(destLine), LEFT + 8, y + 44, { width: colW - 16 });
    doc.text(`Attn: ${presentText(offer.customer.contactPerson)}`, LEFT + 8, y + 74, { width: colW - 16 });
    doc.text(`Your Ref.: ${presentText(offer.customer.customerReference)}`, LEFT + 8, y + 88, { width: colW - 16 });

    const fromX = LEFT + colW + 14;
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(8).text('From', fromX, y + 6);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(offer.from.companyName, fromX, y + 18, { width: colW - 16 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text(presentText(offer.from.name), fromX, y + 34, {
      width: colW - 16,
    });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(presentText(offer.from.title), fromX, y + 46, {
      width: colW - 16,
    });
    drawCircleIcon(doc, fromX, y + 58, '@');
    doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(presentText(offer.from.email), fromX + 16, y + 60, {
      width: colW - 28,
    });
    drawCircleIcon(doc, fromX, y + 72, 'T');
    doc.text(presentText(offer.from.telephone), fromX + 16, y + 74, { width: colW - 28 });
    drawCircleIcon(doc, fromX, y + 86, 'M');
    doc.text(presentText(offer.from.mobile), fromX + 16, y + 88, { width: colW - 28 });

    const greetX = LEFT + 2 * (colW + 6) + 8;
    drawCircleIcon(doc, greetX, y + 8, '"', NAVY);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text(offer.greeting.salutation, greetX + 16, y + 9, {
      width: colW - 28,
    });
    doc.fillColor(MUTED).font('Helvetica').fontSize(6.8).text(offer.greeting.body, greetX, y + 24, {
      width: colW - 16,
    });
    const signY = y + 78;
    doc.fillColor(NAVY).font('Helvetica-Oblique').fontSize(7).text(offer.greeting.signOff, greetX, signY, { width: colW - 16 });
    doc.font('Helvetica-Bold').fontSize(7.5).text(offer.greeting.signerName, greetX, signY + 10, { width: colW - 16 });
    doc.font('Helvetica').fontSize(6.5).fillColor(MUTED).text(
      `${offer.greeting.signerTitle}\n${offer.greeting.companyName}`,
      greetX,
      signY + 20,
      { width: colW - 16 }
    );
    y += partyH + 12;

    doc.rect(LEFT, y, WIDTH, 16).fill(NAVY);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8).text('1. COMMERCIAL OFFER', LEFT + 10, y + 4);
    y += 18;
    y = drawTableHeader(doc, y, offer.currency);

    const widths = tableWidths();
    const symbol = offer.currency;
    offer.lines.forEach((line, rowIndex) => {
      const description = presentText(line.itemDescription);
      const descHeight = Math.max(14, doc.heightOfString(description, { width: widths[1] - 6 }) + 6);
      if (y + descHeight > PAGE_BOTTOM) {
        doc.addPage();
        y = drawHeader(doc, offer, true);
        y = drawTableHeader(doc, y, offer.currency);
      }
      if (rowIndex % 2 === 1) doc.rect(LEFT, y, WIDTH, descHeight).fill(BAND);
      const cells = [
        String(line.lineNumber),
        description,
        formatDocumentNumber(line.moqKm, 3),
        formatDocumentNumber(line.cuWeightKgPerKm, 0),
        formatDocumentNumber(line.alWeightKgPerKm, 0),
        `${symbol} ${formatDocumentNumber(line.unitSellingPrice, 2)}`,
        `${symbol} ${formatDocumentNumber(line.lineTotal, 2)}`,
      ];
      doc.fillColor(INK).font('Helvetica').fontSize(7);
      let x = LEFT + 3;
      cells.forEach((cell, index) => {
        const align = index >= 2 ? 'right' : 'left';
        const font = index === 1 ? 'Helvetica' : index === 0 ? 'Helvetica-Bold' : 'Helvetica';
        doc.font(font).text(cell, x, y + 3, { width: widths[index] - 6, align });
        x += widths[index];
      });
      y += descHeight;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.35).strokeColor(RULE).stroke();
    });

    const totals = [
      [offer.productsTotalLabel, formatDocumentMoney(offer.productsTotal, offer.currency), false],
      [presentText(offer.shippingLabel), formatDocumentMoney(offer.shipmentTotal, offer.currency), false],
      [presentText(offer.grandTotalLabel), formatDocumentMoney(offer.grandTotal, offer.currency), true],
    ] as const;
    if (y + 58 > PAGE_BOTTOM) {
      doc.addPage();
      y = drawHeader(doc, offer, true);
    }
    y += 6;
    totals.forEach(([label, value, last]) => {
      const x = 300;
      if (last) doc.rect(x, y - 2, 267, 16).fill(NAVY);
      doc.fillColor(last ? 'white' : NAVY).font(last ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(label, x + 8, y, {
        width: 150,
      });
      doc.font('Helvetica-Bold').text(value, x + 150, y, { width: 108, align: 'right' });
      y += 16;
    });

    y += 6;
    offer.notes.forEach((note, index) => {
      const prefix = '*'.repeat(index + 1);
      doc.fillColor(index === 2 ? RED : MUTED).font(index === 2 ? 'Helvetica-Bold' : 'Helvetica-Oblique').fontSize(6.4);
      doc.text(`${prefix} ${note}`, LEFT, y, { width: WIDTH });
      y = doc.y + 2;
    });
    y += 8;

    if (y + 80 > PAGE_BOTTOM) {
      doc.addPage();
      y = drawHeader(doc, offer, true);
    }
    doc.rect(LEFT, y, WIDTH, 16).fill(NAVY);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8).text('2. TERMS & CONDITIONS', LEFT + 10, y + 4);
    y += 20;

    const colGap = 14;
    const tColW = (WIDTH - colGap) / 2;
    const leftTerms = offer.terms.slice(0, 4);
    const rightTerms = offer.terms.slice(4);
    const startY = y;
    let leftY = startY;
    let rightY = startY;

    const drawTerm = (term: (typeof offer.terms)[number], index: number, x: number, top: number) => {
      const number = `2.${index + 1}`;
      drawCircleIcon(doc, x, top, String(index + 1), TEAL);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5).text(`${number} ${term.title}`, x + 16, top + 1, {
        width: tColW - 20,
      });
      let next = top + 14;
      doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(term.text, x + 16, next, { width: tColW - 20 });
      next = doc.y + 3;
      if (term.code === 'PRICE_ADJUSTMENT') {
        doc.roundedRect(x + 16, next, tColW - 22, 28, 3).fill('#EAF3F6');
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7).text(offer.priceAdjustment.formula, x + 20, next + 4, {
          width: tColW - 30,
        });
        next += 32;
        doc.fillColor(MUTED).font('Helvetica').fontSize(5.8).text(
          FORMULA_DEFINITIONS.map((row) => `${row.code} ${row.meaning}`).join('   '),
          x + 16,
          next,
          { width: tColW - 20 }
        );
        next = doc.y + 6;
      }
      return next + 3;
    };

    leftTerms.forEach((term, index) => {
      if (leftY + 36 > PAGE_BOTTOM) {
        doc.addPage();
        leftY = drawHeader(doc, offer, true);
        rightY = Math.max(rightY, leftY);
      }
      leftY = drawTerm(term, index, LEFT, leftY);
    });
    rightTerms.forEach((term, index) => {
      if (rightY + 36 > PAGE_BOTTOM) {
        doc.addPage();
        rightY = drawHeader(doc, offer, true);
      }
      rightY = drawTerm(term, index + 4, LEFT + tColW + colGap, rightY);
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      drawFooter(doc, offer, i + 1, range.count);
    }
    doc.end();
  });
}
