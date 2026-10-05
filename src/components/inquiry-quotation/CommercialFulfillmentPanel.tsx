import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  approveCommercialQuotationApi,
  createSalesAgreementFromQuotationApi,
  createSalesOrderFromQuotationApi,
  fetchQuotation,
  formatFulfillmentError,
  FulfillmentType,
  QuotationFulfillmentDto,
} from '../../services/commercialFulfillmentApiService';
import { INTERNAL_TAB_PATHS } from '../../app/shellRoutes';
import { Button } from '../ui/Button';
import { Field, Select } from '../ui/Form';
import {
  ConfirmCreateDialog,
  DisabledActionHint,
  FulfillmentExceptionAlert,
  IntegrationFutureBadge,
} from '../fulfillment/FulfillmentUi';

interface CommercialFulfillmentPanelProps {
  token: string | null | undefined;
  quotationId?: string | null;
  quotationNumber?: string | null;
  canManage: boolean;
  canApprove: boolean;
  onMessage?: (msg: string) => void;
}

/**
 * Quotation → fulfillment: commercially approve with Direct SO | Sales Agreement,
 * confirm before create, call existing APIs. Business rules stay on the server.
 */
export const CommercialFulfillmentPanel: React.FC<CommercialFulfillmentPanelProps> = ({
  token,
  quotationId,
  quotationNumber,
  canManage,
  canApprove,
  onMessage,
}) => {
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState<QuotationFulfillmentDto | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('DIRECT_ORDER');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; message: string; kind?: string } | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'order' | 'agreement' | null>(null);
  const [createdLinks, setCreatedLinks] = useState<{
    orderId?: string;
    agreementId?: string;
  } | null>(null);

  const key = quotationId || quotationNumber;

  useEffect(() => {
    if (!token || !key) {
      setQuotation(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const q = await fetchQuotation(token, key);
        if (!cancelled) {
          setQuotation(q);
          if (q.fulfillmentType) setFulfillmentType(q.fulfillmentType);
        }
      } catch (err) {
        if (!cancelled) setError(formatFulfillmentError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, key]);

  if (!key || !token) return null;
  if (!canManage && !canApprove) return null;

  const pricingOk = quotation?.commercialPricingStatus === 'PRICING_APPROVED';
  const commerciallyApproved = quotation?.commercialApprovalStatus === 'APPROVED';

  const notify = (msg: string) => {
    setLastResult(msg);
    onMessage?.(msg);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(formatFulfillmentError(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="mt-3 p-3.5 rounded-xl border border-brand-200 bg-brand-50/30 space-y-3 text-xs">
      <div>
        <p className="font-bold text-brand-800">Commercial fulfillment</p>
        <p className="text-slate-600 text-[11px] mt-0.5">
          Choose Direct Sales Order or Sales Agreement after pricing approval. Direct MTS (stock cables, no
          quotation) lives under Sales Orders. D365 remains NOT_IMPLEMENTED / NOT_SENT.
        </p>
      </div>

      {quotation && (
        <div className="flex flex-wrap items-center gap-2 text-slate-600 font-mono">
          <span>
            {quotation.quotationNumber} V{quotation.versionNo}
          </span>
          <span className="text-slate-400">·</span>
          <span>pricing={quotation.commercialPricingStatus || '—'}</span>
          <span className="text-slate-400">·</span>
          <span>commercial={quotation.commercialApprovalStatus || '—'}</span>
          {quotation.fulfillmentType ? (
            <>
              <span className="text-slate-400">·</span>
              <span>{quotation.fulfillmentType}</span>
            </>
          ) : null}
        </div>
      )}

      {!pricingOk && (
        <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Commercial approval unavailable: pricing must be PRICING_APPROVED first.
        </p>
      )}

      {pricingOk && !commerciallyApproved && !canApprove && (
        <DisabledActionHint>
          Direct Sales Order / Sales Agreement unavailable: commercial approval is still pending and you do not have
          approval permission on this quotation.
        </DisabledActionHint>
      )}

      {canApprove && pricingOk && !commerciallyApproved && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Fulfillment path">
            <Select
              value={fulfillmentType}
              onChange={(e) => setFulfillmentType(e.target.value as FulfillmentType)}
              disabled={busy}
            >
              <option value="DIRECT_ORDER">Direct Sales Order</option>
              <option value="SALES_AGREEMENT">Sales Agreement</option>
            </Select>
          </Field>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => setConfirm('approve')}
          >
            Approve commercial…
          </Button>
        </div>
      )}

      {commerciallyApproved && !canManage && (
        <DisabledActionHint>
          Create order/agreement unavailable: Sales manage permission is required after commercial approval.
        </DisabledActionHint>
      )}

      {canManage && commerciallyApproved && quotation?.fulfillmentType === 'DIRECT_ORDER' && (
        <div className="space-y-1.5">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => setConfirm('order')}>
            Create Direct Sales Order…
          </Button>
          <DisabledActionHint>
            Sales Agreement unavailable on this revision: commercially approved as Direct Sales Order (immutable).
          </DisabledActionHint>
        </div>
      )}

      {canManage && commerciallyApproved && quotation?.fulfillmentType === 'SALES_AGREEMENT' && (
        <div className="space-y-1.5">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => setConfirm('agreement')}>
            Create Sales Agreement…
          </Button>
          <DisabledActionHint>
            Direct Sales Order unavailable on this revision: commercially approved as Sales Agreement (immutable). Use
            agreement releases in Sales fulfillment.
          </DisabledActionHint>
        </div>
      )}

      {canManage && canApprove && pricingOk && !commerciallyApproved && (
        <DisabledActionHint>
          Create Direct Sales Order / Sales Agreement unavailable until you complete commercial approval above.
        </DisabledActionHint>
      )}

      {createdLinks?.orderId && (
        <button
          type="button"
          className="text-brand-700 font-semibold hover:underline"
          onClick={() =>
            navigate(`${INTERNAL_TAB_PATHS.sales_orders}?view=orders&id=${encodeURIComponent(createdLinks.orderId!)}`)
          }
        >
          Open sales order workspace →
        </button>
      )}
      {createdLinks?.agreementId && (
        <button
          type="button"
          className="text-brand-700 font-semibold hover:underline block"
          onClick={() =>
            navigate(
              `${INTERNAL_TAB_PATHS.sales_orders}?view=agreements&id=${encodeURIComponent(createdLinks.agreementId!)}`
            )
          }
        >
          Open agreement workspace →
        </button>
      )}

      {error && (
        <FulfillmentExceptionAlert title={error.title} message={error.message} kind={error.kind as never} />
      )}
      {lastResult && (
        <div className="flex flex-wrap items-center gap-2 text-slate-700">
          <span>{lastResult}</span>
          <IntegrationFutureBadge status="NOT_SENT" />
        </div>
      )}

      <ConfirmCreateDialog
        open={confirm === 'approve'}
        title="Confirm commercial approval"
        confirmLabel="Approve"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run(async () => {
            const q = await approveCommercialQuotationApi(token, quotation!.id, fulfillmentType);
            setQuotation(q);
            notify(`Commercially approved as ${q.fulfillmentType}`);
          })
        }
        summary={
          <p>
            Approve <span className="font-mono">{quotation?.quotationNumber}</span> V{quotation?.versionNo} as{' '}
            <strong>{fulfillmentType === 'DIRECT_ORDER' ? 'Direct Sales Order' : 'Sales Agreement'}</strong>.
            Fulfillment type becomes immutable on this revision.
          </p>
        }
      />

      <ConfirmCreateDialog
        open={confirm === 'order'}
        title="Confirm Direct Sales Order"
        confirmLabel="Create sales order"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run(async () => {
            const result = await createSalesOrderFromQuotationApi(token, quotation!.id);
            setCreatedLinks({ orderId: result.salesOrder.id });
            notify(
              `Sales order ${result.salesOrder.salesOrderNumber} created (integration=${result.salesOrder.integrationStatus})`
            );
          })
        }
        summary={
          <p>
            Create EPC sales order from commercially approved quotation{' '}
            <span className="font-mono">{quotation?.quotationNumber}</span> (origin QUOTATION, mode MTO). Commitment is
            created by the server if needed.
          </p>
        }
      />

      <ConfirmCreateDialog
        open={confirm === 'agreement'}
        title="Confirm Sales Agreement"
        confirmLabel="Create agreement"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run(async () => {
            const result = await createSalesAgreementFromQuotationApi(token, quotation!.id);
            setCreatedLinks({ agreementId: result.agreement.id });
            notify(
              `Sales agreement ${result.agreement.agreementNumber} created · remaining ${result.agreement.remainingQuantity}`
            );
          })
        }
        summary={
          <p>
            Create sales agreement from commercially approved quotation{' '}
            <span className="font-mono">{quotation?.quotationNumber}</span>. Releases (and resulting SOs) are managed in
            the Sales fulfillment workspace.
          </p>
        }
      />
    </div>
  );
};
