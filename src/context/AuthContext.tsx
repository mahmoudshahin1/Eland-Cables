import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAccount, ModulePermissions, JwtTokenClaims, RoleDefinition } from '../types';
import { INITIAL_USERS_DATABASE } from '../data/mockUsers';
import { applyDemoUserLogin } from '../domain/demoAuth';
import { UNIFIED_LOGIN_PATH } from '../auth/loginRoutes';
import {
  clearAuthTokens,
  getJwtExpiryMs,
  isRememberedSession,
  persistAuthTokens,
  readAccessToken,
  readRefreshToken,
} from '../auth/tokenStorage';

interface AuthContextType {
  currentUser: UserAccount | null;
  usersList: UserAccount[];
  rolesList: RoleDefinition[];
  jwtToken: string | null;
  refreshToken: string | null;
  decodedClaims: JwtTokenClaims | null;
  isSessionReady: boolean;
  isLoginModalOpen: boolean;
  activeAuthView: 'login' | 'register' | 'forgot_password' | 'reset_password' | 'role_management' | 'dotnet_code';
  setActiveAuthView: (view: 'login' | 'register' | 'forgot_password' | 'reset_password' | 'role_management' | 'dotnet_code') => void;
  openLoginModal: (view?: 'login' | 'register' | 'forgot_password' | 'reset_password' | 'role_management' | 'dotnet_code') => void;
  closeLoginModal: () => void;
  loginWithJwt: (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<{ success: boolean; message?: string; user?: UserAccount }>;
  registerWithJwt: (userData: { fullName: string; email: string; password: string; companyName?: string; department?: string; role?: string; userType?: 'customer' | 'internal' }) => Promise<{ success: boolean; message?: string }>;
  forgotPasswordJwt: (email: string) => Promise<{ success: boolean; resetToken?: string; message?: string }>;
  resetPasswordJwt: (token: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  loginAsUser: (user: UserAccount) => void;
  logout: () => void | Promise<void>;
  addUser: (newUser: Omit<UserAccount, 'id'>) => void;
  updateUser: (id: string, updatedFields: Partial<UserAccount>) => void;
  deleteUser: (id: string) => void;
  assignUserRole: (userId: string, roleName: string, permissions?: ModulePermissions) => Promise<boolean>;
  createNewRole: (roleData: { name: string; description: string; userType: 'customer' | 'internal'; defaultPermissions: ModulePermissions }) => Promise<boolean>;
  hasPermission: (permissionKey: keyof ModulePermissions) => boolean;
  refreshJwtToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function applyAuthResponse(
  data: { accessToken: string; refreshToken: string; user: UserAccount; claims?: JwtTokenClaims },
  rememberMe: boolean,
  setters: {
    setJwtToken: (v: string | null) => void;
    setRefreshToken: (v: string | null) => void;
    setCurrentUser: (v: UserAccount | null) => void;
    setDecodedClaims: (v: JwtTokenClaims | null) => void;
    setIsLoginModalOpen: (v: boolean) => void;
  }
) {
  setters.setJwtToken(data.accessToken);
  setters.setRefreshToken(data.refreshToken);
  setters.setCurrentUser(data.user);
  setters.setDecodedClaims(data.claims || null);
  persistAuthTokens(data.accessToken, data.refreshToken, rememberMe);
  setters.setIsLoginModalOpen(false);
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [usersList, setUsersList] = useState<UserAccount[]>(() =>
    applyDemoUserLogin(INITIAL_USERS_DATABASE, (import.meta as { env?: { PROD?: boolean } }).env?.PROD ? 'production' : process.env.NODE_ENV) ? INITIAL_USERS_DATABASE : []
  );
  const [rolesList, setRolesList] = useState<RoleDefinition[]>([]);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(() => readAccessToken());
  const [refreshToken, setRefreshToken] = useState<string | null>(() => readRefreshToken());
  const [decodedClaims, setDecodedClaims] = useState<JwtTokenClaims | null>(null);
  const [isSessionReady, setIsSessionReady] = useState<boolean>(() => !readAccessToken() && !readRefreshToken());

  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [activeAuthView, setActiveAuthView] = useState<'login' | 'register' | 'forgot_password' | 'reset_password' | 'role_management' | 'dotnet_code'>('login');

  const clearLocalSession = useCallback(() => {
    clearAuthTokens();
    setJwtToken(null);
    setRefreshToken(null);
    setCurrentUser(null);
    setDecodedClaims(null);
    setActiveAuthView('login');
    setIsLoginModalOpen(false);
  }, []);

  const refreshJwtToken = useCallback(async (): Promise<boolean> => {
    const storedRefresh = refreshToken || readRefreshToken();
    if (!storedRefresh) return false;
    try {
      const res = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        applyAuthResponse(data, isRememberedSession(), {
          setJwtToken,
          setRefreshToken,
          setCurrentUser,
          setDecodedClaims,
          setIsLoginModalOpen,
        });
        return true;
      }
    } catch (e) {
      console.error('Refresh token error:', e);
    }
    return false;
  }, [refreshToken]);

  const logout = useCallback(async () => {
    const currentRefresh = refreshToken || readRefreshToken();
    const currentAccess = jwtToken || readAccessToken();
    if (currentRefresh || currentAccess) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentAccess ? { Authorization: `Bearer ${currentAccess}` } : {}),
          },
          body: JSON.stringify({ refreshToken: currentRefresh }),
        });
      } catch {
        /* still clear local session */
      }
    }
    clearLocalSession();
    navigate(UNIFIED_LOGIN_PATH, { replace: true });
  }, [clearLocalSession, jwtToken, refreshToken, navigate]);

  useEffect(() => {
    fetchRoles();
    const existingAccess = readAccessToken();
    const existingRefresh = readRefreshToken();
    if (!existingAccess && !existingRefresh) {
      setIsSessionReady(true);
      return;
    }
    void restoreSession(existingAccess, existingRefresh);
  }, []);

  // Session idle timeout — 30 minutes without activity
  useEffect(() => {
    if (!jwtToken) return;
    const idleMs = 30 * 60 * 1000;
    let timer = window.setTimeout(() => {
      void logout();
    }, idleMs);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void logout();
      }, idleMs);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [jwtToken, logout]);

  // Refresh access token before JWT expiry; log out if the session cannot be renewed
  useEffect(() => {
    if (!jwtToken) return;
    const expiryMs = getJwtExpiryMs(jwtToken);
    if (!expiryMs) return;
    const delay = Math.max(expiryMs - Date.now() - 60_000, 3_000);
    const timer = window.setTimeout(() => {
      void (async () => {
        const ok = await refreshJwtToken();
        if (!ok) await logout();
      })();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [jwtToken, refreshJwtToken, logout]);

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/auth/roles');
      if (res.ok) {
        const data = await res.json();
        setRolesList(data.roles || []);
      }
    } catch (e) {
      console.warn('Could not fetch roles from server:', e);
    }
  };

  const restoreSession = async (access: string | null, refresh: string | null) => {
    try {
      if (access) {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${access}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
          setDecodedClaims(data.claims);
          setJwtToken(access);
          setRefreshToken(refresh);
          setIsSessionReady(true);
          return;
        }
      }
      if (refresh) {
        const refreshed = await refreshJwtToken();
        if (refreshed) {
          setIsSessionReady(true);
          return;
        }
      }
    } catch (e) {
      console.error('JWT Session Verification Error:', e);
    }
    clearLocalSession();
    setIsSessionReady(true);
  };

  const openLoginModal = (view = 'login') => {
    setActiveAuthView(view as 'login' | 'register' | 'forgot_password' | 'reset_password' | 'role_management' | 'dotnet_code');
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => setIsLoginModalOpen(false);

  const loginWithJwt = async (email: string, password: string, rememberMe = true) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username: email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        applyAuthResponse(data, rememberMe, {
          setJwtToken,
          setRefreshToken,
          setCurrentUser,
          setDecodedClaims,
          setIsLoginModalOpen,
        });
        return { success: true, message: data.message, user: data.user as UserAccount };
      }
      const message =
        data.error ||
        (res.status === 401 ? 'Invalid email or password credentials.' : 'Authentication failed');
      return { success: false, message };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error during JWT login' };
    }
  };

  const registerWithJwt = async (userData: { fullName: string; email: string; password: string; companyName?: string; department?: string; role?: string; userType?: 'customer' | 'internal' }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        applyAuthResponse(data, true, {
          setJwtToken,
          setRefreshToken,
          setCurrentUser,
          setDecodedClaims,
          setIsLoginModalOpen,
        });
        setUsersList((prev) => [data.user, ...prev]);
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.error || 'Registration failed' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error during JWT registration' };
    }
  };

  const forgotPasswordJwt = async (email: string) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, resetToken: data.resetToken, message: data.message };
      }
      return { success: false, message: data.error || 'Failed to request password reset' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const token = jwtToken || readAccessToken();
      if (!token) {
        return { success: false, message: 'Your session has expired. Please sign in again.' };
      }
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return { success: true, message: data.message || 'Password updated.' };
      }
      if (res.status === 401) {
        return { success: false, message: data.error || 'Invalid or expired session.' };
      }
      return { success: false, message: data.error || 'Failed to change password' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error while changing password' };
    }
  };

  const resetPasswordJwt = async (token: string, newPassword: string) => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, message: data.message };
      }
      return { success: false, message: data.error || 'Reset password failed' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const loginAsUser = (user: UserAccount) => {
    const allowed = applyDemoUserLogin(user, (import.meta as { env?: { PROD?: boolean } }).env?.PROD ? 'production' : process.env.NODE_ENV);
    if (!allowed) return;
    clearAuthTokens();
    setCurrentUser(allowed);
    setJwtToken(null);
    setRefreshToken(null);
    setDecodedClaims(null);
    setIsLoginModalOpen(false);
  };

  const addUser = (newUser: Omit<UserAccount, 'id'>) => {
    const created: UserAccount = {
      ...newUser,
      id: `u-${Date.now()}`,
      lastLogin: 'Never logged in',
    };
    setUsersList((prev) => [created, ...prev]);
  };

  const updateUser = (id: string, updatedFields: Partial<UserAccount>) => {
    setUsersList((prev) =>
      prev.map((user) => (user.id === id ? { ...user, ...updatedFields } : user))
    );
    if (currentUser && currentUser.id === id) {
      setCurrentUser((prev) => (prev ? { ...prev, ...updatedFields } : null));
    }
  };

  const deleteUser = (id: string) => {
    setUsersList((prev) => prev.filter((user) => user.id !== id));
    if (currentUser && currentUser.id === id) {
      setCurrentUser(null);
    }
  };

  const assignUserRole = async (userId: string, roleName: string, permissions?: ModulePermissions) => {
    try {
      const token = readAccessToken();
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roleCode: roleName, permissions }),
      });
      if (res.ok) {
        updateUser(userId, { role: roleName, ...(permissions ? { permissions } : {}) });
        return true;
      }
    } catch (e) {
      console.error('Role assign error:', e);
    }
    return false;
  };

  const createNewRole = async (roleData: { name: string; description: string; userType: 'customer' | 'internal'; defaultPermissions: ModulePermissions }) => {
    try {
      const token = readAccessToken();
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ code: roleData.name, ...roleData }),
      });
      if (res.ok) {
        const data = await res.json();
        setRolesList((prev) => [...prev, data.role]);
        return true;
      }
    } catch (e) {
      console.error('Create role error:', e);
    }
    return false;
  };

  const hasPermission = (permissionKey: keyof ModulePermissions): boolean => {
    if (!currentUser) return false;
    if (currentUser.userType === 'customer') {
      return permissionKey === 'customerPortalAccess';
    }
    return !!currentUser.permissions?.[permissionKey];
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        usersList,
        rolesList,
        jwtToken,
        refreshToken,
        decodedClaims,
        isSessionReady,
        isLoginModalOpen,
        activeAuthView,
        setActiveAuthView,
        openLoginModal,
        closeLoginModal,
        loginWithJwt,
        registerWithJwt,
        forgotPasswordJwt,
        resetPasswordJwt,
        changePassword,
        loginAsUser,
        logout,
        addUser,
        updateUser,
        deleteUser,
        assignUserRole,
        createNewRole,
        hasPermission,
        refreshJwtToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
