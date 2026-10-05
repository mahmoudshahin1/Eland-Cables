import React, { useMemo, useState } from 'react';
import { EyeOff, Search } from 'lucide-react';
import {
  InquiryFieldDefinition,
  UserGridPreference,
  saveHeaderFieldPreference,
  INQUIRY_HEADER_FIELDS,
} from '../../services/inquiryFieldManifest';

interface InquiryFieldVisibilityPanelProps {
  headerPref: UserGridPreference;
  isCustomer: boolean;
  userId?: string | null;
  onPrefChange: (pref: UserGridPreference) => void;
  onSaved?: () => void;
}

export const InquiryFieldVisibilityPanel: React.FC<InquiryFieldVisibilityPanelProps> = ({
  headerPref,
  isCustomer,
  userId,
  onPrefChange,
  onSaved,
}) => {
  const [search, setSearch] = useState('');

  const fields = useMemo(() => {
    const base = INQUIRY_HEADER_FIELDS.filter((f) => !(f.systemProtected && isCustomer));
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((f) => f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
  }, [isCustomer, search]);

  const persist = (pref: UserGridPreference) => {
    onPrefChange(pref);
    saveHeaderFieldPreference(pref, userId);
  };

  const toggleField = (field: InquiryFieldDefinition) => {
    const exists = headerPref.visibleFieldIds.includes(field.id);
    const visibleFieldIds = exists
      ? headerPref.visibleFieldIds.filter((id) => id !== field.id)
      : [...headerPref.visibleFieldIds, field.id];
    persist({ visibleFieldIds });
  };

  const resetDefault = () => {
    const next = {
      visibleFieldIds: INQUIRY_HEADER_FIELDS.filter((f) => f.defaultVisible).map((f) => f.id),
    };
    persist(next);
    onSaved?.();
  };

  const saveView = () => {
    saveHeaderFieldPreference(headerPref, userId);
    onSaved?.();
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs shadow-sm">
      <h3 className="font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
        <EyeOff className="h-3.5 w-3.5" /> Field Visibility
      </h3>

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fields…"
          className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      <div className="space-y-1.5 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
        {fields.map((field) => (
          <label
            key={field.id}
            className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={Boolean(field.required) || headerPref.visibleFieldIds.includes(field.id)}
              disabled={Boolean(field.required)}
              onChange={() => {
                if (field.required) return;
                toggleField(field);
              }}
              className="rounded border-slate-300"
            />
            <span className="text-slate-700 dark:text-slate-300">
              {field.label}
              {field.required ? <span className="ml-1 text-red-500">*</span> : null}
            </span>
          </label>
        ))}
        {fields.length === 0 && <p className="text-slate-400 py-2">No matching fields.</p>}
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={resetDefault}
          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          Reset to Default
        </button>
        <button
          type="button"
          onClick={saveView}
          className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
        >
          Save View
        </button>
      </div>
    </div>
  );
};
