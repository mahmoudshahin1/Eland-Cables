import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, KeyRound, Lock, UserCheck } from 'lucide-react';

interface AccessRestrictedProps {
  moduleName: string;
  requiredRole?: string;
}

export const AccessRestricted: React.FC<AccessRestrictedProps> = ({ moduleName, requiredRole }) => {
  const { currentUser, openLoginModal } = useAuth();

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-red-200 dark:border-red-900/60 max-w-3xl mx-auto text-center space-y-6 my-8 animate-fadeIn">
      <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-950/80 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-lg">
        <ShieldAlert className="h-8 w-8" />
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/80 px-3 py-1 rounded-full border border-red-300 dark:border-red-800">
          SECURITY AUTHORIZATION GUARD
        </span>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Access Restricted: {moduleName}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
          Your active account <strong className="text-slate-900 dark:text-white">({currentUser?.fullName || 'Guest'})</strong> does not have permission policy grants for the <strong className="text-red-600 dark:text-red-400">{moduleName}</strong> module.
        </p>
      </div>

      {currentUser && (
        <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left max-w-md mx-auto space-y-1 text-xs">
          <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
            <span>Logged-In Account:</span>
            <span className="text-blue-600 dark:text-blue-400">{currentUser.fullName}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>User Type:</span>
            <span className="font-semibold capitalize">{currentUser.userType}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Assigned Role:</span>
            <span className="font-semibold">{currentUser.role}</span>
          </div>
        </div>
      )}

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={() => openLoginModal()}
          className="px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-xl transition-all flex items-center space-x-2"
        >
          <KeyRound className="h-4 w-4" />
          <span>Switch Account / Sign In with Authorized Role</span>
        </button>
      </div>
    </div>
  );
};
