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
  freightValue?: number | null;
  grandTotalValue?: number | null;
  totalsPending?: boolean;
  incoterm?: string | null;
  containerType?: string | null;
}

export const InquirySummaryBar: React.FC<InquirySummaryBarProps> = ({
  summary,
  commercialValue = null,
  recalculationRequired = false,
  freightValue = null,
  grandTotalValue = null,
  totalsPending = false,
  incoterm = 'DAP',
  containerType = '20STD',
}) => {
  const estimated = totalsPending
    ? '—'
    : recalculationRequired
      ? '— Recalculation Required'
      : commercialValue == null
        ? '—'
        : `${commercialValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${summary.currency}`;

  const hasFreight = totalsPending || (freightValue != null && grandTotalValue != null);

  const cards: { label: string; value: string; helper?: string; isHighlight?: boolean }[] = [
    { label: 'Total Lines', value: String(summary.totalLines) },
    { label: 'Total Drums', value: String(summary.totalQty) },
    { label: 'Total Length (m)', value: summary.totalLength.toLocaleString() },
    {
      label: hasFreight ? 'Products Subtotal' : 'Estimated Value',
      value: estimated,
      helper: totalsPending ? 'Recalculate to update totals' : hasFreight ? 'Ex-Works Cable Value' : undefined,
    },
    ...(hasFreight
      ? [
          {
            label: `Grand Total (${incoterm})`,
            value: totalsPending
              ? '—'
              : `${grandTotalValue!.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ${summary.currency}`,
            helper: totalsPending
              ? 'Recalculate to update totals'
              : `Incl. $${freightValue!.toLocaleString()} Freight (${containerType})`,
            isHighlight: true,
          },
        ]
      : [{ label: 'Commercial Currency', value: summary.currency }]),
  ];

  return (
    <div
      className={`grid gap-3 ${
        hasFreight
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-[minmax(80px,0.6fr)_minmax(80px,0.6fr)_minmax(110px,0.9fr)_minmax(180px,1.4fr)_minmax(220px,1.6fr)]'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
      }`}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-3.5 shadow-sm flex flex-col justify-between ${
            card.isHighlight
              ? 'bg-gradient-to-b from-white to-emerald-50/50 border-emerald-300'
              : 'border-slate-200 bg-white'
          }`}
        >
          <p
            className={`text-[11px] font-semibold uppercase tracking-wider leading-tight ${
              card.isHighlight ? 'text-emerald-800 font-bold' : 'text-slate-500'
            }`}
          >
            {card.label}
          </p>
          <p
            className={`text-xl font-bold mt-1 whitespace-nowrap ${
              card.isHighlight ? 'text-emerald-950 font-black' : 'text-brand-800'
            }`}
          >
            {card.value}
          </p>
          {card.helper && (
            <p
              className={`text-[10px] mt-1 break-words ${
                card.isHighlight ? 'text-emerald-700 font-medium' : 'text-slate-400'
              }`}
            >
              {card.helper}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};
