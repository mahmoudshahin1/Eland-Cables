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
import { isPostLoginBlocked, resolvePostLoginDestination } from '../app/shellRoutes';
import { UserAccount } from '../types';

const LOGIN_HERO_IMAGE = '/login-cables.jpg';
const CABLE_CROSS_SECTION_IMAGE = '/customer-home/categories/power-cables.jpg';
const FUTURE_LANGUAGES = ['English', 'العربية'] as const;

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
    loginAsUser,
    loginWithJwt,
    logout,
    activeAuthView,
    setActiveAuthView,
  } = useAuth();

  const demoAuthEnabled = isDemoAuthenticationAllowed(
    (import.meta as { env?: { PROD?: boolean } }).env?.PROD ? 'production' : process.env.NODE_ENV
  );

  const [email, setEmail] = useState('david.smith@elandcables.com');
  const [password, setPassword] = useState('Customer@2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedUserAccount, setSelectedUserAccount] = useState<string>('david.smith@elandcables.com');
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
    if (accountEmail === 'david.smith@elandcables.com' || accountEmail.includes('david')) {
      setEmail('david.smith@elandcables.com');
      setPassword('Customer@2026!');
      return;
    }
    if (accountEmail === 'm.ahmed@energya.com' || accountEmail.includes('sales')) {
      setEmail('m.ahmed@energya.com');
      setPassword(''); // Password required manually
      return;
    }
    if (accountEmail === 'admin@energya.com' || accountEmail.includes('admin')) {
      setEmail('admin@energya.com');
      setPassword(''); // Password required manually
      return;
    }
    if (accountEmail === 'technical@energya.com' || accountEmail === 't.hasan@energya.com' || accountEmail.includes('tech')) {
      setEmail('technical@energya.com');
      setPassword(''); // Password required manually
      return;
    }
    if (accountEmail === 'k.salem@energya.com' || accountEmail.includes('cost')) {
      setEmail('k.salem@energya.com');
      setPassword(''); // Password required manually
      return;
    }
    if (accountEmail === 'n.nabil@energya.com' || accountEmail.includes('proc') || accountEmail.includes('prod')) {
      setEmail('n.nabil@energya.com');
      setPassword(''); // Password required manually
      return;
    }
    setEmail('');
    setPassword('');
  };

  const showForgotPassword = activeAuthView === 'forgot_password';
  const fieldClass =
    'w-full h-11 rounded-xl border border-slate-200 bg-slate-50/60 ps-10 pe-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:bg-slate-50 transition-all';

  const languageSelector = (
    <div className="relative" ref={languageRef}>
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        aria-haspopup="listbox"
        aria-expanded={languageOpen}
        aria-controls={languageMenuId}
        onClick={() => setLanguageOpen((open) => !open)}
      >
        <Globe className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        <span>{language}</span>
        <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden="true" />
      </button>
      {languageOpen && (
        <ul
          id={languageMenuId}
          role="listbox"
          aria-label="Language"
          className="absolute end-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {FUTURE_LANGUAGES.map((lang) => (
            <li key={lang} role="option" aria-selected={language === lang}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
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
    <div className="relative min-h-dvh overflow-x-hidden bg-[#F4F6FA]">
      <div className="relative grid min-h-dvh lg:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(400px,0.9fr)]">
        {/* LEFT PANEL */}
        <aside className="relative hidden overflow-hidden lg:flex flex-col justify-between bg-gradient-to-br from-[#061833] via-[#0A254D] to-[#041026] text-white p-10 xl:p-14">
          {/* Background image overlay */}
          <img
            src={LOGIN_HERO_IMAGE}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15 mix-blend-luminosity"
            aria-hidden="true"
          />

          {/* Top Section: Logo card, H1, Subtitle, 2x2 Feature Chips */}
          <div className="relative z-10">
            <div className="inline-flex items-center justify-center rounded-2xl bg-white p-3.5 shadow-md border border-white/20">
              <BrandLogo className="h-10 w-auto" alt="Energya Cables / elsewedy HELAL" />
            </div>

            <h1 className="mt-7 font-display text-3xl xl:text-4xl font-bold leading-tight tracking-tight text-white">
              Energya Digital Platform
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/80 xl:text-base">
              Design. Configure. Request. All in one platform.
            </p>

            <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 max-w-lg">
              <HeroFeature icon={Monitor} label="Modern & Professional UI" />
              <HeroFeature icon={Factory} label="Manufacturing Focused" />
              <HeroFeature icon={ShieldCheck} label="Standards Compliant" />
              <HeroFeature icon={Smartphone} label="Responsive & Secure" />
            </ul>
          </div>

          {/* Center Visual: Rotating Ring, Cable Cross-Section, and 4 Spec Pills */}
          <div className="relative z-10 my-auto py-10 flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center w-full max-w-md h-64">
              {/* Blurred elliptical glow under cable */}
              <div
                className="pointer-events-none absolute -bottom-4 h-10 w-56 rounded-full bg-blue-500/25 blur-xl"
                aria-hidden="true"
              />

              {/* Slow decorative rotating ring (>= 40s per turn, motion-safe) */}
              <div
                className="pointer-events-none absolute h-52 w-52 xl:h-60 xl:w-60 rounded-full border border-sky-400/40 shadow-[0_0_30px_rgba(56,189,248,0.2)] motion-safe:animate-[spin_48s_linear_infinite]"
                aria-hidden="true"
              >
                <div className="absolute -top-1 start-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_8px_#38bdf8]" />
                <div className="absolute -bottom-1 start-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_8px_#38bdf8]" />
              </div>

              {/* Multi-core cable cross-section image */}
              <div className="relative z-10 h-40 w-40 xl:h-44 xl:w-44 rounded-full overflow-hidden border-2 border-white/30 shadow-[0_12px_36px_rgba(0,0,0,0.5)] bg-[#071E3A]">
                <img
                  src={CABLE_CROSS_SECTION_IMAGE}
                  alt="Cable cross section"
                  className="h-full w-full object-cover scale-110"
                />
              </div>

              {/* 4 Frosted Spec Pills (Fully inside panel bounds to fix Flaw B0 #1) */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Pill 1: LSHF sheath (Top Left) */}
                <span className="absolute start-[8%] top-[14%] rounded-full bg-white/20 backdrop-blur-md border border-white/30 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                  LSHF sheath
                </span>

                {/* Pill 2: 0.6/1 kV (Top Right - safe inset) */}
                <span className="absolute end-[8%] top-[22%] rounded-full bg-white/20 backdrop-blur-md border border-white/30 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                  0.6/1 kV
                </span>

                {/* Pill 3: XLPE insulation (Bottom Left) */}
                <span className="absolute start-[6%] bottom-[16%] rounded-full bg-white/20 backdrop-blur-md border border-white/30 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                  XLPE insulation
                </span>

                {/* Pill 4: Cu conductor (Bottom Right - safe inset) */}
                <span className="absolute end-[6%] bottom-[18%] rounded-full bg-white/20 backdrop-blur-md border border-white/30 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                  Cu conductor
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Line: Accent line + Slogan */}
          <div className="relative z-10 flex items-center gap-3 text-sm font-medium tracking-wide text-white/90">
            <span className="h-0.5 w-10 shrink-0 bg-accent-500" aria-hidden="true" />
            <span>Building a Stronger, Safer World</span>
          </div>
        </aside>

        {/* RIGHT PANEL */}
        <main className="relative flex min-h-dvh flex-col justify-between p-6 sm:p-8 lg:p-12">
          {/* Header row: Mobile Logo + Language Selector */}
          <div className="flex items-center justify-between lg:justify-end w-full">
            <div className="lg:hidden">
              <BrandLogo className="h-9 w-auto" alt="Energya Cables / elsewedy HELAL" />
            </div>
            {languageSelector}
          </div>

          {/* Center Card */}
          <div className="my-auto w-full max-w-[440px] mx-auto py-6">
            <div className="rounded-2xl border-t-4 border-brand-500 bg-white p-7 sm:p-8 shadow-xl border-x border-b border-slate-200/80">
              {showForgotPassword ? (
                <div className="rounded-xl bg-brand-900 p-5 text-white">
                  <ForgotPasswordForm onSwitchToLogin={() => setActiveAuthView('login')} />
                </div>
              ) : (
                <>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                    Sign in to your account
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500">
                    Access the Energya Digital Platform
                  </p>

                  {error && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-700"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                    <div>
                      <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Email or Username
                      </label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
                      <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
                          className={`${fieldClass} pe-11`}
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                        />
                        <span>Remember me</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveAuthView('forgot_password')}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                  </form>

                  <p className="mt-5 text-center text-xs text-slate-500">
                    New to Energya Connect?{' '}
                    <a
                      href="mailto:info@energya.com?subject=Energya%20Connect%20access"
                      className="font-semibold text-brand-600 hover:text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                    >
                      Contact us
                    </a>
                  </p>

                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Quick Profile Switch
                    </p>
                    <select
                      value={selectedUserAccount}
                      onChange={(e) => handleAccountSelectChange(e.target.value)}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 focus:bg-white focus:border-brand-500 outline-none"
                    >
                      <option value="david.smith@elandcables.com">👑 VIP Customer — Eng. David Smith (ELAND)</option>
                      <option value="m.ahmed@energya.com">💼 Sales — Mohamed Ahmed (m.ahmed@energya.com)</option>
                      <option value="admin@energya.com">🛡️ Admin — System Administrator (admin@energya.com)</option>
                      <option value="technical@energya.com">⚙️ Technical — Eng. Tarek Hasan (technical@energya.com)</option>
                      <option value="k.salem@energya.com">📊 Costing — Khaled Salem (k.salem@energya.com)</option>
                      <option value="n.nabil@energya.com">🏭 Production — Nader Nabil (n.nabil@energya.com)</option>
                      <option value="custom">Type credentials manually</option>
                    </select>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => handleAccountSelectChange('david.smith@elandcables.com')}
                        className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                          selectedUserAccount === 'david.smith@elandcables.com'
                            ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        👑 VIP (Saved)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccountSelectChange('m.ahmed@energya.com')}
                        className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                          selectedUserAccount === 'm.ahmed@energya.com'
                            ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        💼 Sales (PW req.)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccountSelectChange('admin@energya.com')}
                        className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                          selectedUserAccount === 'admin@energya.com'
                            ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        🛡️ Admin (PW req.)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccountSelectChange('technical@energya.com')}
                        className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                          selectedUserAccount === 'technical@energya.com'
                            ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        ⚙️ Tech (PW req.)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccountSelectChange('k.salem@energya.com')}
                        className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                          selectedUserAccount === 'k.salem@energya.com'
                            ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        📊 Costing (PW req.)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccountSelectChange('n.nabil@energya.com')}
                        className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                          selectedUserAccount === 'n.nabil@energya.com'
                            ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        🏭 Prod (PW req.)
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer Legal Links */}
          <nav
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-500"
            aria-label="Legal"
          >
            <a href="#privacy" className="hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
              Privacy Policy
            </a>
            <span aria-hidden="true" className="text-slate-300">|</span>
            <a href="#terms" className="hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
              Terms of Service
            </a>
            <span aria-hidden="true" className="text-slate-300">|</span>
            <a
              href="mailto:info@energya.com?subject=Energya%20Connect%20help"
              className="hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              Help &amp; Support
            </a>
          </nav>
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
    <li className="flex items-center gap-2.5 text-white">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10">
        <Icon className="h-4 w-4 text-white" aria-hidden="true" />
      </span>
      <span className="text-[13px] font-medium text-white/95 leading-tight">{label}</span>
    </li>
  );
}
