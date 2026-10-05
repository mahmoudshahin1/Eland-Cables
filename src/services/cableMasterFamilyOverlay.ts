import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { PrismaClient } from '@prisma/client';
import { asTrimmedString, getExcelVal } from './excelFieldUtils';
import { parseCableDescription } from './cableCatalogService';

export const CABLE_PARAMETERS_SOURCE = 'data/source/Cables Parameters_1.xlsx';
export const ENERGYA_CABLE_LIST_SOURCE = 'data/source/Energya Cable Master Data.xlsx';

export type CableMasterFamilyPatch = {
  materialNumber: string;
  description?: string;
  family?: string;
  voltage?: string;
  conductor?: string;
  conductorSize?: string;
  cores?: string;
  insulation?: string;
  screen?: string;
  armour?: string;
  sheath?: string;
  sheathColour?: string;
  coreColour?: string;
  standard?: string;
  source: 'CABLES_PARAMETERS' | 'ENERGYA_DESC_FAMILY';
};

function voltageFromDescription(desc: string): string | undefined {
  const match = desc.match(/(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*kV)/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : undefined;
}

function loadSheetRows(filePath: string, sheetName?: string): Record<string, unknown>[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return [];
  const wb = XLSX.read(fs.readFileSync(resolved), { type: 'buffer' });
  const name = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
}

function dashToNull(value: string): string | undefined {
  const v = value.trim();
  if (!v || v === '-' || v === '—') return undefined;
  return v;
}

export function loadCableFamilyPatchesFromSourceWorkbooks(rootDir = process.cwd()): {
  parameterPatches: CableMasterFamilyPatch[];
  energyaDescriptionPatches: CableMasterFamilyPatch[];
} {
  const paramRows = loadSheetRows(path.join(rootDir, CABLE_PARAMETERS_SOURCE));
  const parameterPatches: CableMasterFamilyPatch[] = [];
  for (const row of paramRows) {
    const materialNumber = asTrimmedString(
      getExcelVal(row, ['Material Number', 'Cable Material Number', 'Cable Code'])
    );
    if (!materialNumber) continue;
    const description = asTrimmedString(getExcelVal(row, ['Description', 'Cable Desc', 'Cable Description']));
    const family = asTrimmedString(getExcelVal(row, ['Family', 'Cable Family']));
    const conductor = asTrimmedString(getExcelVal(row, ['Conductor Type', 'Conductor']));
    const conductorSize = asTrimmedString(
      getExcelVal(row, ['Cross section area (mm2)', 'Conductor Size', 'Cross Section'])
    );
    const cores = asTrimmedString(getExcelVal(row, ['Nb.Cores', 'Core Count', 'Cores']));
    const insulation = asTrimmedString(getExcelVal(row, ['Insulation']));
    const screen = dashToNull(asTrimmedString(getExcelVal(row, ['Screen Type', 'Screen'])));
    const armour = dashToNull(asTrimmedString(getExcelVal(row, ['Armour type', 'Armour', 'Armor'])));
    const sheath = asTrimmedString(getExcelVal(row, ['Sheath']));
    const sheathColour = asTrimmedString(getExcelVal(row, ['Sheath Color', 'Sheath Colour']));
    const coreColour = asTrimmedString(getExcelVal(row, ['Core Colors', 'Core Colour', 'Core Color']));
    const standard = asTrimmedString(getExcelVal(row, ['Standard']));
    parameterPatches.push({
      materialNumber,
      description: description || undefined,
      family: family || undefined,
      voltage: description ? voltageFromDescription(description) : undefined,
      conductor: conductor || undefined,
      conductorSize: conductorSize || undefined,
      cores: cores || undefined,
      insulation: insulation || undefined,
      screen,
      armour,
      sheath: sheath || undefined,
      sheathColour: sheathColour || undefined,
      coreColour: coreColour || undefined,
      standard: standard || undefined,
      source: 'CABLES_PARAMETERS',
    });
  }

  const energyaRows = loadSheetRows(path.join(rootDir, ENERGYA_CABLE_LIST_SOURCE), 'Cable List');
  const energyaDescriptionPatches: CableMasterFamilyPatch[] = [];
  const paramByMat = new Set(parameterPatches.map((p) => p.materialNumber.toLowerCase()));
  for (const row of energyaRows) {
    const materialNumber = asTrimmedString(
      getExcelVal(row, ['Cable Material Number', 'Material Number', 'Cable Code'])
    );
    if (!materialNumber) continue;
    const description = asTrimmedString(getExcelVal(row, ['Cable Desc', 'Cable Description', 'Description']));
    const parsedFamily = description ? parseCableDescription(description).voltageClass : undefined;
    energyaDescriptionPatches.push({
      materialNumber,
      description: description || undefined,
      family: paramByMat.has(materialNumber.toLowerCase()) ? undefined : parsedFamily,
      voltage: description ? voltageFromDescription(description) : undefined,
      source: 'ENERGYA_DESC_FAMILY',
    });
  }

  return { parameterPatches, energyaDescriptionPatches };
}

const STANDARD_FAMILIES = new Set(['LV', 'MV', 'HV', 'CONTROL', 'EHV']);

function isStandardFamily(value: string | null | undefined): boolean {
  return STANDARD_FAMILIES.has((value || '').trim().toUpperCase());
}

type CableMasterWriter = PrismaClient;

export async function applyCableMasterFamilyOverlay(
  prisma: CableMasterWriter,
  rootDir = process.cwd()
): Promise<{
  parameterUpdated: number;
  energyaFamilyUpdated: number;
  descriptionUpdated: number;
  skippedMissing: number;
  totalActiveAfter?: undefined;
}> {
  const { parameterPatches, energyaDescriptionPatches } = loadCableFamilyPatchesFromSourceWorkbooks(rootDir);
  let parameterUpdated = 0;
  let energyaFamilyUpdated = 0;
  let descriptionUpdated = 0;
  let skippedMissing = 0;

  const applyOne = async (patch: CableMasterFamilyPatch, fromParameters: boolean) => {
    const existing = await prisma.cableMaster.findUnique({
      where: { materialNumber: patch.materialNumber },
      select: {
        materialNumber: true,
        description: true,
        family: true,
        voltage: true,
        conductor: true,
        conductorSize: true,
        cores: true,
        insulation: true,
        screen: true,
        armour: true,
        sheath: true,
        sheathColour: true,
        coreColour: true,
        standard: true,
      },
    });
    if (!existing) {
      skippedMissing += 1;
      return;
    }
    const data: Record<string, string> = {};
    if (patch.description && patch.description !== String(existing.description || '')) {
      data.description = patch.description;
    }
    if (patch.family) {
      const current = String(existing.family || '').trim();
      if (!current || fromParameters || !isStandardFamily(current)) {
        if (current !== patch.family) data.family = patch.family;
      }
    }
    const optionalKeys = [
      'voltage',
      'conductor',
      'conductorSize',
      'cores',
      'insulation',
      'screen',
      'armour',
      'sheath',
      'sheathColour',
      'coreColour',
      'standard',
    ] as const;
    for (const key of optionalKeys) {
      const incoming = patch[key];
      if (!incoming) continue;
      const current = existing[key];
      if (fromParameters || current == null || String(current).trim() === '') {
        if (String(current || '') !== incoming) data[key] = incoming;
      }
    }
    if (Object.keys(data).length === 0) return;
    await prisma.cableMaster.update({
      where: { materialNumber: patch.materialNumber },
      data,
    });
    if (data.family) {
      if (fromParameters) parameterUpdated += 1;
      else energyaFamilyUpdated += 1;
    } else if (fromParameters) {
      parameterUpdated += 1;
    }
    if (data.description) descriptionUpdated += 1;
  };

  for (const patch of parameterPatches) {
    await applyOne(patch, true);
  }
  for (const patch of energyaDescriptionPatches) {
    await applyOne(patch, false);
  }

  return { parameterUpdated, energyaFamilyUpdated, descriptionUpdated, skippedMissing };
}
