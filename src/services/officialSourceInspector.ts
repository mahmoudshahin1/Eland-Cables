import fs from 'node:fs';
import path from 'node:path';

export const OFFICIAL_CABLE_WORKBOOK = 'Energya Cable Master Data.xlsx';
export const OFFICIAL_RM_WORKBOOK = 'Raw Material List.xlsx';
export const OFFICIAL_DRUM_WORKBOOK = 'Drum List.xlsx';

const SEARCH_DIRS = ['data/source', 'public/source'];

export interface OfficialFileProbe {
  fileName: string;
  found: boolean;
  pathsChecked: string[];
  resolvedPath: string | null;
}

export interface OfficialOnboardingStatus {
  status: 'AVAILABLE' | 'DATA_REQUIRED';
  productionOnboarding: 'STOPPED' | 'READY';
  files: OfficialFileProbe[];
  priorInspectionWhenPresent: {
    workbook: string;
    worksheets: Array<{ name: string; approxRowCount: number; notes: string }>;
    cableListColumns: string[];
    uniqueness: {
      materialNumber: string;
      itemCode: string;
      customerCode: string;
    };
    bomDuplicateGroupsApprox: number;
    rawMaterialPriceState: string;
  };
  message: string;
}

function probe(fileName: string, cwd = process.cwd()): OfficialFileProbe {
  const pathsChecked = SEARCH_DIRS.map((dir) => path.join(cwd, dir, fileName));
  const resolvedPath = pathsChecked.find((p) => fs.existsSync(p)) || null;
  return { fileName, found: Boolean(resolvedPath), pathsChecked, resolvedPath };
}

/**
 * Official ENERGYA workbooks are not modified. If they are absent, production
 * Cable Master onboarding stops. Prior inspection (when files were present)
 * is recorded so mapping is not invented.
 */
export function inspectOfficialSourceAvailability(cwd = process.cwd()): OfficialOnboardingStatus {
  const files = [
    probe(OFFICIAL_CABLE_WORKBOOK, cwd),
    probe(OFFICIAL_RM_WORKBOOK, cwd),
    probe(OFFICIAL_DRUM_WORKBOOK, cwd),
  ];
  const cable = files[0];
  const available = cable.found;
  return {
    status: available ? 'AVAILABLE' : 'DATA_REQUIRED',
    productionOnboarding: available ? 'READY' : 'STOPPED',
    files,
    priorInspectionWhenPresent: {
      workbook: OFFICIAL_CABLE_WORKBOOK,
      worksheets: [
        {
          name: 'Cable List',
          approxRowCount: 432,
          notes: 'Identity + description + diameter + weight. No family/voltage/insulation columns.',
        },
        {
          name: 'Cable Materials',
          approxRowCount: 4986,
          notes: '~83 Cable+RM pairs with different Weight values. No version/plant/route/dates.',
        },
      ],
      cableListColumns: [
        'Specification Code',
        'Item Code',
        'Cable Material Number',
        'Eland Item Number',
        'Cable Desc',
        'Total Cable Weight',
        'Cable Diameter',
      ],
      uniqueness: {
        materialNumber: 'unique in source (natural key)',
        itemCode: 'NOT globally unique',
        customerCode: 'NOT globally unique',
      },
      bomDuplicateGroupsApprox: 83,
      rawMaterialPriceState: 'All prices blank → PRICE_NOT_CONFIGURED; do not store 0',
    },
    message: available
      ? 'Official Cable List workbook is present. Analyze then import via Import Center; do not modify the file.'
      : 'Official Cable List workbook is not in this workspace. Production Cable Master onboarding is STOPPED (DATA_REQUIRED). Do not fabricate ENERGYA cables. Import pipeline and schema remain testable with explicitly labeled fixture data.',
  };
}
