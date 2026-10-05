import React from 'react';

/**
 * Design-system Card — white surface, subtle navy-tinted shadow, rounded-xl,
 * matching the UI Kit cards. Optional header (title/subtitle/action) and footer.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  /** Remove inner body padding (e.g. when embedding a full-bleed table). */
  flushBody?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  footer,
  flushBody = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-[var(--shadow-card)] ${className}`}
      {...props}
    >
      {(title || action) && (
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-bold text-slate-900 font-display truncate">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={flushBody ? '' : 'p-4'}>{children}</div>
      {footer && <div className="px-4 py-3 border-t border-slate-100">{footer}</div>}
    </div>
  );
};
