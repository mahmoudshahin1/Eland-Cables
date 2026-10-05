import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  RefreshCw,
  Layers,
  ArrowRight,
  Database,
  Check,
  Search,
  Sparkles,
} from 'lucide-react';
import { MasterCableCatalogItem } from '../../types';
import {
  TEMPLATE_HEADERS,
  TEMPLATE_SAMPLE_ROWS,
  downloadExcelTemplate,
  downloadCsvTemplate,
  getStoredCableCatalog,
  parseCableDescription,
} from '../../services/cableCatalogService';
import { persistCableCatalogRowsViaApi } from '../../services/masterDataApiService';

interface ExcelCableUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  jwtToken?: string | null;
  onSuccess?: (updatedCatalog: MasterCableCatalogItem[]) => void;
}

export interface ParsedCableRow {
  customerCode: string;
  itemCode: string;
  cableMaterialNumber: string;
  cableDesc: string;
  totalCableWeight: number;
  cableDiameter: number;
  isExisting: boolean;
  validationErrors: string[];
}

export const ExcelCableUploadModal: React.FC<ExcelCableUploadModalProps> = ({
  isOpen,
  onClose,
  jwtToken,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedCableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'new' | 'update'>('all');

  if (!isOpen) return null;

  const currentCatalog = getStoredCableCatalog();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        
        // Convert to JSON with raw values
        const jsonData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (jsonData.length === 0) {
          setErrorMessage('The uploaded spreadsheet contains no data rows.');
          setLoading(false);
          return;
        }

        const parsed: ParsedCableRow[] = jsonData.map((row) => {
          // Normalize keys to find the requested headers
          const getVal = (possibleKeys: string[]) => {
            for (const key of Object.keys(row)) {
              const cleanedKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              for (const target of possibleKeys) {
                const cleanedTarget = target.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                if (cleanedKey === cleanedTarget) {
                  return row[key];
                }
              }
            }
            return '';
          };

          const customerCode = String(getVal(['Customer Code', 'CustomerCode', 'CustCode', 'Code']) || '').trim();
          const itemCode = String(getVal(['Item Code', 'ItemCode', 'Item_Code', 'ERP Item Code']) || '').trim();
          const cableMaterialNumber = String(
            getVal(['Cable Material Number', 'CableMaterialNumber', 'Cable Code', 'Material Number', 'MaterialNo', 'MatNo']) || ''
          ).trim();
          const cableDesc = String(
            getVal(['Cable Desc', 'Cable Description', 'Description', 'Desc', 'CableDesc']) || ''
          ).trim();
          
          const rawWeight = getVal(['Total Cable Weight', 'TotalCableWeight', 'Cable Weight', 'Weight', 'WeightKgKm']);
          const rawDiameter = getVal(['Cable Diameter', 'CableDiameter', 'Diameter', 'Outer Diameter', 'DiameterMm']);

          const totalCableWeight = parseFloat(String(rawWeight).replace(/[^0-9.]/g, '')) || 0;
          const cableDiameter = parseFloat(String(rawDiameter).replace(/[^0-9.]/g, '')) || 0;

          const validationErrors: string[] = [];
          if (!customerCode && !cableMaterialNumber && !itemCode) {
            validationErrors.push('Missing identifier (Customer Code, Item Code, or Cable Material Number)');
          }
          if (!cableDesc) {
            validationErrors.push('Missing cable description');
          }

          // Check if it already exists in the catalog
          const isExisting = currentCatalog.some(
            (c) =>
              (itemCode && c.itemCode?.toLowerCase() === itemCode.toLowerCase()) ||
              (cableMaterialNumber && c.cableCode?.toLowerCase() === cableMaterialNumber.toLowerCase()) ||
              (customerCode && c.customerCode?.toLowerCase() === customerCode.toLowerCase())
          );

          return {
            customerCode: customerCode || 'N/A',
            itemCode: itemCode || `ITM-${Math.floor(100000 + Math.random() * 900000)}`,
            cableMaterialNumber: cableMaterialNumber || `ENG-${customerCode || 'CAB'}`,
            cableDesc: cableDesc || 'Unspecified Cable Description',
            totalCableWeight,
            cableDiameter,
            isExisting,
            validationErrors,
          };
        }).filter((r) => r.customerCode !== 'N/A' || r.cableDesc !== 'Unspecified Cable Description');

        if (parsed.length === 0) {
          setErrorMessage('Could not find matching cable columns. Please ensure columns match the provided template.');
        } else {
          setParsedRows(parsed);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMessage(`Failed to parse file: ${err.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Error reading the uploaded file.');
      setLoading(false);
    };

    reader.readAsBinaryString(file);
  };

  const [applying, setApplying] = useState<boolean>(false);

  const handleApplyUpload = async () => {
    if (parsedRows.length === 0 || applying) return;
    if (!jwtToken) {
      setErrorMessage('Sign in is required to write Cable Master to PostgreSQL.');
      return;
    }

    setApplying(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const existingMaterialNumbers = new Set(
      currentCatalog.map((c) => c.cableCode?.trim().toLowerCase()).filter(Boolean) as string[]
    );
    const catalogEntries: MasterCableCatalogItem[] = [];

    parsedRows.forEach((row) => {
      const existingIdx = currentCatalog.findIndex(
        (c) =>
          (row.itemCode && c.itemCode?.toLowerCase() === row.itemCode.toLowerCase()) ||
          (row.cableMaterialNumber && c.cableCode?.toLowerCase() === row.cableMaterialNumber.toLowerCase())
      );

      const parsedAttrs = parseCableDescription(row.cableDesc);

      catalogEntries.push({
        id: existingIdx >= 0 ? currentCatalog[existingIdx].id : `mc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        itemCode: row.itemCode,
        cableCode: row.cableMaterialNumber,
        customerCode: row.customerCode,
        code: `${row.customerCode} ${row.cableMaterialNumber}`,
        description: row.cableDesc,
        voltageClass: parsedAttrs.voltageClass,
        conductor: parsedAttrs.conductor,
        cores: parsedAttrs.cores,
        crossSectionMm2: parsedAttrs.crossSectionMm2,
        outerDiameterMm: row.cableDiameter,
        approxWeightKgKm: row.totalCableWeight,
        standardPriceUsdPerM: existingIdx >= 0 ? currentCatalog[existingIdx].standardPriceUsdPerM : 6.50,
        status: 'ACTIVE',
      });
    });

    const result = await persistCableCatalogRowsViaApi(catalogEntries, jwtToken, { existingMaterialNumbers });

    setApplying(false);

    if (!result.ok) {
      setErrorMessage(
        result.errors.length > 0
          ? `PostgreSQL write failed: ${result.errors.slice(0, 3).join('; ')}`
          : 'PostgreSQL write failed. localStorage was not updated.'
      );
      return;
    }

    setSuccessMessage(
      `PostgreSQL: updated ${result.updated} and created ${result.created} cable(s). Browser mirror refreshed after PG success.`
    );

    if (onSuccess) {
      onSuccess(result.cables);
    }

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const filteredRows = parsedRows.filter((row) => {
    const matchesSearch =
      !searchTerm ||
      row.customerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.cableMaterialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.cableDesc.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterMode === 'new') return matchesSearch && !row.isExisting;
    if (filterMode === 'update') return matchesSearch && row.isExisting;
    return matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-red-900 via-slate-900 to-rose-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-600/30 border border-red-500/40 rounded-xl">
              <FileSpreadsheet className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Upload & Update Cables from Excel</h2>
              <p className="text-xs text-slate-300">
                Template headers: Customer Code, Item Code, Cable Material Number, Cable Desc, Total Cable Weight, Cable Diameter
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Step 1: Download Template or View Spec */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-2 py-0.5 rounded">
                Official Excel Template
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">
                Standardized Energya Cable Catalog Excel Template
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Download the exact template pre-populated with sample low & medium voltage cable items (N2XH, MV 33kV, etc.).
              </p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={downloadExcelTemplate}
                className="flex-1 md:flex-initial px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center space-x-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Download Excel (.xlsx)</span>
              </button>
              <button
                onClick={downloadCsvTemplate}
                className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <FileText className="h-4 w-4" />
                <span>Download CSV</span>
              </button>
            </div>
          </div>

          {/* Template Header Table Preview */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Required Template Structure (Exact Columns)</span>
              <span className="text-[11px] text-slate-500 font-normal">Matches your Excel worksheet format</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white font-semibold">
                    <th className="p-2.5 border-r border-slate-700">Customer Code</th>
                    <th className="p-2.5 border-r border-slate-700">Item Code</th>
                    <th className="p-2.5 border-r border-slate-700">Cable Material Number</th>
                    <th className="p-2.5 border-r border-slate-700">Cable Desc</th>
                    <th className="p-2.5 border-r border-slate-700 text-right">Total Cable Weight</th>
                    <th className="p-2.5 text-right">Cable Diameter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                  {TEMPLATE_SAMPLE_ROWS.slice(0, 2).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 font-bold text-red-600 dark:text-red-400">
                        {r['Customer Code']}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800">{r['Item Code']}</td>
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 font-semibold">{r['Cable Material Number']}</td>
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 font-sans text-xs">{r['Cable Desc']}</td>
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-bold text-slate-900 dark:text-white">
                        {r['Total Cable Weight'].toFixed(2)}
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white">{r['Cable Diameter'].toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Step 2: Drag and drop upload */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-red-500 dark:hover:border-red-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/30 hover:bg-red-50/20"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center mx-auto mb-2">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {fileName ? `Loaded: ${fileName}` : 'Click or Drag & Drop your filled Excel (.xlsx) or CSV file'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports .xlsx, .xls, .csv. Existing items will be updated; new items will be created.
            </p>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="p-3 bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Parsed Rows Preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Parsed Cables ({parsedRows.length})
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                    {parsedRows.filter((r) => !r.isExisting).length} New
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
                    {parsedRows.filter((r) => r.isExisting).length} Updates
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter preview..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-44"
                    />
                  </div>

                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                    <button
                      onClick={() => setFilterMode('all')}
                      className={`px-2.5 py-1 ${
                        filterMode === 'all'
                          ? 'bg-red-600 text-white font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilterMode('new')}
                      className={`px-2.5 py-1 ${
                        filterMode === 'new'
                          ? 'bg-red-600 text-white font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      New
                    </button>
                    <button
                      onClick={() => setFilterMode('update')}
                      className={`px-2.5 py-1 ${
                        filterMode === 'update'
                          ? 'bg-red-600 text-white font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Updates
                    </button>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold z-10">
                    <tr>
                      <th className="p-2">Action</th>
                      <th className="p-2">Customer Code</th>
                      <th className="p-2">Item Code</th>
                      <th className="p-2">Cable Material No</th>
                      <th className="p-2">Cable Description</th>
                      <th className="p-2 text-right">Weight (kg/km)</th>
                      <th className="p-2 text-right">Diameter (mm)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                    {filteredRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2">
                          {row.isExisting ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                              Update
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              Create New
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono font-bold text-red-600 dark:text-red-400">{row.customerCode}</td>
                        <td className="p-2 font-mono text-slate-600 dark:text-slate-400">{row.itemCode}</td>
                        <td className="p-2 font-mono font-semibold">{row.cableMaterialNumber}</td>
                        <td className="p-2 text-slate-800 dark:text-slate-200 truncate max-w-xs" title={row.cableDesc}>
                          {row.cableDesc}
                        </td>
                        <td className="p-2 text-right font-bold">{row.totalCableWeight.toFixed(2)}</td>
                        <td className="p-2 text-right font-bold">{row.cableDiameter.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => void handleApplyUpload()}
              disabled={parsedRows.length === 0 || loading || applying}
              className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition-all flex items-center space-x-2 ${
                parsedRows.length > 0 && !applying
                  ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                  : 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              {loading || applying ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Save & Apply {parsedRows.length} Cable(s) to Catalog</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
