import React from 'react';

export type DashboardStatIcon = React.ComponentType<{ className?: string }>;

export interface DashboardStatCardProps {
  icon?: DashboardStatIcon;
  label: string;
  value: React.ReactNode;
  onViewAll?: () => void;
  viewAllLabel?: string;
  subtitle?: React.ReactNode;
  selected?: boolean;
  className?: string;
  /** Compact is for dense costing dashboards; other screens keep the default size. */
  size?: 'default' | 'compact';
}

export const DashboardStatCard: React.FC<DashboardStatCardProps> = ({
  icon: Icon,
  label,
  value,
  onViewAll,
  viewAllLabel = 'View all',
  subtitle,
  selected = false,
  className = '',
  size = 'default',
}) => {
  const compact = size === 'compact';

  return (
    <div
      className={`bg-white border rounded-lg shadow-[0_1px_3px_rgba(15,23,42,0.06)] flex flex-col h-full w-full min-w-0 ${
        compact ? 'px-2.5 py-2 min-h-[132px]' : 'px-3 py-3 min-h-[112px]'
      } ${selected ? 'border-[#1D4ED8] ring-1 ring-[#1D4ED8]' : 'border-[#e0e0e0]'} ${className}`}
    >
      <div
        className={`flex items-center gap-1.5 min-w-0 ${compact ? 'h-4' : 'min-h-[1.125rem]'}`}
      >
        {Icon ? (
          <Icon
            className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-brand-800 stroke-[1.5] shrink-0`}
            aria-hidden
          />
        ) : null}
        <h3
          className={`${compact ? 'text-[12px] truncate' : 'text-[13px]'} font-semibold text-brand-800 leading-tight`}
          title={label}
        >
          {label}
        </h3>
      </div>
      {onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className={`${compact ? 'text-[18px] mt-1' : 'text-[24px] mt-2'} leading-none font-bold text-brand-800 text-left break-words hover:opacity-80`}
        >
          {value ?? '—'}
        </button>
      ) : (
        <p
          className={`${compact ? 'text-[18px] mt-1' : 'text-[24px] mt-2'} leading-none font-bold text-brand-800 break-words`}
        >
          {value ?? '—'}
        </p>
      )}
      {subtitle ? (
        <div className={`${compact ? 'text-[11px] mt-1 space-y-0' : 'text-[12px] mt-1.5 space-y-0.5'} text-slate-500`}>
          {subtitle}
        </div>
      ) : null}
      {onViewAll ? (
        <div className={`${compact ? 'mt-auto pt-1.5' : 'mt-auto pt-2'} flex justify-end`}>
          <button
            type="button"
            onClick={onViewAll}
            className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-medium text-[#1D4ED8] hover:underline`}
          >
            {viewAllLabel}
          </button>
        </div>
      ) : (
        <div className="mt-auto" />
      )}
    </div>
  );
};
