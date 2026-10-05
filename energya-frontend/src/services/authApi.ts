/**
 * Auth-specific API calls — login, logout, refresh, me, change-password.
 * All calls go through the centralized `api` Axios instance which handles
 * the Bearer token and auto-refresh transparently.
 */
import api from './api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: Record<string, unknown>;
  claims?: Record<string, unknown>;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

const authApi = {
  /** POST /api/auth/login */
  login(payload: LoginPayload): Promise<LoginResponse> {
    return api
      .post<LoginResponse>('/auth/login', {
        email: payload.email,
        username: payload.email,
        password: payload.password,
      })
      .then((r) => r.data);
  },

  /** POST /api/auth/logout */
  logout(refreshToken?: string | null) {
    return api
      .post('/auth/logout', { refreshToken })
      .then((r) => r.data)
      .catch(() => ({ success: true })); // Best-effort
  },

  /** POST /api/auth/refresh-token */
  refreshToken(token: string) {
    return api.post<LoginResponse>('/auth/refresh-token', { refreshToken: token }).then((r) => r.data);
  },

  /** GET /api/auth/me — returns the current authenticated user */
  me() {
    return api.get<{ success: boolean; user: Record<string, unknown> }>('/auth/me').then((r) => r.data);
  },

  /** POST /api/auth/change-password */
  changePassword(payload: ChangePasswordPayload) {
    return api.post('/auth/change-password', payload).then((r) => r.data);
  },

  /** POST /api/auth/forgot-password */
  forgotPassword(email: string) {
    return api.post('/auth/forgot-password', { email }).then((r) => r.data);
  },
};

export default authApi;
