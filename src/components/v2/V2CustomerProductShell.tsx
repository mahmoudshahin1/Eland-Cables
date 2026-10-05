import React from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BrandLogo } from '../BrandLogo';
import { ErrorState } from '../ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import {
  CUSTOMER_HOME_PATH,
  V2_CUSTOMER_HOME_PATH,
  V2_CUSTOMER_INQUIRIES_PATH,
  V2_INTERNAL_HOME_PATH,
} from '../../app/shellRoutes';
import { V2CustomerDashboardPage } from './customer/V2CustomerDashboardPage';
import { V2CustomerInquiryListPage } from './customer/V2CustomerInquiryListPage';
import { V2CustomerInquiryDetailPage } from './customer/V2CustomerInquiryDetailPage';
import { V2CustomerQuotationsPage } from './customer/V2CustomerQuotationsPage';

const NAV = [
  { to: V2_CUSTOMER_HOME_PATH, label: 'Dashboard', end: true },
  { to: V2_CUSTOMER_INQUIRIES_PATH, label: 'My Inquiries' },
  { to: `${V2_CUSTOMER_HOME_PATH}/quotations`, label: 'Quotations' },
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
      message="This V2 customer surface is not part of the Customer Inquiry increment."
      next="Use the current customer portal until the matching Wave 1 increment."
    />
  );
}

export function V2CustomerProductShell() {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser || currentUser.userType !== 'customer') {
    return <Navigate to={currentUser?.userType === 'internal' ? V2_INTERNAL_HOME_PATH : CUSTOMER_HOME_PATH} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-brand-surface text-brand-800 font-sans">
      <header className="bg-brand-800 text-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-4">
          <Link to={V2_CUSTOMER_HOME_PATH} className="inline-flex items-center gap-3 min-w-0">
            <BrandLogo className="h-10" />
            <span className="font-display text-[15px] font-bold tracking-[0.16em]">ENERGYA CONNECT</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Customer product">
            {NAV.map((item) => {
              const active = navActive(location.pathname, item.to, 'end' in item && item.end);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-3 py-1.5 rounded-md ${active ? 'bg-white text-brand-800 font-semibold' : 'text-white/85 hover:bg-white/10'}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link to={CUSTOMER_HOME_PATH} className="ms-auto text-xs text-white/80 hover:text-white underline">
            Current version
          </Link>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <Routes>
          <Route path="/v2/customer" element={<V2CustomerDashboardPage />} />
          <Route path="/v2/customer/inquiries" element={<V2CustomerInquiryListPage />} />
          <Route path="/v2/customer/inquiries/:id" element={<V2CustomerInquiryDetailPage />} />
          <Route path="/v2/customer/quotations" element={<V2CustomerQuotationsPage />} />
          <Route path="/v2/customer/*" element={<StubPage title="Customer workspace" />} />
        </Routes>
      </main>
    </div>
  );
}
