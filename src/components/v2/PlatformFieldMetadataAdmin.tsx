/**
 * Admin form + list/grid metadata on PlatformFieldDefinition.
 * Typed overlays only — not EAV, not schema mutation, not a workflow/costing engine.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { PlatformFieldMetadata } from '../../platform/metadata/metadataService';
import { ErpFormPanel } from './ErpFormPanel';
import { ErpListPanel } from './ErpListPanel';

const ENTITIES = ['INQUIRY', 'INQUIRY_LINE', 'CUSTOMER'] as const;

export function PlatformFieldMetadataAdmin() {
  const { jwtToken, currentUser } = useAuth();
  const token = jwtToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_access_token') : null);
  const isCustomer = currentUser?.userType === 'customer';
  const [entity, setEntity] = useState<(typeof ENTITIES)[number]>('INQUIRY');
  const [fields, setFields] = useState<PlatformFieldMetadata[]>([]);
  const [selected, setSelected] = useState<PlatformFieldMetadata | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const load = useCallback(async () => {
    if (!token || isCustomer) return;
    setError(null);
    const res = await fetch(`/api/v2/metadata/fields?entity=${encodeURIComponent(entity)}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || `Failed to load metadata (${res.status})`);
      return;
    }
    setFields(data.fields || []);
  }, [entity, headers, isCustomer, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setValues({
      label: selected.label,
      description: selected.description || '',
      visible: selected.visible,
      required: selected.required,
      displayOrder: selected.displayOrder,
      helpText: selected.helpText || '',
      section: selected.section || '',
    });
  }, [selected]);

  if (isCustomer) {
    return (
      <div className="border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        403 — Customers cannot mutate form or grid metadata. Runtime still uses customer-safe projections.
      </div>
    );
  }

  const editorFields: PlatformFieldMetadata[] = [
    {
      entityCode: 'PLATFORM',
      fieldCode: 'label',
      label: 'Label',
      dataType: 'string',
      required: true,
      readOnly: false,
      visible: true,
      customerVisible: false,
      displayOrder: 1,
      section: 'Form & grid',
      source: 'CODE_MANIFEST',
    },
    {
      entityCode: 'PLATFORM',
      fieldCode: 'section',
      label: 'Section',
      dataType: 'string',
      required: false,
      readOnly: false,
      visible: true,
      customerVisible: false,
      displayOrder: 2,
      section: 'Form & grid',
      source: 'CODE_MANIFEST',
    },
    {
      entityCode: 'PLATFORM',
      fieldCode: 'displayOrder',
      label: 'Order',
      dataType: 'number',
      required: false,
      readOnly: false,
      visible: true,
      customerVisible: false,
      displayOrder: 3,
      section: 'Form & grid',
      source: 'CODE_MANIFEST',
    },
    {
      entityCode: 'PLATFORM',
      fieldCode: 'visible',
      label: 'Visible on form/list',
      dataType: 'boolean',
      required: false,
      readOnly: false,
      visible: true,
      customerVisible: false,
      displayOrder: 4,
      section: 'Form & grid',
      source: 'CODE_MANIFEST',
    },
    {
      entityCode: 'PLATFORM',
      fieldCode: 'required',
      label: 'Required',
      dataType: 'boolean',
      required: false,
      readOnly: Boolean(selected?.systemProtected),
      visible: true,
      customerVisible: false,
      displayOrder: 5,
      section: 'Form & grid',
      source: 'CODE_MANIFEST',
    },
    {
      entityCode: 'PLATFORM',
      fieldCode: 'description',
      label: 'Description',
      dataType: 'string',
      required: false,
      readOnly: false,
      visible: true,
      customerVisible: false,
      displayOrder: 6,
      section: 'Form & grid',
      source: 'CODE_MANIFEST',
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Low-code overlays <code>PlatformFieldDefinition</code> on typed inquiry/customer columns. Changes apply to
        the commercial inquiry form and inquiry list immediately. Protected cost fields cannot be exposed to
        customers.
      </p>
      <label className="text-sm text-slate-700">
        Entity{' '}
        <select
          className="ml-2 border border-slate-300 px-2 py-1"
          value={entity}
          onChange={(e) => {
            setSelected(null);
            setEntity(e.target.value as (typeof ENTITIES)[number]);
          }}
        >
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ErpListPanel<PlatformFieldMetadata>
        title="Configured fields (runtime catalog)"
        subtitle="List/grid labels and visibility come from this catalog."
        rows={fields}
        rowKey={(r) => `${r.entityCode}:${r.fieldCode}`}
        columns={[
          { id: 'fieldCode', header: 'Key', accessor: (r) => r.fieldCode },
          { id: 'label', header: 'Label', accessor: (r) => r.label },
          { id: 'visible', header: 'Visible', accessor: (r) => (r.visible ? 'Yes' : 'No') },
          { id: 'order', header: 'Order', accessor: (r) => String(r.displayOrder) },
          { id: 'source', header: 'Source', accessor: (r) => r.source },
        ]}
        onRowClick={(row) => setSelected(row)}
        searchFilter={(row, q) =>
          `${row.fieldCode} ${row.label}`.toLowerCase().includes(q.toLowerCase())
        }
      />
      {selected && (
        <ErpFormPanel
          title={`Edit ${selected.entityCode}.${selected.fieldCode}`}
          subtitle={selected.systemProtected ? 'Protected field — customer visibility cannot be enabled.' : undefined}
          fields={editorFields}
          values={values}
          busy={busy}
          error={error}
          onChange={(code, value) => setValues((prev) => ({ ...prev, [code]: value }))}
          onSubmit={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch('/api/admin/platform/fields', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  entityCode: selected.entityCode,
                  fieldCode: selected.fieldCode,
                  label: String(values.label || selected.label),
                  dataType: selected.dataType,
                  description: values.description,
                  section: values.section || selected.section,
                  visible: Boolean(values.visible),
                  required: Boolean(values.required),
                  displayOrder: Number(values.displayOrder ?? selected.displayOrder),
                  customerVisible: selected.customerVisible,
                  readOnly: selected.readOnly,
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(data.error || `Save failed (${res.status})`);
                return;
              }
              await load();
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
