/**
 * V2 module surface pages — wrap / deep-link existing V1 screens (no rebuild).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  buildModuleWorkspaceContract,
  isOperationalModule,
  masterEntityLinksForModule,
  MODULE_SURFACE_LABELS,
  type ModuleSurfaceKind,
} from '../../platform/moduleIa';
import { getModuleById } from '../../platform/moduleRegistry';
import { ModuleWorkspaceView } from './ModuleWorkspace';
import { AdministrationCustomersPanel } from '../internal/AdministrationCustomersPanel';
import { ErpListPanel } from './ErpListPanel';
import { PlatformFieldMetadataAdmin } from './PlatformFieldMetadataAdmin';
import { CUSTOMER_MASTER_BOUNDARY } from '../../platform/services/customerMasterService';
import { ENGINEERING_MASTER_BOUNDARY } from '../../platform/services/engineeringMasterService';
import { COSTING_MASTER_BOUNDARY } from '../../platform/services/costingMasterService';
import { PRICING_MASTER_BOUNDARY } from '../../platform/services/pricingMasterService';
import { BOM_MASTER_BOUNDARY } from '../../platform/services/bomMasterService';

function authHeaders(token: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function V1Bridge({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 text-slate-700 hover:bg-slate-50"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function SurfaceShell({
  moduleId,
  surface,
  children,
}: {
  moduleId: string;
  surface: ModuleSurfaceKind;
  children?: React.ReactNode;
}) {
  const contract = buildModuleWorkspaceContract(moduleId);
  if (!contract) return <Navigate to="/v2" replace />;
  const availability = getModuleById(moduleId)?.surfaces[surface];
  if (availability === 'N_A' || availability === 'PLANNED') {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-[#0B1F3A]">
          {contract.displayName} · {MODULE_SURFACE_LABELS[surface]}
        </h1>
        <p className="text-sm text-slate-600">
          Surface status: {availability || 'N_A'}. No fake screen is mounted.
        </p>
        {contract.v1Entry && <V1Bridge href={contract.v1Entry} label="Open V1 screen" />}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-[#0B1F3A]">
            {contract.displayName} · {MODULE_SURFACE_LABELS[surface]}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Availability {availability} · Module {moduleId}
          </p>
        </div>
        {contract.v1Entry && <V1Bridge href={contract.v1Entry} label="Open full V1 workspace" />}
      </div>
      {children}
    </div>
  );
}

function CustomerMasterEmbed({ sub }: { sub: 'customers' | 'users' }) {
  const { jwtToken, currentUser, hasPermission } = useAuth();
  const token = jwtToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_access_token') : null);
  const canView =
    currentUser?.role === 'SYSTEM_ADMIN' ||
    currentUser?.roles?.includes('SYSTEM_ADMIN') ||
    hasPermission('userManagement');

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: { ...authHeaders(token), ...(init?.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
          status?: number;
        };
        err.status = res.status;
        throw err;
      }
      return data;
    },
    [token]
  );

  if (!canView) {
    return (
      <div className="border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        403 — Administration / customer master permission required. Customer isolation remains
        enforced on commercial APIs via customerScope ({CUSTOMER_MASTER_BOUNDARY.isolation}).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Boundary: {CUSTOMER_MASTER_BOUNDARY.moduleId} owns{' '}
        {CUSTOMER_MASTER_BOUNDARY.entities.join(', ')}. Writes via{' '}
        {CUSTOMER_MASTER_BOUNDARY.writeApiPrefixes.join(', ')}.
      </p>
      <AdministrationCustomersPanel api={api} lang="en" initialSub={sub} />
    </div>
  );
}

function EngineeringMasterIndex() {
  const links = masterEntityLinksForModule('ENGINEERING');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Engineering Master Data organizes Cables, Parameters, BOM, and Drums under Engineering —
        not separate top-level Cable/Drum apps. {ENGINEERING_MASTER_BOUNDARY.invariants[1]}
      </p>
      <ErpListPanel
        title="Engineering master entities"
        rows={links}
        rowKey={(r) => r.entityCode}
        columns={[
          {
            id: 'label',
            header: 'Entity',
            accessor: (r) => (
              <Link to={r.path} className="text-[#E10600] hover:underline font-medium">
                {r.label}
              </Link>
            ),
          },
          { id: 'owner', header: 'Owner', accessor: (r) => r.ownerModuleId },
          { id: 'scope', header: 'Scope', accessor: (r) => r.scope },
          {
            id: 'v1',
            header: 'V1',
            accessor: (r) =>
              r.v1Path ? (
                <a href={r.v1Path} className="text-xs text-slate-600 hover:underline">
                  {r.v1Path}
                </a>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </div>
  );
}

function EntityBridgePage({
  moduleId,
  entitySlug,
  title,
  boundaryNote,
  v1Path,
}: {
  moduleId: string;
  entitySlug: string;
  title: string;
  boundaryNote: string;
  v1Path: string;
}) {
  return (
    <SurfaceShell moduleId={moduleId} surface="master">
      <div className="border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold text-[#0B1F3A]">{title}</h2>
        <p className="text-sm text-slate-600">{boundaryNote}</p>
        <p className="text-xs text-slate-500 font-mono">
          /v2/modules/{moduleId.toLowerCase()}/master/{entitySlug}
        </p>
        <V1Bridge href={v1Path} label={`Open ${title} in V1`} />
      </div>
    </SurfaceShell>
  );
}

export function V2ModuleWorkspacePage() {
  const { moduleId: raw } = useParams();
  const moduleId = (raw || '').toUpperCase();
  if (!moduleId || !getModuleById(moduleId)) return <Navigate to="/v2" replace />;
  if (!isOperationalModule(moduleId) && getModuleById(moduleId)?.status !== 'FROZEN') {
    // Allow FROZEN operational; block informational-only
    const mod = getModuleById(moduleId);
    if (mod && !mod.navDefault) {
      return (
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-[#0B1F3A]">{mod.displayName}</h1>
          <p className="text-sm text-slate-600">
            Module status {mod.status} — informational only; no fake operational workspace.
          </p>
        </div>
      );
    }
  }
  const contract = buildModuleWorkspaceContract(moduleId);
  if (!contract) return <Navigate to="/v2" replace />;
  return <ModuleWorkspaceView contract={contract} />;
}

export function V2ModuleSurfacePage() {
  const { moduleId: raw, surface: surfaceRaw, entity: entityRaw } = useParams();
  const moduleId = (raw || '').toUpperCase();
  const surface = (surfaceRaw || 'workspace') as ModuleSurfaceKind;
  const entity = (entityRaw || '').toLowerCase();

  if (!getModuleById(moduleId)) return <Navigate to="/v2" replace />;

  // Customer Management → Master Data → Customers / Customer Users
  if (moduleId === 'CUSTOMER' && surface === 'master') {
    if (entity === 'customers' || !entity) {
      return (
        <SurfaceShell moduleId={moduleId} surface="master">
          <CustomerMasterEmbed sub="customers" />
        </SurfaceShell>
      );
    }
    if (entity === 'customer-users') {
      return (
        <SurfaceShell moduleId={moduleId} surface="master">
          <CustomerMasterEmbed sub="users" />
        </SurfaceShell>
      );
    }
  }

  if ((moduleId === 'ENGINEERING' || moduleId === 'CABLE_MASTER') && surface === 'master') {
    if (!entity) {
      return (
        <SurfaceShell moduleId={moduleId} surface="master">
          <EngineeringMasterIndex />
        </SurfaceShell>
      );
    }
    const link = masterEntityLinksForModule('ENGINEERING').find(
      (l) => l.path.endsWith(`/master/${entity}`) || l.entityCode.toLowerCase() === entity
    );
    if (link) {
      return (
        <EntityBridgePage
          moduleId={moduleId}
          entitySlug={entity}
          title={link.label}
          boundaryNote={`Owned by ${link.ownerModuleId}. ${ENGINEERING_MASTER_BOUNDARY.invariants.join(' · ')}`}
          v1Path={link.v1Path || '/internal/master-data'}
        />
      );
    }
  }

  if (moduleId === 'BOM' && surface === 'master') {
    return (
      <EntityBridgePage
        moduleId="BOM"
        entitySlug={entity || 'boms'}
        title={entity === 'conflicts' ? 'Governed BOM / Conflicts' : 'Approved BOM'}
        boundaryNote={BOM_MASTER_BOUNDARY.invariants.join(' · ')}
        v1Path="/internal/technical-office"
      />
    );
  }

  if (moduleId === 'COSTING') {
    if (surface === 'master') {
      return (
        <EntityBridgePage
          moduleId="COSTING"
          entitySlug={entity || 'formulas'}
          title="Costing master"
          boundaryNote={`${COSTING_MASTER_BOUNDARY.freezes.join(' · ')} Writes: ${COSTING_MASTER_BOUNDARY.writeApiPrefixes.join(', ')}`}
          v1Path="/internal/costing"
        />
      );
    }
    return (
      <SurfaceShell moduleId="COSTING" surface={surface}>
        <div className="border border-slate-200 p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Costing IA wraps the existing Costing workspace without business-rule changes. Option B /
            Decision 5 metal semantics remain frozen.
          </p>
          <V1Bridge href="/internal/costing" label="Open Costing V1 workspace" />
        </div>
      </SurfaceShell>
    );
  }

  if (moduleId === 'PRICING') {
    return (
      <SurfaceShell moduleId="PRICING" surface={surface}>
        <div className="border border-slate-200 p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Pricing Engine boundary ({PRICING_MASTER_BOUNDARY.moduleId}) — distinct from Costing.
            Rules UX remains on V1 quotations / technical office pricing queues.
          </p>
          <V1Bridge href="/internal/quotations" label="Open Inquiry & Quotation (pricing context)" />
        </div>
      </SurfaceShell>
    );
  }

  if (moduleId === 'INQUIRY_QUOTATION') {
    return (
      <SurfaceShell moduleId="INQUIRY_QUOTATION" surface={surface}>
        <div className="border border-slate-200 p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Inquiry & Quotation integrated into V2 IA without commercial rule changes. Customer scope
            remains mandatory on all commercial APIs.
          </p>
          <V1Bridge href="/internal/quotations" label="Open Sales Quotations V1" />
        </div>
      </SurfaceShell>
    );
  }

  if (moduleId === 'PLATFORM' && (surface === 'setup' || surface === 'master')) {
    return (
      <SurfaceShell moduleId="PLATFORM" surface={surface}>
        <PlatformFieldMetadataAdmin />
      </SurfaceShell>
    );
  }

  if (moduleId === 'SALES' || moduleId === 'COMMERCIAL') {
    return (
      <SurfaceShell moduleId={moduleId} surface={surface}>
        <div className="border border-sky-200 bg-sky-50 p-4 space-y-3">
          <p className="text-sm text-sky-950">
            Phase 1 commercial fulfillment domain is <strong>FROZEN</strong>. V2 exposes IA
            navigation only — no semantic changes to Commitment / SO / Agreement / Release.
          </p>
          <V1Bridge href="/internal/fulfillment" label="Open Fulfillment V1 (frozen domain)" />
        </div>
      </SurfaceShell>
    );
  }

  if (moduleId === 'SECURITY' && surface === 'workspace') {
    return <Navigate to="/v2/security" replace />;
  }

  if (moduleId === 'ADMIN' && surface === 'master') {
    return (
      <SurfaceShell moduleId="ADMIN" surface="master">
        <div className="border border-slate-200 p-4 space-y-3">
          <p className="text-sm text-slate-600">Administration users/roles remain on V1 Administration hub.</p>
          <V1Bridge href="/internal/administration" label="Open Administration V1" />
        </div>
      </SurfaceShell>
    );
  }

  if (moduleId === 'MASTER_DATA') {
    return (
      <SurfaceShell moduleId="MASTER_DATA" surface={surface}>
        <div className="border border-slate-200 p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Shared import / RM reference hub. Domain masters stay owned by Customer / Cable /
            Engineering / BOM / Costing.
          </p>
          <div className="flex flex-wrap gap-2">
            <V1Bridge href="/internal/master-data" label="Open Master Data Hub V1" />
            <Link to="/v2/master-data" className="px-3 py-2 text-sm text-[#E10600] hover:underline">
              Ownership matrix
            </Link>
          </div>
        </div>
      </SurfaceShell>
    );
  }

  if (moduleId === 'REPORTING' || moduleId === 'ANALYTICS') {
    return (
      <SurfaceShell moduleId={moduleId} surface={surface}>
        <div className="border border-slate-200 p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Reports / Dashboards appear only when backed by real whitelist data — no fake ERP
            connectivity tiles.
          </p>
          <V1Bridge href="/internal/analytics" label="Open Analytics V1" />
        </div>
      </SurfaceShell>
    );
  }

  // Generic surface
  return (
    <SurfaceShell moduleId={moduleId} surface={surface}>
      <p className="text-sm text-slate-600">
        Use primary actions or V1 bridge for operational work. Workflows expose existing status
        machines only — no generic workflow engine.
      </p>
    </SurfaceShell>
  );
}

/** Lightweight customer field metadata demo for ErpFormPanel (typed, not EAV). */
export function useCustomerFieldManifest() {
  const [fields, setFields] = useState<
    import('../../platform/metadata/metadataService').PlatformFieldMetadata[]
  >([]);
  const { jwtToken } = useAuth();
  const token = jwtToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_access_token') : null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/metadata/fields?entity=CUSTOMER', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFields(data.fields || []);
      } catch {
        /* structural fallback below */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return useMemo(() => {
    if (fields.length) return fields;
    return [
      {
        entityCode: 'CUSTOMER',
        fieldCode: 'code',
        label: 'Customer code',
        dataType: 'string',
        section: 'Identity',
        required: true,
        readOnly: false,
        visible: true,
        customerVisible: false,
        displayOrder: 1,
        source: 'CODE_MANIFEST' as const,
      },
      {
        entityCode: 'CUSTOMER',
        fieldCode: 'name',
        label: 'Name',
        dataType: 'string',
        section: 'Identity',
        required: true,
        readOnly: false,
        visible: true,
        customerVisible: false,
        displayOrder: 2,
        source: 'CODE_MANIFEST' as const,
      },
      {
        entityCode: 'CUSTOMER',
        fieldCode: 'defaultCurrency',
        label: 'Default currency',
        dataType: 'string',
        section: 'Commercial defaults',
        required: false,
        readOnly: false,
        visible: true,
        customerVisible: false,
        displayOrder: 3,
        source: 'CODE_MANIFEST' as const,
      },
    ];
  }, [fields]);
}
