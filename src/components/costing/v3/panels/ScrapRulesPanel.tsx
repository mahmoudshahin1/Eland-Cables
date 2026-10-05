import React, { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { BomScrapPanel } from '../../BomScrapPanel';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingPageHeader,
  CostingScrapCallout,
  CostingTable,
  CostingTd,
  CostingTh,
  statusTone,
} from '../CostingUiPrimitives';
import { pendingApprovalIds, summarizeBulkApprove } from '../costingUiUtils';
import { costingApi } from '../costingV3Api';
import { CostingPanelProps } from './types';

export const ScrapRulesPanel: React.FC<CostingPanelProps> = ({ token, lang, data, refresh, setError }) => {
  const [busy, setBusy] = useState(false);
  const pendingIds = useMemo(() => pendingApprovalIds(data.scrapRules, ['SUBMITTED']), [data.scrapRules]);

  const approveAll = async () => {
    if (!token || pendingIds.length === 0) return;
    if (
      !window.confirm(
        `Approve ${pendingIds.length} submitted scrap rule${pendingIds.length === 1 ? '' : 's'}? Only SUBMITTED rules are approved.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = (await costingApi(token, '/api/admin/costing/scrap-rules/bulk-approve', {
        method: 'POST',
        body: JSON.stringify({ ids: pendingIds }),
      })) as { approvedCount: number; skippedCount: number; failedCount: number; failed?: Array<{ error: string }> };
      await refresh();
      if (result.failedCount || result.skippedCount) setError(summarizeBulkApprove(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve all failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CostingPageHeader
        title="Scrap Rules"
        breadcrumb="Costing > Scrap Rules"
        actions={
          <CostingBtn onClick={() => void approveAll()} disabled={busy || pendingIds.length === 0}>
            <CheckCircle2 className="h-4 w-4" /> Approve all{pendingIds.length ? ` (${pendingIds.length})` : ''}
          </CostingBtn>
        }
      />
      <CostingScrapCallout className="mb-4" />
      <CostingTable>
        <thead>
          <tr>
            <CostingTh>Rule</CostingTh>
            <CostingTh>Scope</CostingTh>
            <CostingTh>Scrap %</CostingTh>
            <CostingTh>Status</CostingTh>
            <CostingTh>Effective From</CostingTh>
          </tr>
        </thead>
        <tbody>
          {data.scrapRules.map((r) => (
            <tr key={String(r.id)}>
              <CostingTd className="font-mono">{String(r.code || r.name)}</CostingTd>
              <CostingTd>
                {String(r.scopeType)} {r.scopeValue ? `· ${String(r.scopeValue)}` : ''}
              </CostingTd>
              <CostingTd>{r.scrapRate != null ? `${(Number(r.scrapRate) * 100).toFixed(2)}%` : '—'}</CostingTd>
              <CostingTd>
                <CostingBadge tone={statusTone(String(r.workflowStatus))}>{String(r.workflowStatus)}</CostingBadge>
              </CostingTd>
              <CostingTd>{r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : '—'}</CostingTd>
            </tr>
          ))}
        </tbody>
      </CostingTable>
      <CostingCard title="Cable BOM scrap maintenance">
        <BomScrapPanel token={token} lang={lang} />
      </CostingCard>
    </>
  );
};
