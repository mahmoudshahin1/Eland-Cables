import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { V2QuotationDto } from '../../services/v2QuotationApiService';
import { fetchV2QuotationDocument, recordCustomerQuotationDecision } from '../../services/v2QuotationApiService';
import { sanitizeCustomerQuotation } from '../../services/customerInquiryJourneyService';
import { fetchCustomerFinancialOffer } from '../../services/customerFinancialOfferApiService';
import { CustomerFinancialOfferPanel } from './CustomerFinancialOfferPanel';
import type { CustomerFinancialOfferProjection } from '../../domain/financialOfferCustomerProjection';
import {
  listCustomerCommitments,
  type CustomerCommitmentDto,
} from '../../services/customerPortalApiService';
import { CustomerCommitmentPanel } from './CustomerCommitmentPanel';
import { Card, Badge } from '../ui';
import { Download, FileText, Printer } from 'lucide-react';

interface CustomerQuotationViewProps {
  inquiryId: string;
  quotation: V2QuotationDto;
  onUpdated?: () => void;
}

export const CustomerQuotationView: React.FC<CustomerQuotationViewProps> = ({
  inquiryId,
  quotation,
  onUpdated,
}) => {
  const { jwtToken } = useAuth();
  const view = sanitizeCustomerQuotation(quotation);
  const issued = Boolean(view.issuedAt || view.commercialOfferStatus === 'ISSUED');
  const [offer, setOffer] = useState<CustomerFinancialOfferProjection | null>(null);
  const [commitment, setCommitment] = useState<CustomerCommitmentDto | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!jwtToken) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void fetchCustomerFinancialOffer(jwtToken, inquiryId)
      .then((next) => {
        if (!cancelled) setOffer(next);
      })
      .catch(() => {
        if (!cancelled) setOffer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [jwtToken, inquiryId]);

  useEffect(() => {
    if (!jwtToken || !issued) {
      setCommitment(null);
      return;
    }
    let cancelled = false;
    void listCustomerCommitments(jwtToken, { inquiryId })
      .then((rows) => {
        if (cancelled) return;
        setCommitment(rows.find((row) => row.quotationId === quotation.id) || rows[0] || null);
      })
      .catch(() => {
        if (!cancelled) setCommitment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [jwtToken, inquiryId, quotation.id, issued]);

  const openFinalOffer = async (mode: 'print' | 'download') => {
    if (!jwtToken) return;
    const blob = await fetchV2QuotationDocument(jwtToken, inquiryId);
    const objectUrl = URL.createObjectURL(blob);
    if (mode === 'download') {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${view.quotationNumber || 'commercial-offer'}-REV${view.versionNo ?? 0}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    }
    window.open(objectUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4 border border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Commercial Quotation</h3>
              <p className="text-xs text-slate-500">Technical and commercial offer — read only</p>
            </div>
          </div>
          {issued && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void openFinalOffer('print')}
                className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              >
                <Printer className="h-3.5 w-3.5" /> Print Final Commercial Offer
              </button>
              <button
                type="button"
                onClick={() => void openFinalOffer('download')}
                className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              >
                <Download className="h-3.5 w-3.5" /> Export Final Commercial Offer PDF
              </button>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Quotation</p>
            <p className="font-mono font-semibold">
              {view.quotationNumber} V{view.versionNo}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <Badge tone="success">{view.commercialOfferStatus || view.status || 'DRAFT'}</Badge>
          </div>
          {view.issuedAt && (
            <div>
              <p className="text-xs text-slate-500">Issued</p>
              <p>{new Date(view.issuedAt).toLocaleDateString()}</p>
            </div>
          )}
          {view.validUntil && (
            <div>
              <p className="text-xs text-slate-500">Valid until</p>
              <p>{new Date(view.validUntil).toLocaleDateString()}</p>
            </div>
          )}
          {view.sellingPrice != null && (
            <div>
              <p className="text-xs text-slate-500">Total offer value</p>
              <p className="font-mono font-bold text-brand-800">
                {Number(view.sellingPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>

        {offer ? (
          <div className="border-t border-slate-100 pt-3">
            <CustomerFinancialOfferPanel offer={offer} />
          </div>
        ) : null}

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Line items</p>
          {view.lines.map((line) => (
            <div key={line.id} className="rounded-lg border border-slate-100 p-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-slate-800">
                  Line {line.lineNumber}: {line.itemDescription}
                </span>
                {line.sellingPrice != null && (
                  <span className="font-mono text-brand-700">
                    {Number(line.sellingPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              {line.plannedLengthM != null && (
                <p className="text-slate-500 mt-1">Planned length: {line.plannedLengthM} m</p>
              )}
            </div>
          ))}
        </div>

        {!issued && (
          <p className="text-[11px] text-slate-500">
            This quotation is prepared internally. You will see the issued commercial offer after Energya issues it.
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          Internal calculation details (RM, G&amp;A, margin) are not shown in the customer portal.
        </p>
      </Card>

      {issued && !view.customerDecision && (
        <Card className="p-5 border border-slate-200 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Your decision</h3>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason required for Reject or Clarification"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={2}
          />
          {decisionError ? <p className="text-xs text-red-700">{decisionError}</p> : null}
          <div className="flex flex-wrap gap-2">
            {(['ACCEPT', 'REJECT', 'CLARIFICATION'] as const).map((decision) => (
              <button
                key={decision}
                type="button"
                disabled={decisionBusy || !jwtToken}
                onClick={() => {
                  if (!jwtToken) return;
                  setDecisionBusy(true);
                  setDecisionError(null);
                  void recordCustomerQuotationDecision(jwtToken, inquiryId, {
                    decision,
                    reason: decision === 'ACCEPT' ? undefined : reason,
                  })
                    .then(() => onUpdated?.())
                    .catch((err) => setDecisionError(err instanceof Error ? err.message : 'Decision failed'))
                    .finally(() => setDecisionBusy(false));
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  decision === 'ACCEPT'
                    ? 'bg-emerald-600 text-white'
                    : decision === 'REJECT'
                      ? 'border border-red-200 bg-red-50 text-red-800'
                      : 'border border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {decision === 'ACCEPT' ? 'Accept' : decision === 'REJECT' ? 'Reject' : 'Request Clarification'}
              </button>
            ))}
          </div>
        </Card>
      )}

      {issued && view.customerDecision ? (
        <p className="text-xs text-slate-600">
          Decision: <strong>{view.customerDecision}</strong>
          {view.customerDecisionReason ? ` — ${view.customerDecisionReason}` : ''}
        </p>
      ) : null}

      {issued && (
        <CustomerCommitmentPanel
          quotation={quotation}
          commitment={commitment}
          onCommitmentChanged={() => {
            onUpdated?.();
            if (!jwtToken) return;
            void listCustomerCommitments(jwtToken, { inquiryId }).then((rows) => {
              setCommitment(rows.find((row) => row.quotationId === quotation.id) || rows[0] || null);
            });
          }}
        />
      )}
    </div>
  );
};
