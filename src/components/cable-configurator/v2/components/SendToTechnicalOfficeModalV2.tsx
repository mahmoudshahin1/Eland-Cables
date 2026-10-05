import React, { useState } from 'react';
import {
  X,
  Send,
  Building2,
  User,
  Mail,
  FileText,
  CheckCircle2,
  Cpu,
  Layers,
} from 'lucide-react';
import { SelectionStateV2, TechnicalCableRequest } from '../types';
import { createTechnicalCableRequestFromSelections } from '../services/technicalOfficeServiceV2';
import { useAuth } from '../../../../context/AuthContext';
import { Button } from '../../../ui/Button';
import { Badge, StatusBadge } from '../../../ui/Badge';
import { Field, Input, Textarea } from '../../../ui/Form';

interface SendToTechnicalOfficeModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  selections: SelectionStateV2;
  summaryDescription: string;
  estimatedDiameterMm: number;
  estimatedWeightKgKm: number;
  onRequestSubmitted?: (tcr: TechnicalCableRequest) => void;
}

export const SendToTechnicalOfficeModalV2: React.FC<SendToTechnicalOfficeModalV2Props> = ({
  isOpen,
  onClose,
  selections,
  summaryDescription,
  estimatedDiameterMm,
  estimatedWeightKgKm,
  onRequestSubmitted,
}) => {
  const { currentUser, jwtToken } = useAuth();

  const [name, setName] = useState(currentUser?.userName || 'Lead Engineer');
  const [email, setEmail] = useState(currentUser?.email || 'engineer@energya.com');
  const [company, setCompany] = useState(currentUser?.companyName || 'Eland Cables Ltd');
  const [technicalNotes, setTechnicalNotes] = useState('');
  const [submittedTCR, setSubmittedTCR] = useState<TechnicalCableRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const tcr = createTechnicalCableRequestFromSelections(
        selections,
        { name, email, company },
        technicalNotes
      );
      fetch('/api/technical-office/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({
          requestNumber: tcr.requestNumber,
          status: tcr.status,
          configuration: selections,
          customer: tcr.customerCode || company,
          quantity: selections.cuttingLength ? undefined : undefined,
          cuttingLength: selections.cuttingLength,
          requestedDate: tcr.requestDate,
          requesterName: name,
          requesterEmail: email,
          reason: technicalNotes || 'Valid engineering configuration — Cable Master record not found.',
        }),
      }).catch(() => undefined);
      setSubmittedTCR(tcr);
      if (onRequestSubmitted) {
        onRequestSubmitted(tcr);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmittedTCR(null);
    setTechnicalNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-brand-500 text-white flex items-center justify-between border-b border-brand-600">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight font-display">
                  Send to Technical Office
                </h3>
                <Badge tone="warning" className="font-extrabold uppercase">
                  New Cable Design
                </Badge>
              </div>
              <p className="text-xs text-brand-100">
                Submit valid engineering configuration for Technical Office review and Cable Master creation.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {submittedTCR ? (
            <div className="text-center py-4 space-y-4 animate-fade-in">
              <div className="w-14 h-14 bg-success-50 dark:bg-emerald-950/60 border border-success-200 dark:border-emerald-800 rounded-full flex items-center justify-center mx-auto text-success-500 shadow-sm">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                  Technical Request Submitted Successfully!
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Your request has been routed to the Technical Office governance queue.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-left max-w-lg mx-auto space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Technical Request Number (TCR):</span>
                  <span className="text-sm font-bold text-brand-600 dark:text-brand-400 font-mono">
                    {submittedTCR.requestNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Temporary Technical ID:</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                    {submittedTCR.temporaryTechnicalId}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Current Status:</span>
                  <StatusBadge status={submittedTCR.status} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Configured Technical Description:
                  </span>
                  <p className="text-xs font-mono bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 leading-relaxed">
                    {submittedTCR.generatedDescription}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button variant="primary" size="md" onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Technical Summary Header */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400 tracking-wider uppercase flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> Technical Construction
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Estimated Ø {estimatedDiameterMm} mm • {estimatedWeightKgKm} kg/km
                  </span>
                </div>
                <p className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 leading-relaxed">
                  {summaryDescription}
                </p>
              </div>

              {/* Requester Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Requester Name" required>
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>

                <Field label="Requester Email" required>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Client / Company Name" required>
                    <Input
                      type="text"
                      required
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              {/* Technical & Project Notes */}
              <div>
                <Field label="Project & Engineering Notes" hint="Specify installation conditions (duct, direct buried, tray), required testing standards, drum lengths, or project specs">
                  <Textarea
                    rows={3}
                    value={technicalNotes}
                    onChange={(e) => setTechnicalNotes(e.target.value)}
                    placeholder="Enter special technical requirements or notes..."
                  />
                </Field>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" size="md" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={isSubmitting}
                  leadingIcon={Send}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit to Technical Office'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
