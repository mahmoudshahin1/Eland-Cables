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

export function DrumDimensionTable({ drum }: { drum: DrumDimensionValues }) {
  return (
    <table className="w-full min-w-[360px] border-collapse text-[11px]">
      <caption className="sr-only">Drum dimensions in millimetres</caption>
      <thead>
        <tr className="border-b border-slate-200 text-left dark:border-slate-700">
          {COLUMNS.map((column) => (
            <th key={column.key} scope="col" className="px-2 py-1.5 font-semibold text-slate-500">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {COLUMNS.map((column) => (
            <td key={column.key} className="px-2 py-1.5 font-bold tabular-nums text-slate-900 dark:text-white">
              {Number.isFinite(drum[column.key]) ? drum[column.key].toLocaleString() : '—'}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
