import React, { useMemo, useState } from 'react';
import { AlertTriangle, Link2, Search } from 'lucide-react';
import { DrumMasterRecord, DrumSelectionResult } from '../../types';
import { searchDrumMasterReference, selectDrum } from '../../services/drumSelectionService';
import { resolveDrumDescription } from '../../services/drumMasterService';

interface DrumMasterReferencePanelProps {
  drums: DrumMasterRecord[];
  prototypeDrumType?: string;
  linkedCode?: string;
  onLink: (drumCode: string, result: DrumSelectionResult) => void;
  onClear: () => void;
}

export const DrumMasterReferencePanel: React.FC<DrumMasterReferencePanelProps> = ({
  drums,
  prototypeDrumType,
  linkedCode,
  onLink,
  onClear,
}) => {
  const [q, setQ] = useState('');
  const rows = useMemo(() => searchDrumMasterReference(drums, q).slice(0, 12), [drums, q]);
  const auto = useMemo(
    () =>
      selectDrum({
        method: 'AUTOMATIC',
        drumMaster: drums,
        prototypeDrumType,
      }),
    [drums, prototypeDrumType]
  );

  return (
    <div className="rounded-2xl border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/20 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-800 dark:text-amber-300">
            ENERGYA Drum Master — reference only
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            Prototype reel types (Wood / Steel / Plywood) stay the operational schedule. Linking an EWD code does
            not replace them. Automatic EWD selection is <span className="font-mono font-bold">CONFIGURATION_REQUIRED</span>.
          </p>
        </div>
        {linkedCode ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-bold text-slate-600 dark:text-slate-300 underline"
          >
            Clear EWD link ({linkedCode})
          </button>
        ) : null}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200 bg-white/70 dark:bg-slate-900/50 rounded-xl p-2.5 border border-amber-200 dark:border-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{auto.blockingReasons[0]}</span>
      </div>

      {!drums.length ? (
        <p className="text-xs text-slate-500">
          Drum Master is empty. Import <span className="font-mono">Drum List.xlsx</span> from Internal → Master Data →
          Import Center.
        </p>
      ) : (
        <>
          <div className="relative max-w-sm">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search drum code or description"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="overflow-x-auto max-h-40 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Drum Code</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Flange</th>
                  <th className="p-2 text-right">Barrel</th>
                  <th className="p-2 text-right">Inner</th>
                  <th className="p-2 text-right">Outer</th>
                  <th className="p-2 text-right">Capacity*</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-2 font-mono font-bold">{d.drumCode}</td>
                    <td className="p-2 text-slate-600 dark:text-slate-300">{resolveDrumDescription(d)}</td>
                    <td className="p-2 text-right font-mono">{d.flange}</td>
                    <td className="p-2 text-right font-mono">{d.barrel}</td>
                    <td className="p-2 text-right font-mono">{d.innerWidth}</td>
                    <td className="p-2 text-right font-mono">{d.outerWidth}</td>
                    <td className="p-2 text-right font-mono">{d.capacity}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => {
                          const result = selectDrum({
                            method: 'MANUAL',
                            drumMaster: drums,
                            selectedDrumCode: d.drumCode,
                            prototypeDrumType,
                          });
                          onLink(d.drumCode, result);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300"
                      >
                        <Link2 className="h-3 w-3" />
                        Link row
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">
            * Capacity unit is not in the source workbook (CONFIGURATION_REQUIRED). Showing first 12 matches.
          </p>
        </>
      )}
    </div>
  );
};
