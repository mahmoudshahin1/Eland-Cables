/**
 * V2 ERP shell — Energya branding (white canvas, navy chrome, vermilion accent).
 * Task 03: category navigator, module status, active surface, breadcrumbs, secondary nav.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, Shield, LayoutGrid, ArrowLeft, Database, ChevronRight } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';
import {
  listNavigableModules,
  getModuleById,
  type PlatformModuleDefinition,
} from '../../platform/moduleRegistry';
import {
  breadcrumbsForPath,
  buildModuleSurfaceNav,
  listInformationalModules,
  listNavigableModulesByCategory,
  parseV2ModulePath,
} from '../../platform/moduleIa';
import { INTERNAL_HOME_PATH } from '../../app/shellRoutes';
import { MasterDataOwnershipPanel } from './MasterDataOwnershipPanel';
import { V2ModuleSurfacePage, V2ModuleWorkspacePage } from './V2ModulePages';

const NAVY = '#0B1F3A';
const VERMILION = '#E10600';

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    LIVE: 'bg-emerald-100 text-emerald-800',
    PARTIAL: 'bg-amber-100 text-amber-900',
    FROZEN: 'bg-sky-100 text-sky-900',
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${colors[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {status}
    </span>
  );
}

function V2TopBar({
  userLabel,
  onSearch,
}: {
  userLabel: string;
  onSearch: (q: string) => void;
}) {
  const [q, setQ] = useState('');
  return (
    <header
      className="flex items-center gap-4 px-4 py-3 border-b border-[#132A4F]"
      style={{ backgroundColor: NAVY }}
    >
      <BrandLogo className="h-9" onDark />
      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            onSearch(e.target.value);
          }}
          placeholder="Search modules…"
          className="w-full rounded-md border border-white/15 bg-white/10 text-white placeholder:text-slate-400 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/40"
        />
      </div>
      <button
        type="button"
        className="relative p-2 rounded-md text-slate-200 hover:bg-white/10"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
      </button>
      <div className="text-sm text-slate-100 whitespace-nowrap">{userLabel}</div>
      <Link
        to={INTERNAL_HOME_PATH}
        className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-white text-[#0B1F3A] hover:bg-slate-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        V1 Internal
      </Link>
    </header>
  );
}

function V2Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = breadcrumbsForPath(pathname);
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500 mb-4" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
          {c.path && i < crumbs.length - 1 ? (
            <Link to={c.path} className="hover:text-[#0B1F3A]">
              {c.label}
            </Link>
          ) : (
            <span className={i === crumbs.length - 1 ? 'text-[#0B1F3A] font-medium' : ''}>{c.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function V2Home({ modules, filter }: { modules: PlatformModuleDefinition[]; filter: string }) {
  const groups = useMemo(() => listNavigableModulesByCategory(), []);
  const informational = useMemo(() => listInformationalModules(), []);
  const q = filter.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        modules: g.modules.filter(
          (m) =>
            m.displayName.toLowerCase().includes(q) ||
            m.moduleId.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.modules.length > 0);
  }, [groups, q]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: VERMILION }}>
          Energya Connect V2
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#0B1F3A]">Module navigator</h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Operational modules only (LIVE / PARTIAL / FROZEN). Each module follows Workspace | Master
          Data | Transactions | Setup | Workflows | Reports | Dashboards. Planned, stub, and
          not-implemented modules stay catalogued — never mounted as fake screens.
        </p>
      </div>

      {filteredGroups.map((group) => (
        <section key={group.category}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {group.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.modules.map((m) => (
              <Link
                key={m.moduleId}
                to={m.workspaceEntry || '/v2'}
                className="block border border-slate-200 bg-white p-4 hover:border-[#0B1F3A]/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-500">
                      {String(m.catalogNumber).padStart(2, '0')} · {m.category}
                    </div>
                    <div className="mt-1 font-medium text-[#0B1F3A]">{m.displayName}</div>
                  </div>
                  {statusBadge(m.status)}
                </div>
                <div className="mt-3 text-xs text-slate-500 font-mono">{m.moduleId}</div>
                {m.workspaceEntry && (
                  <div className="mt-2 text-xs" style={{ color: VERMILION }}>
                    {m.workspaceEntry}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}

      {filteredGroups.length === 0 && (
        <p className="text-sm text-slate-500">No modules match your search.</p>
      )}

      {!q && (
        <section className="border-t border-slate-200 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Catalog only (not navigable)
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            {informational.length} modules marked PLANNED / STUB / NOT_IMPLEMENTED — Finance, SC,
            Support gaps stay honest.
          </p>
          <div className="flex flex-wrap gap-2">
            {informational.map((m) => (
              <span
                key={m.moduleId}
                className="text-[11px] px-2 py-1 border border-dashed border-slate-300 text-slate-500"
                title={m.status}
              >
                {m.displayName} · {m.status}
              </span>
            ))}
          </div>
        </section>
      )}

      {modules.length === 0 && null}
    </div>
  );
}

function EffectiveAccessExplainPanel() {
  const { jwtToken } = useAuth();
  const [userId, setUserId] = useState('');
  const [module, setModule] = useState('COMMERCIAL');
  const [resource, setResource] = useState('INQUIRY');
  const [action, setAction] = useState('VIEW');
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ userId, module, resource, action });
      const res = await fetch(`/api/v2/security/effective-access/explain?${params}`, {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setResult('');
        return;
      }
      setResult(
        [
          data.explanation,
          '',
          'Chain:',
          JSON.stringify(data.profile?.chain, null, 2),
          '',
          'Roles: ' + (data.profile?.roles || []).join(', '),
          'Groups: ' + (data.profile?.groups || []).join(', '),
        ].join('\n')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: VERMILION }}>
          Security
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#0B1F3A]">Why does this user have access?</h1>
        <p className="mt-1 text-sm text-slate-600">
          Explains EFFECTIVE ACCESS = auth ∩ roles ∩ scope ∩ ownership ∩ workflow ∩ field. Deny by
          default.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-700">
          User ID
          <input
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="UserAccount cuid"
          />
        </label>
        <label className="text-sm text-slate-700">
          Module
          <input
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            value={module}
            onChange={(e) => setModule(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-700">
          Resource
          <input
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            value={resource}
            onChange={(e) => setResource(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-700">
          Action
          <input
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy || !userId}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: NAVY }}
      >
        <Shield className="h-4 w-4" />
        {busy ? 'Evaluating…' : 'Explain access'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && (
        <pre className="text-xs bg-slate-50 border border-slate-200 p-4 overflow-auto whitespace-pre-wrap text-slate-800">
          {result}
        </pre>
      )}
    </div>
  );
}

function ModuleSecondaryNav({ moduleId, pathname }: { moduleId: string; pathname: string }) {
  const mod = getModuleById(moduleId);
  if (!mod) return null;
  const items = buildModuleSurfaceNav(mod);
  return (
    <div className="mb-4 border-b border-slate-200 pb-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {mod.displayName} surfaces
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => {
          const active =
            pathname === item.path ||
            (item.surface !== 'workspace' && pathname.startsWith(item.path + '/')) ||
            (item.surface === 'workspace' && pathname === item.path);
          return (
            <div key={item.surface} className="flex flex-col">
              <Link
                to={item.path}
                className={`px-2.5 py-1 text-xs rounded ${
                  active ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
              {item.children && active && (
                <div className="flex flex-wrap gap-1 mt-1 ml-1">
                  {item.children.map((c) => (
                    <Link
                      key={c.id}
                      to={c.path}
                      className={`px-2 py-0.5 text-[10px] rounded ${
                        pathname === c.path
                          ? 'bg-[#E10600]/10 text-[#E10600] font-medium'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function V2SideNav({ pathname }: { pathname: string }) {
  const groups = useMemo(() => listNavigableModulesByCategory(), []);
  const parsed = parseV2ModulePath(pathname);

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-[#F7F8FA] p-3 overflow-y-auto">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-2">
        Navigator
      </div>
      <nav className="space-y-3">
        <div className="space-y-1">
          <Link
            to="/v2"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md ${
              pathname === '/v2' ? 'bg-white text-[#0B1F3A] font-medium shadow-sm' : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <LayoutGrid className="h-4 w-4" style={{ color: pathname === '/v2' ? VERMILION : undefined }} />
            Modules
          </Link>
          <Link
            to="/v2/master-data"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md ${
              pathname.startsWith('/v2/master-data')
                ? 'bg-white text-[#0B1F3A] font-medium shadow-sm'
                : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <Database className="h-4 w-4" style={{ color: pathname.startsWith('/v2/master-data') ? VERMILION : undefined }} />
            Master Data IA
          </Link>
          <Link
            to="/v2/security"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md ${
              pathname.startsWith('/v2/security')
                ? 'bg-white text-[#0B1F3A] font-medium shadow-sm'
                : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <Shield className="h-4 w-4" style={{ color: pathname.startsWith('/v2/security') ? VERMILION : undefined }} />
            Effective Access
          </Link>
        </div>

        {groups.map((group) => (
          <div key={group.category}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.modules.map((m) => {
                const entry = m.workspaceEntry || `/v2/modules/${m.moduleId.toLowerCase()}`;
                const active =
                  parsed.moduleId === m.moduleId ||
                  (pathname.startsWith(entry) && entry !== '/v2');
                return (
                  <Link
                    key={m.moduleId}
                    to={entry}
                    className={`flex items-center justify-between gap-1 px-3 py-1.5 text-xs rounded-md ${
                      active ? 'bg-white text-[#0B1F3A] font-medium shadow-sm' : 'text-slate-600 hover:bg-white/70'
                    }`}
                  >
                    <span className="truncate">{m.displayName}</span>
                    <span
                      className={`shrink-0 text-[9px] font-semibold uppercase ${
                        m.status === 'LIVE'
                          ? 'text-emerald-700'
                          : m.status === 'FROZEN'
                            ? 'text-sky-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {m.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function V2Shell() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const modules = useMemo(() => listNavigableModules(), []);
  const parsed = parseV2ModulePath(location.pathname);

  useEffect(() => {
    if (currentUser?.userType === 'customer') {
      navigate('/customer', { replace: true });
    }
  }, [currentUser, navigate]);

  if (!currentUser || currentUser.userType === 'customer') {
    return <Navigate to="/customer" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-800 font-sans">
      <V2TopBar
        userLabel={currentUser.fullName || currentUser.email || currentUser.userName}
        onSearch={setFilter}
      />
      <div className="flex flex-1 min-h-0">
        <V2SideNav pathname={location.pathname} />
        <main className="flex-1 p-6 overflow-auto bg-white">
          <V2Breadcrumbs pathname={location.pathname} />
          {parsed.moduleId && <ModuleSecondaryNav moduleId={parsed.moduleId} pathname={location.pathname} />}
          <Routes>
            <Route path="/v2" element={<V2Home modules={modules} filter={filter} />} />
            <Route path="/v2/security" element={<EffectiveAccessExplainPanel />} />
            <Route path="/v2/master-data" element={<MasterDataOwnershipPanel />} />
            <Route path="/v2/modules/:moduleId" element={<V2ModuleWorkspacePage />} />
            <Route path="/v2/modules/:moduleId/:surface" element={<V2ModuleSurfacePage />} />
            <Route path="/v2/modules/:moduleId/:surface/:entity" element={<V2ModuleSurfacePage />} />
            <Route path="/v2/*" element={<Navigate to="/v2" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
