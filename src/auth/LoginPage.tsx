import { ComponentType, FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Factory,
  Globe,
  Loader2,
  Lock,
  Mail,
  Monitor,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { isDemoAuthenticationAllowed } from '../domain/demoAuth';
import { ForgotPasswordForm } from '../components/auth/ForgotPasswordForm';
import { JwtClaimsInspector } from '../components/auth/JwtClaimsInspector';
import { isPostLoginBlocked, resolvePostLoginDestination } from '../app/shellRoutes';
import { UserAccount } from '../types';
import { LOGIN_PORTAL_CONFIG } from './loginRoutes';

const LOGIN_HERO_IMAGE = '/login-cables.jpg';
const FUTURE_LANGUAGES = ['English', 'العربية', 'Français'] as const;
const DEMO_DEFAULT_EMAIL = LOGIN_PORTAL_CONFIG.admin.defaultEmail;
const DEMO_DEFAULT_PASSWORD = LOGIN_PORTAL_CONFIG.admin.defaultPassword;

function safeRedirectFrom(from: unknown): string | null {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null;
  if (from.startsWith('/login')) return null;
  if (from.startsWith('/customer') || from.startsWith('/internal')) return from;
  return null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    usersList,
    loginAsUser,
    loginWithJwt,
    logout,
    jwtToken,
    activeAuthView,
    setActiveAuthView,
  } = useAuth();

  const demoAuthEnabled = isDemoAuthenticationAllowed(
    (import.meta as { env?: { PROD?: boolean } }).env?.PROD ? 'production' : process.env.NODE_ENV
  );

  const [email, setEmail] = useState(() => (demoAuthEnabled ? DEMO_DEFAULT_EMAIL : ''));
  const [password, setPassword] = useState(() => (demoAuthEnabled ? DEMO_DEFAULT_PASSWORD : ''));
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedUserAccount, setSelectedUserAccount] = useState<string>(
    demoAuthEnabled ? DEMO_DEFAULT_EMAIL : 'custom'
  );
  const [language, setLanguage] = useState<(typeof FUTURE_LANGUAGES)[number]>('English');
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageMenuId = useId();
  const languageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    const dest = resolvePostLoginDestination(currentUser);
    if (!isPostLoginBlocked(dest)) return;
    const message = dest.message;
    void (async () => {
      await logout();
      setError(message);
    })();
  }, [currentUser, logout]);

  useEffect(() => {
    if (!languageOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!languageRef.current?.contains(event.target as Node)) setLanguageOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLanguageOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [languageOpen]);

  const finishLogin = async (user: UserAccount) => {
    const dest = resolvePostLoginDestination(user);
    if (isPostLoginBlocked(dest)) {
      const message = dest.message;
      await logout();
      setError(message);
      return;
    }
    const from = safeRedirectFrom((location.state as { from?: string } | null)?.from);
    const compatibleFrom =
      from &&
      ((user.userType === 'customer' && from.startsWith('/customer')) ||
        (user.userType === 'internal' && (from.startsWith('/internal') || from.startsWith('/v2'))))
        ? from
        : null;
    navigate(compatibleFrom ?? dest.path, { replace: true });
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const identifier = email.trim();
    if (!identifier || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    const res = await loginWithJwt(identifier, password, rememberMe);
    setLoading(false);
    if (res.success && res.user) {
      await finishLogin(res.user);
    } else {
      setError(res.message || 'Invalid email or password.');
    }
  }

  const handleAccountSelectChange = (accountEmail: string) => {
    setSelectedUserAccount(accountEmail);
    if (accountEmail === 'custom') {
      setEmail('');
      setPassword('');
      return;
    }
    const foundUser = usersList.find((u) => u.email.toLowerCase() === accountEmail.toLowerCase());
    if (foundUser) {
      setEmail(foundUser.email);
      if (foundUser.userType === 'customer') {
        setPassword(foundUser.passwordHash || 'Customer@2026!');
      } else if (foundUser.email.includes('sales')) {
        setPassword('Sales@2026!');
      } else if (foundUser.email.includes('tech')) {
        setPassword('Tech@2026!');
      } else {
        setPassword(foundUser.passwordHash || 'Admin@2026!');
      }
    } else {
      setEmail(accountEmail);
      if (accountEmail.includes('eland') || accountEmail.includes('david') || accountEmail.includes('customer')) {
        setPassword('Customer@2026!');
      } else if (accountEmail.includes('sales')) {
        setPassword('Sales@2026!');
      } else {
        setPassword('Admin@2026!');
      }
    }
  };

  const handleQuickSelectUser = (user: UserAccount) => {
    if (!demoAuthEnabled) return;
    loginAsUser(user);
    void finishLogin(user);
  };

  const showForgotPassword = activeAuthView === 'forgot_password';
  const fieldClass =
    'w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:bg-slate-50';

  const languageSelector = (
    <div className="relative" ref={languageRef}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-600 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        aria-haspopup="listbox"
        aria-expanded={languageOpen}
        aria-controls={languageMenuId}
        onClick={() => setLanguageOpen((open) => !open)}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span>{language}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {languageOpen && (
        <ul
          id={languageMenuId}
          role="listbox"
          aria-label="Language"
          className="absolute end-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {FUTURE_LANGUAGES.map((lang) => (
            <li key={lang} role="option" aria-selected={language === lang}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  language === lang ? 'font-semibold text-brand-700' : 'text-slate-700'
                }`}
                onClick={() => {
                  setLanguage(lang);
                  setLanguageOpen(false);
                }}
              >
                {lang}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden="true">
        <img src={LOGIN_HERO_IMAGE} alt="" className="h-full w-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/88 via-white/94 to-white" />
      </div>

      <div className="relative grid min-h-dvh lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)]">
        <aside className="relative hidden overflow-hidden lg:flex">
          <img
            src={LOGIN_HERO_IMAGE}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-900/78 via-brand-800/62 to-brand-900/48" />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[14%] bg-white"
            style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex w-full max-w-xl flex-col justify-between px-10 py-12 pe-16 xl:px-16 xl:py-16 xl:pe-20">
            <div>
              <BrandLogo className="h-24 w-auto xl:h-28" alt="Energya Cables / elsewedy HELAL" />
              <h1 className="mt-10 font-display text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
                Energya Digital Platform
              </h1>
              <p className="mt-3 max-w-md text-base leading-relaxed text-white/90 xl:text-lg">
                Design. Configure. Request. All in one platform.
              </p>
              <ul className="mt-10 space-y-4">
                <HeroFeature icon={Monitor} label="Modern & Professional UI" />
                <HeroFeature icon={Factory} label="Manufacturing Focused" />
                <HeroFeature icon={ShieldCheck} label="Standards Compliant" />
                <HeroFeature icon={Smartphone} label="Responsive & Secure" />
              </ul>
            </div>
            <p className="mt-12 flex items-center gap-3 text-sm font-medium tracking-wide text-white">
              <span className="h-0.5 w-10 shrink-0 bg-accent-500" aria-hidden="true" />
              Building a Stronger, Safer World
            </p>
          </div>
        </aside>

        <main className="relative flex min-h-dvh items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-6 flex items-start justify-between gap-3 lg:mb-8 lg:justify-end">
              <div className="lg:hidden">
                <BrandLogo className="h-16 w-auto sm:h-20" alt="Energya Cables / elsewedy HELAL" />
              </div>
              {languageSelector}
            </div>

            {showForgotPassword ? (
              <div className="rounded-2xl bg-brand-900 p-5 shadow-sm">
                <ForgotPasswordForm onSwitchToLogin={() => setActiveAuthView('login')} />
              </div>
            ) : (
              <>
                <h2 className="font-display text-[1.65rem] font-bold tracking-tight text-brand-900 sm:text-3xl">
                  Sign in to your account
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Access the Energya Digital Platform
                </p>

                {error && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Email or Username
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        id="email"
                        type="text"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Email or Username"
                        aria-invalid={Boolean(error)}
                        className={fieldClass}
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Password"
                        aria-invalid={Boolean(error)}
                        className={`${fieldClass} pe-12`}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute end-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveAuthView('forgot_password')}
                      className="min-h-11 text-sm font-medium text-brand-600 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-500">
                  New to Energya Connect?{' '}
                  <a
                    href="mailto:info@energya.com?subject=Energya%20Connect%20access"
                    className="font-semibold text-brand-600 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    Contact us
                  </a>
                </p>

                {demoAuthEnabled && (
                  <details className="mt-5 text-[12px] text-slate-500">
                    <summary className="cursor-pointer font-medium text-slate-500 hover:text-brand-700">
                      Development demo accounts (not available in production)
                    </summary>
                    <select
                      value={selectedUserAccount}
                      onChange={(e) => handleAccountSelectChange(e.target.value)}
                      className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-2 py-2 text-[12px]"
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
                            className="truncate rounded-md border border-slate-100 px-2 py-2 text-left hover:border-brand-500"
                          >
                            {u.fullName}
                          </button>
                        ))}
                    </div>
                    {jwtToken && (
                      <div className="mt-2">
                        <JwtClaimsInspector />
                      </div>
                    )}
                  </details>
                )}

                <nav
                  className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-400"
                  aria-label="Legal"
                >
                  <a href="#privacy" className="hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                    Privacy Policy
                  </a>
                  <span aria-hidden="true">|</span>
                  <a href="#terms" className="hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                    Terms of Service
                  </a>
                  <span aria-hidden="true">|</span>
                  <a
                    href="mailto:info@energya.com?subject=Energya%20Connect%20help"
                    className="hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    Help &amp; Support
                  </a>
                </nav>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function HeroFeature({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3 text-white">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/35">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </li>
  );
}
