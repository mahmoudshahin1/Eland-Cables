import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isDemoAuthenticationAllowed } from '../../domain/demoAuth';
import { EnergyaLogo } from '../common/EnergyaLogo';
import {
  Lock,
  Globe,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  X,
} from 'lucide-react';
import { UserAccount, PlatformMode, InternalPortalTab } from '../../types';
import { LOGIN_PORTAL_CONFIG, LoginPortalKind } from '../../auth/loginRoutes';
import { isPostLoginBlocked, resolvePostLoginDestination } from '../../app/shellRoutes';
import { JwtClaimsInspector } from './JwtClaimsInspector';
import { RegisterForm } from './RegisterForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { RoleManagementView } from './RoleManagementView';
import { DotNetArchitectureViewer } from './DotNetArchitectureViewer';

interface LoginModalProps {
  onSelectPlatformMode?: (mode: PlatformMode) => void;
  onSelectInternalTab?: (tab: InternalPortalTab) => void;
  isStandalonePage?: boolean;
  loginPortal?: LoginPortalKind;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onSelectPlatformMode,
  isStandalonePage = false,
  loginPortal,
}) => {
  const navigate = useNavigate();
  const portalConfig = loginPortal ? LOGIN_PORTAL_CONFIG[loginPortal] : null;
  const {
    isLoginModalOpen,
    closeLoginModal,
    usersList,
    loginAsUser,
    loginWithJwt,
    activeAuthView,
    setActiveAuthView,
    jwtToken,
    logout,
  } = useAuth();

  const demoAuthEnabled = isDemoAuthenticationAllowed((import.meta as { env?: { PROD?: boolean } }).env?.PROD ? 'production' : process.env.NODE_ENV);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState<boolean>(false);
  const [selectedUserAccount, setSelectedUserAccount] = useState<string>(
    demoAuthEnabled ? LOGIN_PORTAL_CONFIG.admin.defaultEmail : 'custom'
  );
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [emailInput, setEmailInput] = useState<string>(
    demoAuthEnabled ? LOGIN_PORTAL_CONFIG.admin.defaultEmail : ''
  );
  const [passwordInput, setPasswordInput] = useState<string>(
    demoAuthEnabled ? LOGIN_PORTAL_CONFIG.admin.defaultPassword : ''
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleAccountSelectChange = (accountEmail: string) => {
    setSelectedUserAccount(accountEmail);
    if (accountEmail === 'custom') {
      setEmailInput('');
      setPasswordInput('');
      return;
    }
    const foundUser = usersList.find((u) => u.email.toLowerCase() === accountEmail.toLowerCase());
    if (foundUser) {
      setEmailInput(foundUser.email);
      if (foundUser.userType === 'customer') {
        setPasswordInput(foundUser.passwordHash || 'Customer@2026!');
      } else if (foundUser.email.includes('sales')) {
        setPasswordInput('Sales@2026!');
      } else if (foundUser.email.includes('tech')) {
        setPasswordInput('Tech@2026!');
      } else {
        setPasswordInput(foundUser.passwordHash || 'Admin@2026!');
      }
    } else {
      setEmailInput(accountEmail);
      if (
        accountEmail.includes('customer') ||
        accountEmail.includes('sec') ||
        accountEmail.includes('global') ||
        accountEmail.includes('dewa') ||
        accountEmail.includes('eland') ||
        accountEmail.includes('david')
      ) {
        setPasswordInput('Customer@2026!');
      } else if (accountEmail.includes('sales')) {
        setPasswordInput('Sales@2026!');
      } else if (accountEmail.includes('tech')) {
        setPasswordInput('Tech@2026!');
      } else {
        setPasswordInput('Admin@2026!');
      }
    }
  };

  const handleJwtLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const identifier = emailInput.trim();
    if (!identifier || !passwordInput) {
      setErrorMessage('Enter your email or username and password.');
      return;
    }

    setIsAuthenticating(true);
    const res = await loginWithJwt(identifier, passwordInput, rememberMe);
    setIsAuthenticating(false);

    if (res.success && res.user) {
      const dest = resolvePostLoginDestination(res.user);
      if (isPostLoginBlocked(dest)) {
        const message = dest.message;
        await logout();
        setErrorMessage(message);
        return;
      }
      setSuccessMessage('Signed in. Opening Energya Connect…');
      const user = res.user;
      if (user.userType === 'customer') {
        onSelectPlatformMode?.('customer');
      } else {
        onSelectPlatformMode?.('internal');
      }
      navigate(dest.path, { replace: true });
    } else {
      setErrorMessage(res.message || 'Invalid email or password credentials.');
    }
  };

  const handleQuickSelectUser = (user: UserAccount) => {
    if (!demoAuthEnabled) return;
    const dest = resolvePostLoginDestination(user);
    if (isPostLoginBlocked(dest)) {
      setErrorMessage(dest.message);
      return;
    }
    loginAsUser(user);
    if (user.userType === 'customer') {
      onSelectPlatformMode?.('customer');
    } else {
      onSelectPlatformMode?.('internal');
    }
    navigate(dest.path, { replace: true });
  };

  if (!isStandalonePage && !isLoginModalOpen) return null;

  const shellClass = isStandalonePage
    ? 'min-h-screen w-full bg-white flex flex-col'
    : 'fixed inset-0 z-50 flex flex-col bg-white';

  return (
    <div className={shellClass}>
      {!isStandalonePage && (
        <button
          onClick={closeLoginModal}
          className="absolute top-4 right-4 z-30 p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {activeAuthView !== 'login' ? (
        <div className="flex-1 overflow-y-auto bg-white p-6 md:p-10">
          <button
            onClick={() => setActiveAuthView('login')}
            className="mb-4 text-sm text-brand-600 hover:underline"
          >
            ← Back to sign in
          </button>
          {activeAuthView === 'register' && (
            <RegisterForm
              onSuccess={() => {
                setActiveAuthView('login');
                setSuccessMessage('Registration completed! You can now sign in.');
              }}
              onSwitchToLogin={() => setActiveAuthView('login')}
            />
          )}
          {activeAuthView === 'forgot_password' && (
            <ForgotPasswordForm onSwitchToLogin={() => setActiveAuthView('login')} />
          )}
          {activeAuthView === 'role_management' && <RoleManagementView />}
          {activeAuthView === 'dotnet_code' && <DotNetArchitectureViewer />}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          <section className="relative flex flex-col flex-1 bg-white overflow-y-auto">
            <div className="flex justify-end p-5 relative z-10">
              <div className="relative flex items-center gap-3 text-[13px] text-slate-600">
                <button
                  type="button"
                  onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                  className="inline-flex items-center gap-1.5 hover:text-brand-600"
                >
                  <Globe className="h-4 w-4" />
                  English
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <span className="text-slate-400">العربية</span>
                {showLanguageDropdown && (
                  <div className="absolute right-0 top-8 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
                    {['English', 'العربية', 'Français', 'Español'].map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          setSelectedLanguage(lang);
                          setShowLanguageDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-slate-50 ${
                          selectedLanguage === lang ? 'text-brand-600 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 pb-16 relative z-10">
              <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-100 shadow-[0_12px_40px_rgba(15,43,92,0.08)] p-8">
                <EnergyaLogo size="md" className="mb-5" />
                {portalConfig ? (
                  <>
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      {portalConfig.badge}
                    </span>
                    <h2 className={`text-[22px] font-bold text-slate-900 mt-3 ${portalConfig.accentClass}`}>
                      {portalConfig.title}
                    </h2>
                    <p className="text-[13px] text-slate-500 mt-1">{portalConfig.subtitle}</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-[22px] font-bold text-slate-900">
                      Welcome to <span className="text-brand-600">Energya</span>{' '}
                      <span className="text-accent-500">Connect</span>
                    </h2>
                    <p className="text-[13px] text-slate-500 mt-1">Sign in to access your portal</p>
                  </>
                )}

                {errorMessage && (
                  <div role="alert" className="mt-4 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[12px]">
                    {errorMessage}
                  </div>
                )}
                {successMessage && (
                  <div className="mt-4 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[12px] flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {successMessage}
                  </div>
                )}

                <form onSubmit={handleJwtLoginSubmit} className="mt-5 space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      autoComplete="username"
                      required
                      disabled={isAuthenticating}
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Email or Username"
                      aria-invalid={Boolean(errorMessage)}
                      className="w-full border border-slate-200 rounded-lg py-3 pl-10 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600 disabled:bg-slate-50"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      disabled={isAuthenticating}
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Password"
                      aria-invalid={Boolean(errorMessage)}
                      className="w-full border border-slate-200 rounded-lg py-3 pl-10 pr-10 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600 disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-slate-400"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[12px]">
                    <label className="flex items-center gap-2 text-slate-600">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-300 text-brand-600"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveAuthView('forgot_password')}
                      className="text-brand-600 font-medium hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isAuthenticating}
                    className={`w-full py-3 rounded-lg text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${
                      portalConfig?.buttonClass ?? 'bg-brand-600 hover:bg-brand-700'
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                    {isAuthenticating ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>

                <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Secure connection • Your data is protected
                </p>

                {demoAuthEnabled && (
                <details className="mt-5 text-[12px] text-slate-500">
                  <summary className="cursor-pointer font-medium text-brand-600">Development demo accounts (not available in production)</summary>
                    <select
                    value={selectedUserAccount}
                    onChange={(e) => handleAccountSelectChange(e.target.value)}
                    className="mt-2 w-full border border-slate-200 rounded-lg py-2 px-2 text-[12px]"
                  >
                    <option value="admin@energya.com">Admin — admin@energya.com</option>
                    <option value="m.ahmed@energya.com">Sales — m.ahmed@energya.com</option>
                    <option value="t.hasan@energya.com">Technical — t.hasan@energya.com</option>
                    <option value="k.salem@energya.com">Costing — k.salem@energya.com</option>
                    <option value="n.nabil@energya.com">Production — n.nabil@energya.com</option>
                    <option value="david.smith@elandcables.com">ELAND — david.smith@elandcables.com</option>
                    <option value="custom">Type credentials manually</option>
                  </select>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {usersList.slice(0, 8).map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleQuickSelectUser(u)}
                          className="text-left border border-slate-100 rounded-md px-2 py-1 hover:border-brand-600 truncate"
                        >
                          {u.fullName}
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveAuthView('register')}
                    className="mt-2 text-brand-600 hover:underline"
                  >
                    Register a new user
                  </button>
                  {jwtToken && (
                    <div className="mt-2">
                      <JwtClaimsInspector />
                    </div>
                  )}
                </details>
                )}
              </div>
            </div>

            <div className="px-6 pb-4 flex items-center justify-between text-[11px] text-slate-400 relative z-10">
              <span>© 2026 Energya Cables. All rights reserved.</span>
              <span>Version 1.0.0</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
