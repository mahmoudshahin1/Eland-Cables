import React from 'react';

/**
 * Design-system PageHeader — breadcrumb + title + optional description and
 * right-aligned actions, matching the interior page headers in the UI Kit.
 */
export interface Breadcrumb {
  label: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  breadcrumbs,
  description,
  actions,
  className = '',
}) => (
  <div className={`flex flex-wrap items-start justify-between gap-3 mb-4 ${className}`}>
    <div className="min-w-0">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-slate-400" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>›</span>}
              {crumb.onClick ? (
                <button type="button" onClick={crumb.onClick} className="hover:text-brand-600">
                  {crumb.label}
                </button>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <h1 className="text-[22px] font-bold text-slate-900 mt-1 font-display">{title}</h1>
      {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
