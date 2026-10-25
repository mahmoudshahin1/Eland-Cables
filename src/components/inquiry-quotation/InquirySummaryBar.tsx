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
  incoterm?: string | null;
  containerType?: string | null;
}

export const InquirySummaryBar: React.FC<InquirySummaryBarProps> = ({
  summary,
  commercialValue = null,
  recalculationRequired = false,
  freightValue = null,
  grandTotalValue = null,
  incoterm = 'DAP',
  containerType = '20STD',
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

  const hasFreight = freightValue != null && grandTotalValue != null;

  const cards: { label: string; value: string; helper?: string; isHighlight?: boolean }[] = [
    { label: 'Total Lines', value: String(summary.totalLines) },
    { label: 'Total Drums', value: String(summary.totalQty) },
    { label: 'Total Length (m)', value: summary.totalLength.toLocaleString() },
    {
      label: hasFreight ? 'Products Subtotal' : 'Estimated Value',
      value: estimated,
      helper: hasFreight ? 'Ex-Works Cable Value' : undefined,
    },
    ...(hasFreight
      ? [
          {
            label: `Grand Total (${incoterm})`,
            value: `${grandTotalValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} ${summary.currency}`,
            helper: `Incl. $${freightValue.toLocaleString()} Freight (${containerType})`,
            isHighlight: true,
          },
        ]
      : [{ label: 'Commercial Currency', value: summary.currency }]),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
            className={`text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap truncate ${
              card.isHighlight ? 'text-emerald-800 font-bold' : 'text-slate-500'
            }`}
          >
            {card.label}
          </p>
          <p
            className={`text-xl font-bold mt-1 truncate ${
              card.isHighlight ? 'text-emerald-950 font-black' : 'text-brand-800'
            }`}
          >
            {card.value}
          </p>
          {card.helper && (
            <p
              className={`text-[10px] mt-1 truncate ${
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
