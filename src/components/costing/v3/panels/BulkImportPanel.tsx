import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { COSTING_BULK_IMPORT_OPTIONS, CostingBulkImportKind } from '../../../../services/costingBulkImportService';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingPageHeader,
  CostingTable,
  CostingTd,
  CostingTh,
} from '../CostingUiPrimitives';
import { costingApi, downloadCostingFile } from '../costingV3Api';
import { CostingPanelProps } from './types';

const STEPS = [
  'Select Data Type',
  'Download Template',
  'Upload File',
  'Validate',
  'Preview',
  'Errors / Warnings',
  'Apply',
  'Summary',
];

const TEMPLATE_FILE: Record<CostingBulkImportKind, string> = {
  raw_materials: 'Raw_Material_Master.xlsx',
  raw_material_prices: 'Raw_Material_Prices_Template.xlsx',
  boms: 'Cable_BOM_Template.xlsx',
  scrap_rules: 'Scrap_Rules_Template.xlsx',
  currencies: 'Currencies_Template.xlsx',
  exchange_rates: 'Exchange_Rates_Template.xlsx',
  metal_cost_components: 'Metal_Cost_Components.xlsx',
};

const ABOUT: Record<CostingBulkImportKind, { title: string; description: string }> = {
  raw_materials: {
    title: 'Raw Materials Import',
    description:
      'Import raw material master data including codes, descriptions, UOM, pricing category and metal type. Download the template, fill in your data and upload to import.',
  },
  raw_material_prices: {
    title: 'Raw Material Prices Import',
    description:
      'Import unit prices by material, currency, UOM and effective dates. Download the template, fill in your data and upload to import.',
  },
  boms: {
    title: 'Cable BOM Import',
    description:
      'Import cable material BOM data including raw materials, consumption, UOM and scrap percentage. Download the template, fill in your data and upload to import.',
  },
  scrap_rules: {
    title: 'Scrap Rules Import',
    description:
      'Import scrap percentage rules by family or metal. Download the template, fill in your data and upload to import.',
  },
  currencies: {
    title: 'Currencies Import',
    description:
      'Import currency codes, names, symbols and base-currency flags. Download the template, fill in your data and upload to import.',
  },
  exchange_rates: {
    title: 'Exchange Rates Import',
    description:
      'Import exchange rates to the costing base currency with effective dates. Download the template, fill in your data and upload to import.',
  },
  metal_cost_components: {
    title: 'Metal Cost Components Import',
    description:
      'Import Premium, Shipping and Clearance master values. Uploads enter Draft and are never auto-approved. These values are not included in Direct RM Cost (Option B).',
  },
};

