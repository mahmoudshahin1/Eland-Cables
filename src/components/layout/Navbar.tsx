import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlatformMode, SystemNotification } from '../../types';
import { BrandLogo } from '../BrandLogo';
import { CustomerBrandMark } from './CustomerBrandMark';
import { useAuth } from '../../context/AuthContext';
import { UNIFIED_LOGIN_PATH } from '../../auth/loginRoutes';
import { customerPathForTab, defaultHomePath, profilePathForUser } from '../../app/shellRoutes';
import { customerHeaderName, customerInitials } from '../../app/customerPortalNav';
import {
  Sun,
  Moon,
  LogOut,
  KeyRound,
  Menu,
  Bell,
  Mail,
  FileText,
  UserRound,
  CircleHelp,
  ChevronDown,
  Search,
} from 'lucide-react';

interface NavbarProps {
  platformMode: PlatformMode;
  setPlatformMode?: (mode: PlatformMode) => void;
  darkMode?: boolean;
  setDarkMode?: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenAiModal?: () => void;
  onToggleMobileSidebar?: () => void;
  notifications?: SystemNotification[];
  onMarkAllNotificationsRead?: () => void;
  onNotificationOpen?: (notification: SystemNotification) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  platformMode,
  darkMode = false,
  setDarkMode,
  onOpenAiModal,
  onToggleMobileSidebar,
  notifications = [],
  onMarkAllNotificationsRead,
  onNotificationOpen,
}) => {
  const { currentUser, openLoginModal, logout } = useAuth();
  const navigate = useNavigate();
  const [showNotificationsMenu, setShowNotificationsMenu] = useState<boolean>(false);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const userMenuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const isCustomer = platformMode === 'customer';

  useEffect(() => {
    if (!showUserMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [showUserMenu]);

  return (
    <header
      className={
        isCustomer
          ? 'sticky top-0 z-30 border-b border-slate-200/80 bg-white text-brand-800'
          : 'sticky top-0 z-30 border-b border-brand-900/60 bg-gradient-to-b from-brand-700 to-brand-800 text-white shadow-[0_2px_10px_rgba(10,31,66,0.25)]'
      }
    >
      {/* Main Bar with Brand Logo & Platform Selector */}
      <div className={`max-w-full ${isCustomer ? 'px-4 sm:px-5 lg:px-6 py-2.5' : 'px-4 sm:px-6 lg:px-8 py-2.5'}`}>
        <div className="relative flex items-center justify-between gap-3">
          {/* Mobile Sidebar Toggle & Logo */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={onToggleMobileSidebar}
              className={`lg:hidden p-2 rounded-xl transition-colors ${
                isCustomer
                  ? 'bg-slate-100 hover:bg-slate-200 text-brand-800'
                  : 'bg-white/10 hover:bg-white/15 text-white'
              }`}
              title="Open Navigation Menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              to={currentUser ? defaultHomePath(currentUser) : UNIFIED_LOGIN_PATH}
              className="inline-flex min-w-0"
              title="Home"
            >
              {isCustomer ? (
                <CustomerBrandMark logoClassName="h-[3.25rem] max-h-[3.25rem] w-auto" />
              ) : (
                <BrandLogo className="h-8" onDark />
              )}
            </Link>

            {!isCustomer && (
              <div className="hidden sm:block border-s border-white/20 ps-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-[12px] px-2.5 py-0.5 rounded-md bg-white/10 text-white font-semibold tracking-wide">
                    Energya Connect
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/15 text-accent-300 font-semibold">
                    v3.4
                  </span>
                </div>
                <p className="text-[11px] text-brand-100 font-medium mt-0.5">
                  Cable manufacturing business platform
                </p>
              </div>
            )}
          </div>

          {/* Right Header Controls (Notification Bell, Theme Toggle & Logged In User) */}
          <div className={`flex items-center shrink-0 ${isCustomer ? 'gap-2.5' : 'gap-2.5'}`}>
            {isCustomer && (
              <form
                className="hidden md:block"
                onSubmit={(event) => {
                  event.preventDefault();
                  navigate(customerPathForTab('price_estimation'), {
                    state: { q: headerSearch.trim() },
                  });
                }}
              >
                <label className="relative block">
                  <span className="sr-only">Search inquiries</span>
                  <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={headerSearch}
                    onChange={(event) => setHeaderSearch(event.target.value)}
                    placeholder="Search..."
                    className="w-44 lg:w-60 rounded-full border border-slate-200 bg-slate-50 py-2 ps-10 pe-4 text-[13px] text-brand-800 placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:outline-none"
                  />
                </label>
              </form>
            )}
            {/* Top Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotificationsMenu(!showNotificationsMenu)}
                className={`relative transition-colors ${
                  isCustomer
                    ? 'p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    : 'p-2 rounded-xl border bg-white/10 text-white border-white/20 hover:bg-white/15'
                }`}
                title="System Notifications"
              >
                <Bell className={isCustomer ? 'h-5 w-5' : 'h-4 w-4'} />
                {unreadCount > 0 && (
                  <span
                    className={`absolute font-black rounded-full ${
                      isCustomer
                        ? '-top-0.5 -end-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] leading-4'
                        : '-top-1 -end-1 bg-accent-500 text-white text-[10px] px-1.5 py-0.2 border-2 border-white animate-pulse'
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {showNotificationsMenu && (
                <div className="absolute end-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_12px_32px_rgba(10,31,66,0.18)] border border-slate-200 dark:border-slate-800 p-4 z-50 text-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-brand-600" />
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        Notifications Center
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="text-[10px] text-brand-600 dark:text-blue-400 font-bold hover:underline"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2 no-scrollbar">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            onNotificationOpen?.(n);
                            setShowNotificationsMenu(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onNotificationOpen?.(n);
                              setShowNotificationsMenu(false);
                            }
                          }}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                            n.read
                              ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500'
                              : 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-slate-900 dark:text-slate-100 font-medium'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-xs flex items-center gap-1">
                              {n.type === 'email' ? (
                                <Mail className="h-3.5 w-3.5 text-brand-600 inline me-1" />
                              ) : (
                                <FileText className="h-3.5 w-3.5 text-accent-600 inline me-1" />
                              )}
                              <span>{n.title}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">{n.timestamp}</span>
                          </div>
                          <p className="text-[11px] mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-slate-400 italic py-4">No notifications present</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isCustomer && (
              <Link
                to={customerPathForTab('support')}
                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="Help"
              >
                <CircleHelp className="h-5 w-5" />
              </Link>
            )}

            {!isCustomer && (
              <button
                onClick={() => setDarkMode && setDarkMode((prev) => !prev)}
                className="p-2 rounded-xl border transition-colors bg-white/10 text-white hover:bg-white/15 border-white/20"
                title="Toggle Theme"
              >
                {darkMode ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4 text-white" />
                )}
              </button>
            )}

            {/* User Login & Authentication Status Bar */}
            <div className={`flex items-center gap-2 ${isCustomer ? 'ps-1' : 'ps-2 border-s border-white/20'}`}>
              {currentUser ? (
                <div className="relative flex items-center gap-2" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotificationsMenu(false);
                      setShowUserMenu((open) => !open);
                    }}
                    className={`flex items-center gap-2 transition-colors ${
                      isCustomer
                        ? 'px-1.5 py-1 rounded-full hover:bg-slate-50'
                        : 'px-3 py-1 rounded-xl border shadow-inner bg-white/10 hover:bg-white/15 border-white/20'
                    }`}
                    title="Account menu"
                    aria-expanded={showUserMenu}
                    aria-haspopup="menu"
                  >
                    <div
                      className={`rounded-full flex items-center justify-center font-extrabold ${
                        currentUser.userType === 'customer'
                          ? 'w-9 h-9 text-[11px] bg-[#5B4FE8] text-white'
                          : 'w-7 h-7 text-[10px] bg-accent-600 text-white'
                      }`}
                    >
                      {currentUser.userType === 'customer'
                        ? customerInitials(currentUser.fullName)
                        : currentUser.fullName.charAt(0)}
                    </div>
                    <div className="text-left text-xs leading-tight max-w-[160px] truncate hidden sm:block">
                      <p className={`font-semibold truncate ${isCustomer ? 'text-slate-800 text-[13px]' : 'text-white font-bold'}`}>
                        {isCustomer ? customerHeaderName(currentUser.fullName) : currentUser.fullName}
                      </p>
                      <p className={`truncate ${isCustomer ? 'text-[11px] text-slate-400' : 'text-[10px] text-brand-100'}`}>
                        {isCustomer ? 'Customer User' : currentUser.email}
                      </p>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${isCustomer ? 'text-slate-400' : 'text-white/60'}`} />
                  </button>

                  {showUserMenu && (
                    <div
                      role="menu"
                      className="absolute end-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_12px_32px_rgba(10,31,66,0.18)] border border-slate-200 dark:border-slate-800 p-3 z-50 text-xs"
                    >
                      <div className="px-2 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                        <p className="font-extrabold text-slate-900 dark:text-white truncate">{currentUser.fullName}</p>
                        <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                        <p className="text-[10px] font-semibold text-slate-400 mt-1">
                          {currentUser.userType === 'customer'
                            ? `Customer${currentUser.companyName ? ` · ${currentUser.companyName}` : ''}`
                            : `Internal · ${currentUser.role}`}
                        </p>
                      </div>
                      <Link
                        to={profilePathForUser(currentUser)}
                        role="menuitem"
                        onClick={() => setShowUserMenu(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
                      >
                        <UserRound className="h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserMenu(false);
                          void logout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-accent-50 hover:text-accent-600 text-slate-700 dark:text-slate-200 font-bold"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => openLoginModal('login')}
                  className="px-3 py-1.5 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Login / Auth</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
