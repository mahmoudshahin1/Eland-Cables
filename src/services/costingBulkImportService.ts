import * as XLSX from 'xlsx';
import { commitKind, previewKind } from './importPipelineService';

export type CostingBulkImportKind =
  | 'raw_materials'
  | 'raw_material_prices'
  | 'boms'
  | 'scrap_rules'
  | 'currencies'
  | 'exchange_rates'
  | 'metal_cost_components';

export const COSTING_BULK_IMPORT_OPTIONS: Array<{ id: CostingBulkImportKind; label: string }> = [
  { id: 'raw_materials', label: 'Raw Materials' },
  { id: 'raw_material_prices', label: 'Raw Material Prices' },
  { id: 'boms', label: 'Cable BOM' },
  { id: 'scrap_rules', label: 'Scrap Rules' },
  { id: 'currencies', label: 'Currencies' },
  { id: 'exchange_rates', label: 'Exchange Rates' },
  { id: 'metal_cost_components', label: 'Metal Cost Components' },
];

const TEMPLATE_HEADERS: Record<CostingBulkImportKind, string[]> = {
  raw_materials: [
    'Raw Material Code',
    'Description',
    'Short Description',
    'Material Type',
    'UOM',
    'Pricing Category',
    'Metal Type',
    'Active',
    'Notes',
  ],
  raw_material_prices: [
    'Raw Material Code',
    'Currency',
    'Unit Price',
    'UOM',
    'Effective From',
    'Effective To',
    'Approval Status',
    'Active',
    'Notes',
  ],
  boms: [
    'Cable Material Number',
    'Raw Material Code',
    'Consumption',
    'UOM',
    'Scrap %',
    'Effective From',
    'Active',
  ],
  scrap_rules: ['Family', 'Metal', 'Scrap %', 'Status', 'Notes'],
  currencies: ['Code', 'Name', 'Symbol', 'Base Currency', 'Decimal Places', 'Active', 'Notes'],
  exchange_rates: [
    'From Currency',
    'To Currency',
    'Rate to Base',
    'Effective From',
    'Effective To',
    'Status',
    'Notes',
  ],
  metal_cost_components: [
    'Metal',
    'Component Type',
    'Value',
    'Currency',
    'Price Basis',
    'Effective From',
    'Effective To',
    'Status',
    'Reference',
    'Notes',
  ],
};

const TEMPLATE_SAMPLES: Partial<Record<CostingBulkImportKind, (string | number)[][]>> = {
  raw_materials: [
    ['CR01', 'Copper Rod', 'Copper Rod', 'METAL', 'kg', 'MARKET_METAL_COPPER', 'COPPER', 'Yes', ''],
    ['AL01', 'Aluminium Rod', 'Aluminium Rod', 'METAL', 'kg', 'MARKET_METAL_ALUMINIUM', 'ALUMINIUM', 'Yes', ''],
  ],
  metal_cost_components: [
    ['COPPER', 'PREMIUM', 555, 'USD', 'MT', '2026-09-01', '', 'DRAFT', 'Copper premium - supplier reference', ''],
  ],
};

export function buildCostingBulkTemplateWorkbook(kind: CostingBulkImportKind): Buffer {
  const headers = TEMPLATE_HEADERS[kind];
  const samples = TEMPLATE_SAMPLES[kind] || [];
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...samples]);
  const instructionRows: string[][] = [
    [`Costing Bulk Import — ${kind}`],
    [''],
    ['1. Fill data rows below the header.'],
    ['2. Upload via Costing Configuration → Bulk Import.'],
    ['3. Review preview errors before Apply.'],
    ['4. Summary costs are never imported from reference workbooks.'],
  ];
  if (kind === 'metal_cost_components') {
    instructionRows.push([
      '5. Metal Cost Component uploads always enter Draft. They are not auto-approved and do not affect Direct RM Cost.',
    ]);
  }
  const instructions = XLSX.utils.aoa_to_sheet(instructionRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, kind);
  XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function templateFileName(kind: CostingBulkImportKind): string {
  const names: Record<CostingBulkImportKind, string> = {
    raw_materials: 'Raw_Material_Master.xlsx',
    raw_material_prices: 'Raw_Material_Prices.xlsx',
    boms: 'Cable_BOM.xlsx',
    scrap_rules: 'Scrap_Rules.xlsx',
    currencies: 'Currencies.xlsx',
    exchange_rates: 'Exchange_Rates.xlsx',
    metal_cost_components: 'Metal_Cost_Components.xlsx',
  };
  return names[kind];
}

export function costingBulkPipelineKind(kind: CostingBulkImportKind): 'raw_materials' | 'boms' | null {
  if (kind === 'raw_materials') return 'raw_materials';
  if (kind === 'boms') return 'boms';
  return null;
}

export function previewCostingBulkImport(
  kind: CostingBulkImportKind,
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string
) {
  const pipelineKind = costingBulkPipelineKind(kind);
  if (pipelineKind) {
    return previewKind(pipelineKind, rows, sourceFile, importedBy);
  }
  if (kind === 'raw_material_prices') {
    return {
      batch: {
        batchNumber: 'PREVIEW',
        sourceFile,
        importedBy,
        importedDate: new Date().toISOString(),
        dataType: 'raw_materials' as const,
        rowCount: rows.length,
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
        errors: [],
        warnings: [
          {
            rowNumber: 1,
            code: 'USE_PRICE_ENDPOINT',
            message: 'Use POST /api/master/raw-material-prices/import/preview for price rows.',
          },
        ],
        information: [],
        skipped: [],
      },
      previewRows: rows,
    };
  }
  return {
    batch: {
      batchNumber: 'PREVIEW',
      sourceFile,
      importedBy,
      importedDate: new Date().toISOString(),
      dataType: 'raw_materials' as const,
      rowCount: rows.length,
      successCount: 0,
      errorCount: rows.length === 0 ? 1 : 0,
      warningCount: 0,
      errors:
        rows.length === 0
          ? [{ rowNumber: 1, code: 'EMPTY', message: 'No data rows in upload.' }]
          : [
              {
                rowNumber: 1,
                code: 'NOT_IMPLEMENTED',
                message: `${kind} bulk import uses dedicated API forms. Template provided for data preparation.`,
              },
            ],
      warnings: [],
      information: [],
      skipped: [],
    },
    previewRows: rows,
  };
}

export function commitCostingBulkImport(
  kind: CostingBulkImportKind,
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string
) {
  const pipelineKind = costingBulkPipelineKind(kind);
  if (!pipelineKind) {
    throw new Error(`${kind} bulk commit is not supported via generic pipeline. Use the dedicated maintenance form.`);
  }
  return commitKind(pipelineKind, rows, sourceFile, importedBy, { persist: true });
}
