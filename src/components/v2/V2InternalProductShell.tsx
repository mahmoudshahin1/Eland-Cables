import React from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BrandLogo } from '../BrandLogo';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import {
  INTERNAL_HOME_PATH,
  V2_HOME_PATH,
  V2_INTERNAL_HOME_PATH,
} from '../../app/shellRoutes';
import { InquiryQuotationWorkspace } from '../inquiry-quotation/InquiryQuotationWorkspace';

const NAV = [
  { to: V2_INTERNAL_HOME_PATH, label: 'Home', end: true },
  { to: `${V2_INTERNAL_HOME_PATH}/commercial`, label: 'Commercial' },
] as const;

function navActive(pathname: string, to: string, end?: boolean): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (end) return path === to;
  return path === to || path.startsWith(`${to}/`);
}

function StubPage({ title }: { title: string }) {
  return (
    <ErrorState
      kind="not_implemented"
      title={title}
      message="This V2 internal surface is a shell placeholder. Business modules are not implemented in P1.5-03."
      next="Use the current internal portal or the platform navigator for live work."
    />
  );
}

function InternalHome() {
  return (
    <div className="space-y-4">
      <EmptyState
        title="ENERGYA CONNECT — Internal"
        hint="Open Commercial to review automatic processing, financial offers, and quotation approve / issue."
      />
    </div>
  );
}

export function V2InternalProductShell() {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser || currentUser.userType !== 'internal') {
    return <Navigate to={INTERNAL_HOME_PATH} replace />;
  }

  return (
    <div className="min-h-screen flex bg-white text-slate-800 font-sans">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-brand-900 text-white">
        <Link to={V2_INTERNAL_HOME_PATH} className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <BrandLogo className="h-10" />
          <span className="font-display text-[13px] font-bold tracking-[0.14em] leading-tight">ENERGYA CONNECT</span>
        </Link>
        <nav className="flex-1 p-3 space-y-0.5 text-sm" aria-label="Internal product">
          {NAV.map((item) => {
            const active = navActive(location.pathname, item.to, 'end' in item && item.end);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`block px-3 py-2 rounded-md ${active ? 'bg-white text-brand-900 font-semibold' : 'text-white/85 hover:bg-white/10'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10 space-y-1 text-xs">
          <Link to={V2_HOME_PATH} className="block px-3 py-2 rounded-md hover:bg-white/10">
            Platform navigator
          </Link>
          <Link to={INTERNAL_HOME_PATH} className="block px-3 py-2 rounded-md hover:bg-white/10">
            Current version
          </Link>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden bg-brand-900 text-white px-4 py-3 flex items-center gap-3">
          <BrandLogo className="h-9" />
          <span className="font-display text-sm font-bold tracking-[0.14em]">ENERGYA CONNECT</span>
        </header>
        <nav className="lg:hidden flex overflow-x-auto gap-1 px-3 py-2 border-b border-slate-200 bg-white text-sm" aria-label="Internal product">
          {NAV.map((item) => {
            const active = navActive(location.pathname, item.to, 'end' in item && item.end);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`shrink-0 px-3 py-1.5 rounded-md ${active ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 p-4 lg:p-6 overflow-auto space-y-4">
          <Routes>
            <Route path="/v2/internal" element={<InternalHome />} />
            <Route path="/v2/internal/commercial" element={<InquiryQuotationWorkspace title="Commercial" />} />
            <Route path="/v2/internal/*" element={<StubPage title="Internal workspace" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
