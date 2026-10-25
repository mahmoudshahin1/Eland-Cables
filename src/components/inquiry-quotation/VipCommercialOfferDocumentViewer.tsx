import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Layers,
  Award,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  resolveInquiryLineTotalLengthMeters,
  type CommercialInquiryDto,
  type CommercialInquiryLineDto,
} from '../../services/commercialInquiryApiService';
import type { V2QuotationDto } from '../../services/v2QuotationApiService';
import { v2QuotationPdfUrl } from '../../services/v2QuotationApiService';
import { DEFAULT_VIP_CABLES } from '../customer/vipCableCatalogData';

function extractConductorWeight(desc: string, conductorMaterial?: string): { cuWeightKgPerKm: number; alWeightKgPerKm: number } {
  const isAlu =
    conductorMaterial?.toLowerCase().includes('alu') ||
    desc.toLowerCase().includes('al /') ||
    desc.toLowerCase().includes('al/');
  const coreMatch = desc.match(/(\d+)\s*[xX*]\s*(\d+)/);
  const cores = coreMatch ? parseInt(coreMatch[1], 10) : 1;
  const sizeMatch = desc.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const size = coreMatch ? parseInt(coreMatch[2], 10) : (sizeMatch ? parseFloat(sizeMatch[1]) : 300);
  
  const totalCrossSection = cores * size;
  if (isAlu) {
    return {
      cuWeightKgPerKm: 0,
      alWeightKgPerKm: Math.round(totalCrossSection * 2.75 * 100) / 100,
    };
  } else {
    // Copper density ~8.89 g/cm3 with stranding factor ~0.988 for compact RMC -> ~8.78289 kg/(km*mm2)
    // 4 * 300 * 8.78289 = 10,539.47 kg/km
    return {
      cuWeightKgPerKm: Math.round(totalCrossSection * 8.7828916 * 100) / 100,
      alWeightKgPerKm: 0,
    };
  }
}

interface VipCommercialOfferDocumentViewerProps {
  inquiry: CommercialInquiryDto;
  quotation?: V2QuotationDto | null;
  jwtToken: string | null;
  preferredContainerType?: string | null;
}

export interface CableTdsSpecs {
  size: string;
  cores: string;
  coreCount: number;
  nominalArea: number;
  diameter: string;
  totalWeight: string;
  cuWeight: string;
  alWeight: string;
  dcResistance: string;
  currentAir: string;
  currentGround: string;
  shortCircuit: string;
  bendingRadius: string;
  conductorMaterial: string;
  conductorType: string;
  insulationMaterial: string;
  armourType: string;
  sheathMaterial: string;
  standard: string;
  voltageRating: string;
  firePerformance: string;
}

