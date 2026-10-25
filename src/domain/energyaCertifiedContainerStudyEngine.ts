/**
 * Energya Certified Container Study Engine
 * 
 * Strict 1-to-1 TypeScript implementation of the company's official certified
 * Excel Container Study macro (Container Study.xlsm -> Sub Container_New & Function Container).
 * 
 * Container Interior Standards:
 * - Internal Width: 2,350 mm
 * - Usable Length: 12,000 mm (40ft) / 5,900 mm (20ft)
 * - Maximum Payload Capacity: 26,000 kg (26 Metric Tons)
 * 
 * Container Type Resolution (Excel Row 3 Formula):
 * - If any drum flange >= 2600 mm  --> "40 Open Top"
 * - Else if drum flange >= 2300 mm  --> "40 HQ" (High Cube)
 * - Else if used length <= 5900 mm (remaining >= 6100 mm) --> "20 STD"
 * - Else --> "40 STD"
 * 
 * Packing Allocation (Lines across 2,350 mm width):
 * - Line 1: Primary drum along length
 * - Line 2: Side-by-side if (2350 - width_line1) >= width_drum
 * - Line 3: Side-by-side if remaining width >= width_drum
 * - New Row: Started along length if side-by-side width exhausted
 * - Virtual Layer 2: Small drums (flange < 1050 mm) stackable
 */

export type StuffingMethod = 'Rolling' | 'Forklifting';

export type CertifiedContainerTypeCode = '20 STD' | '40 STD' | '40 HQ' | '40 Open Top';

export interface CertifiedDrumInput {
  drumCode: string;
  flangeMm: number;
  widthMm: number;
  grossWeightKg: number;
  quantity: number;
  cuttingLengthM?: number;
  cableDesc?: string;
  cableCode?: string;
}

export interface PlacedDrumPosition {
  drumId: string;
  drumCode: string;
  flangeMm: number;
  widthMm: number;
  grossWeightKg: number;
  cuttingLengthM?: number;
  cableDesc?: string;
  cableCode?: string;
  rowIdx: number;       // 1-based row index along length
  lineIdx: number;      // 1: Port/Left, 2: Center/Right, 3: Far Right
  xMm: number;          // center X position along container length from front bulkhead (mm)
  yMm: number;          // center Y position across container width from port side (mm)
  diameterMm: number;   // flange diameter (mm)
  widthAcrossMm: number;// outer drum width (mm)
  isSecondLayer?: boolean;
}

export interface CertifiedContainerRow {
  rowIdx: number;
  maxFlangeMm: number;
  remainingWidthMm: number;
  drums: PlacedDrumPosition[];
}

export interface CertifiedContainerResult {
  containerIndex: number;
  containerType: CertifiedContainerTypeCode;
  typeCodeKey: '20STD' | '40STD' | '40HQ' | '40OT';
  usableLengthMm: number;
  internalWidthMm: number;
  maxPayloadKg: number;
  usedLengthMm: number;
  remainingLengthMm: number;
  totalGrossWeightKg: number;
  remainingWeightKg: number;
  cwlePercent: number; // Container Weight Load Efficiency %
  cllePercent: number; // Container Length Load Efficiency %
  drumCount: number;
  placedDrums: PlacedDrumPosition[];
  rows: CertifiedContainerRow[];
  secondLayerDrums: PlacedDrumPosition[];
}

export interface CertifiedStudySummary {
  totalContainers: number;
  count40HQ: number;
  count40STD: number;
  count20STD: number;
  count40OT: number;
  optimalContainerType: '20STD' | '40STD' | '40HQ' | '40OT';
  optimalContainerLabel: string;
  optimalContainersNeeded: number;
  overallWeightUtilizationPct: number;
  overallLengthUtilizationPct: number;
  stuffingMethod: StuffingMethod;
  containers: CertifiedContainerResult[];
}

