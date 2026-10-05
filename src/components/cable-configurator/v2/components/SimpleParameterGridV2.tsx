import React from 'react';
import {
  SelectionStateV2,
  AvailableOptionsV2,
  CableRecordV2,
  TriState,
} from '../types';
import {
  DEFAULT_CABLE_FAMILIES,
  DEFAULT_CONDUCTOR_MATERIALS,
} from '../services/masterDataServiceV2';
import {
  resolveParameterOptionsV2,
  isParameterUnlocked,
  getParameterDisplayNumber,
  getCoreColorOptions,
  GRID_PARAMETER_ORDER,
  CascadableField,
} from '../services/parameterCascadingRulesV2';
import { icons } from '../../../ui/icons';
import { Lock, Check, Sparkles, SlidersHorizontal, Layers, ShieldCheck, Cpu } from 'lucide-react';

const TRISTATE_FIELDS: CascadableField[] = [
  'conductorWaterTight',
  'screenWaterTight',
  'armourWaterTight',
];

const FIELD_LABELS: Partial<Record<keyof SelectionStateV2, string>> = {
  family: 'Cable Family',
  voltageClass: 'Voltage Level / Class',
  voltage: 'Voltage Rating / Level',
  standard: 'Standard & Specification',
  conductorMaterial: 'Conductor Material',
  conductorClass: 'Construction Class',
  conductorShape: 'Conductor Shape',
  conductorSize: 'Conductor Size',
  cores: 'No. of Cores',
  conductorWaterTight: 'Conductor Water Blocking',
  insulation: 'Insulation Material',
  insulationColor: 'Insulation Color',
  outerSemiConductor: 'Outer Semi-Conductor',
  screenType: 'Screen Type',
  screenCSA: 'Screen Cross-Section (CSA)',
  screenWaterTight: 'Screen Water Tightness',
  bedding: 'Inner Sheath / Bedding',
  armour: 'Armour Layer',
  armourWaterTight: 'Armour Water Tightness',
  sheathing: 'Outer Sheath (Jacket)',
  sheathingColor: 'Outer Sheath Color',
  waterTight: 'Water Tight / Water Blocking',
  termiteProtection: 'Termite / Rodent Protection',
  cprClass: 'CPR Euroclass',
  specialArea: 'Special Installation Area',
  specialAdditives: 'Special Engineering Req.',
  customerIdentification: 'Customer-Specific Identification',
};

// 7 Logical Engineering Sections grouping all 27 parameters
interface SectionDef {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: CascadableField[];
}

const ENGINEERING_SECTIONS: SectionDef[] = [
  {
    id: 'sec-family-voltage',
    title: '1. Family & Voltage',
    description: 'Operating application, voltage classification, and design standards',
    icon: icons.cable,
    fields: ['family', 'voltageClass', 'voltage', 'standard'],
  },
  {
    id: 'sec-conductor',
    title: '2. Conductor Details',
    description: 'Metallurgy, stranded class, geometric cross-section, and water blocking',
    icon: icons.conductor,
    fields: ['conductorMaterial', 'conductorClass', 'conductorShape', 'conductorSize', 'conductorWaterTight'],
  },
  {
    id: 'sec-cores',
    title: '3. Cores & Identification',
    description: 'Core count configuration and individual core identification',
    icon: Layers,
    fields: ['cores', 'insulationColor'],
  },
  {
    id: 'sec-insulation',
    title: '4. Insulation System',
    description: 'Primary dielectric compound and semiconductor screening layers',
    icon: icons.insulation,
    fields: ['insulation', 'outerSemiConductor'],
  },
  {
    id: 'sec-screening-armour',
    title: '5. Screening & Armouring',
    description: 'Electromagnetic shield, bedding, and mechanical armour protection',
    icon: icons.armour,
    fields: ['screenType', 'screenCSA', 'screenWaterTight', 'bedding', 'armour', 'armourWaterTight'],
  },
  {
    id: 'sec-sheathing',
    title: '6. Sheathing & Outer Layers',
    description: 'Outer jacket material, color, and barrier protection',
    icon: icons.sheath,
    fields: ['sheathing', 'sheathingColor', 'waterTight', 'termiteProtection'],
  },
  {
    id: 'sec-standards',
    title: '7. Standards & Special Properties',
    description: 'CPR fire classification, environmental installation, and customer specs',
    icon: icons.engineering,
    fields: ['cprClass', 'specialArea', 'specialAdditives', 'customerIdentification'],
  },
];

