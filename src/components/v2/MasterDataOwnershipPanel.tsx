/**
 * Master Data IA — ownership surfaces (owning module / entity / permissions / scope).
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ownershipSurfaceRows } from '../../platform/moduleIa';
import { ErpListPanel } from './ErpListPanel';

const VERMILION = '#E10600';

type OwnershipSurfaceRow = ReturnType<typeof ownershipSurfaceRows>[number];

export function MasterDataOwnershipPanel() {
  const rows = useMemo(() => ownershipSurfaceRows(), []);
  const [moduleFilter, setModuleFilter] = useState('all');

  const modules = useMemo(
    () => [...new Set(rows.map((r) => r.ownerModuleId))].sort(),
    [rows]
  );

  const filtered: OwnershipSurfaceRow[] = useMemo(
    () => (moduleFilter === 'all' ? rows : rows.filter((r) => r.ownerModuleId === moduleFilter)),
    [rows, moduleFilter]
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: VERMILION }}>
          Master Data IA
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#0B1F3A]">Ownership surfaces</h1>
        <p className="mt-1 text-sm text-slate-600 max-w-3xl">
          Write ownership is exclusive to the owning module. Reads go through published APIs.
          Frozen rows stay frozen (fulfillment + CostingMetalCostComponent).
        </p>
      </div>

      <ErpListPanel<OwnershipSurfaceRow>
        title="Owned entities"
        subtitle="From dataOwnershipMatrix — single authority per entity"
        rows={filtered}
        rowKey={(r) => r.entity}
        searchPlaceholder="Filter entity…"
        searchFilter={(r, q) =>
          r.entity.toLowerCase().includes(q) ||
          r.ownerModuleId.toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
        }
        toolbarExtra={
          <select
            className="border border-slate-300 text-sm px-2 py-1.5"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="all">All owners</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        }
        columns={[
          { id: 'entity', header: 'Entity', accessor: (r) => r.entity },
          { id: 'owner', header: 'Owner module', accessor: (r) => r.ownerModuleId },
          {
            id: 'apis',
            header: 'Write APIs',
            accessor: (r) => (
              <span className="font-mono text-[11px]">{r.writeApiPrefixes.join(', ')}</span>
            ),
          },
          {
            id: 'perms',
            header: 'Permissions',
            accessor: (r) => (
              <span className="text-[11px]">{r.permissions.slice(0, 2).join(', ') || '—'}</span>
            ),
          },
          {
            id: 'frozen',
            header: 'Frozen',
            accessor: (r) => (r.frozen ? 'YES' : '—'),
          },
          {
            id: 'path',
            header: 'V2 surface',
            accessor: (r) =>
              r.displayPath ? (
                <Link to={r.displayPath} className="text-[#E10600] text-xs hover:underline">
                  Open
                </Link>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </div>
  );
}
