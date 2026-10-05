import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import type { VipCalculateResultDto } from '../../services/v2InquiryConfigurationApiService';

type StageState = 'pending' | 'pass' | 'fail' | 'warn';

function stageFromResult(result: VipCalculateResultDto | null, loading: boolean): Array<{
  id: string;
  label: string;
  detail: string;
  state: StageState;
}> {
  if (loading) {
    return [
      { id: 'run', label: 'Processing inquiry', detail: 'Validating engineering and commercial lineage.', state: 'pending' },
    ];
  }
  if (!result) return [];

  const engineeringFailed = result.status === 'BLOCKED';
  const costingFailed = result.status === 'PARTIAL';
  const offerBlocked = result.status === 'QUOTATION_BLOCKED';
  const passed = result.status === 'COMPLETED' && Boolean(result.financialOffer);
  const quote = passed ? result.quotation : null;
  const offer = passed ? result.financialOffer : null;

  return [
    {
      id: 'engineering',
      label: 'Engineering validation',
      detail: engineeringFailed
        ? result.blockingReasons[0] || 'Engineering checks did not pass.'
        : 'Cable configuration, cutting plan, and drum plan were validated.',
      state: engineeringFailed ? 'fail' : 'pass',
    },
    {
      id: 'costing',
      label: 'Cost calculation',
      detail: costingFailed
        ? result.blockingReasons[0] || 'Costing could not complete.'
        : passed || offerBlocked
          ? 'Cost calculated successfully.'
          : 'Waiting for engineering to pass.',
      state: engineeringFailed ? 'pending' : costingFailed ? 'fail' : passed || offerBlocked ? 'pass' : 'pending',
    },
    {
      id: 'pricing',
      label: 'Pricing',
      detail: passed || offerBlocked ? 'Commercial price calculated.' : costingFailed || engineeringFailed ? 'Not started.' : 'Waiting.',
      state: passed || offerBlocked ? 'pass' : costingFailed || engineeringFailed ? 'pending' : 'pending',
    },
    {
      id: 'offer',
      label: 'Financial offer',
      detail: offer
        ? `Financial offer generated${offer.inquiryTotal ? ` · ${offer.inquiryTotal}` : ''}.`
        : offerBlocked
          ? result.blockingReasons[0] || 'Financial offer could not be generated.'
          : passed
            ? 'Waiting.'
            : 'Waiting.',
      state: offer ? 'pass' : offerBlocked ? 'fail' : 'pending',
    },
    {
      id: 'quotation',
      label: 'Quotation',
      detail: quote
        ? `Quotation ${quote.quotationNumber} created. Approval and issue remain governed.`
        : offerBlocked
          ? 'Quotation was not issued as generated because the financial offer snapshot was not created.'
          : 'Waiting.',
      state: quote ? 'pass' : offerBlocked ? 'fail' : 'pending',
    },
  ];
}

export function InquiryAutomaticProcessingPanel(props: {
  result: VipCalculateResultDto | null;
  loading?: boolean;
  customerSafe?: boolean;
  onViewQuotation?: () => void;
}) {
  const stages = stageFromResult(props.result, Boolean(props.loading));
  if (stages.length === 0) return null;

  const customerStages = props.customerSafe
    ? stages.map((stage) =>
        stage.id === 'costing'
          ? { ...stage, label: 'Commercial calculation', detail: stage.state === 'pass' ? 'Commercial calculation completed.' : stage.detail }
          : stage
      )
    : stages;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" aria-label="Inquiry processing">
      <h3 className="font-display text-base font-bold text-slate-900">Processing inquiry</h3>
      <ul className="space-y-2">
        {customerStages.map((stage) => (
          <li key={stage.id} className="flex items-start gap-3 text-sm">
            {stage.state === 'pass' ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
            ) : stage.state === 'fail' ? (
              <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
            ) : stage.state === 'warn' ? (
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            ) : (
              <Loader2 className={`h-4 w-4 mt-0.5 text-slate-400 shrink-0 ${props.loading ? 'animate-spin' : ''}`} />
            )}
            <div>
              <p className="font-semibold text-slate-800">{stage.label}</p>
              <p className="text-xs text-slate-500">{stage.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {props.result?.status === 'COMPLETED' && props.result.quotation && props.result.financialOffer && props.onViewQuotation && (
        <button
          type="button"
          onClick={props.onViewQuotation}
          className="mt-2 inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-700"
        >
          View quotation
        </button>
      )}
    </section>
  );
}