interface SimpleParameterGridV2Props {
  selections: SelectionStateV2;
  availableOptions: AvailableOptionsV2;
  filteredRecords: CableRecordV2[];
  totalMasterCount: number;
  onUpdateParam: (field: keyof SelectionStateV2, value: any) => void;
  onUpdateCoreColor?: (coreIndex: number, color: string) => void;
  onToggleSpecialAdditive?: (additive: string) => void;
}

export const SimpleParameterGridV2: React.FC<SimpleParameterGridV2Props> = ({
  selections,
  availableOptions,
  filteredRecords,
  totalMasterCount,
  onUpdateParam,
  onUpdateCoreColor,
}) => {
  const mode = selections.selectionMode;
  if (!mode) return null;

  const paramOptions = (field: keyof SelectionStateV2) =>
    resolveParameterOptionsV2(field, selections, availableOptions);
  const paramUnlocked = (field: keyof SelectionStateV2) => isParameterUnlocked(field, selections);

  const coresCount =
    selections.coresCount || (selections.cores ? parseInt(selections.cores, 10) : 1) || 1;

  const activeCount = GRID_PARAMETER_ORDER.length;

  const selectClass =
    'w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-900';

  const labelFor = (field: CascadableField) => {
    const num = getParameterDisplayNumber(field);
    const label = FIELD_LABELS[field] ?? String(field);
    return num ? `${num}. ${label}` : label;
  };

  const renderYesNoCheckbox = (field: CascadableField) => {
    const unlocked = paramUnlocked(field);
    const raw = selections[field] as TriState | undefined;
    const checked = raw === 'Yes';

    return (
      <div key={field} className={`space-y-1.5 ${!unlocked ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
            {labelFor(field)}
          </label>
          {!unlocked && <Lock className="h-3 w-3 text-slate-400 shrink-0" />}
        </div>
        <label className={`flex items-center gap-2 min-h-[38px] px-3 py-1.5 rounded-lg border transition-all ${
          unlocked
            ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-brand-400'
            : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 cursor-not-allowed'
        }`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!unlocked}
            onChange={(e) => onUpdateParam(field, e.target.checked ? 'Yes' : 'No')}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed"
          />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {checked ? 'Yes (Water Resistant)' : 'No (Standard)'}
          </span>
        </label>
      </div>
    );
  };

  const renderSelect = (field: CascadableField) => {
    const unlocked = paramUnlocked(field);
    const options = paramOptions(field);

    if (field === 'family') {
      const value = selections.family || '';
      return (
        <div key={field} className={`space-y-1.5 ${!unlocked ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
              {labelFor(field)}
            </label>
            {!unlocked && <Lock className="h-3 w-3 text-slate-400 shrink-0" />}
          </div>
          <select
            value={value}
            disabled={!unlocked}
            onChange={(e) => onUpdateParam('family', e.target.value || undefined)}
            className={selectClass}
          >
            <option value="">-- Select Family --</option>
            {DEFAULT_CABLE_FAMILIES.map((fam) => (
              <option key={fam.code} value={fam.code}>
                {fam.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field === 'conductorMaterial') {
      const value = selections.conductorMaterial || '';
      return (
        <div key={field} className={`space-y-1.5 ${!unlocked ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
              {labelFor(field)}
            </label>
            {!unlocked && <Lock className="h-3 w-3 text-slate-400 shrink-0" />}
          </div>
          <select
            value={value}
            disabled={!unlocked}
            onChange={(e) => onUpdateParam('conductorMaterial', e.target.value || undefined)}
            className={selectClass}
          >
            <option value="">-- Select Material --</option>
            {DEFAULT_CONDUCTOR_MATERIALS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field === 'specialAdditives') {
      const selected = (selections.specialAdditives || []).find((a) => a !== 'None') || '';
      return (
        <div key={field} className={`space-y-1.5 ${!unlocked ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
              {labelFor(field)}
            </label>
            {!unlocked && <Lock className="h-3 w-3 text-slate-400 shrink-0" />}
          </div>
          <select
            value={selected}
            disabled={!unlocked}
            onChange={(e) => {
              const v = e.target.value;
              onUpdateParam('specialAdditives', v ? [v] : ['None']);
            }}
            className={selectClass}
          >
            <option value="">-- Select --</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    const value = (selections[field] as string | undefined) || '';

    return (
      <div key={field} className={`space-y-1.5 ${!unlocked ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
            {labelFor(field)}
          </label>
          {!unlocked && <Lock className="h-3 w-3 text-slate-400 shrink-0" />}
        </div>
        <select
          value={value}
          disabled={!unlocked}
          onChange={(e) => onUpdateParam(field, e.target.value || undefined)}
          className={selectClass}
        >
          <option value="">-- Select --</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderField = (field: CascadableField) => {
    if (TRISTATE_FIELDS.includes(field)) {
      return renderYesNoCheckbox(field);
    }
    return renderSelect(field);
  };

  return (
    <div className="space-y-6">
      {/* Optional Customer Specification Code selector */}
      {mode === 'CUSTOMER' && availableOptions.customerCodes.length > 0 && (
        <div className="p-4 bg-brand-50/70 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-800 space-y-2">
          <label className="block text-xs font-bold text-brand-900 dark:text-brand-200">
            Customer Specification Code
          </label>
          <select
            value={selections.customerCode || ''}
            onChange={(e) => onUpdateParam('customerCode', e.target.value || undefined)}
            className={selectClass}
          >
            <option value="">-- Select Customer Code --</option>
            {availableOptions.customerCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Header with active parameter counts */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-brand-500" />
            <span>Select Cable Construction Parameters</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            27 governed engineering dimensions grouped into 7 manufacturing sections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-950/70 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
            {activeCount} Parameters Active
          </span>
          {totalMasterCount > 0 && (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {filteredRecords.length.toLocaleString()} / {totalMasterCount.toLocaleString()} matching catalog cables
            </span>
          )}
        </div>
      </div>

      {/* 7 Grouped Engineering Sections */}
      <div className="space-y-5">
        {ENGINEERING_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          const isSection3 = section.id === 'sec-cores';

          return (
            <div
              key={section.id}
              className="p-4 bg-slate-50/60 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                <div className="p-1.5 rounded-lg bg-brand-100/70 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
                  <SectionIcon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white font-display">
                    {section.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {section.description}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {section.fields.map((field) => renderField(field))}
              </div>

              {/* Special Per-Core Color Selectors inside Section 3 */}
              {isSection3 && coresCount > 1 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Individual Core Colors ({coresCount} Cores)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {Array.from({ length: Math.min(coresCount, 12) }, (_, i) => {
                      const coreNum = i + 1;
                      const currentColor =
                        selections.coreColors?.[coreNum] ||
                        (coreNum === 1
                          ? 'Brown'
                          : coreNum === 2
                            ? 'Black'
                            : coreNum === 3
                              ? 'Grey'
                              : coreNum === 4
                                ? 'Blue'
                                : 'Green/Yellow');

                      return (
                        <div key={coreNum} className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            Core {coreNum}
                          </label>
                          <select
                            value={currentColor}
                            onChange={(e) => onUpdateCoreColor?.(coreNum, e.target.value)}
                            className={selectClass}
                          >
                            {getCoreColorOptions().map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
