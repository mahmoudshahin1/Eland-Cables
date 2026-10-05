import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, X } from 'lucide-react';

export function CostingBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'copper' | 'aluminium';
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    success: 'bg-[#E6F4EA] text-[#1E8E3E] border-[#C6E6C6]',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    copper: 'bg-orange-50 text-orange-800 border-orange-200',
    aluminium: 'bg-sky-50 text-sky-800 border-sky-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function CostingCard({
  title,
  subtitle,
  children,
  action,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>
      {(title || action) && (
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-bold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function CostingPageHeader({
  title,
  breadcrumb,
  actions,
}: {
  title: string;
  breadcrumb?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <p className="text-xs text-slate-400">{breadcrumb || 'Costing Configuration'}</p>
        <h1 className="text-[22px] font-bold text-slate-900 mt-1">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CostingToolbar({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 ml-auto">{actions}</div>}
    </div>
  );
}

export function CostingLabeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
      {label}
      {children}
    </label>
  );
}

export function CostingSplit({ table, panel }: { table: React.ReactNode; panel?: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 w-full">{table}</div>
      {panel}
    </div>
  );
}

export function CostingSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[220px] flex-1 max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function CostingBtn({
  variant = 'secondary',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'accent' }) {
  const styles =
    variant === 'primary'
      ? 'bg-brand-600 hover:bg-brand-700 text-white border-transparent'
      : variant === 'accent'
        ? 'bg-accent-500 hover:bg-accent-600 text-white border-transparent'
        : variant === 'ghost'
          ? 'bg-transparent hover:bg-slate-100 text-slate-700 border-transparent'
          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${styles}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CostingTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-auto border border-slate-200 rounded-xl bg-white">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

export function CostingTh({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-[12px] font-semibold text-slate-600 bg-[#F8FAFC] border-b border-slate-200 ${className}`}
    >
      {children}
    </th>
  );
}

export function CostingTd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 border-b border-slate-100 text-slate-800 ${className}`}>{children}</td>;
}

export function CostingSidePanel({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <aside className="w-full lg:w-[340px] shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col max-h-[calc(100vh-8rem)]">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3">{children}</div>
      {footer && <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">{footer}</div>}
    </aside>
  );
}

export function CostingDrawer({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-3">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function CostingField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint}
    </label>
  );
}

export function CostingInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${props.className || ''}`} />;
}

export function CostingSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white ${props.className || ''}`} />;
}

export function pricingCategoryHint(category: string) {
  if (category === 'MARKET_METAL_COPPER') {
    return (
      <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
        ✓ Inquiry Header Copper Price — this material uses the copper price entered on the inquiry header.
      </p>
    );
  }
  if (category === 'MARKET_METAL_ALUMINIUM') {
    return (
      <p className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
        ✓ Inquiry Header Aluminium Price — this material uses the aluminium price entered on the inquiry header.
      </p>
    );
  }
  return (
    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      ✓ Raw Material Master Price — approved price from Raw Material Price master.
    </p>
  );
}

export function statusTone(status?: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const s = (status || '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'READY', 'PASS', 'COMPLETED'].some((x) => s.includes(x))) return 'success';
  if (['PENDING', 'DRAFT', 'UNDER_CREATION', 'UNDER_REVIEW', 'SUBMITTED'].some((x) => s.includes(x))) return 'warning';
  if (['BLOCKED', 'REJECTED', 'FAILED', 'EXPIRED', 'INACTIVE'].some((x) => s.includes(x))) return 'danger';
  if (['NOT_READY'].some((x) => s.includes(x))) return 'danger';
  return 'neutral';
}

export function CostingPagination({
  page,
  pageCount,
  total,
  from,
  to,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-slate-500">
      <span>
        Showing {from} to {to} of {total} entries
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-200 bg-white disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: pageCount }, (_, i) => i + 1)
          .filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 2)
          .reduce<number[]>((acc, n, idx, arr) => {
            if (idx > 0 && n - arr[idx - 1] > 1) acc.push(-n);
            acc.push(n);
            return acc;
          }, [])
          .map((n) =>
            n < 0 ? (
              <span key={`g${n}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                className={`h-8 min-w-8 px-2 rounded text-xs font-semibold ${
                  n === page ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {n}
              </button>
            )
          )}
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-200 bg-white disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function CostingEmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-white">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function CostingTableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden animate-pulse">
      <div className="h-10 bg-slate-100 border-b border-slate-200" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-3 border-b border-slate-100">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="h-3 bg-slate-100 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CostingRowMenu({
  items,
}: {
  items: Array<{ label: string; onClick: () => void; danger?: boolean }>;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="px-1.5 py-0.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute right-0 z-20 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${
                  item.danger ? 'text-red-700' : 'text-slate-700'
                }`}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CostingOptionBBanner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 ${className}`}
    >
      <span className="font-bold shrink-0">Option B</span>
      <p>
        LME / Base Metal Price Only. Premium, Shipping and Clearance are <strong>not</strong> included in Direct Raw
        Material Cost. Landed reference columns are display-only.
      </p>
    </div>
  );
}

export function CostingScrapCallout({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 ${className}`}>
      Scrap rules affect consumption quantities only — they do <strong>not</strong> change Direct RM Cost (Option B).
    </p>
  );
}

