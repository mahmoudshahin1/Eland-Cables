import React, { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, Pencil, Plus, Trash2, X } from 'lucide-react';
import { downloadMasterExcel } from '../../services/masterDataApiService';

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  countryCode?: string | null;
  type: string;
  status: string;
  defaultCurrency: string;
  defaultIncoterm?: string | null;
  paymentTerms?: string | null;
  taxVatNumber?: string | null;
  remarks?: string | null;
  companyLogoUrl?: string | null;
  companyTagline?: string | null;
  customerGroupId?: string | null;
  classificationId?: string | null;
  segmentId?: string | null;
  paymentTermId?: string | null;
  paymentMethodId?: string | null;
};

type AddressDraft = {
  id?: string;
  code: string;
  name: string;
  addressType: string;
  line1: string;
  line2: string;
  city: string;
  stateRegion: string;
  countryCode: string;
  postalCode: string;
  isDefault: boolean;
  active: boolean;
};

type ContactDraft = {
  id?: string;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
  mobile: string;
  department: string;
  isPrimary: boolean;
  active: boolean;
};

type DeliveryDraft = {
  id?: string;
  countryCode: string;
  countryLabel: string;
  incotermCode: string;
  destinationPortCode: string;
  isDefault: boolean;
  active: boolean;
};

type MappingDraft = {
  id?: string;
  system: string;
  externalCustomerCode: string;
  externalName: string;
  mappingStatus: string;
  active: boolean;
};

const EMPTY_FORM = {
  code: '',
  name: '',
  legalName: '',
  countryCode: '',
  type: 'OTHER',
  defaultCurrency: '',
  defaultIncoterm: '',
  paymentTerms: '',
  taxVatNumber: '',
  remarks: '',
  companyLogoUrl: '',
  companyTagline: '',
  customerGroupId: '',
  classificationId: '',
  segmentId: '',
  paymentTermId: '',
  paymentMethodId: '',
};

function emptyAddress(): AddressDraft {
  return {
    code: '',
    name: '',
    addressType: 'OTHER',
    line1: '',
    line2: '',
    city: '',
    stateRegion: '',
    countryCode: '',
    postalCode: '',
    isDefault: false,
    active: true,
  };
}

function emptyContact(): ContactDraft {
  return {
    name: '',
    jobTitle: '',
    email: '',
    phone: '',
    mobile: '',
    department: '',
    isPrimary: false,
    active: true,
  };
}

function emptyDelivery(): DeliveryDraft {
  return {
    countryCode: '',
    countryLabel: '',
    incotermCode: '',
    destinationPortCode: '',
    isDefault: false,
    active: true,
  };
}

function emptyMapping(): MappingDraft {
  return {
    system: '',
    externalCustomerCode: '',
    externalName: '',
    mappingStatus: 'PENDING',
    active: true,
  };
}

