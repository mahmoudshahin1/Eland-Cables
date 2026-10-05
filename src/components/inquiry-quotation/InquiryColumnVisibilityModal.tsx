import React, { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  InquiryFieldDefinition,
  UserGridPreference,
  saveLineColumnPreference,
  INQUIRY_LINE_COLUMNS,
} from '../../services/inquiryFieldManifest';

export interface InquiryColumnVisibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  linePref: UserGridPreference;
  columns?: InquiryFieldDefinition[];
  isCustomer: boolean;
  userId?: string | null;
  onPrefChange: (pref: UserGridPreference) => void;
  onSaved?: () => void;
}

export const InquiryColumnVisibilityModal: React.FC<InquiryColumnVisibilityModalProps> = ({
  isOpen,
  onClose,
  linePref,
  columns = INQUIRY_LINE_COLUMNS,
  isCustomer,
  userId,
  onPrefChange,
  onSaved,
}) => {
  const [search, setSearch] = useState('');

  const allowedColumns = useMemo(() => {
    return columns.filter((col) => {
      if (col.systemProtected && isCustomer) return false;
      if (col.customerVisible === false && isCustomer) return false;
      return true;
    });
  }, [columns, isCustomer]);

  const filteredColumns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allowedColumns;
    return allowedColumns.filter(
      (col) => col.label.toLowerCase().includes(q) || col.id.toLowerCase().includes(q)
    );
  }, [allowedColumns, search]);

  if (!isOpen) return null;

  const persist = (pref: UserGridPreference) => {
    onPrefChange(pref);
    saveLineColumnPreference(pref, userId);
  };

  const toggleColumn = (col: InquiryFieldDefinition) => {
    if (col.required || col.id === 'lineNumber') return;
    const exists = linePref.visibleFieldIds.includes(col.id);
    const visibleFieldIds = exists
      ? linePref.visibleFieldIds.filter((id) => id !== col.id)
      : [...linePref.visibleFieldIds, col.id];
    persist({ visibleFieldIds });
  };

  const selectAll = () => {
    const visibleFieldIds = allowedColumns.map((col) => col.id);
    persist({ visibleFieldIds });
  };

  const deselectAll = () => {
    const visibleFieldIds = allowedColumns
      .filter((col) => col.required || col.id === 'lineNumber')
      .map((col) => col.id);
    persist({ visibleFieldIds });
  };

  const resetDefault = () => {
    const visibleFieldIds = allowedColumns.filter((col) => col.defaultVisible).map((col) => col.id);
    persist({ visibleFieldIds });
    onSaved?.();
  };

  const handleApply = () => {
    saveLineColumnPreference(linePref, userId);
    onSaved?.();
    onClose();
  };

  const visibleCount = allowedColumns.filter(
    (col) => col.required || col.id === 'lineNumber' || linePref.visibleFieldIds.includes(col.id)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-brand-800">
                Customize Line Columns
              </h3>
              <p className="text-[11px] text-slate-500">
                {visibleCount} of {allowedColumns.length} columns visible
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search & Quick Actions Bar */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search column names..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
              >
                Deselect All
              </button>
            </div>
            <button
              type="button"
              onClick={resetDefault}
              className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Default</span>
            </button>
          </div>
        </div>

        {/* Columns List */}
        <div className="p-4 overflow-y-auto space-y-1.5 flex-1 divide-y divide-slate-50">
          {filteredColumns.map((col) => {
            const isMandatory = col.required || col.id === 'lineNumber';
            const isChecked = isMandatory || linePref.visibleFieldIds.includes(col.id);

            return (
              <label
                key={col.id}
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                  isChecked ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isMandatory}
                    onChange={() => toggleColumn(col)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div>
                    <span className="font-semibold text-xs text-slate-800">
                      {col.label}
                    </span>
                    {isMandatory && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                        Locked
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-[10px] font-mono text-slate-400 uppercase">
                  {col.dataType}
                </span>
              </label>
            );
          })}

          {filteredColumns.length === 0 && (
            <p className="text-center py-6 text-xs text-slate-400">
              No columns match &ldquo;{search}&rdquo;
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button
            type="button"
            onClick={resetDefault}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-100 transition-colors"
          >
            Reset Default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors"
            >
              Apply & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