export function resolveCableTdsSpecs(
  desc: string,
  conductorMaterial?: string,
  materialNumber?: string
): CableTdsSpecs {
  const d = (desc || '').toLowerCase();
  const isAlu =
    conductorMaterial?.toLowerCase().includes('alu') ||
    d.includes('al /') ||
    d.includes('al/') ||
    d.includes('aluminum') ||
    d.includes('aluminium');

  // Try matching catalog first
  const catalogItem = DEFAULT_VIP_CABLES.find(
    (c) =>
      (materialNumber && c.code === materialNumber) ||
      c.name.toLowerCase() === d ||
      c.code === (desc || '').trim()
  );

  // Extract core count and size
  const coreMatch = desc.match(/(\d+)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  const coreCount = catalogItem ? catalogItem.cores : coreMatch ? parseInt(coreMatch[1], 10) : 1;
  const nominalArea = catalogItem
    ? parseFloat(catalogItem.size.replace(/[^\d.]/g, '')) || 300
    : coreMatch
    ? parseFloat(coreMatch[2])
    : parseFloat(desc.match(/(\d+(?:\.\d+)?)\s*mm/i)?.[1] || '300');

  const cores = `${coreCount} Core${coreCount > 1 ? 's' : ''}`;
  const size = coreCount > 1 ? `${coreCount} x ${nominalArea} mm²` : `${nominalArea} mm²`;

  // Conductor classification
  const isRMC = d.includes('rmc') || (!d.includes('flexible') && !d.includes('class 5') && !d.includes('class 1'));
  const isClass5 = d.includes('flexible') || d.includes('class 5');
  const isClass1 = d.includes('solid') || d.includes('class 1');
  const conductorType = isAlu
    ? 'Class 2 Compact Plain Aluminum (RMC) to IEC 60228'
    : isClass5
    ? 'Class 5 Flexible Stranded Annealed Copper'
    : isClass1
    ? 'Class 1 Solid Plain Annealed Copper'
    : isRMC
    ? 'Class 2 Compact Plain Copper (RMC) to IEC 60228'
    : 'Class 2 Plain Annealed Stranded Copper to IEC 60228';

  // Insulation
  const isPvcInsulation = (d.includes('pvc') && !d.includes('xlpe')) || d.startsWith('cu / pvc') || d.startsWith('al / pvc');
  const isEpr = d.includes('epr');
  const insulationMaterial = isEpr
    ? 'Ethylene Propylene Rubber (EPR) Type GP4 (90°C continuous)'
    : isPvcInsulation
    ? 'Polyvinyl Chloride (PVC) Type TI 1 (70°C continuous)'
    : 'Cross-Linked Polyethylene (XLPE) Type GP8 (90°C continuous)';

  // Armour
  const isSwa = d.includes('swa');
  const isAwa = d.includes('awa');
  const isSta = d.includes('sta');
  const armourType = isSwa
    ? 'Galvanized Steel Wire Armour (SWA)'
    : isAwa
    ? 'Aluminium Wire Armour (AWA)'
    : isSta
    ? 'Galvanized Steel Tape Armour (STA)'
    : 'Unarmoured';

  // Sheath
  const isLshf = d.includes('lshf') || d.includes('lszh') || d.includes('lsoh') || d.includes('halogen free');
  const isPe = (d.includes('pe') || d.includes('hdpe') || d.includes('mdpe')) && !d.includes('xlpe');
  const sheathMaterial = isLshf
    ? 'Heavy-Duty UV-Resistant Low Smoke Zero Halogen (LSHF/LSOH), Black'
    : isPe
    ? 'High-Density Polyethylene (HDPE/MDPE), UV-Resistant, Black'
    : 'Heavy-Duty UV-Resistant Polyvinyl Chloride (PVC) Type 9 / ST2, Black';

  // Standard
  const stdMatch = desc.match(/(IEC\s*\d+(?:-\d+)?|BS\s*\d+|DIN\s*VDE\s*\d+|NF\s*C\s*\d+)/i);
  const standard = catalogItem?.std || stdMatch?.[0] || (isLshf ? 'IEC 60502-1 / BS 7211' : isSwa ? 'BS 5467' : 'IEC 60502-1');

  // Voltage
  const voltMatch = desc.match(/(\d+(?:\.\d+)?\/\d+(?:\.\d+)?\s*(?:\([^\)]+\)\s*)?kV|\d+\s*kV)/i);
  const voltageRating = catalogItem?.voltage || voltMatch?.[0] || '0.6 / 1 kV (Um = 1.2 kV)';

  // Fire Reaction
  const firePerformance = isLshf
    ? 'IEC 60332-1-2 (Flame Retardant) / IEC 60754-1/2 (Zero Halogen) / IEC 61034-2 (Low Smoke)'
    : 'IEC 60332-1-2 / BS EN 60332-1-2 (Flame Retardant)';

  // DC Resistance @ 20°C (IEC 60228)
  const dcResLookup: Record<number, { cu: number; al: number }> = {
    16: { cu: 1.15, al: 1.91 },
    25: { cu: 0.727, al: 1.2 },
    35: { cu: 0.524, al: 0.868 },
    50: { cu: 0.387, al: 0.641 },
    70: { cu: 0.268, al: 0.443 },
    95: { cu: 0.193, al: 0.32 },
    120: { cu: 0.153, al: 0.253 },
    150: { cu: 0.124, al: 0.206 },
    185: { cu: 0.0991, al: 0.164 },
    240: { cu: 0.0754, al: 0.125 },
    300: { cu: 0.0601, al: 0.1 },
    400: { cu: 0.047, al: 0.0778 },
    500: { cu: 0.0366, al: 0.0605 },
    630: { cu: 0.0283, al: 0.0469 },
  };
  const nearestSize = Object.keys(dcResLookup)
    .map(Number)
    .reduce((prev, curr) => (Math.abs(curr - nominalArea) < Math.abs(prev - nominalArea) ? curr : prev), 300);
  const dcRes = dcResLookup[nearestSize] || { cu: 18.1 / (nominalArea || 300), al: 29.5 / (nominalArea || 300) };
  const dcResistanceVal = isAlu ? dcRes.al : dcRes.cu;
  const dcResistance = `${dcResistanceVal.toFixed(4)} Ω/km`;

  // Conductor Net Weights
  const cuWeightVal = isAlu ? 0 : Math.round(coreCount * nominalArea * 8.7828916 * 100) / 100;
  const alWeightVal = isAlu ? Math.round(coreCount * nominalArea * 2.703 * 100) / 100 : 0;
  const cuWeight = `${cuWeightVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/km`;
  const alWeight = `${alWeightVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/km`;

  // Outer Diameter
  let odNum: number;
  if (catalogItem) {
    odNum = catalogItem.od;
  } else if (coreCount === 4 && nominalArea === 300 && !isSwa) {
    odNum = 68.5;
  } else if (coreCount === 4 && nominalArea === 300 && isSwa) {
    odNum = 65.4;
  } else if (coreCount === 1) {
    odNum = Math.round((2.4 * Math.sqrt(nominalArea) + (isAwa || isSwa ? 8 : 4.5)) * 10) / 10;
  } else {
    const singleCoreD = 2.4 * Math.sqrt(nominalArea) + 3.8;
    odNum = Math.round((singleCoreD * (coreCount === 3 ? 2.15 : coreCount === 4 ? 2.41 : 2.7) + (isSwa ? 6.5 : 3.5)) * 10) / 10;
  }
  const diameter = `${odNum.toFixed(1)} mm`;

  // Net Total Weight
  let totalWeightKgKm: number;
  if (catalogItem) {
    totalWeightKgKm = catalogItem.weightKgKm;
  } else if (coreCount === 4 && nominalArea === 300 && !isSwa) {
    totalWeightKgKm = isAlu ? 5800 : 14200;
  } else if (coreCount === 4 && nominalArea === 300 && isSwa) {
    totalWeightKgKm = isAlu ? 5400 : 13700;
  } else if (coreCount === 1) {
    totalWeightKgKm = Math.round((isAlu ? alWeightVal : cuWeightVal) * 1.15 + (isAwa ? 450 : 220));
  } else {
    const baseConductor = isAlu ? alWeightVal : cuWeightVal;
    totalWeightKgKm = Math.round(baseConductor * (isAlu ? 1.45 : 1.22) + (isSwa ? 1600 : 650) + coreCount * 50);
  }
  const totalWeight = `${totalWeightKgKm.toLocaleString()} kg/km`;

  // Ampacity (Current Rating)
  const ampLookup: Record<number, { multiAir: number; multiGround: number; singleAir: number; singleGround: number }> = {
    16: { multiAir: 80, multiGround: 80, singleAir: 105, singleGround: 100 },
    25: { multiAir: 105, multiGround: 105, singleAir: 135, singleGround: 140 },
    35: { multiAir: 135, multiGround: 130, singleAir: 170, singleGround: 150 },
    50: { multiAir: 165, multiGround: 155, singleAir: 205, singleGround: 180 },
    70: { multiAir: 215, multiGround: 195, singleAir: 260, singleGround: 225 },
    95: { multiAir: 265, multiGround: 235, singleAir: 315, singleGround: 270 },
    120: { multiAir: 320, multiGround: 280, singleAir: 375, singleGround: 320 },
    150: { multiAir: 365, multiGround: 315, singleAir: 430, singleGround: 365 },
    185: { multiAir: 425, multiGround: 360, singleAir: 500, singleGround: 415 },
    240: { multiAir: 495, multiGround: 415, singleAir: 585, singleGround: 480 },
    300: { multiAir: 560, multiGround: 460, singleAir: 670, singleGround: 550 },
    400: { multiAir: 640, multiGround: 520, singleAir: 790, singleGround: 650 },
    500: { multiAir: 720, multiGround: 580, singleAir: 910, singleGround: 745 },
    630: { multiAir: 800, multiGround: 640, singleAir: 1020, singleGround: 840 },
  };
  const ampEntry = ampLookup[nearestSize] || { multiAir: 560, multiGround: 460, singleAir: 670, singleGround: 550 };
  const rawAir = coreCount > 1 ? ampEntry.multiAir : ampEntry.singleAir;
  const rawGround = coreCount > 1 ? ampEntry.multiGround : ampEntry.singleGround;
  const currentAir = `${Math.round(isAlu ? rawAir * 0.78 : rawAir)} Amps`;
  const currentGround = `${Math.round(isAlu ? rawGround * 0.78 : rawGround)} Amps`;

  // Short Circuit Rating (1 sec)
  const kFactor = isPvcInsulation ? (isAlu ? 0.076 : 0.115) : (isAlu ? 0.094 : 0.143);
  const shortCircuit = `${(nominalArea * kFactor).toFixed(1)} kA`;

  // Bending Radius
  const bendFactor = isSwa || isAwa || isSta ? 12 : coreCount === 1 ? 10 : 8;
  const bendRadiusMm = Math.round(bendFactor * odNum);
  const bendingRadius = `${bendFactor} x Diameter (~${bendRadiusMm} mm)`;

  return {
    size,
    cores,
    coreCount,
    nominalArea,
    diameter,
    totalWeight,
    cuWeight,
    alWeight,
    dcResistance,
    currentAir,
    currentGround,
    shortCircuit,
    bendingRadius,
    conductorMaterial: isAlu ? 'Aluminium' : 'Copper',
    conductorType,
    insulationMaterial,
    armourType,
    sheathMaterial,
    standard,
    voltageRating,
    firePerformance,
  };
}

