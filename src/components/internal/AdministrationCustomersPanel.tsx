import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { CustomerMasterAdminPanel } from './CustomerMasterAdminPanel';

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  defaultCurrency: string;
  defaultIncoterm?: string | null;
};

type AssignmentRow = {
  id: string;
  status: string;
  assignedAt: string;
  customer: CustomerRow;
  user: { id: string; email: string; fullName: string; roles?: string[]; status: string; isActive: boolean };
};

export function AdministrationCustomersPanel({
  api,
  jwtToken,
  lang,
  initialSub = 'customers',
}: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  jwtToken?: string | null;
  lang: 'en' | 'ar';
  initialSub?: 'customers' | 'users';
}) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [sub, setSub] = useState<'customers' | 'users'>(initialSub);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [assignForm, setAssignForm] = useState({ customerId: '', userAccountId: '' });

  const loadAssignments = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status !== 'all') params.set('status', status);
    const data = await api(`/api/admin/customer-users?${params.toString()}`);
    setAssignments(data.assignments || []);
  }, [api, q, status]);

  useEffect(() => {
    setSub(initialSub);
  }, [initialSub]);

  useEffect(() => {
    if (sub !== 'users') return;
    setBusy(true);
    setError(null);
    loadAssignments()
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, [sub, loadAssignments]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadAssignments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSub('customers')}
          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold ${sub === 'customers' ? 'bg-red-600 text-white' : 'border'}`}
        >
          {t('Customers', 'العملاء')}
        </button>
        <button
          onClick={() => setSub('users')}
          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold ${sub === 'users' ? 'bg-red-600 text-white' : 'border'}`}
        >
          {t('Customer users', 'مستخدمو العملاء')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>}

      {sub === 'customers' && <CustomerMasterAdminPanel api={api} jwtToken={jwtToken} onError={setError} />}

      {sub === 'users' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-4 flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('Search code or name', 'بحث بالرمز أو الاسم')}
                className="bg-slate-50 border rounded-xl pl-9 pr-3 py-1.5 text-xs w-56"
              />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border px-3 py-1.5 text-xs font-bold">
              <option value="all">{t('All statuses', 'كل الحالات')}</option>
              <option value="ACTIVE">{t('Active', 'نشط')}</option>
              <option value="INACTIVE">{t('Inactive', 'غير نشط')}</option>
            </select>
          </div>
          <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-2 items-end">
            <input
              value={assignForm.customerId}
              onChange={(e) => setAssignForm({ ...assignForm, customerId: e.target.value })}
              placeholder={t('Customer id or code', 'معرّف أو رمز العميل')}
              className="rounded-xl border px-3 py-1.5 text-xs w-48"
            />
            <input
              value={assignForm.userAccountId}
              onChange={(e) => setAssignForm({ ...assignForm, userAccountId: e.target.value })}
              placeholder={t('User account id', 'معرّف المستخدم')}
              className="rounded-xl border px-3 py-1.5 text-xs w-48"
            />
            <button
              className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-extrabold"
              onClick={() =>
                run(async () => {
                  await api('/api/admin/customer-users', { method: 'POST', body: JSON.stringify(assignForm) });
                  setAssignForm({ customerId: '', userAccountId: '' });
                })
              }
            >
              {t('Assign customer', 'ربط عميل')}
            </button>
          </div>
          <div className="overflow-x-auto bg-white rounded-2xl border">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {[t('User', 'المستخدم'), t('Email', 'البريد'), t('Customer', 'العميل'), t('Roles', 'الأدوار'), t('User status', 'حالة المستخدم'), t('Assignment', 'الربط'), t('Actions', 'إجراءات')].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-extrabold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      {busy ? t('Loading assignments…', 'جاري التحميل…') : t('No customer-user assignments.', 'لا توجد ربطات.')}
                    </td>
                  </tr>
                )}
                {assignments.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 font-semibold">{a.user.fullName}</td>
                    <td className="px-3 py-2">{a.user.email}</td>
                    <td className="px-3 py-2">{a.customer.code} — {a.customer.name}</td>
                    <td className="px-3 py-2">{(a.user.roles || []).join(', ') || '—'}</td>
                    <td className="px-3 py-2">{a.user.status}</td>
                    <td className="px-3 py-2">{a.status}</td>
                    <td className="px-3 py-2">
                      {a.status === 'ACTIVE' && (
                        <button className="underline" onClick={() => run(async () => { await api(`/api/admin/customer-users/${a.id}/unassign`, { method: 'POST' }); })}>
                          {t('Remove assignment', 'إلغاء الربط')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
