import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import {
  approveV2Quotation,
  createV2QuotationDraft,
  fetchV2Quotation,
  fetchV2QuotationReadiness,
  issueV2Quotation,
  priceV2Quotation,
  returnV2Quotation,
  reviseV2Quotation,
  fetchV2QuotationDocument,
  type V2QuotationDto,
  type V2QuotationReadinessDto,
} from '../../../../services/v2QuotationApiService';
import { Badge } from '../../../ui/Badge';
import { AlertCircle, CheckCircle2, Download, FileText, Printer, RefreshCw } from 'lucide-react';

interface QuotationSectionV2Props {
  inquiryId: string;
}

export const QuotationSectionV2: React.FC<QuotationSectionV2Props> = ({ inquiryId }) => {
  const { jwtToken } = useAuth();
  const [readiness, setReadiness] = useState<V2QuotationReadinessDto | null>(null);
  const [quotation, setQuotation] = useState<V2QuotationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const openOffer = async (mode: 'print' | 'download', draft: boolean) => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await fetchV2QuotationDocument(jwtToken, inquiryId, { draft });
      const objectUrl = URL.createObjectURL(blob);
      if (mode === 'download') {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `${draft ? 'DRAFT-' : ''}${quotation?.quotationNumber || 'commercial-offer'}-REV${quotation?.versionNo ?? 0}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        window.open(objectUrl, '_blank', 'noopener');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commercial offer failed');
    } finally {
      setLoading(false);
    }
  };

  const reload = useCallback(async () => {
    if (!jwtToken || !inquiryId) return;
    setLoading(true);
    setError(null);
    try {
      const [r, q] = await Promise.all([
        fetchV2QuotationReadiness(jwtToken, inquiryId),
        fetchV2Quotation(jwtToken, inquiryId),
      ]);
      setReadiness(r);
      setQuotation(q.quotation);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [jwtToken, inquiryId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runAction = async (label: string, fn: () => Promise<void>) => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(`${label} succeeded.`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!jwtToken) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Sign in to manage V2 quotations.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">V2 Quotation</h3>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="mb-3 flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {readiness && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={readiness.ready ? 'success' : 'warning'}>
              {readiness.ready ? 'READY' : 'BLOCKED'}
            </Badge>
            <span className="text-slate-500">Decision 5: {readiness.decision5Status}</span>
          </div>
          {readiness.blockingReasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-red-700">
              {readiness.blockingReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {readiness.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
              {readiness.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {quotation ? (
        <div className="mb-4 rounded border border-slate-100 bg-slate-50 p-3 text-sm">
          <div className="font-medium text-slate-900">
            {quotation.quotationNumber} V{quotation.versionNo}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Pricing: {quotation.commercialPricingStatus} · Technical: {quotation.technicalOfferStatus}
            {quotation.issuedAt ? ` · Issued ${new Date(quotation.issuedAt).toLocaleDateString()}` : ''}
            {quotation.commercialOfferStatus === 'RETURNED' ? ' · RETURNED' : ''}
          </div>
          {quotation.quotationReturnReason ? (
            <div className="mt-1 text-xs text-amber-800">Return reason: {quotation.quotationReturnReason}</div>
          ) : null}
          {quotation.validUntil && (
            <div className="text-xs text-slate-500">
              Valid until {new Date(quotation.validUntil).toLocaleDateString()}
            </div>
          )}
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-600">No quotation draft yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!quotation && (
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              void runAction('Create draft', async () => {
                await createV2QuotationDraft(jwtToken, inquiryId);
              })
            }
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Create draft
          </button>
        )}
        {quotation && !quotation.issuedAt && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void runAction('Price', async () => {
                  await priceV2Quotation(jwtToken, inquiryId);
                })
              }
              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              Price
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void runAction('Approve', async () => {
                  await approveV2Quotation(jwtToken, inquiryId);
                })
              }
              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              Approve
            </button>
            <label className="inline-flex items-center gap-1">
              <span className="sr-only">Return reason</span>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Return reason (required)"
                className="w-44 rounded border border-slate-300 px-2 py-1.5 text-xs"
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void runAction('Return', async () => {
                  await returnV2Quotation(jwtToken, inquiryId, returnReason);
                  setReturnReason('');
                })
              }
              className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              Return
            </button>
            <button
              type="button"
              disabled={loading || !readiness?.ready}
              onClick={() =>
                void runAction('Issue', async () => {
                  await issueV2Quotation(jwtToken, inquiryId);
                })
              }
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Issue
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void runAction('Revise', async () => {
                  await reviseV2Quotation(jwtToken, inquiryId);
                })
              }
              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              Revise
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void openOffer('print', true)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Commercial Offer
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void openOffer('download', true)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export Commercial Offer PDF
            </button>
          </>
        )}
        {quotation?.issuedAt && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void openOffer('print', false)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Final Commercial Offer
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void openOffer('download', false)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export Final Commercial Offer PDF
            </button>
          </>
        )}
      </div>
    </div>
  );
};
