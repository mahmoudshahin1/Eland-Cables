import React from 'react';
import { X } from 'lucide-react';

/**
 * Design-system overlays: Modal (centered dialog) and Drawer (right side sheet),
 * both with a consistent header (title + close) and optional footer.
 * Rendering is null when `open` is false; nothing is portalled to keep this
 * self-contained and dependency-free.
 */
export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Max width class for the modal panel (Modal only). */
  widthClassName?: string;
}

const CloseButton: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <button
    type="button"
    onClick={onClose}
    aria-label="Close"
    className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800"
  >
    <X className="h-5 w-5" />
  </button>
);

export const ModalHeader: React.FC<{ title?: React.ReactNode; onClose: () => void }> = ({
  title,
  onClose,
}) => (
  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
    <h2 className="font-bold text-slate-900 font-display">{title}</h2>
    <CloseButton onClose={onClose} />
  </div>
);

export const Modal: React.FC<OverlayProps> = ({
  open,
  onClose,
  title,
  footer,
  children,
  widthClassName = 'max-w-lg',
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${widthClassName} bg-white rounded-2xl shadow-[var(--shadow-overlay)] flex flex-col max-h-[calc(100vh-2rem)]`}
      >
        <ModalHeader title={title} onClose={onClose} />
        <div className="flex-1 overflow-auto p-5 space-y-3">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
};

export const Drawer: React.FC<OverlayProps> = ({ open, onClose, title, footer, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md bg-white h-full shadow-[var(--shadow-overlay)] flex flex-col">
        <ModalHeader title={title} onClose={onClose} />
        <div className="flex-1 overflow-auto p-5 space-y-3">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
};
