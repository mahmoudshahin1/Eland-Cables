import React from 'react';

/**
 * Design-system MobileBottomNav — the fixed bottom tab bar shown in the
 * mobile dashboard of the approved UI Kit. Fixed to the viewport bottom,
 * hidden on md+ breakpoints (`md:hidden`). Controlled via `activeId`.
 *
 * Not wired into any route yet; it's a presentational primitive that a later
 * approved phase can connect to navigation.
 */
export interface MobileNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}

export interface MobileBottomNavProps {
  items: MobileNavItem[];
  activeId: string;
  className?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  items,
  activeId,
  className = '',
}) => (
  <nav
    aria-label="Primary"
    className={`fixed inset-x-0 bottom-0 z-40 md:hidden bg-white border-t border-slate-200 shadow-[0_-2px_12px_rgba(10,31,66,0.08)] ${className}`}
  >
    <ul className="flex items-stretch justify-around">
      {items.map((item) => {
        const active = item.id === activeId;
        const Icon = item.icon;
        return (
          <li key={item.id} className="flex-1">
            <button
              type="button"
              onClick={item.onClick}
              aria-current={active ? 'page' : undefined}
              className={[
                'w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors',
                active ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600',
              ].join(' ')}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{item.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);
