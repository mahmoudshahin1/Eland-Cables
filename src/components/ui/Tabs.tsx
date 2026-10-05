import React from 'react';

/**
 * Design-system Tabs — a horizontal, underline-style tab bar (controlled).
 * Keeps state in the parent so it composes with routing or local state
 * without imposing a router dependency.
 */
export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ items, activeId, onChange, className = '' }) => (
  <div role="tablist" className={`flex items-center gap-1 border-b border-slate-200 ${className}`}>
    {items.map((item) => {
      const active = item.id === activeId;
      const Icon = item.icon;
      return (
        <button
          key={item.id}
          role="tab"
          aria-selected={active}
          disabled={item.disabled}
          type="button"
          onClick={() => onChange(item.id)}
          className={[
            'inline-flex items-center gap-1.5 px-3 py-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors',
            'disabled:opacity-40 disabled:pointer-events-none',
            active
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          ].join(' ')}
        >
          {Icon ? <Icon className="h-4 w-4" /> : null}
          {item.label}
        </button>
      );
    })}
  </div>
);
