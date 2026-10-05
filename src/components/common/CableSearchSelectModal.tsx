import React, { useState, useMemo, useEffect } from 'react';
import { MasterCableCatalogItem, ErpRequestItem } from '../../types';
import { getStoredCableCatalog } from '../../services/cableCatalogService';
import { useAuth } from '../../context/AuthContext';
import { CableConfiguratorV2 } from '../cable-configurator/v2/components/CableConfiguratorV2';
import { CableRecordV2 } from '../cable-configurator/v2/types';
import { AdvancedCableSearchPanel } from './AdvancedCableSearchPanel';
import type { V2CableSearchHit } from '../../domain/v2AdvancedCableSearch';
import { useDrumMasterList } from './DrumMasterSelect';
import { DrumScheduleRow } from './DrumCuttingScheduleTable';
import { DrumSelectionWorkflowPanel } from './DrumSelectionWorkflowPanel';
import { buildInquiryDrumSchedule } from '../../domain/inquiryDrumSchedule';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input, Select } from '../ui/Form';
import { icons } from '../ui/icons';
import {
  Search,
  X,
  Sparkles,
  Plus,
  Filter,
  ShieldCheck,
  FileCode,
  Layers,
  RotateCcw,
  Sliders,
  Ruler,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const CABLE_SEARCH_PAGE_SIZE = 50;

interface CableSearchSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: Omit<ErpRequestItem, 'serial'>) => void;
  onOpenConfigurator?: () => void;
  title?: string;
}

