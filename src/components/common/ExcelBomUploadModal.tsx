import React, { useState, useRef, useEffect } from 'react';
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
  Search,
  Check,
  Package,
  Layers3,
  Scale,
} from 'lucide-react';
import { CableBomRawMaterial } from '../../types';
import {
  BOM_TEMPLATE_HEADERS,
  BOM_TEMPLATE_SAMPLE_ROWS,
  RAW_MATERIAL_DICTIONARY,
  downloadBomExcelTemplate,
  downloadBomCsvTemplate,
} from '../../services/cableBomService';
import { getStoredCableCatalog } from '../../services/cableCatalogService';
import { findConflictingBomWeightGroups } from '../../services/bomDuplicateForensics';
import {
  loadAuthoritativeCableCatalog,
  loadAuthoritativeRawMaterials,
  persistCableBomsViaApi,
} from '../../services/masterDataApiService';
import { MasterCableCatalogItem, RawMaterialMasterRecord } from '../../types';

interface ExcelBomUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  jwtToken?: string | null;
  onSuccess?: (boms: import('../../types').CableBomRawMaterial[]) => void;
}

export interface ParsedBomRow {
  customerCode: string;
  cableMaterialNumber: string;
  rawMaterial: string;
  rawMaterialName: string;
  weight: number;
  unitKm: string;
  matchedCableDesc?: string;
  isValid: boolean;
  validationError?: string;
}

