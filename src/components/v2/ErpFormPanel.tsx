/**
 * Reusable ERP form pattern driven by PlatformFieldMetadata.
 * Typed relational forms — NOT a drag-drop / EAV form builder.
 */

import React, { useMemo } from 'react';
import type { PlatformFieldMetadata } from '../../platform/metadata/metadataService';

export interface ErpFormPanelProps {
  title: string;
  subtitle?: string;
  fields: PlatformFieldMetadata[];
  values: Record<string, unknown>;
  onChange: (fieldCode: string, value: unknown) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  readOnly?: boolean;
  permissionDenied?: boolean;
  busy?: boolean;
  error?: string | null;
  /** Hide fields the actor cannot see (field security projection). */
  visibleFieldFilter?: (field: PlatformFieldMetadata) => boolean;
}

function coerceInputType(dataType: string): string {
  const t = dataType.toLowerCase();
  if (t === 'number' || t === 'decimal' || t === 'integer') return 'number';
  if (t === 'boolean') return 'checkbox';
  if (t === 'date') return 'date';
  if (t === 'datetime') return 'datetime-local';
  return 'text';
}

export function ErpFormPanel({
  title,
  subtitle,
  fields,
  values,
  onChange,
  onSubmit,
  submitLabel = 'Save',
  readOnly,
  permissionDenied,
  busy,
  error,
  visibleFieldFilter,
}: ErpFormPanelProps) {
  const visible = useMemo(() => {
    const base = fields.filter((f) => f.visible !== false);
    const filtered = visibleFieldFilter ? base.filter(visibleFieldFilter) : base;
    return [...filtered].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [fields, visibleFieldFilter]);

  if (permissionDenied) {
    return (
      <div className="border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        You do not have permission to open this form (403).
      </div>
    );
  }

  const sections = useMemo(() => {
    const map = new Map<string, PlatformFieldMetadata[]>();
    for (const f of visible) {
      const key = f.section || f.tab || 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-[#0B1F3A]">{title}</h2>
        {subtitle && <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>}
        <p className="text-[11px] text-slate-450 mt-1 text-slate-500">
          Metadata source: PlatformFieldDefinition overlays code manifests — not EAV storage.
        </p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        {sections.map(([section, sectionFields]) => (
          <fieldset key={section} className="border border-slate-200 p-4 space-y-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {section}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {sectionFields.map((f) => {
                const locked = readOnly || f.readOnly;
                const inputType = coerceInputType(f.dataType);
                const value = values[f.fieldCode];
                if (inputType === 'checkbox') {
                  return (
                    <label key={f.fieldCode} className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        disabled={locked}
                        onChange={(e) => onChange(f.fieldCode, e.target.checked)}
                      />
                      {f.label}
                      {f.required && <span className="text-red-600">*</span>}
                    </label>
                  );
                }
                return (
                  <label key={f.fieldCode} className="text-sm text-slate-700 block">
                    <span className="font-medium">
                      {f.label}
                      {f.required && <span className="text-red-600"> *</span>}
                    </span>
                    <input
                      type={inputType}
                      className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                      value={value == null ? '' : String(value)}
                      disabled={locked}
                      required={f.required}
                      onChange={(e) =>
                        onChange(
                          f.fieldCode,
                          inputType === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value
                        )
                      }
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        {onSubmit && !readOnly && (
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#0B1F3A' }}
          >
            {busy ? 'Saving…' : submitLabel}
          </button>
        )}
      </form>
    </div>
  );
}
