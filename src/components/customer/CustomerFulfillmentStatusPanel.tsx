import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchCustomerCommitmentFulfillment,
  type CustomerCommitmentDto,
  type CustomerSalesAgreementDto,
  type CustomerSalesOrderDto,
} from '../../services/customerPortalApiService';
import { operationalStatusLabel, integrationStatusLabel } from '../../services/commercialFulfillmentWorkflow';
import { Card, Badge } from '../ui';
import { Package, Loader2 } from 'lucide-react';

interface CustomerFulfillmentStatusPanelProps {
  commitment: CustomerCommitmentDto;
}

export const CustomerFulfillmentStatusPanel: React.FC<CustomerFulfillmentStatusPanelProps> = ({ commitment }) => {
  const { jwtToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesOrders, setSalesOrders] = useState<CustomerSalesOrderDto[]>([]);
  const [agreements, setAgreements] = useState<CustomerSalesAgreementDto[]>([]);

  const reload = useCallback(async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchCustomerCommitmentFulfillment(jwtToken, commitment.id);
      setSalesOrders(detail.commitment.salesOrders ?? []);
      setAgreements(detail.commitment.salesAgreements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load fulfillment status');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, commitment.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <Card className="p-5 border border-slate-200 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading fulfillment status…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-5 border border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>
    );
  }

  const hasDocuments = salesOrders.length > 0 || agreements.length > 0;

  return (
    <Card className="p-5 border border-slate-200 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-brand-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-900">Fulfillment status</h3>
          <p className="text-xs text-slate-500">Read-only EPC sales documents — no Dynamics 365 required</p>
        </div>
      </div>

      {!hasDocuments && (
        <p className="text-sm text-slate-600">
          Your commitment is active. Energya will create sales orders or agreements when fulfillment begins.
        </p>
      )}

      {salesOrders.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales orders</p>
          {salesOrders.map((so) => (
            <div key={so.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold">{so.salesOrderNumber}</span>
                <Badge tone="neutral">{operationalStatusLabel(so.status)}</Badge>
              </div>
              <p className="text-xs text-slate-600">
                {so.orderOrigin.replace(/_/g, ' ')} · {so.orderFulfillmentMode} · {integrationStatusLabel(so.integrationStatus)}
              </p>
            </div>
          ))}
        </div>
      )}

      {agreements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales agreements</p>
          {agreements.map((ag) => (
            <div key={ag.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold">{ag.agreementNumber}</span>
                <Badge tone="neutral">{operationalStatusLabel(ag.status)}</Badge>
              </div>
              <p className="text-xs text-slate-600">
                Released {ag.totalReleasedQuantity} / {ag.totalCommittedQuantity} {ag.quantityUom ?? 'KM'} ·{' '}
                {integrationStatusLabel(ag.integrationStatus)}
              </p>
              {(ag.releases ?? []).map((rel) => (
                <div key={rel.id} className="ml-2 border-l-2 border-brand-200 pl-3 text-xs text-slate-700">
                  <span className="font-mono">{rel.releaseNumber}</span>
                  {' → '}
                  {rel.salesOrder ? (
                    <span>
                      SO {rel.salesOrder.salesOrderNumber} ({operationalStatusLabel(rel.salesOrder.status)})
                    </span>
                  ) : (
                    'No linked SO'
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