export function CustomerMasterAdminPanel({
  jwtToken,
  api,
  onError,
}: {
  jwtToken?: string | null;
  api?: (path: string, init?: RequestInit) => Promise<any>;
  onError?: (message: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'add' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [addresses, setAddresses] = useState<AddressDraft[]>([]);
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryDraft[]>([]);
  const [mappings, setMappings] = useState<MappingDraft[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [audit, setAudit] = useState<any[]>([]);
  const [masters, setMasters] = useState<any>({
    currencies: [],
    paymentTerms: [],
    paymentMethods: [],
    classifications: [],
    segments: [],
    groups: [],
    incoterms: [],
    destinationPorts: [],
  });

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      if (api) return api(path, init);
      const res = await fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
          ...(init?.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      return body;
    },
    [api, jwtToken]
  );

  const report = (message: string | null) => {
    setError(message);
    onError?.(message);
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status !== 'all') params.set('status', status);
    const data = await call(`/api/admin/customers?${params.toString()}`);
    setRows(data.customers || []);
    setTotal(data.total || 0);
  }, [call, q, status]);

  useEffect(() => {
    void load().catch((err) => report(err instanceof Error ? err.message : String(err)));
    void call('/api/admin/customer-reference-masters')
      .then(setMasters)
      .catch(() => undefined);
  }, [load]);

  const resetForm = () => {
    setMode('idle');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAddresses([]);
    setContacts([]);
    setDeliveries([]);
    setMappings([]);
    setUsers([]);
    setAudit([]);
    setAssignUserId('');
  };

  const openAdd = () => {
    resetForm();
    setMode('add');
    report(null);
  };

  const openEdit = async (row: CustomerRow) => {
    report(null);
    const detail = await call(`/api/admin/customers/${row.id}`);
    const customer = detail.customer || row;
    setEditingId(customer.id);
    setMode('edit');
    setForm({
      code: customer.code || '',
      name: customer.name || '',
      legalName: customer.legalName || '',
      countryCode: customer.countryCode || '',
      type: customer.type || 'OTHER',
      defaultCurrency: customer.defaultCurrency || '',
      defaultIncoterm: customer.defaultIncoterm || '',
      paymentTerms: customer.paymentTerms || '',
      taxVatNumber: customer.taxVatNumber || '',
      remarks: customer.remarks || '',
      companyLogoUrl: customer.companyLogoUrl || '',
      companyTagline: customer.companyTagline || '',
      customerGroupId: customer.customerGroupId || '',
      classificationId: customer.classificationId || '',
      segmentId: customer.segmentId || '',
      paymentTermId: customer.paymentTermId || '',
      paymentMethodId: customer.paymentMethodId || '',
    });
    setAddresses(
      (detail.addresses || []).map((addr: any) => ({
        id: addr.id,
        code: addr.code || '',
        name: addr.name || '',
        addressType: addr.addressType || 'OTHER',
        line1: addr.line1 || '',
        line2: addr.line2 || '',
        city: addr.city || '',
        stateRegion: addr.stateRegion || '',
        countryCode: addr.countryCode || '',
        postalCode: addr.postalCode || '',
        isDefault: Boolean(addr.isDefault),
        active: addr.active !== false,
      }))
    );
    setContacts(
      (detail.contacts || []).map((c: any) => ({
        id: c.id,
        name: c.name || '',
        jobTitle: c.jobTitle || '',
        email: c.email || '',
        phone: c.phone || '',
        mobile: c.mobile || '',
        department: c.department || '',
        isPrimary: Boolean(c.isPrimary),
        active: c.active !== false,
      }))
    );
    setDeliveries(
      (detail.deliveryPreferences || []).map((d: any) => ({
        id: d.id,
        countryCode: d.countryCode || '',
        countryLabel: d.countryLabel || '',
        incotermCode: d.incotermCode || '',
        destinationPortCode: d.destinationPortCode || '',
        isDefault: Boolean(d.isDefault),
        active: d.active !== false,
      }))
    );
    setMappings(
      (detail.externalMappings || []).map((m: any) => ({
        id: m.id,
        system: m.system || '',
        externalCustomerCode: m.externalCustomerCode || '',
        externalName: m.externalName || '',
        mappingStatus: m.mappingStatus || 'PENDING',
        active: m.active !== false,
      }))
    );
    setUsers(detail.users || []);
    const auditRes = await call(`/api/admin/customers/${customer.id}/audit`).catch(() => ({ events: [] }));
    setAudit(auditRes.events || []);
  };

  const payload = () => ({
    code: form.code,
    name: form.name,
    legalName: form.legalName || null,
    countryCode: form.countryCode || null,
    type: form.type,
    defaultCurrency: form.defaultCurrency || undefined,
    defaultIncoterm: form.defaultIncoterm || null,
    paymentTerms: form.paymentTerms || null,
    taxVatNumber: form.taxVatNumber || null,
    remarks: form.remarks || null,
    companyLogoUrl: form.companyLogoUrl || null,
    companyTagline: form.companyTagline || null,
    customerGroupId: form.customerGroupId || null,
    classificationId: form.classificationId || null,
    segmentId: form.segmentId || null,
    paymentTermId: form.paymentTermId || null,
    paymentMethodId: form.paymentMethodId || null,
    addresses,
    contacts,
    deliveryPreferences: deliveries,
    externalMappings: mappings,
  });

  const save = async () => {
    setBusy(true);
    report(null);
    try {
      if (mode === 'add') {
        await call('/api/admin/customers', { method: 'POST', body: JSON.stringify(payload()) });
      } else if (editingId) {
        await call(`/api/admin/customers/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload()) });
      }
      await load();
      resetForm();
    } catch (err) {
      report(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (id: string) => {
    if (!window.confirm('Deactivate this customer? Historical inquiries remain intact.')) return;
    setBusy(true);
    try {
      await call(`/api/admin/customers/${id}`, { method: 'DELETE' });
      await load();
      if (editingId === id) resetForm();
    } catch (err) {
      report(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (id: string) => {
    await call(`/api/admin/customers/${id}/activate`, { method: 'POST' });
    await load();
  };

  const assignUser = async () => {
    if (!editingId || !assignUserId.trim()) return;
    await call('/api/admin/customer-users', {
      method: 'POST',
      body: JSON.stringify({ customerId: editingId, userAccountId: assignUserId.trim() }),
    });
    await openEdit({ id: editingId } as CustomerRow);
    setAssignUserId('');
  };

  const exportExcel = async () => {
    if (!jwtToken && !api) return;
    const token = jwtToken || '';
    const result = await downloadMasterExcel('customers', token, { q, status: status === 'all' ? undefined : status });
    if (result.ok === false) report(result.error);
  };

  const field = (key: keyof typeof EMPTY_FORM, label: string, readOnly = false) => (
    <label className="block text-[11px] font-bold text-slate-600">
      {label}
      <input
        value={form[key]}
        readOnly={readOnly}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
      />
    </label>
  );

  const selectField = (key: keyof typeof EMPTY_FORM, label: string, options: Array<{ id?: string; code?: string; name?: string }>) => (
    <label className="block text-[11px] font-bold text-slate-600">
      {label}
      <select
        value={form[key]}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
      >
        <option value="">Not set</option>
        {options.map((opt) => (
          <option key={opt.id || opt.code} value={opt.id || opt.code || ''}>
            {opt.code ? `${opt.code} — ${opt.name}` : opt.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold">Customers ({total})</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search code or name"
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 min-w-[200px]"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200"
            >
              <option value="all">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
            <button
              type="button"
              onClick={() => void exportExcel()}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 flex items-center gap-1"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Customer
            </button>
          </div>
        </div>
        {error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}
        <div className="overflow-x-auto max-h-[360px]">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Country</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Currency</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-2 font-mono">{row.code}</td>
                  <td className="p-2">{row.name}</td>
                  <td className="p-2">{row.countryCode || '—'}</td>
                  <td className="p-2">{row.status}</td>
                  <td className="p-2">{row.defaultCurrency}</td>
                  <td className="p-2">
                    <button type="button" className="mr-2 text-blue-700 font-bold" onClick={() => void openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5 inline" /> Edit
                    </button>
                    {row.status === 'ACTIVE' ? (
                      <button type="button" className="text-red-700 font-bold" onClick={() => void deactivate(row.id)}>
                        <Trash2 className="h-3.5 w-3.5 inline" /> Delete / Deactivate
                      </button>
                    ) : (
                      <button type="button" className="text-emerald-700 font-bold" onClick={() => void activate(row.id)}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">
          Existing development/demo customers are listed as-is. They are not treated as approved Energya master data.
        </p>
      </div>

      {mode !== 'idle' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold">{mode === 'add' ? 'Add Customer' : `Edit ${form.code}`}</h4>
            <button type="button" onClick={resetForm} className="text-slate-500">
              <X className="h-4 w-4" />
            </button>
          </div>

          <section className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">1. Basic Information</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {field('code', 'Customer Code *', mode === 'edit')}
              {field('name', 'Customer Name *')}
              {field('legalName', 'Legal Name')}
              {field('companyLogoUrl', 'Company Logo URL')}
              {field('companyTagline', 'Company Tagline')}
              {field('countryCode', 'Country')}
              {selectField('customerGroupId', 'Customer Group', masters.groups || [])}
              <label className="block text-[11px] font-bold text-slate-600">
                Type
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="EPC_CUSTOMER">EPC_CUSTOMER</option>
                  <option value="DISTRIBUTOR">DISTRIBUTOR</option>
                  <option value="UTILITY">UTILITY</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">2. Address</h5>
            {addresses.map((addr, idx) => (
              <div key={addr.id || idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-slate-100 rounded-xl p-3">
                {['code', 'name', 'addressType', 'line1', 'line2', 'city', 'stateRegion', 'countryCode', 'postalCode'].map((key) => (
                  <input
                    key={key}
                    placeholder={key}
                    value={(addr as any)[key]}
                    onChange={(e) =>
                      setAddresses((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: e.target.value } : row)))
                    }
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                ))}
                <label className="text-[11px] font-bold flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={addr.isDefault}
                    onChange={(e) =>
                      setAddresses((prev) => prev.map((row, i) => ({ ...row, isDefault: i === idx ? e.target.checked : false })))
                    }
                  />
                  Default
                </label>
              </div>
            ))}
            <button type="button" className="text-xs font-bold text-blue-700" onClick={() => setAddresses((prev) => [...prev, emptyAddress()])}>
              + Add address
            </button>
          </section>

          <section className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">3. Contacts</h5>
            {contacts.map((c, idx) => (
              <div key={c.id || idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-slate-100 rounded-xl p-3">
                {['name', 'jobTitle', 'email', 'phone', 'mobile', 'department'].map((key) => (
                  <input
                    key={key}
                    placeholder={key}
                    value={(c as any)[key]}
                    onChange={(e) =>
                      setContacts((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: e.target.value } : row)))
                    }
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                ))}
                <label className="text-[11px] font-bold flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.isPrimary}
                    onChange={(e) =>
                      setContacts((prev) => prev.map((row, i) => ({ ...row, isPrimary: i === idx ? e.target.checked : false })))
                    }
                  />
                  Primary
                </label>
              </div>
            ))}
            <button type="button" className="text-xs font-bold text-blue-700" onClick={() => setContacts((prev) => [...prev, emptyContact()])}>
              + Add contact
            </button>
          </section>

          <section className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">4. Commercial Profile</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {selectField('defaultCurrency', 'Currency', (masters.currencies || []).map((c: any) => ({ code: c.code, name: c.name })))}
              {selectField('paymentTermId', 'Payment Terms', masters.paymentTerms || [])}
              {selectField('paymentMethodId', 'Payment Method', masters.paymentMethods || [])}
              {selectField('classificationId', 'Customer Classification', masters.classifications || [])}
              {selectField('segmentId', 'Customer Segment', masters.segments || [])}
              {selectField('defaultIncoterm', 'Default Incoterm (optional)', (masters.incoterms || []).map((c: any) => ({ code: c.code, name: c.name })))}
              {field('paymentTerms', 'Legacy payment terms text')}
              {field('taxVatNumber', 'Tax / VAT')}
              {field('remarks', 'Remarks')}
            </div>
            <p className="text-[11px] text-slate-500">Dropdowns list only existing master records. Empty lists mean no approved values have been loaded.</p>
          </section>

          <section className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">5. Delivery Preferences</h5>
            {deliveries.map((d, idx) => (
              <div key={d.id || idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 border border-slate-100 rounded-xl p-3">
                <input
                  placeholder="Country code"
                  value={d.countryCode}
                  onChange={(e) => setDeliveries((prev) => prev.map((row, i) => (i === idx ? { ...row, countryCode: e.target.value } : row)))}
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
                <input
                  placeholder="Country label"
                  value={d.countryLabel}
                  onChange={(e) => setDeliveries((prev) => prev.map((row, i) => (i === idx ? { ...row, countryLabel: e.target.value } : row)))}
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
                <select
                  value={d.incotermCode}
                  onChange={(e) => setDeliveries((prev) => prev.map((row, i) => (i === idx ? { ...row, incotermCode: e.target.value } : row)))}
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">Incoterm</option>
                  {(masters.incoterms || []).map((opt: any) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.code}
                    </option>
                  ))}
                </select>
                <select
                  value={d.destinationPortCode}
                  onChange={(e) =>
                    setDeliveries((prev) => prev.map((row, i) => (i === idx ? { ...row, destinationPortCode: e.target.value } : row)))
                  }
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">Destination port</option>
                  {(masters.destinationPorts || []).map((opt: any) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.code} — {opt.name}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] font-bold flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.isDefault}
                    onChange={(e) =>
                      setDeliveries((prev) => prev.map((row, i) => ({ ...row, isDefault: i === idx ? e.target.checked : false })))
                    }
                  />
                  Default
                </label>
              </div>
            ))}
            <button type="button" className="text-xs font-bold text-blue-700" onClick={() => setDeliveries((prev) => [...prev, emptyDelivery()])}>
              + Add delivery preference
            </button>
          </section>

          <section className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">6. External Mapping</h5>
            {mappings.map((m, idx) => (
              <div key={m.id || idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-slate-100 rounded-xl p-3">
                {['system', 'externalCustomerCode', 'externalName', 'mappingStatus'].map((key) => (
                  <input
                    key={key}
                    placeholder={key}
                    value={(m as any)[key]}
                    onChange={(e) =>
                      setMappings((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: e.target.value } : row)))
                    }
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                ))}
              </div>
            ))}
            <button type="button" className="text-xs font-bold text-blue-700" onClick={() => setMappings((prev) => [...prev, emptyMapping()])}>
              + Add mapping
            </button>
          </section>

          {mode === 'edit' && (
            <section className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">7. Customer Users</h5>
              <ul className="text-xs space-y-1">
                {users.map((u) => (
                  <li key={u.id}>
                    {u.user?.fullName} — {u.user?.email} ({u.status})
                  </li>
                ))}
                {users.length === 0 ? <li className="text-slate-500">No users assigned.</li> : null}
              </ul>
              <div className="flex gap-2">
                <input
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  placeholder="Existing user account id"
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200 flex-1"
                />
                <button type="button" className="px-3 py-2 text-xs font-bold rounded-xl border" onClick={() => void assignUser()}>
                  Assign existing user
                </button>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-800">8. Audit / Status</h5>
            <p className="text-xs text-slate-600">Status is changed with Activate or Delete/Deactivate. Hard delete is refused when inquiries exist.</p>
            <ul className="text-[11px] text-slate-500 max-h-32 overflow-auto">
              {audit.slice(0, 12).map((event) => (
                <li key={event.id}>
                  {event.action} · {event.message} · {event.actorName}
                </li>
              ))}
            </ul>
          </section>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white"
            >
              {mode === 'add' ? 'Create customer' : 'Save changes'}
            </button>
            {editingId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void deactivate(editingId)}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-red-200 text-red-700"
              >
                Delete / Deactivate
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
        <h4 className="text-sm font-bold">Related masters — Export Excel</h4>
        <div className="flex flex-wrap gap-2">
          {[
            ['destination-ports', 'Destination Ports'],
            ['incoterms', 'Incoterms'],
            ['payment-terms', 'Payment Terms'],
            ['payment-methods', 'Payment Methods'],
            ['classifications', 'Classifications'],
            ['segments', 'Segments'],
            ['raw-material-prices', 'Raw Material Prices'],
          ].map(([entity, label]) => (
            <button
              key={entity}
              type="button"
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200"
              onClick={() => void downloadMasterExcel(entity, jwtToken || '').then((r) => r.ok === false && report(r.error))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}