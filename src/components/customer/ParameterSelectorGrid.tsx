import React from 'react';
import {
  Zap,
  CheckCircle2,
  Check,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Lock,
  CheckCircle,
  Sparkles,
  Ban,
  Flame,
  Award,
  Layers,
  FileSpreadsheet,
  Truck,
  Scale,
  Thermometer,
  Activity,
  Box,
  Tag,
  HelpCircle,
} from 'lucide-react';
import { DynamicFilterOptions } from '../../services/cableSelectionService';
import { CableConfiguration } from '../../services/cableConstraintEngine';

export interface ParameterGridProps {
  config: CableConfiguration;
  dynamicFilter: DynamicFilterOptions;
  selectionMode: 'CUSTOMER' | 'TECHNICAL';
  onUpdateParam: (key: keyof CableConfiguration, value: any) => void;
  calculatedPhysics: {
    outerDiameterMm?: number;
    approxWeightKgKm?: number;
    minBendingRadiusMm?: number;
    operatingTempC?: string;
    shortCircuitRatingKa?: string;
    insulationThicknessMm?: number;
    armourDim?: string;
    drumCapacity?: number;
  };
}

export const ParameterSelectorGrid: React.FC<ParameterGridProps> = ({
  config,
  dynamicFilter,
  selectionMode,
  onUpdateParam,
  calculatedPhysics,
}) => {
  // Cascading validation helpers
  const isFamilyOpen = true;
  const isFamilyDone = !!config.family;

  const isTypeOpen = isFamilyDone;
  const isTypeDone = !!config.cableType;

  const isStdOpen = isFamilyDone;
  const isStdDone = !!config.standard;

  const isVoltOpen = isFamilyDone;
  const isVoltDone = !!config.voltage;

  const isCondMatOpen = isVoltDone;
  const isCondMatDone = !!config.conductor;

  const isCondClassOpen = isCondMatDone;
  const isCondClassDone = !!config.conductorClass;

  const isCondShapeOpen = isCondMatDone;
  const isCondShapeDone = !!config.conductorConstruction;

  const isCondSizeOpen = isCondMatDone;
  const isCondSizeDone = !!config.conductorSize;

  const isCondWTOpen = isCondMatDone;
  const isCondWTDone = !!config.conductorWaterTight;

  const isCoresOpen = isCondSizeDone;
  const isCoresDone = !!config.core;

  const isCoreIdOpen = isCoresDone;
  const isCoreIdDone = !!config.coreIdentification;

  const isCoreAssemblyOpen = isCoresDone;
  const isCoreAssemblyDone = !!config.coreConstruction;

  const isInsOpen = isCoresDone;
  const isInsDone = !!config.insulation;

  // Outer semi-con (MV / HV only)
  const isMVHV = config.family === 'MV' || config.family === 'HV' || config.family === 'EHV';
  const isOuterSemiConApplicable = isMVHV;
  const isOuterSemiConOpen = isInsDone && isOuterSemiConApplicable;
  const isOuterSemiConDone = !!config.outerSemiConductor || !isOuterSemiConApplicable;

  const isOuterSemiTypeOpen = isOuterSemiConOpen && !!config.outerSemiConductor && config.outerSemiConductor !== 'None' && config.outerSemiConductor !== 'No';
  const isOuterSemiTypeDone = !!config.outerSemiConductorType || !isOuterSemiTypeOpen;

  // Screen
  const isScreenTypeOpen = isInsDone;
  const isScreenTypeDone = !!config.screen;

  const isScreenActive = !!config.screen && config.screen !== 'No Screen' && config.screen !== 'None';
  const isScreenCSAOpen = isScreenActive;
  const isScreenCSADone = !!config.screenCSA || !isScreenActive;

  const isScreenWTOpen = isScreenActive;
  const isScreenWTDone = !!config.screenWaterTight || !isScreenActive;

  const isScreenBindingOpen = isScreenActive;
  const isScreenBindingDone = !!config.screenConstruction || !isScreenActive;

  // Fillers & Bedding
  const isMultiCore = config.core && config.core !== '1 Core' && config.core !== '1C';
  const isFillerOpen = isCoresDone && isMultiCore;
  const isFillerDone = !!config.fillerBinder || !isMultiCore;

  const isArmourOpen = isScreenTypeDone;
  const isArmourDone = !!config.armour;

  const isArmourActive = !!config.armour && config.armour !== 'No Armour' && config.armour !== 'Unarmoured' && config.armour !== 'None';
  
  const isBeddingOpen = isArmourDone && isArmourActive;
  const isBeddingDone = !!config.bedding || !isArmourActive;

  const isArmourMatOpen = isArmourActive;
  const isArmourMatDone = !!config.armourMaterial || !isArmourActive;

  const isArmourWTOpen = isArmourActive;
  const isArmourWTDone = !!config.armourWaterTight || !isArmourActive;

  const isInnerSheathOpen = isArmourActive;
  const isInnerSheathDone = !!config.innerSheath || !isArmourActive;

  // Sheathing & Additives
  const isSheathOpen = isArmourDone;
  const isSheathDone = !!config.sheathing;

  const isSheathColorOpen = isSheathDone;
  const isSheathColorDone = !!config.sheathingColor;

  const isAdditivesOpen = isSheathDone;
  const isAdditivesDone = !!config.specialAdditives;

  const isSemiCondSheathOpen = isSheathDone && isMVHV;
  const isSemiCondSheathDone = !!config.semiConductiveSheath || !isMVHV;

  const isGraphiteOpen = isSheathDone;
  const isGraphiteDone = !!config.graphiteCoating;

  const isCPROpen = isSheathDone;
  const isCPRDone = !!config.cpr;

  const isCPRClassOpen = isCPROpen && config.cpr === 'Yes';
  const isCPRClassDone = !!config.cprClass || config.cpr !== 'Yes';

  const isEDROpen = isSheathDone;
  const isEDRDone = !!config.edr;

  // Logistics
  const isCuttingLenOpen = isSheathDone;
  const isCuttingLenDone = !!config.cuttingLength;

  const isToleranceOpen = isCuttingLenOpen;
  const isToleranceDone = !!config.lengthTolerance;

  const isDrumTypeOpen = isCuttingLenOpen;
  const isDrumTypeDone = !!config.drumType;

  const isMarkingOpen = isCuttingLenOpen;
  const isMarkingDone = !!config.specialCustomerRequirements;

  return (
    <div className="space-y-8" id="cable-parameter-workspace-45">
      {/* ========================================================================= */}
      {/* SECTION 1: COMMERCIAL, APPLICATION & STANDARDS (Params 1 - 5)             */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
              1
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <span>Commercial Reference, Application & Standards</span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold lowercase">
                (params 1–5)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Step 1 of 8</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 2. Cable Family */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isFamilyOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="font-mono text-slate-400">#2</span>
                <span>Cable Family</span>
              </label>
              {isFamilyDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isFamilyOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Dimmed
                </span>
              )}
            </div>
            <select
              value={config.family || ''}
              disabled={!isFamilyOpen}
              onChange={(e) => onUpdateParam('family', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isFamilyOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isFamilyOpen ? '-- Select Cable Family --' : '-- Dimmed (Step 1 first) --'}</option>
              {dynamicFilter.availableFamilies.map((fam) => (
                <option key={fam} value={fam}>
                  {fam === 'LV' ? 'LV Power (0.6/1 kV)' : fam === 'MV' ? 'MV Power (6-36 kV)' : fam === 'HV' ? 'HV Power (64-400 kV)' : fam}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Cable Type / Application */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isTypeOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="font-mono text-slate-400">#3</span>
                <span>Cable Type / Application</span>
              </label>
              {isTypeDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isTypeOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Dimmed
                </span>
              )}
            </div>
            <select
              value={config.cableType || ''}
              disabled={!isTypeOpen}
              onChange={(e) => onUpdateParam('cableType', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isTypeOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isTypeOpen ? '-- Select Cable Type --' : '-- Dimmed (Select Family first) --'}</option>
              {dynamicFilter.availableCableTypes.length > 0 ? (
                dynamicFilter.availableCableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))
              ) : (
                <>
                  <option value="LV Power">LV Underground Power</option>
                  <option value="MV Power">MV Primary Distribution</option>
                  <option value="HV Power">HV Transmission</option>
                  <option value="Control">Multi-Core Control</option>
                </>
              )}
            </select>
          </div>

          {/* 4. Applicable Standard */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isStdOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="font-mono text-slate-400">#4</span>
                <span>Applicable Standard</span>
              </label>
              {isStdDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isStdOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Dimmed
                </span>
              )}
            </div>
            <select
              value={config.standard || ''}
              disabled={!isStdOpen}
              onChange={(e) => onUpdateParam('standard', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isStdOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isStdOpen ? '-- Select Standard --' : '-- Dimmed (Select Family first) --'}</option>
              {dynamicFilter.availableStandards.map((std) => (
                <option key={std} value={std}>
                  {std}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Voltage Rating */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isVoltOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="font-mono text-slate-400">#5</span>
                <span>Voltage Rating (U₀/U)</span>
              </label>
              {isVoltDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isVoltOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Open ({dynamicFilter.availableVoltages.length})
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Dimmed
                </span>
              )}
            </div>
            <select
              value={config.voltage || ''}
              disabled={!isVoltOpen}
              onChange={(e) => onUpdateParam('voltage', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isVoltOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isVoltOpen ? '-- Select Voltage --' : '-- Dimmed (Select Family first) --'}</option>
              {dynamicFilter.availableVoltages.map((volt) => (
                <option key={volt} value={volt}>
                  {volt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: CONDUCTOR ENGINEERING (Params 6 - 10)                           */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-accent-500 text-slate-900 font-bold text-xs flex items-center justify-center">
              2
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span>Conductor Core Engineering</span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold lowercase">
                (params 6–10)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Step 2 of 8</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 6. Conductor Material */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCondMatOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#6</span>
                <span>Material</span>
              </label>
              {isCondMatDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCondMatOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.conductor || ''}
              disabled={!isCondMatOpen}
              onChange={(e) => onUpdateParam('conductor', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCondMatOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCondMatOpen ? '-- Material --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableConductorMaterials.map((m) => (
                <option key={m} value={m}>
                  {m === 'Copper' ? 'Copper (Cu)' : m === 'Aluminum' ? 'Aluminum (Al)' : m}
                </option>
              ))}
            </select>
          </div>

          {/* 7. Conductor Class */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCondClassOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#7</span>
                <span>Flexibility Class</span>
              </label>
              {isCondClassDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCondClassOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.conductorClass || ''}
              disabled={!isCondClassOpen}
              onChange={(e) => onUpdateParam('conductorClass', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCondClassOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCondClassOpen ? '-- Class --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableConductorClasses.length > 0 ? (
                dynamicFilter.availableConductorClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              ) : (
                <>
                  <option value="Class 1">Class 1 (Solid)</option>
                  <option value="Class 2">Class 2 (Stranded)</option>
                  <option value="Class 5">Class 5 (Flexible)</option>
                </>
              )}
            </select>
          </div>

          {/* 8. Conductor Construction / Shape */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCondShapeOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#8</span>
                <span>Shape / Compact</span>
              </label>
              {isCondShapeDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCondShapeOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.conductorConstruction || ''}
              disabled={!isCondShapeOpen}
              onChange={(e) => onUpdateParam('conductorConstruction', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCondShapeOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCondShapeOpen ? '-- Shape --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableConductorConstructions.length > 0 ? (
                dynamicFilter.availableConductorConstructions.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape}
                  </option>
                ))
              ) : (
                <>
                  <option value="Stranded Compact">Circular Compacted</option>
                  <option value="Sector Shaped">Sector Shaped (2C-4C LV)</option>
                  <option value="Milliken">Milliken Segmented (Large HV)</option>
                </>
              )}
            </select>
          </div>

          {/* 9. Conductor Size (Cross-Section) */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCondSizeOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#9</span>
                <span>Size (mm²)</span>
              </label>
              {isCondSizeDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCondSizeOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open ({dynamicFilter.availableConductorSizes.length})
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.conductorSize || ''}
              disabled={!isCondSizeOpen}
              onChange={(e) => onUpdateParam('conductorSize', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCondSizeOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCondSizeOpen ? '-- Cross-Section --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableConductorSizes.map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </div>

          {/* 10. Conductor Water-Tightness */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCondWTOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#10</span>
                <span>Water-Tight</span>
              </label>
              {isCondWTDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCondWTOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.conductorWaterTight || ''}
              disabled={!isCondWTOpen}
              onChange={(e) => onUpdateParam('conductorWaterTight', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCondWTOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCondWTOpen ? '-- Swellable --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableConductorWaterTights.length > 0 ? (
                dynamicFilter.availableConductorWaterTights.map((wt) => (
                  <option key={wt} value={wt}>
                    {wt}
                  </option>
                ))
              ) : (
                <>
                  <option value="None">None (Standard Dry)</option>
                  <option value="Swellable Powder">Swellable Powder / Yarn</option>
                  <option value="Longitudinal Swellable Tape">Swellable Tape (Underground)</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: CORE ASSEMBLY & INSULATION SYSTEM (Params 11 - 15)              */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              3
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              <span>Core Assembly & Insulation System</span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold lowercase">
                (params 11–15)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Step 3 of 8</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 11. Number of Cores */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCoresOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#11</span>
                <span>No. of Cores</span>
              </label>
              {isCoresDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCoresOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.core || ''}
              disabled={!isCoresOpen}
              onChange={(e) => onUpdateParam('core', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCoresOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCoresOpen ? '-- Cores --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableCores.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 12. Core Identification / Color Coding */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCoreIdOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#12</span>
                <span>Core Color Code</span>
              </label>
              {isCoreIdDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCoreIdOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.coreIdentification || ''}
              disabled={!isCoreIdOpen}
              onChange={(e) => onUpdateParam('coreIdentification', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCoreIdOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCoreIdOpen ? '-- Color Code --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableCoreIdentifications.length > 0 ? (
                dynamicFilter.availableCoreIdentifications.map((cid) => (
                  <option key={cid} value={cid}>
                    {cid}
                  </option>
                ))
              ) : (
                <>
                  <option value="HD 308 S2">HD 308 S2 (Brown/Black/Grey/Blue/YG)</option>
                  <option value="Traditional Red/Yellow/Blue/Black">Red / Yellow / Blue / Black</option>
                  <option value="White with Black Numbers">Numbered Cores (Control)</option>
                </>
              )}
            </select>
          </div>

          {/* 13. Core Construction / Assembly */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCoreAssemblyOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#13</span>
                <span>Core Assembly</span>
              </label>
              {isCoreAssemblyDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isCoreAssemblyOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.coreConstruction || ''}
              disabled={!isCoreAssemblyOpen}
              onChange={(e) => onUpdateParam('coreConstruction', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isCoreAssemblyOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isCoreAssemblyOpen ? '-- Assembly --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableCoreConstructions.length > 0 ? (
                dynamicFilter.availableCoreConstructions.map((cc) => (
                  <option key={cc} value={cc}>
                    {cc}
                  </option>
                ))
              ) : (
                <>
                  <option value="Laid-up with Fillers">Laid-up with Non-hygroscopic Fillers</option>
                  <option value="Extruded Inner Core Assembly">Extruded Bedding Assembly</option>
                  <option value="Single-Core Concentric">Single-Core Concentric</option>
                </>
              )}
            </select>
          </div>

          {/* 14. Insulation Material */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isInsOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#14</span>
                <span>Insulation Mat.</span>
              </label>
              {isInsDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isInsOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.insulation || ''}
              disabled={!isInsOpen}
              onChange={(e) => onUpdateParam('insulation', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isInsOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isInsOpen ? '-- Insulation --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableInsulations.map((ins) => (
                <option key={ins} value={ins}>
                  {ins}
                </option>
              ))}
            </select>
          </div>

          {/* 15. Insulation Thickness (Auto-Calculated per IEC) */}
          <div className="p-4 rounded-2xl border bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#15</span>
                <span>Thickness (mm)</span>
              </label>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full">
                Auto/IEC
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-indigo-900 dark:text-indigo-200">
              {calculatedPhysics.insulationThicknessMm ? `${calculatedPhysics.insulationThicknessMm} mm` : 'Auto per IEC'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: SEMI-CONDUCTIVE & METALLIC SCREENING (Params 16 - 21)           */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              4
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-500" />
              <span>Semi-Conductive & Metallic Screening Layers</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold lowercase">
                (params 16–21)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Step 4 of 8</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* 16. Outer Semi-Conductive Screen */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isOuterSemiConOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#16</span>
                <span>Semi-Con Screen</span>
              </label>
              {!isOuterSemiConApplicable ? (
                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Ban className="h-3 w-3 inline mr-0.5" /> N/A (LV)
                </span>
              ) : isOuterSemiConDone && config.outerSemiConductor ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isOuterSemiConOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.outerSemiConductor || ''}
              disabled={!isOuterSemiConOpen}
              onChange={(e) => onUpdateParam('outerSemiConductor', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isOuterSemiConOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">
                {!isOuterSemiConApplicable ? 'N/A for LV' : isOuterSemiConOpen ? '-- Screen --' : '-- Dimmed --'}
              </option>
              {dynamicFilter.availableOuterSemiConductors.map((osc) => (
                <option key={osc} value={osc}>
                  {osc}
                </option>
              ))}
            </select>
          </div>

          {/* 17. Outer Semi-Con Screen Type */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isOuterSemiTypeOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#17</span>
                <span>Bond/Strip Type</span>
              </label>
              {isOuterSemiTypeDone && config.outerSemiConductorType ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isOuterSemiTypeOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.outerSemiConductorType || ''}
              disabled={!isOuterSemiTypeOpen}
              onChange={(e) => onUpdateParam('outerSemiConductorType', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isOuterSemiTypeOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isOuterSemiTypeOpen ? '-- Bond/Strip --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableOuterSemiConductorTypes.length > 0 ? (
                dynamicFilter.availableOuterSemiConductorTypes.map((ost) => (
                  <option key={ost} value={ost}>
                    {ost}
                  </option>
                ))
              ) : (
                <>
                  <option value="Bonded">Bonded (HV Standard)</option>
                  <option value="Strippable">Easy-Strip / Strippable (MV)</option>
                </>
              )}
            </select>
          </div>

          {/* 18. Metallic Screen Type */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isScreenTypeOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#18</span>
                <span>Metallic Screen</span>
              </label>
              {isScreenTypeDone ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isScreenTypeOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.screen || ''}
              disabled={!isScreenTypeOpen}
              onChange={(e) => onUpdateParam('screen', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isScreenTypeOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{isScreenTypeOpen ? '-- Screen Type --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableScreenTypes.map((scr) => (
                <option key={scr} value={scr}>
                  {scr}
                </option>
              ))}
            </select>
          </div>

          {/* 19. Screen CSA */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isScreenCSAOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#19</span>
                <span>Screen CSA</span>
              </label>
              {!isScreenActive ? (
                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Ban className="h-3 w-3 inline mr-0.5" /> No Screen
                </span>
              ) : isScreenCSADone && config.screenCSA ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isScreenCSAOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.screenCSA || ''}
              disabled={!isScreenCSAOpen}
              onChange={(e) => onUpdateParam('screenCSA', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isScreenCSAOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{!isScreenActive ? 'N/A' : isScreenCSAOpen ? '-- Screen CSA --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableScreenCSAs.map((csa) => (
                <option key={csa} value={csa}>
                  {csa}
                </option>
              ))}
            </select>
          </div>

          {/* 20. Screen Water-Tightness */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isScreenWTOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#20</span>
                <span>Screen Blocking</span>
              </label>
              {!isScreenActive ? (
                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Ban className="h-3 w-3 inline mr-0.5" /> No Screen
                </span>
              ) : isScreenWTDone && config.screenWaterTight ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isScreenWTOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.screenWaterTight || ''}
              disabled={!isScreenWTOpen}
              onChange={(e) => onUpdateParam('screenWaterTight', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isScreenWTOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{!isScreenActive ? 'N/A' : isScreenWTOpen ? '-- Water-tight --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableScreenWaterTights.map((wt) => (
                <option key={wt} value={wt}>
                  {wt}
                </option>
              ))}
            </select>
          </div>

          {/* 21. Screen Equalizing Tape / Construction */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isScreenBindingOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#21</span>
                <span>Equalizing Tape</span>
              </label>
              {!isScreenActive ? (
                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Ban className="h-3 w-3 inline mr-0.5" /> No Screen
                </span>
              ) : isScreenBindingDone && config.screenConstruction ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" /> Done
                </span>
              ) : isScreenBindingOpen ? (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                </span>
              )}
            </div>
            <select
              value={config.screenConstruction || ''}
              disabled={!isScreenBindingOpen}
              onChange={(e) => onUpdateParam('screenConstruction', e.target.value)}
              className={`w-full rounded-xl p-2.5 text-xs font-semibold outline-none transition-all ${
                isScreenBindingOpen
                  ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                  : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">{!isScreenActive ? 'N/A' : isScreenBindingOpen ? '-- Equalizing Tape --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableScreenConstructions.length > 0 ? (
                dynamicFilter.availableScreenConstructions.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))
              ) : (
                <>
                  <option value="Copper Wire + Equalizing Tape">Copper Wire + Helical Tape</option>
                  <option value="Overlapping Copper Tape">Overlapping Copper Tape (CTS)</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: BEDDING, FILLERS & METALLIC ARMOUR (Params 22 - 28)             */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center">
              5
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-sky-500" />
              <span>Bedding, Fillers & Metallic Armour</span>
              <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold lowercase">
                (params 22–28)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Step 5 of 8</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {/* 22. Filler / Binder Tape */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isFillerOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#22</span>
                <span>Fillers</span>
              </label>
              {isFillerDone && config.fillerBinder ? (
                <span className="text-[9px] text-emerald-600 font-bold">✓</span>
              ) : !isMultiCore ? (
                <span className="text-[9px] text-slate-400 font-medium">1C N/A</span>
              ) : null}
            </div>
            <select
              value={config.fillerBinder || ''}
              disabled={!isFillerOpen}
              onChange={(e) => onUpdateParam('fillerBinder', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{!isMultiCore ? 'N/A for 1C' : '-- Fillers --'}</option>
              {dynamicFilter.availableFillerBinders.length > 0 ? (
                dynamicFilter.availableFillerBinders.map((fb) => (
                  <option key={fb} value={fb}>
                    {fb}
                  </option>
                ))
              ) : (
                <>
                  <option value="PP Fillers + Binder Tape">PP Fillers + Tape</option>
                  <option value="Extruded Elastomeric">Extruded Bedding</option>
                </>
              )}
            </select>
          </div>

          {/* 23. Bedding / Inner Covering */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isBeddingOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#23</span>
                <span>Bedding</span>
              </label>
              {isBeddingDone && config.bedding ? (
                <span className="text-[9px] text-emerald-600 font-bold">✓</span>
              ) : !isArmourActive ? (
                <span className="text-[9px] text-slate-400 font-medium">Unarm.</span>
              ) : null}
            </div>
            <select
              value={config.bedding || ''}
              disabled={!isBeddingOpen}
              onChange={(e) => onUpdateParam('bedding', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{!isArmourActive ? 'N/A' : '-- Bedding --'}</option>
              {dynamicFilter.availableBeddings.length > 0 ? (
                dynamicFilter.availableBeddings.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              ) : (
                <>
                  <option value="Extruded PVC">Extruded PVC</option>
                  <option value="Extruded LSZH">Extruded LSZH</option>
                </>
              )}
            </select>
          </div>

          {/* 24. Armour Type */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isArmourOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#24</span>
                <span>Armour Type</span>
              </label>
              {isArmourDone ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.armour || ''}
              disabled={!isArmourOpen}
              onChange={(e) => onUpdateParam('armour', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{isArmourOpen ? '-- Armour Type --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableArmours.map((arm) => (
                <option key={arm} value={arm}>
                  {arm}
                </option>
              ))}
            </select>
          </div>

          {/* 25. Armour Material */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isArmourMatOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#25</span>
                <span>Armour Mat.</span>
              </label>
              {isArmourMatDone && config.armourMaterial ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.armourMaterial || ''}
              disabled={!isArmourMatOpen}
              onChange={(e) => onUpdateParam('armourMaterial', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{!isArmourActive ? 'N/A' : '-- Mat. --'}</option>
              {dynamicFilter.availableArmourMaterials.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* 26. Armour Wire/Tape Dimensions (CSA) */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isArmourActive
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#26</span>
                <span>Dimension</span>
              </label>
              <span className="text-[9px] text-sky-600 font-bold">Auto</span>
            </div>
            <select
              value={config.armourCSA || ''}
              disabled={!isArmourActive}
              onChange={(e) => onUpdateParam('armourCSA', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{!isArmourActive ? 'N/A' : '-- Dimension --'}</option>
              {dynamicFilter.availableArmourCSAs.map((csa) => (
                <option key={csa} value={csa}>
                  {csa}
                </option>
              ))}
            </select>
          </div>

          {/* 27. Armour Water-Tightness */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isArmourWTOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#27</span>
                <span>Armour WT</span>
              </label>
              {isArmourWTDone && config.armourWaterTight ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.armourWaterTight || ''}
              disabled={!isArmourWTOpen}
              onChange={(e) => onUpdateParam('armourWaterTight', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{!isArmourActive ? 'N/A' : '-- Blocking --'}</option>
              {dynamicFilter.availableArmourWaterTights.map((wt) => (
                <option key={wt} value={wt}>
                  {wt}
                </option>
              ))}
            </select>
          </div>

          {/* 28. Inner Sheath */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isInnerSheathOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#28</span>
                <span>Inner Sheath</span>
              </label>
              {isInnerSheathDone && config.innerSheath ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.innerSheath || ''}
              disabled={!isInnerSheathOpen}
              onChange={(e) => onUpdateParam('innerSheath', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{!isArmourActive ? 'N/A' : '-- Inner Sheath --'}</option>
              {dynamicFilter.availableInnerSheaths.map((ish) => (
                <option key={ish} value={ish}>
                  {ish}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 6: OUTER SHEATHING, ADDITIVES & CPR (Params 29 - 35)               */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center">
              6
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" />
              <span>Outer Sheathing Jacket, Additives & Euroclass CPR</span>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold lowercase">
                (params 29–35)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Step 6 of 8</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {/* 29. Outer Sheath Material */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isSheathOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#29</span>
                <span>Jacket Mat.</span>
              </label>
              {isSheathDone ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.sheathing || ''}
              disabled={!isSheathOpen}
              onChange={(e) => onUpdateParam('sheathing', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{isSheathOpen ? '-- Jacket --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableSheathings.map((sh) => (
                <option key={sh} value={sh}>
                  {sh}
                </option>
              ))}
            </select>
          </div>

          {/* 30. Outer Sheath Color */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isSheathColorOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#30</span>
                <span>Jacket Color</span>
              </label>
              {isSheathColorDone ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.sheathingColor || ''}
              disabled={!isSheathColorOpen}
              onChange={(e) => onUpdateParam('sheathingColor', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{isSheathColorOpen ? '-- Color --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableSheathingColors.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* 31. Special Sheath Additives */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isAdditivesOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#31</span>
                <span>Additives</span>
              </label>
              {isAdditivesDone && config.specialAdditives ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.specialAdditives || ''}
              disabled={!isAdditivesOpen}
              onChange={(e) => onUpdateParam('specialAdditives', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{isAdditivesOpen ? '-- Additives --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableSpecialAdditives.map((add) => (
                <option key={add} value={add}>
                  {add}
                </option>
              ))}
            </select>
          </div>

          {/* 32. Semi-Conductive Outer Layer / Skin */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isSemiCondSheathOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#32</span>
                <span>Conductive Skin</span>
              </label>
              {!isMVHV ? <span className="text-[9px] text-slate-400">N/A (LV)</span> : null}
            </div>
            <select
              value={config.semiConductiveSheath || ''}
              disabled={!isSemiCondSheathOpen}
              onChange={(e) => onUpdateParam('semiConductiveSheath', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{!isMVHV ? 'N/A' : '-- Skin --'}</option>
              {dynamicFilter.availableSemiConductiveSheaths.map((scs) => (
                <option key={scs} value={scs}>
                  {scs}
                </option>
              ))}
            </select>
          </div>

          {/* 33. Graphite Coating */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isGraphiteOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#33</span>
                <span>Graphite</span>
              </label>
              {isGraphiteDone && config.graphiteCoating ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.graphiteCoating || ''}
              disabled={!isGraphiteOpen}
              onChange={(e) => onUpdateParam('graphiteCoating', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{isGraphiteOpen ? '-- Graphite --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableGraphiteCoatings.map((gc) => (
                <option key={gc} value={gc}>
                  {gc}
                </option>
              ))}
            </select>
          </div>

          {/* 34. CPR Euroclass */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isCPROpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Flame className="h-3 w-3 text-accent-500" />
                <span className="font-mono text-slate-400">#34</span>
                <span>CPR Euroclass</span>
              </label>
              {isCPRDone ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.cpr || ''}
              disabled={!isCPROpen}
              onChange={(e) => onUpdateParam('cpr', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{isCPROpen ? '-- CPR --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableCPRs.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 35. EDR Reference */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              isEDROpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Award className="h-3 w-3 text-emerald-600" />
                <span className="font-mono text-slate-400">#35</span>
                <span>EDR Reference</span>
              </label>
              {isEDRDone ? <span className="text-[9px] text-emerald-600 font-bold">✓</span> : null}
            </div>
            <select
              value={config.edr || ''}
              disabled={!isEDROpen}
              onChange={(e) => onUpdateParam('edr', e.target.value)}
              className="w-full rounded-xl p-2 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">{isEDROpen ? '-- EDR --' : '-- Dimmed --'}</option>
              {dynamicFilter.availableEDRs.map((edr) => (
                <option key={edr} value={edr}>
                  {edr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 7: AUTO-CALCULATED PHYSICAL & ELECTRICAL PERFORMANCE (36 - 40)     */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold text-xs flex items-center justify-center">
              7
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-500" />
              <span>Calculated Physical & Electrical Performance</span>
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold lowercase">
                (params 36–40)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-950/60 px-2.5 py-0.5 rounded-full">
            Engineering Physics Engine
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* 36. Outer Cable Diameter */}
          <div className="p-4 rounded-2xl border bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              #36. Outer Diameter (OD)
            </span>
            <span className="text-sm font-extrabold text-teal-950 dark:text-teal-200 mt-1 block font-mono">
              {calculatedPhysics.outerDiameterMm ? `Ø ${calculatedPhysics.outerDiameterMm} mm` : 'Auto Calculated'}
            </span>
          </div>

          {/* 37. Approximate Cable Weight */}
          <div className="p-4 rounded-2xl border bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              #37. Cable Total Weight
            </span>
            <span className="text-sm font-extrabold text-teal-950 dark:text-teal-200 mt-1 block font-mono">
              {calculatedPhysics.approxWeightKgKm ? `${calculatedPhysics.approxWeightKgKm} kg/km` : 'Auto Calculated'}
            </span>
          </div>

          {/* 38. Minimum Bending Radius */}
          <div className="p-4 rounded-2xl border bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              #38. Min Bending Radius
            </span>
            <span className="text-sm font-extrabold text-teal-950 dark:text-teal-200 mt-1 block font-mono">
              {calculatedPhysics.minBendingRadiusMm ? `${calculatedPhysics.minBendingRadiusMm} mm` : 'Auto Calculated'}
            </span>
          </div>

          {/* 39. Max Operating Temperature */}
          <div className="p-4 rounded-2xl border bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/60">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              #39. Max Temperature
            </span>
            <span className="text-xs font-extrabold text-teal-950 dark:text-teal-200 mt-1 block truncate">
              {calculatedPhysics.operatingTempC || '90°C Continuous'}
            </span>
          </div>

          {/* 40. Short-Circuit Rating */}
          <div className="p-4 rounded-2xl border bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/60 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              #40. Short-Circuit (1s)
            </span>
            <span className="text-xs font-extrabold text-teal-950 dark:text-teal-200 mt-1 block truncate font-mono">
              {calculatedPhysics.shortCircuitRatingKa || 'Auto Calculated'}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 8: LOGISTICS, PACKAGING & SPECIAL MARKING (Params 41 - 45)         */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
              8
            </span>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <span>Logistics, Cutting Length & Drum Packaging</span>
              <span className="text-[10px] text-slate-500 font-semibold lowercase">
                (params 41–45)
              </span>
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Step 8 of 8</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 41. Standard Cutting Length */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isCuttingLenOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#41</span>
                <span>Cutting Length (m)</span>
              </label>
              {isCuttingLenDone ? (
                <span className="text-[10px] text-emerald-600 font-bold">✓ Done</span>
              ) : (
                <span className="text-[10px] text-blue-600 font-bold">Required</span>
              )}
            </div>
            <input
              type="number"
              min={50}
              max={10000}
              step={50}
              value={config.cuttingLength || 500}
              onChange={(e) => onUpdateParam('cuttingLength', Number(e.target.value))}
              className="w-full rounded-xl p-2.5 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 42. Length Tolerance */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isToleranceOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#42</span>
                <span>Length Tolerance</span>
              </label>
              <span className="text-[10px] text-slate-500">Optional</span>
            </div>
            <select
              value={config.lengthTolerance || '±0%'}
              onChange={(e) => onUpdateParam('lengthTolerance', e.target.value)}
              className="w-full rounded-xl p-2.5 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="±0%">±0% Exact Length</option>
              <option value="±1%">±1% Standard Industrial</option>
              <option value="±2%">±2% Commercial</option>
              <option value="±5%">±5% Heavy Bulk</option>
            </select>
          </div>

          {/* 43. Drum Packaging Type */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isDrumTypeOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#43</span>
                <span>Drum Packaging</span>
              </label>
              {isDrumTypeDone ? (
                <span className="text-[10px] text-emerald-600 font-bold">✓ Done</span>
              ) : (
                <span className="text-[10px] text-blue-600 font-bold">Open</span>
              )}
            </div>
            <select
              value={config.drumType || ''}
              onChange={(e) => onUpdateParam('drumType', e.target.value)}
              className="w-full rounded-xl p-2.5 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="">-- Select Drum Type --</option>
              <option value="Lagged Wooden Non-Returnable">Lagged Wooden Non-Returnable</option>
              <option value="Treated Wooden Returnable">Treated Wooden Returnable</option>
              <option value="Heavy Steel Drum">Heavy Steel Drum (HV/Export)</option>
              <option value="Plywood Reel">Plywood Reel (Short Lengths)</option>
            </select>
          </div>

          {/* 44. Drum Capacity */}
          <div className="p-4 rounded-2xl border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#44</span>
                <span>Drum Max Gross</span>
              </label>
              <span className="text-[10px] text-slate-500 font-bold">Auto</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
              {calculatedPhysics.drumCapacity ? `${calculatedPhysics.drumCapacity} kg (Safe)` : 'Auto Calculated'}
            </div>
          </div>

          {/* 45. Special Customer Inscription */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isMarkingOpen
                ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-sm'
                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="font-mono text-slate-400">#45</span>
                <span>Customer Inscription</span>
              </label>
              <span className="text-[10px] text-slate-500">Optional</span>
            </div>
            <input
              type="text"
              placeholder="e.g. PROJECT-X / PO-9921 / METER MARK"
              value={config.specialCustomerRequirements || ''}
              onChange={(e) => onUpdateParam('specialCustomerRequirements', e.target.value)}
              className="w-full rounded-xl p-2.5 text-xs font-semibold outline-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