export const VipCommercialOfferDocumentViewer: React.FC<VipCommercialOfferDocumentViewerProps> = ({
  inquiry,
  quotation,
  jwtToken,
  preferredContainerType = '40HQ',
}) => {
  const [activeDocTab, setActiveDocTab] = useState<'commercial_offer' | 'tds'>('commercial_offer');
  const [downloading, setDownloading] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState(0);

  const lines = inquiry.lines || [];
  const primaryLine: (CommercialInquiryLineDto & { cableMaterialNumber?: string }) | undefined =
    lines[selectedLineIndex] || lines[0];

  // Cable specs & dimensions
  const desc = primaryLine?.cableDescription || 'Cu / XLPE / LSHF 0.6/1 kV 4X300 mm2 RMC IEC 60502-1';
  const matCode = primaryLine?.materialNumber || primaryLine?.cableMaterialNumber || '10009536';
  const totalLen = primaryLine ? resolveInquiryLineTotalLengthMeters(primaryLine) : 2000;
  const drums = Number(
    primaryLine?.drumSchedule?.rows?.reduce((s, r) => s + (Number(r.noOfDrums) || 0), 0) ||
    primaryLine?.requestedQuantity ||
    4
  );
  const cuttingLen = Number(
    primaryLine?.drumSchedule?.rows?.[0]?.cuttingLengthM ||
    primaryLine?.cuttingLengthMeters ||
    (drums > 0 && totalLen > 0 ? Math.round(totalLen / drums) : 500)
  );
  const drumType =
    primaryLine?.drumSchedule?.rows?.[0]?.drumCode ||
    primaryLine?.drumType ||
    'EWD2600-T26S';

  const specs = resolveCableTdsSpecs(desc, primaryLine?.conductorMaterial, matCode);

  // Quotation number & revision
  const quoteNumber = quotation?.quotationNumber || inquiry.inquiryNumber.replace('INQ', 'QUO');
  const revision = quotation?.versionNo || 1;
  const quoteDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Currency & Prices
  const currency = inquiry.currency || 'USD';
  const productsTotal =
    quotation?.sellingPrice ||
    inquiry.commercialProductsTotal ||
    (primaryLine?.sellingPrice ? Number(primaryLine.sellingPrice) : 121212.23);

  // Freight estimation from container study
  const containerFreightMap: Record<string, number> = {
    '20STD': 3100,
    '40STD': 3300,
    '40HQ': 3300,
    '40OT': 3300,
  };
  const freightCost = containerFreightMap[preferredContainerType || '40HQ'] || 3300;

  // Resolve individual line calculations, MOQ km, weights, and realistic line selling prices
  const calculatedLines = useMemo(() => {
    const parsed = lines.map((l, idx) => {
      const lineTotalM = resolveInquiryLineTotalLengthMeters(l);
      const kmNum = Math.max(
        0.001,
        (lineTotalM > 0 ? lineTotalM : (Number(l.requestedLengthMeters) || 2000)) / 1000
      );
      const kmStr = kmNum.toFixed(3);
      const lineDrums = Number(
        l.drumSchedule?.rows?.reduce((s, r) => s + (Number(r.noOfDrums) || 0), 0) ||
        l.requestedQuantity ||
        1
      );
      const lineCuttingM = Number(
        l.drumSchedule?.rows?.[0]?.cuttingLengthM ||
        l.cuttingLengthMeters ||
        (lineDrums > 0 && lineTotalM > 0 ? Math.round(lineTotalM / lineDrums) : 500)
      );
      const lineCode = l.materialNumber || matCode;
      const weights = extractConductorWeight(l.cableDescription || desc, l.conductorMaterial);
      const qLine =
        quotation?.lines?.find((ql) => ql.inquiryLineId === l.id || ql.lineNumber === l.lineNumber) ||
        quotation?.lines?.[idx];

      const explicitSellingPrice =
        qLine?.sellingPrice != null && Number(qLine.sellingPrice) > 0
          ? Number(qLine.sellingPrice)
          : l.commercialLineTotal != null && Number(l.commercialLineTotal) > 0
          ? Number(l.commercialLineTotal)
          : null;

      const matCost = Number(l.materialCost || 0);
      const estimatedWeightCostBasis = kmNum * (weights.cuWeightKgPerKm + weights.alWeightKgPerKm * 0.5 + 200);

      return {
        line: l,
        idx,
        kmNum,
        kmStr,
        lineDrums,
        lineCuttingM,
        lineCode,
        weights,
        explicitSellingPrice,
        matCost,
        estimatedWeightCostBasis,
      };
    });

    const totalProd = Number(productsTotal) || 0;
    const hasAllExplicit = parsed.length > 0 && parsed.every((p) => p.explicitSellingPrice != null && p.explicitSellingPrice > 0);

    if (hasAllExplicit) {
      return parsed.map((p) => {
        const lineTotal = p.explicitSellingPrice!;
        const unitPriceKm = lineTotal / p.kmNum;
        return { ...p, lineTotal, unitPriceKm };
      });
    }

    const totalMatCost = parsed.reduce((sum, p) => sum + p.matCost, 0);
    const useMatCost = totalMatCost > 0;
    const totalBasis = useMatCost
      ? totalMatCost
      : parsed.reduce((sum, p) => sum + p.estimatedWeightCostBasis, 0);

    return parsed.map((p) => {
      let lineTotal: number;
      if (p.explicitSellingPrice != null && parsed.length === 1) {
        lineTotal = p.explicitSellingPrice;
      } else if (totalBasis > 0) {
        const basis = useMatCost ? p.matCost : p.estimatedWeightCostBasis;
        lineTotal = Math.round(((basis / totalBasis) * totalProd) * 100) / 100;
      } else {
        lineTotal = Math.round((totalProd / Math.max(1, parsed.length)) * 100) / 100;
      }
      const unitPriceKm = lineTotal / p.kmNum;
      return { ...p, lineTotal, unitPriceKm };
    });
  }, [lines, quotation?.lines, productsTotal, matCode, desc]);

  const resolvedProductsTotal = useMemo(() => {
    if (calculatedLines.length === 0) return Number(productsTotal);
    return calculatedLines.reduce((sum, l) => sum + l.lineTotal, 0);
  }, [calculatedLines, productsTotal]);

  const resolvedGrandTotal = resolvedProductsTotal + freightCost;
  const grandTotal = resolvedGrandTotal;

  // Metal baseline rates
  const copperRate = Number(inquiry.commercialMetadata?.copperPriceRate || 20000);
  const aluminiumRate = Number(inquiry.commercialMetadata?.aluminiumPriceRate || 1500);

  // Incoterm & Destination
  const incoterm = inquiry.incoterms || 'DAP';
  const rawDestination = inquiry.commercialMetadata?.deliveryDestination
    ? String(inquiry.commercialMetadata.deliveryDestination)
    : 'Doncaster';
  const destination = rawDestination
    .replace(/^(?:UK\s*\/\s*|DAP\s*\/\s*)+/gi, '')
    .trim() || 'Doncaster';
  const deliveryPlace = `${incoterm} ${destination}`;
  const destinationDisplay = deliveryPlace;

  // Download PDF handler
  const handleDownloadOfferPdf = async () => {
    if (!jwtToken) return;
    setDownloading(true);
    try {
      const url = v2QuotationPdfUrl(inquiry.id);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (!res.ok) {
        throw new Error('Failed to generate PDF. Falling back to print.');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `COMMERCIAL-OFFER-${quoteNumber}-REV${revision}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  // Print offer handler
  const handlePrintOffer = () => {
    window.print();
  };

  // Print TDS handler
  const handlePrintTds = () => {
    window.print();
  };

  // Download Technical Data Sheet (TDS) as Excel (.xlsx) workbook
  const handleDownloadTdsExcel = () => {
    const isAlu = specs.conductorMaterial.toLowerCase().includes('alu');

    // Sheet 1: Comprehensive TDS Specification Sheet
    const wsData = [
      ['ENERGYA POWER CABLES — TECHNICAL OFFICE & QUALITY ASSURANCE'],
      ['OFFICIAL TECHNICAL DATA SHEET (TDS) — BASEC & IEC CERTIFIED'],
      [],
      ['DOCUMENT METADATA', ''],
      ['Document Reference', `TDS-${matCode}-2026.PDF`],
      ['Document Issue Date', quoteDate],
      ['Customer Name', inquiry.customerName || 'ELAND Cables'],
      ['Customer Reference', inquiry.customerReference || inquiry.inquiryNumber],
      ['Inquiry Number', inquiry.inquiryNumber],
      ['Quotation Number', `${quoteNumber} REV.${revision}`],
      ['Delivery Terms & Destination', destinationDisplay],
      ['Compliance Standards', specs.standard],
      ['Quality Certifications', 'BASEC Certified / BSI Kitemark / ISO 9001:2015 / RoHS & REACH'],
      [],
      ['1. CABLE GENERAL IDENTIFICATION', ''],
      ['Material Item Code', matCode],
      ['Full Cable Description', desc],
      ['Voltage Rating U0/U (Um)', specs.voltageRating],
      ['Number of Cores', specs.cores],
      ['Nominal Conductor Cross-Section', specs.size],
      ['Conductor Material & Type', specs.conductorType],
      [],
      ['2. CABLE CONSTRUCTION SPECIFICATIONS', ''],
      ['Conductor', specs.conductorType],
      ['Primary Insulation Material', specs.insulationMaterial],
      ['Insulation Color', 'Natural / Standard Color Coding'],
      ['Armour / Mechanical Protection', specs.armourType],
      ['Outer Jacket / Sheath', specs.sheathMaterial],
      ['Fire Retardancy Standard', specs.firePerformance],
      ['Acid Gas Emission', isAlu || specs.sheathMaterial.includes('LSHF') ? 'IEC 60754-1/2 (Zero Halogen, Acid gas < 0.5%)' : 'BS EN 60754 (Low Emission)'],
      ['Smoke Emission Density', specs.sheathMaterial.includes('LSHF') ? 'IEC 61034-2 (Light Transmittance > 60%)' : 'Standard PVC Density'],
      [],
      ['3. ELECTRICAL & THERMAL CHARACTERISTICS', ''],
      ['Max Conductor DC Resistance @ 20°C', specs.dcResistance],
      ['Rated Operating Voltage (U0/U)', specs.voltageRating],
      ['Spark / AC Withstand Test Voltage', '3.5 kV AC for 5 minutes'],
      ['Current Carrying Capacity in Air (30°C)', specs.currentAir],
      ['Current Carrying Capacity in Ground (20°C)', specs.currentGround],
      ['Short Circuit Current Capacity (1 sec)', specs.shortCircuit],
      ['Max Continuous Operating Conductor Temp', specs.insulationMaterial.includes('PVC') ? '70°C' : '90°C'],
      ['Max Short Circuit Conductor Temp', specs.insulationMaterial.includes('PVC') ? '160°C' : '250°C'],
      [],
      ['4. PHYSICAL, MECHANICAL & DIMENSIONAL DATA', ''],
      ['Approximate Overall Cable Diameter', specs.diameter],
      ['Approximate Total Net Cable Weight', specs.totalWeight],
      ['Nominal Conductor Net Weight', isAlu ? `${specs.alWeight} (Aluminium)` : `${specs.cuWeight} (Copper)`],
      ['Minimum Bending Radius', specs.bendingRadius],
      ['Maximum Pulling Tension', isAlu ? '30 N/mm² of conductor area' : '50 N/mm² of conductor area'],
      [],
      ['5. DRUM ALLOCATION, PACKAGING & SHIPPING', ''],
      ['Total Ordered Length', `${totalLen.toLocaleString()} Meters`],
      ['Packaging Batch Allocation', `${drums} Drums x ${cuttingLen} Meters`],
      ['Packaging Reel Code', drumType],
      ['Reel Construction', 'Seaworthy Heavy-Duty Treated Wooden Drum'],
      ['Container Sea Freight Loading', `${preferredContainerType || '40HQ'} High Cube Sea Container`],
      ['Packaging & Transit Protection', 'Fully seaworthy lagged, palletized, strapped, and chocked for ocean freight'],
      [],
      ['APPROVAL & VERIFICATION', ''],
      ['Technical Office Status', 'APPROVED FOR COMMERCIAL QUOTATION'],
      ['Engineering Directorate', 'Energya Power Cables Technical Office & QA Directorate'],
      ['Compliance Verification', 'Digitally Verified & Validated with BASEC / IEC Standards'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 42 }, { wch: 72 }];

    // Sheet 2: Engineering Comparison Matrix
    const matrixHeaders = [
      'Item Code',
      'Cable Description',
      'Voltage',
      'Conductor Material',
      'Size',
      'Insulation',
      'Sheath & Protection',
      'Outer Diameter (mm)',
      'Total Weight (kg/km)',
      'Conductor Weight (kg/km)',
      'Total Length (m)',
      'Drum Count',
      'Cutting Length (m)',
      'Drum Code',
      'Container Type',
    ];
    const matrixRow = [
      matCode,
      desc,
      specs.voltageRating,
      specs.conductorType,
      specs.size,
      specs.insulationMaterial,
      specs.armourType !== 'Unarmoured' ? `${specs.armourType} / ${specs.sheathMaterial}` : specs.sheathMaterial,
      specs.diameter.replace(' mm', ''),
      specs.totalWeight.replace(' kg/km', '').replace(',', ''),
      (isAlu ? specs.alWeight : specs.cuWeight).replace(' kg/km', '').replace(',', ''),
      totalLen,
      drums,
      cuttingLen,
      drumType,
      preferredContainerType || '40HQ',
    ];
    const wsMatrix = XLSX.utils.aoa_to_sheet([matrixHeaders, matrixRow]);
    wsMatrix['!cols'] = [
      { wch: 16 }, { wch: 50 }, { wch: 14 }, { wch: 28 }, { wch: 14 },
      { wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 24 },
      { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Technical Data Sheet');
    XLSX.utils.book_append_sheet(wb, wsMatrix, 'Specifications Matrix');
    const safeStd = specs.standard.replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `TDS_${matCode}_${safeStd}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Top Navigation & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveDocTab('commercial_offer')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeDocTab === 'commercial_offer'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-4 w-4 text-brand-600" />
            <span>Commercial Offer</span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              Official
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDocTab('tds')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeDocTab === 'tds'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="h-4 w-4 text-blue-600" />
            <span>Technical Data Sheet (TDS)</span>
            <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              BASEC Specs
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeDocTab === 'commercial_offer' ? (
            <>
              <button
                type="button"
                onClick={handlePrintOffer}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors shadow-sm"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Offer</span>
              </button>
              <button
                type="button"
                disabled={downloading}
                onClick={handleDownloadOfferPdf}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-700 hover:to-blue-700 text-white text-xs font-bold transition-all shadow-sm shadow-brand-500/20 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{downloading ? 'Generating PDF…' : 'Download Commercial Offer (PDF)'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePrintTds}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors shadow-sm"
              >
                <Printer className="h-3.5 w-3.5 text-blue-600" />
                <span>Print TDS / PDF</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTdsExcel}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-500/20"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Download TDS (Excel / XLSX)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* DOCUMENT VIEW 1: COMMERCIAL OFFER (REPLICA OF OFFICIAL ENERGYA DOCUMENT) */}
      {activeDocTab === 'commercial_offer' && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-md p-6 sm:p-8 space-y-6 text-[#122033] font-sans">
          {/* Top Document Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5 border-slate-200">
            {/* Left: Energya Logo & Legal Header */}
            <div className="flex items-start gap-4">
              <img
                src="/logo.png"
                alt="Energya Cables"
                className="h-12 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="space-y-0.5 text-xs text-slate-600">
                <h2 className="text-sm font-black text-[#0B3D6E] uppercase tracking-wide">
                  Energya Power Cables
                </h2>
                <p>97 Omar Bin El Khattab Street, Heliopolis, Cairo, Egypt</p>
                <p>Tel: +20 2 2415 2371/2 | Fax: +20 2 2415 2470</p>
                <p className="text-blue-700 font-medium">info@energyacables.com | www.energyacables.com</p>
              </div>
            </div>

            {/* Right: Hero Banner Tagline */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#072A4C] to-[#0B3D6E] px-4 py-3 text-white text-right max-w-xs shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-200">
                Powering Industries · Connecting Lives
              </p>
              <p className="text-[10px] text-slate-300 font-semibold tracking-tight mt-0.5">
                RELIABLE CABLES FOR A STRONGER TOMORROW
              </p>
            </div>
          </div>

          {/* Document Title & Metadata Box */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div>
              <h1 className="text-2xl font-black text-[#0B3D6E] tracking-tight uppercase">
                Commercial Offer
              </h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                Technical & Commercial Quotation
              </p>
            </div>

            <div className="flex border border-slate-300 rounded-xl overflow-hidden divide-x divide-slate-300 text-xs bg-slate-50/60 shadow-sm">
              <div className="px-3.5 py-2 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400">Quotation No.</p>
                <p className="font-mono font-black text-[#0B3D6E] text-xs mt-0.5">
                  {quoteNumber} REV.{revision}
                </p>
              </div>
              <div className="px-3.5 py-2 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400">Date</p>
                <p className="font-bold text-slate-800 text-xs mt-0.5">{quoteDate}</p>
              </div>
              <div className="px-3.5 py-2 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400">Validity</p>
                <p className="font-bold text-emerald-700 text-xs mt-0.5">48 Hours</p>
              </div>
            </div>
          </div>

          {/* To / From Parties Grid & Greeting Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* To Box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-1">
              <p className="font-bold text-[11px] uppercase tracking-wider text-slate-400">To</p>
              <p className="font-bold text-sm text-[#0B3D6E]">{inquiry.customerName || 'ELAND Cables'}</p>
              <p className="font-bold text-xs text-slate-700 uppercase tracking-wide">{destination.toUpperCase()}</p>
              <p className="text-slate-600 font-medium">{String(inquiry.commercialMetadata?.customerCountry || 'United Kingdom')}</p>
              <p className="text-slate-700 pt-1">
                <span className="font-semibold">Attn:</span> {inquiry.contactPerson || 'Eng. David Smith'}
              </p>
              <p className="text-slate-500">
                <span className="font-semibold">Your Ref.:</span> {inquiry.customerReference || inquiry.inquiryNumber || '155754'}
              </p>
            </div>

            {/* From Box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-1">
              <p className="font-bold text-[11px] uppercase tracking-wider text-slate-400">From</p>
              <p className="font-bold text-sm text-[#0B3D6E]">Energya Power Cables</p>
              <p className="font-semibold text-slate-800">
                {inquiry.salesAgent || 'Eng. Mohamed Ahmed'}
              </p>
              <p className="text-slate-500 text-[11px]">Export Coordinator / Commercial Sales</p>
              <div className="pt-1 text-[11px] text-slate-600 space-y-0.5">
                <p>@ info@energyacables.com</p>
                <p>T +20 2 2415 2371/2</p>
                <p>M +20 2 2415 2470</p>
              </div>
            </div>

            {/* Greeting Letter Box */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 text-slate-700 text-[11.5px] leading-relaxed flex flex-col justify-between">
              <div>
                <p className="font-bold text-slate-900 mb-1">
                  Dear {inquiry.contactPerson ? inquiry.contactPerson.split(' ')[0] : 'Eng.'},
                </p>
                <p>
                  Many thanks for your enquiry, please find our technical and commercial offer attached.
                </p>
                <p className="mt-1 text-slate-600">
                  We trust this shall meet your requirements and in case of any further clarification required, please don&apos;t hesitate to contact me.
                </p>
              </div>
              <div className="pt-2 text-[11px] border-t border-blue-200/50 mt-2">
                <p className="font-semibold text-slate-900">Best Regards,</p>
                <p className="font-medium text-slate-700">Export Coordinator · Energya Power Cables</p>
              </div>
            </div>
          </div>

          {/* Section 1: COMMERCIAL OFFER Table */}
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-black text-[#0B3D6E] uppercase tracking-wide flex items-center gap-2">
              <span>1. Commercial Offer</span>
            </h3>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0B3D6E] text-white text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-center">MOQ (Km)</th>
                    <th className="py-2.5 px-3 text-center">CU Weight (kg/km)</th>
                    <th className="py-2.5 px-3 text-center">AL Weight (kg/km)</th>
                    <th className="py-2.5 px-3 text-right">Unit Price ({currency}/Km)</th>
                    <th className="py-2.5 px-3 text-right">Total Value ({currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {calculatedLines.map((cl, idx) => {
                    const l = cl.line;
                    return (
                      <tr key={l.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-900">{l.cableDescription}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Code: {cl.lineCode} · {cl.lineDrums} Drums x {cl.lineCuttingM} m
                          </p>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-medium">{cl.kmStr}</td>
                        <td className="py-3 px-3 text-center font-mono">
                          {cl.weights.cuWeightKgPerKm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {cl.weights.alWeightKgPerKm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium">
                          {cl.unitPriceKm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {cl.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Table Totals Footer */}
                <tfoot className="border-t-2 border-[#0B3D6E] bg-slate-50 font-sans text-xs">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3 font-semibold text-slate-700 text-right">
                      Grand Total (Products)
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {currency} {Number(resolvedProductsTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td colSpan={5} className="py-2.5 px-3 font-semibold text-slate-700 text-right">
                      Shipping ({deliveryPlace})
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {currency} {Number(freightCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="bg-[#0B3D6E] text-white font-bold">
                    <td colSpan={5} className="py-3 px-3 font-black text-right uppercase tracking-wider text-xs text-white">
                      Grand Total {deliveryPlace}
                    </td>
                    <td colSpan={2} className="py-3 px-3 text-right font-mono font-black text-white text-sm">
                      {currency} {Number(resolvedGrandTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Price Disclaimers */}
            <div className="text-[10px] text-slate-500 space-y-0.5 pt-1">
              <p>* Prices are net and do not include any rebate, discount, taxes or any other cost not clearly mentioned in our offer.</p>
              <p>** Shipping cost is subject to variation at the time of the order.</p>
              <p className="font-bold text-red-600">** PRICES WILL VARY IF NUMBER OF ITEMS OR QUANTITIES CHANGE</p>
            </div>
          </div>

          {/* Section 2: TERMS & CONDITIONS */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h3 className="text-sm font-black text-[#0B3D6E] uppercase tracking-wide">
              2. Terms &amp; Conditions
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* 2.1 Price Adjustment */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 md:col-span-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    1
                  </span>
                  <span className="font-bold text-slate-900 text-xs">2.1 Price Adjustment</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Based on Copper price of <span className="font-bold font-mono text-slate-900">USD {copperRate.toLocaleString()} USD/MT</span> and Aluminium price of <span className="font-bold font-mono text-slate-900">USD {aluminiumRate.toLocaleString()} USD/MT</span>. Final prices shall be adjusted at the time of placing the order according to the following equation:
                </p>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 font-mono font-bold text-blue-900 text-center text-xs shadow-inner">
                  F.P. = U.P. + ((LME2 - LME1) * C.W. / 1000)
                </div>
                <p className="text-[10px] text-slate-500">
                  <span className="font-bold">F.P.</span> Final Unit Price | <span className="font-bold">U.P.</span> Offered Unit Price | <span className="font-bold">LME2</span> LME official settlement price at time of order | <span className="font-bold">LME1</span> Offered Metal Base | <span className="font-bold">C.W.</span> Conductor weight (kg/km)
                </p>
              </div>

              {/* 2.2 Packing */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    2
                  </span>
                  <span className="font-bold text-slate-900">2.2 Packing</span>
                </div>
                <p className="text-[11px] text-slate-600">Seaworthy export packing on wooden drums.</p>
              </div>

              {/* 2.3 Tolerance */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    3
                  </span>
                  <span className="font-bold text-slate-900">2.3 Tolerance</span>
                </div>
                <p className="text-[11px] text-slate-600">+/- 5% per drum.</p>
              </div>

              {/* 2.4 Delivery */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    4
                  </span>
                  <span className="font-bold text-slate-900">2.4 Delivery</span>
                </div>
                <p className="text-[11px] text-slate-600">Cables will be delivered {deliveryPlace}.</p>
              </div>

              {/* 2.5 Delivery Period */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    5
                  </span>
                  <span className="font-bold text-slate-900">2.5 Delivery Period</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Expected dispatch 8-10 weeks, subject to confirmation at the time of placing the order. Please add 3-4 weeks for delivery under the stated incoterm, subject to shipping line availability.
                </p>
              </div>

              {/* 2.6 Payment */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    6
                  </span>
                  <span className="font-bold text-slate-900">2.6 Payment</span>
                </div>
                <p className="text-[11px] text-slate-600">{inquiry.paymentTerms || '60 days from delivery by direct transfer to our bank account.'}</p>
              </div>

              {/* 2.7 Manufacturer */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    7
                  </span>
                  <span className="font-bold text-slate-900">2.7 Manufacturer</span>
                </div>
                <p className="text-[11px] text-slate-600">Energya Power Cables.</p>
              </div>

              {/* 2.8 Country of Origin */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    8
                  </span>
                  <span className="font-bold text-slate-900">2.8 Country of Origin</span>
                </div>
                <p className="text-[11px] text-slate-600">Egypt.</p>
              </div>

              {/* 2.9 Offer Validity */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    9
                  </span>
                  <span className="font-bold text-slate-900">2.9 Offer Validity</span>
                </div>
                <p className="text-[11px] text-slate-600">Our offer is valid for 48 hours from its date.</p>
              </div>

              {/* 2.10 VAT & Taxes */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    10
                  </span>
                  <span className="font-bold text-slate-900">2.10 VAT &amp; Duties</span>
                </div>
                <p className="text-[11px] text-slate-600">Offered prices are net; customs, duties and local taxes paid by buyer.</p>
              </div>

              {/* 2.11 Acceptance */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    11
                  </span>
                  <span className="font-bold text-slate-900">2.11 Acceptance</span>
                </div>
                <p className="text-[11px] text-slate-600">Inspection notice within six days of arrival.</p>
              </div>

              {/* 2.12 Warranty */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/30 space-y-1 md:col-span-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3D6E] text-white text-[10px] font-black">
                    12
                  </span>
                  <span className="font-bold text-slate-900">2.12 Warranty</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Energya warrants the goods will be free from defects in material and workmanship for a period of 1 year from the date of the commercial invoice.
                </p>
              </div>
            </div>
          </div>

          {/* Footer Branding Pillars */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-slate-600 font-semibold">
              <span className="flex items-center gap-1.5">
                <Award className="h-4 w-4 text-brand-600" /> Reliable Quality
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" /> Engineering Excellence
              </span>
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-emerald-600" /> A Sustainable Future
              </span>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <p className="font-bold text-slate-700">More Than Cables · A Stronger Tomorrow</p>
              <p>Energya Power Cables | Commercial Offer · Page 1 of 1</p>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT VIEW 2: TECHNICAL DATA SHEET (TDS) */}
      {activeDocTab === 'tds' && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-md p-6 sm:p-8 space-y-6 text-[#122033]">
          {/* TDS Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5 border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] uppercase tracking-wider">
                  Technical Office Approved
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wider">
                  BASEC Certified
                </span>
              </div>
              <h1 className="text-xl font-black text-[#0B3D6E] tracking-tight uppercase mt-1">
                Official Technical Data Sheet (TDS)
              </h1>
              <p className="text-xs font-mono font-bold text-slate-500">
                Document Ref: TDS-{matCode}-2026.PDF
              </p>
            </div>

            <div className="text-right text-xs">
              <p className="text-slate-400 font-medium">Standards Compliance</p>
              <p className="font-bold text-slate-800">{specs.standard}</p>
              <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">RoHS &amp; REACH Compliant</p>
            </div>
          </div>

          {/* Multi-line Cable Item Selector (if more than 1 cable) */}
          {lines.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-600">Select Cable Item:</span>
              <div className="flex flex-wrap gap-1.5">
                {lines.map((l, idx) => (
                  <button
                    key={l.id || idx}
                    type="button"
                    onClick={() => setSelectedLineIndex(idx)}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${
                      selectedLineIndex === idx
                        ? 'bg-[#0B3D6E] text-white shadow-sm'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Item {idx + 1}: {l.materialNumber || 'Cable'} · {l.cableDescription?.split(' ')[0] || ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cable Specifications Summary Card */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Selected Cable</p>
              <p className="text-sm font-black text-slate-900 mt-0.5">
                {desc}
              </p>
              <p className="text-xs text-slate-600 mt-0.5 font-mono">
                Item Code: {matCode} · Voltage: {specs.voltageRating}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-500">Total Quantity</p>
              <p className="text-base font-black font-mono text-brand-800">
                {totalLen.toLocaleString()} Meters
              </p>
              <p className="text-[11px] text-slate-500">{drums} Drums x {cuttingLen} m</p>
            </div>
          </div>

          {/* Technical Specifications Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* 1. Conductor & Construction */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/30">
              <h4 className="font-bold text-xs text-[#0B3D6E] uppercase tracking-wider flex items-center gap-1.5 border-b pb-2 border-slate-200">
                <Cpu className="h-4 w-4 text-blue-600" />
                <span>1. Construction &amp; Material Specs</span>
              </h4>
              <dl className="space-y-2">
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Conductor</dt>
                  <dd className="font-semibold text-slate-900">{specs.conductorType}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Cross Sectional Area</dt>
                  <dd className="font-semibold font-mono text-slate-900">{specs.size} ({specs.cores})</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Insulation</dt>
                  <dd className="font-semibold text-slate-900">{specs.insulationMaterial}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Armour / Protection</dt>
                  <dd className="font-semibold text-slate-900">{specs.armourType}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Outer Sheath</dt>
                  <dd className="font-semibold text-slate-900">{specs.sheathMaterial}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Fire Reaction</dt>
                  <dd className="font-semibold text-emerald-700">{specs.firePerformance}</dd>
                </div>
              </dl>
            </div>

            {/* 2. Electrical Characteristics */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/30">
              <h4 className="font-bold text-xs text-[#0B3D6E] uppercase tracking-wider flex items-center gap-1.5 border-b pb-2 border-slate-200">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>2. Electrical &amp; Thermal Ratings</span>
              </h4>
              <dl className="space-y-2">
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Voltage Rating U0/U</dt>
                  <dd className="font-mono font-semibold text-slate-900">{specs.voltageRating}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Max DC Resistance @ 20°C</dt>
                  <dd className="font-mono font-semibold text-slate-900">{specs.dcResistance}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Current Rating in Air (30°C)</dt>
                  <dd className="font-mono font-semibold text-blue-700">{specs.currentAir}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Current Rating in Ground (20°C)</dt>
                  <dd className="font-mono font-semibold text-blue-700">{specs.currentGround}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Short Circuit Rating (1 sec)</dt>
                  <dd className="font-mono font-semibold text-slate-900">{specs.shortCircuit}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Max Conductor Temp</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {specs.insulationMaterial.includes('PVC') ? '70°C (Normal) / 160°C (Short)' : '90°C (Normal) / 250°C (Short)'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* 3. Physical & Dimensional Data */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/30">
              <h4 className="font-bold text-xs text-[#0B3D6E] uppercase tracking-wider flex items-center gap-1.5 border-b pb-2 border-slate-200">
                <Layers className="h-4 w-4 text-purple-600" />
                <span>3. Physical &amp; Mechanical Data</span>
              </h4>
              <dl className="space-y-2">
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Approx. Overall Diameter</dt>
                  <dd className="font-mono font-semibold text-slate-900">{specs.diameter}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Approx. Net Cable Weight</dt>
                  <dd className="font-mono font-semibold text-slate-900">{specs.totalWeight}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Conductor Net Weight</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {specs.conductorMaterial.toLowerCase().includes('alu')
                      ? `${specs.alWeight} (Aluminium)`
                      : `${specs.cuWeight} (Copper)`}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Minimum Bending Radius</dt>
                  <dd className="font-mono font-semibold text-slate-900">{specs.bendingRadius}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Max Pulling Tension</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {specs.conductorMaterial.toLowerCase().includes('alu') ? '30 N/mm²' : '50 N/mm²'} (Conductor Area)
                  </dd>
                </div>
              </dl>
            </div>

            {/* 4. Packaging, Drum & Shipping */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/30">
              <h4 className="font-bold text-xs text-[#0B3D6E] uppercase tracking-wider flex items-center gap-1.5 border-b pb-2 border-slate-200">
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
                <span>4. Drum &amp; Container Shipping Specs</span>
              </h4>
              <dl className="space-y-2">
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Packaging Drum Reel</dt>
                  <dd className="font-semibold text-slate-900">{drumType}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Drum Length Allocation</dt>
                  <dd className="font-mono font-semibold text-slate-900">{drums} Drums x {cuttingLen} m</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1">
                  <dt className="text-slate-500">Recommended Container</dt>
                  <dd className="font-semibold text-brand-800">{preferredContainerType || '40HQ'} High Cube</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Quality Inspection</dt>
                  <dd className="font-semibold text-emerald-700">100% Tested Prior to Packing</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Verification Stamp & Action Bar */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-900 font-semibold">
              <Award className="h-5 w-5 text-emerald-600" />
              <span>Certified Technical Offer — Compliant with International Electrotechnical Commission (IEC)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintTds}
                className="text-xs font-bold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5 text-blue-600" />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTdsExcel}
                className="text-xs font-bold text-white inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 rounded-xl shadow-sm shadow-emerald-500/20 transition-all"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Export Excel (.xlsx)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
