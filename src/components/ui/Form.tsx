import React from 'react';

/**
 * Design-system form controls: Field wrapper, Input, Select, Textarea.
 * Consistent border/radius/typography with the UI Kit. Field renders a label,
 * optional required marker, and hint/error text.
 */
export interface FieldProps {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  label,
  required,
  hint,
  error,
  htmlFor,
  className = '',
  children,
}) => (
  <div className={`block space-y-1 ${className}`}>
    <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-700">
      {label}
      {required && <span className="text-error-500"> *</span>}
    </label>
    {children}
    {error ? (
      <p className="text-[11px] text-error-600">{error}</p>
    ) : hint ? (
      <p className="text-[11px] text-slate-500">{hint}</p>
    ) : null}
  </div>
);

const controlBase =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 ' +
  'placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-brand-300 focus-visible:border-brand-400 disabled:bg-slate-50 disabled:opacity-70';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${controlBase} ${className}`} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', ...props }, ref) {
    return <select ref={ref} className={`${controlBase} ${className}`} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`${controlBase} ${className}`} {...props} />;
});