export function CostingKpiCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
  subtitle,
  breakdown,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'orange' | 'green' | 'purple' | 'red';
  subtitle?: string;
  breakdown?: React.ReactNode;
}) {
  const tones: Record<string, { icon: string; spark: string }> = {
    blue: { icon: 'bg-blue-50 text-blue-600', spark: 'text-blue-400' },
    orange: { icon: 'bg-orange-50 text-orange-600', spark: 'text-orange-400' },
    green: { icon: 'bg-emerald-50 text-emerald-600', spark: 'text-emerald-400' },
    purple: { icon: 'bg-purple-50 text-purple-600', spark: 'text-purple-400' },
    red: { icon: 'bg-red-50 text-red-600', spark: 'text-red-400' },
  };
  const t = tones[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col min-h-[120px]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-slate-500 leading-tight">{label}</p>
        {Icon && (
          <span className={`h-8 w-8 rounded-lg inline-flex items-center justify-center shrink-0 ${t.icon}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="text-[22px] font-bold text-slate-900 mt-2 leading-none">{value}</p>
      {subtitle && <p className="text-[11px] text-slate-500 mt-1.5">{subtitle}</p>}
      {breakdown}
      <svg className={`mt-auto pt-2 w-full h-6 ${t.spark} opacity-60`} viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
        <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,15 20,12 40,14 60,8 80,10 100,6" />
      </svg>
    </div>
  );
}

export function CostingInfoPanel({
  icon,
  title,
  children,
  tone = 'info',
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  tone?: 'info' | 'success' | 'warning';
}) {
  const tones = {
    info: 'border-blue-100 bg-blue-50/50',
    success: 'border-emerald-100 bg-emerald-50/50',
    warning: 'border-amber-100 bg-amber-50/50',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      </div>
      <div className="text-xs text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}

export function gateStatusBadge(status: 'PASS' | 'BLOCKED' | 'WARN' | 'WARNING' | 'FAIL' | 'NOT_VERIFIED' | 'UNSIGNED') {
  if (status === 'PASS') return <CostingBadge tone="success">PASS</CostingBadge>;
  if (status === 'NOT_VERIFIED') return <CostingBadge tone="neutral">Not verified</CostingBadge>;
  if (status === 'UNSIGNED') return <CostingBadge tone="warning">Unsigned</CostingBadge>;
  if (status === 'WARN' || status === 'WARNING') return <CostingBadge tone="warning">WARNING</CostingBadge>;
  return <CostingBadge tone="danger">{status === 'FAIL' ? 'FAIL' : 'BLOCKED'}</CostingBadge>;
}