export const CableSearchSelectModal: React.FC<CableSearchSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectItem,
  onOpenConfigurator,
  title = 'Search & Select Cable Master Code',
}) => {
  const { jwtToken, currentUser } = useAuth();
  const [catalog, setCatalog] = useState<MasterCableCatalogItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalMatches, setTotalMatches] = useState(0);

  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>('all');
  const [customerCodeSearch, setCustomerCodeSearch] = useState<string>('');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showParameterBuilder, setShowParameterBuilder] = useState(false);
  const [pendingCable, setPendingCable] = useState<MasterCableCatalogItem | null>(null);
  const [packagingRows, setPackagingRows] = useState<DrumScheduleRow[]>([]);
  const [cableTolerancePercent, setCableTolerancePercent] = useState<string>('');
  const [packagingError, setPackagingError] = useState<string | null>(null);
  const [packagingPlanValid, setPackagingPlanValid] = useState(false);
  const drumMaster = useDrumMasterList(Boolean(pendingCable));

  useEffect(() => {
    setPage(1);
  }, [customerCodeSearch, selectedCustomerCode, familyFilter]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set('pageSize', String(CABLE_SEARCH_PAGE_SIZE));
      params.set('page', String(page));
      if (customerCodeSearch.trim()) params.set('q', customerCodeSearch.trim());
      if (selectedCustomerCode !== 'all') params.set('customerCode', selectedCustomerCode);
      if (familyFilter !== 'all') params.set('family', familyFilter);
      fetch(`/api/master/cables?${params.toString()}`, {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : undefined,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Cable Master search is unavailable.'))))
        .then((data) => {
          const rows = Array.isArray(data.cables) ? data.cables : [];
          const total = typeof data.total === 'number' ? data.total : rows.length;
          setCatalog(rows);
          setTotalMatches(total);
          setSearchError(null);
          if (rows.length > 0) setSelectedCatalogItem(rows[0]);
        })
        .catch(() => {
          // Non-authoritative degraded page only — never claim PG SoT from LS.
          const fallback = getStoredCableCatalog();
          const start = (page - 1) * CABLE_SEARCH_PAGE_SIZE;
          setCatalog(fallback.slice(start, start + CABLE_SEARCH_PAGE_SIZE));
          setTotalMatches(fallback.length);
          setSearchError(
            'PostgreSQL Cable Master unavailable — showing non-authoritative local catalog page (not SoT).'
          );
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isOpen, customerCodeSearch, selectedCustomerCode, familyFilter, jwtToken, page]);

  useEffect(() => {
    if (!isOpen) {
      setShowAdvancedSearch(false);
      setShowParameterBuilder(false);
      setPendingCable(null);
      setPackagingError(null);
      setPackagingPlanValid(false);
      setPage(1);
      return;
    }
  }, [isOpen]);

  // Selected item for preview/adding
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<MasterCableCatalogItem | null>(
    catalog[0] || null
  );
  const [qty, setQty] = useState<number>(1.0);
  const [uom, setUom] = useState<'KM' | 'M' | 'Reel' | 'PCS'>('KM');

  // Customer codes on the current page
  const distinctCustomerCodes = useMemo(() => {
    const codes = new Set<string>();
    catalog.forEach((item) => {
      if (item.customerCode && item.customerCode.trim() !== '') {
        codes.add(item.customerCode.trim());
      }
    });
    return Array.from(codes).sort();
  }, [catalog]);

  const pageCount = Math.max(1, Math.ceil(totalMatches / CABLE_SEARCH_PAGE_SIZE));
  const rangeStart = totalMatches === 0 ? 0 : (page - 1) * CABLE_SEARCH_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * CABLE_SEARCH_PAGE_SIZE, totalMatches);

  const openParameterBuilder = () => {
    if (onOpenConfigurator) {
      onClose();
      onOpenConfigurator();
      return;
    }
    setShowParameterBuilder(true);
  };

  const openPackagingPopup = (item: MasterCableCatalogItem) => {
    setPendingCable(item);
    setShowAdvancedSearch(false);
    setShowParameterBuilder(false);
    setPackagingRows([
      {
        id: `pkg-${Date.now()}`,
        drumCode: '',
        noOfDrums: Math.max(1, Number(qty) || 1),
        cuttingLengthM: '',
        drumTolerancePercent: '',
      },
    ]);
    setCableTolerancePercent('');
    setPackagingError(null);
    setPackagingPlanValid(false);
  };

  const submitSelectedCable = (
    item: MasterCableCatalogItem,
    rows: Array<{
      drums: number;
      cuttingLengthMeters: number;
      drumCode: string;
      drumTolerancePercent: number;
    }>,
    orderCableTolerancePercent: number
  ) => {
    const totalDrums = rows.reduce((acc, r) => acc + r.drums, 0);
    const totalLengthMeters = rows.reduce((acc, r) => acc + r.drums * r.cuttingLengthMeters, 0);
    const codes = Array.from(new Set(rows.map((r) => r.drumCode)));
    const drumType = codes.join(' + ');
    const drumSchedule = buildInquiryDrumSchedule(
      rows.map((r) => ({
        drumCode: r.drumCode,
        noOfDrums: r.drums,
        cuttingLengthM: r.cuttingLengthMeters,
        drumTolerancePercent: r.drumTolerancePercent,
      })),
      orderCableTolerancePercent
    );
    const hasConfiguredPrice = item.priceConfigured !== false && Number(item.standardPriceUsdPerM) > 0;
    let drumNo = 1;
    const drumsList = rows.flatMap((r) =>
      Array.from({ length: r.drums }, () => ({
        drumNo: drumNo++,
        drumType: r.drumCode,
        lengthMeters: r.cuttingLengthMeters,
        grossWeightKg: item.approxWeightKgKm,
        drumMasterCode: r.drumCode,
      }))
    );
    const newItem: Omit<ErpRequestItem, 'serial'> = {
      itemCode: item.itemCode,
      cableCode: item.cableCode,
      customerCode: item.customerCode,
      itemDescription: item.description,
      uom: 'M',
      qty: totalDrums,
      unitPriceUsd: hasConfiguredPrice ? item.standardPriceUsdPerM * 1000 : undefined,
      drumDetails: {
        drumType,
        noOfDrums: totalDrums,
        cuttingLengthMeters: rows[0]?.cuttingLengthMeters || 0,
        totalLengthKm: totalLengthMeters / 1000,
        grossWeightPerDrumKg: item.approxWeightKgKm,
        netWeightPerDrumKg: item.approxWeightKgKm,
        cableTolerancePercent: orderCableTolerancePercent,
        scheduleRows: drumSchedule.rows,
        drumsList,
      },
    };

    onSelectItem(newItem);
    setPendingCable(null);
    onClose();
  };

  const confirmPackaging = () => {
    if (!pendingCable) return;
    if (!packagingPlanValid) {
      setPackagingError('Drum Plan required before continue');
      return;
    }
    const cableTolerance = Number(cableTolerancePercent);
    if (!Number.isFinite(cableTolerance) || cableTolerance < 0) {
      setPackagingError('Cable tolerance (%) is required for production and logistics planning.');
      return;
    }
    const parsed: Array<{
      drums: number;
      cuttingLengthMeters: number;
      drumCode: string;
      drumTolerancePercent: number;
    }> = [];
    for (const row of packagingRows) {
      const drums = Number(row.noOfDrums);
      const cuttingLengthMeters = Number(row.cuttingLengthM);
      const drumTolerancePercent = Number(row.drumTolerancePercent);
      if (!Number.isFinite(drums) || drums <= 0) {
        setPackagingError('Enter the number of drums for every drum line.');
        return;
      }
      if (!Number.isFinite(cuttingLengthMeters) || cuttingLengthMeters <= 0) {
        setPackagingError('Enter a cutting length in meters for every drum line.');
        return;
      }
      if (!Number.isFinite(drumTolerancePercent) || drumTolerancePercent < 0) {
        setPackagingError('Drum tolerance (%) is required on every drum line.');
        return;
      }
      if (!row.drumCode.trim()) {
        setPackagingError('Select a drum code for every drum line.');
        return;
      }
      parsed.push({
        drums,
        cuttingLengthMeters,
        drumCode: row.drumCode.trim(),
        drumTolerancePercent,
      });
    }
    setPackagingError(null);
    submitSelectedCable(pendingCable, parsed, cableTolerance);
  };

  const handleSelectFromTechnicalParameters = (cable: CableRecordV2) => {
    const catalogItem: MasterCableCatalogItem = cable.raw || {
      id: cable.id,
      itemCode: cable.itemCode,
      cableCode: cable.materialNumber,
      customerCode: cable.customerCode,
      code: cable.materialNumber,
      description: cable.description,
      voltageClass: (['LV', 'MV', 'HV'].includes(String(cable.voltageClass))
        ? cable.voltageClass
        : 'LV') as MasterCableCatalogItem['voltageClass'],
      conductor: cable.conductorMaterial === 'AL' ? 'Aluminum' : 'Copper',
      cores: cable.cores,
      crossSectionMm2: cable.conductorSizeNum,
      outerDiameterMm: cable.outerDiameterMm,
      approxWeightKgKm: cable.approxWeightKgKm,
      standardPriceUsdPerM: 0,
      priceConfigured: false,
    };
    openPackagingPopup(catalogItem);
  };

  const handleSelectAdvancedHit = (hit: V2CableSearchHit) => {
    // voltageClass/conductor unions are required by MasterCableCatalogItem display types.
    // They are not a new engineering classification and do not mutate Cable Master.
    const familyUpper = (hit.family || '').toUpperCase();
    const voltageClass: MasterCableCatalogItem['voltageClass'] =
      familyUpper === 'MV' || familyUpper.includes('MEDIUM')
        ? 'MV'
        : familyUpper === 'HV' || familyUpper.includes('HIGH')
          ? 'HV'
          : 'LV';
    const catalogItem: MasterCableCatalogItem = {
      id: hit.materialNumber,
      itemCode: hit.itemCode,
      cableCode: hit.materialNumber,
      customerCode: hit.customerCode,
      code: `${hit.customerCode} ${hit.materialNumber}`.trim(),
      description: hit.description,
      voltageClass,
      conductor: /alum/i.test(hit.conductor || '') ? 'Aluminum' : 'Copper',
      cores: hit.cores || '1C',
      crossSectionMm2: Number(hit.conductorSize) || 0,
      outerDiameterMm: hit.diameterMm || 0,
      approxWeightKgKm: hit.weightKgKm || 0,
      standardPriceUsdPerM: 0,
      priceConfigured: false,
      family: hit.family,
      insulation: hit.insulation,
      screen: hit.screen,
      armour: hit.armour,
      sheath: hit.sheath,
      standard: hit.standard,
      authorityFields: {
        family: hit.family,
        voltage: hit.voltage,
        conductor: hit.conductor,
        conductorSize: hit.conductorSize,
        cores: hit.cores,
        insulation: hit.insulation,
        screen: hit.screen,
        armour: hit.armour,
        sheath: hit.sheath,
        standard: hit.standard,
      },
    };
    openPackagingPopup(catalogItem);
  };

  const handleResetFilters = () => {
    setSelectedCustomerCode('all');
    setCustomerCodeSearch('');
    setFamilyFilter('all');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header Bar */}
          <div className="bg-brand-500 text-white px-5 py-4 flex items-center justify-between border-b border-brand-600 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                <FileCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base tracking-tight font-display">{title}</h3>
                <p className="text-xs text-brand-100">
                  Standard Search first. Advanced Search finds existing Cable Master records.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Filter Controls */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
            {searchError && <p className="text-[11px] text-warning-700 font-semibold">{searchError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Customer Code Dropdown Selection */}
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
                  <span>Customer Code</span>
                </label>
                <Select
                  value={selectedCustomerCode}
                  onChange={(e) => {
                    setSelectedCustomerCode(e.target.value);
                    if (e.target.value !== 'all') {
                      setCustomerCodeSearch('');
                    }
                  }}
                  className="font-mono font-semibold"
                >
                  <option value="all">All Customer Codes ({distinctCustomerCodes.length})</option>
                  {distinctCustomerCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Customer Code / Keyword Search Input */}
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 text-brand-500" />
                  <span>Search Code / Description</span>
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="e.g. N2XH, N2XS2Y, BS5467..."
                    value={customerCodeSearch}
                    onChange={(e) => setCustomerCodeSearch(e.target.value)}
                    className="pr-8 font-mono"
                  />
                  {customerCodeSearch && (
                    <button
                      onClick={() => setCustomerCodeSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Cable Family Dropdown */}
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  <span>Cable Family</span>
                </label>
                <Select
                  value={familyFilter}
                  onChange={(e) => setFamilyFilter(e.target.value)}
                >
                  <option value="all">All Families</option>
                  <option value="LV">LV (Low Voltage)</option>
                  <option value="MV">MV (Medium Voltage)</option>
                  <option value="HV">HV (High Voltage)</option>
                  <option value="Control">Control & Special</option>
                </Select>
              </div>

              <div className="md:col-span-3">
                <Button
                  variant="accent"
                  size="md"
                  block
                  onClick={openParameterBuilder}
                  leadingIcon={Sparkles}
                >
                  Build via Parameters
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAdvancedSearch(true)}
                  leadingIcon={Sliders}
                >
                  Advanced Search
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  {totalMatches} Matching Records
                  {totalMatches > 0 ? ` · ${rangeStart}–${rangeEnd}` : ''}
                </span>
                {(selectedCustomerCode !== 'all' || customerCodeSearch || familyFilter !== 'all') && (
                  <button
                    onClick={handleResetFilters}
                    className="text-xs text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 font-semibold flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Results Body: Catalog Table */}
          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3 min-w-[130px]">Item Code</th>
                    <th className="p-3 min-w-[160px]">Cable Code (Energya)</th>
                    <th className="p-3 min-w-[140px]">Customer Code</th>
                    <th className="p-3 min-w-[240px]">Description</th>
                    <th className="p-3 w-20">Family</th>
                    <th className="p-3 w-24 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {catalog.length > 0 ? (
                    catalog.map((cat) => {
                      const isSelected = selectedCatalogItem?.id === cat.id;
                      return (
                        <tr
                          key={cat.id}
                          onClick={() => setSelectedCatalogItem(cat)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-brand-50/80 dark:bg-brand-950/60 font-medium'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                            <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                              {cat.itemCode}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-brand-600 dark:text-brand-400">
                            {cat.cableCode}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {cat.customerCode}
                          </td>
                          <td className="p-3 text-slate-700 dark:text-slate-300">{cat.description}</td>
                          <td className="p-3">
                            <Badge tone="neutral">
                              {cat.family || '—'}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPackagingPopup(cat);
                              }}
                              className="px-3.5 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
                            >
                              Select
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        <p className="italic">No cable items found matching Standard Search.</p>
                        <button
                          type="button"
                          onClick={() => setShowAdvancedSearch(true)}
                          className="mt-3 text-brand-600 dark:text-brand-400 font-bold hover:underline"
                        >
                          Open Advanced Search
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalMatches > CABLE_SEARCH_PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  leadingIcon={ChevronLeft}
                >
                  Previous
                </Button>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  trailingIcon={ChevronRight}
                >
                  Next
                </Button>
              </div>
            )}

            {/* Selected Item Quantity & Confirm Section */}
            {selectedCatalogItem && (
              <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Selected Cable Item Preview
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="font-mono font-bold text-brand-300 text-sm">
                      {selectedCatalogItem.cableCode}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="font-mono font-semibold text-emerald-400 text-xs">
                      Item Code: {selectedCatalogItem.itemCode}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="font-mono font-semibold text-amber-400 text-xs">
                      Customer Code: {selectedCatalogItem.customerCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 truncate max-w-xl">{selectedCatalogItem.description}</p>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <div className="flex items-center space-x-1.5 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
                    <span className="text-xs font-bold text-slate-300 pl-1">Qty:</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                      className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-white font-bold text-xs outline-none text-center"
                    />
                    <select
                      value={uom}
                      onChange={(e) => setUom(e.target.value as any)}
                      className="bg-slate-900 border border-slate-700 rounded p-1 text-white font-bold text-xs outline-none"
                    >
                      <option value="KM">KM</option>
                      <option value="M">M</option>
                      <option value="Reel">Reel</option>
                      <option value="PCS">PCS</option>
                    </select>
                  </div>

                  <button
                    onClick={() => openPackagingPopup(selectedCatalogItem)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-colors flex items-center space-x-1.5 text-xs"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add to Request</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdvancedSearch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3">
          <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl shadow-2xl border border-brand-500/30 w-full max-w-6xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="bg-brand-500 text-white px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-brand-600">
              <div className="flex items-center gap-2 min-w-0">
                <Sliders className="h-5 w-5 text-brand-100 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-sm tracking-tight truncate font-display">
                    Advanced Search
                  </h3>
                  <p className="text-[11px] text-brand-100">
                    Find an existing engineered cable in Cable Master. Not a compatibility engine.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedSearch(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <AdvancedCableSearchPanel
                jwtToken={jwtToken}
                actorKind={currentUser?.userType === 'customer' ? 'customer' : 'internal'}
                onSelect={handleSelectAdvancedHit}
              />
            </div>
          </div>
        </div>
      )}

      {showParameterBuilder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3">
          <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl shadow-2xl border border-brand-500/30 w-full max-w-6xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="bg-brand-500 text-white px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-brand-600">
              <div className="min-w-0">
                <h3 className="font-bold text-sm tracking-tight truncate font-display">
                  Build via Parameters
                </h3>
                <p className="text-[11px] text-brand-100">
                  Existing V2 cable configurator. Separate from Advanced Cable Master search.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowParameterBuilder(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <CableConfiguratorV2 onSelectResolvedCable={handleSelectFromTechnicalParameters} />
            </div>
          </div>
        </div>
      )}

      {pendingCable && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl p-5 space-y-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <div className="p-2 rounded-xl bg-brand-500 text-white shrink-0">
                  <Ruler className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
                    Cutting Length and Drum Selection
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {pendingCable.cableCode} · {pendingCable.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingCable(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <DrumSelectionWorkflowPanel
                cableCode={pendingCable.cableCode}
                cableDescription={pendingCable.description}
                cableDiameterMm={pendingCable.outerDiameterMm || 0}
                approxWeightKgKm={pendingCable.approxWeightKgKm || 0}
                drums={drumMaster}
                jwtToken={jwtToken}
                rows={packagingRows}
                cableTolerancePercent={cableTolerancePercent}
                onCableToleranceChange={setCableTolerancePercent}
                onRowsChange={setPackagingRows}
                onPlanValidityChange={(valid) => setPackagingPlanValid(valid)}
                error={packagingError}
              />
            </div>

            {packagingRows.some((r) => Number(r.noOfDrums) > 0 && Number(r.cuttingLengthM) > 0) && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Total Length (m) = cutting length × number of drums ={' '}
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {packagingRows.reduce(
                    (acc, r) => acc + (Number(r.noOfDrums) || 0) * (Number(r.cuttingLengthM) || 0),
                    0
                  )}{' '}
                  m
                </span>
              </p>
            )}
            {packagingError && <p className="text-error-600 font-semibold">{packagingError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setPendingCable(null)}
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={confirmPackaging}
                disabled={!packagingPlanValid}
              >
                Add Line
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
