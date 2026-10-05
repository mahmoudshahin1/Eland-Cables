import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UNIFIED_LOGIN_PATH } from './loginRoutes';

/**
 * Guards authenticated shell routes. Unauthenticated users are sent to /login
 * with `state.from` so LoginPage can return them after sign-in.
 */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { currentUser, isSessionReady } = useAuth();
  const location = useLocation();

  if (!isSessionReady) {
    return (
      <div className="min-h-screen bg-white text-slate-800 font-sans flex items-center justify-center">
        <p className="text-sm text-slate-500">Restoring your session…</p>
      </div>
    );
  }

  if (!currentUser) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={UNIFIED_LOGIN_PATH} replace state={{ from }} />;
  }

  return children;
}
