import React, { useState, useEffect } from 'react';
import { CABLE_FAMILIES } from '../../data/mockData';
import { CableSearchSelectModal } from '../common/CableSearchSelectModal';
import { CableConfiguratorModal } from '../common/CableConfiguratorModal';
import { ExcelCableUploadModal } from '../common/ExcelCableUploadModal';
import { ExcelBomUploadModal } from '../common/ExcelBomUploadModal';
import { MasterCableCatalogItem, CableBomRawMaterial } from '../../types';
import {
  getStoredCableCatalog,
  downloadExcelTemplate,
  downloadCsvTemplate,
} from '../../services/cableCatalogService';
import {
  getStoredCableBoms,
  downloadBomExcelTemplate,
  RAW_MATERIAL_DICTIONARY,
} from '../../services/cableBomService';
import {
  loadAuthoritativeCableBoms,
  loadAuthoritativeCableCatalog,
} from '../../services/masterDataApiService';
import { useAuth } from '../../context/AuthContext';
import { TechnicalOfficeTcrQueue } from '../cable-configurator/v2/components/TechnicalOfficeTcrQueue';
import { TechnicalOfficeMappingQueue } from '../cable-configurator/v2/components/TechnicalOfficeMappingQueue';
import { TechnicalOfficeBomGovernanceQueue } from '../cable-configurator/v2/components/TechnicalOfficeBomGovernanceQueue';
import { TechnicalOfficeExcelPreImport } from '../cable-configurator/v2/components/TechnicalOfficeExcelPreImport';
import { TechnicalOfficeMasterParams } from '../cable-configurator/v2/components/TechnicalOfficeMasterParams';
import {
  Layers,
  Plus,
  FileText,
  CheckCircle,
  Sliders,
  Search,
  Hash,
  Tag,
  ShieldCheck,
  Sparkles,
  FileSpreadsheet,
  Upload,
  Download,
  Scale,
  CircleDot,
  Info,
  Layers3,
  Package,
  Inbox,
  Database,
  Cpu,
} from 'lucide-react';

