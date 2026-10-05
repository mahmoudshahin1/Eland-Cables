import React from 'react';

/**
 * Cable cross-section glyph (conductor + insulation + sheath rings).
 * Lucide has no cable-manufacturing cross-section, so this is a bespoke
 * outline icon that follows the same 24×24 / currentColor / stroke-1.5
 * conventions as the rest of the icon system.
 */
export const CableCrossSectionIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  function CableCrossSectionIcon({ className, ...props }, ref) {
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
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5.5" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21" />
      </svg>
    );
  }
);
