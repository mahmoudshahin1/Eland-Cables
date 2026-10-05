import React from 'react';

/** Lucide has no cable-reel / wooden drum; used on drum KPI cards. */
export const WoodenDrumIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  function WoodenDrumIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
        {...props}
      >
        <ellipse cx="7" cy="12" rx="3.25" ry="7" />
        <ellipse cx="17" cy="12" rx="3.25" ry="7" />
        <path d="M7 5h10M7 19h10M7 12h10" />
        <ellipse cx="7" cy="12" rx="1.15" ry="2.4" />
        <ellipse cx="17" cy="12" rx="1.15" ry="2.4" />
      </svg>
    );
  }
);
