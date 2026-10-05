import { defineStore } from 'pinia';
import authApi from '../services/authApi';
import type { UserAccount, ModulePermissions, JwtTokenClaims } from '../types';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    currentUser: null as UserAccount | null,
    jwtToken: localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null,
    refreshToken: localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token') || null,
    decodedClaims: null as JwtTokenClaims | null,
    isSessionReady: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.jwtToken && !!state.currentUser,
    /** True once the initial /me probe has completed (success or failure) */
    hasCheckedSession: (state) => state.isSessionReady,
  },

  actions: {
    // ── Token management ───────────────────────────────────────────────
    setTokens(access: string, refresh: string, rememberMe = true) {
      this.jwtToken = access;
      this.refreshToken = refresh;
      if (rememberMe) {
        localStorage.setItem('access_token', access);
        localStorage.setItem('refresh_token', refresh);
      } else {
        sessionStorage.setItem('access_token', access);
        sessionStorage.setItem('refresh_token', refresh);
      }
    },

    clearSession() {
      this.jwtToken = null;
      this.refreshToken = null;
      this.currentUser = null;
      this.decodedClaims = null;
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('refresh_token');
    },

    // ── Auth actions ───────────────────────────────────────────────────
    async loginWithJwt(email: string, password: string, rememberMe = true) {
      try {
        const data = await authApi.login({ email, password });

        if (data.success && data.accessToken && data.refreshToken) {
          this.setTokens(data.accessToken, data.refreshToken, rememberMe);
          this.currentUser = (data.user as UserAccount) ?? null;
          this.decodedClaims = (data.claims as JwtTokenClaims) ?? null;
          this.isSessionReady = true;
          return { success: true, message: data.message, user: data.user };
        }

        const message = data.error || 'Invalid email or password credentials.';
        return { success: false, message };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error during JWT login';
        return { success: false, message: msg };
      }
    },

    async logout() {
      await authApi.logout(this.refreshToken);
      this.clearSession();
    },

    /**
     * Called once on app startup to restore a session from a persisted token.
     * Calls GET /api/auth/me and hydrates currentUser if valid.
     */
    async restoreSession() {
      if (!this.jwtToken) {
        this.isSessionReady = true;
        return;
      }
      try {
        const data = await authApi.me();
        if (data.success && data.user) {
          this.currentUser = data.user as UserAccount;
        } else {
          this.clearSession();
        }
      } catch {
        this.clearSession();
      } finally {
        this.isSessionReady = true;
      }
    },

    // ── Permission check ───────────────────────────────────────────────
    hasPermission(permissionKey: keyof ModulePermissions): boolean {
      if (!this.currentUser) return false;
      if (this.currentUser.userType === 'customer') {
        return permissionKey === 'customerPortalAccess';
      }
      return !!this.currentUser.permissions?.[permissionKey];
    },
  },
});
