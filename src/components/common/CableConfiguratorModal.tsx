import React, { useState, useMemo, useEffect } from 'react';
import { CableConfigOptions, CableSpecs, ErpRequestItem } from '../../types';
import { CableCrossSectionViewer } from './CableCrossSectionViewer';
import {
  evaluateDynamicFilterOptions,
  getAllParsedCables,
  ParsedCableRecord,
  validateCableConfiguration,
} from '../../services/cableSelectionService';
import { loadAuthoritativeCableCatalog } from '../../services/masterDataApiService';
import { useAuth } from '../../context/AuthContext';
import { MasterCableCatalogItem } from '../../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, Select, Input } from '../ui/Form';
import {
  Sparkles,
  X,
  Plus,
  Sliders,
  Layers,
  Check,
  Zap,
  Info,
  Database,
  Filter,
  AlertTriangle,
  RotateCcw,
  ListFilter,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
} from 'lucide-react';

interface CableConfiguratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddConfiguredCable: (item: Omit<ErpRequestItem, 'serial'>) => void;
}

export const CableConfiguratorModal: React.FC<CableConfiguratorModalProps> = ({
  isOpen,
  onClose,
  onAddConfiguredCable,
}) => {
  const { jwtToken } = useAuth();
  const [pgCatalog, setPgCatalog] = useState<MasterCableCatalogItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAuthoritativeCableCatalog(jwtToken).then((resolved) => {
      if (cancelled) return;
      setPgCatalog(resolved.data);
    });
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  const parsedCatalog = useMemo(
    () => (pgCatalog !== null ? getAllParsedCables(pgCatalog) : undefined),
    [pgCatalog]
  );
  const catalogOpts = pgCatalog !== null ? { customCatalog: pgCatalog } : undefined;

  const [qty, setQty] = useState<number>(1.0);
  const [uom, setUom] = useState<'KM' | 'M' | 'Reel' | 'PCS'>('KM');

  // Customer Code & Parameter Selection States
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>('N2XH');
  const [selectedFamily, setSelectedFamily] = useState<string>('LV');
  const [selectedVoltage, setSelectedVoltage] = useState<string>('0.6/1 kV');
  const [selectedConductorMaterial, setSelectedConductorMaterial] = useState<string>('Copper');
  const [selectedConductorSize, setSelectedConductorSize] = useState<string>('16 mm²');
  const [selectedCores, setSelectedCores] = useState<string>('1 Core');
  const [selectedInsulation, setSelectedInsulation] = useState<string>('XLPE');
  const [selectedInnerSheath, setSelectedInnerSheath] = useState<string>('None');
  const [selectedArmour, setSelectedArmour] = useState<string>('No Armour');
  const [selectedOuterSheath, setSelectedOuterSheath] = useState<string>('LSHF');
  const [selectedStandard, setSelectedStandard] = useState<string>('IEC 60502-1');
  const [selectedColor, setSelectedColor] = useState<string>('Black');
  const [specialRequirement, setSpecialRequirement] = useState<string>('None');

  // Constraint Engine Validation
  const validationResult = useMemo(() => {
    return validateCableConfiguration({
      customerCode: selectedCustomerCode === 'ALL' ? undefined : selectedCustomerCode,
      family: selectedFamily === 'ALL' ? undefined : selectedFamily,
      voltage: selectedVoltage === 'ALL' ? undefined : selectedVoltage,
      conductor: selectedConductorMaterial === 'ALL' ? undefined : selectedConductorMaterial,
      conductorSize: selectedConductorSize === 'ALL' ? undefined : selectedConductorSize,
      core: selectedCores === 'ALL' ? undefined : selectedCores,
      insulation: selectedInsulation === 'ALL' ? undefined : selectedInsulation,
      armour: selectedArmour === 'ALL' ? undefined : selectedArmour,
      sheathing: selectedOuterSheath === 'ALL' ? undefined : selectedOuterSheath,
      sheathingColor: selectedColor,
      standard: selectedStandard === 'ALL' ? undefined : selectedStandard,
    }, catalogOpts);
  }, [
    selectedCustomerCode,
    selectedFamily,
    selectedVoltage,
    selectedConductorMaterial,
    selectedConductorSize,
    selectedCores,
    selectedInsulation,
    selectedArmour,
    selectedOuterSheath,
    selectedColor,
    selectedStandard,
    catalogOpts,
  ]);

  // Dynamic filter calculation using master catalog
  const dynamicFilter = useMemo(() => {
    return evaluateDynamicFilterOptions({
      customerCode: selectedCustomerCode === 'ALL' ? undefined : selectedCustomerCode,
      family: selectedFamily === 'ALL' ? undefined : selectedFamily,
      voltage: selectedVoltage === 'ALL' ? undefined : selectedVoltage,
      conductorMaterial: selectedConductorMaterial === 'ALL' ? undefined : selectedConductorMaterial,
      conductorSize: selectedConductorSize === 'ALL' ? undefined : selectedConductorSize,
      cores: selectedCores === 'ALL' ? undefined : selectedCores,
      insulation: selectedInsulation === 'ALL' ? undefined : selectedInsulation,
      armour: selectedArmour === 'ALL' ? undefined : selectedArmour,
      sheathing: selectedOuterSheath === 'ALL' ? undefined : selectedOuterSheath,
      standard: selectedStandard === 'ALL' ? undefined : selectedStandard,
    }, parsedCatalog);
  }, [
    selectedCustomerCode,
    selectedFamily,
    selectedVoltage,
    selectedConductorMaterial,
    selectedConductorSize,
    selectedCores,
    selectedInsulation,
    selectedArmour,
    selectedOuterSheath,
    selectedStandard,
    parsedCatalog,
  ]);

  // Adjust selections automatically if upstream change invalidates child value
  useEffect(() => {
    if (
      dynamicFilter.availableFamilies.length > 0 &&
      selectedFamily !== 'ALL' &&
      !dynamicFilter.availableFamilies.includes(selectedFamily)
    ) {
      setSelectedFamily(dynamicFilter.availableFamilies[0]);
    }
    if (
      dynamicFilter.availableVoltages.length > 0 &&
      selectedVoltage !== 'ALL' &&
      !dynamicFilter.availableVoltages.includes(selectedVoltage)
    ) {
      setSelectedVoltage(dynamicFilter.availableVoltages[0]);
    }
    if (
      dynamicFilter.availableConductorMaterials.length > 0 &&
      selectedConductorMaterial !== 'ALL' &&
      !dynamicFilter.availableConductorMaterials.includes(selectedConductorMaterial)
    ) {
      setSelectedConductorMaterial(dynamicFilter.availableConductorMaterials[0]);
    }
    if (
      dynamicFilter.availableConductorSizes.length > 0 &&
      selectedConductorSize !== 'ALL' &&
      !dynamicFilter.availableConductorSizes.includes(selectedConductorSize)
    ) {
      setSelectedConductorSize(dynamicFilter.availableConductorSizes[0]);
    }
    if (
      dynamicFilter.availableCores.length > 0 &&
      selectedCores !== 'ALL' &&
      !dynamicFilter.availableCores.includes(selectedCores)
    ) {
      setSelectedCores(dynamicFilter.availableCores[0]);
    }
    if (
      dynamicFilter.availableInsulations.length > 0 &&
      selectedInsulation !== 'ALL' &&
      !dynamicFilter.availableInsulations.includes(selectedInsulation)
    ) {
      setSelectedInsulation(dynamicFilter.availableInsulations[0]);
    }
    if (
      dynamicFilter.availableArmours.length > 0 &&
      selectedArmour !== 'ALL' &&
      !dynamicFilter.availableArmours.includes(selectedArmour)
    ) {
      setSelectedArmour(dynamicFilter.availableArmours[0]);
    }
    if (
      dynamicFilter.availableSheathings.length > 0 &&
      selectedOuterSheath !== 'ALL' &&
      !dynamicFilter.availableSheathings.includes(selectedOuterSheath)
    ) {
      setSelectedOuterSheath(dynamicFilter.availableSheathings[0]);
    }
    if (
      dynamicFilter.availableStandards.length > 0 &&
      selectedStandard !== 'ALL' &&
      !dynamicFilter.availableStandards.includes(selectedStandard)
    ) {
      setSelectedStandard(dynamicFilter.availableStandards[0]);
    }
  }, [
    selectedCustomerCode,
    dynamicFilter.availableFamilies,
    dynamicFilter.availableVoltages,
    dynamicFilter.availableConductorMaterials,
    dynamicFilter.availableConductorSizes,
    dynamicFilter.availableCores,
    dynamicFilter.availableInsulations,
    dynamicFilter.availableArmours,
    dynamicFilter.availableSheathings,
    dynamicFilter.availableStandards,
  ]);

  const exactMasterMatch = validationResult.resolvedCable || (validationResult.matchingCables.length === 1 ? validationResult.matchingCables[0] : null);

  // Calculate Cable Identifiers dynamically
  const generatedCableCode = useMemo(() => {
    if (exactMasterMatch) {
      return exactMasterMatch.cableCode || exactMasterMatch.itemCode;
    }
    const familyPrefix = selectedFamily === 'MV' ? 'ENG-MV' : selectedFamily === 'LV' ? 'ENG-LV' : selectedFamily === 'HV' ? 'ENG-HV' : 'ENG-CTRL';
    const voltStr = selectedVoltage.replace(/[\/\s]/g, '');
    const condMat = selectedConductorMaterial === 'Copper' ? 'CU' : 'AL';
    const coreStr = selectedCores.replace(' Core', 'C');
    const sizeStr = selectedConductorSize.replace(' mm²', '');
    const arm = selectedArmour !== 'No Armour' && selectedArmour !== 'Unarmoured' ? selectedArmour : 'UNARM';
    const ins = selectedInsulation;
    const outer = selectedOuterSheath;

    return `${familyPrefix}${voltStr}-${condMat}${coreStr}${sizeStr}-${ins}-${arm}-${outer}`;
  }, [exactMasterMatch, selectedFamily, selectedVoltage, selectedConductorMaterial, selectedCores, selectedConductorSize, selectedInsulation, selectedArmour, selectedOuterSheath]);

  const generatedItemCode = useMemo(() => {
    if (exactMasterMatch) {
      return exactMasterMatch.itemCode;
    }
    const sizeStr = selectedConductorSize.replace(' mm²', '');
    const condMat = selectedConductorMaterial === 'Copper' ? 'CU' : 'AL';
    const voltShort = selectedVoltage.split('/')[0] || selectedVoltage.split(' ')[0];
    return `ITM-${voltShort}K-${sizeStr}-${condMat}`;
  }, [exactMasterMatch, selectedConductorSize, selectedConductorMaterial, selectedVoltage]);

  const generatedCustomerCode = useMemo(() => {
    if (selectedCustomerCode && selectedCustomerCode !== 'ALL') {
      return selectedCustomerCode;
    }
    const sizeStr = selectedConductorSize.replace(' mm²', '');
    const coreStr = selectedCores.replace(' Core', 'C');
    return `MDK-CAB-${coreStr}-${sizeStr}`;
  }, [selectedCustomerCode, selectedConductorSize, selectedCores]);

  // Dynamic Full Construction Description
  const generatedDesc = useMemo(() => {
    if (exactMasterMatch) {
      return exactMasterMatch.description;
    }
    return `${selectedCustomerCode !== 'ALL' ? selectedCustomerCode + ' ' : ''}${selectedVoltage} ${selectedCores} ${selectedConductorSize} ${selectedConductorMaterial} (${selectedInsulation}/${selectedArmour}/${selectedOuterSheath}) ${selectedColor} Cable [${selectedStandard}${specialRequirement !== 'None' ? ' • ' + specialRequirement : ''}]`;
  }, [exactMasterMatch, selectedCustomerCode, selectedVoltage, selectedCores, selectedConductorSize, selectedConductorMaterial, selectedInsulation, selectedArmour, selectedOuterSheath, selectedColor, selectedStandard, specialRequirement]);

  const handleAdd = () => {
    const qtyMeters = uom === 'KM' ? Math.round(qty * 1000) : Math.round(qty);
    const noOfDrums = Math.max(1, Math.ceil(qtyMeters / 1000));
    const cuttingLengthMeters = Math.round(qtyMeters / noOfDrums);

    const sizeNum = Number(selectedConductorSize.replace(' mm²', '')) || 240;
    const coreNum = selectedCores.includes('3') ? 3 : selectedCores.includes('4') ? 4 : 1;
    const copperWeight = selectedConductorMaterial === 'Copper' ? Math.round(sizeNum * coreNum * 8.9) : 0;
    const approxWeight = exactMasterMatch ? exactMasterMatch.approxWeightKgKm : Math.round(sizeNum * 12 + 1200);

    const newItem = {
      itemCode: generatedItemCode,
      cableCode: generatedCableCode,
      customerCode: generatedCustomerCode,
      itemDescription: generatedDesc,
      uom: uom,
      qty: qty,
      unitPriceUsd: selectedFamily.includes('HV') ? 35000 : selectedFamily.includes('MV') ? 18500 : 8200,
      drumDetails: {
        drumType: 'Wood Reel 220',
        noOfDrums,
        cuttingLengthMeters,
        totalLengthKm: uom === 'KM' ? qty : +(qtyMeters / 1000).toFixed(3),
        grossWeightPerDrumKg: 2150,
        netWeightPerDrumKg: 1850,
        drumsList: Array.from({ length: noOfDrums }).map((_, i) => ({
          drumNo: i + 1,
          drumType: 'Wood Reel 220',
          lengthMeters: cuttingLengthMeters,
          grossWeightKg: 2150,
        })),
      },
      bomDetails: {
        copperKgKm: copperWeight,
        insulationType: `${selectedInsulation} 90°C`,
        insulationThicknessMm: selectedVoltage.includes('33') || selectedVoltage.includes('30') ? 8.0 : selectedVoltage.includes('6/') || selectedVoltage.includes('10') ? 4.5 : 1.8,
        armourType: selectedArmour,
        sheathType: `${selectedOuterSheath} (${selectedColor})`,
        grossWeightKgKm: approxWeight,
      },
    };

    onAddConfiguredCable(newItem);
    onClose();
  };

  const handleSelectMasterRow = (item: ParsedCableRecord) => {
    setSelectedCustomerCode(item.customerCode);
    setSelectedFamily(item.family);
    setSelectedVoltage(item.voltage);
    setSelectedConductorMaterial(item.conductorMaterial);
    setSelectedConductorSize(item.conductorSize);
    setSelectedCores(item.cores);
    setSelectedInsulation(item.insulation);
    setSelectedArmour(item.armour);
    setSelectedOuterSheath(item.sheathing);
    setSelectedStandard(item.standard);
  };

  const handleReset = () => {
    setSelectedCustomerCode('N2XH');
    setSelectedFamily('LV');
    setSelectedVoltage('0.6/1 kV');
    setSelectedConductorMaterial('Copper');
    setSelectedConductorSize('16 mm²');
    setSelectedCores('1 Core');
    setSelectedInsulation('XLPE');
    setSelectedArmour('No Armour');
    setSelectedOuterSheath('LSHF');
    setSelectedStandard('IEC 60502-1');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="bg-brand-500 text-white px-5 py-4 flex items-center justify-between border-b border-brand-600 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Sparkles className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight font-display">
                Cable Parameters & Construction Builder
              </h3>
              <p className="text-xs text-brand-100">
                Customer-code driven dynamic filtering with certified catalog matching.
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Top Live Generated Codes Box */}
          <div className="bg-slate-950 text-white p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase text-amber-400 tracking-wider block mb-1">
                Generated Cable Construction Identifiers
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <span className="text-[10px] text-brand-300 font-bold block">Energya Cable Code</span>
                  <p className="font-mono text-base font-extrabold text-brand-300">
                    {generatedCableCode}
                  </p>
                </div>
                <div className="h-6 w-px bg-slate-800 hidden sm:block"></div>
                <div>
                  <span className="text-[10px] text-emerald-400 font-bold block">Item Code</span>
                  <p className="font-mono text-sm font-extrabold text-emerald-400">
                    {generatedItemCode}
                  </p>
                </div>
                <div className="h-6 w-px bg-slate-800 hidden sm:block"></div>
                <div>
                  <span className="text-[10px] text-amber-400 font-bold block">Customer Code</span>
                  <p className="font-mono text-sm font-extrabold text-amber-400">
                    {generatedCustomerCode}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-300 mt-2 font-medium bg-slate-900 p-2 rounded-lg border border-slate-800 truncate">
                {generatedDesc}
              </p>
            </div>
            <div className="flex items-center space-x-2 bg-slate-900 p-2.5 rounded-xl border border-slate-800 shrink-0">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold">Qty</label>
                <input
                  type="number"
                  step="0.1"
                  min={0.1}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="w-16 bg-slate-800 border border-slate-700 rounded p-1 text-white font-extrabold text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold">UOM</label>
                <select
                  value={uom}
                  onChange={(e) => setUom(e.target.value as any)}
                  className="bg-slate-800 border border-slate-700 rounded p-1 text-white font-bold text-xs outline-none"
                >
                  <option value="KM">KM</option>
                  <option value="M">M</option>
                  <option value="Reel">Reel</option>
                  <option value="PCS">PCS</option>
                </select>
              </div>
            </div>
          </div>

          {/* Title Section with Matching count & reset */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5 font-display">
              <Sliders className="h-4 w-4 text-brand-500" />
              <span>Select Cable Construction Parameters</span>
            </h4>
            <div className="flex items-center space-x-2">
              <Badge tone={validationResult.isValid ? 'success' : 'error'}>
                <Filter className="h-3 w-3 mr-1" />
                <span>{validationResult.matchCount} Valid Combinations</span>
              </Badge>
              <button
                onClick={handleReset}
                className="text-[11px] text-slate-500 hover:text-brand-600 flex items-center space-x-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* No valid match banner */}
          {!validationResult.isValid && (
            <div className="p-3.5 rounded-xl bg-error-50 dark:bg-error-950/60 border border-error-200 dark:border-error-800 text-error-800 dark:text-error-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-error-600 shrink-0" />
                <span className="font-bold text-xs">{validationResult.primaryMismatchMessage}</span>
              </div>
              <Button
                variant="accent"
                size="sm"
                onClick={handleReset}
                className="shrink-0"
              >
                Reset to Defaults
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Configurator Controls Grid */}
            <div className="lg:col-span-7 space-y-4 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              {/* 1. Customer Code (1st dimension) */}
              <div className="bg-brand-50/70 dark:bg-brand-950/40 p-3 rounded-xl border border-brand-200 dark:border-brand-800">
                <label className="block font-bold text-brand-900 dark:text-brand-300 mb-1.5 flex items-center">
                  <Database className="h-3.5 w-3.5 mr-1.5 text-brand-500" />
                  <span>Customer Code (1st Filtering Dimension)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedCustomerCode('ALL')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                      selectedCustomerCode === 'ALL'
                        ? 'bg-brand-500 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-brand-300'
                    }`}
                  >
                    All
                  </button>
                  {dynamicFilter.availableCustomerCodes.map((code) => (
                    <button
                      key={code}
                      onClick={() => setSelectedCustomerCode(code)}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                        selectedCustomerCode === code
                          ? 'bg-brand-500 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-brand-400'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 2. Cable Family */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Cable Family
                  </label>
                  <Select
                    value={selectedFamily}
                    onChange={(e) => setSelectedFamily(e.target.value)}
                  >
                    {dynamicFilter.availableFamilies.map((fam) => (
                      <option key={fam} value={fam}>
                        {fam}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 3. Voltage Rating */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Voltage Rating
                  </label>
                  <Select
                    value={selectedVoltage}
                    onChange={(e) => setSelectedVoltage(e.target.value)}
                  >
                    {dynamicFilter.availableVoltages.map((volt) => (
                      <option key={volt} value={volt}>
                        {volt}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 4. Conductor Material */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Conductor Material
                  </label>
                  <Select
                    value={selectedConductorMaterial}
                    onChange={(e) => setSelectedConductorMaterial(e.target.value)}
                  >
                    {dynamicFilter.availableConductorMaterials.map((mat) => (
                      <option key={mat} value={mat}>
                        {mat}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 5. Conductor Size */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Conductor Size
                  </label>
                  <Select
                    value={selectedConductorSize}
                    onChange={(e) => setSelectedConductorSize(e.target.value)}
                  >
                    {dynamicFilter.availableConductorSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 6. No. of Cores */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. of Cores
                  </label>
                  <Select
                    value={selectedCores}
                    onChange={(e) => setSelectedCores(e.target.value)}
                  >
                    {dynamicFilter.availableCores.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 7. Insulation Material */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Insulation Material
                  </label>
                  <Select
                    value={selectedInsulation}
                    onChange={(e) => setSelectedInsulation(e.target.value)}
                  >
                    {dynamicFilter.availableInsulations.map((ins) => (
                      <option key={ins} value={ins}>
                        {ins}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 8. Armour Layer */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Armour Layer
                  </label>
                  <Select
                    value={selectedArmour}
                    onChange={(e) => setSelectedArmour(e.target.value)}
                  >
                    {dynamicFilter.availableArmours.map((arm) => (
                      <option key={arm} value={arm}>
                        {arm}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 9. Outer Sheath */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Outer Sheath
                  </label>
                  <Select
                    value={selectedOuterSheath}
                    onChange={(e) => setSelectedOuterSheath(e.target.value)}
                  >
                    {dynamicFilter.availableSheathings.map((sh) => (
                      <option key={sh} value={sh}>
                        {sh}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 10. Standard */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Manufacturing Standard
                  </label>
                  <Select
                    value={selectedStandard}
                    onChange={(e) => setSelectedStandard(e.target.value)}
                  >
                    {dynamicFilter.availableStandards.map((std) => (
                      <option key={std} value={std}>
                        {std}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* 11. Color */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sheath Color
                  </label>
                  <Select
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                  >
                    <option value="Black">Black</option>
                    <option value="Red">Red</option>
                    <option value="Gray">Gray</option>
                  </Select>
                </div>
              </div>

              {/* Matching list rows preview */}
              {validationResult.matchingCables.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Matched Master Catalog Records ({validationResult.matchingCables.length}):
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {validationResult.matchingCables.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectMasterRow(c)}
                        className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] hover:border-brand-400 cursor-pointer transition-colors"
                      >
                        <span className="font-mono font-bold text-brand-600">{c.itemCode}</span>
                        <span className="text-slate-500 truncate max-w-[240px]">{c.description}</span>
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">{c.approxWeightKgKm} kg/km</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Interactive 2D Cross Section */}
            <div className="lg:col-span-5 flex flex-col justify-start">
              <CableCrossSectionViewer
                defaultMode="2D"
                cores={selectedCores}
                conductorMaterial={selectedConductorMaterial as any}
                crossSectionMm2={parseFloat(selectedConductorSize.replace(' mm²', '')) || 240}
                voltageClass={selectedFamily}
                voltageRating={selectedVoltage}
                insulation={selectedInsulation}
                innerSheath={selectedInnerSheath}
                armour={selectedArmour}
                outerSheath={selectedOuterSheath}
                cableCode={generatedCableCode}
                itemDescription={generatedDesc}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-medium">
            Standard Ref: <strong className="text-slate-800 dark:text-slate-200">{selectedStandard}</strong>
          </span>
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="md"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleAdd}
              disabled={!validationResult.isValid}
              leadingIcon={Plus}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Add Configured Cable to Request
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
