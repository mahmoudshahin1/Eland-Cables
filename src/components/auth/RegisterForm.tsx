import React, { useState } from 'react';
import { User, Mail, Lock, Building, Briefcase, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface RegisterFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const { registerWithJwt, rolesList } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [department, setDepartment] = useState('Commercial');
  const [userType, setUserType] = useState<'customer' | 'internal'>('customer');
  const [role, setRole] = useState('Key Account Client');
  
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password strength check
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const isPasswordStrong = hasMinLength && hasNumber && hasSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!isPasswordStrong) {
      setError('Password does not meet security requirements (min 8 chars, 1 number, 1 special char).');
      return;
    }

    setIsSubmitting(true);
    const result = await registerWithJwt({
      fullName,
      email,
      password,
      companyName,
      department,
      role,
      userType,
    });

    setIsSubmitting(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.message || 'Registration failed');
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 p-4 rounded-2xl border border-blue-500/20 text-blue-200">
        <h3 className="font-bold text-sm text-white flex items-center">
          <ShieldCheck className="h-4 w-4 mr-1.5 text-blue-400" />
          Create New .NET 9 Identity User Account
        </h3>
        <p className="text-xs text-slate-300 mt-0.5">
          Registers user credentials into SQL Server ASP.NET Identity database and issues JWT Access & Refresh Tokens.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Account Type Selector */}
        <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setUserType('customer');
              setRole('Key Account Client');
            }}
            className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center space-x-1.5 transition-all ${
              userType === 'customer'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building className="h-3.5 w-3.5" />
            <span>Customer Portal Account</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setUserType('internal');
              setRole('Senior Sales Representative');
            }}
            className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center space-x-1.5 transition-all ${
              userType === 'internal'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Internal Enterprise Staff</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Full Name */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Eng. Mohamed Al-Otaibi"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">Corporate Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="m.otaibi@company.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Company Name */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">Company / Organization</label>
            <div className="relative">
              <Building className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Saudi Electricity Co. / Energya"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Department / Role */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">System Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {rolesList.length > 0 ? (
                rolesList.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name} ({r.userType})
                  </option>
                ))
              ) : (
                <>
                  <option value="Key Account Client">Key Account Client (Customer)</option>
                  <option value="Senior Sales Representative">Senior Sales Representative</option>
                  <option value="Technical Office Manager">Technical Office Manager</option>
                  <option value="System Administrator">System Administrator</option>
                </>
              )}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Password */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Password Strength Checklist */}
        <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1 text-[11px]">
          <span className="text-slate-400 font-bold block">Password Requirements:</span>
          <div className="grid grid-cols-3 gap-1">
            <span className={`flex items-center space-x-1 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="h-3 w-3" />
              <span>Min 8 chars</span>
            </span>
            <span className={`flex items-center space-x-1 ${hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="h-3 w-3" />
              <span>Contains number</span>
            </span>
            <span className={`flex items-center space-x-1 ${hasSpecial ? 'text-emerald-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="h-3 w-3" />
              <span>Special symbol</span>
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
        >
          <span>{isSubmitting ? 'Registering User in .NET 9...' : 'Complete Registration & Obtain JWT'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="text-center pt-2">
        <button
          onClick={onSwitchToLogin}
          className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
        >
          Already have an account? Sign In here
        </button>
      </div>
    </div>
  );
};
