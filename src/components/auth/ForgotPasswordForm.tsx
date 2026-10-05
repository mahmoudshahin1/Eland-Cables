import React, { useState } from 'react';
import { KeyRound, Mail, ArrowRight, CheckCircle2, AlertCircle, Copy, ShieldAlert, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ onSwitchToLogin }) => {
  const { forgotPasswordJwt, resetPasswordJwt } = useAuth();
  
  const [step, setStep] = useState<'request' | 'reset_confirm'>('request');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    const res = await forgotPasswordJwt(email);
    setIsSubmitting(false);

    if (res.success && res.resetToken) {
      setResetToken(res.resetToken);
      setStatusMessage(res.message || 'Password reset JWT token generated.');
      setStep('reset_confirm');
    } else {
      setErrorMessage(res.message || 'Error processing password reset');
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long');
      return;
    }

    setIsSubmitting(true);
    const res = await resetPasswordJwt(resetToken, newPassword);
    setIsSubmitting(false);

    if (res.success) {
      setStatusMessage('Password updated successfully! You can now sign in with your new password.');
      setTimeout(() => {
        onSwitchToLogin();
      }, 2000);
    } else {
      setErrorMessage(res.message || 'Failed to update password');
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(resetToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="bg-brand-500/10 p-4 rounded-2xl border border-brand-500/20 text-brand-100">
        <h3 className="font-bold text-sm text-white flex items-center">
          <KeyRound className="h-4 w-4 mr-1.5 text-accent-300" />
          .NET 9 JWT Password Recovery Protocol
        </h3>
        <p className="text-xs text-slate-300 mt-0.5">
          Sends a cryptographically signed password reset JWT token to the user&apos;s registered email address.
        </p>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {statusMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {step === 'request' && (
        <form onSubmit={handleRequestReset} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-300 mb-1">Registered Account Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. admin@energya.com or david.smith@elandcables.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-bold shadow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Generating Reset JWT...' : 'Generate Password Reset JWT Token'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      )}

      {step === 'reset_confirm' && (
        <form onSubmit={handleConfirmReset} className="space-y-4 text-xs">
          {/* Token Box */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
              <span>Generated Reset Token (Expiring in 60 mins):</span>
              <button
                type="button"
                onClick={handleCopyToken}
                className="flex items-center space-x-1 text-accent-300 hover:text-accent-300"
              >
                {copiedToken ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copiedToken ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <input
              type="text"
              readOnly
              value={resetToken}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-accent-300 text-[11px] font-mono outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-300 mb-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold shadow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Updating SQL Database...' : 'Save New Password & Update Identity'}</span>
            <CheckCircle2 className="h-4 w-4" />
          </button>
        </form>
      )}

      <div className="text-center pt-2">
        <button
          onClick={onSwitchToLogin}
          className="text-xs text-slate-400 hover:text-white font-semibold transition-colors"
        >
          Return to Login
        </button>
      </div>
    </div>
  );
};
