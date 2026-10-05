import { DrumMasterRecord, DrumSelectionInput, DrumSelectionResult } from '../types';
import { findDrumByCode, getActiveDrumMaster, resolveDrumDescription } from './drumMasterService';

export const EWD_AUTOMATIC_SELECTION_CODE = 'CONFIGURATION_REQUIRED';

const CAPACITY_WARNING =
  'Drum Master Excel Capacity remains CONFIGURATION_REQUIRED for UOM. TO-approved: Capacity populates MaxLoad (maxWeight) as permitted cable payload kg; native engine uses geo + MaxLoad, not Capacity as metres.';

const COMPATIBILITY_WARNING =
  'DrumCompatibility has no approved source rows. Diameter/length/weight ranking tables are not applied; ranking uses the native capacity engine only.';

function activeReference(drumMaster: DrumMasterRecord[]): DrumMasterRecord[] {
  return getActiveDrumMaster(drumMaster).slice().sort((a, b) => a.drumCode.localeCompare(b.drumCode));
}

/**
 * Drum selection boundary for ENERGYA Drum Master.
 * AUTOMATIC uses the native Technical Office capacity + optimization service when
 * MaxLoad / clearance engineering fields are present; otherwise CONFIGURATION_REQUIRED.
 */
export function selectDrum(input: DrumSelectionInput): DrumSelectionResult {
  const referenceDrums = activeReference(input.drumMaster);
  const prototypeDrumType = input.prototypeDrumType;

  if (input.method === 'AUTOMATIC') {
    const cutting = input.cuttingLengthMeters;
    const diameter = input.cableDiameterMm;
    const weight = input.cableWeightKgKm;
    if (
      cutting == null ||
      !Number.isFinite(cutting) ||
      cutting <= 0 ||
      diameter == null ||
      !Number.isFinite(diameter) ||
      diameter <= 0 ||
      weight == null ||
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      return {
        method: 'AUTOMATIC',
        status: 'CONFIGURATION_REQUIRED',
        selectedDrum: null,
        prototypeDrumType,
        referenceDrums,
        blockingReasons: [
          'Automatic drum optimization requires cutting length, cable diameter, and cable weight (kg/km).',
        ],
        warnings: [CAPACITY_WARNING, COMPATIBILITY_WARNING],
      };
    }

    return {
      method: 'AUTOMATIC',
      status: 'CONFIGURATION_REQUIRED',
      selectedDrum: null,
      prototypeDrumType,
      referenceDrums,
      blockingReasons: [
        'Automatic EWD optimization runs through the drum selection API. Use Drum Selection (Automatic Optimization) on the inquiry line.',
      ],
      warnings: [CAPACITY_WARNING, COMPATIBILITY_WARNING],
    };
  }

  const code = (input.selectedDrumCode || '').trim();
  if (!code) {
    return {
      method: 'MANUAL',
      status: 'SELECTED_MANUAL_PROTOTYPE',
      selectedDrum: null,
      prototypeDrumType,
      referenceDrums,
      blockingReasons: [],
      warnings: referenceDrums.length
        ? ['No EWD Drum Master code linked. Prototype drum type remains the operational selection.']
        : ['Drum Master is empty. Import Drum List.xlsx via Import Center before linking an EWD code.'],
    };
  }

  if (!input.drumMaster.length) {
    return {
      method: 'MANUAL',
      status: 'MASTER_EMPTY',
      selectedDrum: null,
      prototypeDrumType,
      referenceDrums: [],
      blockingReasons: [
        `Drum Master has no records. Cannot link ${code}. Import Drum List.xlsx through Import Center.`,
      ],
      warnings: [],
    };
  }

  const found = findDrumByCode(code, input.drumMaster);
  if (!found) {
    return {
      method: 'MANUAL',
      status: 'DRUM_NOT_FOUND',
      selectedDrum: null,
      prototypeDrumType,
      referenceDrums,
      blockingReasons: [`Drum code ${code} is not in Drum Master. Do not invent a drum.`],
      warnings: [],
    };
  }

  if (found.status !== 'ACTIVE') {
    return {
      method: 'MANUAL',
      status: 'DRUM_INACTIVE',
      selectedDrum: null,
      prototypeDrumType,
      referenceDrums,
      blockingReasons: [`Drum ${found.drumCode} is ${found.status}. Inactive/superseded drums cannot be selected.`],
      warnings: [],
    };
  }

  return {
    method: 'MANUAL',
    status: 'SELECTED_MANUAL_EWD',
    selectedDrum: found,
    prototypeDrumType,
    referenceDrums,
    blockingReasons: [],
    warnings: [
      CAPACITY_WARNING,
      COMPATIBILITY_WARNING,
      'Linked EWD code is a master-data reference. Prototype reel type on the schedule row is unchanged.',
    ],
  };
}

export function searchDrumMasterReference(
  drumMaster: DrumMasterRecord[],
  query: string
): DrumMasterRecord[] {
  const q = query.trim().toLowerCase();
  const active = activeReference(drumMaster);
  if (!q) return active;
  return active.filter(
    (d) =>
      d.drumCode.toLowerCase().includes(q) || resolveDrumDescription(d).toLowerCase().includes(q)
  );
}
