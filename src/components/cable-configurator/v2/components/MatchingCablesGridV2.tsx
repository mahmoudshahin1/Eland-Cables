import React, { useState } from 'react';
import { CableRecordV2 } from '../types';
import { Table, Search, Plus } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { Input } from '../../../ui/Form';

interface MatchingCablesGridV2Props {
  matchingCables: CableRecordV2[];
  selectedCableId?: string;
  onSelectCable: (cable: CableRecordV2) => void;
}

export const MatchingCablesGridV2: React.FC<MatchingCablesGridV2Props> = ({
  matchingCables,
  selectedCableId,
  onSelectCable,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredList = matchingCables.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.materialNumber.toLowerCase().includes(term) ||
      c.itemCode.toLowerCase().includes(term) ||
      c.customerCode.toLowerCase().includes(term) ||
      c.description.toLowerCase().includes(term) ||
      c.voltage.toLowerCase().includes(term) ||
      c.conductorSize.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Table className="h-4 w-4 text-brand-500" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white font-display">
              Approved Cable Catalog Matches ({matchingCables.length} Records)
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cables matching the selected construction parameters.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Search material, item, size..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Material Number</th>
              <th className="py-2.5 px-3 font-semibold">Item Code</th>
              <th className="py-2.5 px-3 font-semibold">Customer Code</th>
              <th className="py-2.5 px-3 font-semibold">Technical Description</th>
              <th className="py-2.5 px-3 font-semibold">Diameter</th>
              <th className="py-2.5 px-3 font-semibold">Weight</th>
              <th className="py-2.5 px-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 px-3 text-center text-xs text-slate-500">
                  No cables match the selected parameters.
                </td>
              </tr>
            ) : (
              filteredList.slice(0, 100).map((cable) => {
                const isSelected = selectedCableId === cable.id;

                return (
                  <tr
                    key={cable.id}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/40 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">
                      {cable.materialNumber}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {cable.itemCode}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge tone="neutral">
                        {cable.customerCode || 'Standard'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                      {cable.description}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      {cable.outerDiameterMm.toFixed(2)} mm
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      {cable.approxWeightKgKm.toLocaleString()} kg/km
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectCable(cable)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inline-flex items-center gap-1 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Cable
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