export const BulkImportPanel: React.FC<CostingPanelProps> = ({ token, refresh, setError, intent, onIntentConsumed }) => {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<CostingBulkImportKind>('boms');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const batch = (preview?.batch as Record<string, unknown>) || null;
  const about = ABOUT[kind];

  useEffect(() => {
    if (intent?.bulkKind) {
      setKind(intent.bulkKind);
    }
    if (intent?.bulkStep != null) {
      setStep(intent.bulkStep);
    }
    if (intent?.bulkKind || intent?.bulkStep != null) {
      onIntentConsumed?.();
    }
  }, [intent, onIntentConsumed]);

  const handleUpload = async (file: File) => {
    if (!token) return;
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    setBusy(true);
    setError(null);
    setFileName(file.name);
    try {
      const res = await costingApi(token, '/api/admin/costing/bulk-import/preview', {
        method: 'POST',
        body: JSON.stringify({ kind, rows, sourceFile: file.name }),
      });
      setPreview(res);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!token || !preview?.rows) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, '/api/admin/costing/bulk-import/commit', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          rows: preview.rows,
          sourceFile: fileName || 'upload.xlsx',
        }),
      });
      setStep(7);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 0 && Boolean(kind)) ||
    step === 1 ||
    (step === 2 && Boolean(fileName)) ||
    (step >= 3 && step <= 5 && Boolean(batch)) ||
    step === 6;

  return (
    <>
      <CostingPageHeader
        title="Bulk Data Management"
        breadcrumb="Costing > Bulk Data Management"
      />

      <div className="flex items-start gap-1 mb-6 overflow-x-auto pb-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center min-w-[110px] flex-1">
            <div className="flex flex-col items-center text-center w-full">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === step
                    ? 'bg-[#0052CC] text-white'
                    : i < step
                      ? 'bg-blue-100 text-[#0052CC]'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {i + 1}
              </span>
              <span className={`mt-1 text-[11px] leading-tight ${i === step ? 'text-[#0052CC] font-semibold' : 'text-slate-500'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="h-px bg-slate-200 flex-1 mt-[-18px] min-w-4" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid lg:grid-cols-3 gap-4">
          <CostingCard title="Select the data you want to import">
            <div className="space-y-1">
              {COSTING_BULK_IMPORT_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer ${
                    kind === opt.id ? 'bg-blue-50 border border-blue-400' : 'border border-transparent hover:bg-slate-50'
                  }`}
                >
                  <input type="radio" name="bulk-kind" checked={kind === opt.id} onChange={() => setKind(opt.id)} />
                  <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                </label>
              ))}
            </div>
          </CostingCard>
          <CostingCard title="About Selected Import">
            <div className="flex flex-col items-start">
              <FileSpreadsheet className="h-10 w-10 text-blue-600 mb-3" />
              <p className="font-semibold text-slate-900">{about.title}</p>
              <p className="text-sm text-slate-600 mt-2">{about.description}</p>
            </div>
          </CostingCard>
          <CostingCard title="Template">
            <div className="flex items-start gap-3">
              <FileText className="h-10 w-10 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{TEMPLATE_FILE[kind]}</p>
                <p className="text-xs text-slate-500 mt-0.5">Excel template</p>
              </div>
            </div>
            <div className="mt-4">
              <CostingBtn
                onClick={() => void downloadCostingFile(token, `/api/admin/costing/bulk-import/template/${kind}`, TEMPLATE_FILE[kind])}
              >
                <Download className="h-4 w-4 text-blue-600" /> Download Template
              </CostingBtn>
            </div>
          </CostingCard>
        </div>
      )}

      {step === 1 && (
        <CostingCard title="Download Template">
          <p className="text-sm text-slate-600 mb-3">Download {TEMPLATE_FILE[kind]}, fill in your data, then continue to upload.</p>
          <CostingBtn onClick={() => void downloadCostingFile(token, `/api/admin/costing/bulk-import/template/${kind}`, TEMPLATE_FILE[kind])}>
            <Download className="h-4 w-4" /> Download Template
          </CostingBtn>
        </CostingCard>
      )}

      {step === 2 && (
        <CostingCard title="Upload File">
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            <span className="text-sm">{fileName || 'Choose Excel file…'}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void handleUpload(e.target.files[0])}
            />
          </label>
        </CostingCard>
      )}

      {step >= 3 && step <= 6 && batch && (
        <CostingCard title={STEPS[step]}>
          <div className="flex flex-wrap gap-3 mb-3">
            <CostingBadge tone="success">{String(batch.successCount ?? 0)} valid</CostingBadge>
            <CostingBadge tone="warning">{String(batch.warningCount ?? 0)} warnings</CostingBadge>
            <CostingBadge tone="danger">{String(batch.errorCount ?? 0)} errors</CostingBadge>
            <CostingBadge tone="neutral">{String(batch.rowCount ?? 0)} rows</CostingBadge>
          </div>
          {step === 4 && Array.isArray(preview?.rows) && (
            <CostingTable>
              <thead>
                <tr>
                  <CostingTh>Action</CostingTh>
                  <CostingTh>Row</CostingTh>
                </tr>
              </thead>
              <tbody>
                {(preview.rows as Record<string, unknown>[]).slice(0, 40).map((row, i) => {
                  const action = String(row.action || 'UNCHANGED').toUpperCase();
                  const tone =
                    action === 'ERROR'
                      ? 'danger'
                      : action === 'WARNING'
                        ? 'warning'
                        : action === 'INSERT'
                          ? 'success'
                          : action === 'UPDATE'
                            ? 'info'
                            : 'neutral';
                  return (
                    <tr key={i}>
                      <CostingTd>
                        <CostingBadge tone={tone}>{action}</CostingBadge>
                      </CostingTd>
                      <CostingTd className="text-xs font-mono">{JSON.stringify(row).slice(0, 180)}</CostingTd>
                    </tr>
                  );
                })}
              </tbody>
            </CostingTable>
          )}
          {step === 5 && Array.isArray(batch.errors) && (batch.errors as unknown[]).length > 0 && (
            <pre className="text-xs bg-red-50 p-3 rounded-lg overflow-auto max-h-40">{JSON.stringify(batch.errors, null, 2)}</pre>
          )}
          {step === 6 && (
            <CostingBtn variant="primary" onClick={() => void apply()} disabled={busy || Number(batch.errorCount) > 0}>
              Apply Import
            </CostingBtn>
          )}
        </CostingCard>
      )}

      {step === 7 && (
        <CostingCard title="Import complete">
          <CostingBadge tone="success">Summary — import applied successfully</CostingBadge>
        </CostingCard>
      )}

      <div className="flex justify-end gap-2 mt-6">
        {step > 0 && step < 7 && (
          <CostingBtn onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</CostingBtn>
        )}
        {step < 6 && (
          <CostingBtn
            variant="primary"
            disabled={!canNext || busy}
            onClick={() => setStep((s) => Math.min(7, s + 1))}
          >
            Next
          </CostingBtn>
        )}
      </div>
    </>
  );
};
