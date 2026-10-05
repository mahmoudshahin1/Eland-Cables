import React, { useMemo, useState } from 'react';

export type CostingSelectOption = { value: string; label: string };

export function CostingSearchSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CostingSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const s = (open ? query : '').trim().toLowerCase();
    const list = !s
      ? options
      : options.filter((o) => o.value.toLowerCase().includes(s) || o.label.toLowerCase().includes(s));
    return list.slice(0, 80);
  }, [options, open, query]);

  return (
    <div className="relative">
      <input
        disabled={disabled}
        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"
        value={open ? query : selected ? `${selected.value} — ${selected.label}` : value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            const typed = query.trim();
            const match = options.find(
              (o) => o.value.toLowerCase() === typed.toLowerCase() || `${o.value} — ${o.label}`.toLowerCase() === typed.toLowerCase()
            );
            if (match) onChange(match.value);
            setOpen(false);
          }, 150);
        }}
      />
      {open && !disabled && (
        <div className="absolute z-30 mt-0.5 max-h-48 overflow-auto w-full bg-white border border-slate-200 rounded-lg shadow-lg">
          {emptyLabel && (
            <button
              type="button"
              className="block w-full text-left px-2 py-1.5 text-[11px] text-slate-500 hover:bg-blue-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                setQuery('');
                setOpen(false);
              }}
            >
              {emptyLabel}
            </button>
          )}
          {filtered.length === 0 && <p className="px-2 py-1.5 text-[11px] text-slate-400">No matches</p>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              className="block w-full text-left px-2 py-1.5 font-mono text-[11px] hover:bg-brand-50 text-brand-800"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.value);
                setQuery('');
                setOpen(false);
              }}
            >
              {o.value} — {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
