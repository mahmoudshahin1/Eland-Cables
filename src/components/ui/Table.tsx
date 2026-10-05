import React from 'react';

/**
 * Design-system Table primitives — a bordered, rounded container with a
 * light-gray sticky-friendly header, matching the UI Kit tables.
 * Compose as: <Table><THead>…</THead><TBody>…</TBody></Table>.
 */
export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`overflow-auto border border-slate-200 rounded-xl bg-white ${className}`}>
    <table className="min-w-full text-sm">{children}</table>
  </div>
);

export const THead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead>{children}</thead>
);

export const TBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody>{children}</tbody>
);

export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className = '', ...props }) => (
  <tr className={className} {...props} />
);

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <th
    className={`px-3 py-2.5 text-left text-[12px] font-semibold text-slate-600 bg-[var(--color-surface-subtle)] border-b border-slate-200 ${className}`}
  >
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <td className={`px-3 py-2.5 border-b border-slate-100 text-slate-800 ${className}`}>{children}</td>;
