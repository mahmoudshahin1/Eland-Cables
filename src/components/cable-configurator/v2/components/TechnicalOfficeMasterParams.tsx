import React, { useState } from 'react';
import {
  getCustomMasterParams,
  saveCustomMasterParams,
  DEFAULT_CABLE_FAMILIES,
  DEFAULT_VOLTAGE_CLASSES,
  DEFAULT_VOLTAGES_BY_CLASS,
  DEFAULT_STANDARDS,
  DEFAULT_CONDUCTOR_MATERIALS,
  DEFAULT_CONDUCTOR_CLASSES,
  DEFAULT_CONDUCTOR_SIZES,
  DEFAULT_CORE_COUNTS,
  DEFAULT_CORE_COLORS,
  DEFAULT_INSULATIONS,
  DEFAULT_SCREEN_TYPES,
  DEFAULT_ARMOUR_TYPES,
  DEFAULT_SHEATHINGS,
  DEFAULT_SPECIAL_ADDITIVES,
  DEFAULT_CPR_CLASSES,
} from '../services/masterDataServiceV2';
import {
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Layers,
  Sparkles,
  RotateCcw,
  Tag,
} from 'lucide-react';

interface ParamCategoryDef {
  key: string;
  name: string;
  defaultOptions: string[];
}

const CATEGORIES: ParamCategoryDef[] = [
  { key: 'families', name: 'Cable Families', defaultOptions: DEFAULT_CABLE_FAMILIES.map((f) => f.code) },
  { key: 'voltageClasses', name: 'Voltage Classes', defaultOptions: DEFAULT_VOLTAGE_CLASSES },
  { key: 'standards', name: 'Applicable Standards', defaultOptions: DEFAULT_STANDARDS },
  { key: 'conductorMaterials', name: 'Conductor Materials', defaultOptions: DEFAULT_CONDUCTOR_MATERIALS.map((m) => m.code) },
  { key: 'conductorClasses', name: 'Conductor Classes', defaultOptions: DEFAULT_CONDUCTOR_CLASSES },
  { key: 'conductorSizes', name: 'Conductor Sizes (mm²)', defaultOptions: DEFAULT_CONDUCTOR_SIZES.map(String) },
  { key: 'coreCounts', name: 'Core Counts', defaultOptions: DEFAULT_CORE_COUNTS.map(String) },
  { key: 'coreColors', name: 'Core Colors', defaultOptions: DEFAULT_CORE_COLORS },
  { key: 'insulations', name: 'Insulation Materials', defaultOptions: DEFAULT_INSULATIONS },
  { key: 'screenTypes', name: 'Screen Types', defaultOptions: DEFAULT_SCREEN_TYPES },
  { key: 'armourTypes', name: 'Armour Types', defaultOptions: DEFAULT_ARMOUR_TYPES },
  { key: 'sheathings', name: 'Sheathing Materials', defaultOptions: DEFAULT_SHEATHINGS },
  { key: 'specialAdditives', name: 'Special Additives', defaultOptions: DEFAULT_SPECIAL_ADDITIVES },
  { key: 'cprClasses', name: 'CPR Classes', defaultOptions: DEFAULT_CPR_CLASSES },
];

export const TechnicalOfficeMasterParams: React.FC = () => {
  const [activeCategoryKey, setActiveCategoryKey] = useState<string>('standards');
  const [customParams, setCustomParams] = useState(getCustomMasterParams());
  const [newOptionValue, setNewOptionValue] = useState<string>('');

  const activeCategory = CATEGORIES.find((c) => c.key === activeCategoryKey) || CATEGORIES[0];
  const customListForCat: string[] = (customParams as any)[activeCategory.key] || [];

  // Combined options: default + custom
  const allCurrentOptions = Array.from(new Set([...activeCategory.defaultOptions, ...customListForCat]));

  const handleAddOption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOptionValue.trim()) return;

    const val = newOptionValue.trim();
    if (allCurrentOptions.includes(val)) {
      alert('Option already exists in this category');
      return;
    }

    const updatedCatList = [...customListForCat, val];
    const updatedAll = {
      ...customParams,
      [activeCategory.key]: updatedCatList,
    };

    saveCustomMasterParams(updatedAll);
    setCustomParams(updatedAll);
    setNewOptionValue('');
  };

  const handleDeleteCustomOption = (val: string) => {
    const updatedCatList = customListForCat.filter((item) => item !== val);
    const updatedAll = {
      ...customParams,
      [activeCategory.key]: updatedCatList,
    };
    saveCustomMasterParams(updatedAll);
    setCustomParams(updatedAll);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Section 10: Master Parameter Management
          </span>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
            Engineering Dropdown & Specification Rules
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Add or maintain certified technical dropdown values accessible in Technical Parameters V2.
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Category List */}
        <div className="lg:col-span-4 space-y-1.5 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider block px-2 mb-2">
            Parameter Category
          </span>
          {CATEGORIES.map((cat) => {
            const isSelected = activeCategoryKey === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategoryKey(cat.key)}
                className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold text-left transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span>{cat.name}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {cat.defaultOptions.length + ((customParams as any)[cat.key]?.length || 0)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Category Options & Add Form */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {activeCategory.name} Options
              </h3>
              <p className="text-xs text-slate-500">
                {allCurrentOptions.length} total options configured for this parameter.
              </p>
            </div>
          </div>

          {/* Add Option Form */}
          <form onSubmit={handleAddOption} className="flex gap-2">
            <input
              type="text"
              placeholder={`Add new ${activeCategory.name.toLowerCase()} option (e.g. custom standard)...`}
              value={newOptionValue}
              onChange={(e) => setNewOptionValue(e.target.value)}
              className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center space-x-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Option</span>
            </button>
          </form>

          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
            {allCurrentOptions.map((opt) => {
              const isCustom = customListForCat.includes(opt);
              return (
                <div
                  key={opt}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{opt}</span>
                    {isCustom ? (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        Custom
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                        Standard
                      </span>
                    )}
                  </div>

                  {isCustom && (
                    <button
                      onClick={() => handleDeleteCustomOption(opt)}
                      title="Delete custom option"
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
