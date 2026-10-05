import React from 'react';

export interface InquirySummaryData {
  totalLines: number;
  totalQty: number;
  totalLength: number;
  currency: string;
  estimatedValue: number | null;
}

interface InquirySummaryBarProps {
  summary: InquirySummaryData;
  commercialValue?: number | null;
  recalculationRequired?: boolean;
}

export const InquirySummaryBar: React.FC<InquirySummaryBarProps> = ({
  summary,
  commercialValue = null,
  recalculationRequired = false,
}) => {
  const estimated =
    recalculationRequired
      ? '— Recalculation Required'
      : commercialValue == null
        ? '—'
        : `${commercialValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${summary.currency}`;
  const cards: { label: string; value: string }[] = [
    { label: 'Total Lines', value: String(summary.totalLines) },
    { label: 'Total Drums', value: String(summary.totalQty) },
    { label: 'Total Length (m)', value: summary.totalLength.toLocaleString() },
    {
      label: 'Estimated Value',
      value: estimated,
    },
    { label: 'Commercial Currency', value: summary.currency },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 p-3.5 bg-white shadow-sm flex flex-col justify-between"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
            {card.label}
          </p>
          <p className="text-xl font-bold text-brand-800 mt-1 truncate">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
};
