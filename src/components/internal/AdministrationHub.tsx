import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  Users,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  LayoutDashboard,
  UserCog,
  Lock,
  UserX,
  KeyRound,
} from 'lucide-react';
import { AdministrationCustomersPanel } from './AdministrationCustomersPanel';
import { DashboardStatCard } from '../common/DashboardStatCard';

type AdminTab = 'overview' | 'users' | 'roles' | 'security' | 'customers' | 'customer_users';

type SafeUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  department?: string;
  customerId?: string;
  userType: string;
  status: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  lastLoginAt?: string | null;
  roles?: string[];
  role?: string;
};

type SafeRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
};

type PermissionRow = { module: string; resource: string; action: string; description: string };

function authHeaders(token: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const AdministrationHub: React.FC = () => {
  const { jwtToken } = useAuth();
  const token = jwtToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_access_token') : null);
  const [adminLang, setAdminLang] = useState<'en' | 'ar'>('en');
  const [tab, setTab] = useState<AdminTab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState<any>(null);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [skip, setSkip] = useState(0);
  const take = 20;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [sort, setSort] = useState('createdAt');

  const [roles, setRoles] = useState<SafeRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [roleDetail, setRoleDetail] = useState<any>(null);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [canAssign, setCanAssign] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    username: '',
    password: '',
    department: '',
    jobTitle: '',
    mobile: '',
    employeeNumber: '',
    customerId: '',
    userType: 'internal',
    roleCodes: ['REPORT_VIEWER'],
  });

  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({ code: '', name: '', description: '' });

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, { ...init, headers: { ...authHeaders(token), ...(init?.headers || {}) } });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error('Administration API did not return JSON. Sign in with email and password (JWT), then refresh.');
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    },
    [token]
  );

  const loadSummary = useCallback(async () => {
    const data = await api('/api/admin/security');
    setSummary(data.summary);
  }, [api]);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status !== 'all') params.set('status', status);
    if (roleFilter) params.set('role', roleFilter);
    if (deptFilter) params.set('department', deptFilter);
    if (customerFilter) params.set('customerId', customerFilter);
    if (sort) params.set('sort', sort);
    params.set('skip', String(skip));
    params.set('take', String(take));
    const data = await api(`/api/admin/users?${params.toString()}`);
    setUsers(data.users || []);
    setTotalUsers(data.total || 0);
  }, [api, q, status, roleFilter, deptFilter, customerFilter, sort, skip]);

  const loadRoles = useCallback(async () => {
    const data = await api('/api/admin/roles');
    setRoles(data.roles || []);
  }, [api]);

  const loadCatalog = useCallback(async () => {
    const data = await api('/api/admin/permissions/matrix');
    setCatalog(data.permissions || []);
    setCanAssign(Boolean(data.canAssign));
  }, [api]);

  const loadRoleDetail = useCallback(
    async (id: string) => {
      const data = await api(`/api/admin/roles/${id}`);
      setRoleDetail(data.role);
      setAllowed(
        new Set((data.role.permissions || []).map((p: PermissionRow) => `${p.module}:${p.resource}:${p.action}`))
      );
    },
    [api]
  );

  const refreshAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await Promise.all([loadSummary(), loadUsers(), loadRoles(), loadCatalog()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadSummary, loadUsers, loadRoles, loadCatalog]);

  useEffect(() => {
    if (!token) {
      setError('Sign in with email and password so Administration can load live users, roles, and security counts.');
      return;
    }
    refreshAll().catch(() => undefined);
  }, [token, refreshAll]);

  useEffect(() => {
    loadUsers().catch((err) => setError(err.message));
  }, [loadUsers]);

  useEffect(() => {
    if (selectedRole) loadRoleDetail(selectedRole).catch((err) => setError(err.message));
  }, [selectedRole, loadRoleDetail]);

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await Promise.all([loadUsers(), loadRoles(), loadSummary()]);
      if (selectedRole) await loadRoleDetail(selectedRole);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'customer_users', label: 'Customer users', icon: UserCog },
    { id: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
    { id: 'security', label: 'Security summary', icon: UserCog },
  ];

  const pageCount = Math.max(1, Math.ceil(totalUsers / take));
  const page = Math.floor(skip / take) + 1;

  const groupedCatalog = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const row of catalog) {
      const key = row.module;
      map.set(key, [...(map.get(key) || []), row]);
    }
    return [...map.entries()];
  }, [catalog]);

  return (
    <div className="space-y-6">
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-red-300 uppercase tracking-widest bg-red-800/60 px-2.5 py-1 rounded-md border border-red-600/40">
            PLATFORM CONTROL PLANE
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">Administration</h1>
          <p className="text-xs text-slate-300 mt-1">
            Persistent users, hashed passwords, database-backed roles and permissions. Business modules stay governed by their own services.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAdminLang(adminLang === 'en' ? 'ar' : 'en')}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs"
          >
            {adminLang === 'en' ? 'العربية' : 'English'}
          </button>
          <button
            onClick={() => refreshAll()}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 ${
                tab === item.id ? 'bg-red-600 text-white shadow' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm font-semibold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {(tab === 'overview' || tab === 'security') && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active users', value: summary.activeUsers, icon: Users },
            { label: 'Locked users', value: summary.lockedUsers, icon: Lock },
            { label: 'Inactive users', value: summary.inactiveUsers, icon: UserX },
            { label: 'Failed logins', value: summary.failedLoginAttempts, icon: AlertTriangle },
            { label: 'Roles', value: summary.roleCount, icon: ShieldCheck },
            { label: 'Permissions', value: summary.permissionCount, icon: KeyRound },
          ].map((card) => (
            <DashboardStatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value ?? '—'}
            />
          ))}
        </div>
      )}

      {tab === 'overview' && summary && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <h2 className="font-extrabold text-sm mb-3">Recent logins</h2>
            <ul className="space-y-2 text-xs">
              {(summary.recentLogins || []).length === 0 && <li className="text-slate-500">No logins recorded yet.</li>}
              {(summary.recentLogins || []).map((u: any) => (
                <li key={u.id} className="flex justify-between gap-2">
                  <span className="font-semibold">{u.fullName}</span>
                  <span className="text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <h2 className="font-extrabold text-sm mb-3">Recent administrative actions</h2>
            <ul className="space-y-2 text-xs">
              {(summary.recentAdminActions || []).length === 0 && <li className="text-slate-500">No administrative actions yet.</li>}
              {(summary.recentAdminActions || []).map((a: any) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="font-semibold">{a.action}</span>
                  <span className="text-slate-500">{a.entityId}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'security' && summary && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-2">
          <p className="font-bold">Figures above are counted from PostgreSQL (`UserAccount`, `Role`, `Permission`, `AuditEvent`). Nothing is fabricated.</p>
          <p className="text-slate-500">Passwords are stored as bcrypt hashes only. Reset uses a hashed ticket; the plaintext token is never written to AuditEvent.</p>
        </div>
      )}

      {(tab === 'customers' || tab === 'customer_users') && (
        <AdministrationCustomersPanel api={api} jwtToken={token} lang={adminLang} initialSub={tab === 'customer_users' ? 'users' : 'customers'} />
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => {
                  setSkip(0);
                  setQ(e.target.value);
                }}
                placeholder="Search name, email, department"
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold w-56"
              />
            </div>
            <select value={status} onChange={(e) => { setSkip(0); setStatus(e.target.value); }} className="rounded-xl border px-3 py-1.5 text-xs font-bold">
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="LOCKED">Locked</option>
            </select>
            <input value={roleFilter} onChange={(e) => { setSkip(0); setRoleFilter(e.target.value); }} placeholder="Role code" className="rounded-xl border px-3 py-1.5 text-xs w-36" />
            <input value={deptFilter} onChange={(e) => { setSkip(0); setDeptFilter(e.target.value); }} placeholder="Department" className="rounded-xl border px-3 py-1.5 text-xs w-36" />
            <input value={customerFilter} onChange={(e) => { setSkip(0); setCustomerFilter(e.target.value); }} placeholder="Customer id" className="rounded-xl border px-3 py-1.5 text-xs w-36" />
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-xl border px-3 py-1.5 text-xs font-bold">
              <option value="createdAt">Newest</option>
              <option value="fullName">Name</option>
              <option value="email">Email</option>
              <option value="lastLoginAt">Last login</option>
            </select>
            <button onClick={() => setCreateOpen(true)} className="ml-auto px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-extrabold flex items-center gap-1">
              <Plus className="h-4 w-4" /> Create
            </button>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left">
                <tr>
                  {['Name', 'Email', 'Department', 'Customer', 'Roles', 'Status', 'Last login', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-2 font-extrabold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      {busy ? 'Loading users…' : 'No users match the current filters.'}
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-semibold">{u.fullName}</td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{u.department || '—'}</td>
                    <td className="px-3 py-2">{u.customerId || '—'}</td>
                    <td className="px-3 py-2">{(u.roles || []).join(', ') || u.role || '—'}</td>
                    <td className="px-3 py-2">{u.status}</td>
                    <td className="px-3 py-2">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                    <td className="px-3 py-2 whitespace-nowrap space-x-1">
                      <button className="underline" onClick={() => setEditUser(u)}>Edit</button>
                      <button className="underline" onClick={() => setConfirm({ title: u.isActive ? 'Deactivate user' : 'Activate user', body: `${u.email} will be ${u.isActive ? 'prevented from signing in' : 'allowed to sign in'}.`, onConfirm: () => runAction(async () => { await api(`/api/admin/users/${u.id}/${u.isActive ? 'deactivate' : 'activate'}`, { method: 'POST' }); }) })}>
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="underline" onClick={() => setConfirm({ title: u.isLocked ? 'Unlock user' : 'Lock user', body: `${u.email} will be ${u.isLocked ? 'unlocked' : 'locked'}.`, onConfirm: () => runAction(async () => { await api(`/api/admin/users/${u.id}/${u.isLocked ? 'unlock' : 'lock'}`, { method: 'POST' }); }) })}>
                        {u.isLocked ? 'Unlock' : 'Lock'}
                      </button>
                      <button className="underline" onClick={() => setConfirm({ title: 'Issue password reset', body: 'A one-time ticket will be created. The password hash is never shown.', onConfirm: () => runAction(async () => { const r = await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' }); alert(r.resetToken ? `One-time reset token (dev only): ${r.resetToken}` : 'Reset ticket issued. Token is not returned in this environment.'); }) })}>
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>{totalUsers} users</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setSkip(Math.max(0, skip - take))} className="px-3 py-1 rounded-lg border disabled:opacity-40">Previous</button>
              <span>Page {page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setSkip(skip + take)} className="px-3 py-1 rounded-lg border disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-sm">Roles</h2>
              <button onClick={() => setRoleFormOpen(true)} className="text-xs font-bold text-red-600">Create role</button>
            </div>
            <ul className="space-y-2 text-xs">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedRole(r.id)}
                    className={`w-full text-left rounded-xl px-3 py-2 border ${selectedRole === r.id ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}
                  >
                    <div className="font-bold">{r.name}</div>
                    <div className="text-slate-500">{r.code} · {r.isActive ? 'Active' : 'Inactive'} · {r.userCount} users · {r.permissionCount} perms</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            {!roleDetail && <p className="text-sm text-slate-500">Select a role to view the permission matrix.</p>}
            {roleDetail && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-extrabold">{roleDetail.name}</h2>
                    <p className="text-xs text-slate-500">{roleDetail.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs underline"
                      onClick={() =>
                        setConfirm({
                          title: roleDetail.isActive ? 'Deactivate role' : 'Activate role',
                          body: 'Roles referenced by users are deactivated, not deleted.',
                          onConfirm: () =>
                            runAction(async () => {
                              await api(`/api/admin/roles/${roleDetail.id}/${roleDetail.isActive ? 'deactivate' : 'activate'}`, { method: 'POST' });
                            }),
                        })
                      }
                    >
                      {roleDetail.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    {canAssign && (
                      <button
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                        onClick={() =>
                          runAction(async () => {
                            await api(`/api/admin/roles/${roleDetail.id}/permissions`, {
                              method: 'PUT',
                              body: JSON.stringify({
                                permissions: [...allowed].map((code) => {
                                  const [module, resource, action] = code.split(':');
                                  return { module, resource, action };
                                }),
                              }),
                            });
                          })
                        }
                      >
                        Save permissions
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1">Module</th>
                        <th>Resource</th>
                        <th>Action</th>
                        <th>Allowed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedCatalog.flatMap(([, rows]) =>
                        rows.map((p) => {
                          const code = `${p.module}:${p.resource}:${p.action}`;
                          return (
                            <tr key={code} className="border-t border-slate-100">
                              <td className="py-1 font-semibold">{p.module}</td>
                              <td>{p.resource}</td>
                              <td>{p.action}</td>
                              <td>
                                <input
                                  type="checkbox"
                                  disabled={!canAssign}
                                  checked={allowed.has(code)}
                                  onChange={() => {
                                    const next = new Set(allowed);
                                    if (next.has(code)) next.delete(code);
                                    else next.add(code);
                                    setAllowed(next);
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="font-bold text-xs mb-1">Users with this role</h3>
                  <ul className="text-xs space-y-1">
                    {(roleDetail.users || []).length === 0 && <li className="text-slate-500">None assigned.</li>}
                    {(roleDetail.users || []).map((u: any) => (
                      <li key={u.id}>{u.fullName} · {u.email}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <Modal title="Create user" onClose={() => setCreateOpen(false)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {(['fullName', 'email', 'username', 'password', 'department', 'jobTitle', 'mobile', 'employeeNumber', 'customerId'] as const).map((key) => (
              <label key={key} className="flex flex-col gap-1 font-semibold">
                {key === 'password' ? 'Initial password (never returned by the API)' : key}
                <input
                  type={key === 'password' ? 'password' : 'text'}
                  className="border rounded-lg px-2 py-1.5"
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 font-semibold">
              Type
              <select className="border rounded-lg px-2 py-1.5" value={form.userType} onChange={(e) => setForm({ ...form, userType: e.target.value })}>
                <option value="internal">internal</option>
                <option value="customer">customer</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Role
              <select className="border rounded-lg px-2 py-1.5" value={form.roleCodes[0]} onChange={(e) => setForm({ ...form, roleCodes: [e.target.value] })}>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>{r.code}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="mt-4 w-full bg-red-600 text-white rounded-xl py-2 text-xs font-extrabold"
            onClick={() =>
              runAction(async () => {
                await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
                setCreateOpen(false);
              })
            }
          >
            Create user
          </button>
        </Modal>
      )}

      {editUser && (
        <Modal title={`Edit ${editUser.fullName}`} onClose={() => setEditUser(null)}>
          <EditUserForm
            user={editUser}
            roles={roles}
            onSave={(payload, roleCode) =>
              runAction(async () => {
                await api(`/api/admin/users/${editUser.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
                if (roleCode && !(editUser.roles || []).includes(roleCode)) {
                  await api(`/api/admin/users/${editUser.id}/roles`, { method: 'POST', body: JSON.stringify({ roleCode }) });
                }
                setEditUser(null);
              })
            }
          />
        </Modal>
      )}

      {roleFormOpen && (
        <Modal title="Create role" onClose={() => setRoleFormOpen(false)}>
          <div className="space-y-2 text-xs">
            <input className="border rounded-lg px-2 py-1.5 w-full" placeholder="CODE" value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5 w-full" placeholder="Name" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
            <textarea className="border rounded-lg px-2 py-1.5 w-full" placeholder="Description" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
            <button
              className="w-full bg-red-600 text-white rounded-xl py-2 font-extrabold"
              onClick={() =>
                runAction(async () => {
                  await api('/api/admin/roles', { method: 'POST', body: JSON.stringify(roleForm) });
                  setRoleFormOpen(false);
                })
              }
            >
              Create
            </button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="text-sm text-slate-600 mb-4">{confirm.body}</p>
          <div className="flex justify-end gap-2">
            <button className="px-3 py-1.5 rounded-lg border text-xs" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold" onClick={confirm.onConfirm}>Confirm</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 shadow-xl">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-extrabold">{title}</h3>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditUserForm({
  user,
  roles,
  onSave,
}: {
  user: SafeUser;
  roles: SafeRole[];
  onSave: (payload: Record<string, string>, roleCode?: string) => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [department, setDepartment] = useState(user.department || '');
  const [customerId, setCustomerId] = useState(user.customerId || '');
  const [roleCode, setRoleCode] = useState(user.roles?.[0] || '');
  return (
    <div className="space-y-2 text-xs">
      <input className="border rounded-lg px-2 py-1.5 w-full" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <input className="border rounded-lg px-2 py-1.5 w-full" placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
      <input className="border rounded-lg px-2 py-1.5 w-full" placeholder="Customer id" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
      <select className="border rounded-lg px-2 py-1.5 w-full" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
        {roles.map((r) => (
          <option key={r.code} value={r.code}>{r.code}</option>
        ))}
      </select>
      <button className="w-full bg-red-600 text-white rounded-xl py-2 font-extrabold" onClick={() => onSave({ fullName, department, customerId }, roleCode)}>
        Save
      </button>
    </div>
  );
}
