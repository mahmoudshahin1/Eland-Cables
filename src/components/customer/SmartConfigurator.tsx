import React, { useState, useMemo, useEffect } from 'react';
import {
  CustomerPortalTab,
  MasterCableCatalogItem,
  ResolvedCableStructure,
} from '../../types';
import { CableLiveSummaryPanel } from './CableLiveSummaryPanel';
import { CableResolutionCard } from './CableResolutionCard';
import { CableMultipleMatchesTable } from './CableMultipleMatchesTable';
import { CuttingLengthStepSection } from './CuttingLengthStepSection';
import { ParameterSelectorGrid } from './ParameterSelectorGrid';
import { CableConstructionBuilder } from './CableConstructionBuilder';
import { Cable45ParameterTable } from './Cable45ParameterTable';
import {
  evaluateDynamicFilterOptions,
  getAllParsedCables,
  ParsedCableRecord,
  validateCableConfiguration,
  createResolvedCableStructure,
  calculateCablePhysicsAndElectricals,
} from '../../services/cableSelectionService';
import {
  CableConfiguration,
  ParameterApplicability,
  ValidationResult,
} from '../../services/cableConstraintEngine';
import { loadAuthoritativeCableCatalog } from '../../services/masterDataApiService';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Sliders,
  Filter,
  Layers,
  Table,
  LayoutGrid,
} from 'lucide-react';

interface SmartConfiguratorProps {
  onNavigateTab: (tab: CustomerPortalTab) => void;
  onSetGeneratedCableCode?: (code: string) => void;
}

export type ConfiguratorMode = 'CUSTOMER' | 'TECHNICAL';
export type ConfiguratorViewTab = 'GRID' | 'BUILDER' | 'TABLE';

