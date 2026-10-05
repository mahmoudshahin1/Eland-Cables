import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { V2QuotationDto } from '../../services/v2QuotationApiService';
import {
  createCustomerCommitmentFromQuotation,
  type CustomerCommitmentDto,
} from '../../services/customerPortalApiService';
import { Card, Button, Badge } from '../ui';
import { Handshake, Loader2 } from 'lucide-react';

interface CustomerCommitmentPanelProps {
  quotation: V2QuotationDto;
  commitment: CustomerCommitmentDto | null;
  onCommitmentChanged: () => void;
}

export const CustomerCommitmentPanel: React.FC<CustomerCommitmentPanelProps> = ({
  quotation,
  commitment,
  onCommitmentChanged,
}) => {
  const { jwtToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<'DIRECT_ORDER' | 'SALES_AGREEMENT'>('DIRECT_ORDER');

  const handleCreate = async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      await createCustomerCommitmentFromQuotation(jwtToken, quotation.id, fulfillmentType);
      onCommitmentChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create commitment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5 border border-slate-200 space-y-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-brand-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-900">Commercial Commitment</h3>
          <p className="text-xs text-slate-500">Standalone EPC commitment — no D365 required</p>
        </div>
      </div>

      {commitment ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-semibold text-emerald-900">{commitment.commitmentNumber}</span>
            <Badge tone="success">{commitment.status}</Badge>
          </div>
          <p className="text-xs text-emerald-800">
            Fulfillment: {commitment.fulfillmentType.replace(/_/g, ' ')} · Quotation {commitment.quotationNumber} V
            {commitment.quotationVersionNo}
          </p>
          {commitment.expirationDate && (
            <p className="text-xs text-emerald-700">
              Expires {new Date(commitment.expirationDate).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Accept the issued quotation by creating a commercial commitment. Energya will fulfill via EPC sales
            documents without Dynamics 365.
          </p>
          <label className="block text-xs font-semibold text-slate-600">
            Fulfillment preference
            <select
              value={fulfillmentType}
              onChange={(e) => setFulfillmentType(e.target.value as 'DIRECT_ORDER' | 'SALES_AGREEMENT')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="DIRECT_ORDER">Direct order (single purchase)</option>
              <option value="SALES_AGREEMENT">Sales agreement (call-off releases)</option>
            </select>
          </label>
          <Button variant="primary" size="sm" disabled={loading} onClick={() => void handleCreate()}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              'Start commercial commitment'
            )}
          </Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </Card>
  );
};
