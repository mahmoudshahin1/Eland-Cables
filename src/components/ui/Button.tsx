import React from 'react';

/**
 * Design-system Button — Primary / Secondary / Tertiary per the approved UI Kit.
 *
 *  - primary   → solid brand navy, white text (the "Primary Button" in the kit)
 *  - secondary → outlined brand navy on white (the "Secondary Button")
 *  - tertiary  → text-only / ghost brand link (the "Tertiary Button")
 *  - accent    → solid vermilion, for destructive/high-emphasis CTAs
 *
 * This is the forward-looking single source of truth. `CostingBtn` in
 * CostingUiPrimitives remains as-is for existing pages; this component is
 * NOT yet wired into any business page.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon component (24×24 currentColor). */
  leadingIcon?: React.ComponentType<{ className?: string }>;
  /** Optional trailing icon component. */
  trailingIcon?: React.ComponentType<{ className?: string }>;
  block?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white border-transparent shadow-sm',
  secondary: 'bg-white hover:bg-brand-50 text-brand-600 border-brand-300',
  tertiary: 'bg-transparent hover:bg-brand-50 text-brand-600 border-transparent',
  accent: 'bg-accent-500 hover:bg-accent-600 active:bg-accent-700 text-white border-transparent shadow-sm',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

const iconSize: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4.5 w-4.5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    leadingIcon: Leading,
    trailingIcon: Trailing,
    block = false,
    className = '',
    type = 'button',
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'inline-flex items-center justify-center rounded-lg border font-semibold',
        'font-display transition-colors disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1',
        variantClasses[variant],
        sizeClasses[size],
        block ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {Leading ? <Leading className={iconSize[size]} /> : null}
      {children}
      {Trailing ? <Trailing className={iconSize[size]} /> : null}
    </button>
  );
});