export const ExcelBomUploadModal: React.FC<ExcelBomUploadModalProps> = ({
  isOpen,
  onClose,
  jwtToken,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedBomRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCableFilter, setSelectedCableFilter] = useState<string>('all');
  const [authoritativeCatalog, setAuthoritativeCatalog] = useState<MasterCableCatalogItem[]>([]);
  const [catalogAuthoritative, setCatalogAuthoritative] = useState(false);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialMasterRecord[]>([]);
  const [rmAuthoritative, setRmAuthoritative] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void loadAuthoritativeCableCatalog(jwtToken).then((resolved) => {
      setAuthoritativeCatalog(resolved.data);
      setCatalogAuthoritative(resolved.authoritative);
    });
    void loadAuthoritativeRawMaterials(jwtToken).then((resolved) => {
      setRawMaterials(resolved.data);
      setRmAuthoritative(resolved.authoritative);
    });
  }, [isOpen, jwtToken]);

  if (!isOpen) return null;

  const validationCatalog = catalogAuthoritative ? authoritativeCatalog : getStoredCableCatalog();
  const catalogSourceLabel = catalogAuthoritative
    ? 'PostgreSQL Cable Master'
    : 'local mirror (non-authoritative)';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
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

        const jsonData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (jsonData.length === 0) {
          setErrorMessage('The uploaded BOM spreadsheet contains no data rows.');
          setLoading(false);
          return;
        }

        const parsed: ParsedBomRow[] = jsonData.map((row) => {
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

          const customerCode = String(
            getVal(['Customer Code', 'CustomerCode', 'CustCode', 'Cust Code']) || ''
          ).trim();

          const cableMaterialNumber = String(
            getVal([
              'Cable Material Number',
              'CableMaterialNumber',
              'Cable Code',
              'Material Number',
              'MaterialNo',
              'MatNo',
            ]) || ''
          ).trim();

          const rawMaterial = String(
            getVal(['Raw Material', 'RawMaterial', 'Material Code', 'RM', 'Raw_Material']) || ''
          ).trim();

          const rawWeight = getVal(['Weight', 'WeightKg', 'Qty', 'Quantity']);
          const rawUnit = getVal(['Unit/Km', 'UnitKm', 'Unit', 'UOM']);

          const weight = parseFloat(String(rawWeight).replace(/[^0-9.]/g, '')) || 0;
          const unitKm = String(rawUnit || 'kg').trim();

          const dict = RAW_MATERIAL_DICTIONARY[rawMaterial.toUpperCase()];
          const rawMaterialName = dict ? dict.name : `Raw Material (${rawMaterial || 'Custom'})`;

          // Check if cable exists in master catalog (PG-first when signed in)
          const matchedCable = validationCatalog.find(
            (c) =>
              (cableMaterialNumber && c.cableCode?.toLowerCase() === cableMaterialNumber.toLowerCase()) ||
              (customerCode && c.customerCode?.toLowerCase() === customerCode.toLowerCase())
          );

          let isValid = true;
          let validationError = undefined;

          if (!customerCode && !cableMaterialNumber) {
            isValid = false;
            validationError = 'Missing Customer Code or Cable Material Number';
          } else if (!rawMaterial) {
            isValid = false;
            validationError = 'Missing Raw Material Code';
          } else if (weight <= 0) {
            isValid = false;
            validationError = 'Weight must be greater than 0';
          } else if (catalogAuthoritative && cableMaterialNumber && !matchedCable) {
            isValid = false;
            validationError = `Cable ${cableMaterialNumber} not in PostgreSQL Cable Master`;
          } else if (
            rmAuthoritative &&
            rawMaterial &&
            !rawMaterials.some((rm) => rm.rawMaterialCode.toUpperCase() === rawMaterial.toUpperCase())
          ) {
            isValid = false;
            validationError = `Raw Material ${rawMaterial} not in PostgreSQL Raw Material Master`;
          }

          return {
            customerCode: customerCode || 'N/A',
            cableMaterialNumber: cableMaterialNumber || 'N/A',
            rawMaterial: rawMaterial || 'N/A',
            rawMaterialName,
            weight,
            unitKm: unitKm || 'kg',
            matchedCableDesc: matchedCable?.description,
            isValid,
            validationError,
          };
        }).filter((r) => r.rawMaterial !== 'N/A' || r.customerCode !== 'N/A');

        if (parsed.length === 0) {
          setErrorMessage(
            'Could not find matching BOM columns. Please ensure columns match: Customer Code, Cable Material Number, Raw Material, Weight, Unit/Km'
          );
        } else {
          setParsedRows(parsed);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMessage(`Failed to parse BOM file: ${err.message || 'Unknown error'}`);
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

  const handleApplyUpload = async () => {
    if (parsedRows.length === 0 || applying) return;
    if (!jwtToken) {
      setErrorMessage('Sign in is required to write Cable BOM to PostgreSQL.');
      return;
    }

    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setErrorMessage('No valid BOM rows to commit. Fix validation errors first.');
      return;
    }

    setApplying(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const conflicting = findConflictingBomWeightGroups(
      validRows.map((r, idx) => ({
        rowNumber: idx + 1,
        cableMaterialNumber: r.cableMaterialNumber,
        rawMaterial: r.rawMaterial,
        weight: r.weight,
      })),
      { sourceWorksheet: 'Excel Method-B', sourceFile: fileName || undefined }
    );
    const rejectedKeys = new Set(
      conflicting.map((g) => `${g.cableMaterialNumber.toLowerCase()}::${g.rawMaterialCode.toUpperCase()}`)
    );

    const commitRows = validRows.filter(
      (r) => !rejectedKeys.has(`${r.cableMaterialNumber.toLowerCase()}::${r.rawMaterial.toUpperCase()}`)
    );

    if (commitRows.length === 0) {
      setApplying(false);
      setErrorMessage(
        'All rows have conflicting weights for the same Cable + Raw Material pair. No weights were written — resolve via Import Center or governance.'
      );
      return;
    }

    const newItems: CableBomRawMaterial[] = commitRows.map((r, idx) => ({
      id: `bom-${Date.now()}-${idx}`,
      customerCode: r.customerCode,
      cableMaterialNumber: r.cableMaterialNumber,
      rawMaterial: r.rawMaterial,
      rawMaterialName: r.rawMaterialName,
      weight: r.weight,
      unitKm: r.unitKm,
    }));

    const uploadedCableNumbers: string[] = [];
    const seenCables = new Set<string>();
    for (const item of newItems) {
      const cable = item.cableMaterialNumber;
      if (cable && cable !== 'N/A' && !seenCables.has(cable)) {
        seenCables.add(cable);
        uploadedCableNumbers.push(cable);
      }
    }

    const result = await persistCableBomsViaApi(
      {
        lines: newItems,
        replaceCableMaterialNumbers: uploadedCableNumbers,
        duplicateObservations: conflicting.map((g) => ({
          cableMaterialNumber: g.cableMaterialNumber,
          rawMaterialCode: g.rawMaterialCode,
          weightA: g.weightA,
          weightB: g.weightB,
          occurrenceCount: g.occurrenceCount,
          sourceWorksheet: g.sourceWorksheet,
          sourceFile: g.sourceFile,
          sourceRowNumbers: g.sourceRowNumbers,
          classification: g.classification,
        })),
        sourceFile: fileName || undefined,
      },
      jwtToken
    );

    setApplying(false);

    if (!result.ok) {
      setErrorMessage(
        result.errors.length > 0
          ? `PostgreSQL write failed: ${result.errors.slice(0, 3).join('; ')}`
          : 'PostgreSQL write failed. localStorage was not updated.'
      );
      return;
    }

    const dupNote =
      conflicting.length > 0
        ? ` ${conflicting.length} conflicting weight group(s) recorded as governance observations (not auto-resolved).`
        : '';

    setSuccessMessage(
      `PostgreSQL: committed ${result.upserted} BOM component(s) across ${uploadedCableNumbers.length} cable(s). Browser mirror refreshed after PG success.${dupNote}`
    );

    if (onSuccess) {
      onSuccess(result.boms);
    }

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Grouping by Cable Material Number for summary
  const uniqueCableNumbers = Array.from(new Set(parsedRows.map((r) => r.cableMaterialNumber)));

  const filteredRows = parsedRows.filter((row) => {
    const matchesSearch =
      !searchTerm ||
      row.customerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.cableMaterialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.rawMaterial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.rawMaterialName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCable =
      selectedCableFilter === 'all' || row.cableMaterialNumber === selectedCableFilter;

    return matchesSearch && matchesCable;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/30 border border-blue-500/40 rounded-xl">
              <Layers className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Upload & Update Cable BOMs (Bill of Materials)</h2>
              <p className="text-xs text-slate-300">
                Template headers: Customer Code, Cable Material Number, Raw Material, Weight, Unit/Km
                {catalogAuthoritative ? ' · Cable validation: PostgreSQL' : ` · Cable validation: ${catalogSourceLabel}`}
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
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                Official BOM Excel Template
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">
                Standardized Energya Cable Bill of Materials (BOM) Template
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Download the exact template pre-populated with raw material lines (CR01, XL08, CX05, TP01, LH02) per cable.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={downloadBomExcelTemplate}
                className="flex-1 md:flex-initial px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center space-x-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Download BOM Excel (.xlsx)</span>
              </button>
              <button
                onClick={downloadBomCsvTemplate}
                className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <FileText className="h-4 w-4" />
                <span>Download CSV</span>
              </button>
            </div>
          </div>

          {/* Template Header Table Preview (Matches User Screenshot) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Required BOM Template Structure (Exact Columns)</span>
              <span className="text-[11px] text-slate-500 font-normal">Matches your Excel worksheet format</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0b4370] text-white font-semibold">
                    <th className="p-2.5 border-r border-[#155a96]">Customer Code</th>
                    <th className="p-2.5 border-r border-[#155a96]">Cable Material Number</th>
                    <th className="p-2.5 border-r border-[#155a96]">Raw Material</th>
                    <th className="p-2.5 border-r border-[#155a96] text-right">Weight</th>
                    <th className="p-2.5 text-center">Unit/Km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                  {BOM_TEMPLATE_SAMPLE_ROWS.slice(0, 4).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 font-bold text-amber-600 dark:text-amber-400">
                        {r['Customer Code']}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 font-bold text-blue-600 dark:text-blue-400">
                        {r['Cable Material Number']}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-white">
                        {r['Raw Material']}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-bold text-slate-900 dark:text-white">
                        {r['Weight'].toFixed(2)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-600 dark:text-slate-400">{r['Unit/Km']}</td>
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
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/30 hover:bg-blue-50/20"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center mx-auto mb-2">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {fileName ? `Loaded: ${fileName}` : 'Click or Drag & Drop your filled BOM Excel (.xlsx) or CSV file'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Multiple raw material rows per cable will be grouped automatically into its Bill of Materials.
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
                    Parsed BOM Components ({parsedRows.length})
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
                    {uniqueCableNumbers.length} Cable(s)
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                    {parsedRows.filter((r) => r.isValid).length} Valid
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter BOM..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-44"
                    />
                  </div>

                  {uniqueCableNumbers.length > 1 && (
                    <select
                      value={selectedCableFilter}
                      onChange={(e) => setSelectedCableFilter(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    >
                      <option value="all">All Cables ({uniqueCableNumbers.length})</option>
                      {uniqueCableNumbers.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold z-10">
                    <tr>
                      <th className="p-2">Cust. Code</th>
                      <th className="p-2">Cable Material No</th>
                      <th className="p-2">Raw Material</th>
                      <th className="p-2">Material Description</th>
                      <th className="p-2 text-right">Weight</th>
                      <th className="p-2 text-center">Unit/Km</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                    {filteredRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2 font-mono font-bold text-amber-600 dark:text-amber-400">
                          {row.customerCode}
                        </td>
                        <td className="p-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.cableMaterialNumber}
                        </td>
                        <td className="p-2 font-mono font-bold text-slate-900 dark:text-white">
                          {row.rawMaterial}
                        </td>
                        <td className="p-2 text-slate-600 dark:text-slate-400 truncate max-w-xs">
                          {row.rawMaterialName}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {row.weight.toFixed(2)}
                        </td>
                        <td className="p-2 text-center font-mono text-slate-500">{row.unitKm}</td>
                        <td className="p-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              Valid ✓
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                              title={row.validationError}
                            >
                              Invalid
                            </span>
                          )}
                        </td>
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
              onClick={handleApplyUpload}
              disabled={parsedRows.length === 0 || loading || applying}
              className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition-all flex items-center space-x-2 ${
                parsedRows.length > 0 && !applying
                  ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                  : 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              {loading || applying ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>{applying ? 'Committing to PostgreSQL...' : 'Processing BOMs...'}</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Save & Apply {parsedRows.length} BOM Component(s)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