/** Standard dimensions for Energya Drum Master codes */
export const ENERGYA_DRUM_SPECS_LOOKUP: Record<string, { flange: number; width: number; tareKg: number }> = {
  'EWD630-0': { flange: 630, width: 760, tareKg: 50 },
  'EWD630-T06': { flange: 630, width: 403, tareKg: 42 },
  'EWD700-3': { flange: 700, width: 760, tareKg: 65 },
  'EWD800-9': { flange: 800, width: 820, tareKg: 85 },
  'EWD900-0': { flange: 900, width: 820, tareKg: 110 },
  'EWD1000-0': { flange: 1000, width: 860, tareKg: 135 },
  'EWD1100-0': { flange: 1100, width: 900, tareKg: 160 },
  'EWD1200-0': { flange: 1200, width: 950, tareKg: 180 },
  'EWD1400-0': { flange: 1400, width: 1000, tareKg: 210 },
  'EWD1600-0': { flange: 1600, width: 1050, tareKg: 240 },
  'EWD1700-10': { flange: 1700, width: 1080, tareKg: 260 },
  'EWD1800-0': { flange: 1800, width: 1100, tareKg: 280 },
  'EWD2000-0': { flange: 2000, width: 1150, tareKg: 350 },
  'EWD2200-0': { flange: 2200, width: 1200, tareKg: 450 },
  'EWD2400-0': { flange: 2400, width: 1300, tareKg: 550 },
  'EWD2600-0': { flange: 2600, width: 1400, tareKg: 700 },
  'EWD2800-0': { flange: 2800, width: 1500, tareKg: 900 },
  'EWD3000-7': { flange: 3000, width: 1650, tareKg: 1200 },
};

/**
 * Resolves standard drum dimensions and weight from drum code and cable specs.
 */
export function resolveDrumMasterPhysicalDimensions(
  drumCode: string,
  cuttingLengthM: number = 500,
  approxWeightKgKm: number = 6532
): { flangeMm: number; widthMm: number; grossWeightKg: number; tareWeightKg: number } {
  const normalized = (drumCode || '').trim().toUpperCase();
  const known = ENERGYA_DRUM_SPECS_LOOKUP[normalized];

  let flangeMm = 1700;
  let widthMm = 1080;
  let tareWeightKg = 260;

  if (known) {
    flangeMm = known.flange;
    widthMm = known.width;
    tareWeightKg = known.tareKg;
  } else {
    // Attempt parse numeric flange from code (e.g. EWD1700 -> 1700)
    const match = normalized.match(/EWD(\d+)/i) || normalized.match(/(\d{3,4})/);
    if (match) {
      const parsedFlange = parseInt(match[1], 10);
      if (parsedFlange >= 500 && parsedFlange <= 3500) {
        flangeMm = parsedFlange;
        widthMm = Math.round(parsedFlange * 0.64);
        tareWeightKg = Math.round(parsedFlange * 0.15);
      }
    }
  }

  const cableNetWeightKg = Math.round((cuttingLengthM / 1000) * approxWeightKgKm);
  const grossWeightKg = cableNetWeightKg + tareWeightKg;

  return { flangeMm, widthMm, grossWeightKg, tareWeightKg };
}

/**
 * Executes the certified Container Study calculation matching Container Study.xlsm
 */
