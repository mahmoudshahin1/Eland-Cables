import React, { useState } from 'react';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { visibleProfileFields } from '../../domain/userProfileView';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';
import { CustomerPageHero } from '../customer/CustomerPageHero';

export const UserProfilePage: React.FC = () => {
  const { currentUser, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!currentUser) return null;

  const isCustomer = currentUser.userType === 'customer';
  const fields = visibleProfileFields(currentUser);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }
    setSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setSubmitting(false);
    if (result.success) {
      setStatusMessage(result.message || 'Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      return;
    }
    setErrorMessage(result.message || 'Failed to change password.');
  };

  return (
    <div className="space-y-6">
      {isCustomer ? (
        <CustomerPageHero
          breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Profile' }]}
          title="Profile"
          subtitle="View your account details and update your password."
        />
      ) : null}
      <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white shrink-0 ${
              isCustomer ? 'bg-brand-800' : 'bg-accent-600'
            }`}
          >
            {currentUser.fullName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Account profile</p>
            {isCustomer ? (
              <p className="text-2xl font-black text-brand-800 tracking-tight truncate">{currentUser.fullName}</p>
            ) : (
              <h1 className="text-2xl font-black text-brand-800 tracking-tight truncate">{currentUser.fullName}</h1>
            )}
            <p className="text-sm text-slate-500 mt-1 truncate">{currentUser.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                <UserRound className="h-3 w-3" />
                {isCustomer ? 'Customer' : 'Internal'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-600/10 text-brand-600">
                <ShieldCheck className="h-3 w-3" />
                {isCustomer ? currentUser.companyName || currentUser.role || 'Customer' : currentUser.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500">Profile details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((field) => (
            <div key={field.key} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{field.label}</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-800 break-words">{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-4 w-4 text-accent-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500">Change password</h2>
        </div>
        <form className="space-y-4 max-w-md" onSubmit={onSubmit}>
          <label className="block text-xs font-bold text-slate-600">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800"
              required
            />
          </label>
          <label className="block text-xs font-bold text-slate-600">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800"
              required
              minLength={8}
            />
          </label>
          <label className="block text-xs font-bold text-slate-600">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800"
              required
              minLength={8}
            />
          </label>
          {errorMessage && <p className="text-xs font-semibold text-red-600">{errorMessage}</p>}
          {statusMessage && <p className="text-xs font-semibold text-emerald-700">{statusMessage}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-accent-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-extrabold"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
};
