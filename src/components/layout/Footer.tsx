import React from 'react';
import { Link } from 'react-router-dom';
import { EnergyaLogo } from '../common/EnergyaLogo';
import { PlatformMode } from '../../types';
import { customerPathForTab } from '../../app/shellRoutes';

interface FooterProps {
  platformMode?: PlatformMode;
}

export const Footer: React.FC<FooterProps> = ({ platformMode }) => {
  if (platformMode === 'customer') {
    return (
      <footer className="mt-6 text-[12px] text-slate-400 bg-transparent mb-14 md:mb-0">
        <div className="w-full px-4 sm:px-6 lg:px-7 py-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <p>© 2026 Energya Cables. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href="#privacy" className="hover:text-slate-600 font-medium">
              Privacy Policy
            </a>
            <a href="#terms" className="hover:text-slate-600 font-medium">
              Terms of Service
            </a>
            <Link to={customerPathForTab('support')} className="hover:text-slate-600 font-medium">
              Help & Support
            </Link>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-white text-slate-600 border-t border-slate-200 mt-10 text-[12px]">
      <div className="h-[3px] w-full bg-gradient-to-r from-[#004A99] via-[#004A99] to-[#E23B2B]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <EnergyaLogo size="sm" />
          <div>
            <p className="font-semibold text-brand-600 text-[13px]">ENERGYA CONNECT — Elsewedy Helal</p>
            <p className="text-slate-500 mt-0.5">Cable manufacturing digital platform</p>
          </div>
        </div>
        <div className="text-center md:text-right">
          <p className="font-semibold text-accent-500 tracking-wide text-[12px]">
            POWERING CONNECTIONS. ENERGIZING GENERATIONS.
          </p>
          <p className="text-slate-400 text-[11px] mt-1">© 2026 Energya Cables. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