export function calculateCertifiedContainerStudy(
  drumsInput: CertifiedDrumInput[],
  stuffingMethod: StuffingMethod = 'Rolling',
  maxPayloadKg: number = 26000
): CertifiedStudySummary {
  // 1. Expand input items by quantity
  interface ExpandedDrum {
    drumId: string;
    drumCode: string;
    flange: number;
    width: number;
    grossWeight: number;
    cuttingLengthM?: number;
    cableDesc?: string;
    cableCode?: string;
  }

  const expanded: ExpandedDrum[] = [];
  let seq = 1;

  for (const item of drumsInput) {
    const qty = Math.max(0, Math.floor(item.quantity || 0));
    for (let i = 0; i < qty; i++) {
      expanded.push({
        drumId: `drum-${seq++}`,
        drumCode: item.drumCode || `EWD${item.flangeMm}`,
        flange: Math.max(100, item.flangeMm || 1000),
        width: Math.max(100, item.widthMm || 800),
        grossWeight: Math.max(10, item.grossWeightKg || 500),
        cuttingLengthM: item.cuttingLengthM,
        cableDesc: item.cableDesc,
        cableCode: item.cableCode,
      });
    }
  }

  // 2. Sort according to Stuffing Method (exact VBA sort order)
  if (stuffingMethod === 'Rolling') {
    // Sort descending by Flange, then Width
    expanded.sort((a, b) => b.flange - a.flange || b.width - a.width);
  } else {
    // Forklifting: sort descending by Width, then Flange
    expanded.sort((a, b) => b.width - a.width || b.flange - a.flange);
  }

  // 3. Container Packing Data Structures
  interface InternalContainerWorking {
    containerIndex: number;
    usableLengthMm: number;
    internalWidthMm: number;
    maxPayloadKg: number;
    remainingWeightKg: number;
    remainingLengthMm: number;
    rows: Array<{
      rowIdx: number;
      maxFlangeMm: number;
      remainingWidthMm: number;
      drums: PlacedDrumPosition[];
    }>;
    secondLayerDrums: PlacedDrumPosition[];
  }

  const containers: InternalContainerWorking[] = [];

  function createContainer(idx: number): InternalContainerWorking {
    return {
      containerIndex: idx,
      usableLengthMm: 12000, // initially 40ft usable length
      internalWidthMm: 2350, // standard container internal width
      maxPayloadKg,
      remainingWeightKg: maxPayloadKg,
      remainingLengthMm: 12000,
      rows: [],
      secondLayerDrums: [],
    };
  }

  // 4. Load drums into containers
  for (const drum of expanded) {
    let loaded = false;

    for (let c = 0; c < 1000; c++) {
      if (!containers[c]) {
        containers[c] = createContainer(c + 1);
      }
      const cont = containers[c];

      // Check remaining payload weight
      if (drum.grossWeight > cont.remainingWeightKg) {
        continue; // Cannot fit in this container due to weight limit
      }

      // Check Line 3 side-by-side in existing rows (if Line 2 is filled and Line 3 is empty)
      for (let r = 0; r < cont.rows.length; r++) {
        const row = cont.rows[r];
        if (row.drums.length === 2 && stuffingMethod === 'Rolling') {
          if (row.remainingWidthMm >= drum.width) {
            const placed: PlacedDrumPosition = {
              drumId: drum.drumId,
              drumCode: drum.drumCode,
              flangeMm: drum.flange,
              widthMm: drum.width,
              grossWeightKg: drum.grossWeight,
              cuttingLengthM: drum.cuttingLengthM,
              cableDesc: drum.cableDesc,
              cableCode: drum.cableCode,
              rowIdx: row.rowIdx,
              lineIdx: 3,
              xMm: 0,
              yMm: 0,
              diameterMm: drum.flange,
              widthAcrossMm: drum.width,
            };
            row.drums.push(placed);
            row.remainingWidthMm -= drum.width;
            row.maxFlangeMm = Math.max(row.maxFlangeMm, drum.flange);
            cont.remainingWeightKg -= drum.grossWeight;
            loaded = true;
            break;
          }
        }
      }
      if (loaded) break;

      // Check Line 2 side-by-side in existing rows (if Line 1 is filled and Line 2 is empty)
      for (let r = 0; r < cont.rows.length; r++) {
        const row = cont.rows[r];
        if (row.drums.length === 1 && stuffingMethod === 'Rolling') {
          if (row.remainingWidthMm >= drum.width) {
            const placed: PlacedDrumPosition = {
              drumId: drum.drumId,
              drumCode: drum.drumCode,
              flangeMm: drum.flange,
              widthMm: drum.width,
              grossWeightKg: drum.grossWeight,
              cuttingLengthM: drum.cuttingLengthM,
              cableDesc: drum.cableDesc,
              cableCode: drum.cableCode,
              rowIdx: row.rowIdx,
              lineIdx: 2,
              xMm: 0,
              yMm: 0,
              diameterMm: drum.flange,
              widthAcrossMm: drum.width,
            };
            row.drums.push(placed);
            row.remainingWidthMm -= drum.width;
            row.maxFlangeMm = Math.max(row.maxFlangeMm, drum.flange);
            cont.remainingWeightKg -= drum.grossWeight;
            loaded = true;
            break;
          }
        }
      }
      if (loaded) break;

      // Start New Row (Line 1) along length
      if (drum.flange <= cont.remainingLengthMm) {
        const rowIdx = cont.rows.length + 1;
        const placed: PlacedDrumPosition = {
          drumId: drum.drumId,
          drumCode: drum.drumCode,
          flangeMm: drum.flange,
          widthMm: drum.width,
          grossWeightKg: drum.grossWeight,
          cuttingLengthM: drum.cuttingLengthM,
          cableDesc: drum.cableDesc,
          cableCode: drum.cableCode,
          rowIdx,
          lineIdx: 1,
          xMm: 0,
          yMm: 0,
          diameterMm: drum.flange,
          widthAcrossMm: drum.width,
        };

        cont.rows.push({
          rowIdx,
          maxFlangeMm: drum.flange,
          remainingWidthMm: cont.internalWidthMm - drum.width,
          drums: [placed],
        });
        cont.remainingLengthMm -= drum.flange;
        cont.remainingWeightKg -= drum.grossWeight;
        loaded = true;
        break;
      }

      // Check second layer for small drums (< 1050 mm)
      if (!loaded && drum.flange < 1050) {
        const baseSmallDrumsCount = cont.rows.reduce(
          (sum, r) => sum + r.drums.filter((d) => d.flangeMm < 1050).length,
          0
        );
        if (cont.secondLayerDrums.length < baseSmallDrumsCount) {
          const placed: PlacedDrumPosition = {
            drumId: drum.drumId,
            drumCode: drum.drumCode,
            flangeMm: drum.flange,
            widthMm: drum.width,
            grossWeightKg: drum.grossWeight,
            cuttingLengthM: drum.cuttingLengthM,
            cableDesc: drum.cableDesc,
            cableCode: drum.cableCode,
            rowIdx: 1,
            lineIdx: 1,
            xMm: 0,
            yMm: 0,
            diameterMm: drum.flange,
            widthAcrossMm: drum.width,
            isSecondLayer: true,
          };
          cont.secondLayerDrums.push(placed);
          cont.remainingWeightKg -= drum.grossWeight;
          loaded = true;
          break;
        }
      }
    }
  }

  // 5. Finalize containers & calculate 2D physical coordinates
  const activeWorking = containers.filter(
    (c) => c && (c.rows.length > 0 || c.secondLayerDrums.length > 0)
  );

  const finalizedContainers: CertifiedContainerResult[] = activeWorking.map((cont) => {
    const allDrumsInCont: PlacedDrumPosition[] = [];
    cont.rows.forEach((r) => allDrumsInCont.push(...r.drums));
    allDrumsInCont.push(...cont.secondLayerDrums);

    const maxFlange = allDrumsInCont.reduce((m, d) => Math.max(m, d.flangeMm), 0);
    const usedLength = 12000 - cont.remainingLengthMm;

    let containerType: CertifiedContainerTypeCode = '40 STD';
    let typeCodeKey: '20STD' | '40STD' | '40HQ' | '40OT' = '40STD';
    let usableLength = 12000;
    let remainingLength = cont.remainingLengthMm;

    // Excel Post-adjustment formula in Row 3:
    // If remaining length >= 6100 (used <= 5900) and maxFlange < 2300:
    if (cont.remainingLengthMm >= 6100 && maxFlange < 2300) {
      usableLength = 5900;
      remainingLength = Math.max(0, 5900 - usedLength);
      containerType = '20 STD';
      typeCodeKey = '20STD';
    } else if (maxFlange >= 2600) {
      containerType = '40 Open Top';
      typeCodeKey = '40OT';
    } else if (maxFlange >= 2300) {
      containerType = '40 HQ';
      typeCodeKey = '40HQ';
    } else {
      containerType = '40 STD';
      typeCodeKey = '40STD';
    }

    const totalGrossWeight = cont.maxPayloadKg - cont.remainingWeightKg;
    const remainingWeight = Math.max(0, cont.maxPayloadKg - totalGrossWeight);
    const cwlePercent = Math.min(100, Math.round((totalGrossWeight / cont.maxPayloadKg) * 100));
    const cllePercent = Math.min(100, Math.round((usedLength / usableLength) * 100));

    // Assign realistic 2D coordinates for visual rendering
    // Container length runs from X=0 (Front Bulkhead) to X=usableLength (Door end)
    // Container width runs from Y=0 (Port/Left) to Y=2350 (Starboard/Right)
    let currentX = 60; // offset from front wall

    cont.rows.forEach((row) => {
      const rowLen = row.maxFlangeMm;
      const drumCenterX = currentX + rowLen / 2;

      const drumCountInRow = row.drums.length;
      if (drumCountInRow === 1) {
        // Centered across width or port-aligned
        row.drums[0].xMm = drumCenterX;
        row.drums[0].yMm = 1175; // center of 2,350 mm
      } else if (drumCountInRow === 2) {
        // Line 1: Port side, Line 2: Starboard side
        row.drums[0].xMm = drumCenterX;
        row.drums[0].yMm = row.drums[0].widthMm / 2 + 50;

        row.drums[1].xMm = drumCenterX;
        row.drums[1].yMm = 2350 - (row.drums[1].widthMm / 2 + 50);
      } else if (drumCountInRow >= 3) {
        // 3 side-by-side
        row.drums[0].xMm = drumCenterX;
        row.drums[0].yMm = row.drums[0].widthMm / 2 + 30;

        row.drums[1].xMm = drumCenterX;
        row.drums[1].yMm = 1175;

        row.drums[2].xMm = drumCenterX;
        row.drums[2].yMm = 2350 - (row.drums[2].widthMm / 2 + 30);
      }

      currentX += rowLen + 40; // gap between rows
    });

    return {
      containerIndex: cont.containerIndex,
      containerType,
      typeCodeKey,
      usableLengthMm: usableLength,
      internalWidthMm: cont.internalWidthMm,
      maxPayloadKg: cont.maxPayloadKg,
      usedLengthMm: usedLength,
      remainingLengthMm: remainingLength,
      totalGrossWeightKg: totalGrossWeight,
      remainingWeightKg: remainingWeight,
      cwlePercent,
      cllePercent,
      drumCount: allDrumsInCont.length,
      placedDrums: allDrumsInCont,
      rows: cont.rows,
      secondLayerDrums: cont.secondLayerDrums,
    };
  });

  // 6. Summary metrics matching J2:J5 in Excel
  const count40HQ = finalizedContainers.filter((c) => c.typeCodeKey === '40HQ').length;
  const count40STD = finalizedContainers.filter((c) => c.typeCodeKey === '40STD').length;
  const count20STD = finalizedContainers.filter((c) => c.typeCodeKey === '20STD').length;
  const count40OT = finalizedContainers.filter((c) => c.typeCodeKey === '40OT').length;
  const totalContainers = finalizedContainers.length;

  // Determine optimal container type:
  // If only 1 container and it's 20 STD -> 20STD
  // If any 40HQ used -> 40HQ
  // Else if 40OT -> 40OT
  // Else if count40STD > 0 -> 40STD
  // Default: 20STD if total <= 1 and fits, else 40HQ
  let optimalContainerType: '20STD' | '40STD' | '40HQ' | '40OT' = '20STD';
  let optimalContainerLabel = '20\' Standard (20 STD)';
  let optimalContainersNeeded = Math.max(1, totalContainers);

  if (count40OT > 0) {
    optimalContainerType = '40OT';
    optimalContainerLabel = '40\' Open Top (40 OT)';
  } else if (count40HQ > 0) {
    optimalContainerType = '40HQ';
    optimalContainerLabel = '40\' High Cube (40 HQ)';
  } else if (count40STD > 0) {
    optimalContainerType = '40STD';
    optimalContainerLabel = '40\' Standard (40 STD)';
  } else if (count20STD > 0) {
    optimalContainerType = '20STD';
    optimalContainerLabel = '20\' Standard (20 STD)';
  }

  const overallWeightUtilizationPct =
    totalContainers > 0
      ? Math.round(
          (finalizedContainers.reduce((sum, c) => sum + c.totalGrossWeightKg, 0) /
            (totalContainers * maxPayloadKg)) *
            100
        )
      : 0;

  const overallLengthUtilizationPct =
    totalContainers > 0
      ? Math.round(
          (finalizedContainers.reduce((sum, c) => sum + c.usedLengthMm, 0) /
            finalizedContainers.reduce((sum, c) => sum + c.usableLengthMm, 0)) *
            100
        )
      : 0;

  return {
    totalContainers,
    count40HQ,
    count40STD,
    count20STD,
    count40OT,
    optimalContainerType,
    optimalContainerLabel,
    optimalContainersNeeded,
    overallWeightUtilizationPct,
    overallLengthUtilizationPct,
    stuffingMethod,
    containers: finalizedContainers,
  };
}
