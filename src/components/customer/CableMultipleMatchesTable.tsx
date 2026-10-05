import React, { useState, useMemo } from 'react';
import { ParsedCableRecord } from '../../services/cableSelectionService';
import {
  ListFilter,
  Search,
  CheckCircle2,
  ArrowRight,
  Filter,
  Check,
  Zap,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface CableMultipleMatchesTableProps {
  matchingCables: ParsedCableRecord[];
  selectedCableId?: string;
  onSelectCable: (cable: ParsedCableRecord) => void;
}

export const CableMultipleMatchesTable: React.FC<CableMultipleMatchesTableProps> = ({
  matchingCables,
  selectedCableId,
  onSelectCable,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredCables = useMemo(() => {
    if (!searchTerm.trim()) return matchingCables;
    const q = searchTerm.toLowerCase();
    return matchingCables.filter(
      (c) =>
        c.cableCode.toLowerCase().includes(q) ||
        c.itemCode.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.customerCode.toLowerCase().includes(q)
    );
  }, [matchingCables, searchTerm]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800/80 shadow-lg overflow-hidden transition-all">
      {/* Header Bar */}
      <div className="bg-blue-50/80 dark:bg-blue-950/60 p-4 sm:p-5 border-b border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-0.5 rounded">
              Multiple Matches Found ({matchingCables.length})
            </span>
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-1 flex items-center gap-2">
            <ListFilter className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Select Your Required Approved Cable Construction</span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            The configuration parameters match multiple catalog variants. Please choose one to finalize resolution.
          </p>
        </div>

        {/* Search within matching cables */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Filter matching items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Structured Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase tracking-wider font-extrabold border-b border-slate-200 dark:border-slate-800">
              <th className="py-3 px-4">Material Number</th>
              <th className="py-3 px-4">Item Code</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4 text-right">Diameter</th>
              <th className="py-3 px-4 text-right">Weight</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
            {filteredCables.map((cable) => {
              const isSelected = selectedCableId === cable.id || selectedCableId === cable.cableCode;
              return (
                <tr
                  key={cable.id || cable.cableCode}
                  onClick={() => onSelectCable(cable)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/60 font-semibold ring-1 ring-inset ring-blue-400'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {cable.cableCode}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {cable.itemCode}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="max-w-md">
                      <span className="font-semibold text-slate-900 dark:text-white block truncate">
                        {cable.description}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {cable.customerCode} • {cable.voltage} • {cable.cores} × {cable.conductorSize}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {cable.outerDiameterMm ? cable.outerDiameterMm.toFixed(2) : '--'} mm
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {cable.approxWeightKgKm ? cable.approxWeightKgKm.toLocaleString() : '--'} kg/km
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCable(cable);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 mx-auto ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="h-3 w-3" />
                          <span>Resolved</span>
                        </>
                      ) : (
                        <>
                          <span>Choose</span>
                          <ChevronRight className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredCables.length === 0 && (
        <div className="p-6 text-center text-slate-500 text-xs">
          No matching records found for search term "{searchTerm}".
        </div>
      )}
    </div>
  );
};
