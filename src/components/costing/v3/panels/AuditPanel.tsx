import React, { useMemo } from 'react';
import { CostingBadge, CostingEmptyState, CostingPageHeader, CostingPagination, CostingTable, CostingTd, CostingTh } from '../CostingUiPrimitives';
import { usePagedRows } from '../costingUiUtils';
import { CostingPanelProps } from './types';

export const AuditPanel: React.FC<CostingPanelProps> = ({ data, intent }) => {
  const filtered = useMemo(() => {
    if (!intent?.auditEntity) return data.audit;
    const q = intent.auditEntity.toLowerCase();
    return data.audit.filter(
      (row) =>
        String(row.entityId || '').toLowerCase().includes(q) ||
        String(row.entity || '').toLowerCase().includes(q)
    );
  }, [data.audit, intent?.auditEntity]);

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(filtered, 20);

  return (
    <>
      <CostingPageHeader
        title="Audit Trail"
        breadcrumb="Costing > Audit Trail"
      />
      {intent?.auditEntity && (
        <p className="text-sm text-slate-600 mb-3">Filtered by entity: <strong>{intent.auditEntity}</strong></p>
      )}
      {total === 0 ? (
        <CostingEmptyState title="No audit events recorded" />
      ) : (
        <>
          <CostingTable>
            <thead>
              <tr>
                <CostingTh>Time</CostingTh>
                <CostingTh>User</CostingTh>
                <CostingTh>Action</CostingTh>
                <CostingTh>Entity</CostingTh>
                <CostingTh>Details</CostingTh>
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <tr key={String(row.id)} className="hover:bg-slate-50">
                  <CostingTd className="text-xs text-slate-500">
                    {row.at ? new Date(String(row.at)).toLocaleString() : '—'}
                  </CostingTd>
                  <CostingTd>{String(row.actorName || '—')}</CostingTd>
                  <CostingTd><CostingBadge>{String(row.action || '—')}</CostingBadge></CostingTd>
                  <CostingTd>{String(row.entity || '—')}</CostingTd>
                  <CostingTd className="text-xs text-slate-600">{String(row.entityId || row.message || '')}</CostingTd>
                </tr>
              ))}
            </tbody>
          </CostingTable>
          <CostingPagination page={page} pageCount={pageCount} total={total} from={from} to={to} onPage={setPage} />
        </>
      )}
    </>
  );
};
