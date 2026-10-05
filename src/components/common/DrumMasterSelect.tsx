import React, { useEffect, useState } from 'react';
import { DrumMasterRecord } from '../../types';
import { getStoredDrumMaster, resolveDrumDescription } from '../../services/drumMasterService';
import { resolveDrumListForSelect } from '../../services/drumMasterApiService';
import { useAuth } from '../../context/AuthContext';

export function useDrumMasterList(enabled = true): DrumMasterRecord[] {
  const { jwtToken } = useAuth();
  const [drums, setDrums] = useState<DrumMasterRecord[]>([]);

  useEffect(() => {
    if (!enabled) return;
    fetch('/api/master/drums', {
      headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : undefined,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`drums ${r.status}`);
        const data = await r.json();
        const rows = Array.isArray(data.drums) ? data.drums : [];
        // Empty PostgreSQL list wins — do not substitute stale localStorage.
        const resolved = resolveDrumListForSelect({ ok: true, data: rows });
        setDrums(resolved.data);
      })
      .catch(() => {
        // Non-authoritative degraded fallback only when PG unavailable.
        const resolved = resolveDrumListForSelect({ ok: false, error: 'unavailable' });
        setDrums(resolved.data.length ? resolved.data : getStoredDrumMaster().filter((d) => d.status !== 'INACTIVE'));
      });
  }, [enabled, jwtToken]);

  return drums;
}

function formatParam(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}

/** Official Drum List.xlsx columns — always shown. Optional extras only when stored. */
const SOURCE_SPEC_FIELDS: Array<{ key: keyof DrumMasterRecord | 'resolvedDescription'; label: string }> = [
  { key: 'drumCode', label: 'Drum Code' },
  { key: 'resolvedDescription', label: 'Description' },
  { key: 'flange', label: 'Flange' },
  { key: 'barrel', label: 'Barrel' },
  { key: 'innerWidth', label: 'Inner Width' },
  { key: 'outerWidth', label: 'Outer Width' },
  { key: 'capacity', label: 'Capacity' },
];

const OPTIONAL_SPEC_FIELDS: Array<{ key: keyof DrumMasterRecord; label: string }> = [
  { key: 'drumType', label: 'Drum Type' },
  { key: 'barrelWidth', label: 'Barrel Width' },
  { key: 'usableWidth', label: 'Usable Width' },
  { key: 'clearanceMm', label: 'Clearance Mm' },
  { key: 'maxWeight', label: 'MaxLoad (kg)' },
  { key: 'emptyDrumNetWeightKg', label: 'Empty Weight Kg' },
];

export function DrumMasterParameterGrid({ drum }: { drum: DrumMasterRecord | null }) {
  const optional = OPTIONAL_SPEC_FIELDS.filter((field) => {
    if (!drum) return false;
    const value = drum[field.key];
    return value != null && value !== '';
  });
  const fields = [...SOURCE_SPEC_FIELDS, ...optional];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
      {fields.map((field) => (
        <div
          key={field.key}
          className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-1.5 py-1"
        >
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {field.label}
          </div>
          <div className="font-mono text-[10px] font-extrabold text-slate-900 dark:text-white truncate">
            {formatParam(
              drum
                ? field.key === 'resolvedDescription'
                  ? resolveDrumDescription(drum)
                  : (drum[field.key as keyof DrumMasterRecord] as string | number | undefined)
                : null
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface DrumSelectOption {
  drumCode: string;
  label: string;
}

interface DrumMasterSelectProps {
  drums: DrumMasterRecord[];
  value: string;
  onChange: (drumCode: string) => void;
  emptyLabel?: string;
  showSpecification?: boolean;
  /**
   * When provided (e.g. suitable candidates from the native engine),
   * these options populate the dropdown instead of the full master list.
   */
  options?: DrumSelectOption[] | null;
  disabled?: boolean;
}

export function DrumMasterSelect({
  drums,
  value,
  onChange,
  emptyLabel = 'Select drum code',
  showSpecification = true,
  options = null,
  disabled = false,
}: DrumMasterSelectProps) {
  const selected = drums.find((d) => d.drumCode === value) || null;
  const useCandidateOptions = Array.isArray(options);
  const candidateCodes = useCandidateOptions ? new Set(options.map((o) => o.drumCode)) : null;
  const orphanSelected =
    useCandidateOptions && value && candidateCodes && !candidateCodes.has(value)
      ? value
      : null;

  return (
    <div className="space-y-1.5 min-w-[220px]">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none disabled:opacity-60 disabled:pointer-events-none"
      >
        <option value="">
          {useCandidateOptions || drums.length
            ? emptyLabel
            : 'Drum Master empty — import Drum List.xlsx'}
        </option>
        {useCandidateOptions
          ? options.map((o) => (
              <option key={o.drumCode} value={o.drumCode}>
                {o.label}
              </option>
            ))
          : drums.map((d) => (
              <option key={d.id} value={d.drumCode}>
                {d.drumCode} — {resolveDrumDescription(d)}
              </option>
            ))}
        {orphanSelected ? (
          <option value={orphanSelected}>
            {orphanSelected} — not suitable for current cutting length
          </option>
        ) : null}
      </select>
      {showSpecification ? <DrumMasterParameterGrid drum={selected} /> : null}
    </div>
  );
}