export const TechnicalOffice: React.FC = () => {
  const { jwtToken } = useAuth();
  const [catalog, setCatalog] = useState<MasterCableCatalogItem[]>([]);
  const [boms, setBoms] = useState<CableBomRawMaterial[]>([]);
  const [dataSource, setDataSource] = useState<'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK'>('LOCALSTORAGE_FALLBACK');
  const [selectedItem, setSelectedItem] = useState<MasterCableCatalogItem | null>(null);
  const [selectedFamily, setSelectedFamily] = useState(CABLE_FAMILIES[0]);

  // Main navigation tab
  const [activeMainTab, setActiveMainTab] = useState<'mapping' | 'bom' | 'tcr' | 'catalog' | 'excel_sync' | 'params' | 'bom_materials'>('mapping');
  const [activeSubTab, setActiveSubTab] = useState<'construction' | 'tds' | 'bom'>('construction');

  // Search filter states
  const [cableCodeSearch, setCableCodeSearch] = useState<string>('');
  const [itemCodeSearch, setItemCodeSearch] = useState<string>('');
  const [customerCodeSearch, setCustomerCodeSearch] = useState<string>('');
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [showConfiguratorModal, setShowConfiguratorModal] = useState<boolean>(false);
  const [showExcelUploadModal, setShowExcelUploadModal] = useState<boolean>(false);
  const [showBomUploadModal, setShowBomUploadModal] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadAuthoritativeCableCatalog(jwtToken),
      loadAuthoritativeCableBoms(jwtToken),
    ]).then(([c, b]) => {
      if (cancelled) return;
      setCatalog(c.data);
      setBoms(b.data);
      setDataSource(
        c.source === 'POSTGRESQL' || b.source === 'POSTGRESQL' ? 'POSTGRESQL' : 'LOCALSTORAGE_FALLBACK'
      );
    });
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  useEffect(() => {
    const handleCatalogUpdate = (e: any) => {
      const items = e.detail || getStoredCableCatalog();
      setCatalog(items);
    };
    const handleBomsUpdate = (e: any) => {
      const items = e.detail || getStoredCableBoms();
      setBoms(items);
    };

    window.addEventListener('cableCatalogUpdated', handleCatalogUpdate);
    window.addEventListener('cableBomsUpdated', handleBomsUpdate);

    return () => {
      window.removeEventListener('cableCatalogUpdated', handleCatalogUpdate);
      window.removeEventListener('cableBomsUpdated', handleBomsUpdate);
    };
  }, []);

  useEffect(() => {
    if (catalog.length > 0 && !selectedItem) {
      setSelectedItem(catalog[0]);
    }
  }, [catalog, selectedItem]);

  // Find BOM materials for the selected cable
  const currentCableBoms = selectedItem
    ? boms.filter((b) => {
        const bMat = b.cableMaterialNumber?.trim().toLowerCase();
        const cCode = selectedItem.cableCode?.trim().toLowerCase();
        const iCode = selectedItem.itemCode?.trim().toLowerCase();
        if (bMat && (bMat === cCode || bMat === iCode)) return true;
        if (
          !bMat &&
          b.customerCode &&
          selectedItem.customerCode &&
          b.customerCode.trim().toLowerCase() === selectedItem.customerCode.trim().toLowerCase()
        ) {
          return true;
        }
        return false;
      })
    : [];

  const totalBomWeight = currentCableBoms.reduce((acc, curr) => acc + (curr.weight || 0), 0);

  const fallbackBomItems = [
    { component: 'Copper Conductor (CR01)', unit: 'KG / KM', qty: 135.23, materialCode: 'CR01' },
    { component: 'XLPE Insulation Compound (XL08)', unit: 'KG / KM', qty: 11.92, materialCode: 'XL08' },
    { component: 'Catalyst Masterbatch (CX05)', unit: 'KG / KM', qty: 0.61, materialCode: 'CX05' },
    { component: 'Binding Polyester / Mica Tape (TP01)', unit: 'KG / KM', qty: 0.5, materialCode: 'TP01' },
    { component: 'LSHF Outer Sheathing Compound (LH02)', unit: 'KG / KM', qty: 119.74, materialCode: 'LH02' },
  ];

  const filteredCatalog = catalog.filter((item) => {
    const matchCable = !cableCodeSearch || item.cableCode.toLowerCase().includes(cableCodeSearch.toLowerCase());
    const matchItem = !itemCodeSearch || item.itemCode.toLowerCase().includes(itemCodeSearch.toLowerCase());
    const matchCustomer =
      !customerCodeSearch || item.customerCode.toLowerCase().includes(customerCodeSearch.toLowerCase());
    return matchCable && matchItem && matchCustomer;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-black text-red-300 uppercase tracking-widest bg-red-800/60 px-2.5 py-1 rounded-md border border-red-600/40">
            TECHNICAL OFFICE — ENGINEERING WORKBENCH
          </span>
          <h1 className="text-2xl font-black tracking-tight mt-1">
            Technical Cable Requests & Master Engineering Catalog
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Process incoming custom cable requests (TCR), assign SAP Material Numbers, validate 44-column bulk imports, and maintain engineering dropdown parameters. Costing prices and formula approval belong in Costing Configuration.
            Catalog source: <span className="font-bold text-white">{dataSource}</span>
            {dataSource === 'LOCALSTORAGE_FALLBACK' ? ' (non-authoritative)' : ''}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Master Cable Excel Template */}
          <button
            onClick={downloadExcelTemplate}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
            title="Download Master Cable Template with Dimensions & Weights"
          >
            <Download className="h-4 w-4" />
            <span>Cables Template</span>
          </button>
          {/* Upload Master Cables */}
          <button
            onClick={() => setShowExcelUploadModal(true)}
            className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Cables</span>
          </button>
          <button
            onClick={() => setShowSearchModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
          >
            <Search className="h-4 w-4 text-blue-400" />
            <span>Search</span>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <button
          onClick={() => setActiveMainTab('mapping')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeMainTab === 'mapping'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Engineering Mapping (Increment 7)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('bom')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeMainTab === 'bom'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Layers3 className="h-4 w-4 text-purple-500" />
          <span>BOM Governance (Increment 8)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('tcr')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeMainTab === 'tcr'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Inbox className="h-4 w-4" />
          <span>Technical Requests (TCR Queue)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('catalog')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeMainTab === 'catalog'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Database className="h-4 w-4" />
          <span>Cable Master Catalog ({catalog.length})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('excel_sync')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeMainTab === 'excel_sync'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Bulk Excel Pre-Import (Method B)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('params')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeMainTab === 'params'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Master Parameters</span>
        </button>

        <button
          onClick={() => setActiveMainTab('bom_materials')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeMainTab === 'bom_materials'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Database className="h-4 w-4" />
          <span>Raw Materials Reference</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 0: ENGINEERING MAPPING & APPROVAL                         */}
      {/* ------------------------------------------------------------- */}
      {activeMainTab === 'mapping' && <TechnicalOfficeMappingQueue />}

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: TCR QUEUE                                              */}
      {/* ------------------------------------------------------------- */}
      {activeMainTab === 'tcr' && <TechnicalOfficeTcrQueue />}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: BOM GOVERNANCE & CONFLICT REGISTER                     */}
      {/* ------------------------------------------------------------- */}
      {activeMainTab === 'bom' && <TechnicalOfficeBomGovernanceQueue />}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: CABLE MASTER CATALOG                                   */}
      {/* ------------------------------------------------------------- */}
      {activeMainTab === 'catalog' && (
        <div className="space-y-6">
          {/* Multi-Identifier Search Bar Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">
              <Search className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span>Search Master Cable Catalog by Codes</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center space-x-1">
                  <Hash className="h-3.5 w-3.5 text-blue-500" />
                  <span>Energya Cable Code</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 10009487..."
                  value={cableCodeSearch}
                  onChange={(e) => setCableCodeSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-blue-600 dark:text-blue-400 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center space-x-1">
                  <Tag className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Item Code</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ICO117X101C0002..."
                  value={itemCodeSearch}
                  onChange={(e) => setItemCodeSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center space-x-1">
                  <Tag className="h-3.5 w-3.5 text-purple-500" />
                  <span>Customer Code</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. N2XH, 2XSY..."
                  value={customerCodeSearch}
                  onChange={(e) => setCustomerCodeSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-purple-600 dark:text-purple-400 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Catalog List */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Approved Master Cables ({filteredCatalog.length})
                </h3>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {filteredCatalog.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-red-50/60 dark:bg-red-950/30 border-red-500 shadow-md ring-1 ring-red-500'
                          : 'bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">
                          {item.cableCode}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {item.customerCode || 'Standard'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2">
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500">
                        <span>Ø {item.outerDiameterMm} mm</span>
                        <span>{item.approxWeightKgKm} kg/km</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Cable Details */}
            <div className="lg:col-span-7">
              {selectedItem ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">
                        Material #{selectedItem.cableCode}
                      </span>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                        {selectedItem.description}
                      </h3>
                    </div>
                  </div>

                  {/* Physical Properties */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Outer Diameter</span>
                      <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                        {selectedItem.outerDiameterMm} mm
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Approx Weight</span>
                      <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                        {selectedItem.approxWeightKgKm} kg/km
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Voltage Class</span>
                      <span className="text-sm font-black text-slate-900 dark:text-white">
                        {selectedItem.voltageClass}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Item Code</span>
                      <span className="text-xs font-black text-slate-900 dark:text-white font-mono truncate block">
                        {selectedItem.itemCode}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500">Select a cable to view specifications</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: BULK EXCEL PRE-IMPORT (METHOD B)                       */}
      {/* ------------------------------------------------------------- */}
      {activeMainTab === 'excel_sync' && <TechnicalOfficeExcelPreImport />}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: MASTER PARAMETER MANAGEMENT (SECTION 10)               */}
      {/* ------------------------------------------------------------- */}
      {activeMainTab === 'params' && <TechnicalOfficeMasterParams />}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: BOM & RAW MATERIALS                                    */}
      {/* ------------------------------------------------------------- */}
      {/* ------------------------------------------------------------- */}
      {/* TAB 4: RAW MATERIALS REFERENCE                                */}
      {/* ------------------------------------------------------------- */}
      {activeMainTab === 'bom_materials' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Raw Material Dictionary & Standard Consumption Rates
              </h3>
              <p className="text-xs text-slate-500">
                Component pricing and inventory links for manufacturing BOM calculation.
              </p>
            </div>
            <button
              onClick={downloadBomExcelTemplate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center space-x-1.5"
            >
              <Download className="h-4 w-4" />
              <span>Download BOM Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(RAW_MATERIAL_DICTIONARY).map(([code, mat]) => (
              <div
                key={code}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">{code}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700">
                    {mat.category}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{mat.name}</h4>
                <p className="text-[11px] text-slate-500">Standard Consumption Unit: kg/km</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Modal dialogs */}
      {showSearchModal && (
        <CableSearchSelectModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectItem={(item) => {
            const match = catalog.find((c) => c.cableCode === item.cableCode || c.itemCode === item.itemCode);
            if (match) setSelectedItem(match);
            setShowSearchModal(false);
          }}
        />
      )}

      {showConfiguratorModal && (
        <CableConfiguratorModal
          isOpen={showConfiguratorModal}
          onClose={() => setShowConfiguratorModal(false)}
          onAddConfiguredCable={(item) => {
            const match = catalog.find((c) => c.cableCode === item.cableCode || c.itemCode === item.itemCode);
            if (match) setSelectedItem(match);
            setShowConfiguratorModal(false);
          }}
        />
      )}

      {showExcelUploadModal && (
        <ExcelCableUploadModal
          isOpen={showExcelUploadModal}
          onClose={() => setShowExcelUploadModal(false)}
          jwtToken={jwtToken}
          onSuccess={(updated) => {
            setCatalog(updated);
            setShowExcelUploadModal(false);
          }}
        />
      )}

      {showBomUploadModal && (
        <ExcelBomUploadModal
          isOpen={showBomUploadModal}
          onClose={() => setShowBomUploadModal(false)}
          jwtToken={jwtToken}
          onSuccess={(updated) => {
            setBoms(updated);
            setShowBomUploadModal(false);
          }}
        />
      )}
    </div>
  );
};
