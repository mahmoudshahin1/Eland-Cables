import React from 'react';

export interface DrumDimensionValues {
  flange: number;
  barrel: number;
  innerWidth: number;
  outerWidth: number;
}

const COLUMNS: Array<{ key: keyof DrumDimensionValues; label: string }> = [
  { key: 'flange', label: 'Flange Diameter (mm)' },
  { key: 'barrel', label: 'Barrel Diameter (mm)' },
  { key: 'innerWidth', label: 'Inner Width (mm)' },
  { key: 'outerWidth', label: 'Outer Width (mm)' },
];

export function drumMaterialLabel(drum: { drumType?: string | null; description?: string | null } | null | undefined): string {
  const type = String(drum?.drumType || '').trim();
  if (type) return type;
  const description = String(drum?.description || '').trim();
  if (description) return description;
  return '—';
}

export function DrumDimensionTable({ drum }: { drum: DrumDimensionValues }) {
  return (
    <div
      role="group"
      aria-label="Drum dimensions in millimetres"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-slate-700 dark:bg-slate-700"
    >
      {COLUMNS.map((column) => (
        <div key={column.key} className="bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900">
          <div className="text-[10px] font-semibold leading-tight text-slate-500">{column.label}</div>
          <div className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-white">
            {Number.isFinite(drum[column.key]) ? drum[column.key].toLocaleString() : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}