export const SmartConfigurator: React.FC<SmartConfiguratorProps> = ({
  onNavigateTab,
}) => {
  const { jwtToken } = useAuth();
  // -------------------------------------------------------------
  // Mode Selection: Mode 1 (Customer Code) vs Mode 2 (Technical)
  // -------------------------------------------------------------
  const selectionMode: ConfiguratorMode = 'TECHNICAL';
  const [selectedManualCable, setSelectedManualCable] = useState<ParsedCableRecord | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<ConfiguratorViewTab>('GRID');
  const [pgCatalog, setPgCatalog] = useState<MasterCableCatalogItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAuthoritativeCableCatalog(jwtToken).then((resolved) => {
      if (cancelled) return;
      // Empty PG wins; still set so validate uses authoritative empty vs stale LS default.
      if (resolved.authoritative || resolved.source === 'POSTGRESQL') {
        setPgCatalog(resolved.data);
      } else {
        setPgCatalog(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  // -------------------------------------------------------------
  // Unified 45-Parameter Cable Configuration State
  // -------------------------------------------------------------
  const [config, setConfig] = useState<CableConfiguration>({
    customerCode: '',
    family: '',
    cableType: '',
    standard: '',
    voltage: '',
    conductor: '',
    conductorClass: '',
    conductorConstruction: '',
    conductorSize: '',
    conductorWaterTight: '',
    core: '',
    coreIdentification: '',
    coreConstruction: '',
    insulation: '',
    outerSemiConductor: '',
    outerSemiConductorType: '',
    screen: '',
    screenCSA: '',
    screenWaterTight: '',
    screenConstruction: '',
    fillerBinder: '',
    bedding: '',
    armour: '',
    armourMaterial: '',
    armourCSA: '',
    armourWaterTight: '',
    innerSheath: '',
    sheathing: '',
    sheathingColor: '',
    specialAdditives: '',
    semiConductiveSheath: '',
    graphiteCoating: '',
    cpr: '',
    cprClass: '',
    edr: '',
    cuttingLength: 500,
    lengthTolerance: '±0%',
    drumType: 'Lagged Wooden Non-Returnable',
    specialCustomerRequirements: '',
  });

  // -------------------------------------------------------------
  // Dynamic filter calculation using master catalog
  // -------------------------------------------------------------
  const parsedCatalog = useMemo(
    () => (pgCatalog !== null ? getAllParsedCables(pgCatalog) : undefined),
    [pgCatalog]
  );

  const dynamicFilter = useMemo(() => {
    return evaluateDynamicFilterOptions({
      customerCode: config.customerCode || undefined,
      family: config.family || undefined,
      cableType: config.cableType || undefined,
      standard: config.standard || undefined,
      voltage: config.voltage || undefined,
      conductorMaterial: config.conductor || undefined,
      conductorClass: config.conductorClass || undefined,
      conductorConstruction: config.conductorConstruction || undefined,
      conductorSize: config.conductorSize != null ? String(config.conductorSize) : undefined,
      conductorWaterTight: config.conductorWaterTight || undefined,
      cores: config.core != null ? String(config.core) : undefined,
      coreIdentification: config.coreIdentification || undefined,
      coreConstruction: config.coreConstruction || undefined,
      insulation: config.insulation || undefined,
      outerSemiConductor: config.outerSemiConductor || undefined,
      outerSemiConductorType: config.outerSemiConductorType || undefined,
      screenType: config.screen || undefined,
      screenCSA: config.screenCSA != null ? String(config.screenCSA) : undefined,
      screenWaterTight: config.screenWaterTight || undefined,
      screenConstruction: config.screenConstruction || undefined,
      fillerBinder: config.fillerBinder || undefined,
      bedding: config.bedding || undefined,
      armour: config.armour || undefined,
      armourMaterial: config.armourMaterial || undefined,
      armourCSA: config.armourCSA != null ? String(config.armourCSA) : undefined,
      armourWaterTight: config.armourWaterTight || undefined,
      innerSheath: config.innerSheath || undefined,
      sheathing: config.sheathing || undefined,
      sheathingColor: config.sheathingColor || undefined,
      specialAdditives: config.specialAdditives || undefined,
      semiConductiveSheath: config.semiConductiveSheath || undefined,
      graphiteCoating: config.graphiteCoating || undefined,
      cpr: config.cpr || undefined,
      cprClass: config.cprClass || undefined,
      edr: config.edr || undefined,
      cuttingLength: config.cuttingLength,
      lengthTolerance: config.lengthTolerance,
      drumType: config.drumType,
      specialCustomerRequirements: config.specialCustomerRequirements,
    }, parsedCatalog);
  }, [config, parsedCatalog]);

  // -------------------------------------------------------------
  // Reusable Cable Constraint Validation Engine
  // -------------------------------------------------------------
  const validationResult = useMemo((): ValidationResult => {
    const catalogOpts = pgCatalog ? { customCatalog: pgCatalog } : undefined;
    if (selectionMode === 'TECHNICAL' && !config.family) {
      return {
        isValid: false,
        status: 'INCOMPLETE_CONFIGURATION' as const,
        matchCount: getAllParsedCables(pgCatalog ?? undefined).length,
        matchingCables: [],
        resolvedCable: null,
        parameterStates: { family: 'Required' as ParameterApplicability },
        invalidParameters: [],
        warnings: [],
        requiredParameters: ['family'],
        optionalParameters: [],
        notApplicableParameters: [],
        mismatchReasons: ['Please select a Cable Family (LV, MV, HV) to begin technical configuration.'],
        diagnostics: {
          checkedAttributesCount: 0,
          matchingCount: 0,
          totalCatalogRecords: 0,
          conflictingSelections: [],
          suggestedFixes: ['Choose Low Voltage (LV), Medium Voltage (MV), or High Voltage (HV).'],
        },
      };
    }

    return validateCableConfiguration(config, catalogOpts);
  }, [selectionMode, config, pgCatalog]);

  // Sync manual selection validity
  useEffect(() => {
    if (
      selectedManualCable &&
      !validationResult.matchingCables.some(
        (c) => c.id === selectedManualCable.id || c.cableCode === selectedManualCable.cableCode
      )
    ) {
      setSelectedManualCable(null);
    }
  }, [validationResult.matchingCables, selectedManualCable]);

  // -------------------------------------------------------------
  // Resolved Cable
  // -------------------------------------------------------------
  const exactMasterMatch: ParsedCableRecord | null = useMemo(() => {
    if (
      selectedManualCable &&
      validationResult.matchingCables.some(
        (c) => c.id === selectedManualCable.id || c.cableCode === selectedManualCable.cableCode
      )
    ) {
      return selectedManualCable;
    }
    if (validationResult.resolvedCable) {
      return validationResult.resolvedCable;
    }
    if (validationResult.matchingCables.length === 1) {
      return validationResult.matchingCables[0];
    }
    return null;
  }, [selectedManualCable, validationResult.matchingCables, validationResult.resolvedCable]);

  // Structured Resolved Object for Downstream Systems
  const resolvedStructure: ResolvedCableStructure | null = useMemo(() => {
    if (!exactMasterMatch) return null;
    return createResolvedCableStructure(exactMasterMatch, config);
  }, [exactMasterMatch, config]);

  // -------------------------------------------------------------
  // Calculated Physics & Performance
  // -------------------------------------------------------------
  const calculatedPhysics = useMemo(() => {
    const sizeNum = config.conductorSize ? parseFloat(String(config.conductorSize)) || 120 : 120;
    const coresNum = config.core ? parseInt(String(config.core), 10) || 1 : 1;
    const isArm = !!config.armour && config.armour !== 'No Armour' && config.armour !== 'None';
    const approxOD = exactMasterMatch ? exactMasterMatch.outerDiameterMm : (sizeNum > 300 ? 56 : 28);
    const screenNum = config.screenCSA ? parseFloat(String(config.screenCSA)) || 25 : 0;

    const basePhysics = calculateCablePhysicsAndElectricals(
      config.family || 'LV',
      config.voltage || '0.6/1 kV',
      config.conductor || 'Copper',
      sizeNum,
      coresNum,
      config.insulation || 'XLPE',
      isArm,
      approxOD,
      screenNum
    );

    return {
      ...basePhysics,
      outerDiameterMm: exactMasterMatch?.outerDiameterMm || approxOD,
      approxWeightKgKm: exactMasterMatch?.approxWeightKgKm || (coresNum * sizeNum * 9 + 450),
      drumCapacity: 4500,
    };
  }, [config, exactMasterMatch]);

  // -------------------------------------------------------------
  // Cascading Selection Handlers with Strict Downstream Reset
  // -------------------------------------------------------------
  const handleUpdateParam = (key: keyof CableConfiguration, value: any) => {
    setSelectedManualCable(null);

    setConfig((prev) => {
      const next = { ...prev, [key]: value };

      // Parameter sequence index map for cascading resets
      if (key === 'customerCode') {
        // Reset everything downstream of customerCode
        return {
          customerCode: value,
          family: '',
          cableType: '',
          standard: '',
          voltage: '',
          conductor: '',
          conductorClass: '',
          conductorConstruction: '',
          conductorSize: '',
          conductorWaterTight: '',
          core: '',
          coreIdentification: '',
          coreConstruction: '',
          insulation: '',
          outerSemiConductor: '',
          outerSemiConductorType: '',
          screen: '',
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          fillerBinder: '',
          bedding: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
          cuttingLength: prev.cuttingLength,
          lengthTolerance: prev.lengthTolerance,
          drumType: prev.drumType,
          specialCustomerRequirements: prev.specialCustomerRequirements,
        };
      }

      if (key === 'family') {
        return {
          ...prev,
          family: value,
          cableType: '',
          standard: '',
          voltage: '',
          conductor: '',
          conductorClass: '',
          conductorConstruction: '',
          conductorSize: '',
          conductorWaterTight: '',
          core: '',
          coreIdentification: '',
          coreConstruction: '',
          insulation: '',
          outerSemiConductor: '',
          outerSemiConductorType: '',
          screen: '',
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          fillerBinder: '',
          bedding: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'voltage') {
        return {
          ...prev,
          voltage: value,
          conductor: '',
          conductorClass: '',
          conductorConstruction: '',
          conductorSize: '',
          conductorWaterTight: '',
          core: '',
          coreIdentification: '',
          coreConstruction: '',
          insulation: '',
          outerSemiConductor: '',
          outerSemiConductorType: '',
          screen: '',
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          fillerBinder: '',
          bedding: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'conductor') {
        return {
          ...prev,
          conductor: value,
          conductorClass: '',
          conductorConstruction: '',
          conductorSize: '',
          conductorWaterTight: '',
          core: '',
          coreIdentification: '',
          coreConstruction: '',
          insulation: '',
          outerSemiConductor: '',
          outerSemiConductorType: '',
          screen: '',
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          fillerBinder: '',
          bedding: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'conductorSize') {
        return {
          ...prev,
          conductorSize: value,
          core: '',
          coreIdentification: '',
          coreConstruction: '',
          insulation: '',
          outerSemiConductor: '',
          outerSemiConductorType: '',
          screen: '',
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          fillerBinder: '',
          bedding: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'core') {
        return {
          ...prev,
          core: value,
          coreIdentification: '',
          coreConstruction: '',
          insulation: '',
          outerSemiConductor: '',
          outerSemiConductorType: '',
          screen: '',
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          fillerBinder: '',
          bedding: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'insulation') {
        return {
          ...prev,
          insulation: value,
          outerSemiConductor: '',
          outerSemiConductorType: '',
          screen: '',
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          fillerBinder: '',
          bedding: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'screen') {
        return {
          ...prev,
          screen: value,
          screenCSA: '',
          screenWaterTight: '',
          screenConstruction: '',
          armour: '',
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'armour') {
        return {
          ...prev,
          armour: value,
          armourMaterial: '',
          armourCSA: '',
          armourWaterTight: '',
          innerSheath: '',
          sheathing: '',
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      if (key === 'sheathing') {
        return {
          ...prev,
          sheathing: value,
          sheathingColor: '',
          specialAdditives: '',
          semiConductiveSheath: '',
          graphiteCoating: '',
          cpr: '',
          cprClass: '',
          edr: '',
        };
      }

      return next;
    });
  };

  const handleResetFilters = () => {
    setSelectedManualCable(null);
    setConfig({
      customerCode: '',
      family: '',
      cableType: '',
      standard: '',
      voltage: '',
      conductor: '',
      conductorClass: '',
      conductorConstruction: '',
      conductorSize: '',
      conductorWaterTight: '',
      core: '',
      coreIdentification: '',
      coreConstruction: '',
      insulation: '',
      outerSemiConductor: '',
      outerSemiConductorType: '',
      screen: '',
      screenCSA: '',
      screenWaterTight: '',
      screenConstruction: '',
      fillerBinder: '',
      bedding: '',
      armour: '',
      armourMaterial: '',
      armourCSA: '',
      armourWaterTight: '',
      innerSheath: '',
      sheathing: '',
      sheathingColor: '',
      specialAdditives: '',
      semiConductiveSheath: '',
      graphiteCoating: '',
      cpr: '',
      cprClass: '',
      edr: '',
      cuttingLength: 500,
      lengthTolerance: '±0%',
      drumType: 'Lagged Wooden Non-Returnable',
      specialCustomerRequirements: '',
    });
  };

  const handleSelectSpecificMasterItem = (item: ParsedCableRecord) => {
    setSelectedManualCable(item);
    setConfig((prev) => ({
      ...prev,
      customerCode: item.customerCode,
      family: item.family,
      cableType: item.cableType,
      standard: item.standard,
      voltage: item.voltage,
      conductor: item.conductorMaterial,
      conductorClass: item.conductorClass,
      conductorConstruction: item.conductorConstruction,
      conductorSize: item.conductorSize,
      conductorWaterTight: item.conductorWaterTight,
      core: item.cores,
      coreIdentification: item.coreIdentification,
      coreConstruction: item.coreConstruction,
      insulation: item.insulation,
      outerSemiConductor: item.outerSemiConductor,
      outerSemiConductorType: item.outerSemiConductorType,
      screen: item.screenType,
      screenCSA: item.screenCSA,
      screenWaterTight: item.screenWaterTight,
      screenConstruction: item.screenConstruction,
      fillerBinder: item.fillerBinder,
      bedding: item.bedding,
      armour: item.armour,
      armourMaterial: item.armourMaterial,
      armourCSA: item.armourCSA,
      armourWaterTight: item.armourWaterTight,
      innerSheath: item.innerSheath,
      sheathing: item.sheathing,
      sheathingColor: item.sheathingColor,
      specialAdditives: item.specialAdditives,
      semiConductiveSheath: item.semiConductiveSheath,
      graphiteCoating: item.graphiteCoating,
      cpr: item.cpr,
      cprClass: item.cprClass,
      edr: item.edr,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner Card */}
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-blue-300 uppercase tracking-widest bg-blue-800/60 px-2.5 py-1 rounded-md border border-blue-600/40">
                MASTER CATALOG CABLE SELECTOR
              </span>
              <span className="text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-md flex items-center">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                45-Parameter Cascading Engine
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight mt-1">
              Technical Parameters
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              {exactMasterMatch
                ? `Resolved Match: ${exactMasterMatch.description} (Item #${exactMasterMatch.cableCode})`
                : 'Complete 45-parameter engineering sequence with open/dimmed validation states based on upstream selections.'}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleResetFilters}
              className="text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-3.5 py-2 rounded-xl border border-slate-700 flex items-center space-x-1.5 transition-colors shadow-sm font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset All Selections</span>
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. LIVE SYNCHRONIZED CONFIGURATION SUMMARY PANEL               */}
      {/* ------------------------------------------------------------- */}
      <CableLiveSummaryPanel
        config={config}
        validationResult={validationResult}
        onResetFilters={handleResetFilters}
      />

      {/* ------------------------------------------------------------- */}
      {/* 3. RESOLVED CABLE DISPLAY & CUTTING LENGTH SECTION             */}
      {/* ------------------------------------------------------------- */}
      {exactMasterMatch && resolvedStructure && (
        <div className="space-y-6 animate-fade-in">
          <CableResolutionCard
            resolvedCable={resolvedStructure}
            onNavigateTab={onNavigateTab}
            onSelectAnotherCable={
              validationResult.matchingCables.length > 1
                ? () => setSelectedManualCable(null)
                : undefined
            }
          />

          {/* CUTTING LENGTH & PRODUCTION STEP */}
          <CuttingLengthStepSection
            resolvedCable={resolvedStructure}
            initialCuttingLength={config.cuttingLength || 500}
            onNavigateTab={onNavigateTab}
          />
        </div>
      )}

      {/* When multiple matches exist */}
      {validationResult.matchingCables.length > 1 && !selectedManualCable && (
        <CableMultipleMatchesTable
          matchingCables={validationResult.matchingCables}
          selectedCableId={exactMasterMatch?.id}
          onSelectCable={handleSelectSpecificMasterItem}
        />
      )}

      {/* No match alert */}
      {validationResult.status === 'INVALID_NO_MATCH' && (
        <div className="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border-2 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 space-y-3 shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-rose-600 text-white shrink-0 mt-0.5">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-rose-950 dark:text-white">
                  No matching cable found in approved catalog.
                </h4>
                <p className="text-xs text-rose-800 dark:text-rose-200 mt-1 font-medium">
                  The selected parameter combination does not correspond to an existing certified master record.
                </p>
              </div>
            </div>
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors shrink-0 shadow-sm"
            >
              Reset Selections
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. ALL 45 PARAMETERS WORKSPACE WITH MULTI-VIEW PRESENTATION    */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-6">
        {/* Workspace Top Header & View Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Technical Parameters & Construction Builder (All 45 Parameters)
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Technical Design
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select between the 8-Step Engineering Grid, Layer-by-Layer Construction Builder, or the Full 45-Parameter Specification Sheet.
            </p>
          </div>

          {/* View Tab Switcher Buttons */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner self-start md:self-auto">
            <button
              onClick={() => setActiveViewTab('GRID')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeViewTab === 'GRID'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>8-Section Grid</span>
            </button>

            <button
              onClick={() => setActiveViewTab('BUILDER')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeViewTab === 'BUILDER'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Construction Builder</span>
            </button>

            <button
              onClick={() => setActiveViewTab('TABLE')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeViewTab === 'TABLE'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Table className="h-3.5 w-3.5" />
              <span>All 45 Parameters</span>
            </button>
          </div>
        </div>

        {/* View 1: The 45-Parameter Cascading Selector Grid */}
        {activeViewTab === 'GRID' && (
          <ParameterSelectorGrid
            config={config}
            dynamicFilter={dynamicFilter}
            selectionMode={selectionMode}
            onUpdateParam={handleUpdateParam}
            calculatedPhysics={calculatedPhysics}
          />
        )}

        {/* View 2: Interactive Cable Construction Builder */}
        {activeViewTab === 'BUILDER' && (
          <CableConstructionBuilder
            config={config}
            dynamicFilter={dynamicFilter}
            onUpdateParam={handleUpdateParam}
            calculatedPhysics={calculatedPhysics}
          />
        )}

        {/* View 3: Complete 45-Parameter Master Specification Table */}
        {activeViewTab === 'TABLE' && (
          <Cable45ParameterTable
            config={config}
            dynamicFilter={dynamicFilter}
            selectionMode={selectionMode}
            onUpdateParam={handleUpdateParam}
            calculatedPhysics={calculatedPhysics}
          />
        )}
      </div>
    </div>
  );
};
